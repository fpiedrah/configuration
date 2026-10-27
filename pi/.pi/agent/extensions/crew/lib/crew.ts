import * as fs from "node:fs";
import * as path from "node:path";
import { pinnedConfig } from "./config.ts";
import type { Config } from "./config.ts";
import { isHerdrError } from "./herdr.ts";
import type { Agent, Herdr } from "./herdr.ts";
import {
  checkEffort,
  modelFlags,
  resolveModel,
  sessionFlags,
} from "./models.ts";
import type { Model, ModelIndex, SessionMode } from "./models.ts";
import {
  appendDirective,
  closeInquiry,
  createRun,
  deliverablePath,
  ensureRoot,
  groupMembers,
  inquiryPath,
  isActive,
  isPending,
  loadRegistry,
  locateSession,
  logInquiry,
  readDeliverable,
  readInquiry,
  readParked,
  readablePath,
  removeInquiry,
  removeParked,
  saveRegistry,
  shareClaudeSession,
  snapshotTranscript,
  writeEngagement,
  writeTrace,
} from "./runs.ts";
import type { Group, Note, Registry, Run } from "./runs.ts";
import {
  BASE_NEEDS_WORKTREE,
  BOTH_ORIGINS,
  DEADLINE_INVALID,
  STARTUP_EXITED,
  TURNS_INVALID,
  answerPrompt,
  askMessage,
  blockedMessage,
  briefPrompt,
  continueActive,
  continueFixed,
  continueMissing,
  continueTaken,
  deadlineReason,
  fill,
  forkHarness,
  groupAwaited,
  groupMessage,
  groupReminder,
  noSession,
  originPrompt,
  parkedMessage,
  resultMessage,
  startupBlocked,
  startupStuck,
  steerPrompt,
  strandedReason,
  turnsReason,
  undeliveredReason,
} from "./text.ts";
import { Tree, childEnvironment } from "./tree.ts";
import type { Entry, ParkReason, Place, TreeState } from "./tree.ts";
import { emptyView, rowOf, snapshot } from "./view.ts";
import type { Live, Row, View } from "./view.ts";
import { createWorktree, discardWorktree, removeWorktree } from "./worktree.ts";

const TRACE_LINES = 200;
const MILLISECONDS_PER_MINUTE = 60_000;
const READY_POLL_MS = 250;
const CANCEL_ROUNDS = 5;
const QUEUE_SEPARATOR = "\n\n";

type PromptOutcome = "sent" | "blocked" | "inactive";

export type SteerOutcome = PromptOutcome | "nested" | "queued";

export type AnswerOutcome = SteerOutcome | "none" | "stale";

export type KillOutcome = "killed" | "stranded" | "inactive" | "nested";

export interface Cancellation {
  outcome: Exclude<KillOutcome, "nested">;
  stranded: string[];
}

export type AwaitOutcome = "empty" | "waiting" | "finished";

export type WorktreeOutcome = "removed" | "active" | "in-use" | "none";

export interface WorktreeRemoval {
  outcome: WorktreeOutcome;
  users: string[];
}

type Deliver = (content: string, details: unknown) => void;

interface Session {
  root: string;
  registry: Registry;
  herdr: Herdr;
  tree: Tree;
}

interface Submission {
  name?: string;
  task: string;
  model?: string;
  effort?: string;
  cwd?: string;
  fork?: string;
  resume?: string;
  deadline?: number;
  maxTurns?: number;
  group?: string;
  worktree?: string;
  base?: string;
}

interface Lineage {
  source: Run;
  origin: NonNullable<Run["origin"]>;
}

interface Choice {
  model: Model;
  effort: string;
}

interface Observation {
  deliverable?: string;
  inquiry?: Note;
  note?: Note;
  fresh: boolean;
  entering: boolean;
}

function matches(
  target: { id: string; name: string; agent?: string },
  key: string,
): boolean {
  return (
    target.id === key ||
    target.id.endsWith(key) ||
    target.name === key ||
    target.agent === key
  );
}

function finish(
  tree: Tree,
  run: Run,
  status: "done" | "failed" | "cancelled",
  error?: string,
): void {
  if (!isActive(run)) return;
  run.status = status;
  run.error = error;
  run.ended = new Date().toISOString();
  closeInquiry(run, status);
  tree.release(run);
}

function strand(run: Run, tabs: string[]): void {
  if (tabs.length === 0) return;
  const reason = strandedReason(tabs);
  run.error = run.error ? `${run.error}; ${reason}` : reason;
}

