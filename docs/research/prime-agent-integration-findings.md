# Prime Agent — Integration Findings (concise)

Read-only inspection of `/home/user/workspace/prime-agent` at git HEAD `bc0fa76`, version `0.8.1`. No files edited.
Full long-form version with all line references: `/home/user/workspace/prime_agent_hooks_analysis.md`.

## Config roots

| Thing | Path / precedence | Source |
|---|---|---|
| Global agent dir | `~/.prime/agent`, override `PRIME_AGENT_CODING_AGENT_DIR` | `packages/coding-agent/src/config.ts:498, 502, 525` |
| Sessions | `--session-dir` > `PRIME_AGENT_SESSION_DIR` > legacy env > settings | `config.ts`, `docs/settings.md` |
| Global settings | `~/.prime/agent/settings.json` | `core/settings-manager.ts:228` |
| Project settings | `<cwd>/.prime/agent/settings.json` (cwd only, no ancestor walk) | `core/settings-manager.ts:229` |
| Custom models | `<agentDir>/models.json` — **agent dir only, no project-level file** | `core/model-registry.ts:460`, `core/sdk.ts:151` |
| Kernel venv | `~/.prime/agent/kernel-venv`; `PRIME_AGENT_KERNEL_VENV`, `PRIME_AGENT_KERNEL_PYTHON` | `core/kernel/bootstrap.ts:329-366, 839-867` |

## 1. Custom models.json
`core/model-registry.ts`: `create(authStorage, join(getAgentDir(),"models.json"))` (460) → `loadModels()` (517) → `loadCustomModels()` (589, JSONC via `stripJsonComments`, TypeBox validation at 211 — async/log-only on first load, synchronous hard-fail on later refreshes) → `loadBuiltInModels()` (544, applies `baseUrl`/`compat`/`modelOverrides`) → `mergeCustomModels()` (577, upsert by provider+id, custom wins) → OAuth `modifyModels`. `refresh()` (479) runs when `/model` opens, so edits apply without restart.
Provider fields: `baseUrl`, `api`, `apiKey`, `headers`, `authHeader` (195; sends `Authorization: Bearer <key>`, applied at 1333-1338), `models[]`, `modelOverrides{}`, `compat`. Secrets: literal | env-var name | `"!cmd"` (`core/resolve-config-value.ts`; shell values re-run **per request**, never during `/model` availability checks). Header merge order: model.headers → authStorage → provider → per-model (1321-1331).

