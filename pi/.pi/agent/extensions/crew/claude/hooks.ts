import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Config } from "../lib/config.ts";
import { Herdr } from "../lib/herdr.ts";
import type { Run } from "../lib/runs.ts";
import { listNames, readJson } from "../lib/files.ts";
import { Tree, isAlive } from "../lib/tree.ts";
import type { Entry, Place, TreeState } from "../lib/tree.ts";
import {
  CLI,
  ENTRY,
  IDLE_CONFIRMATIONS,
  isIdle,
  paneStatus,
  taskName,
  taskRun,
  taskRunId,
  treeOf,
} from "./place.ts";
import type { Claude } from "./place.ts";

const GRANT_TIMEOUT_MS = 5000;
const DENIED = "denied ";
const GRANTED = "granted";
const IDLE_CHECK_POLLS = 3;

export interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  tool_use_id?: string;
  agent_id?: string;
  tool_input?: { description?: string; subagent_type?: string; model?: string };
  tool_response?: { status?: string; agentId?: string };
}

interface Marker {
  session: string;
  caller?: string;
  agent?: string;
}

export interface Order {
  root: string;
  session: string;
  place: Place;
  maxConcurrent: number;
  heartbeatTimeoutMs: number;
  pollMs: number;
  claudePid?: number;
  pane?: string;
  workspace: string;
  herdrBinary: string;
  run: { id: string; name: string; model: string; started: string };
}

function markerDirectory(root: string, tree: Tree): string {
  return path.join(root, "trees", tree.id, "claude");
}

function markerPath(root: string, tree: Tree, run: string): string {
  return path.join(markerDirectory(root, tree), `${run}.json`);
}

function readMarker(file: string): Marker | undefined {
  return readJson<Marker>(file);
}

function writeMarker(file: string, marker: Marker): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const scratch = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(scratch, JSON.stringify(marker));
  fs.renameSync(scratch, file);
}

function isKeeper(pid: number): boolean {
  try {
    const command = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
    return command.includes(ENTRY) && command.includes("keep");
  } catch {
    return false;
  }
}

function claims(tree: Tree, session: string): Entry[] {
  const found: Entry[] = [];
  for (const entry of tree.state().slots)
    if (entry.session === session && entry.run.startsWith("task-"))
      found.push(entry);
  return found;
}

function release(claude: Claude, tree: Tree, entry: Entry): void {
  if (isKeeper(entry.pid)) {
    try {
      process.kill(entry.pid, "SIGTERM");
    } catch {}
  }
  tree.release(taskRun(claude.root, entry.run, entry.name, entry.model));
  fs.rmSync(markerPath(claude.root, tree, entry.run), { force: true });
}

function releaseWhere(
  claude: Claude,
  chosen: (marker: Marker | undefined) => boolean,
): void {
  const tree = treeOf(claude);
  for (const entry of claims(tree, claude.session)) {
    const marker = readMarker(markerPath(claude.root, tree, entry.run));
    if (chosen(marker)) release(claude, tree, entry);
  }
}

function removeOrphanMarkers(claude: Claude, tree: Tree): void {
  const directory = markerDirectory(claude.root, tree);
  const held = new Set(tree.state().slots.map((entry) => entry.run));
  for (const name of listNames(directory)) {
    const file = path.join(directory, name);
    if (held.has(path.basename(name, ".json"))) continue;
    if (readMarker(file)?.session !== claude.session) continue;
    try {
      const age = Date.now() - fs.statSync(file).mtimeMs;
      if (age > claude.config.heartbeatTimeoutMs) fs.rmSync(file);
    } catch {}
  }
}

export function sessionContext(claude: Claude): string {
  const { place, config } = claude;
  const tree = place.tree ?? claude.session;
  const context = `crew: ${CLI} · tree ${tree} · depth ${place.depth}/${config.maxDepth} · see the crew skill`;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  });
}

function denial(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
}

