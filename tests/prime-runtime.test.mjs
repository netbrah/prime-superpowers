import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { generateModelsJson, loadConfig } from "../lib/config.mjs";
import {
  composeRuntimeHome,
  computeTreeDigest,
  initializeRunLedger,
  verifyRuntimeHome,
} from "../lib/launcher.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const PRIME_BIN = "/home/user/workspace/.tools/prime-install/node_modules/.bin/prime-agent";
const PRIME_SDK = "/home/user/workspace/.tools/prime-install/node_modules/prime-agent/dist/index.js";
const SUPERPOWERS = "/home/user/workspace/superpowers-v6.3.0";
const artifactsRoot = join(root, "tests/.artifacts/prime-runtime");

async function prepareRuntime(t, name) {
  const kitRoot = await mkdtemp(join(tmpdir(), `prime-runtime-${name}-`));
  t.after(() => rm(kitRoot, { recursive: true, force: true }));
  await cp(join(root, "agent-home"), join(kitRoot, "agent-home"), { recursive: true });
  const packageEntry = join(kitRoot, ".state/packages/superpowers@v6.3.0");
  await mkdir(join(kitRoot, ".state/packages"), { recursive: true, mode: 0o700 });
  await cp(SUPERPOWERS, packageEntry, {
    recursive: true,
    filter: (source) => !source.includes("/.git"),
  });
  const packageDigest = await computeTreeDigest(packageEntry);
  await writeFile(join(kitRoot, ".state/packages/index.json"), JSON.stringify({
    schemaVersion: 1,
    entries: {
      "git:github.com/obra/superpowers@v6.3.0": {
        path: "superpowers@v6.3.0",
        treeDigest: packageDigest,
        commit: "v6.3.0-runtime-fixture",
      },
    },
  }));
  const toolCache = join(kitRoot, ".state/tools/prime-0.8.1");
  await mkdir(toolCache, { recursive: true, mode: 0o700 });
  const toolPaths = {
    rg: (await execFileAsync("sh", ["-c", "command -v rg"])).stdout.trim(),
    fd: join(root, ".state/toolchain/agent-home/bin/fd"),
  };
  for (const [tool, path] of Object.entries(toolPaths)) await symlink(path, join(toolCache, tool));
  await writeFile(join(toolCache, ".ready"), "prime-0.8.1\n");
  const toolDigest = await computeTreeDigest(toolCache);
  await writeFile(join(kitRoot, ".state/tools/index.json"), JSON.stringify({
    schemaVersion: 1,
    entries: { "prime-0.8.1": { path: "prime-0.8.1", treeDigest: toolDigest } },
  }));
  for (const directory of [
    join(kitRoot, ".state"),
    join(kitRoot, ".state/packages"),
    packageEntry,
    join(kitRoot, ".state/tools"),
    toolCache,
  ]) await chmod(directory, 0o700);
  for (const file of [join(kitRoot, ".state/packages/index.json"), join(kitRoot, ".state/tools/index.json")]) {
    await chmod(file, 0o600);
  }
  const config = loadConfig({
    kitRoot,
    targetRoot: kitRoot,
    env: { PRIME_BASE_URL: "http://127.0.0.1:9", PRIME_LLM_KEY: "runtime-sentinel" },
  });
  const runtime = await composeRuntimeHome({ kitRoot, runId: name, config });
  return { kitRoot, config, runtime };
}

function parseModelTable(stdout) {
  return stdout.trim().split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
    const [provider, model, context, maxOut, thinking, images] = line.trim().split(/\s{2,}/);
    return { provider, model, context, maxOut, thinking, images };
  });
}

