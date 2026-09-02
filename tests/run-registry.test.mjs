import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readRun,
  recordParentSession,
  releaseRun,
  reserveRun,
  RunRegistryError,
  transitionRun,
} from "../lib/run-registry.mjs";

async function fixture(t) {
  const stateRoot = await mkdtemp(join(tmpdir(), "prime-registry-"));
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  let now = 1_700_000_000_000;
  const processAdapter = {
    current: () => ({ pid: 101, startIdentity: "boot:101" }),
    isAlive: (pid, start) => pid === 101 && start === "boot:101",
  };
  return {
    stateRoot,
    clock: { now: () => now++ },
    processAdapter,
    reservation: {
      runId: "run-1",
      runtimeHome: "/kit/.state/runs/run-1/agent-home",
      daemonSocket: "/kit/.state/runs/run-1/daemon/daemon.sock",
      target: "/target",
      worktree: "/worktree",
      branch: "prime/run-1",
    },
  };
}

test("second live coordinator is refused", async (t) => {
  const f = await fixture(t);
  await reserveRun(f.reservation, f);
  await assert.rejects(
    reserveRun({ ...f.reservation, runId: "run-2" }, f),
    (error) => error.code === "E_RUN_ACTIVE",
  );
});

test("records the exact parent and preserves it across detach", async (t) => {
  const f = await fixture(t);
  await reserveRun(f.reservation, f);
  await recordParentSession(f.stateRoot, "run-1", "session-secret", f);
  await transitionRun(f.stateRoot, "run-1", "detached", {
    expectedParentSessionId: "session-secret",
    ...f,
  });
  const record = await readRun(f.stateRoot);
  assert.equal(record.parentSessionId, "session-secret");
  assert.equal(record.state, "detached");
  await assert.rejects(
    transitionRun(f.stateRoot, "run-1", "running", {
      expectedParentSessionId: "other",
      ...f,
    }),
    /E_SESSION_MISMATCH/,
  );
});

test("PID reuse is stale and takeover orphans without granting a duplicate", async (t) => {
  const f = await fixture(t);
  await reserveRun(f.reservation, f);
  const reused = {
    ...f,
    processAdapter: {
      ...f.processAdapter,
      isAlive: (pid, start) => pid === 101 && start === "different-start",
    },
  };
  await assert.rejects(
    reserveRun({ ...f.reservation, runId: "run-2" }, reused),
    /E_TAKEOVER_REQUIRED/,
  );
  await assert.rejects(
    reserveRun({ ...f.reservation, runId: "run-2" }, { ...reused, authorizeTakeover: true }),
    /E_RUN_ORPHANED/,
  );
  assert.equal((await readRun(f.stateRoot)).state, "orphaned");
});

test("retained coordinators refuse duplicates even when their process exited", async (t) => {
  const f = await fixture(t);
  await reserveRun(f.reservation, f);
  await transitionRun(f.stateRoot, "run-1", "retained", f);
  const dead = { ...f, processAdapter: { ...f.processAdapter, isAlive: () => false } };
  await assert.rejects(
    reserveRun({ ...f.reservation, runId: "run-2" }, dead),
    /E_RUN_ACTIVE/,
  );
});

test("lock contention fails closed", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.stateRoot, "run-registry.lock"));
  await assert.rejects(
    reserveRun(f.reservation, { ...f, lockAttempts: 1 }),
    /E_REGISTRY_LOCKED/,
  );
});

test("corrupt and partial records have stable diagnostics", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.stateRoot, "active-run.json"), "{\"schemaVersion\":");
  await assert.rejects(readRun(f.stateRoot), /E_REGISTRY_CORRUPT/);
  await writeFile(join(f.stateRoot, "active-run.json"), JSON.stringify({ schemaVersion: 1 }));
  await assert.rejects(readRun(f.stateRoot), /E_REGISTRY_SCHEMA/);
});

test("release requires the exact run and a terminal state", async (t) => {
  const f = await fixture(t);
  await reserveRun(f.reservation, f);
  await assert.rejects(releaseRun(f.stateRoot, "other", f), /E_RUN_MISMATCH/);
  await assert.rejects(releaseRun(f.stateRoot, "run-1", f), /E_RUN_NOT_TERMINAL/);
  await transitionRun(f.stateRoot, "run-1", "stopped", f);
  await releaseRun(f.stateRoot, "run-1", f);
  assert.equal(await readRun(f.stateRoot), null);
});
