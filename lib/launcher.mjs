import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { applyArgvFirewall } from "./argv-firewall.mjs";
import { generateModelsJson, loadConfig } from "./config.mjs";
import { createLedger, readLedger } from "./ledger.mjs";
import { runPrimeProcess } from "./launcher-process.mjs";
import { readRun, recordParentSession, reserveRun, transitionRun } from "./run-registry.mjs";
import { resolveTargetWorktree } from "./worktree.mjs";

const execFile = promisify(execFileCallback);
const PACKAGE_SOURCE = "git:github.com/obra/superpowers@v6.3.0";
const REQUIRED_SKILLS = [
  "brainstorming",
  "verification-before-completion",
  "requesting-code-review",
];
const IMMUTABLE_KINDS = new Set(["template", "models"]);
const IMPLEMENTATION_PLAN = "docs/specs/2026-08-26-prime-superpowers-implementation-plan.md";
const FROZEN_ACCEPTANCE_COMMANDS = Object.freeze([
  "node --test",
  "bash tests/test-package.sh",
  "./scripts/gate",
]);

export class LauncherError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LauncherError";
    this.code = code;
  }
}
const fail = (code, detail) => { throw new LauncherError(code, detail); };

export async function initializeRunLedger({
  runRoot,
  runId,
  planPath,
  acceptanceCommands = FROZEN_ACCEPTANCE_COMMANDS,
}) {
  let planHash;
  try {
    planHash = hashBytes(await readFile(planPath));
  } catch {
    fail("E_PLAN_IDENTITY", "implementation plan is unreadable");
  }
  const identity = {
    runId,
    taskId: "plan",
    planHash,
    acceptanceCommands: [...acceptanceCommands],
  };
  const ledgerPath = join(runRoot, "ledger.jsonl");
  try {
    await createLedger(ledgerPath, identity);
  } catch (error) {
    if (error?.code !== "E_LEDGER_EXISTS") throw error;
    const [initial] = await readLedger(ledgerPath);
    if (initial?.runId !== runId ||
        initial?.event !== "plan" ||
        initial.detail?.planHash !== planHash ||
        JSON.stringify(initial.detail?.acceptanceCommands) !== JSON.stringify(identity.acceptanceCommands)) {
      fail("E_PLAN_IDENTITY", "existing ledger does not match the frozen plan identity");
    }
  }
  return Object.freeze({ ok: true, ledgerPath, planHash });
}

async function pathStat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function walk(root, { rejectSymlinks = false } = {}) {
  const rows = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      if (entry.isSymbolicLink()) {
        if (rejectSymlinks) fail("E_TEMPLATE_SYMLINK", `template contains symlink ${path}`);
        rows.push({ path, type: "symlink", target: await readlink(absolute) });
      } else if (entry.isDirectory()) {
        rows.push({ path, type: "directory" });
        await visit(absolute);
      } else if (entry.isFile()) {
        rows.push({
          path,
          type: "file",
          digest: hashBytes(await readFile(absolute)),
          mode: (await lstat(absolute)).mode & 0o700,
        });
      } else {
        fail("E_UNSUPPORTED_FILE", `unsupported filesystem entry ${path}`);
      }
    }
  }
  await visit(root);
  return rows;
}

export async function computeTreeDigest(root) {
  return hashBytes(Buffer.from(JSON.stringify(await walk(root))));
}

function packageLeaf(source) {
  const match = /^git:([^/@]+)\/(.+?)(?:@([^/]+))?$/u.exec(source);
  if (!match) fail("E_PACKAGE_SOURCE", "unsupported package source");
  const repositoryPath = match[2].replace(/\.git$/u, "");
  if (repositoryPath.split("/").some((part) => !part || part === "." || part === "..")) {
    fail("E_PACKAGE_SOURCE", "package path is unsafe");
  }
  return join("git", match[1], repositoryPath);
}

