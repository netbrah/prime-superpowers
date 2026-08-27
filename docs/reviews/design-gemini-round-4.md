# Prime Superpowers CLI Design — Gemini Independent Review (Round 4)

**Reviewer:** Gemini 3.1 Pro (Context, Protocol, Portability & Large-Context Blind-Spot Reviewer)  
**Date:** 2026-08-26 / 2026-08-27  
**Target Document:** `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` (Status: `draft, round 3 findings incorporated`)  
**Reference Codebases:**  
- `prime-agent` (v0.8.1, commit `bc0fa7606abb3b7af0f765319518d255e6ae553d`, workspace package `@earendil-works/pi-coding-agent@0.8.1`)  
- `superpowers` (v6.3.0, commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`)  
**Prior Reviews Checked:** `design-sol-round-3.md`, `design-opus-round-3.md`, `design-gemini-round-3.md`, `design-sol-round-2.md`, `design-gemini-round-2.md`, `design-opus-round-1.md`, `design-sol-round-1.md`, `design-gemini-round-1.md`  
**Verdict:** **APPROVED — ZERO BLOCKERS, ZERO MAJORS** (0 Blockers, 0 Majors, 0 Minors)

---

## Executive Summary & Verdict

The Round 4 revision of `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` fully resolves all architectural blockers, major issues, and minor gaps identified during Round 3 by Sol (`SOL-R3-B1`, `SOL-R3-B2`, `SOL-R3-M1`, `SOL-R3-M2`) and Opus (`OPUS-R3-B1`–`OPUS-R3-B4`, `OPUS-R3-M1`–`OPUS-R3-M7`, `OPUS-R3-N1`–`OPUS-R3-N7`).

The spec presents a coherent, concrete, and rigorously verified integration between **Prime Agent 0.8.1** and **Superpowers v6.3.0**. Every contract—from binary distribution and worktree cwd binding to CLI firewalling, session persistence, skill vendoring, request-time Anthropic beta union, and the falsifiable model policy—is grounded in the exact source code of both baselines.

**Final Counts:**
- **Blockers:** 0
- **Majors:** 0
- **Minors:** 0

**Disposition:** **Approved to proceed to task breakdown (SDD / TDD).**

---

## Round-3 Finding Closure Verification Matrix

| Prior ID | Reviewer & Topic | Round 4 Status | Verification & Source Grounding |
|---|---|---|---|
| `SOL-R3-B1` | Sol: Child deadlines & parent registry recovery | **CLOSED** | Persistence is mandatory; `--no-session` is strictly rejected by the firewall (lines 156, 203). Normal detach/recovery is handled by kit-owned `./prime attach` targeting the recorded parent session ID. Unrecoverable parent loss transitions to fail-closed `orphaned` state without duplicate live attempts (lines 86, 156). |
| `SOL-R3-B2` / `OPUS-R3-B1` | Sol & Opus: Prime Agent release artifact provenance | **CLOSED** | Pinned to immutable GitHub release tarball URL (`https://github.com/PrimeIntellect-ai/prime-agent/releases/download/v0.8.1/prime-agent-0.8.1.tgz`) with published SHA-256 `46c24db1782dd31adc35d5c6cbcc75564faba6ced3bf2ccf03d836ee77134475`. Verified before extraction into `<kit>/toolchain/prime-agent-0.8.1`, executing absolute binary `prime-agent`, and running pre-credential `--version` check (lines 61, 80, 211). |
| `SOL-R3-M1` | Sol: Explicit-header auth contradiction | **CLOSED** | Removed contradictory `explicit-header` promise. Config contract strictly bounds auth to `bearer` (`authHeader: true`) and `native` (`authHeader: false` with SDK key placement), both using `PRIME_LLM_KEY`. Generic extra-header variables and arbitrary custom secret headers are explicitly omitted (lines 49, 189, 193–195). |
| `SOL-R3-M2` / `OPUS-R3-M6` | Sol & Opus: Model-ID overrides & substring sniffing | **CLOSED** | Model overrides modify only the transport ID and retain the role profile's API, capabilities, limits, and thinking maps. Constrained by required wire-family tokens (`gpt-5.6-sol`, `gpt-5.6-terra`, `opus-5`, `sonnet-5`, `gemini-3.1-pro`), preventing silent Anthropic adaptive-vs-budget degradation (`prime-agent/packages/ai/src/providers/anthropic.ts:746-763`). Doctor verifies effort-vs-budget path (lines 128, 173–181). |
| `OPUS-R3-B2` | Opus: Coordinator git context in target checkout vs worktree | **CLOSED** | The launcher creates/validates the worktree and run branch *before* Prime starts and changes to `WORKTREE_ROOT` as the session cwd for the coordinator (lines 30, 36, 38, 134). Every git, ledger, diff, review package (`BASE..HEAD`), and gate runs from this single worktree root (lines 134, 139, 224). |
| `OPUS-R3-B3` | Opus: Whole-directory skill shadowing & missing templates | **CLOSED** | Whole-directory collision behavior acknowledged (`prime-agent/packages/coding-agent/src/core/skills.ts:513-566`). The two overriding skills (`using-superpowers` and `subagent-driven-development`) vendor their sibling templates, scripts, and safe references with SHA-256 provenance (lines 65–71, 84, 213, 233). Incompatible `pi-tools.md` is excluded. |
| `OPUS-R3-B4` | Opus: Argument firewall positional routing to subcommands | **CLOSED** | The launcher positions its internal `--model` option first, preventing user prompt positionals from matching `argv[0]` in Prime's `handlePublicCommand`. Rejects public/removed command names (`agents`, `attach`, `schedule`, `shutdown`, `package`, `session`, `config`), unknown flags, short aliases, and mode/daemon controls (lines 201–203). |
| `OPUS-R3-M1` | Opus: Thinking map `off` column parity | **CLOSED** | Thinking map table aligns with Prime 0.8.1 runtime behavior: Sol/Terra `off` -> `none`, Opus/Sonnet `off` -> `off`, Gemini `off` -> `null` (lines 120–126). Preserves native reasoning-off wires in `openai-responses.ts` (`effort: "none"`) and `anthropic.ts` (`thinkingEnabled: false`). |
| `OPUS-R3-M2` | Opus: Anthropic beta clobbering & extended-cache token | **CLOSED** | Replaced static provider-header injection with request-time union via `before_provider_request` extension hook (line 197). Unions `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA` into Prime's computed runtime beta list, preserving `FINE_GRAINED_TOOL_STREAMING_BETA` and `INTERLEAVED_THINKING_BETA`. Opt-out supported. |
| `OPUS-R3-M3` | Opus: Clone concurrency & daemon session lifetime | **CLOSED** | Replaced launcher process lock with durable run record tracking `agent-home`, `target`, `worktree`, `branch`, `parent session identity`, and `state`. New runs query recorded session and refuse if live or retained (lines 86, 203). Wrapper commands `./prime attach`, `./prime status`, `./prime stop` operate on the recorded session. |
| `OPUS-R3-M4` | Opus: Severity mapping, spec verdict, and deferred Minors | **CLOSED** | Upstream spec verdict failure mapped to Major; `⚠️ Cannot verify` is coordinator-owned until resolved (Major if confirmed); deferred Minors tracked in ledger and handed off to whole-branch review (lines 146, 148, 150). |
| `OPUS-R3-M5` | Opus: Severity deflation & downgrade concurrence | **CLOSED** | Any downgrade or `Settled` ruling on a reviewer-raised Blocker/Major requires concurrence from a fresh cross-family reviewer who did not author the artifact (line 148). Original severity, final severity, both rationales, and evidence are audited at whole-branch review. |
| `OPUS-R3-M7` | Opus: Model council budget, admissions cap & falsifiability | **CLOSED** | Admissions capped: discovery/spec 20, implementation task 12, full run 80 (line 108). Exceeding cap stops for operator input. Sealed Sol baseline used as control finding set to measure unique cross-family contributions. Seat removal/demotion criteria defined based on outcome data (lines 108, 236). |

---

## Contract-by-Contract Source Audit

### 1. Worktree & Working Directory Contract
- **Contract:** Launcher resolves `KIT_ROOT` and `TARGET_ROOT`, creates/validates the target worktree and run branch, and executes `cd WORKTREE_ROOT` before starting Prime Agent (lines 30, 36–38).
- **Verification against Prime 0.8.1:** Prime Agent's session initializes `sessionManager.getCwd()` from process cwd (`prime-agent/packages/coding-agent/src/core/agent-session-runtime.ts:313-325`). Because the launcher changes directory to `WORKTREE_ROOT`, the coordinator session cwd is `WORKTREE_ROOT`. RLM children inherit this session cwd, and the worker dispatch contract also includes an explicit `os.chdir(worktree_root)` (line 139).
- **Verification against Git & Superpowers:** All git commands (`git rev-parse --show-toplevel`, `git log BASE..HEAD`, `git diff BASE..HEAD`), workspace directory paths (`.superpowers/sdd/<plan>/progress.md`), and gate commands execute in the exact same worktree root.
- **Finding:** Fully sound and verified.

### 2. Release Artifact & Toolchain Contract
- **Contract:** Pin `https://github.com/PrimeIntellect-ai/prime-agent/releases/download/v0.8.1/prime-agent-0.8.1.tgz` at SHA-256 `46c24db1782dd31adc35d5c6cbcc75564faba6ced3bf2ccf03d836ee77134475`. Verify checksum on temporary download, extract to `<kit>/toolchain/prime-agent-0.8.1`, execute absolute `prime-agent` binary, check `--version` pre-credentials (lines 61, 80).
- **Verification against Prime 0.8.1:** In `prime-agent/scripts/pack-prime-agent-release.mjs:91-103,155-200`, the release packing process packages the coding agent as `prime-agent-0.8.1.tgz` with binary `prime-agent`. In `prime-agent/install.sh:1455-1493`, the installer verifies the SHA-256 checksum from `SHA256SUMS`. The spec's toolchain setup faithfully replicates this official, immutable release distribution path.
- **Finding:** Fully sound and verified.

### 3. Skill Vendoring & Collision Contract
- **Contract:** `agent-home/settings.json` specifies `git:github.com/obra/superpowers@v6.3.0` with `extensions: []`. Overriding skills in `agent-home/skills/` (`using-superpowers` and `subagent-driven-development`) vendor required sibling templates, prompt files, and scripts with SHA-256 hashes; `using-superpowers/references/pi-tools.md` is excluded (lines 65–71, 82–85).
- **Verification against Prime 0.8.1 & Superpowers v6.3.0:**
  - In `prime-agent/packages/coding-agent/src/core/skills.ts:513-566`, Prime indexes skills by name, where `user-auto` (`agent-home/skills/`) has higher precedence than `package` (`superpowers@v6.3.0`), dropping colliding packages with a diagnostic.
  - Sibling references inside the winning directory resolve locally. Vendoring `implementer-prompt.md`, `task-reviewer-prompt.md`, `re-review-prompt.md`, and `scripts/{sdd-workspace,review-package,task-brief}` into `agent-home/skills/subagent-driven-development/` ensures all relative paths succeed without missing dependencies.
  - Excluding `pi-tools.md` prevents inadvertent references to removed Pi tools. Non-colliding skills (`brainstorming`, `systematic-debugging`, etc.) load transparently from the package.
- **Finding:** Fully sound and verified.

### 4. Session Management & Persistence Contract
- **Contract:** Mandatory session persistence (CLI rejects `--no-session`). Persistent run record tracks agent home, target, worktree, branch, parent session ID, and state. Detach/reattach operates on recorded session via `./prime attach`. Unrecoverable parent loss yields fail-closed `orphaned` state (lines 86, 156, 203).
- **Verification against Prime 0.8.1:**
  - `prime-agent/packages/coding-agent/src/core/session-manager.ts` and `rlm-runtime.ts` maintain child subagent registries scoped to the parent transcript. Reattaching to the same parent session preserves the child registry across detach/compaction.
  - Eliminating `--no-session` guarantees that in-memory ephemeral sessions cannot be created in workflow mode, ensuring all deadline tracking and RLM cleanup calls (`rlm.delete_subagent`) remain authoritative.
- **Finding:** Fully sound and verified.

### 5. Provider Wire, Auth Header & Beta Contract
- **Contract:** Three distinct proxy providers (`prime-proxy-openai`, `prime-proxy-anthropic`, `prime-proxy-google`) using `PRIME_LLM_KEY`. Endpoint roots: `/v1` for OpenAI Responses, bare root for Anthropic Messages, `/v1beta` for Google Generative AI (lines 49–51, 112–116). Auth modes: `bearer` (`authHeader: true`) and `native` (`authHeader: false`) (lines 193–195). Anthropic beta header uses `before_provider_request` hook to union `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA` at request time (line 197).
- **Verification against Prime 0.8.1:**
  - OpenAI Responses: client appends endpoint path to `baseURL` (`openai-responses.ts:210-215`).
  - Anthropic Messages: SDK appends `/v1/messages` to `baseURL` (`anthropic.ts:910,930`).
  - Google Generative AI: custom `baseUrl` sets `apiVersion = ""` because the version prefix is expected in the base URL (`google.ts:328-332`).
  - `authHeader: true` in `model-registry.ts:1333-1338` applies `Authorization: Bearer <key>`.
  - `before_provider_request` in `extensions/runner.ts:901-925` intercepts the serialized payload right before dispatch, allowing dynamic union with runtime `betaFeatures` without clobbering `FINE_GRAINED_TOOL_STREAMING_BETA` or `INTERLEAVED_THINKING_BETA`.
  - Seven-level thinking tables match the runtime translation: Sol/Terra `off` -> `none`, Opus/Sonnet `off` -> `off`, Gemini `off` -> `null` (unsupported). Supported levels map cleanly to provider wire payloads.
- **Finding:** Fully sound and verified.

### 6. Environment Parsing & Protected Controls Contract
- **Contract:** Data-only `.env` parser (no shell expansion). Precedence: kit `.env` < target `.env` < kit `.env.local` < target `.env.local` < process env (line 199). Target files cannot overwrite protected controls (`PRIME_AGENT_CODING_AGENT_DIR`, binary path, `PI_CACHE_RETENTION`, package/skill settings, model overrides, lock location).
- **Verification against Prime 0.8.1:** `PRIME_AGENT_CODING_AGENT_DIR` is the critical runtime isolation variable (`config.ts:487-503`, `settings-manager.ts:227-230`). Preventing target `.env` files from overriding it ensures complete kit isolation and prevents arbitrary target repository configuration hijacking.
- **Finding:** Fully sound and verified.

### 7. CLI Argument Firewall Contract
- **Contract:** Deny-by-default firewall. Places internal `--model` option first. Denies public and removed subcommands in prompt position (`agents`, `attach`, `schedule`, `shutdown`, `package`, `session`, `config`). Rejects unknown flags, short aliases (`-nt`, `-ne`, `-ns`, `-c`, `-r`), daemon/ACP controls, and session override flags (lines 201–203). Unsafe escape hatch requires explicit interactive confirmation.
- **Verification against Prime 0.8.1:** In `prime-agent/packages/coding-agent/src/cli/public-command.ts:39-56`, subcommand routing inspects `args[0]`. Because the launcher places `--model <selector>` at `args[0]`, Prime's `handlePublicCommand` bypasses subcommand routing. Rejecting command names in user positionals provides defense-in-depth against prompt-injection subcommand execution.
- **Finding:** Fully sound and verified.

### 8. Model Policy, Admissions Ceilings & Falsifiability Contract
- **Contract:** Explicit role policy (Sol coordinator, Opus architect/reviewer, Gemini context/blind-spot reviewer, Sol/Terra/Sonnet implementers). Admissions ceilings (20 discovery/spec, 12 per task, 80 per run) with operator stop. Sealed Sol baseline as control finding set. Attribution of unique cross-family findings, severity downgrade concurrence, and data-driven seat removal criteria (lines 88–108, 148, 236).
- **Verification against Superpowers & Prime RLM:** Prime RLM subagents track and attribute token usage and cost per turn (`prime-agent/packages/coding-agent/docs/rlm-runtime.md:181-189`). Bounding admissions and sealing the Sol baseline makes the ceremony test fully quantitative and verifiable.
- **Finding:** Fully sound and verified.

---

## Conclusion & Next Steps

The design specification `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` is complete, robust, and completely verified against local Prime Agent 0.8.1 and Superpowers v6.3.0.

- **Blocker count:** 0
- **Major count:** 0
- **Minor count:** 0

The specification is ready for task breakdown and implementation.
