import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { attempt } from "./files.ts";
import {
  EFFORTS,
  derivedKey,
  isEffort,
  loadModels,
  resolveModel,
  toModel,
} from "./models.ts";
import type { Model, ModelEntry, ModelIndex, ProjectTrust } from "./models.ts";
import { CrewSchema, ModelSchema, NUMBERS } from "./schema.ts";
import type { PLACEMENTS } from "./schema.ts";
import { DEFAULT_TEXT } from "./text.ts";
import type { Text } from "./text.ts";

type Placement = (typeof PLACEMENTS)[number];

export interface Config {
  maxDepth: number;
  maxConcurrent: number;
  maxParked: number;
  heartbeatTimeoutMs: number;
  pollMs: number;
  previewChars: number;
  extraRules: string;
  defaultModel: string;
  widget: Placement;
  lingerMs: number;
  widgetLines: number;
  tailLines: number;
  readyTimeoutMs: number;
  startGraceMs: number;
  piProjectTrust: ProjectTrust;
  text: Text;
  models: Model[];
  modelIndex: ModelIndex;
}

export interface Problem {
  level: "error" | "warning";
  message: string;
}

export interface Loaded {
  config: Config;
  problems: Problem[];
  source: string | undefined;
  userFile: string;
}

type Data = Record<string, unknown>;

type ValidationError = ReturnType<typeof Value.Errors>[number];

interface Layer {
  at(pointer: string): string;
  data: unknown;
}

interface Layers {
  source: string | undefined;
  layers: Layer[];
}

interface Walk {
  layer: Layer;
  problems: Problem[];
}

interface SchemaNode {
  properties?: Record<string, TSchema>;
  additionalProperties?: unknown;
}

interface DefaultChoice {
  value: string;
  layer: Layer;
}

const EXTENSION_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const SCHEMA_FILE = path.join(EXTENSION_DIRECTORY, "crew.schema.json");
export const EXAMPLE_FILE = path.join(EXTENSION_DIRECTORY, "crew.example.json");

export const PINNED = "PI_CREW_CONFIG";

const BYTES_PER_KILOBYTE = 1024;
const MAX_PINNED_BYTES = 64 * BYTES_PER_KILOBYTE;
const HEARTBEAT_POLLS = 3;

const DEFAULTS: Config = {
  maxDepth: 3,
  maxConcurrent: 4,
  maxParked: 20,
  heartbeatTimeoutMs: 60_000,
  pollMs: 5000,
  previewChars: 8000,
  extraRules: "",
  defaultModel: "",
  widget: "above",
  lingerMs: 20_000,
  widgetLines: 8,
  tailLines: 40,
  readyTimeoutMs: 30_000,
  startGraceMs: 90_000,
  piProjectTrust: "approve",
  text: DEFAULT_TEXT,
  models: [],
  modelIndex: new Map(),
};

const MODEL_FIELDS = Object.keys(ModelSchema.properties);

