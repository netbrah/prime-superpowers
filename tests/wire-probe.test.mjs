import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { generateModelsJson, loadConfig } from "../lib/config.mjs";
import { startMockProxy } from "./fixtures/mock-proxy.mjs";

const root = resolve(import.meta.dirname, "..");
const PRIME_BIN = "/home/user/workspace/.tools/prime-install/node_modules/.bin/prime-agent";
const artifactsRoot = join(root, "tests/.artifacts/wire");
const SENTINEL = "wire-sentinel-key";

function runPrime(args, options) {
  return new Promise((resolvePromise) => {
    const child = spawn(PRIME_BIN, args, { ...options, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeout);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        exitStatus: code ?? (signal ? 1 : 0),
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.stdin.end();
  });
}

async function runProbe(t, {
  dialect,
  provider,
  model,
  thinking,
  authMode = "bearer",
  artifact = dialect,
}) {
  const proxy = await startMockProxy({ dialect });
  t.after(() => proxy.close());
  const home = await mkdtemp(join(tmpdir(), `prime-wire-${dialect}-`));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, "daemon"));
  const config = loadConfig({
    kitRoot: home,
    targetRoot: home,
    env: {
      PRIME_BASE_URL: proxy.baseUrl,
      PRIME_LLM_KEY: SENTINEL,
      PRIME_PROXY_AUTH_MODE: authMode,
    },
  });
  await writeFile(join(home, "models.json"), JSON.stringify(generateModelsJson(config)));
  await writeFile(join(home, "settings.json"), JSON.stringify({ rlmMaxDepth: 1, packages: [], extensions: [] }));
  const result = await runPrime([
      "--print",
      "--no-session",
      "--daemon-socket", join(home, "daemon/daemon.sock"),
      "--provider", provider,
      "--model", model,
      "--thinking", thinking,
      "Reply only with ok.",
    ], {
      cwd: root,
      timeout: 60_000,
      env: {
        ...process.env,
        PRIME_AGENT_CODING_AGENT_DIR: home,
        PRIME_AGENT_KERNEL_VENV: join(root, ".state/toolchain/kernel-venv"),
        PRIME_AGENT_TELEMETRY: "off",
        PI_CACHE_RETENTION: "long",
        PRIME_LLM_KEY: SENTINEL,
        PATH: `${join(root, ".state/toolchain/agent-home/bin")}:${process.env.PATH}`,
        NO_COLOR: "1",
      },
    });
  const exitStatus = result.exitStatus;
  const caseDir = join(artifactsRoot, artifact);
  await rm(caseDir, { recursive: true, force: true });
  await mkdir(caseDir, { recursive: true });
  const transcript = {
    dialect,
    provider,
    model,
    thinking,
    authMode,
    requests: proxy.requests.map(({ rawHeaders: _rawHeaders, ...request }) => request),
    responses: proxy.responses,
    exitStatus,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  await writeFile(join(caseDir, "transcript.json"), JSON.stringify(transcript, null, 2));
  assert.equal(exitStatus, 0, `Prime exited ${exitStatus}: ${result.stderr}`);
  assert.equal(proxy.requests.length, 1, `expected one ${dialect} request, got ${proxy.requests.length}`);
  return { request: proxy.requests[0], transcript };
}

function containsCacheTtl(value) {
  if (!value || typeof value !== "object") return false;
  if (value.cache_control?.ttl === "1h") return true;
  return Object.values(value).some((child) =>
    Array.isArray(child) ? child.some(containsCacheTtl) : containsCacheTtl(child)
  );
}

test("Sol uses OpenAI Responses native path", async (t) => {
  const { request } = await runProbe(t, {
    dialect: "openai",
    provider: "prime-proxy-openai",
    model: "gpt-5.6-sol",
    thinking: "max",
  });
  assert.equal(request.method, "POST");
  assert.equal(request.path, "/v1/responses");
  assert.equal(request.rawHeaders.authorization, `Bearer ${SENTINEL}`);
  assert.equal(request.body.model, "gpt-5.6-sol");
  assert.equal(request.body.reasoning?.effort, "max");
  assert.equal(request.body.prompt_cache_retention, "24h");
});

test("Opus uses Anthropic Messages with cache and eager tool input", async (t) => {
  const { request } = await runProbe(t, {
    dialect: "anthropic",
    provider: "prime-proxy-anthropic",
    model: "claude-opus-5",
    thinking: "high",
  });
  assert.equal(request.method, "POST");
  assert.equal(request.path, "/v1/messages");
  assert.equal(request.rawHeaders.authorization, `Bearer ${SENTINEL}`);
  assert.equal(request.rawHeaders["x-api-key"], SENTINEL);
  assert.equal(request.body.model, "claude-opus-5");
  assert.equal(request.body.thinking?.type, "adaptive");
  assert.equal(request.body.output_config?.effort, "high");
  assert.equal(containsCacheTtl(request.body), true, "missing Anthropic one-hour cache marker");
  assert.equal(request.body.tools?.some((tool) => tool.eager_input_streaming === true), true);
  assert.equal(request.rawHeaders["anthropic-beta"], "extended-cache-ttl-2025-04-11");
});

test("Gemini uses native path and serializes HIGH thinking", async (t) => {
  const { request } = await runProbe(t, {
    dialect: "google",
    provider: "prime-proxy-google",
    model: "gemini-3.1-pro-preview",
    thinking: "high",
    authMode: "native",
    artifact: "google-high",
  });
  assert.equal(request.method, "POST");
  assert.match(request.path, /^\/v1beta\/models\/gemini-3\.1-pro-preview:streamGenerateContent/);
  assert.equal(request.rawHeaders["x-goog-api-key"], SENTINEL);
  assert.equal(request.rawHeaders.authorization, undefined);
  assert.equal(request.body.generationConfig?.thinkingConfig?.thinkingLevel, "HIGH");
});

test("Gemini reasoning-off serializes the supported LOW floor", async (t) => {
  const { request } = await runProbe(t, {
    dialect: "google",
    provider: "prime-proxy-google",
    model: "gemini-3.1-pro-preview",
    thinking: "off",
    authMode: "native",
    artifact: "google-off",
  });
  assert.equal(request.body.generationConfig?.thinkingConfig?.thinkingLevel, "LOW");
  assert.equal(request.body.generationConfig?.thinkingConfig?.includeThoughts, true);
});