async function readExpectedDigest(path, code, key) {
  try {
    const index = JSON.parse(await readFile(join(dirname(path), "index.json"), "utf8"));
    const record = index.entries?.[key];
    if (record?.path !== basename(path)) fail(code, "cache index path does not match");
    const digest = record?.treeDigest;
    if (!/^[0-9a-f]{64}$/u.test(digest)) fail(code, "cache digest metadata is malformed");
    return digest;
  } catch (error) {
    if (error.code === code) throw error;
    fail(code, "cache digest metadata is missing");
  }
}

async function assertOwnerOnly(path, code, expectedType = "directory") {
  const stat = await lstat(path);
  const typeMatches = expectedType === "file" ? stat.isFile() : stat.isDirectory();
  const currentUid = typeof process.getuid === "function" ? process.getuid() : stat.uid;
  if (!typeMatches || stat.uid !== currentUid || (stat.mode & 0o077) !== 0) {
    fail(code, `${path} must be current-user owned and owner-only`);
  }
}

async function verifyCachePermissions(entry, code) {
  const cacheRoot = dirname(entry);
  const stateRoot = dirname(cacheRoot);
  await assertOwnerOnly(stateRoot, code);
  await assertOwnerOnly(cacheRoot, code);
  await assertOwnerOnly(entry, code);
  await assertOwnerOnly(join(cacheRoot, "index.json"), code, "file");
}

async function verifyPackage(packageEntry) {
  try {
    if (!(await pathStat(packageEntry))?.isDirectory()) fail("E_PACKAGE_UNRESOLVED", "package cache entry is absent");
    await verifyCachePermissions(packageEntry, "E_CACHE_PERMISSIONS");
    const expected = await readExpectedDigest(packageEntry, "E_PACKAGE_UNRESOLVED", PACKAGE_SOURCE);
    if (await computeTreeDigest(packageEntry) !== expected) {
      fail("E_PACKAGE_UNRESOLVED", "package cache digest mismatch");
    }
    for (const skill of REQUIRED_SKILLS) {
      if (!(await pathStat(join(packageEntry, "skills", skill, "SKILL.md")))?.isFile()) {
        fail("E_PACKAGE_UNRESOLVED", `required skill ${skill} is absent`);
      }
    }
    return expected;
  } catch (error) {
    if (error?.code === "E_PACKAGE_UNRESOLVED") throw error;
    fail("E_PACKAGE_UNRESOLVED", "package cache could not be verified");
  }
}

async function verifyTools(toolCache) {
  if (!(await pathStat(toolCache))?.isDirectory()) fail("E_TOOL_CACHE", "tool cache entry is absent");
  await verifyCachePermissions(toolCache, "E_CACHE_PERMISSIONS");
  const expected = await readExpectedDigest(toolCache, "E_TOOL_CACHE", "prime-0.8.1");
  if (await computeTreeDigest(toolCache) !== expected) fail("E_TOOL_CACHE", "tool cache digest mismatch");
  return expected;
}

function assertSettings(settings) {
  if (settings?.rlmMaxDepth !== 1) fail("E_DEPTH_VALUE", "settings require rlmMaxDepth 1");
  if (!Array.isArray(settings.extensions) || settings.extensions.length !== 0) {
    fail("E_SETTINGS_POLICY", "global extensions must be empty");
  }
  const pinned = settings.packages?.find((entry) => entry?.source === PACKAGE_SOURCE);
  if (!pinned || !Array.isArray(pinned.extensions) || pinned.extensions.length !== 0) {
    fail("E_SETTINGS_POLICY", "pinned package with extensions disabled is required");
  }
  if (Object.hasOwn(settings, "sessionDir")) {
    fail("E_SESSION_DIR", "sessionDir cannot be configured");
  }
}

