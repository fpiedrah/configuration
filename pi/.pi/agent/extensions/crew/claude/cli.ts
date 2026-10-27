import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { configNotice } from "../lib/notice.ts";
import {
  PARENT_SENDER,
  USER_SENDER,
  flagNeedsValue,
  statusReport,
  toolDescription,
} from "../lib/text.ts";
import {
  listSockets,
  request,
  socketDirectory,
  socketPath,
  socketSession,
} from "./channel.ts";
import type { Reply, Request } from "./channel.ts";
import { serve } from "./daemon.ts";
import {
  keep,
  postTool,
  preTool,
  sessionContext,
  sessionEnd,
  subagentStop,
  sweep,
} from "./hooks.ts";
import type { HookInput, Order } from "./hooks.ts";
import { CLI, ENTRY, claudeOf, crewOn, treeOf } from "./place.ts";
import type { Claude } from "./place.ts";

const START_TIMEOUT_MS = 3000;
const START_RETRY_MS = 100;
const DAEMON_VERBS = new Set(["await", "worktree-rm"]);
const RUN_VERBS = new Set(["answer", "steer", "kill", "tail", "await"]);
const TEXT_VERBS = new Set(["answer", "steer"]);
const SENDER_VERBS = new Set(["answer", "steer", "kill"]);
const MUTATING_VERBS = new Set(["answer", "steer", "kill", "worktree-rm"]);
const QUESTION_FLAG = "--question";
const DAEMON_FAILED = "crew: the crew daemon did not start";
const VALUE_FLAGS = [
  "--deadline",
  "--max-turns",
  "--max-steps",
  "--model",
  "--effort",
  "--cwd",
  "--fork",
  "--continue",
  "--group",
  "--worktree",
  "--base",
];

const USAGE = `usage: crew help | status | inbox
       crew spawn <name> [--model KEY] [--effort LEVEL] [--cwd DIR] [--fork RUN | --continue RUN]
                  [--deadline MINUTES] [--max-turns N] [--group NAME] [--worktree BRANCH [--base REF]] <<'EOF'
       <brief>
       EOF
       crew continue <run> [--model KEY] [--effort LEVEL] [--cwd DIR] [--deadline MINUTES] [--max-turns N] <<'EOF'
       <brief>
       EOF
       crew await <group> | worktree rm <run> [--force]
       crew answer <run> [--question N] <text> | steer <run> <text>
       crew kill <run> | tail <run> [lines]`;

const MAPPING = `In Claude Code the crew tool is the command ${CLI}:
- crew spawn <name> [--model KEY] [--effort LEVEL] [--cwd DIR], with the brief on stdin, is the crew tool call.
- --fork <run> starts the new run from a copy of that run's context (same harness); --continue <run>
  re-opens a finished run's context (same model and effort; cwd and name default to its own).
  crew continue <run> is shorthand for crew spawn <its name> --continue <run>.
- --deadline <minutes> and --max-turns <n> (alias --max-steps) are the deadline and maxTurns limits.
- --group <name> adds the run to a group: grouped runs send no individual results, so spawn every
  member, then crew await <group> and end your turn; one message arrives when the last finishes.
- --worktree <branch> [--base <ref>] runs the new run in its own git worktree on a new branch
  (editing runs on different branches may run in parallel); crew worktree rm <run> [--force] removes
  it after the run has finished and keeps the branch.
- crew_result and "crew asks" messages arrive on their own as messages in this session; run crew inbox if you expected one.
- crew_answer is: crew answer <run> [--question N] "<text>".
- crew_steer is: crew steer <run> "<text>".
- crew_kill is: crew kill <run>.
- crew_await is: crew await <group>.
- crew_worktree_remove is: crew worktree rm <run> [--force].
- crew status | kill <run> | tail <run> [lines] show and control your runs.
Task subagents count against the same cap; a denied subagent means do that part yourself.`;

type RunRequest = Request & { question?: number };

export interface Output {
  code: number;
  text: string;
}

function done(text: string, code = 0): Output {
  return { code, text };
}

function readStandardInput(): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => (text += chunk));
    process.stdin.on("end", () => resolve(text));
  });
}