test("real Prime lists all generated model selectors from a composed home", async (t) => {
  const { kitRoot, config, runtime } = await prepareRuntime(t, "model-list");
  const caseDir = join(artifactsRoot, "model-list");
  await rm(caseDir, { recursive: true, force: true });
  await mkdir(caseDir, { recursive: true });
  const result = await execFileAsync(PRIME_BIN, ["model", "list"], {
    cwd: kitRoot,
    env: {
      ...process.env,
      PRIME_AGENT_CODING_AGENT_DIR: runtime.runtimeHome,
      PRIME_AGENT_TELEMETRY: "off",
      PI_CACHE_RETENTION: "long",
      PRIME_LLM_KEY: "runtime-sentinel",
      NO_COLOR: "1",
    },
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  await writeFile(join(caseDir, "stdout.txt"), result.stdout);
  await writeFile(join(caseDir, "stderr.txt"), result.stderr);
  const table = result.stdout.trim() ? result.stdout : result.stderr;
  const rows = parseModelTable(table);
  for (const { selector } of config.models) {
    const [provider, model] = selector.split("/");
    assert.ok(rows.some((row) => row.provider === provider && row.model === model), `selector ${selector} not found`);
  }
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Warning: errors loading models\.json/);
  assert.equal((await verifyRuntimeHome(runtime.runtimeHome)).ok, true);
  assert.deepEqual(
    JSON.parse(await readFile(join(runtime.runtimeHome, "models.json"), "utf8")),
    generateModelsJson(config),
  );

  const ledger = await initializeRunLedger({
    runRoot: runtime.runRoot,
    runId: "model-list",
    planPath: join(root, "docs/specs/2026-08-26-prime-superpowers-implementation-plan.md"),
  });
  assert.equal(ledger.ok, true, "runtime-generated resources.lock.json must coexist with the real run ledger");
  const manifest = JSON.parse(await readFile(join(runtime.runtimeHome, "resources.lock.json"), "utf8"));
  await writeFile(join(caseDir, "resource-inventory.json"), JSON.stringify(manifest, null, 2));
  assert.equal(manifest.links.some((entry) => entry.kind === "package"), true);
  for (const skill of ["brainstorming", "verification-before-completion", "requesting-code-review"]) {
    assert.ok((await readdir(join(runtime.packageLeaf, "skills"))).includes(skill));
  }
});

test("Prime in-process guard refuses a grandchild with the kit gate stubbed open", async (t) => {
  const { runtime } = await prepareRuntime(t, "depth-guard");
  const sdk = await import(pathToFileURL(PRIME_SDK));
  const previous = process.env.PRIME_LLM_KEY;
  process.env.PRIME_LLM_KEY = "runtime-sentinel";
  t.after(() => {
    if (previous === undefined) delete process.env.PRIME_LLM_KEY;
    else process.env.PRIME_LLM_KEY = previous;
  });
  const { session } = await sdk.createAgentSession({
    cwd: root,
    agentDir: runtime.runtimeHome,
    rlmDepth: 1,
    noTools: "all",
    sessionManager: sdk.SessionManager.inMemory(root),
  });
  t.after(() => session.dispose());
  // No launcher/controller admission call is made: the kit gate is deliberately open.
  await assert.rejects(
    session.runRlmChild("attempt grandchild despite open kit gate"),
    /RLM recursion depth limit reached \(RLM_DEPTH=1, RLM_MAX_DEPTH=1\)/,
  );
  assert.equal((await session.listRlmSubagents()).subagents.length, 0);
  const skills = session.resourceLoader.getSkills().skills;
  for (const name of ["brainstorming", "verification-before-completion", "requesting-code-review"]) {
    assert.ok(
      skills.some((skill) => skill.name === name),
      `real resource loader did not load ${name}; loaded=${skills.map((skill) => skill.name).join(",")}`,
    );
  }
  for (const name of ["using-superpowers", "subagent-driven-development"]) {
    const winner = skills.find((skill) => skill.name === name);
    assert.ok(winner, `missing local override ${name}`);
    assert.match(winner.filePath ?? winner.path ?? JSON.stringify(winner), /agent-home\/skills/);
  }
  assert.equal(session.resourceLoader.getExtensions().extensions.length, 0, "package extensions must be filtered");
});

test("same-UID client can reach the real daemon socket", async (t) => {
  const { runtime } = await prepareRuntime(t, "socket-reachable");
  const child = spawn(PRIME_BIN, ["--mode", "daemon", "--daemon-socket", runtime.daemonSocket], {
    cwd: root,
    env: {
      ...process.env,
      PRIME_AGENT_CODING_AGENT_DIR: runtime.runtimeHome,
      PRIME_AGENT_TELEMETRY: "off",
      PRIME_LLM_KEY: "runtime-sentinel",
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill("SIGTERM");
  });
  let connected = false;
  for (let attempt = 0; attempt < 100 && !connected; attempt += 1) {
    connected = await new Promise((resolvePromise) => {
      const socket = createConnection(runtime.daemonSocket);
      socket.once("connect", () => {
        socket.end();
        resolvePromise(true);
      });
      socket.once("error", () => resolvePromise(false));
    });
    if (!connected) await sleep(50);
  }
  assert.equal(connected, true, "same-UID process could not connect to real Prime socket");
});

test("missing package cache fails before Prime can be spawned", async (t) => {
  const { kitRoot, config } = await prepareRuntime(t, "missing-base");
  await rm(join(kitRoot, ".state/runs/missing-base"), { recursive: true, force: true });
  await rm(join(kitRoot, ".state/packages/superpowers@v6.3.0"), { recursive: true, force: true });
  let spawned = false;
  await assert.rejects(
    composeRuntimeHome({ kitRoot, runId: "missing-package", config }).then(() => {
      spawned = true;
      return execFileAsync(PRIME_BIN, ["--version"]);
    }),
    /E_PACKAGE_UNRESOLVED/,
  );
  assert.equal(spawned, false);
});
