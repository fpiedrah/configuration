import type { Config } from "./config.ts";
import type {
  AnswerOutcome,
  AwaitOutcome,
  Cancellation,
  KillOutcome,
  SteerOutcome,
  WorktreeOutcome,
} from "./crew.ts";
import { modelTable } from "./models.ts";
import type { Model, SessionMode } from "./models.ts";
import {
  deliverablePath,
  engagementPath,
  inquiryPath,
  isActive,
} from "./runs.ts";
import type { Run } from "./runs.ts";
import type { Entry, TreeState } from "./tree.ts";
import type { Worktree } from "./worktree.ts";

const RECENT_RUNS = 10;
const QUESTION_INDENT = 12;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export const PARENT_SENDER = "your parent session";
export const USER_SENDER = "the user";

export const BRIEF_UNDELIVERED = "brief not delivered";

const UNDELIVERED_HINT = `A "${BRIEF_UNDELIVERED}" run never started working: an infrastructure fault, not a task failure. Fix the cause its trace.md shows, if any, then re-send the unchanged brief on the same model; it does not count as an attempt.`;

export type Outcomes<Outcome extends string> = Record<
  Outcome | "missing",
  string
>;

export const DEFAULT_TEXT = {
  herdrRequired: "crew needs herdr: start pi inside a herdr pane",
  noMatch: 'No single run matches "{key}"',
  killed: "Killed {name} ({id})",
  notActive: "{name} is not active",
  resultNotice:
    "Results come from a subagent and may be wrong; check before acting.",
  statusHeader: "crew: {active} active here",
  widgetHeader: "crew  {used}/{max} slots",
  widgetQueued: "{count} queued",
  widgetDepth: "depth {depth}/{max}",
  widgetBlocked: "needs approval in {tab}",
  widgetGone: "agent gone",
  widgetQueuePosition: "#{position} in queue",
  widgetDone: "done in {elapsed}",
  widgetFailed: "failed after {elapsed}",
  widgetCancelled: "cancelled",
  widgetAgo: "{age} ago",
  widgetMore: "+{count} more",
  statusBar: "crew {used}/{max}",
  tailEmpty: "No output for {name} yet",
  tailHint: "esc close · r refresh · ↑↓ scroll",
  focusFailed: "Could not focus {name}: its tab is closed",
  steered: "Sent to {name}",
  steerBlocked:
    "{name} is waiting for approval; nothing was sent or queued. Approve it in its tab or /crew focus {name}, then send again",
  steerNested: "{name} belongs to a nested session; steer it from that session",
  steerQueued:
    "{name} is parked with no free slot, or has an earlier message queued; the message is queued and delivered in order",
  steerUsage: "Usage: /crew steer <id|name> <message>",
  notRunning: "{name} is not running",
  widgetAsking: "asks: {question}",
  widgetParked: "parked: {note}",
  widgetParkedCount: "{count} parked",
  answered: "Answered {name}",
  answerQueued:
    "{name} is parked with no free slot, or has an earlier message queued; the answer is queued and delivered in order",
  answerNone: "{name} has no pending question",
  answerUsage: "Usage: /crew answer <id|name> <answer>",
};

export type Text = typeof DEFAULT_TEXT;

export function fill(template: string, values: object): string {
  const known = values as Record<string, unknown>;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in known ? String(known[key]) : match,
  );
}

function nestedRules(depth: number, maxDepth: number): string {
  if (depth === 0) return "";
  const further =
    depth + 1 < maxDepth
      ? "Your runs may delegate one level further."
      : "Your runs cannot delegate further.";
  return `
- You are a nested crew run at depth ${depth} (the root session is depth 0; depth ${maxDepth} cannot
  delegate). Delegate only parts that need it.
  ${further}
- After delegating, end your turn. Write your own deliverable.md only after every crew_result (or crew group message) arrives.
- Answer your runs' questions only when your brief decides them; otherwise ask your parent through
  your own inquiry.md.`;
}

