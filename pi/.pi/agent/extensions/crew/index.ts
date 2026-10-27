import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Static, TObject } from "typebox";
import { createCommand, createIdleCommand } from "./lib/commands.ts";
import { hasErrors, loadConfig } from "./lib/config.ts";
import type { Config, Loaded } from "./lib/config.ts";
import { Crew } from "./lib/crew.ts";
import type {
  AnswerOutcome,
  KillOutcome,
  SteerOutcome,
  WorktreeOutcome,
} from "./lib/crew.ts";
import { Herdr } from "./lib/herdr.ts";
import { configNotice } from "./lib/notice.ts";
import type { Notice } from "./lib/notice.ts";
import { crewPlace } from "./lib/tree.ts";
import type { Place } from "./lib/tree.ts";
import {
  ANSWER_DESCRIPTION,
  ANSWER_RESULTS,
  AWAIT_DESCRIPTION,
  KILL_DESCRIPTION,
  KILL_RESULTS,
  PARENT_SENDER,
  STEER_DESCRIPTION,
  STEER_RESULTS,
  WORKTREE_DESCRIPTION,
  awaitResult,
  killReason,
  outcomeText,
  startedMessage,
  toolDescription,
  worktreeResult,
} from "./lib/text.ts";
import type { Outcomes } from "./lib/text.ts";
import type { Row } from "./lib/view.ts";
import { createWidget } from "./lib/widget.ts";
import type { Widget } from "./lib/widget.ts";

const COMMAND_DESCRIPTION =
  "Show crew runs, or /crew kill|tail|focus|steer|answer|worktree-rm <id|name>, /crew models, /crew init";

const RUN_DESCRIPTION = "Run id, id suffix, or name of one of your crew runs";

const BRIEF_PARAMETERS = {
  name: Type.String({
    description: "Short label for the run and its tab, e.g. 'map-auth'",
  }),
  task: Type.String({
    description:
      "Complete, self-contained brief: goal, inputs, expected output, limits",
  }),
};

const OPTION_PARAMETERS = {
  effort: Type.Optional(
    Type.String({ description: "Effort level; default from the table" }),
  ),
  fork: Type.Optional(
    Type.String({
      description:
        "Run id or name to fork: the new run starts from a copy of that run's context (same harness)",
    }),
  ),
  continue: Type.Optional(
    Type.String({
      description:
        "Finished run id or name to continue: re-opens its context with the new task (same model)",
    }),
  ),
  deadline: Type.Optional(
    Type.Number({
      description:
        "Minutes the run may take once started, then it is cancelled; positive",
    }),
  ),
  maxTurns: Type.Optional(
    Type.Integer({
      description:
        "Agent turns the run may take; it is cancelled if still unfinished after them; at least 1",
    }),
  ),
  group: Type.Optional(
    Type.String({
      description:
        "Group name: the run joins it and sends no individual result; call crew_await with the group to be woken once when every member has finished",
    }),
  ),
  worktree: Type.Optional(
    Type.String({
      description:
        "Branch name: the run works in a new git worktree on this branch, so editing runs on different branches can run in parallel",
    }),
  ),
  base: Type.Optional(
    Type.String({
      description:
        "Git ref the worktree branch starts from; default HEAD; needs worktree",
    }),
  ),
};

const ANSWER_PARAMETERS = Type.Object({
  run: Type.String({
    description: "Run id, id suffix, or name from the crew asks message",
  }),
  answer: Type.String({
    description: "The answer; the user's words when the user gave it",
  }),
  question: Type.Optional(
    Type.Integer({
      description:
        "Question number from the crew asks message (#N); the answer is refused if the run now asks another question",
    }),
  ),
});

const STEER_PARAMETERS = Type.Object({
  run: Type.String({ description: RUN_DESCRIPTION }),
  message: Type.String({
    description: "The next job or new information for the run",
  }),
});

interface Relayed {
  run: string;
  text: string;
  question?: number;
}

interface Relay<Outcome extends string, Parameters extends TObject> {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  parameters: Parameters;
  results: Outcomes<Outcome>;
  read(input: Static<Parameters>): Relayed;
  send(crew: Crew, row: Row, relayed: Relayed): Promise<Outcome>;
}

const ANSWER_RELAY: Relay<AnswerOutcome, typeof ANSWER_PARAMETERS> = {
  name: "crew_answer",
  label: "Crew answer",
  description: ANSWER_DESCRIPTION,
  promptSnippet: "Answer a question a crew run paused on",
  parameters: ANSWER_PARAMETERS,
  results: ANSWER_RESULTS,
  read: ({ run, answer, question }) => ({ run, text: answer, question }),
  send: (crew, row, { text, question }) =>
    crew.answer(row, text, PARENT_SENDER, question),
};

