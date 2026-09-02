import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { EventEmitter } from "node:events";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { generateModelsJson, loadConfig } from "../lib/config.mjs";
import { runPrimeProcess } from "../lib/launcher-process.mjs";
import {
  composeRuntimeHome,
  computeTreeDigest,
  buildModelEnvironment,
  createDepthVerdictServer,
  evaluateDepthStatus,
  managementArgs,
  queryDepthStatus,
  run,
  verifyRuntimeHome,
} from "../lib/launcher.mjs";

const root = resolve(import.meta.dirname, "..");

async function temp(t, prefix = "prime-launcher-") {
  const path = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function caches(t, kitRoot) {
  const packageEntry = join(kitRoot, ".state", "packages", "superpowers@v6.3.0");
  const toolCache = join(kitRoot, ".state", "tools", "prime-0.8.1");
  for (const skill of [
    "brainstorming", "verification-before-completion", "requesting-code-review",
  ]) {
    await mkdir(join(packageEntry, "skills", skill), { recursive: true });
    await writeFile(join(packageEntry, "skills", skill, "SKILL.md"), `# ${skill}\n`);
  }
  await mkdir(toolCache, { recursive: true });
  await writeFile(join(toolCache, ".ready"), "prime-0.8.1\n");
  await writeFile(join(packageEntry, "..", "index.json"), JSON.stringify({
    schemaVersion: 1,
    entries: {
      "git:github.com/obra/superpowers@v6.3.0": {
        path: "superpowers@v6.3.0",
        treeDigest: await computeTreeDigest(packageEntry),
        commit: "test",
      },
    },
  }));
  await writeFile(join(toolCache, "..", "index.json"), JSON.stringify({
    schemaVersion: 1,
    entries: {
      "prime-0.8.1": {
        path: "prime-0.8.1",
        treeDigest: await computeTreeDigest(toolCache),
      },
    },
  }));
  for (const directory of [
    join(kitRoot, ".state"),
    join(kitRoot, ".state", "packages"),
    packageEntry,
    join(kitRoot, ".state", "tools"),
    toolCache,
  ]) await chmod(directory, 0o700);
  await chmod(join(packageEntry, "..", "index.json"), 0o600);
  await chmod(join(toolCache, "..", "index.json"), 0o600);
  return { packageEntry, toolCache };
}

async function realComposition(t) {
  const kitRoot = await temp(t);
  await cp(join(root, "agent-home"), join(kitRoot, "agent-home"), { recursive: true });
  const { packageEntry, toolCache } = await caches(t, kitRoot);
  const config = loadConfig({
    kitRoot,
    targetRoot: kitRoot,
    env: { PRIME_BASE_URL: "https://proxy.example", PRIME_LLM_KEY: "secret" },
  });
  return { kitRoot, packageEntry, toolCache, config };
}

test("run composes firewall worktree registry and process in order", async () => {
  const order = [];
  const code = await run({
    argv: ["prompt"],
    runId: "ordered",
    targetDir: "/target",
    dependencies: {
      firewall: async () => (order.push("firewall"), { forwardedArgv: ["prompt"], presentationEnv: {} }),
      worktree: async () => (order.push("worktree"), { worktreeRoot: "/worktree", targetRoot: "/target", branch: "prime/ordered" }),
      runtimeHome: async () => (order.push("runtime-home"), { runtimeHome: "/runtime", daemonSocket: "/run/socket" }),
      packagePreflight: async () => order.push("package"),
      reserve: async () => order.push("registry"),
      spawn: async () => (order.push("spawn"), 0),
    },
  });
  assert.equal(code, 0);
  assert.equal(order.join(","), "firewall,worktree,runtime-home,package,registry,spawn");
});

test("composes from the real template and real generated models without mutating template", async (t) => {
  const f = await realComposition(t);
  const before = await readFile(join(f.kitRoot, "agent-home", "settings.json"));
  const result = await composeRuntimeHome({
    ...f,
    runId: "compose",
    templateRoot: join(f.kitRoot, "agent-home"),
  });
  assert.deepEqual(
    JSON.parse(await readFile(join(result.runtimeHome, "models.json"), "utf8")),
    generateModelsJson(f.config),
  );
  assert.equal(
    await realpath(join(result.runtimeHome, "git/github.com/obra/superpowers")),
    await realpath(f.packageEntry),
  );
  assert.equal(await realpath(join(result.runtimeHome, "bin")), await realpath(f.toolCache));
  await writeFile(join(result.runtimeHome, "auth.json"), "{}\n");
  assert.deepEqual(await readFile(join(f.kitRoot, "agent-home", "settings.json")), before);
});

test("settings rewrites are semantic while immutable resources remain digest checked", async (t) => {
  const f = await realComposition(t);
  const result = await composeRuntimeHome({ ...f, runId: "integrity" });
  await writeFile(join(result.runtimeHome, "settings.json"), JSON.stringify({
    extensions: [],
    packages: [{ extensions: [], source: "git:github.com/obra/superpowers@v6.3.0" }],
    rlmMaxDepth: 1,
    rewrittenByPrime: true,
  }));
  assert.equal((await verifyRuntimeHome(result.runtimeHome)).ok, true);
  await writeFile(join(result.runtimeHome, "models.json"), "{}\n");
  await assert.rejects(verifyRuntimeHome(result.runtimeHome), /E_RUNTIME_ORPHANED/);
});

test("invalid settings and template symlinks fail closed", async (t) => {
  const f = await realComposition(t);
  const result = await composeRuntimeHome({ ...f, runId: "settings" });
  await writeFile(join(result.runtimeHome, "settings.json"), JSON.stringify({
    rlmMaxDepth: 2,
    packages: [{ source: "git:github.com/obra/superpowers@v6.3.0", extensions: [] }],
    extensions: [],
  }));
  await assert.rejects(verifyRuntimeHome(result.runtimeHome), /E_DEPTH_VALUE/);

  const badTemplate = join(f.kitRoot, "bad-template");
  await cp(join(f.kitRoot, "agent-home"), badTemplate, { recursive: true });
  await symlink("/tmp", join(badTemplate, "escape"));
  await assert.rejects(
    composeRuntimeHome({ ...f, runId: "bad-link", templateRoot: badTemplate }),
    /E_TEMPLATE_SYMLINK/,
  );
});

test("missing or incomplete package fails before spawn with sole launcher code", async (t) => {
  const f = await realComposition(t);
  await rm(join(f.packageEntry, "skills", "brainstorming"), { recursive: true });
  let spawned = false;
  await assert.rejects(
    composeRuntimeHome({ ...f, runId: "missing-package" }),
    (error) => error.code === "E_PACKAGE_UNRESOLVED",
  );
  assert.equal(spawned, false);
});

test("depth policy accepts global and inherited and freezes refusal codes", () => {
  assert.deepEqual(evaluateDepthStatus({ maxDepth: 1, source: "global" }), { ok: true });
  assert.deepEqual(evaluateDepthStatus({ maxDepth: 1, source: "inherited" }), { ok: true });
  assert.deepEqual(evaluateDepthStatus({ maxDepth: 1, source: "chat" }), { ok: false, code: "E_DEPTH_SOURCE" });
  assert.deepEqual(evaluateDepthStatus({ maxDepth: 1, source: "env" }), { ok: false, code: "E_DEPTH_SOURCE" });
  assert.deepEqual(evaluateDepthStatus({ maxDepth: 2, source: "global" }), { ok: false, code: "E_DEPTH_VALUE" });
});

test("depth endpoint returns verdict only and never exposes daemon capabilities", async (t) => {
  const dir = await temp(t);
  const endpointPath = join(dir, "depth-verdict.sock");
  const server = await createDepthVerdictServer({
    endpointPath,
    observeDepth: async () => ({ maxDepth: 1, source: "inherited" }),
  });
  t.after(() => server.close());
  const response = await new Promise((resolveResponse, reject) => {
    const socket = createConnection(endpointPath);
    let text = "";
    socket.on("connect", () => socket.write('{"type":"depth_verdict"}\n'));
    socket.on("data", (chunk) => (text += chunk));
    socket.on("end", () => resolveResponse(JSON.parse(text)));
    socket.on("error", reject);
  });
  assert.deepEqual(response, { ok: true });
  assert.deepEqual(Object.keys(response), ["ok"]);
  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /depth|source|socket|session|set_rlm_max_depth/i);

  const refused = await new Promise((resolveResponse, reject) => {
    const socket = createConnection(endpointPath);
    let text = "";
    socket.on("connect", () => socket.write('{"type":"set_rlm_max_depth","maxDepth":9}\n'));
    socket.on("data", (chunk) => (text += chunk));
    socket.on("end", () => resolveResponse(JSON.parse(text)));
    socket.on("error", reject);
  });
  assert.deepEqual(refused, { ok: false, code: "E_CONTROLLER_REQUIRED" });
});