function sessionOf(environment: NodeJS.ProcessEnv): string | undefined {
  return environment.CLAUDE_CODE_SESSION_ID || undefined;
}

function ownSocket(claude: Claude): string {
  return socketPath(claude.environment, claude.claudePid, claude.session);
}

function ask(socket: string, message: Request): Promise<Reply | undefined> {
  return request(socket, message).catch(() => undefined);
}

function launchDaemon(claude: Claude, socket: string): void {
  const directory = socketDirectory(claude.environment);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const log = fs.openSync(
    path.join(directory, `${path.basename(socket, ".sock")}.log`),
    "a",
  );
  const daemon = spawn(process.execPath, ["--no-warnings", ENTRY, "daemon"], {
    detached: true,
    stdio: ["ignore", "ignore", log],
  });
  daemon.unref();
  fs.closeSync(log);
}

async function waitForDaemon(socket: string): Promise<Reply | undefined> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, START_RETRY_MS));
    const reply = await ask(socket, { verb: "ping" });
    if (reply) return reply;
  }
  return undefined;
}

async function startDaemon(claude: Claude): Promise<Reply | undefined> {
  const socket = ownSocket(claude);
  const running = await ask(socket, { verb: "ping" });
  if (running) return running;
  launchDaemon(claude, socket);
  return waitForDaemon(socket);
}

function offText(claude: Claude): string {
  return (
    configNotice(claude.loaded)?.text ?? "crew: no crew config for this project"
  );
}

function help(claude: Claude): Output {
  if (!crewOn(claude.loaded)) return done(offText(claude), 1);
  const rules = toolDescription(claude.config, claude.place.depth);
  return done(`${rules}\n\n${MAPPING}\n\n${USAGE}`);
}

function option(words: string[], flag: string): string | undefined {
  const index = words.indexOf(flag);
  return index >= 0 ? words[index + 1] : undefined;
}

function valueless(words: string[]): string | undefined {
  return VALUE_FLAGS.find((flag) => {
    const index = words.indexOf(flag);
    const value = words[index + 1];
    return index >= 0 && (value === undefined || value.startsWith("--"));
  });
}

function numeric(words: string[], ...flags: string[]): number | undefined {
  const flag = flags.find((candidate) => words.includes(candidate));
  const value = flag ? option(words, flag) : undefined;
  return value === undefined ? undefined : Number(value);
}

function spawnRefusal(
  claude: Claude,
  verb: "spawn" | "continue",
): Output | undefined {
  const { environment, place, config } = claude;
  if (!crewOn(claude.loaded)) return done(offText(claude), 1);
  if (environment.HERDR_ENV !== "1" || !environment.HERDR_WORKSPACE_ID)
    return done("crew needs herdr: start Claude Code inside a herdr pane", 1);
  if (place.depth >= config.maxDepth)
    return done(
      `You are a leaf crew run (depth ${place.depth} of ${config.maxDepth}); do this work yourself.`,
      1,
    );
  if (process.stdin.isTTY)
    return done(`crew ${verb} reads the brief on stdin; use a heredoc`, 1);
  return undefined;
}

function spawnCwd(words: string[], resume: string | undefined) {
  const directory = option(words, "--cwd");
  if (directory) return path.resolve(directory);
  return resume ? undefined : process.cwd();
}

function spawnRequest(
  verb: "spawn" | "continue",
  words: string[],
  task: string,
): Request {
  const first = words[0];
  const resume = verb === "continue" ? first : option(words, "--continue");
  return {
    verb: "spawn",
    name: verb === "spawn" ? first : undefined,
    task,
    model: option(words, "--model"),
    effort: option(words, "--effort"),
    cwd: spawnCwd(words, resume),
    fork: option(words, "--fork"),
    resume,
    deadline: numeric(words, "--deadline"),
    maxTurns: numeric(words, "--max-turns", "--max-steps"),
    group: option(words, "--group"),
    worktree: option(words, "--worktree"),
    base: option(words, "--base"),
  };
}

function argumentError(words: string[]): Output | undefined {
  const first = words[0];
  if (!first || first.startsWith("--")) return done(USAGE, 1);
  const flag = valueless(words);
  return flag ? done(flagNeedsValue(flag), 1) : undefined;
}

