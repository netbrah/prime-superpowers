import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { appendLedger, readLedger } from "./ledger.mjs";
import {
  appendPolicyHistory,
  attributeFindings,
  authorizeAdmission,
  requireGateClosure,
  validateOutcome,
  validateReviewRound,
  validateSeverityChange,
} from "./policy-history.mjs";
import {
  admitAttempt,
  applyLifecycleEvent,
  expireAttempt,
  retryAttempt,
} from "./workflow-state.mjs";

const REFUSAL_CODES = new Set([
  "E_DEPTH_SOURCE",
  "E_DEPTH_VALUE",
  "E_DAEMON_UNREACHABLE",
  "E_CONTROLLER_REQUIRED",
]);
const SENSITIVE_ENV = [
  "PRIME_AGENT_DAEMON_SOCKET",
  "PRIME_ACTIVE_SESSION_ID",
  "PRIME_AGENT_SESSION_ID",
];

export class ControllerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ControllerError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new ControllerError(code, detail);
}

function required(value, field) {
  if (typeof value !== "string" || value.trim() === "") fail("E_CONTROLLER_REQUIRED", `${field} is required`);
  return value;
}

function clockNow(clock) {
  const value = clock?.now?.() ?? new Date();
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.valueOf())) fail("E_CONTROLLER_REQUIRED", "clock is invalid");
  return parsed;
}

export async function requestDepthVerdict(endpointPath, { timeoutMs = 3000 } = {}) {
  return new Promise((resolveVerdict, rejectVerdict) => {
    const socket = createConnection(endpointPath);
    let buffer = "";
    let settled = false;
    const timeout = setTimeout(
      () => finish(new ControllerError("E_DAEMON_UNREACHABLE", "launcher verdict timed out")),
      timeoutMs,
    );
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) rejectVerdict(error);
      else resolveVerdict(value);
    }
    socket.on("connect", () => socket.write('{"type":"depth_verdict"}\n'));
    socket.on("error", () => finish(new ControllerError("E_DAEMON_UNREACHABLE", "launcher verdict unavailable")));
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      let response;
      try {
        response = JSON.parse(buffer.slice(0, newline));
      } catch {
        finish(new ControllerError("E_DAEMON_UNREACHABLE", "launcher verdict malformed"));
        return;
      }
      const keys = Object.keys(response ?? {}).sort();
      const validShape = response?.ok === true
        ? keys.length === 1 && keys[0] === "ok"
        : response?.ok === false && keys.length === 2 &&
          keys[0] === "code" && keys[1] === "ok" && REFUSAL_CODES.has(response.code);
      if (!validShape) {
        finish(new ControllerError("E_DAEMON_UNREACHABLE", "launcher verdict violated its frozen shape"));
      } else if (!response.ok) {
        finish(new ControllerError(response.code, "launcher refused admission"));
      } else {
        finish(null, { ok: true });
      }
    });
    socket.on("end", () => {
      if (!settled) finish(new ControllerError("E_DAEMON_UNREACHABLE", "launcher verdict ended early"));
    });
  });
}

export function resolveControllerContext({ kitRoot, env }) {
  for (const name of SENSITIVE_ENV) {
    if (Object.hasOwn(env, name)) {
      fail("E_CONTROLLER_REQUIRED", "daemon capabilities must remain launcher-owned");
    }
  }
  const runtimeHome = resolve(required(env.PRIME_AGENT_CODING_AGENT_DIR, "PRIME_AGENT_CODING_AGENT_DIR"));
  const absoluteKit = resolve(kitRoot);
  const runsRoot = join(absoluteKit, ".state", "runs");
  const runRoot = dirname(runtimeHome);
  const runId = basename(runRoot);
  const expected = join(runsRoot, runId, "agent-home");
  if (runtimeHome !== expected || relative(runsRoot, runRoot).split(sep).some((part) => part === "..")) {
    fail("E_CONTROLLER_REQUIRED", "runtime home is outside the kit run registry");
  }
  return Object.freeze({
    kitRoot: absoluteKit,
    runId,
    runRoot,
    runtimeHome,
    ledgerPath: join(runRoot, "ledger.jsonl"),
    endpointPath: join(runRoot, "depth-verdict.sock"),
    policyHistoryPath: join(absoluteKit, ".state", "policy-history.jsonl"),
  });
}