export function toolDescription(
  { maxConcurrent, maxDepth, defaultModel, models }: Config,
  depth: number,
): string {
  return `Delegate a self-contained task to a model running in its own herdr tab.
Returns at once. The result arrives later as a crew_result message that starts a new turn.

Models (the harness follows the model):
${modelTable(models)}

Use ${defaultModel} unless another model is needed or the user asks. The user's choice overrides.
Raise effort before changing model. Use max effort only when asked.

Rules:
- Do not poll, sleep, wait, or read the tab to check progress. Do not guess results.
  If you have nothing else to do, end your turn.
- The child starts with no context. The brief must give the goal, inputs, expected output, and limits.
- Editing tasks in the same repo run one at a time, unless each runs in its own worktree
  (worktree param / --worktree): runs on different branches may edit in parallel. Otherwise
  spawn the next only after the previous result arrives, and base its brief on that result.
  Read-only tasks (recon, review, research) can run in parallel.
- A worktree starts from a commit (base defaults to HEAD); uncommitted changes are not in it, so commit first and have workers commit.
- group joins runs: spawn every member with the same group, then call crew_await with that
  group and end your turn. One crew message arrives when the last member finishes, listing each
  status and deliverable path. Grouped runs send no individual results, so always await every
  group you spawn into.
- Do not edit files a running crew task is editing.
- A run may pause with a question (a "crew asks" message). Show it to the user and reply with
  crew_answer using their words. Answer it yourself only if the user already told you how.
  If a run is blocked on approval, show the user what it asks. Never answer approvals.
- A run told to stay available parks (a "crew parked" message) and holds no slot. Give it the next
  job with crew_steer; end it with crew_kill (Claude: crew kill).
- fork starts a new run from a copy of another run's context (same harness); continue re-opens a
  finished run's context with a new brief (same model). Pass the run's id or name; the new brief
  replaces the old task. deadline (minutes of wall-clock time from the start, parked time
  included) and maxTurns cancel a run that overruns. Every completed turn counts toward maxTurns,
  including turns started by answers, steers and child results.
- A deadline on a run that delegates cancels its whole subtree when it lapses.
- ${UNDELIVERED_HINT}
- At most ${maxConcurrent} runs at once across the whole crew tree (parent sessions, siblings, and
  nested runs); extra runs queue.${nestedRules(depth, maxDepth)}`;
}

function age(from?: string, to?: string): string {
  if (!from) return "-";
  const end = to ? Date.parse(to) : Date.now();
  const seconds = Math.round(
    (end - Date.parse(from)) / MILLISECONDS_PER_SECOND,
  );
  return seconds < SECONDS_PER_MINUTE
    ? `${seconds}s`
    : `${Math.round(seconds / SECONDS_PER_MINUTE)}m`;
}

function usage({ cost, modelName }: Run): string {
  return [cost, modelName].filter((part) => part).join(" on ");
}

export function duration(milliseconds: number): string {
  const seconds = Math.max(
    0,
    Math.round(milliseconds / MILLISECONDS_PER_SECOND),
  );
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR)
    return `${minutes}m${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}s`;
  return `${Math.floor(minutes / MINUTES_PER_HOUR)}h${String(minutes % MINUTES_PER_HOUR).padStart(2, "0")}m`;
}

export function briefPrompt(run: Run): string {
  return `Read your brief at ${engagementPath(run)} and do it.`;
}

export function originPrompt(
  run: Run,
  origin: NonNullable<Run["origin"]>,
): string {
  const source = origin.mode === "fork" ? "copied" : "continued";
  return `The context above is ${source} from run ${origin.run}. Its old task is over: the new brief replaces it. Read your new brief at ${engagementPath(run)} and do it.`;
}

function worktreeLine({ path, branch }: Worktree): string {
  return `Worktree: ${path} (branch ${branch})`;
}

export function startedMessage(
  run: Run,
  queued: boolean,
  maxConcurrent: number,
): string {
  const where = queued
    ? `Queued (the crew tree is at its cap of ${maxConcurrent} runs)`
    : "Starting";
  const { origin } = run;
  const lineage = origin
    ? `, ${origin.mode === "fork" ? "forked from" : "continuing"} ${origin.run}`
    : "";
  const arrival = run.group
    ? `Its result arrives only in the message for group ${run.group}: spawn the other members, then call crew_await for ${run.group}.`
    : "The result arrives automatically as a crew_result message.";
  const place = run.worktree ? `\n${worktreeLine(run.worktree)}\n` : " ";
  return (
    `${where}: crew run ${run.id}, ${run.name} on ${run.model} (${run.effort})${lineage} in a herdr tab.${place}` +
    `${arrival} End your turn unless you have other independent work.`
  );
}