test("model-reachable environments contain neither daemon socket nor session identity", () => {
  const env = buildModelEnvironment({
    SAFE: "yes",
    PRIME_AGENT_SESSION_DIR: "/leak-a",
    PRIME_AGENT_CODING_AGENT_SESSION_DIR: "/leak-b",
    PRIME_AGENT_DAEMON_SOCKET: "/leak.sock",
    PRIME_ACTIVE_SESSION_ID: "secret-session",
  });
  assert.deepEqual(env, { SAFE: "yes" });
  assert.doesNotMatch(JSON.stringify(env), /leak|secret-session/);
});

test("real Prime 0.8.1 depth protocol is read-only from the launcher client", async (t) => {
  const dir = await temp(t);
  const socketPath = join(dir, "daemon.sock");
  let command;
  const server = createServer((socket) => {
    socket.write(JSON.stringify({
      type: "daemon_hello",
      socketPath,
      protocol: { name: "prime-agent.daemon", version: 7 },
      schemaRevision: 11,
      clientId: "test",
      serverCapabilities: [],
    }) + "\n");
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk;
      const line = input.indexOf("\n");
      if (line < 0) return;
      command = JSON.parse(input.slice(0, line));
      socket.end(JSON.stringify({
        id: command.id,
        type: "response",
        command: "get_rlm_max_depth_status",
        success: true,
        data: { maxDepth: 1, source: "global" },
      }) + "\n");
    });
  });
  await new Promise((resolveListen) => server.listen(socketPath, resolveListen));
  t.after(() => server.close());
  assert.deepEqual(
    await queryDepthStatus({ socketPath, activeSessionId: "parent-secret" }),
    { maxDepth: 1, source: "global" },
  );
  assert.equal(command.command.type, "get_rlm_max_depth_status");
  assert.equal(command.command.activeSessionId, "parent-secret");
  assert.doesNotMatch(JSON.stringify(command), /set_rlm_max_depth/);
});

