import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import type { Config } from "../lib/config.ts";
import { Crew } from "../lib/crew.ts";
import { Herdr } from "../lib/herdr.ts";
import { isActive, isPending, readDeliverable } from "../lib/runs.ts";
import type { Group } from "../lib/runs.ts";
import {
  ANSWER_RESULTS,
  PARENT_SENDER,
  STEER_RESULTS,
  awaitResult,
  fill,
  killReason,
  killReply,
  outcomeText,
  resultMessage,
  startedMessage,
  statusReport,
  worktreeResult,
} from "../lib/text.ts";
import type { Outcomes } from "../lib/text.ts";
import { isAlive } from "../lib/tree.ts";
import type { Row } from "../lib/view.ts";
import { encode, readLines, request, socketPath } from "./channel.ts";
import type { Reply, Request } from "./channel.ts";
import { CLI, IDLE_CONFIRMATIONS, isIdle, paneStatus } from "./place.ts";
import type { Claude } from "./place.ts";

const PUSH_CHARS = 2000;
const IDLE_EXIT_MS = 60_000;
const MESSAGE_SEPARATOR = "\n\n---\n\n";

interface AnswerRequest extends Request {
  question?: number;
}

type Handler = (daemon: Daemon, message: Request) => Reply | Promise<Reply>;

function missing(text: string): Reply {
  return { ok: false, missing: true, text };
}

const HANDLERS: Record<string, Handler> = {
  ping: () => ({ ok: true, text: "pong" }),
  spawn: (daemon, message) => daemon.spawn(message),
  status: (daemon) => daemon.status(),
  inbox: (daemon) => ({
    ok: true,
    text: daemon.takeInbox() || "crew inbox: empty",
  }),
  answer: (daemon, message) => daemon.answer(message),
  steer: (daemon, message) => daemon.steer(message),
  kill: (daemon, message) => daemon.kill(message),
  await: (daemon, message) => daemon.await(message),
  "worktree-rm": (daemon, message) => daemon.removeWorktree(message),
  tail: (daemon, message) => daemon.tail(message),
};

function removeEmpty(file: string): void {
  try {
    if (fs.statSync(file).size === 0) fs.rmSync(file);
  } catch {}
}

async function bind(server: net.Server, socket: string): Promise<boolean> {
  fs.mkdirSync(path.dirname(socket), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    const bound = await new Promise<boolean>((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(socket, () => resolve(true));
    });
    if (bound) return true;
    const alive = await request(socket, { verb: "ping" }).then(
      () => true,
      () => false,
    );
    if (alive) return false;
    fs.rmSync(socket, { force: true });
  }
  return false;
}

class Daemon {
  private readonly claude: Claude;
  private readonly config: Config;
  private readonly pushConfig: Config;
  private readonly crew: Crew;
  private readonly herdr: Herdr;
  private readonly pane: string | undefined;
  private readonly socket: string;
  private readonly server = net.createServer();
  private readonly inbox: string[] = [];
  private readonly waiters: net.Socket[] = [];
  private idleReadings = 0;
  private pushing = false;
  private lastBusy = Date.now();

  constructor(claude: Claude) {
    const { environment, config } = claude;
    this.claude = claude;
    this.config = config;
    this.pushConfig = {
      ...config,
      previewChars: Math.min(config.previewChars, PUSH_CHARS),
    };
    this.pane =
      environment.HERDR_ENV === "1" ? environment.HERDR_PANE_ID : undefined;
    this.herdr = new Herdr(
      environment.HERDR_WORKSPACE_ID ?? "",
      environment.PI_CREW_HERDR_BIN || "herdr",
    );
    this.socket = socketPath(environment, claude.claudePid, claude.session);
    this.crew = new Crew(
      (content, details) => this.receive(content, details),
      claude.place,
      config,
      () => {},
    );
  }

  async start(): Promise<void> {
    this.server.on("connection", (connection) => this.accept(connection));
    if (!(await bind(this.server, this.socket))) process.exit(0);
    this.crew.open(this.claude.root, this.claude.session, this.herdr);
    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGHUP", () => {});
    setInterval(() => void this.cycle(), this.config.pollMs);
  }