## 2. Per-model API dialect
`api` at provider level, overridable per model: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai` (latter needs explicit `baseUrl`). Implementations `packages/ai/src/providers/*.ts`, registry `packages/ai/src/api-registry.ts` + `providers/register-builtins.ts`.
OpenAI compat flags: `supportsStore`, `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsUsageInStreaming`, `maxTokensField`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages`, `thinkingFormat`, `cacheControlFormat:"anthropic"`, `supportsStrictMode`, `supportsLongCacheRetention`, `openRouterRouting`, `vercelGatewayRouting`; Responses adds `sendSessionIdHeader`.
Anthropic compat: `supportsEagerToolInputStreaming` (false ⇒ drop per-tool `eager_input_streaming`, send legacy `fine-grained-tool-streaming-2025-05-14` beta), `supportsLongCacheRetention` — `providers/anthropic.ts:170-178`. Provider `compat` = defaults, model `compat` merges over (`mergeCompat`, model-registry ~347). Truly new dialects need an extension: `pi.registerProvider` + custom streaming API (`docs/custom-provider.md`; examples under `packages/coding-agent/examples/extensions/custom-provider-*`).

## 3. Per-model thinking/effort
Levels `off,minimal,low,medium,high,xhigh,max` (`core/thinking-levels.ts`); default `xhigh` (`core/defaults.ts`). CLI `--thinking` (`cli/args.ts:168-176`) and `--model provider/id:<level>` (`core/model-resolver.ts:205-565`); TUI `/effort` (alias `/thinking`). Settings: `defaultThinkingLevel`, `thinkingBudgets`, `hideThinkingBlock`.
Per-model `thinkingLevelMap` is tristate: omitted = default mapping, string = value sent, `null` = unsupported (hidden + clamped). Capability/clamp: `packages/ai/src/models.ts:67-99` (`xhigh`/`max` require explicit map entries). Wire: `providers/openai-completions.ts:632-666`, `providers/anthropic.ts:766-840`, budgets `providers/simple-options.ts` (minimal 1024 / low 2048 / medium 8192 / high 16384). Session resolution `core/sdk.ts:211-226`.

## 4. RLM child model selection
Python: `await rlm(prompt, name=..., model="provider/id", thinking="high")`, `rlm.run`, `rlm.find_models`, `rlm.list_subagents`, `rlm.delete_subagent`, `rlm.host_request` (`prime-agent-runtime/src/rlm/`, `docs/rlm.md`, `docs/rlm-runtime.md`).
Validation `core/rlm-runtime.ts` (`findRlmModelMatches` 135-160). Host `core/agent-session.ts`: handlers 9063-9066; `_authenticatedRlmModels()` ~10160 = `getExecutableModels()` minus stale/expired; `_resolveRlmSubagentModel()` ~10173 needs exact case-insensitive `provider/id` + `getApiKeyAndHeaders()` preflight and **throws rather than falling back**; `_startRlmChildRun()` ~10203 validates thinking against `getSupportedThinkingLevels`.
`getExecutableModels()` (model-registry 967) intersects with the OpenAI-Codex catalog — `/model` uses unfiltered `getAvailable()`, so a custom proxy model can be selectable interactively yet rejected as an RLM child (comment at 366-385). Depth precedence: chat state → inherited config → global settings `rlmMaxDepth` → `RLM_MAX_DEPTH` → **2** (`agent-session.ts:1570-1590`). Kernel env gets `RLM_DEPTH`, `RLM_MAX_DEPTH`, `RLM_SESSION_DIR` at provisioning only.

## 5. Skills (project + global)
Code `core/skills.ts`, `core/package-manager.ts:415-451 & 2140-2250`, `core/resource-loader.ts`; doc `docs/skills.md`. Precedence high→low: `--skill <path>` (repeatable, works with `--no-skills`) → settings `skills[]` → project `.prime/agent/skills/` + `.agents/skills/` in cwd **and every ancestor up to the git root** → global `~/.prime/agent/skills/` + `~/.agents/skills/` → package-provided → bundled built-ins. First name wins, collisions warn.
`SKILL.md` directories discovered recursively everywhere; bare root-level `.md` counts only in `.prime/agent/skills/` (pi mode), never `.agents/skills` (agents mode). Frontmatter `name` (must match dir) + `description` required (missing ⇒ skipped); also `license`, `compatibility`, `metadata`, `allowed-tools`, `disable-model-invocation`. Settings: `skills[]` (globs with `!`/`+`/`-`), `enableSkillCommands`, `enableBuiltinSkills`, `bundledSkills.websearch` (websearch force-disabled unless enabled). Built-ins: `prime-intellect`, `skill-creator`, `websearch`. Python skills = `SKILL.md` + `pyproject.toml` + `src/<import>/__init__.py`, editable-installed into kernel venv.

## 6. AGENTS.md loading
`core/resource-loader.ts`: `loadContextFileFromDir()` 58-72 tries `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, `CLAUDE.MD` — **first hit only per directory**. `loadProjectContextFiles()` 75-113 adds global `<agentDir>/AGENTS.md` first, then walks cwd→filesystem root and `unshift`s so order is root→cwd (nearest last), deduped. Disable `--no-context-files`/`-nc`; `/reload` re-reads. Prompt overrides in the same file: project/global `SYSTEM.md` (865/870) and `APPEND_SYSTEM.md` (879/884); CLI `--system-prompt`, `--append-system-prompt`.

## 7. Extensions / packages
Auto-discovered: `<agentDir>/extensions/{*.ts,*/index.ts}` and `<cwd>/.prime/agent/extensions/{*.ts,*/index.ts}` — only these hot-reload via `/reload`. CLI `-e/--extension <path|npm:…|git:…>` (per-run), `--no-extensions`. Settings resource keys `packages`, `extensions`, `skills`, `prompts`, `themes` (relative to the settings file's `.prime/agent`; globs `!`/`+`/`-`). Sources: `npm:`, `git:`, `https/ssh/git://`, local paths; global via `npm -g`, project via `.prime/agent/npm/`, git clones under `<dir>/git/<host>/<path>`. CLI `prime-agent package install|remove|list|update [--local]`, `prime-agent config`.
Manifest: `package.json` → `pi:{extensions,skills,prompts,themes,video,image}`, keyword `pi-package`. Host packages must be `"*"` peer deps and never bundled: `@earendil-works/pi-{ai,agent-core,coding-agent,tui}`, `typebox`. API: `export default (pi: ExtensionAPI)` (may be async, awaited pre-startup) with `pi.on`, `registerTool`, `registerCommand`, `registerProvider`/`unregisterProvider`, `appendEntry`, `ctx.ui.*`; `tool_call` hooks can `return {block:true, reason}`. Extras: settings `npmCommand`, env `PI_PACKAGE_DIR`.

