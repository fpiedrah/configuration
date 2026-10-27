import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Harness, Model, SessionMode } from "./models.ts";
import type { Worktree } from "./worktree.ts";

type RunStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface Run {
  id: string;
  name: string;
  agent: string;
  model: string;
  modelId: string;
  harness: Harness;
  effort: string;
  status: RunStatus;
  cwd: string;
  dir: string;
  tab?: string;
  pane?: string;
  baseSeq?: number;
  sawWorking: boolean;
  blockedNotified: boolean;
  error?: string;
  created: string;
  started?: string;
  ended?: string;
  delivered: boolean;
  ask?: { number: number; hash: string; since: string; title: string };
  asked?: number;
  parked?: { since: string; hash: string; note: string };
  pending?: string;
  agentSession?: { kind: string; value: string };
  cost?: string;
  modelName?: string;
  transcriptOrigin?: string;
  origin?: { mode: SessionMode; run: string; session: string };
  deadline?: number;
  maxTurns?: number;
  turns?: number;
  countedSeq?: number;
  group?: string;
  round?: number;
  worktree?: Worktree;
}

export interface Note {
  text: string;
  hash: string;
  title: string;
}

export interface Group {
  name: string;
  round: number;
  awaited?: string;
  notified?: string;
}

export interface Registry {
  session: string;
  runs: Run[];
  groups: Group[];
}

const AGENT_SLUG_LENGTH = 26;
const SUFFIX_DIGITS = 4;
const HEXADECIMAL = 16;
const HASH_LENGTH = 12;
const TITLE_LENGTH = 120;

const ALIASES: Record<string, string> = {
  "deliverable.md": "result.md",
  "trace.md": "tail.md",
  lease: "hold",
};

export function isActive(run: Run): boolean {
  return run.status === "queued" || run.status === "running";
}

export function isPending(group: Group): boolean {
  return group.awaited !== undefined && group.notified === undefined;
}

export function groupMembers(registry: Registry, group: Group): Run[] {
  return registry.runs.filter(
    (run) => run.group === group.name && run.round === group.round,
  );
}

export function readablePath(dir: string, name: string): string {
  const file = path.join(dir, name);
  const alias = ALIASES[name];
  if (alias === undefined || fs.existsSync(file)) return file;
  const old = path.join(dir, alias);
  return fs.existsSync(old) ? old : file;
}

export function engagementPath(run: Run): string {
  return path.join(run.dir, "engagement.md");
}

export function deliverablePath(run: Run): string {
  return path.join(run.dir, "deliverable.md");
}

export function inquiryPath(dir: string): string {
  return path.join(dir, "inquiry.md");
}

export function parkedPath(dir: string): string {
  return path.join(dir, "parked.md");
}

