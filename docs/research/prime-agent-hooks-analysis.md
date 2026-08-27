# Prime Agent — CLI Extension/Configuration Hooks Analysis

Repo inspected read-only at `/home/user/workspace/prime-agent`, git HEAD `bc0fa76 test(coding-agent): cover root sibling agent messaging (#1698)`, workspace version `0.8.1` (root `package.json`). No files were edited.

Monorepo layout: `packages/{ai,agent,coding-agent,tui}` + `prime-agent-runtime/` (Python kernel/RLM runtime) + `install.sh`, `prime-agent.sh`, root `AGENTS.md`. Docs: `packages/coding-agent/docs/` (`models.md`, `settings.md`, `usage.md`, `skills.md`, `packages.md`, `extensions.md`, `custom-provider.md`, `rlm.md`, `rlm-runtime.md`, `sdk.md`, `providers.md`, `architecture.md`, `json.md`, `rpc.md`, `acp.md`, `compaction.md`, `development.md`, `index.md`).

Note on inherited names: product/CLI is `prime-agent`; npm workspaces are still `@earendil-works/pi-*`, the manifest key is `pi`, and several env vars keep the `PI_*` prefix (`packages/coding-agent/docs/development.md`, "Product and Source Names").

---

## 0. Config roots (everything below hangs off these)

| Thing | Path | Source |
|---|---|---|
| Global agent dir | `~/.prime/agent` | `CONFIG_DIR_NAME = ".prime/agent"` — `packages/coding-agent/src/config.ts:498`; `getAgentDir()` — `config.ts:525` |
| Override for global dir | `PRIME_AGENT_CODING_AGENT_DIR` (tilde-expanded) | `ENV_AGENT_DIR = ${envPrefix}_CODING_AGENT_DIR` — `config.ts:502` |
| Session dir | `--session-dir` > `PRIME_AGENT_SESSION_DIR` > legacy `PRIME_AGENT_CODING_AGENT_SESSION_DIR` > settings `sessionDir` | `config.ts` (`ENV_SESSION_DIR`), `docs/settings.md` |
| Global settings | `~/.prime/agent/settings.json` | `settings-manager.ts:228` |
| Project settings | `<cwd>/.prime/agent/settings.json` (cwd only, **no ancestor walk**) | `settings-manager.ts:229` |
| Custom models | `<agentDir>/models.json` (**agent dir only — no project-level models.json**) | `model-registry.ts:460`, `sdk.ts:151` |
| Kernel venv | `~/.prime/agent/kernel-venv`, override `PRIME_AGENT_KERNEL_VENV`; `PRIME_AGENT_KERNEL_PYTHON` skips bootstrap | `core/kernel/bootstrap.ts:329-366, 839-867` |

Project settings override global; nested objects are merged. `idleEvictionMinutes` is read only from global (`docs/settings.md`).

---

## 1. Custom `models.json`

- Doc: `packages/coding-agent/docs/models.md`. Loader: `packages/coding-agent/src/core/model-registry.ts`.
  - `ModelRegistry.create(authStorage, modelsJsonPath = join(getAgentDir(), "models.json"))` — line ~460; ctor calls `this.loadModels()` (line 461).
  - `refresh()` — line 479: clears `providerRequestConfigs`, `modelRequestHeaders`, auth-source tokens, reloads `authStorage`, resets API/OAuth provider registries, re-registers built-in MCP OAuth providers, then `loadModels()` (line 503). Called when the `/model` selector opens and on provider removal (line 783, 1460) — **no restart needed to pick up `models.json` edits**.
  - `loadModels()` — line 517: `loadCustomModels(path)` → built-ins with overrides (`loadBuiltInModels`, line 544) → `mergeCustomModels` (line 577, upsert by `provider`+`id`, custom wins) → OAuth `modifyModels` hooks.
  - `loadCustomModels()` — line 589: `stripJsonComments` (JSONC allowed), TypeBox validation (`preloadModelsConfigValidator`, line 211; first startup validates asynchronously and only logs, later refreshes validate synchronously and hard-fail into `loadError`).
- Schema: `providers: Record<string, ProviderConfig>` (`model-registry.ts:201`). Provider fields: `baseUrl`, `api`, `apiKey`, `headers`, `authHeader` (line 195), `models[]`, `modelOverrides{}`, `compat`.
- Override semantics (docs `models.md`, code `loadBuiltInModels`/`applyModelOverride`/`mergeCompat` ~line 347):
  - Provider entry with only `baseUrl`/`compat` → all built-in models for that provider keep working (OAuth intact) with the new endpoint/compat.
  - `models[]` with an id equal to a built-in id **replaces** that model.
  - `modelOverrides` patches built-ins: `name`, `reasoning`, `input`, partial `cost`, `contextWindow`, `maxTokens`, `headers`, `compat`; unknown ids ignored.