function resultHeader(run: Run): string {
  const spent = usage(run);
  return `crew ${run.status}: ${run.name} (${run.model}, run ${run.id}, ${age(run.started, run.ended)}${spent && `, ${spent}`})`;
}

function deliverableLines(
  result: string,
  file: string,
  previewChars: number,
): string[] {
  const preview =
    result.length <= previewChars
      ? result
      : `${result.slice(0, previewChars)}\n\n…[truncated, read ${file} for the rest]`;
  return [`Deliverable: ${file}`, "", preview];
}

export function resultMessage(
  run: Run,
  result: string,
  { previewChars, text }: Config,
): string {
  const lines = [resultHeader(run)];
  if (run.error) lines.push(`Error: ${run.error}`);
  if (run.worktree) lines.push(worktreeLine(run.worktree));
  if (result)
    lines.push(...deliverableLines(result, deliverablePath(run), previewChars));
  if (run.status === "failed" && run.tab)
    lines.push("", `The tab ${run.tab} is still open for inspection.`);
  if (undelivered(run)) lines.push("", UNDELIVERED_HINT);
  if (text.resultNotice) lines.push("", text.resultNotice);
  return lines.join("\n");
}

export function blockedMessage(run: Run): string {
  return (
    `crew blocked: ${run.name} (run ${run.id}) is waiting for approval in herdr tab ${run.tab}. ` +
    "Tell the user what it asks. Never answer approvals yourself."
  );
}

export const ANSWER_DESCRIPTION = `Reply to a crew run that paused with a question (a "crew asks" message).
The answer becomes the run's next message and the run resumes. Only a run with a pending
question accepts an answer; this tool cannot steer runs or answer permission approvals.
Pass question, the number from the crew asks message: if the run now asks another question,
the answer is refused instead of being applied to it.
By default a human answers: show the user the question and send their reply in their words.
Answer on your own only if the user already told you how to answer questions like it; in a
nested session, only if your own brief decides it, otherwise ask your parent through your own
inquiry.md and pass its answer down.`;

export function askMessage(
  run: Run,
  question: string,
  number: number,
  { previewChars }: Config,
  parentInquiry: string | undefined,
): string {
  const file = inquiryPath(run.dir);
  const preview =
    question.length <= previewChars
      ? question.trimEnd()
      : `${question.slice(0, previewChars)}\n\n…[truncated]`;
  const ending = parentInquiry
    ? [
        `Answer it with crew_answer (run ${run.id}, question ${number}) only if your own brief already decides it. Otherwise ask your parent`,
        `the same way: write the question (with this run's context) to ${parentInquiry} and end`,
        "your turn; pass the answer you get down with crew_answer.",
      ]
    : [
        "Show the user this question and wait for their reply, unless the user already told you how to",
        `answer questions like it. Then send the answer with crew_answer (run ${run.id}, question ${number}).`,
      ];
  return [
    `crew asks: ${run.name} (run ${run.id}) paused with question #${number}:`,
    "",
    preview,
    "",
    `Full question: ${file}`,
    ...ending,
    "This is a question, not a permission approval; never use it to approve anything.",
  ].join("\n");
}

export function answerPrompt(
  number: number,
  who: string,
  text: string,
): string {
  return `crew answer to your question #${number}, from ${who}:\n\n${text.trimEnd()}\n\nContinue your task from where you stopped.`;
}

export const STEER_DESCRIPTION = `Send a message to one of your running crew runs.
A parked run wakes with it; a working run gets it at its next turn boundary. Use it to give a
persistent run its next job or new information. It does not answer a question (use crew_answer)
and cannot answer permission approvals.`;

export function parkedMessage(run: Run, note: string): string {
  return [
    `crew parked: ${run.name} (run ${run.id}): ${note}`,
    `It holds no slot. Give it the next job with crew_steer (run ${run.id}); end it with crew_kill.`,
  ].join("\n");
}