  private translate(message: string): string {
    return message
      .replaceAll("crew_answer", `${CLI} answer`)
      .replaceAll("crew_steer", `${CLI} steer`)
      .replaceAll("crew_kill", `${CLI} kill`)
      .replaceAll("crew_await", `${CLI} await`);
  }

  private receive(content: string, details: unknown): void {
    this.inbox.push(this.translate(this.shorten(content, details)));
    setImmediate(() => void this.cycle());
  }

  private shorten(content: string, details: unknown): string {
    const { id, result } = details as { id?: string; result?: string };
    if (!result) return content;
    const run = this.crew.runs().find((candidate) => candidate.id === id);
    if (!run) return content;
    return resultMessage(run, readDeliverable(run) ?? "", this.pushConfig);
  }

  takeInbox(): string {
    return this.inbox.splice(0, this.inbox.length).join(MESSAGE_SEPARATOR);
  }

  private shutdown(): void {
    this.crew.close();
    for (const waiter of this.waiters) waiter.destroy();
    this.server.close();
    fs.rmSync(this.socket, { force: true });
    removeEmpty(this.socket.replace(/\.sock$/, ".log"));
    process.exit(0);
  }

  private hasWork(): boolean {
    if (this.inbox.length > 0) return true;
    for (const run of this.crew.runs())
      if (isActive(run) || !run.delivered) return true;
    return this.crew.groups().some((group) => this.open(group));
  }

  private open(group: Group): boolean {
    if (isPending(group)) return true;
    return (
      group.notified === undefined &&
      this.crew
        .runs()
        .some((run) => run.group === group.name && run.round === group.round)
    );
  }

  private async paneIdle(pane: string): Promise<boolean> {
    const status = await paneStatus(this.herdr, pane);
    this.idleReadings = isIdle(status) ? this.idleReadings + 1 : 0;
    return this.idleReadings >= IDLE_CONFIRMATIONS;
  }

  private async pushThroughHerdr(): Promise<void> {
    const { pane, inbox } = this;
    if (!pane || !(await this.paneIdle(pane)) || inbox.length === 0) return;
    const count = inbox.length;
    try {
      await this.herdr.prompt(
        pane,
        inbox.slice(0, count).join(MESSAGE_SEPARATOR),
      );
      inbox.splice(0, count);
      this.idleReadings = 0;
    } catch {}
  }

  private async push(): Promise<void> {
    if (this.inbox.length === 0) {
      this.idleReadings = 0;
      return;
    }
    const waiter = this.waiters.pop();
    if (waiter) waiter.end(encode({ ok: true, text: this.takeInbox() }));
    else await this.pushThroughHerdr();
  }

  private async cycle(): Promise<void> {
    const { claudePid } = this.claude;
    if (claudePid && !isAlive(claudePid)) this.shutdown();
    if (this.hasWork()) this.lastBusy = Date.now();
    else if (Date.now() - this.lastBusy > IDLE_EXIT_MS) this.shutdown();
    if (this.pushing) return;
    this.pushing = true;
    try {
      await this.push();
    } finally {
      this.pushing = false;
    }
  }

  private addWaiter(connection: net.Socket): void {
    for (const waiter of this.waiters.splice(0, this.waiters.length))
      waiter.end();
    this.waiters.push(connection);
    connection.on("close", () => {
      const index = this.waiters.indexOf(connection);
      if (index >= 0) this.waiters.splice(index, 1);
    });
    void this.cycle();
  }

  private accept(connection: net.Socket): void {
    connection.on("error", () => {});
    readLines(connection, (line) => {
      let message: Request;
      try {
        message = JSON.parse(line) as Request;
      } catch {
        connection.end(encode({ ok: false, text: "crew: bad request" }));
        return;
      }
      if (message.verb === "wait") return this.addWaiter(connection);
      void this.handle(message).then((reply) => connection.end(encode(reply)));
    });
  }