const STEER_RELAY: Relay<SteerOutcome, typeof STEER_PARAMETERS> = {
  name: "crew_steer",
  label: "Crew steer",
  description: STEER_DESCRIPTION,
  promptSnippet: "Send a message to a running or parked crew run",
  parameters: STEER_PARAMETERS,
  results: STEER_RESULTS,
  read: ({ run, message }) => ({ run, text: message }),
  send: (crew, row, { text }) => crew.steer(row, text, PARENT_SENDER),
};

type Announce = (context: ExtensionContext) => void;

function openSession(
  context: ExtensionContext,
  crew: Crew,
  widget: Widget,
  config: Config,
): void {
  crew.close();
  widget.dispose();
  if (context.hasUI && config.widget !== "off")
    widget.attach(context.ui, context.mode === "tui");
  const { HERDR_ENV, HERDR_WORKSPACE_ID, PI_CREW_HERDR_BIN, PI_CREW_DIR } =
    process.env;
  if (HERDR_ENV !== "1" || !HERDR_WORKSPACE_ID) return;
  crew.open(
    PI_CREW_DIR || path.join(context.cwd, ".pi", "crew"),
    context.sessionManager.getSessionId(),
    new Herdr(HERDR_WORKSPACE_ID, PI_CREW_HERDR_BIN || "herdr"),
  );
}

function spawnParameters({ models, defaultModel }: Config) {
  return Type.Object({
    ...BRIEF_PARAMETERS,
    model: Type.Optional(
      Type.Enum(
        models.map((model) => model.key),
        { description: `Model key from the table; default ${defaultModel}` },
      ),
    ),
    ...OPTION_PARAMETERS,
  });
}

function registerTool(
  pi: ExtensionAPI,
  crew: Crew,
  config: Config,
  depth: number,
): void {
  pi.registerTool({
    name: "crew",
    label: "Crew",
    description: toolDescription(config, depth),
    promptSnippet:
      "Delegate a self-contained task to another model in a background herdr tab",
    promptGuidelines: [
      "After calling crew, do not poll or wait for it; its result arrives as a crew_result message.",
      "Run crew editing tasks in the same repo one at a time, unless each uses its own worktree; read-only tasks may run in parallel.",
      "Always call crew_await for every group you spawn into; grouped runs send no individual results.",
    ],
    parameters: spawnParameters(config),
    async execute(_toolCallId, input, _signal, _onUpdate, context) {
      const { continue: resume, ...request } = input;
      const { run, queued } = await crew.submit({
        ...request,
        resume,
        cwd: resume ? undefined : context.cwd,
      });
      const text = startedMessage(run, queued, config.maxConcurrent);
      return {
        content: [{ type: "text", text }],
        details: { id: run.id, status: run.status },
      };
    },
  });
}

function registerRelay<Outcome extends string, Parameters extends TObject>(
  pi: ExtensionAPI,
  crew: Crew,
  relay: Relay<Outcome, Parameters>,
): void {
  pi.registerTool({
    name: relay.name,
    label: relay.label,
    description: relay.description,
    promptSnippet: relay.promptSnippet,
    parameters: relay.parameters,
    async execute(_toolCallId, input) {
      const relayed = relay.read(input);
      const row = crew.locate(relayed.run);
      const outcome = row ? await relay.send(crew, row, relayed) : "missing";
      const name = row?.name ?? relayed.run;
      const open = row && crew.openQuestion(row);
      const text = outcomeText(relay.results, outcome, name, row?.tab, open);
      return {
        content: [{ type: "text", text }],
        details: { id: row?.id, outcome },
      };
    },
  });
}

function registerAwait(pi: ExtensionAPI, crew: Crew, config: Config): void {
  pi.registerTool({
    name: "crew_await",
    label: "Crew await",
    description: AWAIT_DESCRIPTION,
    promptSnippet: "Wake once when every run in a crew group has finished",
    parameters: Type.Object({
      group: Type.String({
        description: "Group name given to the crew runs' group param",
      }),
    }),
    async execute(_toolCallId, input) {
      const { outcome, members } = crew.await(input.group);
      const text = awaitResult(outcome, input.group, members, config);
      return {
        content: [{ type: "text", text }],
        details: { group: input.group, outcome },
      };
    },
  });
}

async function killOutcome(
  crew: Crew,
  key: string,
): Promise<{ outcome: KillOutcome | "missing"; stranded: string[] }> {
  const run = crew.find(key);
  if (!run)
    return { outcome: crew.locate(key) ? "nested" : "missing", stranded: [] };
  const cancellation = await crew.kill(run, killReason(PARENT_SENDER));
  crew.poll();
  return cancellation;
}

