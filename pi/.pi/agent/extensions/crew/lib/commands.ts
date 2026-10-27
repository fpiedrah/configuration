import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { tilde, writeUserConfig } from "./config.ts";
import type { Config, Loaded } from "./config.ts";
import type { AnswerOutcome, Crew, SteerOutcome } from "./crew.ts";
import { configNotice, modelsReport } from "./notice.ts";
import type { Run } from "./runs.ts";
import {
  USER_SENDER,
  fill,
  killReason,
  killReply,
  statusReport,
  worktreeResult,
} from "./text.ts";
import type { Text } from "./text.ts";
import type { Row } from "./view.ts";

const TAIL_CHROME_LINES = 4;
const TAIL_HEIGHT_SHARE = 0.8;

interface Scope {
  crew: Crew;
  config: Config;
  context: ExtensionCommandContext;
}

type RowCommand = (scope: Scope, row: Row, input: string) => Promise<void>;

interface Relay<Outcome extends string> {
  usage: keyof Text;
  replies: Record<Outcome, keyof Text>;
  deliver(crew: Crew, row: Row, message: string): Promise<Outcome>;
}

const STEER_RELAY: Relay<SteerOutcome> = {
  usage: "steerUsage",
  replies: {
    sent: "steered",
    queued: "steerQueued",
    blocked: "steerBlocked",
    nested: "steerNested",
    inactive: "notRunning",
  },
  deliver: (crew, row, message) => crew.steer(row, message, USER_SENDER),
};

const ANSWER_RELAY: Relay<AnswerOutcome> = {
  usage: "answerUsage",
  replies: {
    sent: "answered",
    queued: "answerQueued",
    none: "answerNone",
    stale: "answerNone",
    blocked: "steerBlocked",
    nested: "steerNested",
    inactive: "notRunning",
  },
  deliver: (crew, row, message) => crew.answer(row, message, USER_SENDER),
};

class Scroll {
  private offset = 0;
  private height = 1;
  private count = 0;

  window(lines: string[], height: number): string[] {
    this.height = height;
    this.count = lines.length;
    this.offset = Math.min(this.offset, this.limit());
    const end = this.count - this.offset;
    return lines.slice(Math.max(0, end - this.height), end);
  }

  move(data: string): void {
    this.offset = nextScroll(data, this.offset, this.height, this.limit());
  }

  private limit(): number {
    return Math.max(0, this.count - this.height);
  }
}

function init(loaded: Loaded, context: ExtensionCommandContext): void {
  const file = tilde(loaded.userFile);
  try {
    writeUserConfig(loaded.userFile);
    context.ui.notify(
      `Wrote ${file}. Edit it if needed, then /reload.`,
      "info",
    );
  } catch (error) {
    const exists = (error as NodeJS.ErrnoException).code === "EEXIST";
    context.ui.notify(
      exists
        ? `${file} already exists; edit it, then /reload.`
        : `Could not write ${file}: ${(error as Error).message}`,
      exists ? "warning" : "error",
    );
  }
}

function handleSetup(
  verb: string | undefined,
  loaded: Loaded,
  context: ExtensionCommandContext,
): boolean {
  if (verb === "init") init(loaded, context);
  else if (verb === "models") context.ui.notify(modelsReport(loaded), "info");
  else return false;
  return true;
}

function outputLines(output: string, row: Row, config: Config): string[] {
  if (!output.trim()) return [fill(config.text.tailEmpty, row)];
  return output.replace(/\t/g, "    ").trimEnd().split("\n");
}

function nextScroll(
  data: string,
  scroll: number,
  page: number,
  limit: number,
): number {
  if (matchesKey(data, "up")) return Math.min(scroll + 1, limit);
  if (matchesKey(data, "down")) return Math.max(0, scroll - 1);
  if (matchesKey(data, "pageUp")) return Math.min(scroll + page, limit);
  if (matchesKey(data, "pageDown")) return Math.max(0, scroll - page);
  return scroll;
}

function tailFrame(
  row: Row,
  visible: string[],
  theme: Theme,
  width: number,
  hint: string,
): string[] {
  const rule = theme.fg("border", "─".repeat(width));
  const title = `${theme.fg("accent", theme.bold(row.name))}${theme.fg("dim", ` · ${row.state} · ${row.id}`)}`;
  const framed = [title, rule, ...visible, rule, theme.fg("dim", hint)];
  return framed.map((line) => truncateToWidth(line, width, "…", true));
}

function tailHeight(tui: TUI): number {
  const rows = Math.floor(tui.terminal.rows * TAIL_HEIGHT_SHARE);
  return Math.max(1, rows - TAIL_CHROME_LINES);
}

function tailView(
  { crew, config }: Scope,
  row: Row,
  first: string,
  tui: TUI,
  theme: Theme,
  done: () => void,
): Component & { dispose(): void } {
  let output = first;
  let reading = false;
  const scroll = new Scroll();

  async function refresh(): Promise<void> {
    if (reading) return;
    reading = true;
    output = await crew.tail(row, config.tailLines).catch(() => output);
    reading = false;
    tui.requestRender();
  }

  const timer = setInterval(() => void refresh(), config.pollMs);
  timer.unref();

  return {
    render(width: number): string[] {
      const lines = outputLines(output, row, config);
      const visible = scroll.window(lines, tailHeight(tui));
      return tailFrame(row, visible, theme, width, config.text.tailHint);
    },

    handleInput(data: string): void {
      if (matchesKey(data, "escape") || matchesKey(data, "q")) done();
      else if (matchesKey(data, "r")) void refresh();
      else scroll.move(data);
      tui.requestRender();
    },

    invalidate() {},

    dispose(): void {
      clearInterval(timer);
    },
  };
}