async function copyTemplate(templateRoot, destination) {
  const rows = await walk(templateRoot, { rejectSymlinks: true });
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const manifest = [];
  for (const row of rows) {
    const output = join(destination, row.path);
    if (row.type === "directory") {
      await mkdir(output, { mode: 0o700 });
    } else {
      await mkdir(dirname(output), { recursive: true, mode: 0o700 });
      await copyFile(join(templateRoot, row.path), output);
      await chmod(output, row.mode || 0o600);
      if (row.path !== "settings.json") manifest.push({ kind: "template", ...row });
    }
  }
  return manifest;
}

async function ensureOwnerOnly(path) {
  await chmod(path, 0o700);
  const stat = await lstat(path);
  if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
    fail("E_STATE_PERMISSIONS", "runtime state must be current-user owner-only");
  }
}

export async function composeRuntimeHome({
  kitRoot,
  runId,
  config,
  templateRoot = join(kitRoot, "agent-home"),
  packageEntry = join(kitRoot, ".state", "packages", "superpowers@v6.3.0"),
  toolCache = join(kitRoot, ".state", "tools", "prime-0.8.1"),
}) {
  const packageDigest = await verifyPackage(packageEntry);
  const toolDigest = await verifyTools(toolCache);
  const stateRoot = join(kitRoot, ".state");
  const runsRoot = join(stateRoot, "runs");
  const runRoot = join(runsRoot, runId);
  const runtimeHome = join(runRoot, "agent-home");
  if (await pathStat(runRoot)) fail("E_RUN_COLLISION", "runtime already exists");
  await mkdir(runsRoot, { recursive: true, mode: 0o700 });
  await ensureOwnerOnly(stateRoot);
  await ensureOwnerOnly(runsRoot);
  const temporary = await mkdtemp(join(runsRoot, `.${runId}.tmp-`));
  await ensureOwnerOnly(temporary);
  const temporaryHome = join(temporary, "agent-home");
  try {
    const entries = await copyTemplate(templateRoot, temporaryHome);
    const settings = JSON.parse(await readFile(join(temporaryHome, "settings.json"), "utf8"));
    assertSettings(settings);
    const models = `${JSON.stringify(generateModelsJson(config), null, 2)}\n`;
    await writeFile(join(temporaryHome, "models.json"), models, { mode: 0o600 });
    entries.push({ kind: "models", path: "models.json", type: "file", digest: hashBytes(Buffer.from(models)) });

    const leaf = packageLeaf(PACKAGE_SOURCE);
    const packageLink = join(temporaryHome, leaf);
    await mkdir(dirname(packageLink), { recursive: true, mode: 0o700 });
    await symlink(packageEntry, packageLink);
    const binLink = join(temporaryHome, "bin");
    await symlink(toolCache, binLink);
    const manifest = {
      schemaVersion: 1,
      packageSource: PACKAGE_SOURCE,
      semanticSettings: {
        rlmMaxDepth: 1,
        package: PACKAGE_SOURCE,
        extensions: [],
      },
      entries,
      links: [
        {
          kind: "package",
          path: leaf.split(sep).join("/"),
          target: packageEntry,
          canonicalTarget: await realpath(packageEntry),
          treeDigest: packageDigest,
        },
        {
          kind: "tools",
          path: "bin",
          target: toolCache,
          canonicalTarget: await realpath(toolCache),
          treeDigest: toolDigest,
        },
      ],
    };
    await writeFile(
      join(temporaryHome, "resources.lock.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    );
    for (const name of ["sessions", "logs", "harness", "daemon"]) {
      await mkdir(join(temporaryHome, name), { mode: 0o700 });
    }
    await rename(temporary, runRoot);
    await ensureOwnerOnly(runRoot);
    const daemonSocket = join(runtimeHome, "daemon", "daemon.sock");
    return Object.freeze({
      runRoot,
      runtimeHome,
      daemonSocket,
      depthVerdictSocket: join(runRoot, "depth-verdict.sock"),
      packageLeaf: join(runtimeHome, leaf),
    });
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyRuntimeHome(runtimeHome) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(runtimeHome, "resources.lock.json"), "utf8"));
    assertSettings(JSON.parse(await readFile(join(runtimeHome, "settings.json"), "utf8")));
  } catch (error) {
    if (error?.code?.startsWith?.("E_")) throw error;
    fail("E_RUNTIME_ORPHANED", "runtime manifest or settings are unreadable");
  }
  const runRoot = dirname(runtimeHome);
  const runsRoot = dirname(runRoot);
  const stateRoot = dirname(runsRoot);
  const kitRoot = dirname(stateRoot);
  for (const path of [stateRoot, runsRoot, runRoot, runtimeHome]) {
    await assertOwnerOnly(path, "E_RUNTIME_ORPHANED");
  }
  const expectedTemplateEntries = (await walk(join(kitRoot, "agent-home"), { rejectSymlinks: true }))
    .filter((entry) => entry.type === "file" && entry.path !== "settings.json");
  const templateEntries = (manifest.entries ?? []).filter((entry) => entry.kind === "template");
  const modelEntries = (manifest.entries ?? []).filter((entry) =>
    entry.kind === "models" && entry.path === "models.json" && entry.type === "file"
  );
  const expectedLinks = new Map([
    [packageLeaf(PACKAGE_SOURCE), {
      kind: "package",
      target: join(stateRoot, "packages", "superpowers@v6.3.0"),
    }],
    ["bin", { kind: "tools", target: join(stateRoot, "tools", "prime-0.8.1") }],
  ]);
  if (manifest.schemaVersion !== 1 ||
      manifest.packageSource !== PACKAGE_SOURCE ||
      manifest.semanticSettings?.rlmMaxDepth !== 1 ||
      manifest.semanticSettings?.package !== PACKAGE_SOURCE ||
      !Array.isArray(manifest.semanticSettings?.extensions) ||
      manifest.semanticSettings.extensions.length !== 0 ||
      templateEntries.length !== expectedTemplateEntries.length ||
      modelEntries.length !== 1 ||
      (manifest.links ?? []).length !== expectedLinks.size) {
    fail("E_RUNTIME_ORPHANED", "runtime manifest is incomplete or unsupported");
  }
  for (const expected of expectedTemplateEntries) {
    const recorded = templateEntries.find((entry) => entry.path === expected.path);
    if (!recorded || recorded.type !== "file" ||
        recorded.digest !== expected.digest || recorded.mode !== expected.mode) {
      fail("E_RUNTIME_ORPHANED", `template manifest changed: ${expected.path}`);
    }
  }
  for (const link of manifest.links) {
    const expected = expectedLinks.get(link.path);
    if (!expected || link.kind !== expected.kind || link.target !== expected.target) {
      fail("E_RUNTIME_ORPHANED", `runtime link declaration changed: ${link.path}`);
    }
  }
  for (const entry of manifest.entries ?? []) {
    if (!IMMUTABLE_KINDS.has(entry.kind)) fail("E_RUNTIME_ORPHANED", "unknown manifest entry");
    const stat = await pathStat(join(runtimeHome, entry.path));
    if (!stat?.isFile() || hashBytes(await readFile(join(runtimeHome, entry.path))) !== entry.digest) {
      fail("E_RUNTIME_ORPHANED", `immutable resource changed: ${entry.path}`);
    }
  }
  for (const link of manifest.links ?? []) {
    const path = join(runtimeHome, link.path);
    const stat = await pathStat(path);
    if (!stat?.isSymbolicLink() ||
        await readlink(path) !== link.target ||
        await realpath(path) !== link.canonicalTarget ||
        await computeTreeDigest(link.canonicalTarget) !== link.treeDigest) {
      fail("E_RUNTIME_ORPHANED", `runtime link changed: ${link.path}`);
    }
  }
  return { ok: true, settings: "semantically-valid" };
}

