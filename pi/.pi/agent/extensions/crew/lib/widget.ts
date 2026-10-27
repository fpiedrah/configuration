import type {
  ExtensionUIContext,
  Theme,
  ThemeColor,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import type { Config } from "./config.ts";
import { duration, fill } from "./text.ts";
import type { Text } from "./text.ts";
import { isFinished, lingers } from "./view.ts";
import type { Row, RowState, View } from "./view.ts";

const FRAME_MS = 250;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const NAME_WIDTH = 16;
const COMPACT_NAME_WIDTH = 12;
const MODEL_WIDTH = 6;
const MAX_INDENT = 2;
const ERROR_WIDTH = 50;
const COST_WIDTH = 70;
const DETAIL_WIDTH = 56;
const COMPACT_WIDTH = 40;

const GLYPHS: Record<RowState, string> = {
  running: "",
  blocked: "◐",
  asking: "◇",
  parked: "◌",
  gone: "?",
  queued: "◦",
  done: "✓",
  failed: "✗",
  cancelled: "■",
};

const GLYPH_COLORS: Record<RowState, ThemeColor> = {
  running: "accent",
  blocked: "warning",
  asking: "accent",
  parked: "muted",
  gone: "warning",
  queued: "muted",
  done: "success",
  failed: "error",
  cancelled: "dim",
};

const DETAIL_COLORS: Record<RowState, ThemeColor> = {
  running: "muted",
  blocked: "warning",
  asking: "accent",
  parked: "muted",
  gone: "warning",
  queued: "dim",
  done: "dim",
  failed: "error",
  cancelled: "dim",
};

const PRIORITY: Record<RowState, number> = {
  running: 0,
  blocked: 1,
  asking: 1,
  gone: 1,
  parked: 2,
  queued: 2,
  done: 3,
  failed: 3,
  cancelled: 3,
};

type Detail = (row: Row, text: Text, time: string) => string;

const DETAILS: Record<RowState, Detail> = {
  running: (row) => (row.activity ?? "").replace(/\s+/g, " ").trim(),
  blocked: (row, text) => fill(text.widgetBlocked, { tab: row.tab ?? "?" }),
  asking: (row, text) =>
    fill(text.widgetAsking, { question: row.question ?? "" }),
  parked: (row, text) => fill(text.widgetParked, { note: row.note ?? "" }),
  gone: (_row, text) => text.widgetGone,
  queued: (row, text) =>
    fill(text.widgetQueuePosition, { position: row.position ?? "?" }),
  done: (_row, text, time) => fill(text.widgetDone, { elapsed: time }),
  failed: (row, text, time) =>
    fill(text.widgetFailed, { elapsed: time }) +
    (row.error ? `: ${row.error.slice(0, ERROR_WIDTH)}` : ""),
  cancelled: (_row, text) => text.widgetCancelled,
};

interface Head {
  text: string;
  width: number;
}

function visibleRows(view: View, lingerMs: number, now: number): Row[] {
  return view.rows.filter((row) => lingers(row, lingerMs, now));
}

function statusLine(view: View, { text }: Config): string | undefined {
  const live = view.rows.filter((row) => !isFinished(row));
  if (live.length === 0) return undefined;
  const blocked = live.filter((row) => row.state === "blocked").length;
  const asking = live.filter((row) => row.state === "asking").length;
  let line = fill(text.statusBar, { used: view.used, max: view.maxConcurrent });
  if (view.queued > 0) line += ` ·${view.queued}q`;
  if (view.parked > 0) line += ` ·${view.parked}p`;
  if (asking > 0) line += ` ·${asking}?`;
  if (blocked > 0) line += ` ·${blocked}!`;
  return line;
}

function elapsed(row: Row, now: number): string | undefined {
  const since =
    row.state === "queued" ? row.created : (row.started ?? row.created);
  if (!since) return undefined;
  return duration(
    (row.ended ? Date.parse(row.ended) : now) - Date.parse(since),
  );
}

function detail(row: Row, { text }: Config, time: string): string {
  return DETAILS[row.state](row, text, time);
}

function headerParts(view: View, text: Text): string[] {
  const slots = { used: view.used, max: view.maxConcurrent };
  const parts = [fill(text.widgetHeader, slots)];
  if (view.queued > 0)
    parts.push(fill(text.widgetQueued, { count: view.queued }));
  if (view.parked > 0)
    parts.push(fill(text.widgetParkedCount, { count: view.parked }));
  if (view.deepest > 1)
    parts.push(
      fill(text.widgetDepth, { depth: view.deepest, max: view.maxDepth }),
    );
  return parts;
}

function header(
  view: View,
  rows: Row[],
  config: Config,
  theme: Theme,
  width: number,
): string {
  const glyph = rows.some((row) => !isFinished(row))
    ? theme.fg("accent", "●")
    : theme.fg("dim", "○");
  if (width < DETAIL_WIDTH) {
    const slots = { used: view.used, max: view.maxConcurrent };
    const line = statusLine(view, config) ?? fill(config.text.statusBar, slots);
    return `${glyph} ${line}`;
  }
  return `${glyph} ${headerParts(view, config.text).join(theme.fg("dim", " · "))}`;
}

function headOf(row: Row, theme: Theme, width: number, frame: number): Head {
  const indent =
    "  ".repeat(Math.min(row.level, MAX_INDENT) + 1) +
    (row.level > 0 ? "↳ " : "");
  const glyph =
    row.state === "running"
      ? SPINNER[frame % SPINNER.length]
      : GLYPHS[row.state];
  const name = truncateToWidth(
    row.name,
    width < COMPACT_WIDTH ? COMPACT_NAME_WIDTH : NAME_WIDTH,
    "…",
  );
  return {
    text: `${theme.fg("dim", indent)}${theme.fg(GLYPH_COLORS[row.state], glyph)} ${row.level === 0 ? theme.bold(name) : name}`,
    width: visibleWidth(`${indent}${glyph} ${name}`),
  };
}

function finishedAgo(row: Row, text: Text, now: number): string | undefined {
  if (!isFinished(row) || !row.ended) return undefined;
  return fill(text.widgetAgo, { age: duration(now - Date.parse(row.ended)) });
}

function trailing(
  row: Row,
  config: Config,
  theme: Theme,
  width: number,
  now: number,
): string[] {
  const time = elapsed(row, now);
  const parts: string[] = [];
  if (!isFinished(row) && time) parts.push(theme.fg("dim", time));
  const text = detail(row, config, time ?? "-");
  if (text && (row.state !== "running" || width >= DETAIL_WIDTH))
    parts.push(theme.fg(DETAIL_COLORS[row.state], text));
  const ago = finishedAgo(row, config.text, now);
  if (ago !== undefined) parts.push(theme.fg("dim", ago));
  return parts;
}

function withCost(
  left: string,
  cost: string,
  theme: Theme,
  width: number,
): string {
  const trimmed = truncateToWidth(left, width - visibleWidth(cost) - 2, "…");
  const gap = width - visibleWidth(trimmed) - visibleWidth(cost);
  return `${trimmed}${" ".repeat(gap)}${theme.fg("dim", cost)}`;
}

function compactLine(row: Row, head: Head, theme: Theme, now: number): string {
  const time = elapsed(row, now);
  return time ? `${head.text} ${theme.fg("dim", time)}` : head.text;
}

function rowLine(
  row: Row,
  head: Head,
  headWidth: number,
  config: Config,
  theme: Theme,
  width: number,
  now: number,
): string {
  if (width < COMPACT_WIDTH) return compactLine(row, head, theme, now);
  const parts = trailing(row, config, theme, width, now);
  const model =
    width >= DETAIL_WIDTH
      ? `  ${theme.fg("muted", row.model.padEnd(MODEL_WIDTH))}`
      : "";
  const columns = `${head.text}${" ".repeat(headWidth - head.width)}${model}`;
  const left =
    parts.length > 0
      ? `${columns}  ${parts.join(theme.fg("dim", " · "))}`
      : columns;
  if (width < COST_WIDTH || !row.cost) return left;
  return withCost(left, row.cost, theme, width);
}

function pick(rows: Row[], room: number): { shown: Row[]; hidden: number } {
  if (rows.length <= room) return { shown: rows, hidden: 0 };
  const keep = Math.max(0, room - 1);
  const ranked = [...rows]
    .sort((left, right) => PRIORITY[left.state] - PRIORITY[right.state])
    .slice(0, keep);
  return {
    shown: rows.filter((row) => ranked.includes(row)),
    hidden: rows.length - keep,
  };
}

function bodyLines(
  shown: Row[],
  config: Config,
  theme: Theme,
  width: number,
  now: number,
  frame: number,
): string[] {
  const heads = shown.map((row) => headOf(row, theme, width, frame));
  const headWidth = Math.max(0, ...heads.map((head) => head.width));
  return shown.map((row, index) =>
    rowLine(row, heads[index], headWidth, config, theme, width, now),
  );
}

function renderWidget(
  view: View,
  config: Config,
  theme: Theme,
  width: number,
  now: number,
  frame: number,
): string[] {
  const rows = visibleRows(view, config.lingerMs, now);
  if (rows.length === 0) return [];
  const { shown, hidden } = pick(rows, config.widgetLines - 1);
  const lines = [
    header(view, rows, config, theme, width),
    ...bodyLines(shown, config, theme, width, now, frame),
  ];
  if (hidden > 0)
    lines.push(
      theme.fg("dim", `  ${fill(config.text.widgetMore, { count: hidden })}`),
    );
  return lines
    .slice(0, config.widgetLines)
    .map((line) => truncateToWidth(line, width, "…"));
}

export class Widget {
  private readonly config: Config;
  private ui: ExtensionUIContext | undefined;
  private canDraw = false;
  private tui: TUI | undefined;
  private shown = false;
  private view: View | undefined;
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(config: Config) {
    this.config = config;
  }

  private hide(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.shown) this.ui?.setWidget("crew", undefined);
    this.shown = false;
    this.tui = undefined;
  }

  private visible(): boolean {
    const { view, config } = this;
    return (
      view !== undefined &&
      visibleRows(view, config.lingerMs, Date.now()).length > 0
    );
  }

  private mount(ui: ExtensionUIContext): void {
    this.shown = true;
    const placement =
      this.config.widget === "below" ? "belowEditor" : "aboveEditor";
    ui.setWidget(
      "crew",
      (next, theme) => {
        this.tui = next;
        return {
          render: (width: number) =>
            this.view
              ? renderWidget(
                  this.view,
                  this.config,
                  theme,
                  width,
                  Date.now(),
                  this.frame,
                )
              : [],
          invalidate() {},
        };
      },
      { placement },
    );
  }

  private animate(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.frame += 1;
      this.draw();
    }, FRAME_MS);
    this.timer.unref();
  }

  private draw(): void {
    const { ui } = this;
    if (!ui || !this.canDraw || !this.visible()) {
      this.hide();
      return;
    }
    if (this.shown) this.tui?.requestRender();
    else this.mount(ui);
    this.animate();
  }

  attach(next: ExtensionUIContext, interactive: boolean): void {
    this.ui = next;
    this.canDraw = interactive;
  }

  update(next: View): void {
    this.view = next;
    this.ui?.setStatus("crew", statusLine(next, this.config));
    this.draw();
  }

  dispose(): void {
    this.hide();
    this.ui = undefined;
    this.view = undefined;
  }
}

export function createWidget(config: Config): Widget {
  return new Widget(config);
}