- Secret resolution: `packages/coding-agent/src/core/resolve-config-value.ts` — a value is a literal, an env var name, or `"!cmd ..."` shell command. Shell values are executed **at request time on every request** (no TTL/caching); the `/model` availability check deliberately never executes them.
- `authHeader: true` sends `Authorization: Bearer <apiKey>` (useful for Anthropic-compatible proxies that want bearer instead of `x-api-key`) — `model-registry.ts:1333-1338`. Header merge order (later wins): `model.headers` → authStorage provider headers → provider `headers` → per-model `headers` (`model-registry.ts:1321-1331`).
- SDK equivalent: `packages/coding-agent/src/core/sdk.ts:151` — `const modelsPath = options.agentDir ? join(agentDir, "models.json") : undefined`; `ModelRegistry.inMemory(authStorage)` (line ~471) for no-file usage. Examples: `packages/coding-agent/examples/sdk/02-custom-model.ts`, `09-api-keys-and-oauth.ts`, `12-full-control.ts`.

Minimal Anthropic-compatible-proxy entry:

```jsonc
{
  "providers": {
    "corp-anthropic": {
      "baseUrl": "https://llmproxy.corp/anthropic",
      "api": "anthropic-messages",
      "apiKey": "CORP_PROXY_KEY",          // env var name, literal, or "!vault read ..."
      "headers": { "X-Corp-Tenant": "platform" },
      "compat": { "supportsLongCacheRetention": true, "supportsEagerToolInputStreaming": false },
      "models": [
        { "id": "claude-sonnet-4-6", "name": "Sonnet 4.6 (proxy)", "reasoning": true,
          "input": ["text", "image"], "contextWindow": 200000, "maxTokens": 64000,
          "cost": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 },
          "thinkingLevelMap": { "xhigh": "high", "max": null } }
      ]
    }
  }
}
```

---

## 2. Per-model API dialect

- `api` is settable at provider level (default for its models) and overridable per model. Values: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai` (`docs/models.md`; `google-generative-ai` requires an explicit `baseUrl` for custom models).
- Implementations: `packages/ai/src/providers/{anthropic,openai-completions,openai-responses,openai-responses-shared,openai-codex-responses,azure-openai-responses,google,google-vertex,google-shared,amazon-bedrock,mistral,cloudflare,faux}.ts`; registration `packages/ai/src/providers/register-builtins.ts` and `packages/ai/src/api-registry.ts`.
- OpenAI-family `compat` flags (docs `models.md` § OpenAI Compatibility): `supportsStore`, `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsUsageInStreaming`, `maxTokensField`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages`, `thinkingFormat` (`openai|openrouter|deepseek|zai|qwen|qwen-chat-template`), `cacheControlFormat: "anthropic"`, `supportsStrictMode`, `supportsLongCacheRetention`, `openRouterRouting`, `vercelGatewayRouting`. Responses API adds `sendSessionIdHeader` (default true) — `openai-responses.ts`.
- Anthropic `compat`: `supportsEagerToolInputStreaming` (default true; when false the per-tool `eager_input_streaming` field is dropped and the legacy `fine-grained-tool-streaming-2025-05-14` beta header is sent instead) and `supportsLongCacheRetention` (default true) — `getAnthropicCompat()` in `packages/ai/src/providers/anthropic.ts:173-178`; beta consts at lines 170-171.
- Provider-level `compat` acts as defaults; model-level `compat` merges over it (`mergeCompat`, `model-registry.ts:~347`).
- A genuinely new dialect requires an extension: `pi.registerProvider(...)` + custom streaming API registration — `packages/coding-agent/docs/custom-provider.md` (§ Custom Streaming API, § Registration), example extensions `packages/coding-agent/examples/extensions/custom-provider-anthropic`, `custom-provider-gitlab-duo`. Extension factories may be `async` and are awaited before startup, so dynamic model discovery (`fetch /v1/models`) is available to interactive startup and `prime-agent model list`.

---

## 3. Per-model thinking / effort