export function capReason(state: TreeState, maxConcurrent: number): string {
  const holders: string[] = [];
  for (const entry of state.slots)
    holders.push(`${entry.name} [${entry.model}]`);
  const queued = state.tickets.length;
  const waiting =
    queued > 0 ? `; ${queued} run${queued === 1 ? "" : "s"} queued` : "";
  return (
    `crew cap reached: ${state.slots.length}/${maxConcurrent} slots in use (${holders.join(", ")})${waiting}. ` +
    "This subagent was not started. Do not retry right away: do this part yourself now, " +
    "or start it after one of your own subagents returns."
  );
}

function leafReason({ place, config }: Claude): string {
  return `You are a leaf crew run (depth ${place.depth} of ${config.maxDepth}). Do this work yourself; do not start subagents.`;
}

function unconfirmedReason(): string {
  return (
    `crew could not confirm a slot for this subagent within ${GRANT_TIMEOUT_MS / 1000} s ` +
    "(the slot keeper timed out or failed), so it was not started. " +
    "Do this part yourself now, or try again later."
  );
}

function firstLine(
  stream: NodeJS.ReadableStream,
  timeoutMs: number,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    let buffer = "";
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      clearTimeout(timer);
      resolve(buffer.slice(0, end));
    });
    stream.on("end", () => {
      clearTimeout(timer);
      resolve(buffer || undefined);
    });
  });
}

function ownModel(claude: Claude, tree: Tree): string {
  const parent = claude.place.parent;
  for (const entry of tree.state().slots)
    if (entry.run === parent) return entry.model;
  return "claude";
}

function keeperOrder(
  claude: Claude,
  input: HookInput,
  tree: Tree,
  id: string,
): Order {
  const { environment, config } = claude;
  const tool = input.tool_input;
  return {
    root: claude.root,
    session: claude.session,
    place: claude.place,
    maxConcurrent: config.maxConcurrent,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs,
    pollMs: config.pollMs,
    claudePid: claude.claudePid,
    pane: environment.HERDR_ENV === "1" ? environment.HERDR_PANE_ID : undefined,
    workspace: environment.HERDR_WORKSPACE_ID ?? "",
    herdrBinary: environment.PI_CREW_HERDR_BIN || "herdr",
    run: {
      id,
      name: taskName(tool?.description || tool?.subagent_type),
      model: tool?.model || ownModel(claude, tree),
      started: new Date().toISOString(),
    },
  };
}

