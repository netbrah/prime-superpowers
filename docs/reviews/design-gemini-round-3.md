# Prime Superpowers CLI Design — Gemini Independent Review (Round 3)

**Reviewer:** Gemini 3.1 Pro (Context, Protocol, Portability & Large-Context Blind-Spot Reviewer)  
**Date:** 2026-08-26 / 2026-08-27  
**Target Document:** `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` (Status: draft, round 2 findings incorporated)  
**Reference Codebases:** `prime-agent` (v0.8.1, commit `bc0fa7606abb3b7af0f765319518d255e6ae553d`), `superpowers` (v6.3.0, commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`)  
**Prior Reviews Checked:** `design-gemini-round-2.md`, `design-sol-round-2.md`, `design-opus-round-1.md`, `design-gemini-round-1.md`, `design-sol-round-1.md`  
**Verdict:** **APPROVED — ZERO BLOCKERS, ZERO MAJORS** (0 Blockers, 0 Majors, 0 Minors)

---

## Executive Summary & Verdict

The Round 3 revision of `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` fully resolves all architectural blockers, major gaps, and minor ambiguities identified during Round 2 by both Sol and Gemini.

Specifically:
1. **Child Deadlines & Lifecycle Closed (`SOL-R2-B1`):** Converted bounded polling into an authoritative elapsed-time deadline state machine (`admitted_at`, `started_at`, `last_progress_at`, `deadline_at`) with role-scaled bounds (45m/90m/120m), confirmed `rlm.delete_subagent()` cancellation, fail-closed `cleanup-failed` state, single-retry under a unique child name, late-report quarantine, and restart deadline reconstruction.
2. **CLI Argument Firewall Closed (`SOL-R2-B2`):** Implemented an allowlist-based argument firewall preventing caller overrides of coordinator model, reasoning effort, cwd, system prompts, extension loading, or skill disabling, while allowing safe presentation and headless flags. Added an explicit interactive escape hatch (`--unsafe-prime-args`).
3. **Executable Provenance & Version Pinning Closed (`SOL-R2-M1`):** Replaced ambiguous settings assertions with exact `prime-agent: 0.8.1` npm dependency declaration, committed `package-lock.json` integrity hash verification, `node_modules/.bin/prime-agent` execution, and pre-credential startup `--version` checks.
4. **Complete Seven-Level Thinking Maps Closed (`SOL-R2-M2`):** Defined the full 7-level thinking map (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) for Sol/Terra, Opus/Sonnet, and Gemini, using explicit `null` mappings to disable unsupported intermediate levels in Prime's model catalog.
5. **Authentication & Secret Safety Closed (`SOL-R2-M3`):** Scoped proxy auth strictly to `bearer` and `native` using `PRIME_LLM_KEY`, rejected custom-secret header vectors, validated forbidden headers, and defined comma-joined Anthropic beta merging.
6. **Launcher Exact Model Selector Closed (`GEMINI-R2-MAJOR-1` / `SOL-R2-N2`):** The launcher passes the exact resolved Sol model ID (`prime-proxy-openai/${PRIME_MODEL_SOL:-gpt-5.6-sol}:max`) avoiding display-name/fuzzy matching ambiguity.
7. **Large-Context Reconnaissance Hygiene Closed (`GEMINI-R2-MAJOR-2`):** Embedded explicit repository search hygiene (`git ls-files`, `rg`, outline and range inspections) in the dispatch contract, preventing token saturation and context bloat.
8. **Environment Precedence & Concurrency Closed (`SOL-R2-N1`, `SOL-R2-N3`, `GEMINI-R2-MINOR-1`):** Defined non-executing data-parser semantics, strict 5-tier `.env` precedence, protected kit-control variable enforcement, and clone-level advisory locking with PID/target diagnostics.
9. **Portability & Repository Hygiene Closed (`GEMINI-R2-MINOR-2`, `GEMINI-R2-MINOR-3`, `GEMINI-R2-MINOR-4`):** In-repository worktree isolation via `.git/info/exclude`, comma-delimited `anthropic-beta` token preservation, Windows WSL redirection via `prime.cmd`, and strict skill frontmatter directory validation.

There are **0 Blockers** and **0 Majors**. The specification is complete, deterministic, and ready for immediate task breakdown and implementation.

---

## Issue Resolution Matrix (Round 2 Findings Verification)

| Prior Finding ID | Origin | Severity | Status | Verification & Resolution in Round-3 Spec |
|---|:---:|:---:|:---:|---|
| `SOL-R2-B1` | Sol | **Blocker** | **CLOSED** | Lines 139–141 define hard elapsed-time deadlines (45m recon/review, 90m impl/fix, 120m frontier/CI), `rlm.delete_subagent(child_id)` cancellation, `cleanup-failed` state, one retry under a fresh unique name, late-report quarantine, and restart deadline reconstruction. |
| `SOL-R2-B2` | Sol | **Blocker** | **CLOSED** | Lines 12, 184 define an allowlist-based CLI firewall that accepts safe presentation/headless flags and strictly rejects `--provider`, `--model`, `--models`, `--thinking`, `--cwd`, `--system-prompt`, `--no-extensions`, `--no-skills`, `--no-tools`, and resume/fork flags. |
| `SOL-R2-M1` | Sol | **Major** | **CLOSED** | Lines 38, 58–59, 77, 192, 204 establish exact npm dependency `prime-agent: 0.8.1`, committed `package-lock.json`, `node_modules/.bin/prime-agent` execution, and pre-credential version verification. |
| `SOL-R2-M2` | Sol | **Major** | **CLOSED** | Lines 109–117 specify the full 7-level thinking map table across all model families with explicit `null` values for all unsupported levels. |
| `SOL-R2-M3` | Sol | **Major** | **CLOSED** | Lines 48, 178–181 restrict auth to `bearer` and `native` using `PRIME_LLM_KEY`, disallow arbitrary custom secret headers, and enforce forbidden header lists. |
| `SOL-R2-N1` | Sol | **Minor** | **CLOSED** | Line 182 defines non-executing data-only `.env` parsing, 5-tier precedence order, and protected launcher controls. |
| `SOL-R2-N2` | Sol | **Minor** | **CLOSED** | Lines 38–39, 95 enforce exact model reference `prime-proxy-openai/${PRIME_MODEL_SOL:-gpt-5.6-sol}:max` in the launcher and exact `rlm.find_models` selectors for subagents. |
| `SOL-R2-N3` | Sol | **Minor** | **CLOSED** | Lines 79, 213 define clone-level advisory locking with PID, start time, and target diagnostics. |
| `GEMINI-R2-MAJOR-1` | Gemini | **Major** | **CLOSED** | Lines 38–39 specify exact registered model ID selector `${PRIME_MODEL_SOL:-gpt-5.6-sol}` instead of the display name `Sol`. |
| `GEMINI-R2-MAJOR-2` | Gemini | **Major** | **CLOSED** | Lines 87, 147 mandate targeted inventory/search (`git ls-files`, `rg`), range inspection, and exclusion of build/lock/binary artifacts. |
| `GEMINI-R2-MINOR-1` | Gemini | **Minor** | **CLOSED** | Line 182 specifies standard hierarchical precedence: `kit/.env` $\rightarrow$ `target/.env` $\rightarrow$ `kit/.env.local` $\rightarrow$ `target/.env.local` $\rightarrow$ process environment. |
| `GEMINI-R2-MINOR-2` | Gemini | **Minor** | **CLOSED** | Line 200 mandates that in-repository worktrees add `.worktrees/` to `.git/info/exclude` rather than tracked files. |
| `GEMINI-R2-MINOR-3` | Gemini | **Minor** | **CLOSED** | Lines 175, 180 mandate normalized comma-joining of Anthropic beta headers preserving Prime's internal tool-streaming flags. |
| `GEMINI-R2-MINOR-4` | Gemini | **Minor** | **CLOSED** | Lines 204, 208 enforce frontmatter `name` matching directory name in automated package test suite. |

---

## Detailed Focus-Area Verification Against Prime Agent 0.8.1 & Superpowers v6.3.0

### 1. Exact Selectors & Model Resolution

- **CLI Coordinator Selection:** Prime Agent's CLI parser (`packages/coding-agent/src/cli/args.ts:138-144`) and model resolver (`packages/coding-agent/src/core/model-resolver.ts:76-100`) match CLI model inputs against `${model.provider}/${model.id}`. The spec (lines 38–39) configures `--model prime-proxy-openai/${PRIME_MODEL_SOL:-gpt-5.6-sol}:max`. This matches the registered provider name `prime-proxy-openai` and model ID `gpt-5.6-sol`, guaranteeing clean resolution without depending on fuzzy display-name heuristics.
- **Subagent Selection & Resolution:** In Prime Agent's `AgentSession.runRlmChild()` (`packages/coding-agent/src/core/agent-session.ts:10173-10197`), child model resolution requires exact lowercase match against `${candidate.provider}/${candidate.id}`. The spec (line 95) requires the coordinator to resolve selectors once via `rlm.find_models()` and pass exact selector strings to `rlm.run(..., model=selector)`.
- **Seven-Level Thinking Maps:** In `packages/ai/src/models.ts:67-76`, `getSupportedThinkingLevels` returns only those levels where `thinkingLevelMap[level] !== null` (and where `xhigh`/`max` are explicitly defined). The spec's thinking map table (lines 111–115):
  - Sol/Terra: `off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"` $\rightarrow$ exact supported set: `["low", "medium", "high", "xhigh", "max"]`.
  - Opus/Sonnet: `off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"` $\rightarrow$ exact supported set: `["low", "medium", "high", "xhigh", "max"]`.
  - Gemini: `off: null, minimal: null, low: "LOW", medium: null, high: "HIGH", xhigh: null, max: null` $\rightarrow$ exact supported set: `["low", "high"]`.
  This guarantees that calling `rlm.run(..., thinking="medium")` on Gemini immediately throws a descriptive unsupported-level error in `agent-session.ts:10232-10238` rather than silently defaulting.

### 2. Context Hygiene & Large-Context Reconnaissance

- **Reconnaissance Protocol:** In large target repositories, subagents in Python REPL could saturate context by executing broad `Path.read_text()` calls. The spec (line 147) directs reconnaissance agents to start with targeted inventory (`git ls-files`, `rg`), bounded outline/range reads, and explicit filtering of binary, lock, and build artifacts.
- **Coordinator Context Hygiene:** The root coordinator is strictly constrained to authoring plans, specs, ledgers, review packages, and orchestration files (line 143). Product code is modified exclusively via worker commits in worktrees.
- **Reviewer Prompt Isolation:** Reviewers operate under read-only prompt contracts against immutable commit ranges (`BASE..HEAD`) or snapshots (lines 143, 196). Any unexpected working-tree modifications fail the review round.
- **Child Usage Accounting:** As documented in `prime-agent/packages/coding-agent/docs/rlm-runtime.md:183-197`, child token usage is attributed to parent assistant turns asynchronously without injecting child message trajectories into the parent model's context window.

### 3. Environment Precedence & Header Handling

- **Data-Only Parsing:** Spec line 182 enforces that environment files are parsed purely as key-value data structures without shell variable substitution or command expansion.
- **Hierarchical Precedence:** Spec line 182 formalizes the 5-tier loading hierarchy:
  $$\text{kit/.env} < \text{target/.env} < \text{kit/.env.local} < \text{target/.env.local} < \text{process environment}$$
- **Protected Controls:** Spec line 182 prohibits target environment files from overwriting kit invariants, including `PRIME_AGENT_CODING_AGENT_DIR`, `PI_CACHE_RETENTION`, lock paths, or package/extension settings.
- **Auth Modes & Header Merging:**
  - `bearer`: sets `authHeader: true` in Prime Agent's provider registration (`model-registry.ts:1333-1338`), emitting `Authorization: Bearer <PRIME_LLM_KEY>`.
  - `native`: sets `authHeader: false`, placing `PRIME_LLM_KEY` into standard provider fields (e.g. `x-api-key` for Anthropic, URL/header for Google, `Authorization: Bearer` for OpenAI).
  - Custom secret headers are disallowed, preventing credential leakage.
  - Comma-joined Anthropic beta headers (lines 175, 180) preserve internal flags (`fine-grained-tool-streaming-2025-05-14`) alongside `extended-cache-ttl-2025-04-11`.

### 4. Child Lifecycle, Deadlines & State Machine

- **Hard Role-Scaled Deadlines:** Spec line 139 defines explicit elapsed-time budgets:
  - Reconnaissance / Review: 45 minutes
  - Implementation / Fix: 90 minutes
  - Frontier Architecture / CI Verification: 120 minutes
- **Authoritative Timestamp Tracking:** Spec line 139 mandates tracking `admitted_at`, `started_at`, `last_progress_at`, and `deadline_at` in the durable ledger (`.superpowers/sdd/<plan>/progress.md`).
- **Active Cancellation & Tombstoning:** On deadline expiry (line 141), coordinator executes `await rlm.delete_subagent(child_id)`. The state advances to `timed-out` only upon confirmation from the registry (`rlm-runtime.ts:37-40`). Deletion failure triggers fail-closed `cleanup-failed` state.
- **Single-Retry Policy:** One retry is permitted under a fresh unique child name, with the same immutable input package and same model or next capability tier. Late-arriving reports are quarantined.
- **Restart Recovery:** If the coordinator restarts, remaining deadlines are reconstructed from persisted timestamps rather than resetting clocks.
- **Depth Limit Enforcement:** `rlmMaxDepth: 1` in `agent-home/settings.json` prevents workers from spawning grandchildren.

### 5. CLI Argument Firewall

- **Allowlist Filtering:** Spec line 184 defines a strict allowlist accepting positional prompts, file arguments, `-p`/`--print`, `--mode` (json/rpc), `--verbose`, and `--no-session`.
- **Reserved Flag Rejection:** The wrapper rejects split and `--flag=value` forms, aliases, and repetitions of:
  - Model & Provider overrides: `--provider`, `--model`, `--models`, `--thinking`
  - Workspace overrides: `--cwd`
  - System prompt overrides: `--system-prompt`, `--append-system-prompt`
  - Extension & Skill controls: `--no-extensions`, `--extensions`, `--no-skills`, `--skills`, `--no-tools`, `--tools`
  - Session restoration: `--continue`, `--resume`, `--fork`
- **Escape Hatch:** `--unsafe-prime-args` is provided as an explicit interactive escape hatch with clear user notification; it is disabled in headless/non-interactive execution.

### 6. Portability, Provenance & Repository Hygiene

- **Pinned Binary Execution:** The kit declares exact `prime-agent: 0.8.1` in `package.json` with committed `package-lock.json` and executes `node_modules/.bin/prime-agent` (lines 58–59, 77). Pre-credential version check halts startup if the binary does not report `0.8.1`.
- **Clone-Level Advisory Lock:** The launcher takes an advisory file lock before startup, failing fast with owning PID, start time, and target directory if another run is active in the clone (line 79).
- **Cross-Platform Support:** POSIX wrapper supports Linux, macOS, and WSL; `prime.cmd` provides actionable guidance directing Windows operators to WSL (line 199).
- **Worktree Exclusion:** In-repository worktrees automatically configure `.worktrees/` in `.git/info/exclude` to prevent dirtying target repository status (line 200).
- **Skill Directory Validation:** Package test suite validates that every `SKILL.md` frontmatter `name:` matches its immediate directory name (lines 204, 208).

---

## Section-by-Section Verification Table

| Spec Section | Status | Verification & Alignment Notes |
|---|:---:|---|
| **1. Purpose & Success criteria** | **VERIFIED** | Cleanly scoped. Explicit outcomes, zero-secret-leakage proxy decoupling, machine-verifiable TDD evidence, and simplicity evaluation. |
| **2. Non-goals** | **VERIFIED** | Clean boundaries: no model training, no full Superpowers fork, no single-wire flattening, no automated upstream git push. |
| **3. Architecture** | **VERIFIED** | Isolated agent home (`PRIME_AGENT_CODING_AGENT_DIR`), target working directory preservation, exact launcher model ID selector, and 3 unique proxy providers. |
| **4. Repository layout** | **VERIFIED** | Clean file tree, exact npm dependencies and lockfile, isolated `agent-home/`, and clone advisory lock. |
| **5. Model policy** | **VERIFIED** | Well-defined role allocation, single-resolution exact `rlm.find_models()` selectors, risk-scaled review councils, and fallback auditability. |
| **6. Provider and model registration** | **VERIFIED** | Native endpoint roots (`/v1`, bare, `/v1beta`), complete 7-level thinking maps with explicit `null`s, and bearer/native auth modes. |
| **7. Workflow policy** | **VERIFIED** | Complete 11-step SDD state machine, machine-checkable TDD evidence, 5-round convergence breaker, hard child deadlines, cancellation/retry lifecycle, and context reconnaissance hygiene. |
| **8. Configuration contract** | **VERIFIED** | Minimal required variables (`PRIME_BASE_URL`, `PRIME_LLM_KEY`), non-executing `.env` precedence, protected controls, and allowlist CLI argument firewall. |
| **9. Safety and compatibility** | **VERIFIED** | Read-only reviewer prompts, mutation detection, CI evidence schema, Windows WSL redirection, and `.git/info/exclude` hygiene. |
| **10. Verification** | **VERIFIED** | Comprehensive test specifications covering syntax, argument firewall, mock-server protocol validation, child lifecycle/deadline matrix, and live doctor probes. |
| **11. Round 1 & Round 2 resolution records** | **VERIFIED** | Complete historical record accurately tracking all architectural pivots and resolutions across all review rounds. |

---

## Final Review Conclusion

The `prime-superpowers` design specification in `docs/specs/2026-08-26-prime-superpowers-design.md` is **fully verified, mathematically consistent with Prime Agent 0.8.1 and Superpowers v6.3.0, and closed against all known failure modes**.

- **Blocker count:** **0**
- **Major count:** **0**
- **Minor count:** **0**

**Recommendation:** Proceed directly to task breakdown and implementation.
