import { readFileSync } from "node:fs";
import path from "node:path";

const PROVIDER_IDS = Object.freeze({
  openai: "prime-proxy-openai",
  anthropic: "prime-proxy-anthropic",
  google: "prime-proxy-google",
});

const ZERO_COST = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
const INPUTS = Object.freeze(["text", "image"]);
const DEFAULT_CACHE_BETA = "extended-cache-ttl-2025-04-11";

const ROLE_DEFINITIONS = Object.freeze([
  {
    variable: "PRIME_MODEL_SOL",
    requiredToken: "gpt-5.6-sol",
    defaultId: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: PROVIDER_IDS.openai,
    api: "openai-responses",
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    thinking: "max",
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    compat: { supportsLongCacheRetention: true },
  },
  {
    variable: "PRIME_MODEL_TERRA",
    requiredToken: "gpt-5.6-terra",
    defaultId: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    provider: PROVIDER_IDS.openai,
    api: "openai-responses",
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    thinking: "max",
    thinkingLevelMap: {
      off: "none",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    compat: { supportsLongCacheRetention: true },
  },
  {
    variable: "PRIME_MODEL_OPUS",
    requiredToken: "opus-5",
    defaultId: "claude-opus-5",
    name: "Claude Opus 5",
    provider: PROVIDER_IDS.anthropic,
    api: "anthropic-messages",
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    thinking: "high",
    thinkingLevelMap: {
      off: "off",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    compat: {
      supportsEagerToolInputStreaming: true,
      supportsLongCacheRetention: true,
    },
  },
  {
    variable: "PRIME_MODEL_SONNET",
    requiredToken: "sonnet-5",
    defaultId: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: PROVIDER_IDS.anthropic,
    api: "anthropic-messages",
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    thinking: "high",
    thinkingLevelMap: {
      off: "off",
      minimal: null,
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    compat: {
      supportsEagerToolInputStreaming: true,
      supportsLongCacheRetention: true,
    },
  },
  {
    variable: "PRIME_MODEL_GEMINI",
    requiredToken: "gemini-3.1-pro",
    defaultId: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: PROVIDER_IDS.google,
    api: "google-generative-ai",
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    thinking: "high",
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "LOW",
      medium: null,
      high: "HIGH",
      xhigh: null,
      max: null,
    },
  },
]);

export const PROTECTED_VARIABLES = Object.freeze([
  "PRIME_AGENT_CODING_AGENT_DIR",
  "PRIME_AGENT_SESSION_DIR",
  "PRIME_AGENT_CODING_AGENT_SESSION_DIR",
  "PRIME_AGENT_DAEMON_SOCKET",
  "PRIME_AGENT_EXECUTABLE",
  "PRIME_AGENT_VERSION",
  "PI_CACHE_RETENTION",
  "PRIME_AGENT_PACKAGES",
  "PRIME_AGENT_SKILLS",
  "PRIME_AGENT_EXTENSIONS",
  "PRIME_AGENT_MODEL",
  "PRIME_AGENT_PROVIDER",
  "PRIME_AGENT_THINKING",
  "PRIME_AGENT_CWD",
  "PRIME_AGENT_LOCK",
]);

const protectedSet = new Set(PROTECTED_VARIABLES);

function syntaxError(label, line) {
  return new Error(`E_ENV_SYNTAX: ${label}:${line}`);
}

function decodeDoubleQuoted(input, label, line) {
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character !== "\\") {
      output += character;
      continue;
    }
    index += 1;
    if (index >= input.length) throw syntaxError(label, line);
    const escaped = input[index];
    output +=
      escaped === "n"
        ? "\n"
        : escaped === "r"
          ? "\r"
          : escaped === "t"
            ? "\t"
            : escaped;
  }
  return output;
}

function parseValue(raw, label, line) {
  const value = raw.trim();
  if (value.startsWith("'")) {
    const closing = value.indexOf("'", 1);
    if (closing < 0 || !/^(?:\s*(?:#.*)?)?$/.test(value.slice(closing + 1))) {
      throw syntaxError(label, line);
    }
    return value.slice(1, closing);
  }
  if (value.startsWith('"')) {
    let closing = -1;
    for (let index = 1; index < value.length; index += 1) {
      if (value[index] === '"' && value[index - 1] !== "\\") {
        closing = index;
        break;
      }
    }
    if (closing < 0 || !/^(?:\s*(?:#.*)?)?$/.test(value.slice(closing + 1))) {
      throw syntaxError(label, line);
    }
    return decodeDoubleQuoted(value.slice(1, closing), label, line);
  }

  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "#" && (index === 0 || /\s/.test(value[index - 1]))) break;
    if (character === "\\" && index + 1 < value.length) {
      output += value[index + 1];
      index += 1;
    } else {
      output += character;
    }
  }
  return output.trimEnd();
}

function parseEnvFile(contents, label) {
  const parsed = {};
  const lines = contents.replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw syntaxError(label, index + 1);
    parsed[match[1]] = parseValue(match[2], label, index + 1);
  });
  return parsed;
}

function readOptionalEnv(root, name, label) {
  try {
    return parseEnvFile(readFileSync(path.join(root, name), "utf8"), label);
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function normalizeUrl(value, variable) {
  const trimmed = value.trim().replace(/\/+$/, "");
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`E_CONFIG_URL: ${variable}`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`E_CONFIG_URL: ${variable}`);
  }
  return trimmed;
}

function required(config, variable) {
  if (!Object.hasOwn(config, variable) || config[variable] === "") {
    throw new Error(`E_CONFIG_REQUIRED: ${variable}`);
  }
  return config[variable];
}