  private async handle(message: Request): Promise<Reply> {
    const handler = Object.hasOwn(HANDLERS, message.verb)
      ? HANDLERS[message.verb]
      : undefined;
    if (!handler)
      return { ok: false, text: `crew: unknown request ${message.verb}` };
    try {
      return await handler(this, message);
    } catch (error) {
      return { ok: false, text: (error as Error).message };
    }
  }

  async spawn(message: Request): Promise<Reply> {
    const { run, queued } = await this.crew.submit({
      name: message.name,
      task: message.task ?? "",
      model: message.model,
      effort: message.effort,
      cwd: message.cwd,
      fork: message.fork,
      resume: message.resume,
      deadline: message.deadline,
      maxTurns: message.maxTurns,
      group: message.group,
      worktree: message.worktree,
      base: message.base,
    });
    this.lastBusy = Date.now();
    const text = startedMessage(run, queued, this.config.maxConcurrent);
    return { ok: true, text: this.translate(text) };
  }

  status(): Reply {
    const report = statusReport(
      this.crew.runs(),
      this.crew.tree(),
      this.config,
    );
    return { ok: true, text: `${report}\ninbox: ${this.inbox.length} pending` };
  }

  private noMatch(key: string): Reply {
    return missing(fill(this.config.text.noMatch, { key }));
  }

  private async relay<Outcome extends string>(
    message: Request,
    results: Outcomes<Outcome>,
    send: (row: Row, text: string, who: string) => Promise<Outcome>,
  ): Promise<Reply> {
    const key = message.run ?? "";
    const row = this.crew.locate(key);
    if (!row) return missing(outcomeText(results, "missing", key));
    const who = message.who ?? PARENT_SENDER;
    const outcome = await send(row, message.text ?? "", who);
    const open = this.crew.openQuestion(row);
    const text = outcomeText(results, outcome, row.name, row.tab, open);
    return { ok: outcome === "sent" || outcome === "queued", text };
  }

  answer(message: AnswerRequest): Promise<Reply> {
    const { question } = message;
    const number = typeof question === "number" ? question : undefined;
    return this.relay(message, ANSWER_RESULTS, (row, text, who) =>
      this.crew.answer(row, text, who, number),
    );
  }

  steer(message: Request): Promise<Reply> {
    return this.relay(message, STEER_RESULTS, (row, text, who) =>
      this.crew.steer(row, text, who),
    );
  }

  async kill(message: Request): Promise<Reply> {
    const key = message.run ?? "";
    const run = this.crew.find(key);
    if (!run) return this.noMatch(key);
    const who = message.who ?? PARENT_SENDER;
    const cancellation = await this.crew.kill(run, killReason(who));
    this.crew.poll();
    return {
      ok: cancellation.outcome !== "inactive",
      text: killReply(this.config, run, cancellation),
    };
  }

  await(message: Request): Reply {
    const group = message.run ?? "";
    const { outcome, members } = this.crew.await(group);
    const text = awaitResult(outcome, group, members, this.config);
    return outcome === "empty" ? missing(text) : { ok: true, text };
  }

  async removeWorktree(message: Request): Promise<Reply> {
    const key = message.run ?? "";
    const run = this.crew.find(key);
    if (!run) return this.noMatch(key);
    const { worktree } = run;
    const { outcome, users } = await this.crew.removeWorktree(
      run,
      message.force ?? false,
    );
    return {
      ok: outcome === "removed",
      text: worktreeResult(outcome, run.name, worktree, users),
    };
  }

  async tail(message: Request): Promise<Reply> {
    const { text, tailLines } = this.config;
    const key = message.run ?? "";
    const row = this.crew.locate(key);
    if (!row) return this.noMatch(key);
    const output = await this.crew.tail(row, message.lines ?? tailLines);
    return {
      ok: true,
      text: output.trim() ? output : fill(text.tailEmpty, row),
    };
  }
}

export function serve(claude: Claude): Promise<void> {
  return new Daemon(claude).start();
}