function registerKill(pi: ExtensionAPI, crew: Crew): void {
  pi.registerTool({
    name: "crew_kill",
    label: "Crew kill",
    description: KILL_DESCRIPTION,
    promptSnippet: "Cancel one of your active crew runs",
    parameters: Type.Object({
      run: Type.String({ description: RUN_DESCRIPTION }),
    }),
    async execute(_toolCallId, input) {
      const { outcome, stranded } = await killOutcome(crew, input.run);
      const name = crew.find(input.run)?.name ?? input.run;
      const text = outcomeText(
        KILL_RESULTS,
        outcome,
        name,
        stranded.join(", "),
      );
      return {
        content: [{ type: "text", text }],
        details: { outcome, stranded },
      };
    },
  });
}

async function worktreeOutcome(
  crew: Crew,
  key: string,
  force: boolean,
): Promise<{
  outcome: WorktreeOutcome | "missing" | "nested";
  users: string[];
}> {
  const run = crew.find(key);
  if (!run)
    return { outcome: crew.locate(key) ? "nested" : "missing", users: [] };
  return crew.removeWorktree(run, force);
}

function registerWorktree(pi: ExtensionAPI, crew: Crew): void {
  pi.registerTool({
    name: "crew_worktree_remove",
    label: "Crew worktree remove",
    description: WORKTREE_DESCRIPTION,
    promptSnippet: "Remove the git worktree of a finished crew run",
    parameters: Type.Object({
      run: Type.String({ description: RUN_DESCRIPTION }),
      force: Type.Optional(
        Type.Boolean({
          description: "Remove even if the worktree has uncommitted changes",
        }),
      ),
    }),
    async execute(_toolCallId, input) {
      const run = crew.find(input.run);
      const worktree = run?.worktree;
      const { outcome, users } = await worktreeOutcome(
        crew,
        input.run,
        input.force ?? false,
      );
      const name = run?.name ?? input.run;
      const text = worktreeResult(outcome, name, worktree, users);
      return {
        content: [{ type: "text", text }],
        details: { id: run?.id, outcome, users },
      };
    },
  });
}

function registerIdle(
  pi: ExtensionAPI,
  loaded: Loaded,
  announce: Announce,
): void {
  pi.on("session_start", (_event, context) => announce(context));
  pi.registerCommand("crew", {
    description: COMMAND_DESCRIPTION,
    handler: createIdleCommand(loaded),
  });
}

function registerCrew(
  pi: ExtensionAPI,
  loaded: Loaded,
  place: Place,
  announce: Announce,
): void {
  const { config } = loaded;
  const widget = createWidget(config);
  const crew = new Crew(
    (content, details) => {
      pi.sendMessage(
        { customType: "crew_result", content, display: true, details },
        { deliverAs: "steer", triggerTurn: true },
      );
    },
    place,
    config,
    (view) => widget.update(view),
  );

  pi.on("session_start", (_event, context) => {
    announce(context);
    openSession(context, crew, widget, config);
  });

  pi.on("session_shutdown", () => {
    crew.close();
    widget.dispose();
  });

  registerTool(pi, crew, config, place.depth);
  registerRelay(pi, crew, ANSWER_RELAY);
  registerRelay(pi, crew, STEER_RELAY);
  registerKill(pi, crew);
  registerAwait(pi, crew, config);
  registerWorktree(pi, crew);

  pi.registerCommand("crew", {
    description: COMMAND_DESCRIPTION,
    handler: createCommand(crew, loaded),
  });
}

function announcer(notice: Notice | undefined, depth: number): Announce {
  return (context) => {
    if (!notice || depth > 0) return;
    if (context.hasUI) context.ui.notify(notice.text, notice.level);
    else if (notice.level === "error") console.error(notice.text);
  };
}

export default function crewExtension(pi: ExtensionAPI) {
  const place = crewPlace(process.env);
  const loaded = loadConfig({
    cwd: process.cwd(),
    environment: process.env,
    depth: place.depth,
    agentDirectory: getAgentDir(),
  });
  if (place.depth >= loaded.config.maxDepth) return;
  const notice = configNotice(loaded);
  if (place.depth > 0 && hasErrors(loaded)) {
    console.error(notice?.text);
    return;
  }

  const announce = announcer(notice, place.depth);
  if (hasErrors(loaded) || loaded.source === undefined) {
    registerIdle(pi, loaded, announce);
    return;
  }

  registerCrew(pi, loaded, place, announce);
}
