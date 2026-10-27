import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
const WORKTREE_PREFIX = "worktree ";

export interface Worktree {
  path: string;
  branch: string;
  base: string;
  repository: string;
}

function git(directory: string, command: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", directory, ...command],
      { maxBuffer: OUTPUT_LIMIT_BYTES },
      (error, stdout, stderr) => {
        if (!error) return resolve(String(stdout));
        reject(new Error(String(stderr).trim() || `git ${command[0]} failed`));
      },
    );
  });
}

async function mainRepository(directory: string): Promise<string> {
  const listing = await git(directory, ["worktree", "list", "--porcelain"]);
  const first = listing.split("\n")[0] ?? "";
  if (!first.startsWith(WORKTREE_PREFIX))
    throw new Error(`Cannot find the main working tree of ${directory}`);
  return first.slice(WORKTREE_PREFIX.length);
}

async function repositoryOf(worktree: Worktree): Promise<string> {
  if (fs.existsSync(worktree.repository)) return worktree.repository;
  return mainRepository(worktree.path);
}

export async function createWorktree({
  cwd,
  branch,
  base,
  path: location,
}: {
  cwd: string;
  branch: string;
  base?: string;
  path: string;
}): Promise<Worktree> {
  let toplevel: string;
  try {
    toplevel = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    throw new Error(`${cwd} is not inside a git repository`);
  }
  const repository = await mainRepository(toplevel);
  const resolvedBase = base ?? "HEAD";
  const exists = await git(toplevel, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${resolvedBase}^{commit}`,
  ]).then(
    () => true,
    () => false,
  );
  if (!exists)
    throw new Error(`Base ref "${resolvedBase}" does not exist in ${toplevel}`);
  const target = path.resolve(location);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await git(toplevel, ["worktree", "add", "-b", branch, target, resolvedBase]);
  return {
    path: target,
    branch,
    base: resolvedBase,
    repository,
  };
}

async function removeFrom(
  repository: string,
  worktree: Worktree,
  force: boolean,
): Promise<void> {
  await git(repository, [
    "worktree",
    "remove",
    ...(force ? ["--force"] : []),
    worktree.path,
  ]);
}

export async function removeWorktree(
  worktree: Worktree,
  force: boolean,
): Promise<void> {
  await removeFrom(await repositoryOf(worktree), worktree, force);
}

export async function discardWorktree(worktree: Worktree): Promise<void> {
  const repository = await repositoryOf(worktree);
  await removeFrom(repository, worktree, true);
  await git(repository, ["branch", "-D", worktree.branch]);
}
