# Worktrees for parallel code edits

Read this before a wave whose workers edit code in parallel. It adds to SKILL.md; it replaces none of it.

## Before the first wave

- Commit the starting state to `orch/<job>/start`; never stash. This leaves the user's tree, index and branch alone:

```sh
cd <repo>; index=$(mktemp); cp "$(git rev-parse --git-path index)" "$index"
GIT_INDEX_FILE=$index git add -A
start=$(git commit-tree "$(GIT_INDEX_FILE=$index git write-tree)" -p HEAD -m "orch/<job>: start")
git branch orch/<job>/start "$start"; rm "$index"
```

- Record `$start` in plan.md as the base. Edits made after this point are not in any worker's tree.
- Give each task disjoint `owns` globs. Globs match the full repo-relative path, and a glob that matches a directory owns everything under it.
- Tasks with overlapping files go in a later wave, based on the integration branch's SHA after the earlier merge.

## Spawning

- `crew spawn Txx --worktree orch/<job>/Txx --base <SHA> --group <job>-w<k>` (pi: the worktree and base params).
- A fresh-brief retry gets a new branch (`orch/<job>/Txx-a2`); `continue` reuses the old worktree.
- Isolate each worker in its brief: its own port, an absolute cache dir under the job dir, `CUDA_VISIBLE_DEVICES`, and `WANDB_MODE=offline`.
- The worker's cwd is its worktree, not the repo, so every path in the brief is absolute.
- The worktree path is in the spawn and result messages.

## After the join

- For each branch: `scripts/check-branch.sh <worktree> <SHA> '<owns glob>'...`. Quote the globs so the shell doesn't expand them.
- A failing check counts as a failed or partial task under the retry rules in SKILL.md.

## Integration

- `git worktree add -b orch/<job>/integration <job dir>/integration <SHA>`
- Merge one branch at a time, in dependency order, smallest diff first: `git -C <integration> merge --no-ff orch/<job>/Txx`. Run the tests after each merge.
- On a conflict: `git merge --abort`. On red tests: `git reset --hard ORIG_HEAD`. Either way, keep the branch, mark the task, and report it. Re-run it on the new base only if asked.

## Cleanup

- Remove a worker's worktree (`crew worktree rm <run>`) only after the retry decision for its task. Branches stay.
- Remove the integration worktree (`git worktree remove`) after reporting. Its branch stays.

## Final merge

- Default: the deliverable names `orch/<job>/integration` and its SHA for a human to merge.
- With merge authority, ask the user first (nested: through inquiry.md). Then merge locally into their branch and run the tests. If their working tree is dirty, don't merge; hand it back. Report the SHA.
- Never push, under any circumstances.
