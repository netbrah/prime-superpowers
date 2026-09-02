export const LIFECYCLE_SCHEMA_VERSION = 1;

const LIVE = new Set(["admitted", "queued", "running", "reported", "retrying"]);
const TERMINAL = new Set([
  "completed",
  "failed",
  "cleanup-failed",
  "quarantined-late-report",
]);
const TOMBSTONES = new Set(["cancelled", "tombstoned"]);

export class LifecycleError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LifecycleError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new LifecycleError(code, detail);
}

function now(clock) {
  const value = clock?.now?.();
  const iso = value instanceof Date ? value.toISOString() : value;
  if (typeof iso !== "string" || !Number.isFinite(Date.parse(iso))) {
    fail("E_CLOCK", "clock must return an ISO timestamp");
  }
  return new Date(iso).toISOString();
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("E_LIFECYCLE_INPUT", `${field} is required`);
  }
  return value;
}

function validate(state) {
  if (!state || state.schemaVersion !== LIFECYCLE_SCHEMA_VERSION) {
    fail("E_LIFECYCLE_SCHEMA", "unsupported lifecycle schema");
  }
  for (const key of [
    "taskId", "attemptId", "attemptName", "selector", "reportPath",
    "parentSession", "admitted_at", "deadline_at", "status",
  ]) requiredString(state[key], key);
  if (!Number.isInteger(state.attempt) || state.attempt < 1 || state.attempt > 2) {
    fail("E_LIFECYCLE_SCHEMA", "attempt number is invalid");
  }
  return state;
}

function clone(state) {
  return structuredClone(validate(state));
}

export function admitAttempt(input, { clock, existing = [] } = {}) {
  const taskId = requiredString(input?.taskId, "taskId");
  const attemptId = requiredString(input?.attemptId, "attemptId");
  const attemptName = requiredString(input?.attemptName, "attemptName");
  const admittedAt = now(clock);
  const deadlineAt = new Date(requiredString(input?.deadlineAt, "deadlineAt")).toISOString();
  if (Date.parse(deadlineAt) <= Date.parse(admittedAt)) {
    fail("E_DEADLINE", "deadline must be after admission");
  }
  for (const other of existing) {
    validate(other);
    if (other.taskId === taskId && LIVE.has(other.status)) {
      fail("E_ATTEMPT_LIVE", `task ${taskId} already has a live attempt`);
    }
    const names = new Set([other.attemptName, ...(other.attemptNames ?? [])]);
    const ids = new Set([other.attemptId, ...(other.attemptIds ?? [])]);
    if (names.has(attemptName) || ids.has(attemptId)) {
      fail("E_ATTEMPT_IDENTITY", "attempt names and ids must be unique");
    }
  }
  return Object.freeze({
    schemaVersion: LIFECYCLE_SCHEMA_VERSION,
    taskId,
    attempt: 1,
    attemptId,
    attemptName,
    attemptIds: [attemptId],
    attemptNames: [attemptName],
    selector: requiredString(input.selector, "selector"),
    reportPath: requiredString(input.reportPath, "reportPath"),
    parentSession: requiredString(input.parentSession, "parentSession"),
    status: "admitted",
    admitted_at: admittedAt,
    started_at: null,
    last_progress_at: admittedAt,
    deadline_at: deadlineAt,
    reported_at: null,
    completed_at: null,
  });
}

const TRANSITIONS = Object.freeze({
  queued: { from: new Set(["admitted", "retrying"]), to: "queued" },
  running: { from: new Set(["admitted", "queued", "retrying"]), to: "running" },
  progress: { from: new Set(["queued", "running"]), to: null },
  complete: { from: new Set(["reported"]), to: "completed" },
  fail: { from: new Set(["admitted", "queued", "running", "reported", "retrying"]), to: "failed" },
  "cleanup-failed": { from: new Set(["timed-out"]), to: "cleanup-failed" },
});