- Levels: `off, minimal, low, medium, high, xhigh, max` — `THINKING_LEVELS` in `packages/coding-agent/src/core/thinking-levels.ts`. Default `DEFAULT_THINKING_LEVEL` in `packages/coding-agent/src/core/defaults.ts` (`"xhigh"`).
- CLI: `--thinking <level>` parsed at `packages/coding-agent/src/cli/args.ts:168-176`. `--model <pattern>` accepts `provider/id` plus a `:<thinking>` suffix — parsing in `packages/coding-agent/src/core/model-resolver.ts` `parseModelPattern()` line 205 (suffix handling lines 216-245, multi-pattern scoping 269-311, resolution 409-468, defaults 510-565). TUI: `/effort` (alias `/thinking`) — `core/slash-commands.ts:90, 208`; handlers `modes/interactive/interactive-mode.ts:1286, 4692, 7730`.
- Settings (`docs/settings.md`): `defaultThinkingLevel`, `thinkingBudgets` (per-level token budgets), `hideThinkingBlock`.
- Per-model capability declaration: `thinkingLevelMap` (tristate) — omit an entry for default mapping, string to change the value sent, `null` to mark unsupported (hidden in UI and clamped away). Replaces the older `compat.reasoningEffortMap`.
- Capability/clamp logic: `packages/ai/src/models.ts:67-99` — `getSupportedThinkingLevels()` (non-reasoning models → `["off"]`; `xhigh`/`max` require an explicit map entry) and `clampThinkingLevel()` (walks up, then down, the level list).
- Wire application:
  - `packages/ai/src/providers/openai-completions.ts:632-666` — emits `enable_thinking`, `chat_template_kwargs.enable_thinking`, `thinking: {type}`, `reasoning_effort`, or `reasoning.effort` per `thinkingFormat`; off-value defaults to `"none"`.
  - `packages/ai/src/providers/anthropic.ts` — `mapThinkingLevelToEffort()` ~766-780, then `effort` and/or `thinkingBudgetTokens` ~800-840.
  - Budget math: `packages/ai/src/providers/simple-options.ts` — `adjustMaxTokensForThinking` (defaults minimal 1024, low 2048, medium 8192, high 16384) and `clampReasoning` (xhigh/max → high for non-adaptive models).
- Session resolution order: `packages/coding-agent/src/core/sdk.ts:211-226` — explicit option → existing session entry → `settingsManager.getDefaultThinkingLevel()` → `DEFAULT_THINKING_LEVEL`, then `clampThinkingLevel(model, level)`. Per-session enumeration: `agent-session.ts:7201` → `getSupportedThinkingLevels(this.model)`.

---

## 4. RLM child model selection

- Python surface (`prime-agent-runtime/src/rlm/`, docs `packages/coding-agent/docs/rlm.md`, `rlm-runtime.md`): `await rlm(prompt, name=..., model="provider/id", thinking="high")`, plus `rlm.run`, `rlm.find_models(query, limit)`, `rlm.list_subagents()`, `rlm.delete_subagent()`, `rlm.host_request()`. Returns `RLMSpawnHandle{rlm_child_id, name, session_dir, model}` at admission.
- Validation bridge: `packages/coding-agent/src/core/rlm-runtime.ts` — name length (`RLM_SUBAGENT_SESSION_NAME_MAX_LENGTH`), `thinking ∈ THINKING_LEVELS`, non-empty `model`; `findRlmModelMatches()` lines 135-160 scores `provider/id`, `id`, `name`; `MAX_RLM_MODEL_SEARCH_LIMIT` caps `find_models`.
- Host handlers: `packages/coding-agent/src/core/agent-session.ts`
  - `rlm.run` / `rlm.find_models` registered ~9063-9066.
  - `_authenticatedRlmModels()` ~10160 = `getExecutableModels()` filtered to auth status not `stale`/`expired`.
  - `_resolveRlmSubagentModel()` ~10173 requires an exact case-insensitive `provider/id` match, then an `getApiKeyAndHeaders()` preflight; otherwise throws `"is unavailable, unauthenticated, or expired"` / `"failed authentication preflight"`. **Never silently falls back to the parent model.**
  - `_startRlmChildRun()` ~10203 rejects unknown kwargs, enforces depth, validates `thinking` against `getSupportedThinkingLevels(model)`.
- `getExecutableModels()` — `model-registry.ts:967` — intersects the registry with the OpenAI-Codex catalog (`OPENAI_CODEX_CLIENT_VERSION = "0.147.0"`). The comment at `model-registry.ts:366-385` flags the asymmetry: `/model` uses unfiltered `getAvailable()` while RLM spawn and `find_models` use `getExecutableModels()`. **A custom proxy model can therefore be selectable in `/model` but rejected as an RLM child model** — verify with `rlm.find_models` before relying on it.
- Depth precedence: `_resolveRlmMaxDepth()` `agent-session.ts:1570-1590` — persisted chat state (`rlm_max_depth_state`, const line 919) → inherited `config.rlmMaxDepth` → global `settingsManager.getRlmMaxDepth()` → `process.env.RLM_MAX_DEPTH` → default **2**. Types in `core/rlm-max-depth.ts`; settings comment at `settings-manager.ts:136`.
- Kernel env injected at provisioning time only (`_rlmKernelEnv()` ~9199-9205): `RLM_DEPTH`, `RLM_MAX_DEPTH`, `RLM_SESSION_DIR`.
- Children inherit parent model, tools, provider hooks, resource loader, registry, transport, retry, and thinking config; artifacts under `~/.prime/agent/session-artifacts/<root>/sub-xxxxxxxx/`.

---

## 5. Skills — project and global