test("management commands always carry the recorded per-run daemon socket", () => {
  assert.deepEqual(managementArgs("attach", {
    parentSessionId: "parent",
    daemonSocket: "/run/daemon.sock",
  }), ["attach", "parent", "--daemon-socket", "/run/daemon.sock"]);
  assert.deepEqual(managementArgs("status", {
    parentSessionId: "parent",
    daemonSocket: "/run/daemon.sock",
  }), ["list", "--daemon-socket", "/run/daemon.sock", "--json"]);
  assert.deepEqual(managementArgs("stop", {
    parentSessionId: "parent",
    daemonSocket: "/run/daemon.sock",
  }), ["stop", "parent", "--daemon-socket", "/run/daemon.sock"]);
});

test("runtime links are symlinks and state directories are owner-only", async (t) => {
  const f = await realComposition(t);
  const result = await composeRuntimeHome({ ...f, runId: "permissions" });
  assert.equal((await lstat(join(result.runtimeHome, "bin"))).isSymbolicLink(), true);
  assert.equal((await lstat(join(result.runtimeHome, "git/github.com/obra/superpowers"))).isSymbolicLink(), true);
  assert.equal((await lstat(join(f.kitRoot, ".state"))).mode & 0o077, 0);
  assert.equal((await lstat(join(f.kitRoot, ".state", "runs", "permissions"))).mode & 0o077, 0);
});

test("composition rejects permissive cache parents instead of silently repairing them", async (t) => {
  const f = await realComposition(t);
  await chmod(join(f.kitRoot, ".state", "packages"), 0o755);
  await assert.rejects(
    composeRuntimeHome({ ...f, runId: "permissive-cache" }),
    /E_PACKAGE_UNRESOLVED/,
  );
});

test("retained runtime verification rejects permissive run parents", async (t) => {
  const f = await realComposition(t);
  const result = await composeRuntimeHome({ ...f, runId: "permissive-run" });
  await chmod(result.runRoot, 0o755);
  await assert.rejects(verifyRuntimeHome(result.runtimeHome), /E_RUNTIME_ORPHANED/);
});

test("runtime verification rejects a manifest that omits immutable resources", async (t) => {
  const f = await realComposition(t);
  const result = await composeRuntimeHome({ ...f, runId: "partial-manifest" });
  const manifestPath = join(result.runtimeHome, "resources.lock.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.entries = manifest.entries.filter((entry) => entry.path === "models.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyRuntimeHome(result.runtimeHome), /E_RUNTIME_ORPHANED/);
});

test("post-spawn handshake completes before the launcher reports child exit", async () => {
  const child = new EventEmitter();
  child.kill = () => true;
  const signalBus = new EventEmitter();
  let releaseHandshake;
  let handshakeStarted = false;
  const handshake = new Promise((resolveHandshake) => { releaseHandshake = resolveHandshake; });
  const completion = runPrimeProcess({
    binary: "/verified/prime-agent",
    cwd: "/target",
    runtimeHome: "/runtime",
    prependModel: false,
    preflight: async () => {},
    loadCredentials: async () => ({}),
    spawnImpl: () => child,
    signalBus,
    afterSpawn: async () => {
      handshakeStarted = true;
      await handshake;
    },
  });
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
  assert.equal(handshakeStarted, true);
  child.emit("exit", 0, null);
  let settled = false;
  completion.finally(() => { settled = true; });
  await new Promise((resolveTurn) => setImmediate(resolveTurn));
  assert.equal(settled, false);
  releaseHandshake();
  assert.equal(await completion, 0);
});