export function steerPrompt(who: string, text: string, woken = false): string {
  const wake = woken
    ? "\n\nThis message wakes you from parked. Continue with it."
    : "";
  return `crew message from ${who}:\n\n${text.trimEnd()}${wake}`;
}

const NOT_RUNNING = "{name} is not running.";

const NO_SINGLE_RUN = 'No single crew run matches "{name}".';

export const STEER_RESULTS: Outcomes<SteerOutcome> = {
  sent: "Sent the message to {name}. A parked run wakes now; a working run reads it at its next turn boundary. Its result or next question arrives as a crew message. End your turn unless you have other independent work.",
  queued:
    "{name} is parked with no free slot, or an earlier message to it is still queued. The message is queued behind it and delivered in order once a slot frees; its result or next question arrives as a crew message.",
  blocked:
    "{name} is waiting for a permission approval in herdr tab {tab}. The message was NOT delivered and NOT queued. Tell the user about the approval; once it is resolved, send the message again with crew_steer. crew_steer cannot answer approvals.",
  nested: "{name} belongs to a nested session; only that session can steer it.",
  inactive: NOT_RUNNING,
  missing: NO_SINGLE_RUN,
};

export const ANSWER_RESULTS: Outcomes<AnswerOutcome> = {
  sent: "Sent the answer to {name}. It resumes now; its result or next question arrives as a crew message. End your turn unless you have other independent work.",
  queued:
    "{name} is parked with no free slot, or an earlier message to it is still queued. The answer is queued behind it and delivered in order once a slot frees; its result or next question arrives as a crew message.",
  none: "{name} has no pending question. crew_answer only replies to a crew asks message.",
  stale:
    "{name} no longer asks that question; its open question is #{question}. Nothing was sent. Read question #{question} in its crew asks message, then answer that one with question {question}.",
  blocked:
    "{name} is waiting for a permission approval in herdr tab {tab}. The answer was NOT delivered and NOT queued, and the question stays open. Tell the user about the approval; once it is resolved, send the answer again with crew_answer. crew_answer cannot answer approvals.",
  nested:
    "{name} belongs to a nested session; only that session can answer it.",
  inactive: NOT_RUNNING,
  missing: NO_SINGLE_RUN,
};

export function outcomeText<Outcome extends string>(
  results: Outcomes<Outcome>,
  outcome: Outcome | "missing",
  name: string,
  tab = "?",
  question: number | string = "?",
): string {
  return fill(results[outcome], { name, tab, question });
}

export const KILL_DESCRIPTION = `Cancel one of your active crew runs (queued, running, or parked).
Its tab and its nested runs' tabs close, and the run still reports back with a crew cancelled
message. Use it to end a parked run or stop work that is no longer needed.`;

export function killReason(who: string): string {
  return `killed by ${who}`;
}

export function undelivered(run: Run): boolean {
  return run.error?.includes(BRIEF_UNDELIVERED) ?? false;
}

export const STARTUP_EXITED = `${BRIEF_UNDELIVERED}: the agent exited during startup`;

export function startupBlocked(name: string, trace: string): string {
  return `${BRIEF_UNDELIVERED}: ${name} is waiting for approval during startup; last screen in ${trace}`;
}

export function startupStuck(
  name: string,
  milliseconds: number,
  trace: string,
): string {
  return `${BRIEF_UNDELIVERED}: ${name} never finished starting within ${duration(milliseconds)} (likely a startup dialog; is the herdr pi/claude integration installed?); last screen in ${trace}`;
}

export function undeliveredReason(milliseconds: number, trace: string): string {
  return `${BRIEF_UNDELIVERED}: agent idle ${duration(milliseconds)} after launch and never started working; last output in ${trace}`;
}

export function deadlineReason(minutes: number): string {
  return `deadline: ${minutes} minutes passed`;
}

export function turnsReason(turns: number): string {
  return `max turns: ${turns} reached`;
}

export const KILL_RESULTS: Outcomes<KillOutcome> = {
  killed:
    "Killed {name}. It still reports back with a crew cancelled message. End your turn unless you have other independent work.",
  stranded:
    "Killed {name}, but herdr tabs {tab} did not close, so agents in them may still be running. Tell the user to close them by hand. {name} still reports back with a crew cancelled message.",
  inactive: NOT_RUNNING,
  nested: "{name} belongs to a nested session; only that session can kill it.",
  missing: NO_SINGLE_RUN,
};

