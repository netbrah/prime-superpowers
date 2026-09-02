import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  realpath,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const execFile = promisify(execFileCallback);

export class WorktreeError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "WorktreeError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new WorktreeError(code, detail);
}

async function git(cwd, args) {
  try {
    return (await execFile("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    })).stdout.trim();
  } catch (error) {
    error.gitStderr = error.stderr;
    throw error;
  }
}

async function exists(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function validateRunId(runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId ?? "")) {
    fail("E_RUN_ID", "run id is not path-safe");
  }
}

export async function resolveTargetWorktree({
  targetDir,
  runId,
  worktreeDir,
  mode = "external",
}) {
  validateRunId(runId);
  let targetRoot;
  try {
    const candidate = await realpath(targetDir);
    targetRoot = await git(candidate, ["rev-parse", "--show-toplevel"]);
    targetRoot = await realpath(targetRoot);
  } catch {
    fail("E_NOT_REPOSITORY", "target is not inside a Git worktree");
  }

  const dirty = await git(targetRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty) fail("E_TARGET_DIRTY", "target worktree has uncommitted state");
  const startCommit = await git(targetRoot, ["rev-parse", "HEAD"]);
  const branch = `prime/${runId}`;
  if (await git(targetRoot, ["branch", "--list", branch])) {
    fail("E_BRANCH_COLLISION", "run branch already exists");
  }

  let destination;
  if (mode === "in-repository") {
    const base = join(targetRoot, ".worktrees");
    destination = resolve(worktreeDir ?? join(base, runId));
    const escaped = relative(base, destination);
    if (escaped === ".." || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
      fail("E_PATH_ESCAPE", "in-repository worktree escaped .worktrees");
    }
  } else if (mode === "external") {
    destination = resolve(worktreeDir ?? join(dirname(targetRoot), ".prime-worktrees", runId));
    if (destination === targetRoot || targetRoot.startsWith(`${destination}${sep}`)) {
      fail("E_PATH_ESCAPE", "external worktree overlaps target");
    }
  } else {
    fail("E_WORKTREE_MODE", "unsupported worktree mode");
  }

  if (await exists(destination)) {
    fail("E_WORKTREE_COLLISION", "worktree destination already exists");
  }
  const porcelain = await git(targetRoot, ["worktree", "list", "--porcelain"]);
  const canonicalDestination = resolve(destination);
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ") && resolve(line.slice(9)) === canonicalDestination) {
      fail("E_WORKTREE_COLLISION", "destination is already linked");
    }
  }

  if (mode === "in-repository") {
    const commonRaw = await git(targetRoot, ["rev-parse", "--git-common-dir"]);
    const commonDir = resolve(targetRoot, commonRaw);
    const excludePath = join(commonDir, "info", "exclude");
    await mkdir(dirname(excludePath), { recursive: true });
    let text = "";
    try {
      text = await readFile(excludePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!text.split(/\r?\n/u).includes("/.worktrees/")) {
      await appendFile(excludePath, `${text && !text.endsWith("\n") ? "\n" : ""}/.worktrees/\n`);
    }
  } else {
    await mkdir(dirname(destination), { recursive: true });
  }

  try {
    await git(targetRoot, ["worktree", "add", "-b", branch, destination, startCommit]);
  } catch {
    fail("E_WORKTREE_CREATE", "git refused to create the isolated worktree");
  }
  const worktreeRoot = await realpath(destination);
  const actualBranch = await git(worktreeRoot, ["branch", "--show-current"]);
  const actualCommit = await git(worktreeRoot, ["rev-parse", "HEAD"]);
  if (actualBranch !== branch || actualCommit !== startCommit) {
    fail("E_WORKTREE_MISMATCH", "created worktree identity does not match reservation");
  }
  return Object.freeze({
    targetRoot,
    worktreeRoot,
    cwd: worktreeRoot,
    branch,
    startCommit,
  });
}
