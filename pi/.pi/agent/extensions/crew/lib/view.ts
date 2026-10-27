import * as path from "node:path";
import type { Config } from "./config.ts";
import type { Agent } from "./herdr.ts";
import { readInquiry, readParked } from "./runs.ts";
import type { Run } from "./runs.ts";
import type { Entry, TreeState } from "./tree.ts";

const FAILED_LINGER_FACTOR = 3;

export type RowState =
  | "queued"
  | "running"
  | "blocked"
  | "asking"
  | "parked"
  | "gone"
  | "done"
  | "failed"
  | "cancelled";

export interface Row {
  id: string;
  name: string;
  model: string;
  level: number;
  state: RowState;
  dir: string;
  agent?: string;
  tab?: string;
  created?: string;
  started?: string;
  ended?: string;
  position?: number;
  activity?: string;
  cost?: string;
  error?: string;
  question?: string;
  note?: string;
  delivered: boolean;
}

export interface View {
  used: number;
  maxConcurrent: number;
  queued: number;
  parked: number;
  deepest: number;
  maxDepth: number;
  rows: Row[];
}

export interface Live {
  agents: Map<string, Agent>;
  listedAt: number;
}

interface Scope {
  root: string;
  state: TreeState;
  live: Live;
  maxDepth: number;
}

interface NestedFacts {
  queued: boolean;
  parked: boolean;
  agent?: Agent;
  dir: string;
  question?: string;
}

export function isFinished(row: Row): boolean {
  return (
    row.state === "done" || row.state === "failed" || row.state === "cancelled"
  );
}

export function lingers(row: Row, lingerMs: number, now: number): boolean {
  if (!isFinished(row) || !row.delivered) return true;
  if (!row.ended) return false;
  const window =
    row.state === "done" ? lingerMs : lingerMs * FAILED_LINGER_FACTOR;
  return now - Date.parse(row.ended) < window;
}

export function emptyView({ maxConcurrent, maxDepth }: Config): View {
  return {
    used: 0,
    maxConcurrent,
    queued: 0,
    parked: 0,
    deepest: 0,
    maxDepth,
    rows: [],
  };
}

function vanished(live: Live, name?: string, started?: string): boolean {
  if (!name || !started || live.agents.get(name)) return false;
  return Date.parse(started) < live.listedAt;
}

function liveState(
  live: Live,
  name: string | undefined,
  started: string | undefined,
  notified: boolean,
  question: string | undefined,
): RowState {
  const agent = name ? live.agents.get(name) : undefined;
  if (notified || agent?.status === "blocked") return "blocked";
  if (question && agent?.status !== "working") return "asking";
  if (vanished(live, name, started)) return "gone";
  return "running";
}

function runState(run: Run, live: Live): RowState {
  if (run.status !== "running") return run.status;
  if (run.parked && live.agents.get(run.agent)?.status !== "working")
    return "parked";
  return liveState(
    live,
    run.agent,
    run.started,
    run.blockedNotified,
    run.ask?.title,
  );
}

function ticketPosition(tickets: Entry[], run: Run): number | undefined {
  const position = tickets.findIndex((entry) => entry.run === run.id) + 1;
  return position || undefined;
}

export function rowOf(run: Run, tickets: Entry[], live: Live): Row {
  const agent = live.agents.get(run.agent);
  return {
    id: run.id,
    name: run.name,
    model: run.model,
    level: 0,
    state: runState(run, live),
    dir: run.dir,
    agent: run.agent,
    tab: run.tab,
    created: run.created,
    started: run.started,
    ended: run.ended,
    position: ticketPosition(tickets, run),
    activity: agent?.activity,
    cost: agent?.cost ?? run.cost,
    error: run.error,
    question: run.ask?.title,
    note: run.parked?.note,
    delivered: run.delivered,
  };
}

function nestedState(
  live: Live,
  entry: Entry,
  { queued, parked, question }: NestedFacts,
): RowState {
  if (queued) return "queued";
  if (parked) return "parked";
  return liveState(live, entry.agent, entry.started, false, question);
}

function pendingQuestion(
  dir: string,
  queued: boolean,
  agent: Agent | undefined,
): string | undefined {
  if (queued || agent?.status === "working") return undefined;
  return readInquiry(dir)?.title;
}

function entryIdentity({ run, name, model, agent, tab, started }: Entry) {
  return { id: run, name, model, agent, tab, started };
}

function nestedFacts({ root, state, live }: Scope, entry: Entry): NestedFacts {
  const queued = state.tickets.includes(entry);
  const agent = entry.agent ? live.agents.get(entry.agent) : undefined;
  const dir = path.join(root, "runs", entry.run);
  const parked = !queued && entry.reason === "parked";
  const question = pendingQuestion(dir, queued, agent);
  return { queued, parked, agent, dir, question };
}

function nestedRow(scope: Scope, entry: Entry, level: number): Row {
  const facts = nestedFacts(scope, entry);
  const { queued, parked, agent, dir, question } = facts;
  return {
    ...entryIdentity(entry),
    level,
    state: nestedState(scope.live, entry, facts),
    dir,
    position: queued ? scope.state.tickets.indexOf(entry) + 1 : undefined,
    activity: agent?.activity,
    cost: agent?.cost,
    question,
    note: parked ? readParked(dir)?.title : undefined,
    delivered: true,
  };
}

function nest(scope: Scope, parent: string, level: number, rows: Row[]): void {
  if (level > scope.maxDepth) return;
  const { slots, tickets, parked } = scope.state;
  const seen = new Set<string>();
  for (const entry of [...slots, ...tickets, ...parked]) {
    if (entry.parent !== parent || seen.has(entry.run)) continue;
    seen.add(entry.run);
    const row = nestedRow(scope, entry, level);
    rows.push(row);
    if (row.state !== "queued") nest(scope, entry.run, level + 1, rows);
  }
}

function deepestDepth({ slots, tickets, parked }: TreeState): number {
  let deepest = 0;
  for (const entry of [...slots, ...tickets, ...parked])
    deepest = Math.max(deepest, entry.depth);
  return deepest;
}

function lingeringRows(scope: Scope, runs: Run[], lingerMs: number): Row[] {
  const now = Date.now();
  const rows: Row[] = [];
  for (const run of runs) {
    const row = rowOf(run, scope.state.tickets, scope.live);
    if (!lingers(row, lingerMs, now)) continue;
    rows.push(row);
    if (run.status === "running") nest(scope, run.id, 1, rows);
  }
  return rows;
}

export function snapshot(
  root: string,
  runs: Run[],
  state: TreeState,
  live: Live,
  config: Config,
): View {
  const scope = { root, state, live, maxDepth: config.maxDepth };
  const rows = lingeringRows(scope, runs, config.lingerMs);
  const deepest = deepestDepth(state);
  return {
    used: state.slots.length,
    maxConcurrent: config.maxConcurrent,
    queued: state.tickets.length,
    parked: state.parked.length,
    deepest,
    maxDepth: config.maxDepth,
    rows,
  };
}