- Doc `packages/coding-agent/docs/skills.md`; loader `packages/coding-agent/src/core/skills.ts`; block rendering `core/skill-blocks.ts`; discovery/enable logic `core/package-manager.ts` and `core/resource-loader.ts`.
- Discovery order (highest precedence first; first name wins, collisions warn):
  1. `--skill <path>` (repeatable; loads even with `--no-skills`) — `skills.ts:591-616`.
  2. settings `skills[]` entries (glob patterns, `!exclude`, `+force-include`, `-force-exclude`).
  3. Project: `<cwd>/.prime/agent/skills/` and `.agents/skills/` in cwd **and every ancestor up to the git root** — `collectAncestorAgentsSkillDirs()` / `findGitRepoRoot()` `package-manager.ts:419-451`, wired at `package-manager.ts:2153-2186`.
  4. Global: `~/.prime/agent/skills/` and `~/.agents/skills/` — `package-manager.ts:2152, 2209-2215`; defaults added in `skills.ts:567-568`.
  5. Package-provided skills (`skills/` dir or `pi.skills` in a package's `package.json`).
  6. Bundled built-in skills (lowest) — `package-manager.ts:2218-2243`, gated by `enableBuiltinSkills`.
- Shape rules: `SKILL.md` directories are found recursively everywhere (`skills.ts:271-302`: a dir containing `SKILL.md` is a skill root and is not recursed into); bare root-level `.md` files count as skills only under `~/.prime/agent/skills/` and `<project>/.prime/agent/skills/` (`"pi"` discovery mode), never under `.agents/skills` (`"agents"` mode).
- Frontmatter: `name` (≤64, lowercase/digits/hyphens, must match directory), `description` (≤1024, **required** — missing means not loaded), `license`, `compatibility`, `metadata`, `allowed-tools`, `disable-model-invocation`.
- Settings: `skills[]`, `enableSkillCommands` (default true → `/skill:<name>`), `enableBuiltinSkills` (default true, `settings-manager.ts:161, 1096`), `bundledSkills.websearch` (default true in settings but the bundled websearch skill is force-disabled via `-websearch/SKILL.md` unless enabled — `package-manager.ts:2244-2250`).
- Built-ins shipped: `prime-intellect`, `skill-creator`, `websearch` (Serper; `SERPER_API_KEY`, `PRIME_AGENT_WEBSEARCH_TIMEOUT`, `PRIME_AGENT_WEBSEARCH_NUM_RESULTS`).
- Python-backed skills: `SKILL.md` + `pyproject.toml` + `src/<import_name>/__init__.py`, installed editable into the kernel venv; `detectPythonSkill()` `skills.ts:414`; duplicate import names warn (`skills.ts:551-560`). With `PRIME_AGENT_KERNEL_PYTHON` set, auto-install is skipped and unavailable Python skills are disabled with a warning (`kernel/bootstrap.ts:839-867`).
- Relative paths inside a skill resolve against the skill directory (injected instruction, `skills.ts:454`).

---

## 6. `AGENTS.md` loading

- `packages/coding-agent/src/core/resource-loader.ts`:
  - `loadContextFileFromDir(dir)` lines 58-72 — candidate order `["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]`, **first hit only per directory**.
  - `loadProjectContextFiles({cwd, agentDir})` lines 75-113 — pushes the global `<agentDir>/AGENTS.md` first, then walks from `cwd` up to the filesystem root, `unshift`ing each hit so final order is root→cwd (nearest file last / most specific), deduped by path.
- Disable with `--no-context-files` / `-nc` (`packages/coding-agent/src/cli/command-registry.ts`). `/reload` re-reads context files. Snapshot exposure: `modes/agent-connection/snapshot.ts:113` (`getAgentsFiles()`).
- System-prompt overrides live in the same loader: project `<cwd>/.prime/agent/SYSTEM.md` (line 865), global `<agentDir>/SYSTEM.md` (870), project `APPEND_SYSTEM.md` (879), global `APPEND_SYSTEM.md` (884); CLI `--system-prompt`, `--append-system-prompt`.

---

## 7. Extensions and packages

- Docs `packages/coding-agent/docs/extensions.md`, `packages/coding-agent/docs/packages.md`, `docs/custom-provider.md`. Code: `packages/coding-agent/src/core/extensions/`, `core/package-manager.ts`, `core/resource-loader.ts`, `core/prompt-templates.ts`.
- Auto-discovered extension locations (`collectAutoExtensionEntries`, wired at `package-manager.ts:2171-2177, 2203-2209`): `<agentDir>/extensions/*.ts`, `<agentDir>/extensions/*/index.ts`, `<cwd>/.prime/agent/extensions/*.ts`, `<cwd>/.prime/agent/extensions/*/index.ts`. `/reload` hot-reloads only extensions in these locations.
- CLI: `-e/--extension <path|npm:pkg|git:host/user/repo>` (temporary per-run install), `--no-extensions` / `-ne`.
- Settings resource keys: `packages`, `extensions`, `skills`, `prompts`, `themes`. Relative entries resolve against the settings file's own `.prime/agent` dir; glob patterns support `!`, `+`, `-` (`isEnabledByOverrides`, `package-manager.ts:2164`).
- Package sources: `npm:pkg[@ver]`, `git:host/user/repo[@ref]`, `https://` / `ssh://` / `git://` URLs, absolute/relative local paths. Global npm installs via `npm install -g`; project npm under `.prime/agent/npm/`; git clones to `<agentDir>/git/<host>/<path>` (or `.prime/agent/git/...` with `--local`); `npm install` runs (`--omit=dev` for prod). CLI verbs: `prime-agent package install|remove|list|update [--local]`, `prime-agent config` (enable/disable individual resources).
- Manifest: `package.json` with `pi: { extensions, skills, prompts, themes, video, image }` and keyword `pi-package`; convention dirs `extensions/`, `skills/`, `prompts/`, `themes/`. Host APIs must be peer deps with `"*"` and never bundled: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`. Any other resource package must be in both `dependencies` and `bundledDependencies` and referenced through `node_modules/` paths.
- Extension API: `export default function (pi: ExtensionAPI)` (may be `async`; awaited before startup). Surfaces: `pi.on(event)`, `pi.registerTool()`, `pi.registerCommand()`, `pi.registerProvider()` / `pi.unregisterProvider()`, `pi.appendEntry()`, `ctx.ui.{notify,confirm,select,input,custom}`. `tool_call` hooks can `return { block: true, reason }`.
- Extra knobs: settings `npmCommand` (argv array; `bun` special-cased to `pm bin -g`), env `PI_PACKAGE_DIR`.

---

## 8. `PI_CACHE_RETENTION=long` through custom Anthropic-compatible proxies

- Type: `CacheRetention = "none" | "short" | "long"`; `cacheRetention?: CacheRetention` on `StreamOptions` — `packages/ai/src/types.ts:93`.
- `resolveCacheRetention()` is duplicated in four providers and returns the explicit option, else `"long"` when `process.env.PI_CACHE_RETENTION === "long"`, else `"short"`:
  `packages/ai/src/providers/anthropic.ts:52-62`, `openai-responses.ts:33-43`, `openai-completions.ts:129-137`, `amazon-bedrock.ts:547-556`.
- **The coding agent never sets `cacheRetention` programmatically.** A grep of `packages/coding-agent/src` finds only the three `supportsLongCacheRetention` schema lines (`model-registry.ts:125, 130, 135`). `packages/agent/src/agent.ts` `createLoopConfig()` (~462-475) forwards `reasoning, serviceTier, sessionId, onPayload, onResponse, transport, thinkingBudgets, maxRetryDelayMs` — but not `cacheRetention`. Only `packages/agent/src/proxy.ts:54, 93` forwards it (the `streamProxy` path). ⇒ **`PI_CACHE_RETENTION=long` in the environment is the only CLI-level lever**, and per-model `compat.supportsLongCacheRetention: false` is the only opt-out.
- Anthropic dialect (`anthropic.ts` `getCacheControl()` lines 64-77): retention `none` → no `cache_control`; otherwise `{type:"ephemeral"}`, plus `ttl:"1h"` when retention is `long` **and** `getAnthropicCompat(model).supportsLongCacheRetention !== false`. There is **no `baseUrl`/`api.anthropic.com` gate in the current code** — this contradicts the historical note in `packages/ai/CHANGELOG.md:914` ("Only applies to direct API calls"). So a custom `anthropic-messages` proxy **does** receive `cache_control.ttl: "1h"`; if the proxy rejects it, set `compat.supportsLongCacheRetention: false` on the provider or model.
- **No `extended-cache-ttl-*` beta header is ever sent** (repo-wide grep: zero hits). The only betas are `fine-grained-tool-streaming-2025-05-14` and `interleaved-thinking-2025-05-14` (`anthropic.ts:170-171`), plus `claude-code-20250219` / `oauth-2025-04-20` on the OAuth path (~852-936). A proxy that requires the 1h-TTL beta header must inject it itself, or you must add it via provider/model `headers`.
- OpenAI Chat Completions (`openai-completions.ts:576-591`): `prompt_cache_key` is sent when (`baseUrl.includes("api.openai.com")` and retention ≠ none) **or** (retention long and `supportsLongCacheRetention`); `prompt_cache_retention: "24h"` when retention long and supported (no baseUrl gate). `getCompatCacheControl()` 687-697 + `applyAnthropicCacheControl()` ~699: with `compat.cacheControlFormat === "anthropic"` and retention ≠ none, Anthropic-style `cache_control` (with `ttl:"1h"` when long+supported) is attached to the system prompt, the last tool definition, and the last conversation message.
- OpenAI Responses (`openai-responses.ts:45-56, 221-228`): `prompt_cache_key` unless retention none; `prompt_cache_retention: "24h"` when long and supported.
- Bedrock (`amazon-bedrock.ts:193-197, 619-627, 642, 777-783`): `cachePoint { type: DEFAULT, ttl: ONE_HOUR }` when long.
- Cost accounting: `packages/ai/src/cache-pricing.ts` — cache read ×0.1; cache write ×1.25 (5m) vs ×2.0 (1h), gated by `hasStandardAnthropicCachePricing()` (provider `anthropic`, or model id starting with `anthropic/` or `claude-`); applied in `anthropic.ts:510-556`. **A proxy provider named e.g. `corp-anthropic` with model id `claude-sonnet-4-6` still gets the multiplier (id prefix match); an id like `sonnet-proxy` will not**, so 1h-write costs will be under-reported.
- Faux provider simulates caching when a `sessionId` is present and retention ≠ none (`faux.ts:215`).
- Docs mentions: `packages/coding-agent/docs/usage.md:361`, `packages/coding-agent/README.md:683`. Tests: `packages/ai/test/cache-retention.test.ts`, `openai-completions-prompt-cache.test.ts`, `openai-completions-cache-control-format.test.ts`, `anthropic-eager-tool-input-compat.test.ts`.

---

## 9. Other CLI/env facts relevant to packaging a repo

- Modes: default TUI; `-p/--print`; `--mode json` (`docs/json.md`, newline-delimited `AgentSessionEvent`); `--mode rpc` (`docs/rpc.md`); ACP (`docs/acp.md`).
- Session flags: `-c` (continue), `-r/--resume`, `--fork`, `--session-dir`, `--no-session`.
- Tools: `--tools/-t`, `--no-builtin-tools/-nbt`, `--no-tools/-nt`. The only built-in tool is `ipython` (Python kernel); everything else comes from skills/extensions/MCP.
- Misc: `--cwd`, `--offline`, `--verbose`, `--models <patterns>`, `--api-key`, `--provider`.
- Autonomous: `--autonomous`, `--autonomous-gate`, `--autonomous-gate-retries` (3), `--autonomous-gate-timeout-ms` (300000), `--autonomous-max-continuations` (3), `--autonomous-max-turns` (12), `--autonomous-max-tokens` (80000), `--autonomous-timeout-ms` (1800000), `--goal`, `--goal-token-budget`.
- Env vars: `PRIME_AGENT_CODING_AGENT_DIR`, `PRIME_AGENT_SESSION_DIR`, `PI_PACKAGE_DIR`, `PI_OFFLINE`, `PI_SKIP_VERSION_CHECK`, `PRIME_AGENT_DOWNLOAD_BASE_URL`, `PI_CACHE_RETENTION`, `PRIME_API_KEY`, `PRIME_AGENT_TRACES_API_KEY`, `PRIME_AGENT_TRACES_BASE_URL`, `PRIME_AGENT_KERNEL_PYTHON`, `PRIME_AGENT_KERNEL_VENV`, `RLM_MAX_DEPTH`, `PRIME_AGENT_TELEMETRY=0` / `DO_NOT_TRACK=1`, `PRIME_AGENT_TELEMETRY_ENDPOINT`, `PI_SHARE_VIEWER_URL`, `GIT_TERMINAL_PROMPT`, `GIT_SSH_COMMAND`.
- Provider API keys picked up from the environment are enumerated in `packages/ai/src/env-api-keys.ts` (mirrored by the `--no-env` unset list in `prime-agent.sh`).
- Install: `curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh`. From source: `npm ci` then `./prime-agent.sh` (tsx) or `./prime-agent.sh --dist` (bundled build, ~3× faster startup). Node ≥ 22.8.0.
- Service commands: `prime-agent status`, `doctor`, `doctor --fix`, `shutdown`. Debug log `~/.prime/agent/prime-agent-debug.log` via `/debug`; logs under `~/.prime/agent/logs/`.

---

## 10. Recommended integration design — a standalone clone-and-run repo

Goal: one git repo a user clones, sets two env vars in, and runs — with a custom Anthropic-compatible proxy, per-model dialect/effort tuning, long cache retention, project skills, extensions, and RLM child models, all reproducible and reviewable.

### 10.1 Layout

```
my-agent-config/
  README.md
  AGENTS.md                        # repo-root project context (loaded automatically, nearest-last)
  .envrc                           # or env.example — sets PRIME_AGENT_CODING_AGENT_DIR etc.
  run.sh                           # thin wrapper: exports env, execs prime-agent
  bootstrap.sh                     # one-time: build agent home from templates
  agent-home/                      # becomes $PRIME_AGENT_CODING_AGENT_DIR (git-tracked templates)
    models.json.example            # committed; bootstrap copies/symlinks -> agent-home/models.json
    settings.json                  # global settings (defaultThinkingLevel, rlmMaxDepth, resource lists)
    AGENTS.md                      # optional global context, prepended before project files
    SYSTEM.md / APPEND_SYSTEM.md   # optional prompt overrides
    extensions/<name>/index.ts     # global extensions (hot-reloadable via /reload)
    skills/<name>/SKILL.md         # global skills
  .prime/agent/                    # project-scoped config for this repo itself
    settings.json                  # project overrides (merged over global)
    skills/<name>/SKILL.md
    extensions/<name>/index.ts
  .gitignore                       # ignore agent-home/models.json, agent-home/{sessions,logs,kernel-venv,git,npm,session-artifacts}, *.local.json
```

Key decision: **set `PRIME_AGENT_CODING_AGENT_DIR` to a repo-local directory** (`agent-home/`). That is the only way to version-control `models.json`, because the registry reads `models.json` exclusively from the agent dir (`model-registry.ts:460`) — there is no project-level `models.json`. Everything else (settings, skills, extensions, prompts) additionally supports the project-scoped `.prime/agent/` path, so put repo-specific behavior there and account-wide behavior in `agent-home/`.

### 10.2 `run.sh` (single entry point)

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PRIME_AGENT_CODING_AGENT_DIR="$REPO/agent-home"     # config.ts:502
export PRIME_AGENT_SESSION_DIR="$REPO/agent-home/sessions" # keep sessions out of ~
export PI_CACHE_RETENTION=long                             # only lever for 1h cache TTL
export RLM_MAX_DEPTH="${RLM_MAX_DEPTH:-2}"                 # floor; settings/chat-state can raise
[ -f "$REPO/.env.local" ] && set -a && . "$REPO/.env.local" && set +a   # proxy keys, never committed

exec prime-agent "$@"    # or: exec /path/to/prime-agent/prime-agent.sh "$@"
```

`bootstrap.sh` should: verify Node ≥ 22.8.0, `cp -n agent-home/models.json.example agent-home/models.json`, and print which env vars/keys are missing. Do **not** commit `agent-home/models.json` itself — commit the `.example` and let users layer secrets, since shell-command secret values (`"!op read ..."`) are re-executed on *every* request and per-user tooling differs.

### 10.3 Proxy + dialect + effort configuration (`models.json.example`)

- One provider entry per proxy route, `api` chosen per route (`anthropic-messages` for Claude-shaped routes, `openai-completions` / `openai-responses` for OpenAI-shaped routes).
- Prefer `apiKey: "MY_PROXY_KEY"` (env var name) over `"!cmd"`; use `authHeader: true` if the proxy wants `Authorization: Bearer` instead of `x-api-key`.
- Use `modelOverrides` (not new `models` entries) when you only want to re-point built-in Claude/GPT models at the proxy — this preserves built-in metadata and any existing OAuth credential. Use `models[]` when the proxy exposes ids the catalog doesn't have.
- Encode proxy quirks in `compat` per provider, refined per model:
  - `supportsLongCacheRetention: false` → suppress `ttl:"1h"` / `prompt_cache_retention:"24h"` for proxies that reject them.
  - `supportsEagerToolInputStreaming: false` → drops per-tool `eager_input_streaming` and falls back to the legacy fine-grained-streaming beta header.
  - `cacheControlFormat: "anthropic"` → for OpenAI-shaped proxies fronting Anthropic models.
  - `requiresToolResultName`, `requiresAssistantAfterToolResult`, `requiresThinkingAsText`, `supportsDeveloperRole`, `supportsUsageInStreaming`, `maxTokensField`, `thinkingFormat` → per-gateway message-shape fixes.
- Encode effort capability with `thinkingLevelMap` per model (`{"xhigh": "high", "max": null}` is the safe pattern for proxies that only accept `low|medium|high`); pair with settings `defaultThinkingLevel` and `thinkingBudgets`.
- Name proxy model ids with a `claude-` prefix when they are Claude models, so 1h cache-write pricing is applied (`cache-pricing.ts` `hasStandardAnthropicCachePricing()`); otherwise set `cost` deliberately and treat reported cache-write cost as approximate.
- If the proxy needs a wire dialect none of the four `api` values covers, ship an extension using `pi.registerProvider` + a custom streaming API (`docs/custom-provider.md`), modeled on `examples/extensions/custom-provider-anthropic`.

### 10.4 Skills, context, and extensions in the repo

- Repo-root `AGENTS.md` is the primary context file; keep it short and put deep material in skills. Remember only the *first* of `AGENTS.md`/`AGENTS.MD`/`CLAUDE.md`/`CLAUDE.MD` per directory is read, and ancestor files above the repo are also read unless `-nc` is passed.
- Project skills → `.prime/agent/skills/<name>/SKILL.md`; each needs `name` matching its directory and a non-empty `description`, or it is silently skipped. If you want the repo's skills to also work for other agent CLIs, mirror them under `.agents/skills/<name>/SKILL.md` (discovered up to the git root) — but note bare `.md` files there are ignored; always use a `SKILL.md` directory.
- Extensions → `.prime/agent/extensions/<name>/index.ts` (auto-discovered, `/reload`-able). Declare host packages as `"*"` peer deps and never bundle them. For pinned third-party packages use settings `packages: ["npm:foo@1.2.3"]` plus `prime-agent package install --local` so installs land in `.prime/agent/npm/`.
- Set `enableBuiltinSkills`, `bundledSkills.websearch`, and `enableSkillCommands` explicitly in the committed settings so behavior does not drift with defaults.
- Python-backed skills need `pyproject.toml` + `src/<import_name>/__init__.py`; keep import names unique and either allow the kernel-venv bootstrap or document `PRIME_AGENT_KERNEL_PYTHON` (which disables auto-install and requires a matching `prime-agent-runtime`).

### 10.5 RLM defaults

Set `rlmMaxDepth` in `agent-home/settings.json` (global) rather than relying on `RLM_MAX_DEPTH`, since persisted chat state and inherited config both take precedence over the env var. Document the exact `provider/id` strings usable as RLM children and have the README tell users to confirm with `rlm.find_models("...")` first — `/model` uses a looser catalog than RLM spawn, and RLM resolution fails loudly rather than falling back.

### 10.6 CI / verification for the repo

- Smoke test with the faux provider or `--mode json -p "hello"` to assert the config loads without diagnostics.
- Validate `models.json` by launching once and checking stderr for `Invalid models.json schema` (validation is async on first load and only logs, so a plain exit code is not sufficient).
- `prime-agent doctor` plus a `model list` check to assert every intended proxy model resolves.

### 10.7 Caveats to document prominently in the README

1. `models.json` is agent-dir-only — the repo-local `PRIME_AGENT_CODING_AGENT_DIR` trick is mandatory for versioning it.
2. `"!cmd"` secret values run on every request; prefer env vars for hot paths.
3. `PI_CACHE_RETENTION=long` is the only supported long-retention switch; the agent never sets `cacheRetention` itself, and no `extended-cache-ttl` beta header is sent.
4. Long retention *is* sent to custom Anthropic-compatible base URLs despite the older changelog note; opt out per model/provider via `compat.supportsLongCacheRetention: false`.
5. `/model` and RLM child selection use different model catalogs.
6. Cache-write cost multipliers only apply to Anthropic-named providers/ids.
7. Project `settings.json` is read from `cwd/.prime/agent` only — running from a subdirectory silently drops it (unlike `.agents/skills` and `AGENTS.md`, which walk ancestors).

---

### Primary file index

| Area | Files |
|---|---|
| Config roots | `packages/coding-agent/src/config.ts:498-540` |
| models.json | `packages/coding-agent/src/core/model-registry.ts` (85-260 schemas, 460-640 load/merge, 967 `getExecutableModels`, 1270-1350 keys/headers), `core/resolve-config-value.ts`, `core/sdk.ts:151`, `docs/models.md` |
| Dialects | `packages/ai/src/providers/*.ts`, `packages/ai/src/api-registry.ts`, `providers/register-builtins.ts`, `docs/custom-provider.md`, `docs/providers.md` |
| Thinking | `core/thinking-levels.ts`, `core/defaults.ts`, `cli/args.ts:168-176`, `core/model-resolver.ts:205-565`, `packages/ai/src/models.ts:67-99`, `packages/ai/src/providers/simple-options.ts`, `providers/openai-completions.ts:632-666`, `providers/anthropic.ts:766-840`, `core/sdk.ts:211-226` |
| RLM | `core/rlm-runtime.ts`, `core/rlm-max-depth.ts`, `core/agent-session.ts:919, 1570-1590, 9063-9066, 9199-9205, 10160-10260`, `prime-agent-runtime/src/rlm/`, `docs/rlm.md`, `docs/rlm-runtime.md` |
| Skills | `core/skills.ts`, `core/skill-blocks.ts`, `core/package-manager.ts:415-451, 2140-2250`, `core/resource-loader.ts`, `docs/skills.md` |
| AGENTS.md / prompts | `core/resource-loader.ts:58-113, 860-890`, `cli/command-registry.ts` |
| Extensions / packages | `core/extensions/`, `core/package-manager.ts`, `core/prompt-templates.ts`, `docs/extensions.md`, `docs/packages.md` |
| Cache retention | `packages/ai/src/types.ts:93`, `providers/anthropic.ts:52-77, 510-556`, `providers/openai-completions.ts:129-137, 576-591, 687-700`, `providers/openai-responses.ts:33-56, 221-228`, `providers/amazon-bedrock.ts:193-197, 547-556, 619-642, 777-783`, `packages/ai/src/cache-pricing.ts`, `packages/agent/src/agent.ts:462-475`, `packages/agent/src/proxy.ts:54, 93`, `packages/ai/test/cache-retention.test.ts` |