export function applyLifecycleEvent(current, event, detail = {}, { clock } = {}) {
  const state = clone(current);
  const timestamp = now(clock);

  if (event === "report") {
    requiredString(detail.digest, "digest");
    if (state.status === "timed-out" || state.status === "cleanup-failed") {
      return Object.freeze({
        ...state,
        status: "quarantined-late-report",
        quarantined_at: timestamp,
        lateReportDigest: detail.digest,
      });
    }
    if (!new Set(["queued", "running"]).has(state.status)) {
      fail("E_LIFECYCLE_TRANSITION", `cannot report from ${state.status}`);
    }
    return Object.freeze({
      ...state,
      status: "reported",
      reported_at: timestamp,
      reportDigest: detail.digest,
    });
  }

  const transition = TRANSITIONS[event];
  if (!transition || !transition.from.has(state.status) || TERMINAL.has(state.status)) {
    fail("E_LIFECYCLE_TRANSITION", `cannot apply ${event} from ${state.status}`);
  }
  const update = {
    ...state,
    status: transition.to ?? state.status,
    last_progress_at: event === "progress" ? timestamp : state.last_progress_at,
  };
  if (event === "running" && !update.started_at) update.started_at = timestamp;
  if (event === "complete") update.completed_at = timestamp;
  if (event === "fail") {
    update.failed_at = timestamp;
    update.failureReason = detail.reason ?? "unspecified";
  }
  if (event === "cleanup-failed") update.cleanup_failed_at = timestamp;
  return Object.freeze(update);
}

export function expireAttempt(current, { clock } = {}) {
  const state = clone(current);
  if (!new Set(["admitted", "queued", "running", "retrying"]).has(state.status)) {
    fail("E_LIFECYCLE_TRANSITION", `cannot expire ${state.status}`);
  }
  const timestamp = now(clock);
  if (Date.parse(timestamp) <= Date.parse(state.deadline_at)) {
    fail("E_DEADLINE_ACTIVE", "attempt deadline has not expired");
  }
  return Object.freeze({ ...state, status: "timed-out", timed_out_at: timestamp });
}

export async function retryAttempt(current, retry, { clock, rlm } = {}) {
  const state = clone(current);
  if (state.attempt >= 2) fail("E_RETRY_EXHAUSTED", "only one retry is allowed");
  if (state.status !== "timed-out") {
    if (state.status === "retrying") fail("E_RETRY_EXHAUSTED", "retry is already active");
    fail("E_LIFECYCLE_TRANSITION", `cannot retry from ${state.status}`);
  }
  const attemptId = requiredString(retry?.attemptId, "attemptId");
  const attemptName = requiredString(retry?.attemptName, "attemptName");
  if (state.attemptIds.includes(attemptId) || state.attemptNames.includes(attemptName)) {
    fail("E_ATTEMPT_IDENTITY", "retry requires a fresh id and name");
  }
  if (typeof rlm?.deleteSubagent !== "function") {
    fail("E_CLEANUP_UNCONFIRMED", "RLM deletion adapter is required");
  }
  let deletion;
  try {
    deletion = await rlm.deleteSubagent(state.attemptId);
  } catch {
    fail("E_CLEANUP_UNCONFIRMED", "RLM deletion failed");
  }
  if (deletion?.deleted !== true || !TOMBSTONES.has(deletion?.terminalState)) {
    fail("E_CLEANUP_UNCONFIRMED", "cancellation tombstone was not confirmed");
  }
  const admittedAt = now(clock);
  const deadlineAt = retry.deadlineAt
    ? new Date(retry.deadlineAt).toISOString()
    : state.deadline_at;
  return Object.freeze({
    ...state,
    attempt: 2,
    attemptId,
    attemptName,
    attemptIds: [...state.attemptIds, attemptId],
    attemptNames: [...state.attemptNames, attemptName],
    status: "retrying",
    admitted_at: admittedAt,
    started_at: null,
    last_progress_at: admittedAt,
    deadline_at: deadlineAt,
    reported_at: null,
    completed_at: null,
    reportDigest: undefined,
    timed_out_at: undefined,
  });
}
