import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLedger, appendLedger, readLedger } from "../lib/ledger.mjs";
import { createDepthVerdictServer, run as launchRun } from "../lib/launcher.mjs";
import {
  ControllerError,
  createWorkflowController,
  emitPrimeSnippets,
  parseControllerArgs,
  requestDepthVerdict,
  resolveControllerContext,
} from "../lib/workflow-controller.mjs";

const baseTime = Date.parse("2026-09-02T23:30:00.000Z");
function fakeClock(start = baseTime) {
  let value = start;
  return {
    now: () => new Date(value).toISOString(),
    advance: (milliseconds) => { value += milliseconds; },
  };
}

async function setup(t, observed = { maxDepth: 1, source: "global" }) {
  const kitRoot = await mkdtemp(join(tmpdir(), "prime-controller-"));
  t.after(() => rm(kitRoot, { recursive: true, force: true }));
  const runId = "run-14";
  const runRoot = join(kitRoot, ".state", "runs", runId);
  const runtimeHome = join(runRoot, "agent-home");
  await mkdir(runtimeHome, { recursive: true });
  const ledgerPath = join(runRoot, "ledger.jsonl");
  const clock = fakeClock();
  await createLedger(ledgerPath, {
    runId,
    taskId: "plan",
    planHash: "a".repeat(64),
    acceptanceCommands: ["node --test", "./scripts/gate"],
  }, { clock });
  const endpointPath = join(runRoot, "depth-verdict.sock");
  const endpoint = await createDepthVerdictServer({
    endpointPath,
    observeDepth: async () => observed,
  });
  t.after(() => endpoint.close());
  const controller = createWorkflowController({
    kitRoot, runId, runRoot, runtimeHome, ledgerPath, endpointPath, clock,
    policyHistoryPath: join(kitRoot, ".state", "policy-history.jsonl"),
  });
  return { kitRoot, runId, runRoot, runtimeHome, ledgerPath, endpointPath, clock, controller };
}

test("dispatch is denied when admission ledger and lifecycle checks are bypassed", async (t) => {
  const { controller } = await setup(t);
  await assert.rejects(
    controller.dispatch({ admissionId: "not-recorded", promptVariable: "validated_prompt" }),
    (error) => error instanceof ControllerError && error.code === "E_CONTROLLER_REQUIRED",
    "expected E_CONTROLLER_REQUIRED, got child admitted",
  );
});

