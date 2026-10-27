import {
  EXAMPLE_FILE,
  PINNED,
  SCHEMA_FILE,
  hasErrors,
  tilde,
} from "./config.ts";
import type { Loaded, Problem } from "./config.ts";

export interface Notice {
  level: "error" | "warning";
  text: string;
}

function problemLines(problems: Problem[], level: Problem["level"]): string[] {
  return problems
    .filter((problem) => problem.level === level)
    .map((problem) => `  ${problem.message}`);
}

function missingLines(loaded: Loaded): string[] {
  const file = tilde(loaded.userFile);
  return [
    `crew: no config in ${file} or .pi/crew.json, so the crew tool is off.`,
    `Run /crew init to create ${file} from`,
    `  ${EXAMPLE_FILE}`,
    "then /reload.",
  ];
}

export function configNotice(loaded: Loaded): Notice | undefined {
  const errors = problemLines(loaded.problems, "error");
  const warnings = problemLines(loaded.problems, "warning");
  if (hasErrors(loaded)) {
    const text = [
      "crew: config errors, so the crew tool is off:",
      ...errors,
      ...(warnings.length > 0 ? ["warnings:", ...warnings] : []),
      "Fix them, then /reload.",
    ];
    return { level: "error", text: text.join("\n") };
  }
  const text = [
    ...(loaded.source === undefined ? missingLines(loaded) : []),
    ...(warnings.length > 0 ? ["crew: config warnings:", ...warnings] : []),
  ];
  return text.length > 0
    ? { level: "warning", text: text.join("\n") }
    : undefined;
}

function columns(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const row of rows)
    for (let index = 0; index < row.length - 1; index++)
      widths[index] = Math.max(widths[index] ?? 0, row[index].length);
  return rows.map((row) =>
    row
      .map((cell, index) =>
        index < row.length - 1 ? cell.padEnd(widths[index]) : cell,
      )
      .join("  ")
      .trimEnd(),
  );
}

function modelLines(loaded: Loaded): string[] {
  const { config, source } = loaded;
  if (source === undefined) return [];
  const rows = [["key", "harness", "id", "effort", "role"]];
  for (const model of config.models) {
    const key = model.key === config.defaultModel ? `${model.key}*` : model.key;
    rows.push([key, model.harness, model.id, model.effort, model.role]);
  }
  return [
    `crew models from ${source} (* = default, ${config.defaultModel}):`,
    ...columns(rows).map((line) => `  ${line}`),
    "",
  ];
}

export function modelsReport(loaded: Loaded): string {
  const { source, userFile } = loaded;
  const lines = modelLines(loaded);
  const notice = configNotice(loaded);
  if (notice) lines.push(notice.text, "");
  const file =
    source === undefined || source === PINNED ? tilde(userFile) : source;
  lines.push(
    `In ${file}, point the editor schema at this checkout:`,
    `  "$schema": ${JSON.stringify(SCHEMA_FILE)}`,
  );
  return lines.join("\n");
}
