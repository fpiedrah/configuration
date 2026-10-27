export const HARNESSES = ["pi", "claude"] as const;

export type Harness = (typeof HARNESSES)[number];

export const PROJECT_TRUST = ["approve", "ignore", "ask"] as const;

export type ProjectTrust = (typeof PROJECT_TRUST)[number];

const TRUST_FLAGS: Record<ProjectTrust, string[]> = {
  approve: ["--approve"],
  ignore: ["--no-approve"],
  ask: [],
};

export const EFFORTS: Record<Harness, readonly string[]> = {
  pi: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
  claude: ["low", "medium", "high", "xhigh", "max"],
};

export const DEFAULT_EFFORT: Record<Harness, string> = {
  pi: "medium",
  claude: "high",
};

export interface Model {
  key: string;
  harness: Harness;
  id: string;
  effort: string;
  role: string;
}

export interface ModelEntry {
  id: string;
  harness: Harness;
  effort?: string;
  role?: string;
  key?: string;
}

export type ModelIndex = ReadonlyMap<string, Model>;

export function derivedKey(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1).toLowerCase();
}

export function toModel({ id, harness, effort, role, key }: ModelEntry): Model {
  return {
    key: key ?? derivedKey(id),
    harness,
    id,
    effort: effort ?? DEFAULT_EFFORT[harness],
    role: role ?? "",
  };
}

export function loadModels(models: readonly Model[]): ModelIndex {
  return new Map(models.map((model) => [model.key, model]));
}

function keyList(models: Iterable<Model>): string {
  return [...models].map((candidate) => candidate.key).join(", ");
}

function normalized(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "-");
}

export function resolveModel(models: ModelIndex, name: string): Model {
  const exact = models.get(name.trim().toLowerCase());
  if (exact) return exact;
  const prefix = normalized(name);
  const matches = prefix
    ? [...models.values()].filter((candidate) =>
        normalized(candidate.key).startsWith(prefix),
      )
    : [];
  if (matches.length === 1) return matches[0];
  if (matches.length > 1)
    throw new Error(`ambiguous '${name}'; matches: ${keyList(matches)}`);
  throw new Error(
    `unknown model '${name}'; known: ${keyList(models.values())}`,
  );
}

export function isEffort(harness: Harness, effort: string): boolean {
  return EFFORTS[harness].includes(effort);
}

export function checkEffort(model: Model, effort: string): void {
  if (isEffort(model.harness, effort)) return;
  throw new Error(
    `Effort "${effort}" is not valid for ${model.key} (${model.harness}). Use one of: ${EFFORTS[model.harness].join(", ")}`,
  );
}

export function modelFlags(
  harness: Harness,
  id: string,
  effort: string,
  trust: ProjectTrust,
): string[] {
  const effortFlags =
    harness === "pi"
      ? ["--thinking", effort, ...TRUST_FLAGS[trust]]
      : ["--effort", effort, "--permission-mode", "auto"];
  return ["--model", id, ...effortFlags];
}

export type SessionMode = "fork" | "resume";

export function sessionFlags(
  harness: Harness,
  mode: SessionMode,
  session: string,
): string[] {
  if (!session) throw new Error("No recorded session to fork or resume");
  if (harness === "pi")
    return mode === "fork" ? ["--fork", session] : ["--session", session];
  return mode === "fork"
    ? ["--resume", session, "--fork-session"]
    : ["--resume", session];
}

export function modelTable(models: readonly Model[]): string {
  const lines = ["| Key | Harness | Effort | Role |", "|---|---|---|---|"];
  for (const model of models)
    lines.push(
      `| ${model.key} | ${model.harness} | ${model.effort} | ${model.role} |`,
    );
  return lines.join("\n");
}