export function evaluateDepthStatus(status) {
  if (!status || !["global", "inherited"].includes(status.source)) {
    return { ok: false, code: "E_DEPTH_SOURCE" };
  }
  if (status.maxDepth !== 1) return { ok: false, code: "E_DEPTH_VALUE" };
  return { ok: true };
}

export async function queryDepthStatus({ socketPath, activeSessionId, timeoutMs = 3000 }) {
  const response = await daemonRequest({
    socketPath,
    command: { type: "get_rlm_max_depth_status", activeSessionId },
    timeoutMs,
  });
  return response.data;
}

async function daemonRequest({ socketPath, command, timeoutMs = 3000 }) {
  return new Promise((resolveResult, rejectResult) => {
    const socket = createConnection(socketPath);
    const id = `launcher_${randomUUID()}`;
    let buffer = "";
    let hello = false;
    const timeout = setTimeout(() => done(new LauncherError("E_DAEMON_UNREACHABLE", "depth handshake timed out")), timeoutMs);
    function done(error, value) {
      clearTimeout(timeout);
      socket.destroy();
      if (error) rejectResult(error);
      else resolveResult(value);
    }
    socket.on("error", () => done(new LauncherError("E_DAEMON_UNREACHABLE", "daemon connection failed")));
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (!hello && message.type === "daemon_hello") {
          if (message.socketPath !== socketPath ||
              message.protocol?.name !== "prime-agent.daemon" ||
              message.protocol?.version < 7 ||
              (message.schemaRevision ?? 0) < 11) {
            done(new LauncherError("E_DAEMON_UNREACHABLE", "daemon identity or capability mismatch"));
            return;
          }
          hello = true;
          socket.write(`${JSON.stringify({
            type: "command",
            id,
            protocol: { name: "prime-agent.daemon", version: 7 },
            clientId: `prime-kit-launcher:${process.pid}`,
            command: { id, ...command },
          })}\n`);
        } else if (message.type === "response" && message.id === id) {
          if (!message.success || message.command !== command.type) {
            done(new LauncherError("E_DAEMON_UNREACHABLE", "depth request failed"));
          } else {
            done(null, message);
          }
          return;
        }
      }
    });
  });
}