function optionalUrl(config, variable, fallback) {
  if (!Object.hasOwn(config, variable)) return fallback;
  if (config[variable] === "") throw new Error(`E_CONFIG_EMPTY: ${variable}`);
  return normalizeUrl(config[variable], variable);
}

function makeProviderSummary(id, dialect, baseUrl, authMode, headers) {
  return {
    id,
    baseUrl,
    dialect,
    authMode,
    ...(headers ? { headers } : {}),
  };
}

export function loadConfig({ kitRoot, targetRoot, env }) {
  const sources = [
    readOptionalEnv(kitRoot, ".env", "kit/.env"),
    readOptionalEnv(targetRoot, ".env", "target/.env"),
    readOptionalEnv(kitRoot, ".env.local", "kit/.env.local"),
    readOptionalEnv(targetRoot, ".env.local", "target/.env.local"),
    Object.fromEntries(
      Object.entries(env ?? {}).filter(([, value]) => typeof value === "string"),
    ),
  ];
  const merged = Object.assign({}, ...sources);
  const protectedViolations = [];
  for (const source of sources) {
    for (const variable of Object.keys(source)) {
      if (protectedSet.has(variable) && !protectedViolations.includes(variable)) {
        protectedViolations.push(variable);
      }
    }
  }

  const baseRoot = normalizeUrl(required(merged, "PRIME_BASE_URL"), "PRIME_BASE_URL");
  required(merged, "PRIME_LLM_KEY");
  const authMode = merged.PRIME_PROXY_AUTH_MODE || "bearer";
  if (!["bearer", "native"].includes(authMode)) throw new Error("E_AUTH_MODE: PRIME_PROXY_AUTH_MODE");

  const openaiBaseUrl = optionalUrl(
    merged,
    "PRIME_OPENAI_BASE_URL",
    `${baseRoot}/v1`,
  );
  const anthropicBaseUrl = optionalUrl(
    merged,
    "PRIME_ANTHROPIC_BASE_URL",
    baseRoot,
  );
  const googleBaseUrl = optionalUrl(
    merged,
    "PRIME_GOOGLE_BASE_URL",
    `${baseRoot}/v1beta`,
  );

  const cacheBeta = Object.hasOwn(merged, "PRIME_ANTHROPIC_EXTENDED_CACHE_BETA")
    ? merged.PRIME_ANTHROPIC_EXTENDED_CACHE_BETA
    : DEFAULT_CACHE_BETA;
  if (cacheBeta && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(cacheBeta)) {
    throw new Error("E_CACHE_BETA: PRIME_ANTHROPIC_EXTENDED_CACHE_BETA");
  }
  const anthropicHeaders = cacheBeta ? { "anthropic-beta": cacheBeta } : undefined;

  const providers = [
    makeProviderSummary(PROVIDER_IDS.openai, "openai-responses", openaiBaseUrl, authMode),
    makeProviderSummary(
      PROVIDER_IDS.anthropic,
      "anthropic-messages",
      anthropicBaseUrl,
      authMode,
      anthropicHeaders,
    ),
    makeProviderSummary(PROVIDER_IDS.google, "google-generative-ai", googleBaseUrl, authMode),
  ];

  const models = ROLE_DEFINITIONS.map((role) => {
    const modelId = Object.hasOwn(merged, role.variable)
      ? merged[role.variable]
      : role.defaultId;
    if (!modelId || !modelId.includes(role.requiredToken)) {
      throw new Error(`E_MODEL_ALIAS: ${role.variable}`);
    }
    return {
      selector: `${role.provider}/${modelId}`,
      provider: role.provider,
      modelId,
      thinking: role.thinking,
    };
  });

  return {
    providers,
    models,
    protectedViolations,
  };
}

function makeModel(role, routing, provider) {
  return {
    id: routing.modelId,
    name: role.name,
    api: role.api,
    provider: role.provider,
    baseUrl: provider.baseUrl,
    reasoning: true,
    input: [...INPUTS],
    cost: { ...ZERO_COST },
    contextWindow: role.contextWindow,
    maxTokens: role.maxTokens,
    thinkingLevelMap: { ...role.thinkingLevelMap },
    ...(role.compat ? { compat: { ...role.compat } } : {}),
  };
}

export function generateModelsJson(config) {
  if (config.protectedViolations.length > 0) {
    throw new Error(`E_PROTECTED_VARIABLE: ${config.protectedViolations.join(",")}`);
  }
  const providerById = Object.fromEntries(
    config.providers.map((provider) => [provider.id, provider]),
  );
  const providers = {};
  for (const summary of config.providers) {
    const roles = ROLE_DEFINITIONS.map((role, index) => ({ role, routing: config.models[index] }))
      .filter(({ role }) => role.provider === summary.id);
    const provider = {
      id: summary.id,
      name:
        summary.id === PROVIDER_IDS.openai
          ? "Prime Proxy OpenAI"
          : summary.id === PROVIDER_IDS.anthropic
            ? "Prime Proxy Anthropic"
            : "Prime Proxy Google",
      api: summary.dialect,
      baseUrl: summary.baseUrl,
      apiKey: "PRIME_LLM_KEY",
      authHeader: summary.authMode === "bearer",
      ...(summary.headers ? { headers: { ...summary.headers } } : {}),
      models: roles.map(({ role, routing }) =>
        makeModel(role, routing, providerById[role.provider]),
      ),
    };
    providers[summary.id] = provider;
  }
  return { providers };
}
