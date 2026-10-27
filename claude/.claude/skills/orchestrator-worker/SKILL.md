---
name: orchestrator-worker
description: "Plan, delegate and verify multi-task jobs over crew runs: decomposition, worker briefs, waves, retries. Use when a job needs recon-then-plan, more than one wave, retries, or merging parallel branches."
---

# orchestrator-worker

You coordinate: plan, brief, spawn, verify, combine. Workers do the tasks. For crew itself (spawn, group, await, answer, continue) see `crew help` or the crew tool description; this skill adds only the pattern on top. Paths below are relative to this skill's directory.

## When to use

- One wave of up to 8 known, independent tasks with cheap synthesis: plain group + await. Skip this skill.
- Use it for recon then plan, several waves or dependent tasks, retries, or merging parallel branches.
- Default: the current session coordinates. Spawn a dedicated coordinator run only to keep the root free; give it no deadline and tell it to load this skill first.
- Workers editing code in parallel: also read `references/worktrees.md` before the first wave.

## Mechanics that bite

- No deadline on a run that delegates, coordinator included: when it lapses, its whole subtree is cancelled.
- A worktree starts from a commit (base defaults to HEAD). Commit first, pass an explicit base SHA, and have workers commit before finishing.
- Use a fresh group name for every wave and every retry; an awaited group takes no new members.
- Never put a run told to stay available in a group: it parks and keeps the group open.
- Workers must not delegate or use Task/Agent subagents: everything shares the tree-wide cap.
- Every brief lists sibling scopes and an explicit Out, and uses absolute paths only (a worktree run has a different cwd).
- Verify, don't trust: re-run tests and spot-check findings yourself before marking a task done.
- Every retry changes something: the model, the scope, or the information in the brief.
- Remove a worktree only after deciding not to `continue` that run: continue reuses its cwd.

## Plan file

Before the first spawn, make an absolute job dir under a gitignored `.pi/` (e.g. `<repo>/.pi/orch/<job>/`, check `git check-ignore`) with `plan.md`, `tasks/` and `out/`. `plan.md` is the state that survives compaction: crew tracks runs, the table tracks tasks. Update it after every spawn and every ingest. Status is one of todo, running, done, partial, failed, abandoned.

```markdown
# <job>: <goal in one line>

On every wake:
1. Re-read this file.
2. Ingest each finished member: read out/Txx/result.md, verify it.
3. Retry or advance per the rules in the orchestrator-worker skill.
4. Update the table.
5. Spawn and await the next wave, or finish.

Base: <SHA, if code> · Job dir: <absolute path>

| id | scope | owns | deps | status | attempts | last run | note |
|---|---|---|---|---|---|---|---|
| T01 | <one line> | <globs> | - | todo | 0 | - | |
```

## Worker brief

Save each brief as `tasks/Txx.md` (a retry as `tasks/Txx-a2.md`) and send that file on stdin.

```markdown
Goal: <one sentence: the outcome, not the steps>

Context: <two sentences on the job>. Siblings running in parallel: T02 <scope>, T03 <scope>. Do not touch their files.

Scope
- In: <what to do>
- Out: <what not to do, even if it looks wrong>
- Owns: <globs you may edit; nothing else>

Inputs: <absolute paths>. Base SHA: <sha> [code].

Output: write <job dir>/out/Txx/result.md early and keep it updated, so a cut-off still leaves something. Use these headings, in order:
## Status (done | partial | blocked)
## Summary
## Findings (each with path:line)
## Assumptions
## Out of scope (seen, not fixed)
## Self-check (commands run and their results)

Done when: <checkable criteria, e.g. `<test command>` passes, every module in Inputs covered>

Decision rules: ambiguous → pick the reasonable option and record it under Assumptions. Out of scope → list it, don't fix it. Blocked → say so under Status and stop.

Limits: do not delegate or use Task/Agent subagents. Never push, never touch the remote, never merge into the user's branch. [code] Edit only files under Owns; commit before finishing. [tests] Use port <p>, cache dir <absolute path>, CUDA_VISIBLE_DEVICES=<n>.

deliverable.md: one status line plus the path to result.md.
```

## Waves

- Spawn every member of wave k with group `<job>-w<k>`, a retry with its own (`<job>-w<k>-r<n>`). Then await that group in the same turn, then end the turn.
- At most 8 runs per wave. A task whose deps are not done waits for a later wave.
- Pilot 1–2 tasks first only when there are more than 6 and the brief template is new.
- Workers get a deadline and maxTurns: they don't delegate, so a lapse cancels only them.

## On each group message

For each member:
1. Read its result.md, not the preview.
2. Verify: re-run its test command, spot-check 1–2 findings at their path:line, and for code run `scripts/check-branch.sh <worktree> <base> '<owns glob>'...`.
3. Mark the task done, partial or failed in the table and bump attempts.

Retry, at most 2 attempts per task:
- Cut off by deadline or maxTurns with partial work: `continue` the run with "finish the rest" and what is missing.
- Wrong or unverifiable: a fresh brief with the failure written in, on a stronger model.
- Blocked: decide it if your own brief lets you; otherwise ask your parent through inquiry.md (the root asks the user).
- `brief not delivered` (never started working): an infrastructure fault. Fix what its trace.md shows, then re-send the unchanged brief on the same model; this does not count as an attempt.
- Failed twice: mark it abandoned and report it. Never resend an unchanged brief, except after `brief not delivered`.

## Finish

Done when every task is done or abandoned.
- Kill parked runs and make sure no group you spawned into is left un-awaited.
- Write the synthesis: deduplicated, each fact attributed to its run, disagreements flagged rather than averaged, gaps and abandoned tasks listed.
- Write deliverable.md last.

## Must not

- Do worker tasks yourself.
- Poll, sleep, or tail runs.
- Edit files a running worker owns.
- Answer approvals.
- Push to any remote, ever.
- Merge into the user's branch without their approval.

## Final merge

- Workers never push or merge. By default the deliverable names the integration branch and its SHA for a human to merge.
- If your brief gives you merge authority, stop and ask the user before merging the integration branch into their working branch (e.g. master); a nested coordinator asks through inquiry.md. After approval, merge locally, run the tests, and report the resulting SHA.
- Never push, under any circumstances.
