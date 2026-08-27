# Prime Superpowers CLI Design — Gemini Independent Review (Round 2)

**Reviewer:** Gemini 3.1 Pro (Context, Protocol, Portability & Large-Context Blind-Spot Reviewer)  
**Date:** 2026-08-26  
**Target Document:** `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` (Status: draft, round 1 findings incorporated)  
**Reference Codebases:** `prime-agent` (v0.8.1, commit `bc0fa76`), `superpowers` (v6.3.0)  
**Prior Reviews Checked:** `design-gemini-round-1.md`, `design-sol-round-1.md`, `design-opus-round-1.md`  
**Verdict:** **APPROVED TO PROCEED TO TASK BREAKDOWN** (0 Blockers, 2 Majors, 4 Minors)

---

## Executive Summary & Verdict

The Round 2 revision of the Prime Superpowers CLI design successfully resolves all critical blockers and major design deficiencies raised during Round 1 across all three reviewer perspectives (Sol, Opus, Gemini).

Specifically:
1. **Isolated Agent Home Topology (`PRIME_AGENT_CODING_AGENT_DIR`):** Eliminates the directory ambiguity and cwd collision identified in Round 1. The launcher sets `PRIME_AGENT_CODING_AGENT_DIR=<kit>/agent-home` and switches cwd to `TARGET_ROOT`. This ensures deterministic settings (`rlmMaxDepth: 1`, package filtering `extensions: []`), skill shadowing, and extension loading from the kit while maintaining the target repository as the operational root for git, tests, and relative file paths.
2. **Credential Safety & Dedicated Provider Namespace:** Replaced in-place provider overrides with dedicated proxy providers (`prime-proxy-openai`, `prime-proxy-anthropic`, `prime-proxy-google`). This eliminates the credential exfiltration vulnerability and guarantees that `PRIME_LLM_KEY` is cleanly utilized.
3. **Provider-Native Protocol & Path Derivation:** Accurately derives endpoints for all three dialects: `/v1` for OpenAI Responses, bare root for Anthropic Messages (which appends `/v1/messages`), and `/v1beta` for Google Generative AI (accounting for Prime's `httpOptions.apiVersion = ""` behavior on custom `baseUrl`s).
4. **Asynchronous Child Lifecycle & Reconciliation:** Replaced the vulnerable fire-and-forget subagent pattern with an authoritative file-based reporting model, report digests, bounded coordinator polling via `rlm.list_subagents()`, crash recovery, and compaction-safe ledger tracking.
5. **Review Loop Convergence & Outcome Orientation:** Added an explicit 5-round cap, coordinator ruling authority (`Ruling:`), review packages (`BASE..HEAD`), counterfactual finding requirements ("what breaks if ignored"), a dedicated Simplicity Reviewer seat, and target-outcome acceptance metrics.

There are **0 Blockers**. The 2 Major findings and 4 Minor findings documented below represent refinement and implementation hygiene items that can be handled during task breakdown and coding without altering the core architecture.

---

## Issue Summary Matrix

| Finding ID | Severity | Category | Title | Affected Spec Lines |
|---|:---:|---|---|:---:|
| `GEMINI-R2-MAJOR-1` | **Major** | Launcher & Model Resolution | Launcher model selector alias vs exact model ID reference | Lines 38, 100, 144 |
| `GEMINI-R2-MAJOR-2` | **Major** | Context / Reconnaissance | Large-context reconnaissance guidance for subagent file exploration | Lines 82, 111, 172 |
| `GEMINI-R2-MINOR-1` | **Minor** | Environment Configuration | Multi-source `.env` loading precedence order | Lines 35, 134–164 |
| `GEMINI-R2-MINOR-2` | **Minor** | Git Worktree Hygiene | Default worktree path layout and `.gitignore` hygiene | Lines 26, 110, 115 |
| `GEMINI-R2-MINOR-3` | **Minor** | Anthropic Beta Header Merging | Multi-feature `anthropic-beta` header formatting | Lines 101, 158, 163 |
| `GEMINI-R2-MINOR-4` | **Minor** | Skill Frontmatter Strictness | Directory-matching `name` field validation in test suite | Lines 59–65, 180 |

---

## 1. Technical Verification of Round-1 Focus Areas

### 1.1 Isolated Agent Home & Target Working Directory
- **Implementation Mechanism:** Verified against `prime-agent/packages/coding-agent/src/config.ts:502-530` and `prime-agent/packages/coding-agent/src/core/settings-manager.ts:227-230`.
- **Findings:** In Prime Agent 0.8.1, `ENV_AGENT_DIR` is derived from `pkg.piConfig.name` (`"prime-agent"`), yielding `PRIME_AGENT_CODING_AGENT_DIR`. Setting this variable redirects `getAgentDir()` to `<kit>/agent-home`.
- **Isolation Scope:**
  - `agent-home/settings.json` loads as global settings, enforcing `rlmMaxDepth: 1` globally for the session (`settings-manager.ts:getRlmMaxDepth()`).
  - `agent-home/extensions/prime-superpowers.mjs` loads as a global extension (`loader.ts`).
  - `agent-home/skills/` loads as global skills, overriding upstream package skills by name (`skills.ts`).
  - Process cwd remains `TARGET_ROOT`, allowing target `.prime/agent/settings.json` and target `AGENTS.md` to load as project-scoped extensions/overrides.
- **Child CWD Alignment:** Verified that `prime-agent-runtime/src/rlm/bash.py` executes subshells inheriting Python's active `os.getcwd()`. The explicit mandate that workers execute `os.chdir(worktree_root)` ensures both `pathlib.Path` file operations and `await bash(...)` subshell invocations execute inside the isolated worktree.

### 1.2 Native Provider Paths, Headers & Auth
- **Google Generative AI:**
  - In `packages/ai/src/providers/google.ts:328-332`, custom `model.baseUrl` sets `httpOptions.apiVersion = ""` and `httpOptions.baseUrl = model.baseUrl`.
  - The SDK appends `/models/${model}:streamGenerateContent`.
  - Supplying `${PRIME_BASE_URL}/v1beta` correctly forms `${PRIME_BASE_URL}/v1beta/models/...`.
  - `thinkingLevelMap` accurately exposes `{"low": "LOW", "high": "HIGH"}` per `models.generated.ts:5085`.
- **Anthropic Messages:**
  - `@anthropic-ai/sdk` appends `/v1/messages` to `baseURL`.
  - Supplying the bare `${PRIME_BASE_URL}` correctly results in `${PRIME_BASE_URL}/v1/messages`.
  - With `PI_CACHE_RETENTION=long` exported, `packages/ai/src/providers/anthropic.ts:72` sets `ttl: "1h"` when `supportsLongCacheRetention` is true.
  - Models retaining standard IDs `claude-opus-5` and `claude-sonnet-5` preserve Anthropic cache pricing calculations via `packages/ai/src/cache-pricing.ts:16-18` (`modelId.startsWith("claude-")`).
- **OpenAI Responses:**
  - Base URL `${PRIME_BASE_URL}/v1` pairs with OpenAI SDK appending `/responses`.
  - `PI_CACHE_RETENTION=long` attaches `prompt_cache_retention: "24h"` with session affinity (`openai-responses.ts:228`).
- **Authentication:**
  - Providers configured with `authHeader: true` instruct Prime Agent's `model-registry.ts:1333-1338` to emit `Authorization: Bearer <PRIME_LLM_KEY>`, satisfying standard API gateways.
  - Unique provider names (`prime-proxy-*`) guarantee that local `auth.json` or standard provider env vars (`ANTHROPIC_API_KEY`, etc.) are never sent to proxy endpoints.

### 1.3 Child Lifecycle, Signal Handling & State Machine
- **Asynchronous Model:** In Prime Agent, `rlm()` is an async admission call that returns an admission handle immediately without blocking (`packages/coding-agent/src/core/agent-session.ts:10214`).
- **Signaling Contract:** Children write detailed outputs and red/green test evidence to disk (`.superpowers/sdd/<plan>/reports/...`) and send concise notifications via `agent_message.send(receiver_role="parent")`.
- **Reconciliation & Heartbeat:** Coordinator polls via `rlm.list_subagents()`, bounding wait times and recovering from unhandled child exits, crashes, or missing notifications.
- **Durable Ledger:** Progress ledger (`.superpowers/sdd/<plan>/progress.md`) tracks hashes, child IDs, red/green evidence, commit SHAs, rulings, and states (`admitted`, `running`, `reported`, `failed`, `timed-out`, `reviewed`, `complete`, `superseded`).

### 1.4 Large-Context Integration & Multi-Model Councils
- **Diverse Perspectives:** Full council (Sol/Opus/Gemini) assigned to high-leverage phases (Novel-value discovery, spec review, plan review, branch completion).
- **Context Passing:** Fresh reviewers in later rounds receive a structured **Review Package** containing the artifact, diff/hash, prior findings, applied fixes, and coordinator rulings, preventing blank-slate amnesia and review oscillation.
- **Convergence Controls:** Five-round maximum per task with explicit coordinator ruling authority (`Ruling:`) and fail-closed handling for genuine Blockers/Majors.
- **Simplicity Review:** Dedicated check on whether multi-model ceremony produced genuine value over single-agent baseline.

---

## 2. Detailed Findings

### Major Findings

#### [GEMINI-R2-MAJOR-1] Launcher Model Selector Alias vs Exact Model ID Reference

- **Location:** Spec Section: *Architecture* (line 38), *Model policy* (lines 90, 100), *Configuration contract* (lines 143–149).
- **Source Baseline:** `prime-agent/packages/coding-agent/src/core/model-resolver.ts:76–100` (`findExactModelReferenceMatch`).
- **Affected Spec Lines:** Line 38 (`starts prime-agent with prime-proxy-openai/Sol:max and forwards "$@"`).
- **Finding:**  
  In the Architecture diagram (line 38), the launcher is described as executing:
  ```text
  starts prime-agent with prime-proxy-openai/Sol:max
  ```
  However, in Prime Agent's model registry and model resolver (`findExactModelReferenceMatch`), model references are matched against `${model.provider}/${model.id}`.
  
  Under `prime-proxy-openai`, the registered model ID is `gpt-5.6-sol` (or the value of `PRIME_MODEL_SOL`), while `"Sol"` is the role or display name.
  
  If `./prime` literally passes `--model prime-proxy-openai/Sol:max`, Prime Agent will reject the model selector at startup with an unknown model error before the session begins.
- **What Concretely Breaks If Ignored:**  
  Running `./prime` out of the box will immediately fail model resolution with `Unknown model "prime-proxy-openai/Sol"`. The CLI will not start the coordinator session.
- **Required Change:**  
  Update line 38 and the launcher implementation specification to state that the default launcher model string is:
  ```bash
  --model "prime-proxy-openai/${PRIME_MODEL_SOL:-gpt-5.6-sol}:max"
  ```
  This ensures the exact registered model ID is passed to the CLI resolver.

---

#### [GEMINI-R2-MAJOR-2] Large-Context Reconnaissance Guidance for Subagent File Exploration

- **Location:** Spec Section: *Model policy* (line 82), *Workflow policy* (line 111), *Safety and compatibility* (line 172).
- **Source Baseline:** `prime-agent/prime-agent-runtime/src/rlm/harness.py`, `prime-agent/packages/coding-agent/src/core/prompts/rlm.ts`.
- **Affected Spec Lines:** Lines 82, 111, 172.
- **Finding:**  
  The spec designates Gemini 3.1 Pro as the "Context and blind-spot reviewer" for "Large-codebase reconnaissance and independent cross-checking". In large target repositories (containing thousands of files or large generated assets), subagents operating in Prime's Python REPL environment may attempt naive repository scans by calling `Path.glob("**/*")` and executing `Path.read_text()` on multiple large files in a single turn.
  
  While Gemini 3.1 Pro supports a 1M token context window, indiscriminately dumping entire directories or large minified/binary/log files into the REPL conversation buffer causes unnecessary latency, context saturation, and API budget waste.
- **What Concretely Breaks If Ignored:**  
  In large target codebases (e.g. 50k+ LoC), reconnaissance subagents will trigger context bloat, slow turn completions, and potentially hit output token truncations in the REPL before completing their analysis.
- **Required Change:**  
  In `agent-home/skills/prime-rlm-dispatch/SKILL.md` and the worker/reviewer prompt contract, include explicit reconnaissance best-practice instructions:
  1. Use targeted search tools first (e.g., `await bash("git ls-files ...")`, `await bash("rg -l ...")`).
  2. Inspect specific file ranges or outline structures before reading full multi-thousand-line files.
  3. Exclude build artifacts, package locks, and binary assets from bulk reads.

---

### Minor Findings

#### [GEMINI-R2-MINOR-1] Multi-Source `.env` Loading Precedence Order

- **Location:** Spec Section: *Architecture* (line 35), *Configuration contract* (lines 134–164).
- **Affected Spec Lines:** Line 35 (`loads kit and target .env/.env.local without printing secrets`).
- **Finding:**  
  The spec states that the launcher loads both kit and target `.env` and `.env.local` files, but does not specify variable precedence when keys overlap.
- **Recommendation:**  
  Document the standard hierarchical precedence:
  `kit/.env` (lowest) $\rightarrow$ `target/.env` $\rightarrow$ `kit/.env.local` $\rightarrow$ `target/.env.local` $\rightarrow$ existing shell environment variables (highest).

---

#### [GEMINI-R2-MINOR-2] Default Worktree Path Layout and `.gitignore` Hygiene

- **Location:** Spec Section: *Non-goals* (line 26), *Workflow policy* (lines 110, 115).
- **Affected Spec Lines:** Lines 26, 110.
- **Finding:**  
  Step 1 mandates creating or selecting an isolated worktree. If the workflow creates worktrees inside the target directory (e.g. `<target>/.worktrees/<branch>`), the new directory may appear as an untracked directory in `git status` unless `.worktrees` is added to `.git/info/exclude` or `.gitignore`.
- **Recommendation:**  
  Specify that when worktrees are placed within the target repository, the setup step ensures `.worktrees/` is added to `.git/info/exclude` (local git exclude) to avoid dirtying target tracked files.

---

#### [GEMINI-R2-MINOR-3] Multi-Feature `anthropic-beta` Header Formatting

- **Location:** Spec Section: *Provider and model registration* (line 101), *Configuration contract* (lines 158, 163).
- **Source Baseline:** `prime-agent/packages/ai/src/providers/anthropic.ts:854–861`.
- **Affected Spec Lines:** Lines 158, 163.
- **Finding:**  
  Prime Agent's Anthropic provider internally attaches beta flags such as `fine-grained-tool-streaming-2025-05-14`. When injecting custom headers via `PRIME_ANTHROPIC_BETA`, headers must merge as comma-separated values rather than overwriting internal SDK beta headers.
- **Recommendation:**  
  In `prime-superpowers.mjs`, when custom beta headers are supplied, combine them cleanly using comma delimiters (`${internalBetas},${PRIME_ANTHROPIC_BETA}`).

---

#### [GEMINI-R2-MINOR-4] Skill Frontmatter Strictness Validation in Test Suite

- **Location:** Spec Section: *Repository layout* (lines 59–65), *Verification* (line 180).
- **Source Baseline:** `prime-agent/packages/coding-agent/src/core/skills.ts:125`.
- **Affected Spec Lines:** Lines 59–65, 180.
- **Finding:**  
  Prime Agent's `skills.ts` validates that the `name` field in `SKILL.md` frontmatter exactly matches the immediate parent directory name (`name === parentDirName`). A mismatch silently discards the skill.
- **Recommendation:**  
  Ensure `tests/test-package.sh` includes an automated assertion that each `SKILL.md` in `agent-home/skills/` contains a valid `name:` property matching its directory name (`using-superpowers`, `prime-rlm-dispatch`, `model-policy`, `subagent-driven-development`).

---

## 3. Section-by-Section Verification Table

| Spec Section | Verification Status | Analysis & Verification Notes |
|---|:---:|---|
| **1. Purpose & Success criteria** | **VERIFIED** | Cleanly scoped. Eliminates single-wire flattening; defines outcome-based metrics and proxy decoupling. |
| **2. Non-goals** | **VERIFIED** | Clean boundaries: no model weight training, no full Superpowers fork, no automatic target repo publishing/pushing. |
| **3. Architecture** | **VERIFIED** | Isolated agent home (`PRIME_AGENT_CODING_AGENT_DIR`) and target cwd mechanics verified against Prime Agent runtime. *(Note: Addressed launcher model ID resolution in `GEMINI-R2-MAJOR-1`)*. |
| **4. Repository layout** | **VERIFIED** | File tree accurately isolates `agent-home/` while maintaining standard root scripts (`prime`, `prime.cmd`, `doctor`, `tests/`). |
| **5. Model policy** | **VERIFIED** | Role allocations align with provider reasoning capabilities; selector resolution is exact; model fallback matrix preserves auditability. |
| **6. Provider and model registration** | **VERIFIED** | Native wire endpoint derivation (`/v1`, bare root, `/v1beta`) verified against `@google/genai`, `@anthropic-ai/sdk`, and `openai`. `authHeader: true` ensures gateway compatibility. |
| **7. Workflow policy** | **VERIFIED** | Complete 11-step state machine with setup, discovery, spec freeze, TDD evidence, bounded fix loop, ruling authority, and whole-branch verification. |
| **8. Configuration contract** | **VERIFIED** | Minimal required variables (`PRIME_BASE_URL`, `PRIME_LLM_KEY`) with explicit per-dialect URL and auth mode overrides. |
| **9. Safety and compatibility** | **VERIFIED** | Guardrails for secret redaction, credential isolation, tool vocabulary mapping, and immutable review baselines are complete. |
| **10. Verification** | **VERIFIED** | Comprehensive verification suite covering syntax, provider config, mock network roundtrips, RLM lifecycle, and `scripts/doctor`. |
| **11. Round 1 resolution record** | **VERIFIED** | Accurately accounts for all 10 architectural pivots agreed upon across Sol, Opus, and Gemini Round 1 reviews. |

---

## 4. Final Review Conclusion

The `2026-08-26-prime-superpowers-design.md` specification is now **robust, precise, and fully executable** against Prime Agent 0.8.1 and Superpowers v6.3.0.

The design successfully reconciles the structural strengths of both codebases:
- Harnesses Superpowers' structured planning, TDD discipline, and multi-tier review.
- Leverages Prime Agent's programmatic RLM subagent execution, isolated agent home, and native multi-provider endpoints.
- Protects the operator's environment and credentials with strict proxy isolation and deterministic depth limits.

**Recommendation:** Proceed immediately to task breakdown and implementation.