function freshTabs(entries: Entry[], attempted: Set<string>): string[] {
  return entries.flatMap(({ tab }) =>
    tab && !attempted.has(tab) ? [tab] : [],
  );
}

async function closeTabs(
  herdr: Herdr,
  tabs: string[],
  attempted: Set<string>,
): Promise<string[]> {
  const failed: string[] = [];
  for (const tab of tabs) {
    attempted.add(tab);
    if (!(await herdr.closeTab(tab))) failed.push(tab);
  }
  return failed;
}

function hold(tree: Tree, run: Run, reason: ParkReason): void {
  if (!tree.parkedReason(run)) tree.park(run, reason);
}

function wake(tree: Tree, run: Run): void {
  if (tree.parkedReason(run)) tree.unpark(run);
}

function pauseOn(
  tree: Tree,
  run: Run,
  found: Note | undefined,
  fresh: boolean,
  reason: ParkReason,
  enter: (note: Note) => void,
): boolean {
  if (!found) return false;
  if (fresh) enter(found);
  else hold(tree, run, reason);
  return true;
}

function markWorking(tree: Tree, run: Run): void {
  run.sawWorking = true;
  run.blockedNotified = false;
  wake(tree, run);
}

function clearParked(run: Run): void {
  if (!run.parked) return;
  removeParked(run, run.parked.hash);
  run.parked = undefined;
}

function queue(run: Run, prompt: string): void {
  run.pending =
    run.pending === undefined
      ? prompt
      : `${run.pending}${QUEUE_SEPARATOR}${prompt}`;
}

function dequeue(run: Run, delivered: string): void {
  const rest = run.pending?.slice(delivered.length + QUEUE_SEPARATOR.length);
  run.pending = rest || undefined;
}

function recordAnswer(
  run: Run,
  ask: NonNullable<Run["ask"]>,
  text: string,
  who: string,
): void {
  const time = new Date().toISOString();
  logInquiry(run, `### #${ask.number} answered ${time} by ${who}`, text);
  removeInquiry(run, ask.hash);
  if (run.ask === ask) run.ask = undefined;
}

function checkLimits(deadline?: number, maxTurns?: number): void {
  if (deadline !== undefined && !(Number.isFinite(deadline) && deadline > 0))
    throw new Error(DEADLINE_INVALID);
  if (maxTurns !== undefined && !(Number.isInteger(maxTurns) && maxTurns >= 1))
    throw new Error(TURNS_INVALID);
}

function sourceModel(source: Run): Model {
  return {
    key: source.model,
    harness: source.harness,
    id: source.modelId,
    effort: source.effort,
    role: "",
  };
}

function countTurns(run: Run, sequence: number): void {
  const counted = run.countedSeq ?? run.baseSeq ?? sequence;
  if (sequence > counted) {
    run.turns = (run.turns ?? 0) + sequence - counted;
    run.countedSeq = sequence;
  } else run.countedSeq = counted;
}

function turnsLapse({ maxTurns, turns = 0 }: Run): string | undefined {
  if (maxTurns === undefined || turns < maxTurns) return undefined;
  return turnsReason(maxTurns);
}

function deadlineLapse(
  { deadline, started }: Run,
  now: number,
): string | undefined {
  if (!deadline || !started) return undefined;
  const limit = Date.parse(started) + deadline * MILLISECONDS_PER_MINUTE;
  return now >= limit ? deadlineReason(deadline) : undefined;
}

function continuing(registry: Registry, session: string): Run | undefined {
  return registry.runs.find(
    (run) =>
      isActive(run) &&
      ((run.origin?.mode === "resume" && run.origin.session === session) ||
        run.agentSession?.value === session),
  );
}

function waitsOnChildren(
  tree: Tree,
  run: Run,
  inquiry?: Note,
  note?: Note,
): boolean {
  return inquiry === undefined && note === undefined && tree.leased(run);
}

function inheritedCwd(lineage?: Lineage): string | undefined {
  if (lineage?.origin.mode !== "resume") return undefined;
  const { name, cwd } = lineage.source;
  if (!fs.existsSync(cwd)) throw new Error(continueMissing(name, cwd));
  return cwd;
}

function checkGroup(registry: Registry, name: string): void {
  const open = registry.groups.find((group) => group.name === name);
  if (open && isPending(open)) throw new Error(groupAwaited(name));
}

function joinGroup(registry: Registry, run: Run, name: string): void {
  checkGroup(registry, name);
  const found = registry.groups.find((group) => group.name === name);
  const group = found ?? { name, round: 1 };
  if (!found) registry.groups.push(group);
  else if (group.awaited && group.notified) {
    group.round += 1;
    group.awaited = undefined;
    group.notified = undefined;
  } else group.notified = undefined;
  run.group = name;
  run.round = group.round;
}

