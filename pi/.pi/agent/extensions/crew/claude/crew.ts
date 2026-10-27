import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { awaitMessages } from "./channel.ts";
import type { Output } from "./cli.ts";

const PI_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const MISSING = `crew: the typebox package is missing; run make -C ${PI_DIRECTORY} install`;

function missingDependency(error: unknown): boolean {
  const { code, message } = error as NodeJS.ErrnoException;
  return code === "ERR_MODULE_NOT_FOUND" && message.includes("'typebox");
}

async function loadCli(): Promise<typeof import("./cli.ts") | undefined> {
  try {
    return await import("./cli.ts");
  } catch (error) {
    if (!missingDependency(error)) throw error;
    process.stderr.write(`${MISSING}\n`);
    return undefined;
  }
}

function print(output: Output): number {
  if (output.text) {
    const stream = output.code === 0 ? process.stdout : process.stderr;
    stream.write(`${output.text}\n`);
  }
  return output.code;
}

async function start(): Promise<number | undefined> {
  const [verb, ...words] = process.argv.slice(2);
  const environment = process.env;
  if (verb === "hook" && words[0] === "wait") return awaitMessages(environment);
  if (verb === "hook" && !environment.PI_CREW_TREE) return 0;
  const cli = await loadCli();
  if (!cli) return 1;
  const output = await cli.main(verb, words, environment);
  return output ? print(output) : undefined;
}

const code = await start();
if (code !== undefined) process.exit(code);