function isData(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function tilde(file: string): string {
  const home = os.homedir();
  return file.startsWith(`${home}${path.sep}`)
    ? `~${file.slice(home.length)}`
    : file;
}

function escapeKey(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

function show(value: unknown): string {
  return String(JSON.stringify(value) ?? value);
}

function parseLayer(
  label: string,
  source: string,
  problems: Problem[],
): Layer | undefined {
  try {
    return {
      at: (pointer) => (pointer ? `${label}: ${pointer}` : label),
      data: JSON.parse(source),
    };
  } catch (error) {
    problems.push({
      level: "error",
      message: `${label}: invalid JSON (${(error as Error).message})`,
    });
    return undefined;
  }
}

function readLayer(file: string, problems: Problem[]): Layer | undefined {
  let source: string;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT")
      problems.push({
        level: "error",
        message: `${tilde(file)}: cannot read (${code ?? (error as Error).message})`,
      });
    return undefined;
  }
  return parseLayer(tilde(file), source, problems);
}

function realPath(file: string): string {
  return attempt(() => fs.realpathSync(file), path.resolve(file));
}

function insideProject(cwd: string): boolean {
  const relative = path.relative(
    realPath(path.join(cwd, ".pi")),
    realPath(EXTENSION_DIRECTORY),
  );
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function chooseFile(
  cwd: string,
  userFile: string,
  problems: Problem[],
): string | undefined {
  const projectFile = path.join(cwd, ".pi", "crew.json");
  if (fs.existsSync(projectFile)) {
    if (insideProject(cwd)) return projectFile;
    problems.push({
      level: "warning",
      message: `${tilde(projectFile)}: skipped because crew is not loaded from this project`,
    });
  }
  return fs.existsSync(userFile) ? userFile : undefined;
}

function environmentName(key: string): string {
  return `PI_CREW_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
}

function environmentLayer(environment: NodeJS.ProcessEnv): Layer {
  const data: Data = {};
  for (const key of NUMBERS) {
    const raw = environment[environmentName(key)];
    if (raw) data[key] = Number.isNaN(Number(raw)) ? raw : Number(raw);
  }
  const extraRules = environment[environmentName("extraRules")];
  if (extraRules !== undefined) data.extraRules = extraRules;
  for (const key of ["defaultModel", "widget", "piProjectTrust"]) {
    const raw = environment[environmentName(key)];
    if (raw?.trim()) data[key] = raw;
  }
  return {
    at: (pointer) => environmentName(pointer.split("/")[1] ?? ""),
    data,
  };
}

function dropUnknown(
  value: Data,
  key: string,
  pointer: string,
  { layer, problems }: Walk,
): void {
  problems.push({
    level: "warning",
    message: `${layer.at(pointer)} is not a crew setting; ignored`,
  });
  delete value[key];
}

function stripProperties(
  node: SchemaNode,
  value: Data,
  pointer: string,
  walk: Walk,
): void {
  const { properties } = node;
  if (!properties) return;
  for (const key of Object.keys(value)) {
    const child = properties[key];
    const at = `${pointer}/${escapeKey(key)}`;
    if (child) stripUnknown(child, value[key], at, walk);
    else if (node.additionalProperties === false)
      dropUnknown(value, key, at, walk);
  }
}

function stripUnknown(
  schema: TSchema,
  value: unknown,
  pointer: string,
  walk: Walk,
): void {
  if (isData(value)) stripProperties(schema, value, pointer, walk);
}

function describe(layer: Layer, error: ValidationError): string[] {
  const { keyword, instancePath, params, message } = error;
  if (keyword === "boolean") return [];
  if (keyword === "additionalProperties")
    return params.additionalProperties.map(
      (key) =>
        `${layer.at(`${instancePath}/${escapeKey(key)}`)} is not allowed`,
    );
  if (keyword === "required")
    return [
      `${layer.at(instancePath)}: missing ${params.requiredProperties.join(", ")}`,
    ];
  const value = show(Value.Pointer.Get(layer.data, instancePath));
  if (keyword === "enum")
    return [
      `${layer.at(instancePath)}: ${value} must be one of: ${params.allowedValues.join(", ")}`,
    ];
  return [`${layer.at(instancePath)}: ${value} ${message}`];
}

function reportErrors(layer: Layer, problems: Problem[]): Set<string> {
  const bad = new Set<string>();
  for (const error of Value.Errors(CrewSchema, layer.data)) {
    const [, key = ""] = error.instancePath.split("/");
    if (key === "models") continue;
    for (const message of describe(layer, error))
      problems.push({ level: "error", message });
    bad.add(key);
  }
  return bad;
}

function validate(layer: Layer, problems: Problem[]): Data {
  stripUnknown(CrewSchema, layer.data, "", { layer, problems });
  const bad = reportErrors(layer, problems);
  if (!isData(layer.data)) return {};
  const clean: Data = {};
  for (const [key, value] of Object.entries(layer.data))
    if (!bad.has(key)) clean[key] = value;
  return clean;
}

function applyChoices(config: Config, data: Data): void {
  if (typeof data.widget === "string") config.widget = data.widget as Placement;
  if (typeof data.piProjectTrust === "string")
    config.piProjectTrust = data.piProjectTrust as ProjectTrust;
}

function apply(config: Config, data: Data): Config {
  const next = { ...config, text: { ...config.text } };
  for (const key of NUMBERS) {
    const value = data[key];
    if (typeof value === "number") next[key] = value;
  }
  if (typeof data.extraRules === "string")
    next.extraRules = data.extraRules.trim();
  applyChoices(next, data);
  if (isData(data.text)) {
    for (const key of Object.keys(DEFAULT_TEXT) as (keyof Text)[]) {
      const value = data.text[key];
      if (typeof value === "string") next.text[key] = value;
    }
  }
  return next;
}

function entryLayer(layer: Layer, index: number, entry: unknown): Layer {
  return {
    at: (pointer) => layer.at(`models[${index}]${pointer.replace(/\//g, ".")}`),
    data: entry,
  };
}

function entryProblems(entry: Layer): string[] {
  const at = entry.at("");
  if (!isData(entry.data)) return [`${at}: must be an object`];
  const fields = Object.keys(entry.data);
  const unknown = fields.filter((field) => !MODEL_FIELDS.includes(field));
  if (unknown.length > 0)
    return unknown.map((field) => `${at}: unknown field "${field}"`);
  const missing = ModelSchema.required.filter(
    (field) => !fields.includes(field),
  );
  if (missing.length > 0)
    return missing.map((field) => `${at}: missing "${field}"`);
  if (!Value.Check(ModelSchema, entry.data))
    return [...Value.Errors(ModelSchema, entry.data)].flatMap((error) =>
      describe(entry, error),
    );
  const { harness, effort } = entry.data;
  if (effort === undefined || isEffort(harness, effort)) return [];
  return [
    `${entry.at("/effort")}: "${effort}" is not a ${harness} effort (${EFFORTS[harness].join("|")})`,
  ];
}

function readModels(
  value: unknown,
  layer: Layer,
  problems: Problem[],
): Model[] {
  if (!Array.isArray(value)) {
    problems.push({
      level: "error",
      message: `${layer.at("models")}: must be a list of { "id", "harness" } entries`,
    });
    return [];
  }
  const models: Model[] = [];
  const owners = new Map<string, { index: number; id: string }>();
  for (const [index, data] of value.entries()) {
    const entry = entryLayer(layer, index, data);
    const messages = entryProblems(entry);
    for (const message of messages) problems.push({ level: "error", message });
    if (messages.length > 0) continue;
    const model = toModel(data as ModelEntry);
    const owner = owners.get(model.key);
    if (owner === undefined) {
      owners.set(model.key, { index, id: model.id });
      models.push(model);
      continue;
    }
    problems.push({
      level: "error",
      message: `${entry.at("")} (${model.id}) and models[${owner.index}] (${owner.id}) both have key "${model.key}"; give one of them a distinct "key"`,
    });
  }
  return models;
}

function chooseDefault(
  models: ModelIndex,
  chosen: DefaultChoice | undefined,
  problems: Problem[],
): string {
  const first = models.keys().next().value ?? "";
  if (models.size === 0 || !chosen) return first;
  try {
    return resolveModel(models, chosen.value).key;
  } catch (error) {
    problems.push({
      level: "error",
      message: `${chosen.layer.at("/defaultModel")}: ${(error as Error).message}`,
    });
    return first;
  }
}

function checkResolved(config: Config, problems: Problem[]): void {
  if (config.heartbeatTimeoutMs < HEARTBEAT_POLLS * config.pollMs) {
    problems.push({
      level: "error",
      message: `crew: heartbeatTimeoutMs (${config.heartbeatTimeoutMs}) must be at least ${HEARTBEAT_POLLS} × pollMs (${config.pollMs})`,
    });
  }
  if (Buffer.byteLength(pinnedConfig(config)) > MAX_PINNED_BYTES) {
    problems.push({
      level: "error",
      message: `crew: the resolved config is over ${MAX_PINNED_BYTES / BYTES_PER_KILOBYTE} KB, too large to pass to child sessions`,
    });
  }
}

function resolve(layers: Layer[], problems: Problem[]): Config {
  let config = DEFAULTS;
  let models: Model[] = [];
  let chosen: DefaultChoice | undefined;
  for (const layer of layers) {
    const data = validate(layer, problems);
    config = apply(config, data);
    if (data.models !== undefined)
      models = readModels(data.models, layer, problems);
    if (typeof data.defaultModel === "string")
      chosen = { value: data.defaultModel, layer };
  }
  const modelIndex = loadModels(models);
  const defaultModel = chooseDefault(modelIndex, chosen, problems);
  const resolved = { ...config, models, modelIndex, defaultModel };
  checkResolved(resolved, problems);
  return resolved;
}

export function pinnedConfig(config: Config): string {
  const models = config.models.map(
    ({ key, harness, id, effort, role }): ModelEntry => ({
      id,
      harness,
      effort,
      ...(role && { role }),
      ...(key !== derivedKey(id) && { key }),
    }),
  );
  const { defaultModel, widget, piProjectTrust, extraRules, text } = config;
  const data: Data = {
    defaultModel,
    models,
    widget,
    piProjectTrust,
    extraRules,
    text,
  };
  for (const key of NUMBERS) data[key] = config[key];
  return JSON.stringify(data);
}

function pinnedLayers(
  environment: NodeJS.ProcessEnv,
  problems: Problem[],
): Layers {
  const pinned = environment[PINNED];
  const layer =
    pinned === undefined ? undefined : parseLayer(PINNED, pinned, problems);
  return { source: PINNED, layers: layer ? [layer] : [] };
}

function fileLayers(
  cwd: string,
  userFile: string,
  environment: NodeJS.ProcessEnv,
  problems: Problem[],
): Layers {
  const file = chooseFile(cwd, userFile, problems);
  const layer = file === undefined ? undefined : readLayer(file, problems);
  return {
    source: file === undefined ? undefined : tilde(file),
    layers: [...(layer ? [layer] : []), environmentLayer(environment)],
  };
}

export function loadConfig({
  cwd,
  environment,
  depth,
  agentDirectory,
}: {
  cwd: string;
  environment: NodeJS.ProcessEnv;
  depth: number;
  agentDirectory: string;
}): Loaded {
  const problems: Problem[] = [];
  const userFile = path.join(agentDirectory, "crew.json");
  const { source, layers } =
    depth > 0
      ? pinnedLayers(environment, problems)
      : fileLayers(cwd, userFile, environment, problems);
  const config = resolve(layers, problems);
  if (source !== undefined && config.models.length === 0)
    problems.push({
      level: "error",
      message: `${source}: no valid models configured`,
    });
  return { config, problems, source, userFile };
}

export function hasErrors(loaded: Loaded): boolean {
  return loaded.problems.some((problem) => problem.level === "error");
}

export function writeUserConfig(file: string): void {
  const schema = JSON.stringify(SCHEMA_FILE);
  const example = fs
    .readFileSync(EXAMPLE_FILE, "utf8")
    .replace(/"\$schema":\s*"[^"]*"/, () => `"$schema": ${schema}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, example, { flag: "wx" });
}
