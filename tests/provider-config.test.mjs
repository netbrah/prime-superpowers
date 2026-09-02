import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROTECTED_VARIABLES,
  generateModelsJson,
  loadConfig,
} from "../lib/config.mjs";

const fixtureProfiles = JSON.parse(
  await readFile(new URL("./fixtures/model-profiles.json", import.meta.url), "utf8"),
);

async function withRoots(files, run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "prime-config-"));
  const kitRoot = path.join(root, "kit");
  const targetRoot = path.join(root, "target");
  await mkdir(kitRoot);
  await mkdir(targetRoot);
  for (const [relative, contents] of Object.entries(files)) {
    const [scope, name] = relative.split("/");
    await writeFile(scope === "kit" ? path.join(kitRoot, name) : path.join(targetRoot, name), contents);
  }
  try {
    return await run({ kitRoot, targetRoot });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const requiredEnv = {
  PRIME_BASE_URL: "https://proxy.example",
  PRIME_LLM_KEY: "sentinel-secret",
};

test("derives three native proxy roots", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    const config = loadConfig({ kitRoot, targetRoot, env: requiredEnv });
    const actual = Object.fromEntries(config.providers.map(({ id, baseUrl }) => [id, baseUrl]));
    assert.equal(
      actual["prime-proxy-anthropic"],
      "https://proxy.example",
      `expected anthropic=https://proxy.example, actual=${actual["prime-proxy-anthropic"]}`,
    );
    assert.deepEqual(actual, {
      "prime-proxy-openai": "https://proxy.example/v1",
      "prime-proxy-anthropic": "https://proxy.example",
      "prime-proxy-google": "https://proxy.example/v1beta",
    });
  });
});

test("parses env files as data in documented precedence order", async () => {
  await withRoots(
    {
      "kit/.env": "PRIME_BASE_URL=https://kit-env.example\nPRIME_LLM_KEY=kit\n",
      "target/.env": "PRIME_BASE_URL=https://target-env.example\n",
      "kit/.env.local": "PRIME_BASE_URL='https://kit-local.example/'\n",
      "target/.env.local": 'PRIME_BASE_URL="https://target-local.example///"\n',
    },
    ({ kitRoot, targetRoot }) => {
      const fromFiles = loadConfig({ kitRoot, targetRoot, env: {} });
      assert.equal(fromFiles.providers[0].baseUrl, "https://target-local.example/v1");
      const fromProcess = loadConfig({
        kitRoot,
        targetRoot,
        env: { PRIME_BASE_URL: "https://process.example/", PRIME_LLM_KEY: "process" },
      });
      assert.equal(fromProcess.providers[0].baseUrl, "https://process.example/v1");
    },
  );
});

test("does not execute command substitution or shell expansion", async () => {
  await withRoots(
    {
      "kit/.env": [
        "PRIME_LLM_KEY='$(touch should-not-exist)'",
        "PRIME_BASE_URL=https://proxy.example",
        "PRIME_MODEL_SOL='gpt-5.6-sol-${HOME}'",
        "",
      ].join("\n"),
    },
    async ({ kitRoot, targetRoot }) => {
      const config = loadConfig({ kitRoot, targetRoot, env: {} });
      assert.equal(config.models[0].modelId, "gpt-5.6-sol-${HOME}");
      await assert.rejects(readFile(path.join(kitRoot, "should-not-exist")), { code: "ENOENT" });
    },
  );
});

test("supports scalar comments, quotes, and escapes without shell semantics", async () => {
  await withRoots(
    {
      "kit/.env": [
        "# comment",
        "export PRIME_BASE_URL = \"https://proxy.example/\" # comment",
        "PRIME_LLM_KEY='literal # key'",
        "PRIME_MODEL_SOL=gpt-5.6-sol\\#edge # comment",
        "",
      ].join("\n"),
    },
    ({ kitRoot, targetRoot }) => {
      const config = loadConfig({ kitRoot, targetRoot, env: {} });
      assert.equal(config.models[0].modelId, "gpt-5.6-sol#edge");
    },
  );
});