## 8. PI_CACHE_RETENTION=long through custom Anthropic-compatible proxies
- `CacheRetention = none|short|long` (`packages/ai/src/types.ts:93`). `resolveCacheRetention()` duplicated in `anthropic.ts:52-62`, `openai-responses.ts:33-43`, `openai-completions.ts:129-137`, `amazon-bedrock.ts:547-556`: explicit option → `"long"` if `process.env.PI_CACHE_RETENTION === "long"` → `"short"`.
- **The coding agent never sets `cacheRetention`.** `packages/agent/src/agent.ts` `createLoopConfig()` (~462-475) does not forward it; only `packages/agent/src/proxy.ts:54,93` does. ⇒ the env var is the only CLI-level lever; per-model/provider `compat.supportsLongCacheRetention:false` is the only opt-out.
- Anthropic `getCacheControl()` (`anthropic.ts:64-77`): emits `{type:"ephemeral"}` plus `ttl:"1h"` when long and `supportsLongCacheRetention !== false`. **No `baseUrl`/`api.anthropic.com` gate exists in current code**, contradicting `packages/ai/CHANGELOG.md:914` — so custom `anthropic-messages` proxies DO receive `ttl:"1h"`.
- **No `extended-cache-ttl-*` beta header is ever sent** (zero repo-wide hits). Only betas: `fine-grained-tool-streaming-2025-05-14`, `interleaved-thinking-2025-05-14` (170-171), plus `claude-code-20250219`/`oauth-2025-04-20` on the OAuth path. Inject it via provider `headers` if your proxy requires it.
- OpenAI completions (`576-591`): `prompt_cache_key` when (`baseUrl` contains `api.openai.com` and retention≠none) OR (long and supported); `prompt_cache_retention:"24h"` when long and supported (no baseUrl gate). `cacheControlFormat:"anthropic"` path (687-700) attaches Anthropic-style `cache_control` (+`ttl:"1h"`) to system prompt, last tool def, last message. Responses API: same pattern (`33-56, 221-228`). Bedrock: `cachePoint{type:DEFAULT, ttl:ONE_HOUR}` (`619-642, 777-783`).
- Pricing: `packages/ai/src/cache-pricing.ts` — read ×0.1, write ×1.25 (5m) / ×2.0 (1h), gated by `hasStandardAnthropicCachePricing()` (provider `anthropic`, or id starting `anthropic/` or `claude-`). Proxy models not matching that naming under-report 1h cache-write cost.
- Tests: `packages/ai/test/cache-retention.test.ts`, `openai-completions-prompt-cache.test.ts`, `openai-completions-cache-control-format.test.ts`, `anthropic-eager-tool-input-compat.test.ts`.

## 9. Recommended standalone-repo design

Layout:
```
my-agent-config/
  AGENTS.md                 run.sh   bootstrap.sh   .env.local (gitignored)
  agent-home/               -> $PRIME_AGENT_CODING_AGENT_DIR
    models.json.example  settings.json  AGENTS.md  SYSTEM.md/APPEND_SYSTEM.md
    skills/<name>/SKILL.md   extensions/<name>/index.ts
  .prime/agent/             project scope for this repo
    settings.json  skills/<name>/SKILL.md  extensions/<name>/index.ts
```
Core decision: point `PRIME_AGENT_CODING_AGENT_DIR` at a repo-local `agent-home/` — the only way to version `models.json`, since the registry reads it exclusively from the agent dir. Repo-specific behavior goes in `.prime/agent/`; account-wide behavior in `agent-home/`.