async function isolate(
  root: string,
  run: Run,
  branch: string,
  base?: string,
): Promise<void> {
  const worktree = await createWorktree({
    cwd: run.cwd,
    branch,
    base,
    path: path.join(root, "worktrees", run.id),
  });
  run.cwd = worktree.path;
  run.worktree = worktree;
}

function settled(registry: Registry, group: Group): Run[] | undefined {
  if (group.notified) return undefined;
  const members = groupMembers(registry, group);
  const finished = members.every((run) => !isActive(run) && run.delivered);
  return finished && members.length > 0 ? members : undefined;
}

function restoreGroups(registry: Registry, saved: Group[]): void {
  registry.groups.length = saved.length;
  saved.forEach((group, index) => {
    Object.assign(registry.groups[index], group);
  });
}

function forget(registry: Registry, run: Run): void {
  const index = registry.runs.indexOf(run);
  if (index >= 0) registry.runs.splice(index, 1);
}

async function discard(run: Run): Promise<void> {
  if (run.worktree) await discardWorktree(run.worktree).catch(() => {});
}

function within(directory: string, cwd: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(cwd));
  return (
    relative === "" ||
    (relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative))
  );
}

function observe(run: Run, agent: Agent): void {
  run.agentSession = agent.session ?? run.agentSession;
  run.cost = agent.cost ?? run.cost;
  run.modelName = agent.model ?? run.modelName;
}