export function strandedReason(tabs: string[]): string {
  return `herdr tabs ${tabs.join(", ")} did not close; agents in them may still be running, close them by hand`;
}

export function killReply(
  { text }: Config,
  run: Run,
  { outcome, stranded }: Cancellation,
): string {
  if (outcome === "inactive") return fill(text.notActive, run);
  const killed = fill(text.killed, run);
  return outcome === "stranded"
    ? `${killed}, but ${strandedReason(stranded)}`
    : killed;
}

export const BOTH_ORIGINS = "Give fork or continue, not both";

export const DEADLINE_INVALID = "deadline must be a positive number of minutes";

export const TURNS_INVALID = "maxTurns must be a whole number of at least 1";

export function noSession(name: string, mode: SessionMode): string {
  const verb = mode === "fork" ? "fork" : "continue";
  return `Run ${name} has no recorded session to ${verb}`;
}

export function continueActive(name: string): string {
  return `${name} is still active; send it more work with crew_steer (Claude: crew steer), or continue it after it finishes`;
}

export function continueTaken(name: string, run: string): string {
  return `${name} is already being continued by run ${run}`;
}

export function continueMissing(name: string, cwd: string): string {
  return `The directory ${cwd} of ${name} no longer exists (its worktree may have been removed); give a cwd or worktree for the continued run`;
}

export function flagNeedsValue(flag: string): string {
  return `${flag} needs a value`;
}

export function continueFixed(
  name: string,
  field: string,
  value: string,
): string {
  return `A continued run keeps the ${field} of ${name} (${value}); leave ${field} out or match it`;
}

export function forkHarness(
  name: string,
  harness: string,
  model: Model,
): string {
  return `${name} runs on ${harness}; a fork keeps the harness, but ${model.key} runs on ${model.harness}. Pick a ${harness} model`;
}

function runLine(run: Run, status: string, elapsed: string): string {
  const group = run.group ? ` [${run.group}]` : "";
  return `  ${status.padEnd(9)} ${run.name}${group} (${run.model}) ${elapsed}  ${run.id}`;
}

function finishedLine(run: Run): string {
  const line = runLine(run, run.status, age(run.started, run.ended));
  const spent = usage(run);
  return spent ? `${line}  ${spent}` : line;
}

function entryLine(entry: Entry, status: string): string {
  return `  ${status.padEnd(9)} ${entry.name} (${entry.model}) depth ${entry.depth}  ${entry.run}`;
}

function activeLines(run: Run): string[] {
  const status = run.ask ? "asking" : run.parked ? "parked" : run.status;
  const lines = [`${runLine(run, status, age(run.started))}  ${run.tab ?? ""}`];
  const indent = " ".repeat(QUESTION_INDENT);
  if (run.ask) lines.push(`${indent}#${run.ask.number} ${run.ask.title}`);
  else if (run.parked) lines.push(`${indent}${run.parked.note}`);
  return lines;
}

function elsewhereLines(runs: Run[], tree: TreeState): string[] {
  const own = new Set(runs.map((run) => run.id));
  const elsewhere = (entry: Entry) => !own.has(entry.run);
  const lines = [
    ...tree.slots.filter(elsewhere).map((entry) => entryLine(entry, "running")),
    ...tree.parked
      .filter(elsewhere)
      .map((entry) => entryLine(entry, entry.reason ?? "parked")),
    ...tree.tickets
      .filter(elsewhere)
      .map((entry) => entryLine(entry, "queued")),
  ];
  return lines.length > 0 ? ["elsewhere in the tree:", ...lines] : [];
}

function treeLines(
  runs: Run[],
  tree: TreeState,
  maxConcurrent: number,
): string[] {
  return [
    `tree ${tree.id}: ${tree.slots.length}/${maxConcurrent} slots, ${tree.parked.length} parked, ${tree.tickets.length} queued`,
    ...elsewhereLines(runs, tree),
  ];
}

