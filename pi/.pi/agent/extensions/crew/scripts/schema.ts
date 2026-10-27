import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EXAMPLE_FILE, SCHEMA_FILE, loadConfig, tilde } from "../lib/config.ts";
import { CrewSchema } from "../lib/schema.ts";

const DRAFT = "http://json-schema.org/draft-07/schema#";

const expected = `${JSON.stringify({ $schema: DRAFT, title: "crew config", ...CrewSchema }, null, 2)}\n`;

function checkExample(): string[] {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crew-schema-"));
  try {
    fs.copyFileSync(EXAMPLE_FILE, path.join(directory, "crew.json"));
    const loaded = loadConfig({
      cwd: directory,
      environment: {},
      depth: 0,
      agentDirectory: directory,
    });
    const problems = loaded.problems.map(
      (problem) =>
        `${tilde(EXAMPLE_FILE)}: ${problem.level}: ${problem.message}`,
    );
    if (loaded.source === undefined)
      problems.push(`${tilde(EXAMPLE_FILE)}: defines no models`);
    return problems;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv.includes("--check")) {
  const problems = checkExample();
  let current = "";
  try {
    current = fs.readFileSync(SCHEMA_FILE, "utf8");
  } catch {}
  if (current !== expected)
    problems.push(
      `${tilde(SCHEMA_FILE)} is out of date; run node scripts/schema.ts`,
    );
  for (const problem of problems) console.error(problem);
  process.exit(problems.length > 0 ? 1 : 0);
}

fs.writeFileSync(SCHEMA_FILE, expected);
console.log(`wrote ${tilde(SCHEMA_FILE)}`);