async function startKeeper(order: Order): Promise<string | undefined> {
  const keeper = spawn(
    process.execPath,
    ["--no-warnings", ENTRY, "keep", JSON.stringify(order)],
    { detached: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  keeper.on("error", () => {});
  const line = await firstLine(keeper.stdout, GRANT_TIMEOUT_MS);
  keeper.stdout.destroy();
  if (!isAnswer(line)) keeper.kill("SIGTERM");
  keeper.unref();
  return line;
}

function isAnswer(line: string | undefined): boolean {
  return line === GRANTED || Boolean(line?.startsWith(DENIED));
}

export async function preTool(
  claude: Claude,
  input: HookInput,
): Promise<string> {
  if (claude.place.depth >= claude.config.maxDepth)
    return denial(leafReason(claude));
  if (!input.tool_use_id) return "";
  const tree = treeOf(claude);
  const id = taskRunId(claude.session, input.tool_use_id);
  const marker = markerPath(claude.root, tree, id);
  writeMarker(marker, { session: claude.session, caller: input.agent_id });
  const line = await startKeeper(keeperOrder(claude, input, tree, id));
  if (line === GRANTED) return "";
  fs.rmSync(marker, { force: true });
  if (!line?.startsWith(DENIED)) return denial(unconfirmedReason());
  return capDenial(line, claude.config.maxConcurrent);
}

function capDenial(line: string, maxConcurrent: number): string {
  try {
    const state = JSON.parse(line.slice(DENIED.length)) as TreeState;
    return denial(capReason(state, maxConcurrent));
  } catch {
    return denial(unconfirmedReason());
  }
}

function launchedAgent({
  hook_event_name,
  tool_response,
}: HookInput): string | undefined {
  if (hook_event_name !== "PostToolUse") return undefined;
  if (tool_response?.status !== "async_launched") return undefined;
  return tool_response.agentId || undefined;
}

export function postTool(claude: Claude, input: HookInput): void {
  if (!input.tool_use_id) return;
  const tree = treeOf(claude);
  const id = taskRunId(claude.session, input.tool_use_id);
  const marker = markerPath(claude.root, tree, id);
  const entry = claims(tree, claude.session).find((claim) => claim.run === id);
  if (!entry) {
    fs.rmSync(marker, { force: true });
    return;
  }
  const agent = launchedAgent(input);
  if (!agent) {
    release(claude, tree, entry);
    return;
  }
  const current = readMarker(marker) ?? { session: claude.session };
  writeMarker(marker, { ...current, agent });
}

export function subagentStop(claude: Claude, input: HookInput): void {
  const agent = input.agent_id;
  if (!agent) return;
  releaseWhere(
    claude,
    (marker) =>
      marker?.agent === agent || (marker?.caller === agent && !marker.agent),
  );
}

export function sweep(claude: Claude): void {
  releaseWhere(claude, (marker) => !marker?.agent && !marker?.caller);
  removeOrphanMarkers(claude, treeOf(claude));
}

export function sessionEnd(claude: Claude): void {
  releaseWhere(claude, () => true);
  removeOrphanMarkers(claude, treeOf(claude));
}

function holder(tree: Tree, run: Run): number | undefined {
  for (const entry of tree.state().slots)
    if (entry.run === run.id) return entry.pid;
  return undefined;
}

class Keeper {
  private readonly order: Order;
  private readonly tree: Tree;
  private readonly run: Run;
  private readonly touchOnly: Run;
  private readonly marker: string;
  private readonly herdr: Herdr;
  private polls = 0;
  private idleReadings = 0;
  private checking = false;

  constructor(order: Order, tree: Tree, run: Run) {
    this.order = order;
    this.tree = tree;
    this.run = run;
    this.touchOnly = { ...run, status: "done" };
    this.marker = markerPath(order.root, tree, run.id);
    this.herdr = new Herdr(order.workspace, order.herdrBinary);
  }

  start(): void {
    process.on("SIGHUP", () => {});
    process.on("SIGTERM", () => this.stop(true));
    process.stdout.on("error", () => this.stop(true));
    process.stdout.write(`${GRANTED}\n`);
    process.stdout.end();
    this.tree.renew();
    setInterval(() => this.cycle(), this.order.pollMs);
  }

  private stop(releasing: boolean): void {
    if (releasing) this.tree.release(this.run);
    if (holder(this.tree, this.run) === undefined)
      fs.rmSync(this.marker, { force: true });
    process.exit(0);
  }

  private async checkIdle(pane: string): Promise<void> {
    this.checking = true;
    const status = await paneStatus(this.herdr, pane);
    this.checking = false;
    this.idleReadings = isIdle(status) ? this.idleReadings + 1 : 0;
    if (this.idleReadings >= IDLE_CONFIRMATIONS) this.stop(true);
  }

  private cycle(): void {
    const { claudePid, pane } = this.order;
    this.polls += 1;
    if (claudePid && !isAlive(claudePid)) {
      this.stop(true);
      return;
    }
    if (holder(this.tree, this.run) !== process.pid) {
      this.stop(false);
      return;
    }
    this.tree.beat([this.touchOnly]);
    this.tree.renew();
    if (pane && !this.checking && this.polls % IDLE_CHECK_POLLS === 0)
      void this.checkIdle(pane);
  }
}

function orderTree(order: Order): Tree {
  const limits = {
    maxConcurrent: order.maxConcurrent,
    heartbeatTimeoutMs: order.heartbeatTimeoutMs,
  };
  return new Tree(order.root, order.session, order.place, limits as Config);
}

export function keep(order: Order): void {
  const tree = orderTree(order);
  const { id, name, model, started } = order.run;
  const run = taskRun(order.root, id, name, model, started);
  if (!tree.acquire(run)) {
    tree.release(run);
    process.stdout.write(`${DENIED}${JSON.stringify(tree.state())}\n`);
    return;
  }
  new Keeper(order, tree, run).start();
}