async function spawnRun(
  claude: Claude,
  verb: "spawn" | "continue",
  words: string[],
): Promise<Output> {
  const refusal = argumentError(words) ?? spawnRefusal(claude, verb);
  if (refusal) return refusal;
  const task = (await readStandardInput()).trim();
  if (!task) return done(`crew ${verb}: the brief on stdin is empty`, 1);
  if (!(await startDaemon(claude))) return done(DAEMON_FAILED, 1);
  const reply = await ask(ownSocket(claude), spawnRequest(verb, words, task));
  if (!reply) return done("crew: the crew daemon did not answer", 1);
  return done(reply.text, reply.ok ? 0 : 1);
}

async function sessionStatus(claude: Claude): Promise<Output> {
  const reply = await ask(ownSocket(claude), { verb: "status" });
  if (reply) return done(reply.text);
  if (!crewOn(claude.loaded)) return done(offText(claude), 1);
  const report = statusReport([], treeOf(claude).state(), claude.config);
  return done(`${report}\nno runs from this session`);
}

async function shellStatus(environment: NodeJS.ProcessEnv): Promise<Output> {
  const sections: string[] = [];
  for (const socket of listSockets(environment)) {
    const reply = await ask(socket, { verb: "status" });
    if (reply) sections.push(`session ${socketSession(socket)}\n${reply.text}`);
  }
  if (sections.length === 0)
    return done("crew: no Claude Code crew daemons are running");
  return done(sections.join("\n\n"));
}

async function onRun(
  sockets: string[],
  message: Request,
): Promise<Output | undefined> {
  let missing: Reply | undefined;
  for (const socket of sockets) {
    const reply = await ask(socket, message);
    if (!reply) continue;
    if (!reply.missing) return done(reply.text, reply.ok ? 0 : 1);
    missing = reply;
  }
  return missing ? done(missing.text, 1) : undefined;
}

async function owners(sockets: string[], run: string): Promise<string[]> {
  const owning: string[] = [];
  for (const socket of sockets) {
    const reply = await ask(socket, { verb: "tail", run, lines: 1 });
    if (reply && !reply.missing) owning.push(socket);
  }
  return owning;
}

function ambiguous(verb: string, run: string, owning: string[]): Output {
  const sessions = owning.map((socket) => `  session ${socketSession(socket)}`);
  return done(
    [
      `crew: "${run}" matches runs in ${owning.length} Claude Code sessions:`,
      ...sessions,
      `Pass the full run id, or run crew ${verb} from the owning session.`,
    ].join("\n"),
    1,
  );
}

async function shellAmbiguity(
  claude: Claude | undefined,
  verb: string,
  run: string,
  sockets: string[],
): Promise<Output | undefined> {
  if (claude || !MUTATING_VERBS.has(verb) || sockets.length < 2)
    return undefined;
  const owning = await owners(sockets, run);
  return owning.length > 1 ? ambiguous(verb, run, owning) : undefined;
}

function addText(message: RunRequest, verb: string, words: string[]): boolean {
  const rest = words.slice(1);
  const asked = verb === "answer" && rest[0] === QUESTION_FLAG;
  message.text = (asked ? rest.slice(2) : rest).join(" ");
  if (asked) message.question = Number(rest[1]);
  const numbered = !asked || Number.isInteger(message.question);
  return numbered && message.text.trim() !== "";
}

function runRequest(
  verb: string,
  run: string,
  words: string[],
  claude: Claude | undefined,
): RunRequest | undefined {
  const message: RunRequest = { verb, run };
  if (TEXT_VERBS.has(verb) && !addText(message, verb, words)) return undefined;
  if (SENDER_VERBS.has(verb))
    message.who = claude ? PARENT_SENDER : USER_SENDER;
  if (verb === "tail" && words[1]) message.lines = Number(words[1]);
  if (verb === "worktree-rm") message.force = words.includes("--force");
  return message;
}

async function daemonDown(
  claude: Claude | undefined,
  verb: string,
): Promise<boolean> {
  if (!claude || !DAEMON_VERBS.has(verb) || !crewOn(claude.loaded))
    return false;
  return !(await startDaemon(claude));
}

