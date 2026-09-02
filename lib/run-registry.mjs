import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const SCHEMA_VERSION = 1;
const RECORD_NAME = "active-run.json";
const TERMINAL_STATES = new Set(["complete", "stopped", "orphaned"]);
const VALID_STATES = new Set([
  "reserved", "running", "detached", "retained", "stopping",
  "complete", "stopped", "orphaned",
]);

export class RunRegistryError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "RunRegistryError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new RunRegistryError(code, detail); };
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function linuxStartIdentity(pid) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
  } catch {
    return `pid:${pid}`;
  }
}

const defaultProcessAdapter = {
  async current() {
    return { pid: process.pid, startIdentity: await linuxStartIdentity(process.pid) };
  },
  async isAlive(pid, startIdentity) {
    try {
      process.kill(pid, 0);
      return (await linuxStartIdentity(pid)) === startIdentity;
    } catch {
      return false;
    }
  },
};

function adapters(options = {}) {
  return {
    clock: options.clock ?? { now: Date.now },
    processAdapter: options.processAdapter ?? defaultProcessAdapter,
  };
}

async function withLock(stateRoot, options, operation) {
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await chmod(stateRoot, 0o700);
  const lockPath = join(stateRoot, "run-registry.lock");
  const attempts = options?.lockAttempts ?? 20;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      try {
        return await operation();
      } finally {
        await rm(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (attempt + 1 === attempts) fail("E_REGISTRY_LOCKED", "clone registry lock is held");
      await sleep(options?.lockDelayMs ?? 10);
    }
  }
}

function validateRecord(record) {
  if (!record || typeof record !== "object" || record.schemaVersion !== SCHEMA_VERSION) {
    fail("E_REGISTRY_SCHEMA", "unsupported or partial registry record");
  }
  for (const key of [
    "runId", "runtimeHome", "daemonSocket", "target", "worktree", "branch",
    "pid", "processStartIdentity", "createdAt", "updatedAt", "state",
  ]) {
    if (record[key] === undefined || record[key] === null || record[key] === "") {
      fail("E_REGISTRY_SCHEMA", `missing ${key}`);
    }
  }
  if (!VALID_STATES.has(record.state)) fail("E_REGISTRY_SCHEMA", "unknown state");
  return record;
}

async function readRecord(stateRoot) {
  try {
    const text = await readFile(join(stateRoot, RECORD_NAME), "utf8");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      fail("E_REGISTRY_CORRUPT", "registry JSON is unreadable");
    }
    return validateRecord(parsed);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(stateRoot, record) {
  const destination = join(stateRoot, RECORD_NAME);
  const temporary = join(stateRoot, `.${RECORD_NAME}.${process.pid}.${crypto.randomUUID()}`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, destination);
  await chmod(destination, 0o600);
  const directory = await open(stateRoot, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function readRun(stateRoot) {
  return readRecord(stateRoot);
}

export async function reserveRun(input, options = {}) {
  const stateRoot = options.stateRoot;
  if (!stateRoot) fail("E_REGISTRY_PATH", "stateRoot is required");
  return withLock(stateRoot, options, async () => {
    const existing = await readRecord(stateRoot);
    const { clock, processAdapter } = adapters(options);
    if (existing) {
      if (existing.state === "retained" ||
          await processAdapter.isAlive(existing.pid, existing.processStartIdentity)) {
        fail("E_RUN_ACTIVE", "a live or retained coordinator already owns this clone");
      }
      if (!options.authorizeTakeover) {
        fail("E_TAKEOVER_REQUIRED", "stale state requires explicit authorization");
      }
      const orphaned = {
        ...existing,
        state: "orphaned",
        updatedAt: clock.now(),
        orphanReason: "coordinator process identity was lost",
      };
      await atomicWrite(stateRoot, orphaned);
      fail("E_RUN_ORPHANED", "existing parent cannot be recovered; duplicate not granted");
    }
    const identity = await processAdapter.current();
    const timestamp = clock.now();
    const record = validateRecord({
      schemaVersion: SCHEMA_VERSION,
      runId: input.runId,
      runtimeHome: input.runtimeHome,
      daemonSocket: input.daemonSocket,
      target: input.target,
      worktree: input.worktree,
      branch: input.branch,
      parentSessionId: null,
      pid: identity.pid,
      processStartIdentity: identity.startIdentity,
      createdAt: timestamp,
      updatedAt: timestamp,
      state: "reserved",
    });
    await atomicWrite(stateRoot, record);
    return Object.freeze({ ...record });
  });
}

export async function recordParentSession(stateRoot, runId, parentSessionId, options = {}) {
  if (!parentSessionId) fail("E_SESSION_REQUIRED", "parent session identity is required");
  return mutate(stateRoot, runId, options, (record, clock) => {
    if (record.parentSessionId && record.parentSessionId !== parentSessionId) {
      fail("E_SESSION_MISMATCH", "parent session cannot be replaced");
    }
    return { ...record, parentSessionId, state: "running", updatedAt: clock.now() };
  });
}

export async function transitionRun(stateRoot, runId, state, options = {}) {
  if (!VALID_STATES.has(state)) fail("E_RUN_STATE", "unknown transition target");
  return mutate(stateRoot, runId, options, (record, clock) => {
    if (options.expectedParentSessionId !== undefined &&
        record.parentSessionId !== options.expectedParentSessionId) {
      fail("E_SESSION_MISMATCH", "operation does not address the recorded parent");
    }
    return { ...record, state, updatedAt: clock.now() };
  });
}

async function mutate(stateRoot, runId, options, transform) {
  return withLock(stateRoot, options, async () => {
    const record = await readRecord(stateRoot);
    if (!record) fail("E_RUN_MISSING", "no run is registered");
    if (record.runId !== runId) fail("E_RUN_MISMATCH", "operation addresses another run");
    const { clock } = adapters(options);
    const updated = validateRecord(transform(record, clock));
    await atomicWrite(stateRoot, updated);
    return Object.freeze({ ...updated });
  });
}

export async function releaseRun(stateRoot, runId, options = {}) {
  return withLock(stateRoot, options, async () => {
    const record = await readRecord(stateRoot);
    if (!record) return false;
    if (record.runId !== runId) fail("E_RUN_MISMATCH", "operation addresses another run");
    if (!TERMINAL_STATES.has(record.state)) {
      fail("E_RUN_NOT_TERMINAL", "active run cannot be released");
    }
    await unlink(join(stateRoot, RECORD_NAME));
    const directory = await open(stateRoot, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return true;
  });
}
