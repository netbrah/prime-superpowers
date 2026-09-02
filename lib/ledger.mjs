import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

export const LEDGER_SCHEMA_VERSION = 1;

export class LedgerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LedgerError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new LedgerError(code, detail);
}

function timestamp(clock) {
  const value = clock?.now?.() ?? new Date();
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.valueOf())) fail("E_CLOCK", "clock returned an invalid timestamp");
  return parsed.toISOString();
}

function text(value, field) {
  if (typeof value !== "string" || value.trim() === "") fail("E_LEDGER_RECORD", `${field} is required`);
  return value;
}

function hasSecret(value, key = "") {
  if (/api.?key|authorization|password|secret|token/iu.test(key)) return true;
  if (typeof value === "string") {
    return /\b(?:sk|key|token)[-_][A-Za-z0-9_-]{8,}\b/u.test(value) ||
      /bearer\s+[A-Za-z0-9._-]+/iu.test(value);
  }
  if (Array.isArray(value)) return value.some((entry) => hasSecret(entry));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([childKey, child]) => hasSecret(child, childKey));
  }
  return false;
}

function validateEnvelope(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail("E_LEDGER_RECORD", "record must be an object");
  }
  const keys = Object.keys(record);
  if (keys.length !== 5 || !["ts", "runId", "taskId", "event", "detail"].every((key) => keys.includes(key))) {
    fail("E_LEDGER_RECORD", "record must use the frozen envelope");
  }
  for (const key of ["ts", "runId", "taskId", "event"]) text(record[key], key);
  if (!Number.isFinite(Date.parse(record.ts)) || !record.detail ||
      typeof record.detail !== "object" || Array.isArray(record.detail)) {
    fail("E_LEDGER_RECORD", "record timestamp or detail is invalid");
  }
  if (hasSecret(record)) fail("E_SECRET", "ledger records must not contain credentials");
  return record;
}

function validateEvidence(detail) {
  const required = [
    "phase", "command", "cwd", "started_at", "ended_at", "status", "subtest",
    "failure", "artifact", "pre_commit_hash", "post_commit_hash",
    "pre_tree_hash", "post_tree_hash",
  ];
  for (const field of required) {
    if (!Object.hasOwn(detail, field) || detail[field] === null || detail[field] === "") {
      fail("E_EVIDENCE_INCOMPLETE", `missing ${field}`);
    }
  }
  if (!["red", "green"].includes(detail.phase) || !Number.isInteger(detail.status)) {
    fail("E_EVIDENCE_INCOMPLETE", "phase or status is invalid");
  }
  for (const field of ["started_at", "ended_at"]) {
    if (!Number.isFinite(Date.parse(detail[field]))) fail("E_EVIDENCE_INCOMPLETE", `${field} is invalid`);
  }
}

function validateReview(detail, records) {
  for (const field of ["reviewId", "base", "head"]) text(detail[field], field);
  if (!Number.isInteger(detail.round) || detail.round < 1) fail("E_REVIEW_ROUND", "round is invalid");
  if (detail.base === detail.head) fail("E_REVIEW_RANGE", "BASE..HEAD must be non-empty");
  const prior = records.filter((record) =>
    record.event === "review" && record.detail.reviewId === detail.reviewId
  );
  const same = prior.find((record) => record.detail.round === detail.round);
  if (same && (same.detail.base !== detail.base || same.detail.head !== detail.head)) {
    fail("E_REVIEW_RANGE_MUTABLE", "an existing review range cannot change");
  }
  if (same) fail("E_REVIEW_ROUND", "review round already exists");
  const maximum = prior.reduce((value, record) => Math.max(value, record.detail.round), 0);
  if (detail.round !== maximum + 1) fail("E_REVIEW_ROUND", "review rounds must be monotonic");
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function acquire(path, { retries = 100, delayMs = 5 } = {}) {
  const lockPath = `${path}.lock`;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      return async () => rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (attempt === retries) fail("E_LEDGER_LOCKED", "ledger lock is held");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  fail("E_LEDGER_LOCKED", "ledger lock is held");
}

export async function readLedger(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const records = [];
  for (const [index, line] of content.split("\n").entries()) {
    if (line === "" && index === content.split("\n").length - 1) continue;
    if (line.trim() === "") fail("E_LEDGER_CORRUPT", `empty record at line ${index + 1}`);
    try {
      records.push(validateEnvelope(JSON.parse(line)));
    } catch (error) {
      if (error instanceof LedgerError && error.code !== "E_LEDGER_RECORD") throw error;
      fail("E_LEDGER_CORRUPT", `invalid record at line ${index + 1}`);
    }
  }
  if (records.length) {
    const first = records[0];
    if (first.event !== "plan" || first.detail.schemaVersion !== LEDGER_SCHEMA_VERSION ||
        !/^[0-9a-f]{64}$/u.test(first.detail.planHash) ||
        !Array.isArray(first.detail.acceptanceCommands) || !first.detail.acceptanceCommands.length) {
      fail("E_LEDGER_CORRUPT", "initial plan identity is invalid");
    }
    if (records.some((record) => record.runId !== first.runId)) {
      fail("E_LEDGER_CORRUPT", "history contains multiple run identities");
    }
  }
  return records;
}

export async function createLedger(path, identity, { clock } = {}) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  if (!/^[0-9a-f]{64}$/u.test(identity?.planHash) ||
      !Array.isArray(identity?.acceptanceCommands) || !identity.acceptanceCommands.length ||
      identity.acceptanceCommands.some((command) => typeof command !== "string" || !command)) {
    fail("E_PLAN_IDENTITY", "plan hash and acceptance commands are required");
  }
  const record = validateEnvelope({
    ts: timestamp(clock),
    runId: text(identity.runId, "runId"),
    taskId: text(identity.taskId, "taskId"),
    event: "plan",
    detail: {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      planHash: identity.planHash,
      acceptanceCommands: [...identity.acceptanceCommands],
    },
  });
  const release = await acquire(path, { retries: 0 });
  try {
    if ((await readLedger(path)).length) fail("E_LEDGER_EXISTS", "ledger is already initialized");
    await atomicWrite(path, `${JSON.stringify(record)}\n`);
  } finally {
    await release();
  }
  return record;
}

export async function appendLedger(path, input, { clock, lock } = {}) {
  if (hasSecret(input)) fail("E_SECRET", "ledger records must not contain credentials");
  const release = await acquire(path, lock);
  try {
    const records = await readLedger(path);
    if (!records.length) fail("E_LEDGER_UNINITIALIZED", "create the ledger before appending");
    if (input.runId !== records[0].runId) fail("E_RUN_ID", "record run does not match ledger");
    if (input.event === "evidence") validateEvidence(input.detail);
    if (input.event === "review") validateReview(input.detail, records);
    if (input.event === "plan") {
      const initial = records[0].detail;
      if (input.detail?.planHash !== initial.planHash ||
          JSON.stringify(input.detail?.acceptanceCommands) !== JSON.stringify(initial.acceptanceCommands)) {
        fail("E_PLAN_FROZEN", "plan identity and acceptance commands are frozen");
      }
      fail("E_PLAN_FROZEN", "plan identity cannot be appended again");
    }
    const record = validateEnvelope({
      ts: timestamp(clock),
      runId: text(input.runId, "runId"),
      taskId: text(input.taskId, "taskId"),
      event: text(input.event, "event"),
      detail: structuredClone(input.detail ?? {}),
    });
    const content = `${records.map((item) => JSON.stringify(item)).join("\n")}\n${JSON.stringify(record)}\n`;
    await atomicWrite(path, content);
    return record;
  } finally {
    await release();
  }
}