test("complete protocol overrides remain unchanged and empty overrides fail", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    const config = loadConfig({
      kitRoot,
      targetRoot,
      env: {
        ...requiredEnv,
        PRIME_OPENAI_BASE_URL: "https://openai.example/custom/",
        PRIME_ANTHROPIC_BASE_URL: "https://anthropic.example/v9/messages-root/",
        PRIME_GOOGLE_BASE_URL: "https://google.example/custom-version/",
      },
    });
    assert.deepEqual(config.providers.map((provider) => provider.baseUrl), [
      "https://openai.example/custom",
      "https://anthropic.example/v9/messages-root",
      "https://google.example/custom-version",
    ]);
    assert.throws(
      () =>
        loadConfig({
          kitRoot,
          targetRoot,
          env: { ...requiredEnv, PRIME_OPENAI_BASE_URL: "" },
        }),
      /E_CONFIG_EMPTY: PRIME_OPENAI_BASE_URL/,
    );
  });
});

test("validates bearer and native auth without resolving the credential", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    for (const [authMode, authHeader] of [
      ["bearer", true],
      ["native", false],
    ]) {
      const output = generateModelsJson(
        loadConfig({
          kitRoot,
          targetRoot,
          env: { ...requiredEnv, PRIME_PROXY_AUTH_MODE: authMode },
        }),
      );
      for (const provider of Object.values(output.providers)) {
        assert.equal(provider.apiKey, "PRIME_LLM_KEY");
        assert.equal(provider.authHeader, authHeader);
        assert.doesNotMatch(JSON.stringify(provider), /sentinel-secret/);
      }
    }
    assert.throws(
      () =>
        loadConfig({
          kitRoot,
          targetRoot,
          env: { ...requiredEnv, PRIME_PROXY_AUTH_MODE: "basic" },
        }),
      /E_AUTH_MODE/,
    );
  });
});

test("exports every literal profile field and complete thinking map", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    const output = generateModelsJson(loadConfig({ kitRoot, targetRoot, env: requiredEnv }));
    const actual = Object.values(output.providers).flatMap((provider) => provider.models);
    assert.deepEqual(actual, fixtureProfiles);
    const keys = [
      "id",
      "name",
      "api",
      "provider",
      "baseUrl",
      "reasoning",
      "input",
      "cost",
      "contextWindow",
      "maxTokens",
      "thinkingLevelMap",
    ];
    for (const profile of actual) {
      assert.deepEqual(Object.keys(profile).filter((key) => key !== "compat"), keys);
      assert.deepEqual(Object.keys(profile.thinkingLevelMap), [
        "off",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ]);
      assert.equal(profile.reasoning, true);
      assert.deepEqual(profile.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    }
  });
});

test("provider declarations have the exact Prime schema and unique non-built-in ids", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    const output = generateModelsJson(loadConfig({ kitRoot, targetRoot, env: requiredEnv }));
    assert.deepEqual(Object.keys(output.providers), [
      "prime-proxy-openai",
      "prime-proxy-anthropic",
      "prime-proxy-google",
    ]);
    for (const [id, provider] of Object.entries(output.providers)) {
      assert.ok(id.startsWith("prime-proxy-"));
      assert.deepEqual(
        Object.keys(provider),
        id === "prime-proxy-anthropic"
          ? ["id", "name", "api", "baseUrl", "apiKey", "authHeader", "headers", "models"]
          : ["id", "name", "api", "baseUrl", "apiKey", "authHeader", "models"],
      );
    }
  });
});

test("omits empty Anthropic beta headers and emits only a validated token", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    const empty = generateModelsJson(
      loadConfig({
        kitRoot,
        targetRoot,
        env: { ...requiredEnv, PRIME_ANTHROPIC_EXTENDED_CACHE_BETA: "" },
      }),
    );
    assert.equal("headers" in empty.providers["prime-proxy-anthropic"], false);
    const present = generateModelsJson(
      loadConfig({
        kitRoot,
        targetRoot,
        env: {
          ...requiredEnv,
          PRIME_ANTHROPIC_EXTENDED_CACHE_BETA: "extended-cache-ttl-2025-04-11",
        },
      }),
    );
    assert.deepEqual(present.providers["prime-proxy-anthropic"].headers, {
      "anthropic-beta": "extended-cache-ttl-2025-04-11",
    });
    assert.throws(
      () =>
        loadConfig({
          kitRoot,
          targetRoot,
          env: { ...requiredEnv, PRIME_ANTHROPIC_EXTENDED_CACHE_BETA: "good,bad" },
        }),
      /E_CACHE_BETA/,
    );
  });
});

