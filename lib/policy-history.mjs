import { appendFile, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";

export const POLICY_LIMITS = Object.freeze({
  discovery: 20,
  task: 12,
  run: 80,
  reviewRounds: 5,
});

export class PolicyError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PolicyError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new PolicyError(code, detail);
}

function text(value, field) {
  if (typeof value !== "string" || value.trim() === "") fail("E_POLICY_RECORD", `${field} is required`);
  return value;
}

function timestamp(clock) {
  const value = clock?.now?.() ?? new Date();
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.valueOf())) fail("E_CLOCK", "clock returned an invalid timestamp");
  return parsed.toISOString();
}

function hasSecret(value, key = "") {
  if (/api.?key|authorization|password|secret/iu.test(key)) return true;
  if (/token/iu.test(key) && typeof value === "string") return true;
  if (typeof value === "string") {
    return /\b(?:sk|key|token)[-_][A-Za-z0-9_-]{8,}\b/u.test(value) ||
      /bearer\s+[A-Za-z0-9._-]+/iu.test(value);
  }
  if (Array.isArray(value)) return value.some((item) => hasSecret(item));
  return value && typeof value === "object" &&
    Object.entries(value).some(([childKey, child]) => hasSecret(child, childKey));
}

function validateRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail("E_POLICY_RECORD", "record must be an object");
  }
  const keys = Object.keys(record);
  if (keys.length !== 5 || !["ts", "runId", "taskId", "event", "detail"].every((key) => keys.includes(key))) {
    fail("E_POLICY_RECORD", "record must use the frozen envelope");
  }
  for (const field of ["ts", "runId", "taskId", "event"]) text(record[field], field);
  if (!Number.isFinite(Date.parse(record.ts)) || !record.detail ||
      typeof record.detail !== "object" || Array.isArray(record.detail)) {
    fail("E_POLICY_RECORD", "timestamp or detail is invalid");
  }
  if (hasSecret(record)) fail("E_SECRET", "policy history must not contain credentials");
  return record;
}

export function authorizeAdmission(records, request) {
  const admissions = records.filter((record) => record.event === "admission");
  if (admissions.length >= POLICY_LIMITS.run) fail("E_RUN_CAP", "whole-run admission cap reached");
  if (request.scope === "discovery") {
    const discovery = admissions.filter((record) => record.detail.scope === "discovery").length;
    if (discovery >= POLICY_LIMITS.discovery) fail("E_DISCOVERY_CAP", "discovery/spec admission cap reached");
  } else if (request.scope === "task") {
    const perTask = admissions.filter((record) =>
      record.detail.scope === "task" && record.detail.taskId === request.taskId
    ).length;
    if (perTask >= POLICY_LIMITS.task) fail("E_TASK_CAP", `task ${request.taskId} admission cap reached`);
  } else {
    fail("E_ADMISSION_SCOPE", "scope must be discovery or task");
  }
  return { ok: true, remaining: {
    run: POLICY_LIMITS.run - admissions.length - 1,
  } };
}

export function attributeFindings({ primary, later }) {
  text(primary?.seat, "primary.seat");
  if (!Array.isArray(primary.findings) || !Array.isArray(later)) {
    fail("E_FINDINGS", "sealed primary and later findings are required");
  }
  const seen = new Set();
  const attributed = [];
  const add = (finding, seat, order) => {
    text(finding?.id, "finding.id");
    if (seen.has(finding.id)) return;
    seen.add(finding.id);
    attributed.push(Object.freeze({ ...structuredClone(finding), seat, order }));
  };
  primary.findings.forEach((finding) => add(finding, primary.seat, "sealed-primary"));
  for (const result of later) {
    text(result?.seat, "later.seat");
    if (!Array.isArray(result.findings)) fail("E_FINDINGS", "later findings must be arrays");
    result.findings.forEach((finding) => add(finding, result.seat, "later-unique"));
  }
  return attributed;
}

export function requireGateClosure(findings) {
  const cannotVerify = findings.filter((finding) => finding.status === "cannot-verify");
  if (cannotVerify.length) fail("E_CANNOT_VERIFY", cannotVerify.map((finding) => finding.id).join(","));
  const open = findings.filter((finding) =>
    finding.status === "accepted" && ["Blocker", "Major"].includes(finding.severity)
  );
  if (open.length) fail("E_FINDINGS_OPEN", open.map((finding) => finding.id).join(","));
  const deferredMinors = findings
    .filter((finding) => finding.status === "deferred" && finding.severity === "Minor")
    .map((finding) => finding.id);
  return { ok: true, deferredMinors };
}

