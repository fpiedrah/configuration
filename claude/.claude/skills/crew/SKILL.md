---
name: crew
description: Delegate work to other models (pi or Claude) in herdr tabs under the crew cap; collect their results and relay their questions. Claude Code only; pi sessions have a native crew tool.
---

# crew

If you have a `crew` tool, stop: this skill is for Claude Code.

The CLI is `crew`, on your PATH. Run `crew help` once per session for the rules and the model table.

## Choose

- Agent/Task: short read-only fan-out inside this session. It counts against the crew cap; a denied subagent means do that part yourself.
- `crew spawn`: other models, long or editing work, or anything the user should be able to watch in a tab.

## Spawn

```sh
crew spawn <name> [--model KEY] [--effort LEVEL] <<'EOF'
<goal, inputs, expected output, limits; the child starts with no context>
EOF
```

## Wait

- After spawning, end your turn unless you have independent work. Never sleep, poll, or read the tab.
- Results and questions arrive on their own as messages. Run `crew inbox` when you expected one and it has not come, and before your final answer.

## Questions and approvals

- "crew asks": show the user the question and send their words with `crew answer <run> "<text>"`. Answer it yourself only if the user already told you how.
- "crew blocked": tell the user what the run asks. Never answer approvals.

## Combine

- Each result names its deliverable.md; read the file when the preview was cut.
- Treat results as claims: check paths and diffs before you rely on them.
- When `crew status` shows no active runs, combine the results. Name the run each fact came from; flag disagreements instead of averaging them.
- Editing tasks in one repo run one at a time; read-only tasks may run in parallel.

## Nested (PI_CREW_DEPTH is 1 or more)

- Write your own deliverable.md only after every child has reported.
- Ask your parent through your own inquiry.md, then pass its answer down with `crew answer`.

The user can run `crew status`, `crew kill <run>`, `crew tail <run>` and `crew answer <run> <text>` from any shell.