export function emitPrimeSnippets() {
  return Object.freeze({
    resolve: "observed_result = await rlm.find_models(model_query)",
    run: "observed_result = await rlm.run(validated_prompt, name=child_name, model=exact_selector, thinking=effort)",
    poll: "observed_result = await rlm.list_subagents()",
    cancel: "observed_result = await rlm.delete_subagent(child_handle)",
    notify: "observed_result = await agent_message.send(message, receiver_role='parent')",
  });
}

function runSnippet(lifecycle) {
  return [
    `child_name = ${JSON.stringify(lifecycle.attemptName)}`,
    `exact_selector = ${JSON.stringify(lifecycle.selector)}`,
    "observed_result = await rlm.run(validated_prompt, name=child_name, model=exact_selector, thinking=effort)",
    "observed_result",
  ].join("\n");
}

function latestLifecycle(records, taskId) {
  const record = [...records].reverse().find((item) =>
    item.taskId === taskId && item.detail?.lifecycle
  );
  if (!record) fail("E_CONTROLLER_REQUIRED", `task ${taskId} has no managed admission`);
  return record.detail.lifecycle;
}

function latestOpenLifecycle(records) {
  const terminal = new Set(["completed", "failed", "cleanup-failed", "quarantined-late-report"]);
  const candidates = new Map();
  for (const record of records) {
    if (record.detail?.lifecycle) candidates.set(record.taskId, record.detail.lifecycle);
  }
  const open = [...candidates.entries()].filter(([, lifecycle]) => !terminal.has(lifecycle.status));
  if (open.length !== 1) fail("E_CONTROLLER_REQUIRED", "exactly one managed live attempt is required");
  return { taskId: open[0][0], lifecycle: open[0][1] };
}