test("alias overrides retain required wire-family tokens and change only ids", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    const aliases = {
      PRIME_MODEL_SOL: "gateway-gpt-5.6-sol-2026",
      PRIME_MODEL_TERRA: "gateway-gpt-5.6-terra-2026",
      PRIME_MODEL_OPUS: "claude-opus-5-gateway",
      PRIME_MODEL_SONNET: "claude-sonnet-5-gateway",
      PRIME_MODEL_GEMINI: "gemini-3.1-pro-preview-gateway",
    };
    const output = generateModelsJson(
      loadConfig({ kitRoot, targetRoot, env: { ...requiredEnv, ...aliases } }),
    );
    const actual = Object.values(output.providers).flatMap((provider) => provider.models);
    actual.forEach((profile, index) => {
      const expected = fixtureProfiles[index];
      assert.deepEqual({ ...profile, id: expected.id }, expected);
    });
    assert.deepEqual(
      actual.map(({ id }) => id),
      Object.values(aliases),
    );
    assert.throws(
      () =>
        loadConfig({
          kitRoot,
          targetRoot,
          env: { ...requiredEnv, PRIME_MODEL_OPUS: "claude-sonnet-5" },
        }),
      /E_MODEL_ALIAS: PRIME_MODEL_OPUS/,
    );
  });
});

test("returns frozen selector routing records", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    const config = loadConfig({ kitRoot, targetRoot, env: requiredEnv });
    assert.deepEqual(config.models, [
      { selector: "prime-proxy-openai/gpt-5.6-sol", provider: "prime-proxy-openai", modelId: "gpt-5.6-sol", thinking: "max" },
      { selector: "prime-proxy-openai/gpt-5.6-terra", provider: "prime-proxy-openai", modelId: "gpt-5.6-terra", thinking: "max" },
      { selector: "prime-proxy-anthropic/claude-opus-5", provider: "prime-proxy-anthropic", modelId: "claude-opus-5", thinking: "high" },
      { selector: "prime-proxy-anthropic/claude-sonnet-5", provider: "prime-proxy-anthropic", modelId: "claude-sonnet-5", thinking: "high" },
      { selector: "prime-proxy-google/gemini-3.1-pro-preview", provider: "prime-proxy-google", modelId: "gemini-3.1-pro-preview", thinking: "high" },
    ]);
  });
});

test("reports protected controls without returning their values", async () => {
  assert.ok(PROTECTED_VARIABLES.includes("PRIME_AGENT_CODING_AGENT_DIR"));
  assert.ok(PROTECTED_VARIABLES.includes("PRIME_AGENT_SESSION_DIR"));
  assert.ok(PROTECTED_VARIABLES.includes("PRIME_AGENT_CODING_AGENT_SESSION_DIR"));
  await withRoots(
    {
      "kit/.env": "PRIME_AGENT_CODING_AGENT_DIR=/secret/kit-home\n",
      "target/.env.local": "PRIME_AGENT_SESSION_DIR=/secret/session-home\n",
    },
    ({ kitRoot, targetRoot }) => {
      const config = loadConfig({ kitRoot, targetRoot, env: requiredEnv });
      assert.deepEqual(config.protectedViolations, [
        "PRIME_AGENT_CODING_AGENT_DIR",
        "PRIME_AGENT_SESSION_DIR",
      ]);
      assert.doesNotMatch(JSON.stringify(config), /secret\/(?:kit|session)-home|sentinel-secret/);
    },
  );
});

test("errors and debug-visible objects redact credentials", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    const secret = "never-print-this-secret";
    assert.throws(
      () =>
        loadConfig({
          kitRoot,
          targetRoot,
          env: { PRIME_BASE_URL: secret, PRIME_LLM_KEY: secret },
        }),
      (error) => {
        assert.doesNotMatch(String(error), new RegExp(secret));
        return true;
      },
    );
    const config = loadConfig({
      kitRoot,
      targetRoot,
      env: { PRIME_BASE_URL: "https://proxy.example", PRIME_LLM_KEY: secret },
    });
    assert.doesNotMatch(JSON.stringify(config), new RegExp(secret));
  });
});

test("fails closed for missing requirements and malformed env data", async () => {
  await withRoots({}, ({ kitRoot, targetRoot }) => {
    assert.throws(() => loadConfig({ kitRoot, targetRoot, env: {} }), /E_CONFIG_REQUIRED/);
  });
  await withRoots(
    { "kit/.env": "not an assignment\nPRIME_BASE_URL=https://proxy.example\nPRIME_LLM_KEY=x\n" },
    ({ kitRoot, targetRoot }) => {
      assert.throws(() => loadConfig({ kitRoot, targetRoot, env: {} }), /E_ENV_SYNTAX: kit\/\.env:1/);
    },
  );
});
