import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import extension, {
  CHILD_CONTRACT,
  COORDINATOR_CONTRACT,
  installPrimeSuperpowers,
  resolveConfigModuleUrl,
} from "../agent-home/extensions/prime-superpowers.js";
import { generateModelsJson, loadConfig } from "../lib/config.mjs";
import {
  INTRODUCED_LATER_RESOURCES,
  createExtensionApi,
} from "./fixtures/extension-api.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const agentHome = path.join(root, "agent-home");
const env = {
  PRIME_BASE_URL: "https://proxy.example",
  PRIME_LLM_KEY: "extension-sentinel",
};

function expectedRegistrations() {
  const modelsJson = generateModelsJson(loadConfig({ kitRoot: root, targetRoot: root, env }));
  return Object.values(modelsJson.providers).map((provider) => {
    const { id, models, ...providerConfig } = provider;
    return {
      id,
      config: {
        ...providerConfig,
        models: models.map(({ provider: _provider, ...model }) => model),
      },
    };
  });
}

test("exports a Prime-loadable default extension from .js", () => {
  assert.equal(typeof extension, "function");
  assert.match(new URL("../agent-home/extensions/prime-superpowers.js", import.meta.url).pathname, /\.js$/);
  assert.equal(path.extname(new URL("../agent-home/extensions/prime-superpowers.js", import.meta.url).pathname), ".js");
});

test("registers exact provider payloads from real lib/config.mjs without built-in collisions", async () => {
  const api = createExtensionApi();
  await installPrimeSuperpowers(api, { kitRoot: root, targetRoot: root, env });
  assert.deepEqual(api.registrations, expectedRegistrations());
  assert.deepEqual(
    api.registrations.map(({ id }) => id),
    ["prime-proxy-openai", "prime-proxy-anthropic", "prime-proxy-google"],
  );
  assert.equal(api.registrations.some(({ id }) => ["openai", "anthropic", "google"].includes(id)), false);
});

test("before_agent_start selects child prompt at depth one", async () => {
  const api = createExtensionApi();
  await installPrimeSuperpowers(api, { kitRoot: root, targetRoot: root, env });
  const result = await api.emit("before_agent_start", {
    type: "before_agent_start",
    systemPrompt: COORDINATOR_CONTRACT,
    systemPromptOptions: { rlmDepth: 1, cwd: root },
  });
  assert.equal(
    result.systemPrompt,
    CHILD_CONTRACT,
    `expected CHILD_CONTRACT, received ${result.systemPrompt === COORDINATOR_CONTRACT ? "COORDINATOR_CONTRACT" : JSON.stringify(result.systemPrompt)}`,
  );
});

test("depth zero gets coordinator contract and every positive depth gets one universal child contract", async () => {
  const api = createExtensionApi();
  await installPrimeSuperpowers(api, { kitRoot: root, targetRoot: root, env });
  for (const [depth, contract] of [
    [0, COORDINATOR_CONTRACT],
    [1, CHILD_CONTRACT],
    [2, CHILD_CONTRACT],
    [99, CHILD_CONTRACT],
  ]) {
    const result = await api.emit("before_agent_start", {
      type: "before_agent_start",
      systemPrompt: "arbitrary prior prompt",
      systemPromptOptions: { rlmDepth: depth, cwd: root },
    });
    assert.equal(result.systemPrompt, contract);
  }
});

test("prompt replacement is idempotent on repeated turns", async () => {
  const api = createExtensionApi();
  await installPrimeSuperpowers(api, { kitRoot: root, targetRoot: root, env });
  for (let turn = 0; turn < 3; turn += 1) {
    const result = await api.emit("before_agent_start", {
      type: "before_agent_start",
      systemPrompt: `${COORDINATOR_CONTRACT}\nold suffix ${turn}`,
      systemPromptOptions: { rlmDepth: 0, cwd: root },
    });
    assert.equal(result.systemPrompt, COORDINATOR_CONTRACT);
    assert.equal(result.systemPrompt.split("COORDINATOR_CONTRACT").length - 1, 1);
  }
});

test("does not register an input or command handler for rlm-max-depth", async () => {
  const api = createExtensionApi();
  await installPrimeSuperpowers(api, { kitRoot: root, targetRoot: root, env });
  assert.equal(api.handlers.has("input"), false);
  assert.equal(api.commands.some(({ name }) => name === "rlm-max-depth"), false);
});

test("contracts expose only Prime-native tool vocabulary", () => {
  const combined = `${COORDINATOR_CONTRACT}\n${CHILD_CONTRACT}`;
  for (const token of [
    "ipython",
    "Path",
    "bash",
    "rlm",
    "rlm.find_models",
    'agent_message.send(receiver_role="parent")',
  ]) {
    assert.match(combined, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["`read`", "`write`", "`grep`", "`ls`", "/rlm-max-depth"]) {
    assert.doesNotMatch(combined, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(CHILD_CONTRACT, /os\.chdir\(worktree_root\)/);
  assert.match(CHILD_CONTRACT, /role marker/i);
  assert.doesNotMatch(CHILD_CONTRACT, /depth (?:determines|distinguishes).*(?:worker|reviewer)/i);
});

test("settings pin depth and filter package extensions", async () => {
  const settings = JSON.parse(await readFile(path.join(agentHome, "settings.json"), "utf8"));
  assert.equal(settings.rlmMaxDepth, 1);
  assert.deepEqual(settings.packages, [
    {
      source: "git:github.com/obra/superpowers@v6.3.0",
      extensions: [],
    },
  ]);
  assert.deepEqual(settings.extensions, []);
  await assert.rejects(readFile(path.join(agentHome, "resources.lock.json")), { code: "ENOENT" });
});

test("all agent-home resource references resolve now or in the exact later-task set", async () => {
  const files = ["AGENTS.md", "prompts/coordinator.md", "prompts/child.md"];
  const references = new Set();
  for (const relative of files) {
    const text = await readFile(path.join(agentHome, relative), "utf8");
    for (const match of text.matchAll(/`((?:skills|prompts|extensions)\/[^`]+)`/g)) {
      references.add(match[1]);
    }
  }
  assert.ok(references.size > 0);
  for (const reference of references) {
    try {
      await readFile(path.join(agentHome, reference));
    } catch (error) {
      assert.equal(error.code, "ENOENT");
      assert.ok(
        INTRODUCED_LATER_RESOURCES.has(reference),
        `unresolved resource is not owned by Task 9 or 10: ${reference}`,
      );
    }
  }
});

test("relative ESM resolution handles POSIX and Windows file URLs", () => {
  assert.equal(
    resolveConfigModuleUrl("file:///opt/prime/agent-home/extensions/prime-superpowers.js").href,
    "file:///opt/prime/lib/config.mjs",
  );
  assert.equal(
    resolveConfigModuleUrl("file:///C:/prime/agent-home/extensions/prime-superpowers.js").href,
    "file:///C:/prime/lib/config.mjs",
  );
  assert.equal(
    resolveConfigModuleUrl(
      "file:///C:/prime/.state/runs/run-1/agent-home/extensions/prime-superpowers.js",
    ).href,
    "file:///C:/prime/lib/config.mjs",
  );
});
