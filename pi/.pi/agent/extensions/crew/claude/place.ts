import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { hasErrors, loadConfig } from "../lib/config.ts";
import type { Config, Loaded } from "../lib/config.ts";
import type { Herdr } from "../lib/herdr.ts";
import type { Run } from "../lib/runs.ts";
import { Tree, crewPlace } from "../lib/tree.ts";
import type { Place } from "../lib/tree.ts";

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ANCESTOR_LIMIT = 16;
const HASH_LENGTH = 12;
const NAME_LENGTH = 40;
const IDLE_STATUSES = new Set(["idle", "done"]);

export const IDLE_CONFIRMATIONS = 2;

export const ENTRY = path.join(DIRECTORY, "crew.ts");
export const CLI = path.join(DIRECTORY, "crew");

export interface Claude {
  environment: NodeJS.ProcessEnv;
  root: string;
  session: string;
  place: Place;
  loaded: Loaded;
  config: Config;
  claudePid: number | undefined;
}

function parentOf(pid: number): { parent: number; command: string } {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  const close = stat.lastIndexOf(")");
  return {
    command: stat.slice(stat.indexOf("(") + 1, close),
    parent: Number(stat.slice(close + 2).split(" ")[1]),
  };
}

export function findClaudePid(
  environment: NodeJS.ProcessEnv,
): number | undefined {
  const given = Number(environment.CLAUDE_PID);
  if (Number.isInteger(given) && given > 0) return given;
  let pid = process.ppid;
  for (let step = 0; step < ANCESTOR_LIMIT && pid > 1; step++) {
    try {
      const { parent, command } = parentOf(pid);
      if (command === "claude") return pid;
      pid = parent;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function isIdle(status: string): boolean {
  return IDLE_STATUSES.has(status);
}

export function paneStatus(herdr: Herdr, pane: string): Promise<string> {
  return herdr
    .state(pane)
    .then((agent) => agent.status)
    .catch(() => "unknown");
}

export function crewOn(loaded: Loaded): boolean {
  return loaded.source !== undefined && !hasErrors(loaded);
}

export function claudeOf(
  environment: NodeJS.ProcessEnv,
  session: string,
): Claude {
  const place = crewPlace(environment);
  const project = environment.CLAUDE_PROJECT_DIR || process.cwd();
  const loaded = loadConfig({
    cwd: project,
    environment,
    depth: place.depth,
    agentDirectory:
      environment.PI_CODING_AGENT_DIR ||
      path.join(os.homedir(), ".pi", "agent"),
  });
  return {
    environment,
    root: environment.PI_CREW_DIR || path.join(project, ".pi", "crew"),
    session,
    place,
    loaded,
    config: loaded.config,
    claudePid: findClaudePid(environment),
  };
}

export function treeOf(claude: Claude): Tree {
  return new Tree(claude.root, claude.session, claude.place, claude.config);
}

export function taskRunId(session: string, toolUseId: string): string {
  const hash = createHash("sha1")
    .update(`${session}${toolUseId}`)
    .digest("hex");
  return `task-${hash.slice(0, HASH_LENGTH)}`;
}

export function taskName(description: string | undefined): string {
  return `task: ${description?.trim() || "subagent"}`.slice(0, NAME_LENGTH);
}

export function taskRun(
  root: string,
  id: string,
  name: string,
  model: string,
  started?: string,
): Run {
  const run = {
    id,
    name,
    model,
    modelId: model,
    harness: "claude",
    effort: "",
    status: "running",
    cwd: root,
    dir: path.join(root, "runs", id),
    sawWorking: false,
    blockedNotified: false,
    created: started ?? new Date().toISOString(),
    started,
    delivered: true,
  };
  return run as Run;
}