async function runVerb(
  environment: NodeJS.ProcessEnv,
  claude: Claude | undefined,
  verb: string,
  words: string[],
): Promise<Output> {
  const run = words[0];
  const message = run ? runRequest(verb, run, words, claude) : undefined;
  if (!run || !message) return done(USAGE, 1);
  if (await daemonDown(claude, verb)) return done(DAEMON_FAILED, 1);
  const sockets = claude ? [ownSocket(claude)] : listSockets(environment);
  const refusal = await shellAmbiguity(claude, verb, run, sockets);
  if (refusal) return refusal;
  const output = await onRun(sockets, message);
  return output ?? done(`No single crew run matches "${run}"`, 1);
}

async function inbox(claude: Claude | undefined): Promise<Output> {
  if (!claude) return done("crew inbox runs inside a Claude Code session", 1);
  const reply = await ask(ownSocket(claude), { verb: "inbox" });
  return done(reply?.text ?? "crew inbox: empty");
}

async function readHookInput(): Promise<HookInput> {
  try {
    return JSON.parse(await readStandardInput()) as HookInput;
  } catch {
    return {};
  }
}

function hookReply(
  claude: Claude,
  event: string | undefined,
  input: HookInput,
): string | Promise<string> {
  if (event === "session") return sessionContext(claude);
  if (event === "pre") return preTool(claude, input);
  if (event === "post") postTool(claude, input);
  if (event === "subagent-stop") subagentStop(claude, input);
  if (event === "sweep") sweep(claude);
  if (event === "end") sessionEnd(claude);
  return "";
}

async function hook(
  environment: NodeJS.ProcessEnv,
  event: string | undefined,
): Promise<Output> {
  const input = await readHookInput();
  const session = input.session_id || sessionOf(environment);
  if (!session) return done("");
  const claude = claudeOf(environment, session);
  if (!crewOn(claude.loaded)) return done("");
  return done(await hookReply(claude, event, input));
}

async function sessionVerb(
  claude: Claude | undefined,
  verb: "daemon" | "spawn" | "continue",
  words: string[],
): Promise<Output | undefined> {
  if (!claude) return done(`crew ${verb} runs inside a Claude Code session`, 1);
  if (verb !== "daemon") return spawnRun(claude, verb, words);
  await serve(claude);
  return undefined;
}

type Verb = (
  environment: NodeJS.ProcessEnv,
  claude: Claude | undefined,
  words: string[],
) => Output | Promise<Output | undefined>;

const VERBS: Record<string, Verb> = {
  daemon: (_environment, claude, words) => sessionVerb(claude, "daemon", words),
  spawn: (_environment, claude, words) => sessionVerb(claude, "spawn", words),
  continue: (_environment, claude, words) =>
    sessionVerb(claude, "continue", words),
  status: (environment, claude) =>
    claude ? sessionStatus(claude) : shellStatus(environment),
  inbox: (_environment, claude) => inbox(claude),
  help: (environment, claude) => help(claude ?? claudeOf(environment, "shell")),
};

function dispatch(
  environment: NodeJS.ProcessEnv,
  claude: Claude | undefined,
  verb: string | undefined,
  words: string[],
): Output | Promise<Output | undefined> {
  if (verb === "worktree" && words[0] === "rm")
    return runVerb(environment, claude, "worktree-rm", words.slice(1));
  if (verb === undefined) return done(USAGE, 1);
  if (RUN_VERBS.has(verb)) return runVerb(environment, claude, verb, words);
  const handler = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
  return handler ? handler(environment, claude, words) : done(USAGE, 1);
}

export async function main(
  verb: string | undefined,
  words: string[],
  environment: NodeJS.ProcessEnv,
): Promise<Output | undefined> {
  if (verb === "hook") return hook(environment, words[0]);
  if (verb === "keep") {
    keep(JSON.parse(words[0] ?? "{}") as Order);
    return undefined;
  }
  const session = sessionOf(environment);
  const claude = session ? claudeOf(environment, session) : undefined;
  return dispatch(environment, claude, verb, words);
}
