import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PolicyError,
  POLICY_LIMITS,
  appendPolicyHistory,
  attributeFindings,
  authorizeAdmission,
  exportPolicyHistory,
  importPolicyHistory,
  requireGateClosure,
  validateOutcome,
  validateReviewRound,
  validateSeverityChange,
} from "../lib/policy-history.mjs";

const clock = { now: () => "2026-09-02T23:20:00.000Z" };

async function history(t) {
  const dir = await mkdtemp(join(tmpdir(), "prime-policy-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, ".state", "policy-history.jsonl");
}

test("admission caps enforce discovery, task, and whole-run ceilings", () => {
  assert.deepEqual(POLICY_LIMITS, { discovery: 20, task: 12, run: 80, reviewRounds: 5 });
  assert.equal(authorizeAdmission([], { scope: "discovery", taskId: "discovery" }).ok, true);
  for (const [scope, count, taskId] of [
    ["discovery", 20, "discovery"],
    ["task", 12, "11"],
    ["run", 80, "any"],
  ]) {
    const records = Array.from({ length: count }, (_, index) => ({
      event: "admission",
      detail: { scope: scope === "run" ? "task" : scope, taskId: scope === "run" ? String(index) : taskId },
    }));
    assert.throws(
      () => authorizeAdmission(records, { scope: scope === "run" ? "task" : scope, taskId }),
      (error) => error.code === (scope === "discovery" ? "E_DISCOVERY_CAP" : scope === "task" ? "E_TASK_CAP" : "E_RUN_CAP"),
    );
  }
});

test("later-seat unique finding is not credited to sealed primary", () => {
  const attribution = attributeFindings({
    primary: { seat: "sol", findings: [{ id: "F-1", accepted: true }] },
    later: [{ seat: "gemini", findings: [
      { id: "F-1", accepted: true },
      { id: "F-2", accepted: true, effect: "changed implementation" },
    ] }],
  });
  assert.equal(attribution.find((finding) => finding.id === "F-2").seat, "gemini", "expected seat=gemini, got seat=sol");
});

test("cannot-verify and accepted material findings gate while deferred Minors hand off", () => {
  assert.throws(
    () => requireGateClosure([{ id: "F-1", status: "cannot-verify", severity: "Major" }]),
    (error) => error.code === "E_CANNOT_VERIFY",
  );
  assert.throws(
    () => requireGateClosure([{ id: "F-2", status: "accepted", severity: "Blocker" }]),
    (error) => error.code === "E_FINDINGS_OPEN",
  );
  assert.deepEqual(
    requireGateClosure([{ id: "F-3", status: "deferred", severity: "Minor" }]),
    { ok: true, deferredMinors: ["F-3"] },
  );
});

test("Blocker and Major downgrade requires independent cross-family concurrence", () => {
  const finding = { id: "F-1", severity: "Major", seat: "sol", authorFamily: "openai" };
  assert.throws(
    () => validateSeverityChange(finding, { severity: "Minor", reviewerFamily: "openai", independent: true }),
    (error) => error.code === "E_CONCURRENCE",
  );
  assert.throws(
    () => validateSeverityChange(finding, { severity: "Settled", reviewerFamily: "anthropic", independent: false }),
    (error) => error.code === "E_CONCURRENCE",
  );
  assert.equal(
    validateSeverityChange(finding, {
      severity: "Minor", reviewerFamily: "anthropic", independent: true,
      rationale: "not load-bearing", evidence: "test output",
    }).ok,
    true,
  );
});

test("review rounds stop after five and cannot skip", () => {
  assert.equal(validateReviewRound([1, 2, 3, 4], 5), true);
  assert.throws(() => validateReviewRound([1, 2, 3, 4, 5], 6), (error) => error.code === "E_REVIEW_CAP");
  assert.throws(() => validateReviewRound([1], 3), (error) => error.code === "E_REVIEW_ROUND");
});

function outcome(overrides = {}) {
  return {
    frozenCriteria: ["all tests pass"],
    rounds: [{ gate: "final", count: 1 }],
    interventions: [],
    elapsedMs: 1200,
    admissionsBySeat: { sol: 1, gemini: 1 },
    availableUsageBySeat: { sol: { tokens: 10 }, gemini: null },
    uniqueAcceptedFindings: [{ id: "F-2", seat: "gemini", effect: "changed implementation" }],
    effects: ["prevented regression"],
    geminiSimplicityVerdict: "The council found material value.",
    ...overrides,
  };
}

test("first-production outcome requires every frozen field and Gemini verdict", () => {
  assert.equal(validateOutcome(outcome()).ok, true);
  for (const field of Object.keys(outcome())) {
    const invalid = outcome();
    delete invalid[field];
    assert.throws(() => validateOutcome(invalid), (error) => error.code === "E_OUTCOME_INCOMPLETE", field);
  }
});

test("policy history appends concurrently with frozen redacted envelopes", async (t) => {
  const path = await history(t);
  await Promise.all(Array.from({ length: 10 }, (_, index) => appendPolicyHistory(path, {
    runId: "run-13", taskId: String(index), event: "admission",
    detail: { scope: "task", taskId: String(index), seat: "sol" },
  }, { clock })));
  const records = await exportPolicyHistory(path);
  assert.equal(records.length, 10);
  assert.deepEqual(Object.keys(records[0]), ["ts", "runId", "taskId", "event", "detail"]);
});

test("policy history import/export validates records and rejects secrets", async (t) => {
  const source = await history(t);
  await appendPolicyHistory(source, {
    runId: "run-13", taskId: "13", event: "outcome", detail: outcome(),
  }, { clock });
  const records = await exportPolicyHistory(source);
  const target = join(await mkdtemp(join(tmpdir(), "prime-policy-import-")), ".state", "policy-history.jsonl");
  t.after(() => rm(join(target, "..", ".."), { recursive: true, force: true }));
  await importPolicyHistory(target, records);
  assert.deepEqual(await exportPolicyHistory(target), records);
  await assert.rejects(
    appendPolicyHistory(source, {
      runId: "run-13", taskId: "13", event: "usage", detail: { apiKey: "sk-secret-value" },
    }, { clock }),
    (error) => error.code === "E_SECRET",
  );
  assert.doesNotMatch(await readFile(source, "utf8"), /secret-value/);
});

test("held history lock fails closed", async (t) => {
  const path = await history(t);
  await mkdir(`${path}.lock`, { recursive: true });
  await assert.rejects(
    appendPolicyHistory(path, {
      runId: "run-13", taskId: "13", event: "admission", detail: { scope: "task" },
    }, { clock, lock: { retries: 0, delayMs: 0 } }),
    (error) => error.code === "E_POLICY_LOCKED",
  );
});