async function tail(scope: Scope, row: Row): Promise<void> {
  const { crew, config, context } = scope;
  const output = await crew.tail(row, config.tailLines);

  if (context.mode !== "tui") {
    context.ui.notify(outputLines(output, row, config).join("\n"), "info");
    return;
  }

  await context.ui.custom<void>(
    (tui, theme, _keybindings, done) =>
      tailView(scope, row, output, tui, theme, done),
    {
      overlay: true,
      overlayOptions: { width: "90%", maxHeight: "80%", anchor: "center" },
    },
  );
}

async function focus(
  { crew, config, context }: Scope,
  row: Row,
): Promise<void> {
  if (row.state === "queued")
    context.ui.notify(fill(config.text.notRunning, row), "warning");
  else if (!(await crew.focus(row)))
    context.ui.notify(fill(config.text.focusFailed, row), "warning");
}

async function send<Outcome extends string>(
  { crew, config, context }: Scope,
  row: Row,
  input: string,
  relay: Relay<Outcome>,
): Promise<void> {
  const { text } = config;
  const message = input.trim().replace(/^\S+\s+\S+\s*/, "");

  if (!message) {
    context.ui.notify(text[relay.usage], "warning");
    return;
  }

  try {
    const outcome = await relay.deliver(crew, row, message);
    context.ui.notify(
      fill(text[relay.replies[outcome]], row),
      outcome === "sent" ? "info" : "warning",
    );
  } catch (error) {
    context.ui.notify((error as Error).message, "error");
  }
}

function relayCommand<Outcome extends string>(
  relay: Relay<Outcome>,
): RowCommand {
  return (scope, row, input) => send(scope, row, input, relay);
}

const ROW_COMMANDS: Record<string, RowCommand> = {
  tail,
  focus,
  steer: relayCommand(STEER_RELAY),
  answer: relayCommand(ANSWER_RELAY),
};

function notifyNoMatch({ config, context }: Scope, key?: string): void {
  context.ui.notify(fill(config.text.noMatch, { key: key ?? "" }), "warning");
}

function findRun(scope: Scope, key?: string): Run | undefined {
  const run = key ? scope.crew.find(key) : undefined;
  if (!run) notifyNoMatch(scope, key);
  return run;
}

async function kill(scope: Scope, key?: string): Promise<void> {
  const { crew, config, context } = scope;
  const run = findRun(scope, key);
  if (!run) return;

  const cancellation = await crew.kill(run, killReason(USER_SENDER));
  const level = cancellation.outcome === "stranded" ? "warning" : "info";

  context.ui.notify(killReply(config, run, cancellation), level);
  crew.poll();
}

async function removeWorktree(
  scope: Scope,
  key?: string,
  flag?: string,
): Promise<void> {
  const { crew, context } = scope;
  const run = findRun(scope, key);
  if (!run) return;

  const { worktree } = run;

  try {
    const { outcome, users } = await crew.removeWorktree(
      run,
      flag === "--force",
    );
    context.ui.notify(
      worktreeResult(outcome, run.name, worktree, users),
      outcome === "removed" ? "info" : "warning",
    );
  } catch (error) {
    context.ui.notify((error as Error).message, "error");
  }
}

export function createIdleCommand(loaded: Loaded) {
  return async (
    input: string,
    context: ExtensionCommandContext,
  ): Promise<void> => {
    if (handleSetup(input.trim().split(/\s+/)[0], loaded, context)) return;

    const notice = configNotice(loaded);
    if (notice) context.ui.notify(notice.text, notice.level);
  };
}

async function runCommand(scope: Scope, input: string): Promise<void> {
  const { crew, config, context } = scope;
  const [verb, key, flag] = input.trim().split(/\s+/);

  if (verb === "kill") return kill(scope, key);
  if (verb === "worktree-rm") return removeWorktree(scope, key, flag);

  const command = Object.hasOwn(ROW_COMMANDS, verb)
    ? ROW_COMMANDS[verb]
    : undefined;

  if (!command) {
    context.ui.notify(statusReport(crew.runs(), crew.tree(), config), "info");
    return;
  }

  const row = key ? crew.locate(key) : undefined;
  if (!row) {
    notifyNoMatch(scope, key);
    return;
  }

  await command(scope, row, input);
}

export function createCommand(crew: Crew, loaded: Loaded) {
  const { config } = loaded;

  return async (
    input: string,
    context: ExtensionCommandContext,
  ): Promise<void> => {
    if (handleSetup(input.trim().split(/\s+/)[0], loaded, context)) return;
    if (!crew.ready) {
      context.ui.notify(config.text.herdrRequired, "warning");
      return;
    }

    await runCommand({ crew, config, context }, input);
  };
}