export function statusReport(
  runs: Run[],
  tree: TreeState | undefined,
  { maxConcurrent, text }: Config,
): string {
  const active = runs.filter(isActive);
  const recent = runs
    .filter((run) => !isActive(run))
    .slice(-RECENT_RUNS)
    .reverse();
  const lines = [fill(text.statusHeader, { active: active.length })];
  for (const run of active) lines.push(...activeLines(run));
  if (tree) lines.push(...treeLines(runs, tree, maxConcurrent));
  if (recent.length > 0) lines.push("recent:");
  for (const run of recent) lines.push(finishedLine(run));
  return lines.join("\n");
}

export const AWAIT_DESCRIPTION = `Wait for a group of crew runs and wake once when the last one finishes.
Spawn every member with the same group, then call this with that group and end your turn. One
crew message arrives when every member has finished, listing each run's status and deliverable
path; failed and cancelled members count as finished. Grouped runs send no individual results,
so always await every group you spawn into. An empty or finished group returns at once.
A parked member keeps the group open; steer it to finish or kill it.`;

export function groupAwaited(group: string): string {
  return `group ${group} is already awaited; use a new group name`;
}

export const BASE_NEEDS_WORKTREE =
  "base needs worktree: give a branch name too";

function groupCount(members: Run[], status: string): number {
  return members.filter((run) => run.status === status).length;
}

function groupCounts(members: Run[]): string {
  return ["done", "failed", "cancelled"]
    .map((status) => `${groupCount(members, status)} ${status}`)
    .join(", ");
}

function memberLine(run: Run): string {
  const error = run.error ? ` — ${run.error}` : "";
  return `- ${run.status} ${run.name} (${run.model}, run ${run.id}, ${age(run.started, run.ended)}): ${deliverablePath(run)}${error}`;
}

export function groupReminder(group: string, members: Run[]): string {
  return [
    `crew group ${group}: all ${members.length} runs finished (${groupCounts(members)}), but nobody awaited the group, so their results were not sent.`,
    ...members.map(memberLine),
    "",
    `Call crew_await for ${group} to collect the group result.`,
  ].join("\n");
}

export function groupMessage(
  group: string,
  members: Run[],
  { text }: Config,
): string {
  const lines = [
    `crew group ${group} finished: ${members.length} runs (${groupCounts(members)})`,
    ...members.map(memberLine),
  ];
  if (members.some(undelivered)) lines.push("", UNDELIVERED_HINT);
  if (text.resultNotice) lines.push("", text.resultNotice);
  return lines.join("\n");
}

export function awaitResult(
  outcome: AwaitOutcome,
  group: string,
  members: Run[],
  config: Config,
): string {
  const running = members.filter(isActive).length;
  const results = {
    empty: `no runs in group ${group}`,
    waiting: `Awaiting ${members.length} runs in group ${group} (${running} still running); one crew message arrives when the last finishes. End your turn.`,
    finished: groupMessage(group, members, config),
  };
  return results[outcome];
}

export const WORKTREE_DESCRIPTION = `Remove the git worktree of one of your finished crew runs (one spawned with a worktree).
The run must not be active: kill it first. It is refused while another active run or one of the
run's nested runs still works in it. Removal fails if the worktree has uncommitted changes
unless force is set. The branch is kept so you can merge or delete it.`;

const WORKTREE_RESULTS: Outcomes<WorktreeOutcome | "nested"> = {
  removed:
    "Removed the worktree of {name} ({path}). The branch {branch} is kept; merge or delete it.",
  active: "{name} is still active; kill it first, then remove its worktree.",
  "in-use":
    "The worktree of {name} ({path}) is still in use by {users}. Wait for them to finish or kill them first, then remove it; force does not override this.",
  none: "{name} has no worktree to remove.",
  nested:
    "{name} belongs to a nested session; only that session can remove its worktree.",
  missing: NO_SINGLE_RUN,
};

export function worktreeResult(
  outcome: WorktreeOutcome | "missing" | "nested",
  name: string,
  worktree?: Worktree,
  users: string[] = [],
): string {
  return fill(WORKTREE_RESULTS[outcome], {
    name,
    path: worktree?.path,
    branch: worktree?.branch,
    users: users.join(", "),
  });
}
