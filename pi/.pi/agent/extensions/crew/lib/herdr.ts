import { execFile } from "node:child_process";
import { attempt } from "./files.ts";
import type { Harness } from "./models.ts";

const START_ATTEMPTS = 20;
const START_RETRY_MS = 500;
const OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
const CALL_TIMEOUT_MS = 120_000;

export interface Agent {
  status: string;
  sequence: number;
  tab?: string;
  activity?: string;
  cost?: string;
  model?: string;
  session?: { kind: string; value: string };
}

type HerdrId = string | Record<string, string | undefined>;

interface AgentRecord {
  name?: string;
  agent_status?: string;
  completion_seq?: number;
  tab_id?: string;
  terminal_title_stripped?: string;
  tokens?: { task?: string; cost?: string; model?: string };
  agent_session?: { kind?: unknown; value?: unknown };
}

interface Envelope<Result> {
  result?: Result;
  error?: { code?: string; message?: string };
}

class HerdrError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function isHerdrError(error: unknown, code: string): boolean {
  return error instanceof HerdrError && error.code === code;
}

function parseJson<Result>(text: string): Envelope<Result> | undefined {
  return attempt<Envelope<Result> | undefined>(
    () => JSON.parse(text) as Envelope<Result>,
    undefined,
  );
}

function idOf(value: HerdrId | undefined, key: string): string {
  return (typeof value === "string" ? value : value?.[key]) as string;
}

function sessionOf(value: AgentRecord["agent_session"]): Agent["session"] {
  const { kind, value: pointer } = value ?? {};
  if (typeof kind !== "string" || typeof pointer !== "string") return undefined;
  return { kind, value: pointer };
}

function agentOf(value: AgentRecord | null | undefined): Agent {
  return {
    status: value?.agent_status ?? "unknown",
    sequence: value?.completion_seq ?? 0,
    tab: value?.tab_id,
    activity:
      value?.tokens?.task || value?.terminal_title_stripped || undefined,
    cost: value?.tokens?.cost,
    model: value?.tokens?.model,
    session: sessionOf(value?.agent_session),
  };
}

export class Herdr {
  private readonly workspace: string;
  private readonly binary: string;

  constructor(workspace: string, binary: string) {
    this.workspace = workspace;
    this.binary = binary;
  }

  private call(command: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.binary,
        command,
        { maxBuffer: OUTPUT_LIMIT_BYTES, timeout: CALL_TIMEOUT_MS },
        (error, stdout, stderr) => {
          const output = String(stdout);
          const errorOutput = String(stderr);
          if (!error) return resolve(output);
          const failure = (parseJson(errorOutput) ?? parseJson(output))?.error;
          const message =
            failure?.message ??
            (errorOutput.trim() || `herdr ${command[0]} failed`);
          reject(new HerdrError(failure?.code ?? "herdr_failed", message));
        },
      );
    });
  }

  private async callJson<Result>(
    command: string[],
  ): Promise<Result | undefined> {
    return parseJson<Result>(await this.call(command))?.result;
  }

  private succeeds(command: string[]): Promise<boolean> {
    return this.call(command).then(
      () => true,
      () => false,
    );
  }

  async createTab(
    cwd: string,
    label: string,
    environment: Record<string, string>,
  ): Promise<{ tab: string; pane: string }> {
    const command = [
      "tab",
      "create",
      "--workspace",
      this.workspace,
      "--cwd",
      cwd,
      "--label",
      label,
      "--no-focus",
    ];
    for (const [key, value] of Object.entries(environment))
      command.push("--env", `${key}=${value}`);
    const result = await this.callJson<{
      tab?: HerdrId;
      root_pane?: HerdrId;
    }>(command);
    return {
      tab: idOf(result?.tab, "tab_id"),
      pane: idOf(result?.root_pane, "pane_id"),
    };
  }

  async startAgent(
    name: string,
    harness: Harness,
    pane: string,
    flags: string[],
  ): Promise<void> {
    const command = [
      "agent",
      "start",
      name,
      "--kind",
      harness,
      "--pane",
      pane,
      "--",
      ...flags,
    ];
    for (let tries = 0; !(await this.tryStart(command, tries)); tries++)
      await new Promise((resolve) => setTimeout(resolve, START_RETRY_MS));
  }

  private async tryStart(command: string[], tries: number): Promise<boolean> {
    try {
      await this.call(command);
      return true;
    } catch (error) {
      if (!isHerdrError(error, "agent_pane_busy") || tries >= START_ATTEMPTS)
        throw error;
      return false;
    }
  }

  async prompt(name: string, text: string): Promise<void> {
    await this.call(["agent", "prompt", name, text]);
  }

  async state(name: string): Promise<Agent> {
    try {
      const found = await this.callJson<{ agent?: AgentRecord }>([
        "agent",
        "get",
        name,
      ]);
      return agentOf(found?.agent);
    } catch (error) {
      if (isHerdrError(error, "agent_not_found"))
        return { status: "gone", sequence: 0 };
      throw error;
    }
  }

  async list(): Promise<Map<string, Agent>> {
    const found = (
      await this.callJson<{ agents?: (AgentRecord | null)[] }>([
        "agent",
        "list",
      ])
    )?.agents;
    if (!Array.isArray(found))
      throw new HerdrError(
        "herdr_failed",
        "herdr agent list returned no agents",
      );
    const agents = new Map<string, Agent>();
    for (const agent of found)
      if (typeof agent?.name === "string")
        agents.set(agent.name, agentOf(agent));
    return agents;
  }

  read(name: string, lines: number): Promise<string> {
    return this.call([
      "agent",
      "read",
      name,
      "--source",
      "recent-unwrapped",
      "--lines",
      String(lines),
    ]);
  }

  async focus(
    name: string | undefined,
    tab: string | undefined,
  ): Promise<boolean> {
    if (name && (await this.succeeds(["agent", "focus", name]))) return true;
    return tab ? this.succeeds(["tab", "focus", tab]) : false;
  }

  closeTab(tab: string): Promise<boolean> {
    return this.succeeds(["tab", "close", tab]);
  }
}