function registryPath(root: string, session: string): string {
  return path.join(root, `registry-${session}.json`);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseRegistry(text: string): Partial<Registry> {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error("registry is not a JSON object");
  const { runs, groups } = data as Partial<Registry>;
  if (runs !== undefined && !Array.isArray(runs))
    throw new Error("registry runs is not an array");
  if (groups !== undefined && !Array.isArray(groups))
    throw new Error("registry groups is not an array");
  return data as Partial<Registry>;
}

function quarantineRegistry(file: string, failure: unknown): void {
  const stamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
  const backup = file.replace(/\.json$/, `.corrupt-${stamp}.json`);
  try {
    fs.renameSync(file, backup);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error(
      `crew: registry ${file} is unreadable (${describeError(failure)}) and could not be moved aside to ${backup} (${describeError(error)}); repair or remove it by hand`,
    );
  }
  process.stderr.write(
    `crew: registry ${file} is unreadable (${describeError(failure)}); moved it to ${backup} and starting with an empty registry\n`,
  );
}

export function loadRegistry(root: string, session: string): Registry {
  const file = registryPath(root, session);
  let data: Partial<Registry> = {};
  try {
    data = parseRegistry(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      quarantineRegistry(file, error);
  }
  return { session, runs: data.runs ?? [], groups: data.groups ?? [] };
}

export function saveRegistry(root: string, registry: Registry): void {
  fs.mkdirSync(root, { recursive: true });
  const target = registryPath(root, registry.session);
  const scratch = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(scratch, JSON.stringify(registry, null, 2));
  fs.renameSync(scratch, target);
}

export function ensureRoot(root: string): void {
  fs.mkdirSync(path.join(root, "runs"), { recursive: true });
  const ignore = path.join(root, ".gitignore");
  if (!fs.existsSync(ignore)) {
    fs.writeFileSync(ignore, "runs/\ntrees/\nregistry-*.json\nworktrees/\n");
    return;
  }
  const current = fs.readFileSync(ignore, "utf8");
  if (current.split("\n").some((line) => line.trim() === "worktrees/")) return;
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(ignore, `${separator}worktrees/\n`);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function runId(now: Date): string {
  const date = `${now.getFullYear()}${twoDigits(now.getMonth() + 1)}${twoDigits(now.getDate())}`;
  const time = `${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`;
  const suffix = Math.floor(Math.random() * HEXADECIMAL ** SUFFIX_DIGITS)
    .toString(HEXADECIMAL)
    .padStart(SUFFIX_DIGITS, "0");
  return `${date}-${time}-${suffix}`;
}

function agentSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .slice(0, AGENT_SLUG_LENGTH)
    .replace(/-+$/, "");
}

export function createRun(
  root: string,
  {
    name,
    model,
    effort,
    cwd,
    origin,
    deadline,
    maxTurns,
  }: {
    name: string;
    model: Model;
    effort: string;
    cwd: string;
    origin?: Run["origin"];
    deadline?: number;
    maxTurns?: number;
  },
): Run {
  const now = new Date();
  const id = runId(now);
  return {
    id,
    name,
    agent: `${agentSlug(name) || "crew"}-${id.slice(-SUFFIX_DIGITS)}`,
    model: model.key,
    modelId: model.id,
    harness: model.harness,
    effort,
    status: "queued",
    cwd,
    dir: path.join(root, "runs", id),
    sawWorking: false,
    blockedNotified: false,
    created: now.toISOString(),
    delivered: false,
    origin,
    deadline,
    maxTurns,
  };
}

export function writeEngagement(
  run: Run,
  task: string,
  canDelegate: boolean,
  extraRules: string,
): void {
  const footer = [
    "",
    "---",
    ...(extraRules ? [extraRules, ""] : []),
    `When done, write your final answer (summary + key file paths) to ${deliverablePath(run)}, then stop.`,
    "If the brief tells you to stay available for more work, park instead of finishing: " +
      `write a one-line note to ${parkedPath(run.dir)} and end your turn without writing deliverable.md. ` +
      "Your parent's next message wakes you.",
    "Do not wait for feedback, except through inquiry.md: if you cannot sensibly continue without a decision " +
      "from whoever gave you this task (for example, the brief asks you to confirm a plan before you spawn runs), " +
      `write the question to ${inquiryPath(run.dir)} and end your turn. The answer arrives as your next message. ` +
      "Ask one thing at a time, and only when you must. If the answer reaches you another way, delete inquiry.md before you continue.",
    canDelegate
      ? "You may delegate parts with the crew tool; write deliverable.md only after their results arrive."
      : "Do not delegate to other agents.",
    "",
  ].join("\n");
  fs.mkdirSync(run.dir, { recursive: true });
  fs.writeFileSync(engagementPath(run), `${task.trimEnd()}\n${footer}`);
}

export function readDeliverable(run: Run): string | undefined {
  try {
    const text = fs.readFileSync(deliverablePath(run), "utf8");
    return text.trim() ? text : undefined;
  } catch {
    return undefined;
  }
}

export function writeTrace(run: Run, text: string): string {
  const file = path.join(run.dir, "trace.md");
  fs.writeFileSync(file, text);
  return file;
}

function exists(file: string): Promise<boolean> {
  return fs.promises.access(file).then(
    () => true,
    () => false,
  );
}

function claudeProjects(): string {
  const config =
    process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return path.join(config, "projects");
}

function claudeFolder(cwd: string): string {
  return path.join(claudeProjects(), cwd.replace(/[^a-zA-Z0-9]/g, "-"));
}

async function findClaudeSession(
  id: string,
  cwd: string,
): Promise<string | undefined> {
  if (!/^[\w-]+$/.test(id)) return undefined;
  const home = path.join(claudeFolder(cwd), `${id}.jsonl`);
  if (await exists(home)) return home;
  const projects = claudeProjects();
  const folders = await fs.promises.readdir(projects).catch(() => []);
  const found: string[] = [];
  for (const folder of folders) {
    const file = path.join(projects, folder, `${id}.jsonl`);
    if (await exists(file)) found.push(file);
  }
  return found.length === 1 ? found[0] : undefined;
}

export async function locateSession(run: Run): Promise<string | undefined> {
  const { kind, value } = run.agentSession ?? {};
  if (!value) return undefined;
  if (kind === "path") return (await exists(value)) ? value : undefined;
  if (kind === "id") return findClaudeSession(value, run.cwd);
  return undefined;
}

async function copySiblings(
  origin: string,
  destination: string,
): Promise<void> {
  const siblings = origin.replace(/\.jsonl$/, "");
  if (siblings === origin || !(await exists(siblings))) return;
  await fs.promises
    .cp(siblings, destination, { recursive: true })
    .catch(() => {});
}

export async function snapshotTranscript(run: Run): Promise<void> {
  const origin = await locateSession(run);
  if (!origin) return;
  try {
    await fs.promises.copyFile(origin, path.join(run.dir, "transcript.jsonl"));
  } catch {
    return;
  }
  run.transcriptOrigin = origin;
  await copySiblings(origin, path.join(run.dir, "transcript"));
}

export async function shareClaudeSession(
  source: Run,
  cwd: string,
): Promise<void> {
  const origin = await locateSession(source);
  const folder = claudeFolder(cwd);
  if (!origin || path.dirname(origin) === folder) return;
  const target = path.join(folder, path.basename(origin));
  try {
    await fs.promises.mkdir(folder, { recursive: true });
    await fs.promises.copyFile(origin, target);
  } catch {
    return;
  }
  await copySiblings(origin, target.replace(/\.jsonl$/, ""));
}

export function appendDirective(run: Run, text: string): void {
  fs.appendFileSync(
    path.join(run.dir, "directives.md"),
    `## ${new Date().toISOString()}\n\n${text.trimEnd()}\n\n`,
  );
}

function readNote(file: string): Note | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const title = text.split("\n").find((line) => line.trim());
  if (title === undefined) return undefined;
  return {
    text,
    hash: createHash("sha1").update(text).digest("hex").slice(0, HASH_LENGTH),
    title: title.trim().slice(0, TITLE_LENGTH),
  };
}

export function readInquiry(dir: string): Note | undefined {
  return readNote(inquiryPath(dir));
}

export function readParked(dir: string): Note | undefined {
  return readNote(parkedPath(dir));
}

export function logInquiry(run: Run, heading: string, body = ""): void {
  const text = body.trimEnd() ? `${heading}\n\n${body.trimEnd()}` : heading;
  fs.appendFileSync(path.join(run.dir, "inquiries.md"), `${text}\n\n`);
}

export function removeInquiry(run: Run, hash: string): void {
  if (readInquiry(run.dir)?.hash === hash)
    fs.rmSync(inquiryPath(run.dir), { force: true });
}

export function removeParked(run: Run, hash: string): void {
  if (readParked(run.dir)?.hash === hash)
    fs.rmSync(parkedPath(run.dir), { force: true });
}

export function closeInquiry(run: Run, reason: string): void {
  if (!run.ask) return;
  logInquiry(run, `### #${run.ask.number} closed: ${reason}`);
  removeInquiry(run, run.ask.hash);
  run.ask = undefined;
}
