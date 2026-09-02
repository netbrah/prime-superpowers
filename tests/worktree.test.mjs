import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { resolveTargetWorktree, WorktreeError } from "../lib/worktree.mjs";

const execFile = promisify(execFileCallback);
async function git(cwd, ...args) {
  return (await execFile("git", ["-C", cwd, ...args], { encoding: "utf8" })).stdout.trim();
}

async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), "prime-target-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.email", "test@example.test");
  await git(root, "config", "user.name", "Test");
  await writeFile(join(root, "tracked.txt"), "initial\n");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", "initial");
  return root;
}

test("creates run branch before returning cwd", async (t) => {
  const target = await repository(t);
  const destination = `${target}-worktree`;
  const result = await resolveTargetWorktree({
    targetDir: target,
    runId: "run-test",
    worktreeDir: destination,
  });
  assert.equal(await git(result.worktreeRoot, "branch", "--show-current"), "prime/run-test");
  assert.equal(result.branch, "prime/run-test");
  assert.equal(result.cwd, result.worktreeRoot);
  assert.equal(result.startCommit, await git(target, "rev-parse", "HEAD"));
});

test("supports in-repository .worktrees and changes only info/exclude", async (t) => {
  const target = await repository(t);
  const before = await git(target, "status", "--porcelain");
  const result = await resolveTargetWorktree({
    targetDir: target,
    runId: "inside",
    mode: "in-repository",
  });
  assert.equal(result.worktreeRoot, join(target, ".worktrees", "inside"));
  const exclude = await readFile(join(target, ".git", "info", "exclude"), "utf8");
  assert.match(exclude, /(?:^|\n)\/\.worktrees\/(?:\n|$)/);
  assert.equal(await git(target, "status", "--porcelain"), before);
});

test("resolves a subdirectory to the real repository root", async (t) => {
  const target = await repository(t);
  const nested = join(target, "a", "b");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(nested, { recursive: true }));
  const result = await resolveTargetWorktree({
    targetDir: nested,
    runId: "nested",
    worktreeDir: `${target}-nested-worktree`,
  });
  assert.equal(result.targetRoot, target);
});

test("fails closed for dirty targets without creating a branch or worktree", async (t) => {
  const target = await repository(t);
  await writeFile(join(target, "tracked.txt"), "dirty\n");
  const destination = `${target}-dirty-worktree`;
  await assert.rejects(
    resolveTargetWorktree({ targetDir: target, runId: "dirty", worktreeDir: destination }),
    (error) => error instanceof WorktreeError && error.code === "E_TARGET_DIRTY",
  );
  assert.doesNotMatch(await git(target, "branch", "--list"), /prime\/dirty/);
});

test("rejects branch collisions and destinations escaping in-repository root", async (t) => {
  const target = await repository(t);
  await git(target, "branch", "prime/collision");
  await assert.rejects(
    resolveTargetWorktree({
      targetDir: target,
      runId: "collision",
      worktreeDir: `${target}-collision`,
    }),
    /E_BRANCH_COLLISION/,
  );
  await assert.rejects(
    resolveTargetWorktree({
      targetDir: target,
      runId: "escape",
      mode: "in-repository",
      worktreeDir: join(target, ".worktrees", "..", "..", basename(target) + "-escape"),
    }),
    /E_PATH_ESCAPE/,
  );
});

test("rejects non-repositories and symlink destinations", async (t) => {
  const target = await repository(t);
  const nonRepo = await mkdtemp(join(tmpdir(), "not-repo-"));
  const link = `${target}-link`;
  t.after(() => rm(nonRepo, { recursive: true, force: true }));
  t.after(() => rm(link, { force: true }));
  await import("node:fs/promises").then(({ symlink }) => symlink(nonRepo, link));
  await assert.rejects(
    resolveTargetWorktree({ targetDir: nonRepo, runId: "bad", worktreeDir: `${nonRepo}-wt` }),
    /E_NOT_REPOSITORY/,
  );
  await assert.rejects(
    resolveTargetWorktree({ targetDir: target, runId: "link", worktreeDir: link }),
    /E_WORKTREE_COLLISION/,
  );
});
