import test from "node:test";
import assert from "node:assert/strict";

import {
  LifecycleError,
  admitAttempt,
  applyLifecycleEvent,
  expireAttempt,
  retryAttempt,
} from "../lib/workflow-state.mjs";

const clock = (iso = "2026-09-02T20:00:00.000Z") => ({ now: () => iso });

function admitted(overrides = {}) {
  return admitAttempt({
    taskId: "11",
    attemptId: "child-1",
    attemptName: "task-11-attempt-1",
    selector: "prime-proxy-openai/gpt-5.6-sol",
    reportPath: "/work/.superpowers/reports/11.json",
    parentSession: "parent-1",
    deadlineAt: "2026-09-02T21:00:00.000Z",
    ...overrides,
  }, { clock: clock() });
}

test("admission records schema, identity, policy, and original clocks", () => {
  const state = admitted();
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.status, "admitted");
  assert.equal(state.admitted_at, "2026-09-02T20:00:00.000Z");
  assert.equal(state.deadline_at, "2026-09-02T21:00:00.000Z");
  assert.equal(state.attemptId, "child-1");
  assert.equal(state.attemptName, "task-11-attempt-1");
  assert.equal(state.parentSession, "parent-1");
  assert.equal(state.selector, "prime-proxy-openai/gpt-5.6-sol");
  assert.equal(state.reportPath, "/work/.superpowers/reports/11.json");
});

test("queued running progress reported and completed transitions are deterministic", () => {
  let state = admitted();
  state = applyLifecycleEvent(state, "queued", {}, { clock: clock("2026-09-02T20:01:00.000Z") });
  state = applyLifecycleEvent(state, "running", {}, { clock: clock("2026-09-02T20:02:00.000Z") });
  assert.equal(state.started_at, "2026-09-02T20:02:00.000Z");
  state = applyLifecycleEvent(state, "progress", {}, { clock: clock("2026-09-02T20:03:00.000Z") });
  assert.equal(state.last_progress_at, "2026-09-02T20:03:00.000Z");
  state = applyLifecycleEvent(state, "report", { digest: "a".repeat(64) }, { clock: clock("2026-09-02T20:04:00.000Z") });
  assert.equal(state.status, "reported");
  state = applyLifecycleEvent(state, "complete", {}, { clock: clock("2026-09-02T20:05:00.000Z") });
  assert.equal(state.status, "completed");
});

test("attach reconstruction preserves deadline and timestamps", () => {
  const before = applyLifecycleEvent(admitted(), "running", {}, { clock: clock("2026-09-02T20:02:00.000Z") });
  const restored = JSON.parse(JSON.stringify(before));
  const after = applyLifecycleEvent(restored, "progress", {}, { clock: clock("2026-09-02T20:20:00.000Z") });
  assert.equal(after.admitted_at, before.admitted_at);
  assert.equal(after.started_at, before.started_at);
  assert.equal(after.deadline_at, before.deadline_at);
});

test("deadline expiry and cleanup uncertainty fail closed", async () => {
  const running = applyLifecycleEvent(admitted(), "running", {}, { clock: clock("2026-09-02T20:02:00.000Z") });
  const timedOut = expireAttempt(running, { clock: clock("2026-09-02T21:00:00.001Z") });
  assert.equal(timedOut.status, "timed-out");
  await assert.rejects(
    retryAttempt(timedOut, {
      attemptId: "child-2",
      attemptName: "task-11-attempt-2",
    }, {
      clock: clock("2026-09-02T21:01:00.000Z"),
      rlm: { deleteSubagent: async () => ({ status: "skipped_running" }) },
    }),
    (error) => error instanceof LifecycleError && error.code === "E_CLEANUP_UNCONFIRMED",
  );
});

test("timed-out attempt cannot be retried before cancellation tombstone", async () => {
  const timedOut = expireAttempt(
    applyLifecycleEvent(admitted(), "running", {}, { clock: clock("2026-09-02T20:02:00.000Z") }),
    { clock: clock("2026-09-02T21:00:00.001Z") },
  );
  await assert.rejects(
    retryAttempt(timedOut, {
      attemptId: "child-2",
      attemptName: "task-11-attempt-2",
    }, {
      clock: clock("2026-09-02T21:01:00.000Z"),
      rlm: { deleteSubagent: async () => ({ deleted: true, terminalState: "running" }) },
    }),
    (error) => error.code === "E_CLEANUP_UNCONFIRMED",
    "expected E_CLEANUP_UNCONFIRMED, got retry admitted",
  );
});

test("confirmed tombstone permits exactly one fresh-name retry", async () => {
  const timedOut = expireAttempt(
    applyLifecycleEvent(admitted(), "running", {}, { clock: clock("2026-09-02T20:02:00.000Z") }),
    { clock: clock("2026-09-02T21:00:00.001Z") },
  );
  const retry = await retryAttempt(timedOut, {
    attemptId: "child-2",
    attemptName: "task-11-attempt-2",
  }, {
    clock: clock("2026-09-02T21:01:00.000Z"),
    rlm: { deleteSubagent: async () => ({ deleted: true, terminalState: "cancelled" }) },
  });
  assert.equal(retry.status, "retrying");
  assert.equal(retry.attempt, 2);
  assert.equal(retry.attemptName, "task-11-attempt-2");
  await assert.rejects(
    retryAttempt(retry, { attemptId: "child-3", attemptName: "task-11-attempt-3" }, {
      clock: clock(),
      rlm: { deleteSubagent: async () => ({ deleted: true, terminalState: "cancelled" }) },
    }),
    (error) => error.code === "E_RETRY_EXHAUSTED",
  );
});

test("duplicate live attempts and reused names are rejected", () => {
  assert.throws(
    () => admitAttempt({
      taskId: "11",
      attemptId: "child-2",
      attemptName: "task-11-attempt-2",
      selector: "provider/model",
      reportPath: "/report",
      parentSession: "parent",
      deadlineAt: "2026-09-02T21:00:00.000Z",
    }, { clock: clock(), existing: [admitted()] }),
    (error) => error.code === "E_ATTEMPT_LIVE",
  );
});

test("late reports are quarantined and cleanup failure is terminal", () => {
  const timedOut = expireAttempt(
    applyLifecycleEvent(admitted(), "running", {}, { clock: clock("2026-09-02T20:02:00.000Z") }),
    { clock: clock("2026-09-02T21:00:00.001Z") },
  );
  const late = applyLifecycleEvent(timedOut, "report", { digest: "b".repeat(64) }, { clock: clock() });
  assert.equal(late.status, "quarantined-late-report");
  const cleanup = applyLifecycleEvent(timedOut, "cleanup-failed", {}, { clock: clock() });
  assert.equal(cleanup.status, "cleanup-failed");
});

test("failure transitions and malformed schemas fail closed", () => {
  const failed = applyLifecycleEvent(admitted(), "fail", { reason: "worker failed" }, { clock: clock() });
  assert.equal(failed.status, "failed");
  assert.throws(
    () => applyLifecycleEvent({ ...admitted(), schemaVersion: 99 }, "running", {}, { clock: clock() }),
    (error) => error.code === "E_LIFECYCLE_SCHEMA",
  );
});