`run.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PRIME_AGENT_CODING_AGENT_DIR="$REPO/agent-home"
export PRIME_AGENT_SESSION_DIR="$REPO/agent-home/sessions"
export PI_CACHE_RETENTION=long
export RLM_MAX_DEPTH="${RLM_MAX_DEPTH:-2}"
[ -f "$REPO/.env.local" ] && set -a && . "$REPO/.env.local" && set +a
exec prime-agent "$@"
```
`bootstrap.sh`: check Node ≥ 22.8.0, `cp -n agent-home/models.json.example agent-home/models.json`, report missing keys. Gitignore `agent-home/models.json`, `sessions/`, `logs/`, `kernel-venv/`, `git/`, `npm/`, `session-artifacts/`.

`models.json.example` per proxy route: one provider with `baseUrl` + `api` + `apiKey` (env var name preferred over `"!cmd"`) + `authHeader` if bearer-style; use `modelOverrides` to re-point built-in models (keeps metadata + OAuth) and `models[]` only for ids the catalog lacks; encode gateway quirks in `compat` (`supportsLongCacheRetention`, `supportsEagerToolInputStreaming`, `cacheControlFormat`, message-shape flags) and effort limits in `thinkingLevelMap` (`{"xhigh":"high","max":null}` is the safe default). Keep `claude-` id prefixes for Claude routes so cache pricing applies.

Skills/context: short repo-root `AGENTS.md`, depth in `.prime/agent/skills/<name>/SKILL.md` (mirror to `.agents/skills/` for cross-tool use); extensions in `.prime/agent/extensions/`; pin third-party packages via settings `packages` + `prime-agent package install --local`. Set `enableBuiltinSkills`, `bundledSkills.websearch`, `enableSkillCommands`, `defaultThinkingLevel`, `thinkingBudgets`, `rlmMaxDepth` explicitly so behavior doesn't drift with defaults.

CI: smoke run `--mode json -p "hello"` (or the faux provider), grep stderr for `Invalid models.json schema` (validation is async/log-only on first load), then `prime-agent doctor` + `model list` to assert every proxy model resolves.

README caveats to state loudly:
1. `models.json` is agent-dir-only — the repo-local agent dir is mandatory.
2. `"!cmd"` secrets execute on every request.
3. `PI_CACHE_RETENTION=long` is the only long-retention switch; the agent never sets `cacheRetention` and never sends an `extended-cache-ttl` beta header.
4. Long retention *is* sent to custom Anthropic base URLs today; opt out with `compat.supportsLongCacheRetention:false`.
5. `/model` and RLM child selection use different catalogs — verify with `rlm.find_models`.
6. Cache-write cost multipliers only apply to Anthropic-named providers/ids.
7. Project `settings.json` resolves from cwd only (unlike `.agents/skills` and `AGENTS.md`, which walk ancestors).

## Other CLI/env facts
Modes: TUI, `-p/--print`, `--mode json`, `--mode rpc`, ACP. Sessions `-c`, `-r/--resume`, `--fork`, `--no-session`. Tools `--tools/-t`, `--no-builtin-tools`, `--no-tools` (only built-in tool is `ipython`). Also `--cwd`, `--offline`, `--verbose`, `--models`, `--api-key`, `--provider`, and the `--autonomous*` / `--goal*` family.
Env: `PRIME_AGENT_CODING_AGENT_DIR`, `PRIME_AGENT_SESSION_DIR`, `PI_PACKAGE_DIR`, `PI_OFFLINE`, `PI_SKIP_VERSION_CHECK`, `PRIME_AGENT_DOWNLOAD_BASE_URL`, `PI_CACHE_RETENTION`, `PRIME_API_KEY`, `PRIME_AGENT_TRACES_{API_KEY,BASE_URL}`, `PRIME_AGENT_KERNEL_{PYTHON,VENV}`, `RLM_MAX_DEPTH`, `PRIME_AGENT_TELEMETRY=0`/`DO_NOT_TRACK=1`, `PRIME_AGENT_TELEMETRY_ENDPOINT`, `PI_SHARE_VIEWER_URL`, `GIT_TERMINAL_PROMPT`, `GIT_SSH_COMMAND`. Provider key names: `packages/ai/src/env-api-keys.ts` (mirrored by `prime-agent.sh --no-env`).
Source run: Node ≥22.8.0, `npm ci`, `./prime-agent.sh` (tsx) or `./prime-agent.sh --dist` (bundled, ~3× faster). Service: `prime-agent status|doctor|doctor --fix|shutdown`.