async function discoverParentSession(socketPath, cwd) {
  const response = await daemonRequest({
    socketPath,
    command: { type: "list", all: false, cwd },
  });
  const matches = (response.data?.sessions ?? []).filter((session) =>
    session?.cwd === cwd && session.runtimeKind !== "subagent" && session.activeSessionId
  );
  if (matches.length !== 1) {
    fail("E_DAEMON_UNREACHABLE", "parent session identity is missing or ambiguous");
  }
  return matches[0].activeSessionId;
}

async function waitForParentSession(socketPath, cwd, { attempts = 100, delayMs = 100 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await discoverParentSession(socketPath, cwd);
    } catch (error) {
      lastError = error;
      if (error?.code !== "E_DAEMON_UNREACHABLE") throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
  throw lastError ?? new LauncherError("E_DAEMON_UNREACHABLE", "parent session was not observed");
}

export async function createDepthVerdictServer({ endpointPath, observeDepth }) {
  await mkdir(dirname(endpointPath), { recursive: true, mode: 0o700 });
  await rm(endpointPath, { force: true });
  const server = createServer((socket) => {
    let input = "";
    socket.on("data", async (chunk) => {
      input += chunk;
      if (!input.includes("\n")) return;
      let request;
      try { request = JSON.parse(input.slice(0, input.indexOf("\n"))); } catch {}
      let verdict;
      if (request?.type !== "depth_verdict" || Object.keys(request).length !== 1) {
        verdict = { ok: false, code: "E_CONTROLLER_REQUIRED" };
      } else {
        try {
          verdict = evaluateDepthStatus(await observeDepth());
        } catch {
          verdict = { ok: false, code: "E_DAEMON_UNREACHABLE" };
        }
      }
      socket.end(`${JSON.stringify(verdict)}\n`);
    });
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(endpointPath, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  await chmod(endpointPath, 0o600);
  return {
    endpointPath,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

export function buildModelEnvironment(env, additions = {}) {
  const output = { ...env, ...additions };
  for (const name of [
    "PRIME_AGENT_SESSION_DIR",
    "PRIME_AGENT_CODING_AGENT_SESSION_DIR",
    "PRIME_AGENT_DAEMON_SOCKET",
    "PRIME_ACTIVE_SESSION_ID",
  ]) delete output[name];
  return output;
}

async function verifyToolchain(kitRoot) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 8)) {
    fail("E_NODE_VERSION", "Node.js 22.8.0 or newer is required");
  }
  const binary = join(kitRoot, "toolchain", "node_modules", ".bin", "prime-agent");
  let version;
  try {
    version = (await execFile(binary, ["--version"], {
      encoding: "utf8",
      env: buildModelEnvironment(process.env),
    })).stdout.trim();
  } catch {
    fail("E_PACKAGE_BINARY", "verified Prime binary is unavailable");
  }
  if (version !== "0.8.1") fail("E_PACKAGE_IDENTITY", "Prime binary is not version 0.8.1");
}

export function managementArgs(command, record) {
  const socket = ["--daemon-socket", record.daemonSocket];
  if (command === "attach") return ["attach", record.parentSessionId, ...socket];
  if (command === "status") return ["list", ...socket, "--json"];
  if (command === "stop") return ["stop", record.parentSessionId, ...socket];
  fail("E_COMMAND", "unsupported launcher command");
}

function defaultDependencies(options) {
  const kitRoot = options.kitRoot;
  return {
    firewall: (argv) => applyArgvFirewall(argv, options.terminal),
    worktree: ({ targetDir, runId }) => resolveTargetWorktree({ targetDir, runId, worktreeDir: options.worktreeDir, mode: options.worktreeMode }),
    runtimeHome: async ({ runId, worktree }) => {
      await verifyToolchain(kitRoot);
      const config = loadConfig({ kitRoot, targetRoot: worktree.targetRoot, env: options.env ?? process.env });
      if (config.protectedViolations.length) fail("E_PROTECTED_VARIABLE", config.protectedViolations.join(","));
      const projectSettingsPath = join(worktree.worktreeRoot, ".prime", "agent", "settings.json");
      if ((await pathStat(projectSettingsPath))?.isFile()) {
        const projectSettings = JSON.parse(await readFile(projectSettingsPath, "utf8"));
        if (Object.hasOwn(projectSettings, "sessionDir")) fail("E_SESSION_DIR", "target settings set sessionDir");
      }
      return composeRuntimeHome({ kitRoot, runId, config });
    },
    packagePreflight: async () => {},
    initializeLedger: ({ runId, runtime }) => initializeRunLedger({
      runRoot: runtime.runRoot,
      runId,
      planPath: options.planPath ?? join(kitRoot, IMPLEMENTATION_PLAN),
      acceptanceCommands: options.acceptanceCommands ?? FROZEN_ACCEPTANCE_COMMANDS,
    }),
    reserve: ({ runId, runtime, worktree }) => reserveRun({
      runId,
      runtimeHome: runtime.runtimeHome,
      daemonSocket: runtime.daemonSocket,
      target: worktree.targetRoot,
      worktree: worktree.worktreeRoot,
      branch: worktree.branch,
    }, { stateRoot: join(kitRoot, ".state") }),
    startDepthEndpoint: async ({ runId, runtime, worktree }) => {
      let activeSessionId;
      return createDepthVerdictServer({
        endpointPath: runtime.depthVerdictSocket,
        observeDepth: async () => {
          if (!activeSessionId) {
            const record = await readRun(join(kitRoot, ".state"));
            activeSessionId = record?.parentSessionId ??
              await discoverParentSession(runtime.daemonSocket, worktree.worktreeRoot);
            if (!record?.parentSessionId) {
              await recordParentSession(join(kitRoot, ".state"), runId, activeSessionId);
            }
          }
          return queryDepthStatus({ socketPath: runtime.daemonSocket, activeSessionId });
        },
      });
    },
    spawn: ({ firewall, runtime, worktree, runId }) => runPrimeProcess({
      binary: join(kitRoot, "toolchain", "node_modules", ".bin", "prime-agent"),
      cwd: worktree.worktreeRoot,
      runtimeHome: runtime.runtimeHome,
      args: firewall.forwardedArgv,
      internalArgs: ["--daemon-socket", runtime.daemonSocket],
      prependModel: false,
      baseEnv: buildModelEnvironment(options.env ?? process.env, firewall.presentationEnv),
      preflight: async () => {},
      loadCredentials: async () => ({}),
      afterSpawn: async () => {
        const activeSessionId = await waitForParentSession(runtime.daemonSocket, worktree.worktreeRoot);
        await recordParentSession(join(kitRoot, ".state"), runId, activeSessionId);
      },
    }),
  };
}

export async function run(options) {
  const dependencies = { ...defaultDependencies(options), ...options.dependencies };
  const firewall = await dependencies.firewall(options.argv ?? []);
  const worktree = await dependencies.worktree({ targetDir: options.targetDir, runId: options.runId });
  const runtime = await dependencies.runtimeHome({ runId: options.runId, worktree });
  await dependencies.initializeLedger({ runId: options.runId, runtime, worktree });
  await dependencies.packagePreflight({ runtime, worktree });
  await dependencies.reserve({ runId: options.runId, runtime, worktree });
  const endpoint = options.dependencies
    ? await options.dependencies.startDepthEndpoint?.({ runId: options.runId, runtime, worktree })
    : await dependencies.startDepthEndpoint({ runId: options.runId, runtime, worktree });
  try {
    return await dependencies.spawn({ firewall, runtime, worktree, runId: options.runId });
  } finally {
    await endpoint?.close();
  }
}

async function management(command, options) {
  await verifyToolchain(options.kitRoot);
  const record = await readRun(join(options.kitRoot, ".state"));
  if (!record) fail("E_RUN_MISSING", "no run is registered");
  if (!record.parentSessionId) {
    fail("E_DAEMON_UNREACHABLE", "recorded parent session identity is unavailable");
  }
  await verifyRuntimeHome(record.runtimeHome);
  let verdict;
  try {
    verdict = evaluateDepthStatus(await queryDepthStatus({
      socketPath: record.daemonSocket,
      activeSessionId: record.parentSessionId,
    }));
  } catch {
    fail("E_DAEMON_UNREACHABLE", "effective depth could not be verified");
  }
  if (!verdict.ok) fail(verdict.code, "effective depth policy is not satisfied");
  if (command === "status") return 0;
  return runPrimeProcess({
    binary: join(options.kitRoot, "toolchain", "node_modules", ".bin", "prime-agent"),
    cwd: record.worktree,
    runtimeHome: record.runtimeHome,
    args: managementArgs(command, record),
    prependModel: false,
    baseEnv: buildModelEnvironment(options.env ?? process.env),
    preflight: async () => {},
    loadCredentials: async () => ({}),
  });
}

export const attach = (options) => management("attach", options);
export const stop = (options) => management("stop", options);

export async function status(options) {
  const record = await readRun(join(options.kitRoot, ".state"));
  if (!record) return { state: "none", ledger: [] };
  try {
    await verifyRuntimeHome(record.runtimeHome);
  } catch {
    await transitionRun(join(options.kitRoot, ".state"), record.runId, "orphaned");
    return { state: "orphaned", ledger: [] };
  }
  await management("status", options);
  let ledger = [];
  try {
    ledger = (await readFile(join(dirname(record.runtimeHome), "ledger.jsonl"), "utf8"))
      .split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { state: record.state, ledger };
}

export async function installSuperpowersPackage({
  kitRoot,
  source = "https://github.com/obra/superpowers.git",
  ref = "v6.3.0",
}) {
  const packagesRoot = join(kitRoot, ".state", "packages");
  const entry = join(packagesRoot, "superpowers@v6.3.0");
  await mkdir(packagesRoot, { recursive: true, mode: 0o700 });
  await chmod(join(kitRoot, ".state"), 0o700);
  await chmod(packagesRoot, 0o700);
  if (await pathStat(entry)) fail("E_CACHE_EXISTS", "package cache already exists");
  const temporary = await mkdtemp(join(packagesRoot, ".superpowers.tmp-"));
  try {
    await execFile("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, source, temporary]);
    const head = (await execFile("git", ["-C", temporary, "rev-parse", "HEAD"], { encoding: "utf8" })).stdout.trim();
    const tag = (await execFile("git", ["-C", temporary, "rev-list", "-n", "1", ref], { encoding: "utf8" })).stdout.trim();
    if (head !== tag) fail("E_PACKAGE_REF", "checked out commit does not match pinned ref");
    await rm(join(temporary, ".git"), { recursive: true, force: true });
    await chmod(temporary, 0o700);
    await rename(temporary, entry);
    const digest = await computeTreeDigest(entry);
    await writeFile(join(packagesRoot, "index.json"), `${JSON.stringify({
      schemaVersion: 1,
      entries: {
        [PACKAGE_SOURCE]: { path: basename(entry), treeDigest: digest, commit: head },
      },
    }, null, 2)}\n`, { mode: 0o600 });
    const toolCache = join(kitRoot, ".state", "tools", "prime-0.8.1");
    await mkdir(toolCache, { recursive: true, mode: 0o700 });
    await chmod(dirname(toolCache), 0o700);
    await chmod(toolCache, 0o700);
    for (const tool of ["rg", "fd"]) {
      try {
        const executable = (await execFile("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" })).stdout.trim();
        if (executable && !(await pathStat(join(toolCache, tool)))) {
          await symlink(executable, join(toolCache, tool));
        }
      } catch {
        // Task 1's bootstrap remains the enforcing diagnostic for missing tools.
      }
    }
    await writeFile(join(toolCache, ".ready"), "prime-0.8.1\n", { mode: 0o600 });
    const toolDigest = await computeTreeDigest(toolCache);
    await writeFile(join(dirname(toolCache), "index.json"), `${JSON.stringify({
      schemaVersion: 1,
      entries: {
        "prime-0.8.1": { path: basename(toolCache), treeDigest: toolDigest },
      },
    }, null, 2)}\n`, { mode: 0o600 });
    return { entry, digest, commit: head };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function cli(argv) {
  const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const command = ["attach", "status", "stop"].includes(argv[0]) ? argv.shift() : "run";
  if (command !== "run") return command === "attach"
    ? attach({ kitRoot, env: process.env })
    : command === "stop"
      ? stop({ kitRoot, env: process.env })
      : (process.stdout.write(`${JSON.stringify(await status({ kitRoot }))}\n`), 0);
  let targetDir = process.cwd();
  if (argv[0] && argv[0] !== "--" && !argv[0].startsWith("-")) targetDir = resolve(argv.shift());
  if (argv[0] === "--") argv.shift();
  const confirmUnsafe = async (banner) => {
    process.stderr.write(`${banner}\n`);
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return (await terminal.question('Type "yes" to continue: ')).trim() === "yes";
    } finally {
      terminal.close();
    }
  };
  return run({
    kitRoot,
    targetDir,
    argv,
    runId: `${new Date().toISOString().replace(/[^0-9]/gu, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
    env: process.env,
    terminal: {
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
      confirmUnsafe,
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).then(
    (code) => { process.exitCode = Number.isInteger(code) ? code : 0; },
    (error) => {
      const compatibility = error?.code === "E_ARG_DENIED"
        ? " (E_NOT_COMPOSED guard replaced by composed firewall)"
        : "";
      process.stderr.write(`${error?.code ?? "E_LAUNCHER"}: ${error?.message ?? "launcher failed"}${compatibility}\n`);
      process.exitCode = 1;
    },
  );
}
