import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EventEmitter } from "node:events";

import {
  buildPrimeEnvironment,
  runPrimeProcess,
} from "../lib/launcher-process.mjs";

const root = resolve(import.meta.dirname, "..");

test("preflight precedes credential export and spawn", async () => {
  const order = [];
  const child = new EventEmitter();
  child.kill = () => true;
  const result = runPrimeProcess({
    binary: "/verified/prime-agent",
    cwd: "/target/worktree",
    runtimeHome: "/kit/.state/runs/test/agent-home",
    args: ["hello"],
    baseEnv: { PATH: "/bin" },
    preflight: async () => order.push("preflight"),
    loadCredentials: async () => {
      order.push("credentials");
      return { PRIME_LLM_KEY: "secret" };
    },
    spawnImpl: (_binary, _args, options) => {
      order.push("spawn");
      assert.equal(options.cwd, "/target/worktree");
      assert.equal(options.env.PRIME_LLM_KEY, "secret");
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    },
  });
  assert.equal(await result, 0);
  assert.equal(order.join(","), "preflight,credentials,spawn");
});

test("builds invariant environment without mutating the input", () => {
  const source = { PATH: "/bin", SECRET: "kept" };
  const env = buildPrimeEnvironment(source, "/runtime/home");
  assert.deepEqual(source, { PATH: "/bin", SECRET: "kept" });
  assert.equal(env.PRIME_AGENT_CODING_AGENT_DIR, "/runtime/home");
  assert.equal(env.PI_CACHE_RETENTION, "long");
  assert.equal(env.PRIME_AGENT_TELEMETRY, "off");
});

test("places the exact Sol selector before user arguments", async () => {
  const child = new EventEmitter();
  child.kill = () => true;
  let seen;
  const promise = runPrimeProcess({
    binary: "/verified/prime-agent",
    cwd: "/worktree",
    runtimeHome: "/runtime",
    args: ["prompt"],
    preflight: async () => {},
    loadCredentials: async () => ({}),
    spawnImpl: (_binary, args) => {
      seen = args;
      queueMicrotask(() => child.emit("exit", 7, null));
      return child;
    },
  });
  assert.equal(await promise, 7);
  assert.deepEqual(seen.slice(0, 2), [
    "--model",
    "prime-proxy-openai/gpt-5.6-sol:max",
  ]);
  assert.equal(seen.at(-1), "prompt");
});

test("forwards termination signals and signal-derived exit status", async () => {
  const signalBus = new EventEmitter();
  const child = new EventEmitter();
  const forwarded = [];
  child.kill = (signal) => {
    forwarded.push(signal);
    return true;
  };
  const promise = runPrimeProcess({
    binary: "/verified/prime-agent",
    cwd: "/worktree",
    runtimeHome: "/runtime",
    args: [],
    preflight: async () => {},
    loadCredentials: async () => ({}),
    signalBus,
    spawnImpl: () => child,
  });
  await new Promise((resolveTick) => setImmediate(resolveTick));
  signalBus.emit("SIGTERM");
  child.emit("exit", null, "SIGTERM");
  assert.equal(await promise, 143);
  assert.deepEqual(forwarded, ["SIGTERM"]);
  assert.equal(signalBus.listenerCount("SIGTERM"), 0);
});

test("entry points fail closed before composition and never echo secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prime-launcher-"));
  try {
    const { spawn } = await import("node:child_process");
    const env = { ...process.env, PRIME_LLM_KEY: "do-not-print" };
    const run = await new Promise((resolveRun) => {
      const child = spawn(join(root, "prime"), ["--model", "evil"], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      child.on("close", (code) => resolveRun({ code, output }));
    });
    assert.notEqual(run.code, 0);
    assert.match(run.output, /E_NOT_COMPOSED/);
    assert.doesNotMatch(run.output, /do-not-print/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Windows wrapper forwards all arguments through WSL and diagnoses absence", async () => {
  const text = await readFile(join(root, "prime.cmd"), "utf8");
  assert.match(text, /where wsl/iu);
  assert.match(text, /wsl(?:\.exe)? .*%[*]/iu);
  assert.match(text, /E_WSL_REQUIRED/);
  assert.match(text, /exit \/b [1-9]/iu);
});