test("admit uses the real launcher verdict endpoint and persists before success", async (t) => {
  const { controller, ledgerPath } = await setup(t, { maxDepth: 1, source: "inherited" });
  const result = await controller.admit({
    taskId: "14",
    model: "prime-proxy-openai/gpt-5.6-sol",
  });
  assert.equal(result.ok, true);
  assert.match(result.admissionId, /^admission-/);
  assert.match(result.snippet, /await rlm\.run\(validated_prompt/);
  const records = await readLedger(ledgerPath);
  assert.equal(records.at(-1).event, "admission");
  assert.equal(records.at(-1).detail.lifecycle.status, "admitted");
});

test("real launcher run layout admits without fixture-seeded ledger", async (t) => {
  const kitRoot = await mkdtemp(join(tmpdir(), "prime-controller-real-layout-"));
  t.after(() => rm(kitRoot, { recursive: true, force: true }));
  const runId = "run-without-ledger";
  const runRoot = join(kitRoot, ".state", "runs", runId);
  const runtimeHome = join(runRoot, "agent-home");
  await mkdir(runtimeHome, { recursive: true });
  const planPath = join(kitRoot, "implementation-plan.md");
  await writeFile(planPath, "# Real launcher plan\n");
  await launchRun({
    kitRoot,
    runId,
    targetDir: kitRoot,
    argv: ["prompt"],
    planPath,
    acceptanceCommands: ["node --test", "bash tests/test-package.sh", "./scripts/gate"],
    dependencies: {
      firewall: async () => ({ forwardedArgv: ["prompt"], presentationEnv: {} }),
      worktree: async () => ({ worktreeRoot: kitRoot, targetRoot: kitRoot, branch: "prime/test" }),
      runtimeHome: async () => ({
        runRoot,
        runtimeHome,
        daemonSocket: join(runtimeHome, "daemon", "daemon.sock"),
      }),
      packagePreflight: async () => {},
      reserve: async () => {},
      spawn: async () => 0,
    },
  });
  const endpointPath = join(runRoot, "depth-verdict.sock");
  const endpoint = await createDepthVerdictServer({
    endpointPath,
    observeDepth: async () => ({ maxDepth: 1, source: "global" }),
  });
  t.after(() => endpoint.close());
  const controller = createWorkflowController({
    kitRoot,
    runId,
    runRoot,
    runtimeHome,
    endpointPath,
    ledgerPath: join(runRoot, "ledger.jsonl"),
    policyHistoryPath: join(kitRoot, ".state", "policy-history.jsonl"),
    clock: fakeClock(),
  });
  const result = await controller.admit({ taskId: "14", model: "provider/model" });
  assert.equal(result.ok, true);
});

test("all frozen depth refusals fail closed without exposing raw depth data", async (t) => {
  for (const [observed, code] of [
    [{ maxDepth: 1, source: "chat" }, "E_DEPTH_SOURCE"],
    [{ maxDepth: 1, source: "env" }, "E_DEPTH_SOURCE"],
    [{ maxDepth: 2, source: "global" }, "E_DEPTH_VALUE"],
  ]) {
    const fixture = await setup(t, observed);
    await assert.rejects(
      fixture.controller.admit({ taskId: code, model: "provider/model" }),
      (error) => error.code === code && !("depth" in error) && !("source" in error),
    );
  }
  await assert.rejects(
    requestDepthVerdict(join((await setup(t)).runRoot, "missing.sock")),
    (error) => error.code === "E_DAEMON_UNREACHABLE",
  );
});

test("controller context refuses daemon capability material and derives only verdict path", () => {
  const kitRoot = "/kit";
  const runtimeHome = "/kit/.state/runs/run-14/agent-home";
  assert.throws(
    () => resolveControllerContext({
      kitRoot,
      env: {
        PRIME_AGENT_CODING_AGENT_DIR: runtimeHome,
        PRIME_AGENT_DAEMON_SOCKET: "/secret/daemon.sock",
      },
    }),
    (error) => error.code === "E_CONTROLLER_REQUIRED",
  );
  assert.throws(
    () => resolveControllerContext({
      kitRoot,
      env: {
        PRIME_AGENT_CODING_AGENT_DIR: runtimeHome,
        PRIME_ACTIVE_SESSION_ID: "parent-secret",
      },
    }),
    (error) => error.code === "E_CONTROLLER_REQUIRED",
  );
  const context = resolveControllerContext({
    kitRoot,
    env: { PRIME_AGENT_CODING_AGENT_DIR: runtimeHome, RLM_MAX_DEPTH: "999" },
  });
  assert.equal(context.endpointPath, "/kit/.state/runs/run-14/depth-verdict.sock");
  assert.doesNotMatch(JSON.stringify(context), /daemon\\.sock|parent-secret|RLM_MAX_DEPTH/);
});

test("Prime snippets use only real 0.8.1 bridge methods and require observed results", () => {
  const snippets = emitPrimeSnippets();
  const serialized = JSON.stringify(snippets);
  for (const token of [
    "rlm.find_models", "rlm.run", "rlm.list_subagents",
    "rlm.delete_subagent", "agent_message.send",
  ]) assert.match(serialized, new RegExp(token.replace(".", "\\.")));
  assert.match(serialized, /observed_result/);
  assert.doesNotMatch(serialized, /socket|session|set_rlm_max_depth/i);
});

test("success report reconciles disk artifact and records every transition", async (t) => {
  const f = await setup(t);
  const admission = await f.controller.admit({ taskId: "14", model: "provider/model" });
  await mkdir(join(f.runRoot, "reports"), { recursive: true });
  await writeFile(admission.reportPath, "worker result\n");
  const result = await f.controller.report({ childId: "real-child-1", status: "ok" });
  assert.equal(result.ok, true);
  const records = await readLedger(f.ledgerPath);
  assert.deepEqual(records.slice(-5).map((record) => record.event), [
    "child-bound", "running", "reported", "completed", "report-ack",
  ]);
  assert.deepEqual(records.find((record) => record.event === "child-bound").detail, {
    admissionId: admission.admissionId,
    childId: "real-child-1",
  });
});

test("unbound child is ambiguous with multiple live admissions", async (t) => {
  const f = await setup(t);
  const first = await f.controller.admit({ taskId: "review-sol", model: "provider/sol" });
  const second = await f.controller.admit({ taskId: "review-opus", model: "provider/opus" });
  await assert.rejects(
    f.controller.report({ childId: "real-child", status: "fail" }),
    (error) => error.code === "E_ADMISSION_AMBIGUOUS",
    "expected E_ADMISSION_AMBIGUOUS rather than guessing a live admission",
  );
  const result = await f.controller.report({
    admissionId: second.admissionId,
    childId: "real-child",
    status: "fail",
  });
  assert.equal(result.taskId, "review-opus");
  assert.notEqual(first.admissionId, second.admissionId);
});

test("timeout cancel retry and late report use Task 11 transitions", async (t) => {
  const f = await setup(t);
  await f.controller.admit({ taskId: "14", model: "provider/model" });
  await f.controller.progress({ taskId: "14", event: "running" });
  f.clock.advance(91 * 60 * 1000);
  const timedOut = await f.controller.progress({ taskId: "14", event: "timeout" });
  assert.equal(timedOut.lifecycle.status, "timed-out");
  const retry = await f.controller.retry({
    taskId: "14",
    deletion: { deleted: true, terminalState: "cancelled" },
  });
  assert.equal(retry.lifecycle.status, "retrying");
  await f.controller.progress({ taskId: "14", event: "running" });
  f.clock.advance(91 * 60 * 1000);
  await f.controller.progress({ taskId: "14", event: "timeout" });
  const late = await f.controller.receiveReport({
    taskId: "14", digest: "b".repeat(64), late: true,
  });
  assert.equal(late.lifecycle.status, "quarantined-late-report");
});

test("admission cap, review loop, concurrence, and outcome closure flow through adapter", async (t) => {
  const f = await setup(t);
  for (let index = 0; index < 12; index++) {
    await appendLedger(f.ledgerPath, {
      runId: f.runId, taskId: "capped", event: "admission",
      detail: { scope: "task", taskId: "capped", index },
    }, { clock: f.clock });
  }
  await assert.rejects(
    f.controller.admit({ taskId: "capped", model: "provider/model" }),
    (error) => error.code === "E_TASK_CAP",
  );
  await f.controller.openReview({
    taskId: "14", reviewId: "task-14", round: 1,
    base: "1".repeat(40), head: "2".repeat(40),
  });
  await assert.rejects(
    f.controller.rule({
      taskId: "14",
      finding: { id: "F-1", severity: "Major", authorFamily: "openai" },
      change: { severity: "Minor", reviewerFamily: "openai", independent: true },
    }),
    (error) => error.code === "E_CONCURRENCE",
  );
  const outcome = {
    frozenCriteria: ["green"], rounds: [], interventions: [], elapsedMs: 1,
    admissionsBySeat: {}, availableUsageBySeat: {}, uniqueAcceptedFindings: [],
    effects: [], geminiSimplicityVerdict: "No simpler equivalent was identified.",
  };
  assert.equal((await f.controller.closeOutcome({ taskId: "14", outcome })).ok, true);
});

test("frozen CLI accepts only admit report status and rejects capability flags", () => {
  assert.deepEqual(parseControllerArgs(["admit", "--task", "14", "--model", "provider/model", "--json"]), {
    command: "admit", taskId: "14", model: "provider/model", json: true,
  });
  assert.deepEqual(parseControllerArgs(["report", "--child", "child-1", "--status", "ok", "--json"]), {
    command: "report", childId: "child-1", status: "ok", json: true,
  });
  assert.deepEqual(parseControllerArgs([
    "report", "--admission", "admission-1", "--child", "child-1", "--status", "ok", "--json",
  ]), {
    command: "report", admissionId: "admission-1", childId: "child-1", status: "ok", json: true,
  });
  assert.deepEqual(parseControllerArgs(["status", "--json"]), { command: "status", json: true });
  for (const argv of [
    ["admit", "--task", "14", "--model", "m"],
    ["status", "--json", "--daemon-socket", "/secret"],
    ["report", "--child", "c", "--status", "other", "--json"],
  ]) assert.throws(() => parseControllerArgs(argv), (error) => error.code === "E_CONTROLLER_REQUIRED");
});