export function createWorkflowController(options) {
  const {
    runId, runRoot, ledgerPath, endpointPath, policyHistoryPath,
    clock = { now: () => new Date() },
  } = options;

  async function persist(taskId, event, lifecycle, detail = {}) {
    return appendLedger(ledgerPath, {
      runId,
      taskId,
      event,
      detail: { ...detail, lifecycle },
    }, { clock });
  }

  async function admit({ taskId, model }) {
    required(taskId, "taskId");
    required(model, "model");
    await requestDepthVerdict(endpointPath);
    const records = await readLedger(ledgerPath);
    authorizeAdmission(records, { scope: taskId === "discovery" ? "discovery" : "task", taskId });
    const admittedAt = clockNow(clock);
    const attemptId = `admission-${randomUUID()}`;
    const safeTask = taskId.replace(/[^A-Za-z0-9_.-]/gu, "-");
    const reportPath = join(runRoot, "reports", `${safeTask}-attempt-1.json`);
    const lifecycle = admitAttempt({
      taskId,
      attemptId,
      attemptName: `task-${safeTask}-attempt-1`,
      selector: model,
      reportPath,
      parentSession: `launcher-owned:${runId}`,
      deadlineAt: new Date(admittedAt.valueOf() + 90 * 60 * 1000).toISOString(),
    }, { clock, existing: records.flatMap((record) => record.detail?.lifecycle ? [record.detail.lifecycle] : []) });
    await persist(taskId, "admission", lifecycle, {
      scope: taskId === "discovery" ? "discovery" : "task",
      taskId,
      admissionId: attemptId,
      model,
    });
    await appendPolicyHistory(policyHistoryPath, {
      runId,
      taskId,
      event: "admission",
      detail: {
        scope: taskId === "discovery" ? "discovery" : "task",
        taskId,
        seat: model,
      },
    }, { clock });
    return {
      ok: true,
      admissionId: attemptId,
      childName: lifecycle.attemptName,
      reportPath,
      deadlineAt: lifecycle.deadline_at,
      snippet: runSnippet(lifecycle),
    };
  }

  async function dispatch({ admissionId }) {
    const records = await readLedger(ledgerPath);
    const admission = records.find((record) =>
      record.event === "admission" && record.detail.admissionId === admissionId &&
      record.detail.lifecycle?.status === "admitted"
    );
    if (!admission) fail("E_CONTROLLER_REQUIRED", "dispatch requires a persisted managed admission");
    return { ok: true, snippet: runSnippet(admission.detail.lifecycle) };
  }

  async function progress({ taskId, event }) {
    const records = await readLedger(ledgerPath);
    const current = latestLifecycle(records, taskId);
    const lifecycle = event === "timeout"
      ? expireAttempt(current, { clock })
      : applyLifecycleEvent(current, event, {}, { clock });
    await persist(taskId, event === "timeout" ? "timed-out" : event, lifecycle);
    return { ok: true, lifecycle };
  }

  async function retry({ taskId, deletion }) {
    const records = await readLedger(ledgerPath);
    const current = latestLifecycle(records, taskId);
    const safeTask = taskId.replace(/[^A-Za-z0-9_.-]/gu, "-");
    const lifecycle = await retryAttempt(current, {
      attemptId: `admission-${randomUUID()}`,
      attemptName: `task-${safeTask}-attempt-2`,
      deadlineAt: new Date(clockNow(clock).valueOf() + 90 * 60 * 1000).toISOString(),
    }, {
      clock,
      rlm: { deleteSubagent: async () => deletion },
    });
    await persist(taskId, "retrying", lifecycle);
    return { ok: true, lifecycle, snippet: runSnippet(lifecycle) };
  }

  async function receiveReport({ taskId, digest }) {
    const records = await readLedger(ledgerPath);
    const current = latestLifecycle(records, taskId);
    const lifecycle = applyLifecycleEvent(current, "report", { digest }, { clock });
    await persist(taskId, lifecycle.status, lifecycle);
    return { ok: true, lifecycle };
  }

  async function report({ childId, status }) {
    required(childId, "childId");
    if (!["ok", "fail"].includes(status)) fail("E_CONTROLLER_REQUIRED", "status must be ok or fail");
    const records = await readLedger(ledgerPath);
    let { taskId, lifecycle } = latestOpenLifecycle(records);
    if (status === "fail") {
      lifecycle = applyLifecycleEvent(lifecycle, "fail", { reason: `child ${childId} failed` }, { clock });
      await persist(taskId, "failed", lifecycle, { childId });
    } else {
      if (["admitted", "queued", "retrying"].includes(lifecycle.status)) {
        lifecycle = applyLifecycleEvent(lifecycle, "running", {}, { clock });
        await persist(taskId, "running", lifecycle, { childId });
      }
      let bytes;
      try {
        bytes = await readFile(lifecycle.reportPath);
      } catch {
        fail("E_CONTROLLER_REQUIRED", "managed disk report is missing");
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      lifecycle = applyLifecycleEvent(lifecycle, "report", { digest }, { clock });
      await persist(taskId, "reported", lifecycle, { childId });
      lifecycle = applyLifecycleEvent(lifecycle, "complete", {}, { clock });
      await persist(taskId, "completed", lifecycle, { childId });
    }
    await appendLedger(ledgerPath, {
      runId,
      taskId,
      event: "report-ack",
      detail: { childId, status },
    }, { clock });
    return { ok: true, taskId, lifecycle };
  }

  async function status() {
    const records = await readLedger(ledgerPath);
    const states = {};
    for (const record of records) {
      if (record.detail?.lifecycle) states[record.taskId] = record.detail.lifecycle;
    }
    return { ok: true, runId, states, pollSnippet: emitPrimeSnippets().poll };
  }

  async function openReview(input) {
    const records = await readLedger(ledgerPath);
    const rounds = records.filter((record) =>
      record.event === "review" && record.detail.reviewId === input.reviewId
    ).map((record) => record.detail.round);
    validateReviewRound(rounds, input.round);
    await appendLedger(ledgerPath, {
      runId, taskId: input.taskId, event: "review",
      detail: {
        reviewId: input.reviewId, round: input.round,
        base: input.base, head: input.head,
      },
    }, { clock });
    return { ok: true };
  }

  async function recordFinding({ taskId, finding, primary, later }) {
    const attributed = primary
      ? attributeFindings({ primary, later: later ?? [] })
      : [finding];
    await appendLedger(ledgerPath, {
      runId, taskId, event: "finding", detail: { findings: attributed },
    }, { clock });
    return { ok: true, findings: attributed };
  }

  async function rule({ taskId, finding, change }) {
    validateSeverityChange(finding, change);
    await appendLedger(ledgerPath, {
      runId, taskId, event: "ruling", detail: { finding, change },
    }, { clock });
    return { ok: true };
  }

  async function closeReview({ taskId, findings }) {
    const closure = requireGateClosure(findings);
    await appendLedger(ledgerPath, {
      runId, taskId, event: "review-closed", detail: closure,
    }, { clock });
    return closure;
  }

  async function closeOutcome({ taskId, outcome }) {
    validateOutcome(outcome);
    await appendLedger(ledgerPath, {
      runId, taskId, event: "outcome", detail: outcome,
    }, { clock });
    await appendPolicyHistory(policyHistoryPath, {
      runId, taskId, event: "outcome", detail: outcome,
    }, { clock });
    return { ok: true };
  }

  return Object.freeze({
    resolveModels: () => ({ ok: true, snippet: emitPrimeSnippets().resolve }),
    admit,
    dispatch,
    poll: status,
    status,
    progress,
    cancel: async ({ taskId }) => {
      const records = await readLedger(ledgerPath);
      latestLifecycle(records, taskId);
      await appendLedger(ledgerPath, {
        runId, taskId, event: "cancel-requested", detail: {},
      }, { clock });
      return { ok: true, snippet: emitPrimeSnippets().cancel };
    },
    retry,
    receiveReport,
    report,
    openReview,
    recordFinding,
    rule,
    closeReview,
    closeOutcome,
  });
}

export function parseControllerArgs(argv) {
  const command = argv[0];
  if (!["admit", "report", "status"].includes(command)) {
    fail("E_CONTROLLER_REQUIRED", "unsupported controller command");
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--json") {
      if (values.has(flag)) fail("E_CONTROLLER_REQUIRED", "duplicate --json");
      values.set(flag, true);
      continue;
    }
    if (!["--task", "--model", "--child", "--status"].includes(flag) ||
        index + 1 >= argv.length || argv[index + 1].startsWith("--") || values.has(flag)) {
      fail("E_CONTROLLER_REQUIRED", "arguments do not match the frozen CLI");
    }
    values.set(flag, argv[++index]);
  }
  if (!values.get("--json")) fail("E_CONTROLLER_REQUIRED", "--json is required");
  if (command === "admit" && values.size === 3 && values.has("--task") && values.has("--model")) {
    return { command, taskId: values.get("--task"), model: values.get("--model"), json: true };
  }
  if (command === "report" && values.size === 3 && values.has("--child") &&
      ["ok", "fail"].includes(values.get("--status"))) {
    return { command, childId: values.get("--child"), status: values.get("--status"), json: true };
  }
  if (command === "status" && values.size === 1) return { command, json: true };
  fail("E_CONTROLLER_REQUIRED", "arguments do not match the frozen CLI");
}

export async function cli(argv, {
  env = process.env,
  stdout = process.stdout,
  kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
} = {}) {
  const parsed = parseControllerArgs(argv);
  const context = resolveControllerContext({ kitRoot, env });
  const controller = createWorkflowController(context);
  const result = parsed.command === "admit"
    ? await controller.admit({ taskId: parsed.taskId, model: parsed.model })
    : parsed.command === "report"
      ? await controller.report({ childId: parsed.childId, status: parsed.status })
      : await controller.status();
  stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}

