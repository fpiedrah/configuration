import * as fs from "node:fs";

export function attempt<Value>(action: () => Value, fallback: Value): Value {
  try {
    return action();
  } catch {
    return fallback;
  }
}

export function readJson<Value>(file: string): Value | undefined {
  return attempt<Value | undefined>(
    () => JSON.parse(fs.readFileSync(file, "utf8")) as Value,
    undefined,
  );
}

export function listNames(directory: string): string[] {
  return attempt(() => fs.readdirSync(directory), []);
}
