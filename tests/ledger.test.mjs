import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LedgerError, appendLedger, createLedger, readLedger } from "../lib/ledger.mjs";

const clock = { now: () => "2026-09-02T23:10:00.000Z" };

async function ledger(t) {
  const dir = await mkdtemp(join(tmpdir(), "prime-ledger-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "ledger.jsonl");
  await createLedger(path, {
    runId: "run-12",
    taskId: "plan",
    planHash: "a".repeat(64),
    acceptanceCommands: ["node --test", "./scripts/gate"],
  }, { clock });
  return path;
}

function evidence(overrides = {}) {
  return {
    phase: "red",
    command: "node --test tests/ledger.test.mjs",
    cwd: "/worktree",
    started_at: "2026-09-02T23:00:00.000Z",
    ended_at: "2026-09-02T23:00:01.000Z",
    status: 1,
    subtest: "ledger rejects incomplete red green evidence",
    failure: "E_EVIDENCE_INCOMPLETE",
    artifact: "/tmp/red.txt",
    pre_commit_hash: "b".repeat(40),
    post_commit_hash: "b".repeat(40),
    pre_tree_hash: "c".repeat(64),
    post_tree_hash: "d".repeat(64),
    ...overrides,
  };
}

test("creates append-only envelope and reads complete evidence", async (t) => {
  const path = await ledger(t);
  await appendLedger(path, {
    runId: "run-12", taskId: "12", event: "evidence", detail: evidence(),
  }, { clock });
  const records = await readLedger(path);
  assert.equal(records.length, 2);
  assert.deepEqual(Object.keys(records[1]), ["ts", "runId", "taskId", "event", "detail"]);
  assert.equal(records[1].detail.post_tree_hash, "d".repeat(64));
});

test("ledger rejects incomplete red green evidence", async (t) => {
  const path = await ledger(t);
  const incomplete = evidence();
  delete incomplete.post_tree_hash;
  await assert.rejects(
    appendLedger(path, {
      runId: "run-12", taskId: "12", event: "evidence", detail: incomplete,
    }, { clock }),
    (error) => error instanceof LedgerError && error.code === "E_EVIDENCE_INCOMPLETE",
    "expected E_EVIDENCE_INCOMPLETE for missing post_tree_hash, got append accepted",
  );
});

test("frozen plan hash and acceptance commands cannot drift", async (t) => {
  const path = await ledger(t);
  for (const detail of [
    { planHash: "f".repeat(64), acceptanceCommands: ["node --test", "./scripts/gate"] },
    { planHash: "a".repeat(64), acceptanceCommands: ["different"] },
  ]) {
    await assert.rejects(
      appendLedger(path, { runId: "run-12", taskId: "plan", event: "plan", detail }, { clock }),
      (error) => error.code === "E_PLAN_FROZEN",
    );
  }
});

test("review ranges are immutable and rounds monotonic", async (t) => {
  const path = await ledger(t);
  await appendLedger(path, {
    runId: "run-12", taskId: "12", event: "review",
    detail: { reviewId: "task-12", round: 1, base: "1".repeat(40), head: "2".repeat(40) },
  }, { clock });
  await assert.rejects(
    appendLedger(path, {
      runId: "run-12", taskId: "12", event: "review",
      detail: { reviewId: "task-12", round: 1, base: "1".repeat(40), head: "3".repeat(40) },
    }, { clock }),
    (error) => error.code === "E_REVIEW_RANGE_MUTABLE",
  );
  await assert.rejects(
    appendLedger(path, {
      runId: "run-12", taskId: "12", event: "review",
      detail: { reviewId: "task-12", round: 3, base: "1".repeat(40), head: "2".repeat(40) },
    }, { clock }),
    (error) => error.code === "E_REVIEW_ROUND",
  );
});

test("concurrent appends serialize without lost records", async (t) => {
  const path = await ledger(t);
  await Promise.all(Array.from({ length: 12 }, (_, index) => appendLedger(path, {
    runId: "run-12",
    taskId: String(index),
    event: "transition",
    detail: { index },
  }, { clock })));
  const records = await readLedger(path);
  assert.equal(records.length, 13);
  assert.deepEqual(
    records.slice(1).map((record) => record.detail.index).sort((a, b) => a - b),
    Array.from({ length: 12 }, (_, index) => index),
  );
});

test("corrupt history fails closed and abandoned temporary files do not replace it", async (t) => {
  const path = await ledger(t);
  await writeFile(`${path}.tmp-abandoned`, "{\"bad\":");
  assert.equal((await readLedger(path)).length, 1);
  await writeFile(path, `${await readFile(path, "utf8")}{\"bad\":\n`);
  await assert.rejects(readLedger(path), (error) => error.code === "E_LEDGER_CORRUPT");
});

test("records containing likely secrets are rejected and never written", async (t) => {
  const path = await ledger(t);
  await assert.rejects(
    appendLedger(path, {
      runId: "run-12", taskId: "12", event: "transition",
      detail: { apiKey: "sk-secret-value" },
    }, { clock }),
    (error) => error.code === "E_SECRET",
  );
  assert.doesNotMatch(await readFile(path, "utf8"), /secret-value/);
});

test("schema and run identity mismatches are rejected", async (t) => {
  const path = await ledger(t);
  await assert.rejects(
    appendLedger(path, { runId: "other", taskId: "12", event: "transition", detail: {} }, { clock }),
    (error) => error.code === "E_RUN_ID",
  );
  await mkdir(`${path}.lock`);
  await assert.rejects(
    appendLedger(path, { runId: "run-12", taskId: "12", event: "transition", detail: {} }, {
      clock, lock: { retries: 0, delayMs: 0 },
    }),
    (error) => error.code === "E_LEDGER_LOCKED",
  );
});