function observeFiles(run: Run): Observation {
  const deliverable = readDeliverable(run);
  const inquiry = readInquiry(run.dir);
  const note = readParked(run.dir);
  return {
    deliverable,
    inquiry,
    note,
    fresh: inquiry !== undefined && inquiry.hash !== run.ask?.hash,
    entering: note !== undefined && note.hash !== run.parked?.hash,
  };
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isReady(agent: Agent): boolean {
  return (
    agent.session !== undefined &&
    (agent.status === "idle" || agent.status === "done")
  );
}

function silentFor(run: Run, now: number): number {
  const { sawWorking, turns = 0, pending, started } = run;
  if (sawWorking || turns > 0 || pending !== undefined || !started) return 0;
  return now - Date.parse(started);
}

function finishedTurn(run: Run, sequence: number, seen: Observation): boolean {
  return (
    run.sawWorking ||
    sequence > (run.baseSeq ?? 0) ||
    seen.deliverable !== undefined ||
    seen.fresh ||
    seen.entering
  );
}

function closeWithdrawn(run: Run, seen: Observation): void {
  if (run.ask && !seen.inquiry) closeInquiry(run, "withdrawn");
}

function exitError(run: Run): string {
  if (run.ask) return `agent exited while asking question #${run.ask.number}`;
  if (run.parked) return "agent exited while parked";
  return "agent exited without writing deliverable.md";
}

function ownRunning(registry: Registry, row: Row): Run | "nested" | "inactive" {
  const run = registry.runs.find((candidate) => candidate.id === row.id);
  if (!run) return "nested";
  return run.status === "running" ? run : "inactive";
}

function keptChoice(
  source: Run,
  models: ModelIndex,
  model?: string,
  effort?: string,
): Choice {
  const wanted = model ? resolveModel(models, model) : undefined;
  const same =
    wanted?.id === source.modelId && wanted.harness === source.harness;
  if (wanted && !same)
    throw new Error(continueFixed(source.name, "model", source.model));
  if (effort && effort !== source.effort)
    throw new Error(continueFixed(source.name, "effort", source.effort));
  return { model: sourceModel(source), effort: source.effort };
}

function freshChoice(
  models: ModelIndex,
  key: string,
  source?: Run,
  effort?: string,
): Choice {
  const chosen = resolveModel(models, key);
  if (source && chosen.harness !== source.harness)
    throw new Error(forkHarness(source.name, source.harness, chosen));
  const level = effort || chosen.effort;
  checkEffort(chosen, level);
  return { model: chosen, effort: level };
}

export class Crew {
  private readonly deliver: Deliver;
  private readonly place: Place;
  private readonly config: Config;
  private readonly changed: (view: View) => void;
  private readonly pinned: string;
  private session: Session | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private live: Live = { agents: new Map(), listedAt: 0 };
  private view: View;

  constructor(
    deliver: Deliver,
    place: Place,
    config: Config,
    changed: (view: View) => void,
  ) {
    this.deliver = deliver;
    this.place = place;
    this.config = config;
    this.changed = changed;
    this.pinned = pinnedConfig(config);
    this.view = emptyView(config);
  }

  get ready(): boolean {
    return this.session !== undefined;
  }

  private requireSession(): Session {
    if (!this.session) throw new Error(this.config.text.herdrRequired);
    return this.session;
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    const active = this.session?.registry.runs.some(isActive) ?? false;
    if (!active) this.stopTimer();
    else if (!this.timer) {
      this.timer = setInterval(() => void this.cycle(), this.config.pollMs);
      this.timer.unref();
    }
  }

  private async originFlags(
    { registry }: Session,
    run: Run,
  ): Promise<string[]> {
    const { origin } = run;
    if (!origin) return [];
    const source = registry.runs.find(
      (candidate) => candidate.id === origin.run,
    );
    if (source && run.harness === "claude")
      await shareClaudeSession(source, run.cwd);
    return sessionFlags(run.harness, origin.mode, origin.session);
  }

  private async openTab(
    { root, herdr, tree }: Session,
    run: Run,
  ): Promise<{ tab: string; pane: string }> {
    const opened = await herdr.createTab(
      run.cwd,
      run.name,
      childEnvironment(this.place, tree.id, root, run, this.pinned),
    );
    run.tab = opened.tab;
    run.pane = opened.pane;
    tree.update(run);
    return opened;
  }

  private async launch(
    current: Session,
    run: Run,
    pane: string,
  ): Promise<void> {
    const { herdr } = current;
    const flags = [
      ...modelFlags(
        run.harness,
        run.modelId,
        run.effort,
        this.config.piProjectTrust,
      ),
      ...(await this.originFlags(current, run)),
    ];
    await herdr.startAgent(run.agent, run.harness, pane, flags);
    const agent = await this.awaitReady(herdr, run);
    if (!agent) return;
    run.baseSeq = agent.sequence;
    run.countedSeq = run.baseSeq;
    run.turns = 0;
    await herdr.prompt(
      run.agent,
      run.origin ? originPrompt(run, run.origin) : briefPrompt(run),
    );
  }

  private async traceScreen(herdr: Herdr, run: Run): Promise<string> {
    const screen = await herdr
      .read(run.agent, TRACE_LINES)
      .catch((error: Error) => `herdr agent read failed: ${error.message}`);
    return writeTrace(run, screen);
  }

  private async awaitReady(herdr: Herdr, run: Run): Promise<Agent | undefined> {
    const { readyTimeoutMs } = this.config;
    const limit = Date.now() + readyTimeoutMs;
    for (;;) {
      if (!isActive(run)) return undefined;
      const agent = await herdr.state(run.agent);
      if (agent.status === "gone") throw new Error(STARTUP_EXITED);
      if (isReady(agent)) return agent;
      if (agent.status === "blocked")
        throw new Error(
          startupBlocked(run.name, await this.traceScreen(herdr, run)),
        );
      if (Date.now() >= limit)
        throw new Error(
          startupStuck(
            run.name,
            readyTimeoutMs,
            await this.traceScreen(herdr, run),
          ),
        );
      await pause(READY_POLL_MS);
    }
  }

  private async start(current: Session, run: Run): Promise<void> {
    const { herdr, tree } = current;
    try {
      const { tab, pane } = await this.openTab(current, run);
      await this.launch(current, run, pane);
      if (!isActive(run)) {
        await herdr.closeTab(tab);
        return;
      }
      run.status = "running";
      run.started = new Date().toISOString();
      tree.update(run);
    } catch (error) {
      const reason = `start failed: ${(error as Error).message}`;
      await this.conclude(current, run, "failed", reason);
    }
  }

  private async cancelDescendants(
    { herdr, tree }: Session,
    run: Run,
  ): Promise<string[]> {
    const attempted = new Set<string>();
    const stranded: string[] = [];
    let fresh = freshTabs(tree.descendants(run), attempted);
    for (let round = 0; fresh.length > 0 && round < CANCEL_ROUNDS; round++) {
      stranded.push(...(await closeTabs(herdr, fresh, attempted)));
      fresh = freshTabs(tree.descendants(run), attempted);
    }
    return [...stranded, ...fresh];
  }

  private async conclude(
    current: Session,
    run: Run,
    status: "done" | "failed",
    error?: string,
  ): Promise<void> {
    if (!isActive(run)) return;
    finish(current.tree, run, status, error);
    strand(run, await this.cancelDescendants(current, run));
  }

  private notifyBlocked(run: Run): void {
    if (run.blockedNotified) return;
    run.blockedNotified = true;
    this.deliver(blockedMessage(run), { id: run.id, status: "blocked" });
  }

  private async failStopped(current: Session, run: Run): Promise<void> {
    const output = await current.herdr.read(run.agent, TRACE_LINES);
    const file = writeTrace(run, output);
    await this.conclude(
      current,
      run,
      "failed",
      `agent stopped without writing deliverable.md; last output in ${file}`,
    );
  }

  private async failSilent(current: Session, run: Run): Promise<void> {
    const silent = silentFor(run, Date.now());
    if (silent <= this.config.startGraceMs) return;
    const file = await this.traceScreen(current.herdr, run);
    await this.conclude(
      current,
      run,
      "failed",
      undeliveredReason(silent, file),
    );
  }

  private async settle(
    current: Session,
    run: Run,
    seen: Observation,
    lapse: string | undefined,
  ): Promise<void> {
    const { root, tree } = current;
    const { inquiry, note } = seen;
    if (lapse && !waitsOnChildren(tree, run, inquiry, note)) {
      await this.stop(current, run, lapse);
      return;
    }
    const raiseInquiry = (found: Note) => this.raise(root, tree, run, found);
    const enterNote = (found: Note) => this.enterParked(tree, run, found);
    if (pauseOn(tree, run, inquiry, seen.fresh, "asking", raiseInquiry)) return;
    if (pauseOn(tree, run, note, seen.entering, "parked", enterNote)) return;
    if (tree.leased(run)) hold(tree, run, "waiting");
    else if (run.pending === undefined) await this.failStopped(current, run);
  }

  private async checkStopped(
    current: Session,
    run: Run,
    status: string,
    sequence: number,
  ): Promise<void> {
    const gone = status === "gone";
    const lapse = turnsLapse(run);
    const seen = observeFiles(run);
    closeWithdrawn(run, seen);
    const idle = status === "done" || status === "idle";
    if (!gone && !finishedTurn(run, sequence, seen)) {
      await this.failSilent(current, run);
      return;
    }
    if (!gone && !idle) return;
    if (seen.deliverable !== undefined) {
      await this.conclude(current, run, "done");
      return;
    }
    if (gone) await this.conclude(current, run, "failed", exitError(run));
    else await this.settle(current, run, seen, lapse);
  }

  private async check(
    current: Session,
    run: Run,
    agent: Agent | undefined,
  ): Promise<void> {
    const status = agent?.status ?? "gone";
    const sequence = agent?.sequence ?? 0;
    if (agent) countTurns(run, sequence);
    if (status === "working") markWorking(current.tree, run);
    else if (status === "blocked") this.notifyBlocked(run);
    else await this.checkStopped(current, run, status, sequence);
  }

  private enterParked(tree: Tree, run: Run, note: Note): void {
    run.parked = {
      since: new Date().toISOString(),
      hash: note.hash,
      note: note.title,
    };
    tree.park(run, "parked");
    this.deliver(parkedMessage(run, note.title), {
      id: run.id,
      status: "parked",
    });
  }

  private raise(root: string, tree: Tree, run: Run, inquiry: Note): void {
    closeInquiry(run, "replaced");
    const number = (run.asked ?? 0) + 1;
    const since = new Date().toISOString();
    run.asked = number;
    run.ask = { number, hash: inquiry.hash, since, title: inquiry.title };
    logInquiry(run, `## #${number} asked ${since}`, inquiry.text);
    tree.park(run, "asking");
    const parentInquiry = this.place.parent
      ? inquiryPath(path.join(root, "runs", this.place.parent))
      : undefined;
    this.deliver(
      askMessage(run, inquiry.text, number, this.config, parentInquiry),
      { id: run.id, status: "asking", ask: number },
    );
  }

  private async refresh(current: Session): Promise<void> {
    const running = current.registry.runs.filter(
      (run) => run.status === "running",
    );
    if (running.length === 0) return;
    const listing = await current.herdr.list().catch(() => undefined);
    if (!listing) return;
    this.live = { agents: listing, listedAt: Date.now() };
    for (const run of running) {
      if (run.status !== "running") continue;
      const agent = listing.get(run.agent);
      if (agent) observe(run, agent);
      await this.check(current, run, agent).catch(() => {});
    }
  }

  private async expire(current: Session): Promise<void> {
    const now = Date.now();
    for (const run of current.registry.runs) {
      const lapse = run.status === "running" && deadlineLapse(run, now);
      if (lapse) await this.stop(current, run, lapse);
    }
  }

  private async startQueued(current: Session): Promise<void> {
    for (const run of current.registry.runs) {
      if (run.status === "queued" && current.tree.acquire(run))
        await this.start(current, run);
    }
  }

  private async resumePending(current: Session): Promise<void> {
    for (const run of current.registry.runs) {
      const { pending } = run;
      if (run.status !== "running" || pending === undefined) continue;
      if (!current.tree.unpark(run)) continue;
      const outcome = await this.promptRun(run, pending);
      if (outcome !== "sent") continue;
      clearParked(run);
      dequeue(run, pending);
    }
  }

  private notifyGroups({ root, registry }: Session): void {
    for (const group of registry.groups) {
      const members = settled(registry, group);
      if (!members) continue;
      group.notified = new Date().toISOString();
      const awaited = group.awaited !== undefined;
      const message = awaited
        ? groupMessage(group.name, members, this.config)
        : groupReminder(group.name, members);
      this.deliver(message, {
        group: group.name,
        status: awaited ? "group" : "unawaited",
      });
      saveRegistry(root, registry);
    }
  }

  private async deliverFinished(current: Session): Promise<void> {
    const { root, registry, herdr, tree } = current;
    for (const run of registry.runs) {
      if (isActive(run) || run.delivered) continue;
      tree.renew();
      await snapshotTranscript(run);
      if (!run.group)
        this.deliver(
          resultMessage(run, readDeliverable(run) ?? "", this.config),
          { id: run.id, status: run.status, result: deliverablePath(run) },
        );
      run.delivered = true;
      saveRegistry(root, registry);
      if (run.status === "done" && run.tab) await herdr.closeTab(run.tab);
    }
    this.notifyGroups(current);
  }

  private async tick(current: Session): Promise<void> {
    await this.refresh(current);
    await this.expire(current);
    await this.startQueued(current);
    await this.resumePending(current);
    saveRegistry(current.root, current.registry);
    await this.deliverFinished(current);
  }

  private publish(): void {
    const current = this.session;
    this.view = current
      ? snapshot(
          current.root,
          current.registry.runs,
          current.tree.state(),
          this.live,
          this.config,
        )
      : emptyView(this.config);
    this.changed(this.view);
  }

  private async cycle(): Promise<void> {
    const current = this.session;
    if (!current) return;
    current.tree.beat(current.registry.runs);
    const { runs, groups } = current.registry;
    const attention =
      runs.some((run) => isActive(run) || !run.delivered) ||
      groups.some(
        (group) => isPending(group) || settled(current.registry, group),
      );
    if (attention) current.tree.renew();
    if (this.busy || !attention) return;
    this.busy = true;
    try {
      await this.tick(current);
    } catch (error) {
      console.error("crew: tick failed", error);
    } finally {
      this.busy = false;
      this.schedule();
      if (this.session === current) this.publish();
    }
  }

  private activate(): void {
    this.schedule();
    this.publish();
    this.poll();
  }

  open(root: string, sessionId: string, herdr: Herdr): void {
    const tree = new Tree(root, sessionId, this.place, this.config);
    const registry = loadRegistry(root, sessionId);
    this.session = { root, registry, herdr, tree };
    this.activate();
  }

  close(): void {
    this.stopTimer();
    if (this.session) {
      for (const run of this.session.registry.runs)
        if (isActive(run)) this.session.tree.release(run);
    }
    this.session = undefined;
    this.publish();
  }

  poll(): void {
    void this.cycle();
  }

  private async originSession(source: Run, mode: SessionMode): Promise<string> {
    if (mode === "resume" && isActive(source))
      throw new Error(continueActive(source.name));
    const session = source.agentSession?.value;
    if (!session || !(await locateSession(source)))
      throw new Error(noSession(source.name, mode));
    const taken = mode === "resume" ? this.continuedBy(session) : undefined;
    if (taken) throw new Error(continueTaken(source.name, taken.id));
    return session;
  }

  private async lineage(
    fork?: string,
    resume?: string,
  ): Promise<Lineage | undefined> {
    if (fork && resume) throw new Error(BOTH_ORIGINS);
    const key = fork || resume;
    if (!key) return undefined;
    const mode = fork ? "fork" : "resume";
    const source = this.find(key);
    if (!source) throw new Error(fill(this.config.text.noMatch, { key }));
    const session = await this.originSession(source, mode);
    return { source, origin: { mode, run: source.id, session } };
  }

  private continuedBy(session: string): Run | undefined {
    return continuing(this.requireSession().registry, session);
  }

  private choose(
    lineage: Lineage | undefined,
    model?: string,
    effort?: string,
  ): Choice {
    const { modelIndex, defaultModel } = this.config;
    if (lineage?.origin.mode === "resume")
      return keptChoice(lineage.source, modelIndex, model, effort);
    const source = lineage?.source;
    const key = model || source?.model || defaultModel;
    return freshChoice(modelIndex, key, source, effort);
  }

  private async prepare(
    submission: Submission,
  ): Promise<{ lineage?: Lineage; chosen: Choice }> {
    const { model, effort, fork, resume, deadline, maxTurns } = submission;
    this.requireSession();
    checkLimits(deadline, maxTurns);
    if (submission.base && !submission.worktree)
      throw new Error(BASE_NEEDS_WORKTREE);
    const lineage = await this.lineage(fork, resume);
    return { lineage, chosen: this.choose(lineage, model, effort) };
  }

  private draft(
    { name, cwd, group, deadline, maxTurns }: Submission,
    lineage: Lineage | undefined,
    chosen: Choice,
  ): Run {
    const { root, registry } = this.requireSession();
    if (group) checkGroup(registry, group);
    const inherited = cwd ? undefined : inheritedCwd(lineage);
    return createRun(root, {
      name: name || lineage?.source.name || "crew",
      model: chosen.model,
      effort: chosen.effort,
      cwd: cwd || inherited || process.cwd(),
      origin: lineage?.origin,
      deadline,
      maxTurns,
    });
  }

  private engage(run: Run, task: string): void {
    const canDelegate = this.place.depth + 1 < this.config.maxDepth;
    writeEngagement(run, task, canDelegate, this.config.extraRules);
  }

  private enlist(run: Run, task: string, group?: string): void {
    const { root, registry } = this.requireSession();
    const groups = registry.groups.map((entry) => ({ ...entry }));
    try {
      if (group) joinGroup(registry, run, group);
      this.engage(run, task);
      registry.runs.push(run);
      saveRegistry(root, registry);
    } catch (error) {
      restoreGroups(registry, groups);
      forget(registry, run);
      throw error;
    }
  }

  async submit(submission: Submission): Promise<{
    run: Run;
    queued: boolean;
  }> {
    const { task, group, worktree, base } = submission;
    const { lineage, chosen } = await this.prepare(submission);
    const { root, tree } = this.requireSession();
    const run = this.draft(submission, lineage, chosen);
    ensureRoot(root);
    if (worktree) await isolate(root, run, worktree, base);
    try {
      this.enlist(run, task, group);
    } catch (error) {
      await discard(run);
      throw error;
    }
    const queued = tree.waiting(run);
    this.activate();
    return { run, queued };
  }

  find(key: string): Run | undefined {
    const found =
      this.session?.registry.runs.filter((run) => matches(run, key)) ?? [];
    return found.length === 1 ? found[0] : undefined;
  }

  locate(key: string): Row | undefined {
    const run = this.find(key);
    if (run)
      return (
        this.view.rows.find((row) => row.id === run.id) ??
        rowOf(run, [], this.live)
      );
    const nested = this.view.rows.filter(
      (row) => row.level > 0 && matches(row, key),
    );
    return nested.length === 1 ? nested[0] : undefined;
  }

  private async stop(
    current: Session,
    run: Run,
    reason: string,
  ): Promise<Cancellation> {
    const { root, registry, herdr, tree } = current;
    if (!isActive(run)) return { outcome: "inactive", stranded: [] };
    finish(tree, run, "cancelled", reason);
    saveRegistry(root, registry);
    this.publish();
    const stranded = await this.cancelDescendants(current, run);
    if (run.tab && !(await herdr.closeTab(run.tab))) stranded.push(run.tab);
    if (stranded.length === 0) return { outcome: "killed", stranded };
    strand(run, stranded);
    saveRegistry(root, registry);
    return { outcome: "stranded", stranded };
  }

  kill(run: Run, reason: string): Promise<Cancellation> {
    return this.stop(this.requireSession(), run, reason);
  }

  async tail(row: Row, lines: number): Promise<string> {
    const { herdr } = this.requireSession();
    if (row.agent) {
      const output = await herdr.read(row.agent, lines).catch(() => "");
      if (output.trim()) return output;
    }
    for (const name of ["trace.md", "deliverable.md"]) {
      try {
        return fs.readFileSync(readablePath(row.dir, name), "utf8");
      } catch {}
    }
    return "";
  }

  focus(row: Row): Promise<boolean> {
    return this.requireSession().herdr.focus(row.agent, row.tab);
  }

  private async promptRun(run: Run, message: string): Promise<PromptOutcome> {
    const { herdr } = this.requireSession();
    const { status, sequence } = await herdr.state(run.agent);
    if (status === "blocked") return "blocked";
    if (status === "gone" || run.status !== "running") return "inactive";
    const { sawWorking, baseSeq } = run;
    run.sawWorking = false;
    run.baseSeq = sequence;
    try {
      await herdr.prompt(run.agent, message);
    } catch (error) {
      run.sawWorking = sawWorking;
      run.baseSeq = baseSeq;
      if (isHerdrError(error, "agent_blocked")) return "blocked";
      throw error;
    }
    return "sent";
  }

  private async promptParked(
    tree: Tree,
    run: Run,
    prompt: string,
    reason: ParkReason | undefined,
  ): Promise<PromptOutcome> {
    const outcome = await this.promptRun(run, prompt).catch(
      (error: unknown) => {
        if (reason) tree.park(run, reason);
        throw error;
      },
    );
    if (outcome !== "sent" && reason) tree.park(run, reason);
    return outcome;
  }

  private async relayPrompt(
    tree: Tree,
    run: Run,
    prompt: string,
  ): Promise<PromptOutcome | "queued"> {
    const reason = tree.parkedReason(run);
    if (run.pending !== undefined || (reason && !tree.unpark(run))) {
      queue(run, prompt);
      return "queued";
    }
    return this.promptParked(tree, run, prompt, reason);
  }

  async steer(row: Row, message: string, who: string): Promise<SteerOutcome> {
    const { root, registry, tree } = this.requireSession();
    const run = ownRunning(registry, row);
    if (typeof run === "string") return run;
    const prompt = steerPrompt(who, message, run.parked !== undefined);
    const outcome = await this.relayPrompt(tree, run, prompt);
    if (outcome === "sent") clearParked(run);
    else if (outcome !== "queued") return outcome;
    appendDirective(run, message);
    saveRegistry(root, registry);
    return outcome;
  }

  async answer(
    row: Row,
    text: string,
    who: string,
    question?: number,
  ): Promise<AnswerOutcome> {
    const { root, registry, tree } = this.requireSession();
    const run = ownRunning(registry, row);
    if (typeof run === "string") return run;
    const { ask } = run;
    if (!ask) return "none";
    if (question !== undefined && question !== ask.number) return "stale";
    const prompt = answerPrompt(ask.number, who, text);
    const outcome = await this.relayPrompt(tree, run, prompt);
    if (outcome !== "sent" && outcome !== "queued") return outcome;
    recordAnswer(run, ask, text, who);
    saveRegistry(root, registry);
    return outcome;
  }

  openQuestion(row: Row): number | undefined {
    const runs = this.session?.registry.runs ?? [];
    return runs.find((run) => run.id === row.id)?.ask?.number;
  }

  await(name: string): { outcome: AwaitOutcome; members: Run[] } {
    const { root, registry } = this.requireSession();
    const group = registry.groups.find((candidate) => candidate.name === name);
    const members = group ? groupMembers(registry, group) : [];
    if (!group || members.length === 0) return { outcome: "empty", members };
    const now = new Date().toISOString();
    const finished = !members.some(isActive);
    if (!group.awaited) group.awaited = now;
    if (finished && !group.notified) group.notified = now;
    saveRegistry(root, registry);
    this.poll();
    return { outcome: finished ? "finished" : "waiting", members };
  }

  private worktreeUsers(run: Run, directory: string): string[] {
    const { registry, tree } = this.requireSession();
    const session = run.agentSession?.value;
    const continued = session ? continuing(registry, session) : undefined;
    const inside = registry.runs.filter(
      (candidate) => isActive(candidate) && within(directory, candidate.cwd),
    );
    const users = new Map<string, string>();
    for (const user of [...inside, ...(continued ? [continued] : [])])
      users.set(user.id, user.name);
    for (const entry of tree.descendants(run)) users.set(entry.run, entry.name);
    return [...users].map(([id, name]) => `${name} (${id})`);
  }

  async removeWorktree(run: Run, force: boolean): Promise<WorktreeRemoval> {
    const { root, registry } = this.requireSession();
    const { worktree } = run;
    if (!registry.runs.includes(run) || !worktree)
      return { outcome: "none", users: [] };
    if (isActive(run)) return { outcome: "active", users: [] };
    const users = this.worktreeUsers(run, worktree.path);
    if (users.length > 0) return { outcome: "in-use", users };
    await removeWorktree(worktree, force);
    run.worktree = undefined;
    saveRegistry(root, registry);
    return { outcome: "removed", users };
  }

  runs(): Run[] {
    return this.session?.registry.runs ?? [];
  }

  groups(): Group[] {
    return this.session?.registry.groups ?? [];
  }

  tree(): TreeState | undefined {
    return this.session?.tree.state();
  }
}
