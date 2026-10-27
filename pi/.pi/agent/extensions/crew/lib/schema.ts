import { Type } from "typebox";
import type { TSchema } from "typebox";
import { DEFAULT_EFFORT, EFFORTS, HARNESSES, PROJECT_TRUST } from "./models.ts";
import { DEFAULT_TEXT } from "./text.ts";

export const PLACEMENTS = ["above", "below", "off"] as const;

export const NUMBERS = [
  "maxDepth",
  "maxConcurrent",
  "maxParked",
  "heartbeatTimeoutMs",
  "pollMs",
  "previewChars",
  "lingerMs",
  "widgetLines",
  "tailLines",
  "readyTimeoutMs",
  "startGraceMs",
] as const;

export const MODEL_KEY = "^[a-z][a-z0-9-]*$";

function allEfforts(): string[] {
  const efforts = new Set<string>();
  for (const harness of HARNESSES)
    for (const effort of EFFORTS[harness]) efforts.add(effort);
  return [...efforts];
}

function numbers(): Record<string, TSchema> {
  const properties: Record<string, TSchema> = {};
  for (const key of NUMBERS)
    properties[key] = Type.Optional(Type.Integer({ minimum: 1 }));
  return properties;
}

function textSchema(): TSchema {
  const properties: Record<string, TSchema> = {};
  for (const key of Object.keys(DEFAULT_TEXT))
    properties[key] = Type.Optional(Type.String());
  return Type.Object(properties, { additionalProperties: false });
}

export const ModelSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      pattern: "[^/]$",
      description: "Model id passed to the harness with --model",
    }),
    harness: Type.Enum([...HARNESSES], {
      description: "CLI that runs the model",
    }),
    effort: Type.Optional(
      Type.Enum(allEfforts(), {
        description: `Default effort; pi takes off..max (default ${DEFAULT_EFFORT.pi}), claude takes low..max (default ${DEFAULT_EFFORT.claude})`,
      }),
    ),
    role: Type.Optional(
      Type.String({
        minLength: 1,
        description:
          "When to use this model; the only guidance the parent model gets",
      }),
    ),
    key: Type.Optional(
      Type.String({
        pattern: MODEL_KEY,
        description:
          "Name that picks the model; defaults to the id's last path segment, lowercased",
      }),
    ),
  },
  { additionalProperties: false },
);

export const CrewSchema = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    defaultModel: Type.Optional(
      Type.String({
        description:
          "Key, or unique key prefix, of the model used when a call names none; the first model when unset",
      }),
    ),
    models: Type.Optional(
      Type.Array(ModelSchema, {
        description: "Models to delegate to, in the order the table lists them",
      }),
    ),
    ...numbers(),
    widget: Type.Optional(Type.Enum([...PLACEMENTS])),
    piProjectTrust: Type.Optional(
      Type.Enum([...PROJECT_TRUST], {
        description:
          "pi workers: approve trusts project-local files for the run (--approve), ignore skips them (--no-approve), ask leaves pi's trust dialog on",
      }),
    ),
    extraRules: Type.Optional(Type.String()),
    text: Type.Optional(textSchema()),
  },
  { additionalProperties: false },
);