export function validateSeverityChange(finding, change) {
  text(finding?.id, "finding.id");
  if (["Blocker", "Major"].includes(finding.severity) &&
      (change?.severity === "Minor" || change?.severity === "Settled")) {
    if (change.independent !== true || !change.reviewerFamily ||
        change.reviewerFamily === finding.authorFamily ||
        !change.rationale || !change.evidence) {
      fail("E_CONCURRENCE", "material downgrade needs independent cross-family evidence");
    }
  }
  return { ok: true };
}

export function validateReviewRound(existingRounds, nextRound) {
  if (!Number.isInteger(nextRound) || nextRound < 1) fail("E_REVIEW_ROUND", "round is invalid");
  if (nextRound > POLICY_LIMITS.reviewRounds) fail("E_REVIEW_CAP", "five review rounds exhausted");
  const maximum = existingRounds.length ? Math.max(...existingRounds) : 0;
  if (nextRound !== maximum + 1) fail("E_REVIEW_ROUND", "review rounds cannot skip or repeat");
  return true;
}

export function validateOutcome(value) {
  const validators = {
    frozenCriteria: (item) => Array.isArray(item) && item.length > 0,
    rounds: Array.isArray,
    interventions: Array.isArray,
    elapsedMs: (item) => Number.isFinite(item) && item >= 0,
    admissionsBySeat: (item) => item && typeof item === "object" && !Array.isArray(item),
    availableUsageBySeat: (item) => item && typeof item === "object" && !Array.isArray(item),
    uniqueAcceptedFindings: Array.isArray,
    effects: Array.isArray,
    geminiSimplicityVerdict: (item) => typeof item === "string" && item.trim() !== "",
  };
  for (const [field, validator] of Object.entries(validators)) {
    if (!Object.hasOwn(value ?? {}, field) || !validator(value[field])) {
      fail("E_OUTCOME_INCOMPLETE", `missing or invalid ${field}`);
    }
  }
  return { ok: true };
}

async function acquire(path, { retries = 100, delayMs = 5 } = {}) {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      return async () => rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (attempt === retries) fail("E_POLICY_LOCKED", "policy history lock is held");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  fail("E_POLICY_LOCKED", "policy history lock is held");
}

async function durableAppend(path, line) {
  await appendFile(path, line, { encoding: "utf8", mode: 0o600 });
  const file = await open(path, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
  const directory = await open(dirname(path), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function appendPolicyHistory(path, input, { clock, lock } = {}) {
  if (hasSecret(input)) fail("E_SECRET", "policy history must not contain credentials");
  if (input.event === "outcome") validateOutcome(input.detail);
  const record = validateRecord({
    ts: timestamp(clock),
    runId: text(input.runId, "runId"),
    taskId: text(input.taskId, "taskId"),
    event: text(input.event, "event"),
    detail: structuredClone(input.detail ?? {}),
  });
  const release = await acquire(path, lock);
  try {
    await durableAppend(path, `${JSON.stringify(record)}\n`);
  } finally {
    await release();
  }
  return record;
}

export async function exportPolicyHistory(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const records = [];
  for (const [index, line] of content.split("\n").entries()) {
    if (!line) continue;
    try {
      records.push(validateRecord(JSON.parse(line)));
    } catch (error) {
      if (error instanceof PolicyError && error.code !== "E_POLICY_RECORD") throw error;
      fail("E_POLICY_CORRUPT", `invalid record at line ${index + 1}`);
    }
  }
  return records;
}

export async function importPolicyHistory(path, records, { lock } = {}) {
  if (!Array.isArray(records)) fail("E_POLICY_IMPORT", "records must be an array");
  const validated = records.map((record) => validateRecord(structuredClone(record)));
  const release = await acquire(path, lock);
  try {
    const existing = await exportPolicyHistory(path);
    if (existing.length) fail("E_POLICY_IMPORT", "import target must be empty");
    if (validated.length) {
      await durableAppend(path, `${validated.map((record) => JSON.stringify(record)).join("\n")}\n`);
    }
  } finally {
    await release();
  }
  return validated.length;
}
