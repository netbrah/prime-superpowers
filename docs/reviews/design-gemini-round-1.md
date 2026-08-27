# Prime Superpowers CLI Design — Gemini Independent Review (Round 1)

**Reviewer:** Gemini 3.1 Pro (Context, Protocol, Portability & Blind-Spot Reviewer)  
**Date:** 2026-08-26  
**Target Document:** `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md`  
**Reference Codebases:** `prime-agent` (v0.8.1), `superpowers` (v6.3.0)  
**Status:** Review Complete — Actionable Findings Recorded  

---

## Executive Summary & Architecture Assessment

The Prime Superpowers CLI design proposes an elegant architecture: combining upstream Superpowers development methodologies (brainstorming, writing-plans, TDD, SDD, and multi-tier review) with Prime Agent's native RLM programmatic subagent execution, model-diverse review councils, and a single proxy credential surface.

By choosing **project-local extension registration and skill shadowing** rather than vendoring or forking upstream Superpowers, the design maintains upstream maintainability while eliminating the incompatible Pi bootstrap and legacy tool mappings.

However, a deep cross-check against Prime Agent runtime internals (`packages/coding-agent`, `packages/ai`, `prime-agent-runtime`) and Superpowers workflows reveals several critical protocol, configuration, workflow, and lifecycle blind spots that will prevent execution or cause unrecoverable hangs if not addressed.

### Issue Summary

| Severity | Count | Primary Areas |
|---|:---:|---|
| **Blocker** | 3 | Google GenAI URL path construction, Proxy Auth Header mismatches, Fire-and-forget child hang / missing reconciliation contract |
| **Major** | 5 | 3-Model review deadlock & tie-breaking, Fresh reviewer context starvation, Child cwd inheritance vs worktrees, Anthropic 1h cache beta headers, Multi-model fallback policy |
| **Minor** | 5 | CLI argument passthrough, `.env` sourcing, Superpowers telemetry suppression, Skill frontmatter validation, Windows launcher portability |

---

## 1. Blocker Issues

### [BLOCKER-1] Google Provider Base URL Path Truncation on Unified Proxies

- **Location:** Spec Section: *Configuration contract* (lines 100–123), *Architecture* (lines 42–43); `prime-agent/packages/ai/src/providers/google.ts:328–332`.
- **Finding:**  
  When `model.baseUrl` is configured on a `google-generative-ai` model in Prime Agent, `packages/ai/src/providers/google.ts` sets:
  ```typescript
  if (model.baseUrl) {
    httpOptions.baseUrl = model.baseUrl;
    httpOptions.apiVersion = ""; // baseUrl already includes version path, don't append
  }
  ```
  The underlying `@google/genai` client constructs the request URL as `${baseUrl}/models/${model}:streamGenerateContent` without appending the standard Google API version prefix `/v1beta`.
  
  If the operator configures a unified proxy base URL (e.g., `PRIME_BASE_URL=https://proxy.example.test`), Google Generative AI requests will be sent to `https://proxy.example.test/models/...` instead of `https://proxy.example.test/v1beta/models/...`.
  
  Most LLM gateways (LiteLLM, Cloudflare AI Gateway, Portkey, custom proxies) route Google native endpoints under `/v1beta/models/...` or `/google/v1beta/models/...`. Because the spec states that the operator configures only `PRIME_BASE_URL` and `PRIME_LLM_KEY`, all Gemini calls will immediately return HTTP 404. Since Gemini 3.1 Pro is a mandatory member of the initial spec, architectural, and final review councils, the entire pipeline is hard-blocked at Step 2.
- **Required Fix:**  
  1. The extension registering the `google` provider must normalize `baseUrl`: if `PRIME_GOOGLE_BASE_URL` or `PRIME_BASE_URL` does not end with `/v1beta` (or the proxy's expected Google prefix), it should ensure the version segment is included, or document that `PRIME_GOOGLE_BASE_URL` must include the full versioned path (e.g. `https://proxy.example.test/v1beta`).
  2. The `scripts/doctor` verification script must send a lightweight probe to the Google endpoint to verify that the path resolves.

---

### [BLOCKER-2] Incompatible Authentication Headers Across Native Dialects on Single-Key Proxies

- **Location:** Spec Section: *Purpose* (line 7), *Configuration contract* (lines 100–105); `prime-agent/packages/coding-agent/src/core/model-registry.ts:1333–1338`.
- **Finding:**  
  The spec asserts a single credential surface:
  ```bash
  PRIME_BASE_URL=https://proxy.example.test
  PRIME_LLM_KEY=secret
  ```
  However, Prime Agent's native API providers construct request authentication headers differently:
  - `openai-completions` / `openai-responses`: Sends `Authorization: Bearer <PRIME_LLM_KEY>`.
  - `anthropic-messages`: Sends `x-api-key: <PRIME_LLM_KEY>`.
  - `google-generative-ai`: Sends `x-goog-api-key: <PRIME_LLM_KEY>` or query parameter `key=<PRIME_LLM_KEY>`.

  Many centralized corporate proxies and API gateways (such as LiteLLM, Cloudflare, Kong, Envoy) require a uniform `Authorization: Bearer <PRIME_LLM_KEY>` header for proxy authentication regardless of whether the payload dialect is OpenAI, Anthropic, or Google.
  
  If `authHeader: true` is not explicitly set in the provider configuration for Anthropic and Google, Prime Agent will send `x-api-key` / `x-goog-api-key`, resulting in HTTP 401/403 Unauthorized errors from standard proxy frontends. Conversely, if the proxy is a native Anthropic/Google pass-through, `Authorization: Bearer` might be rejected.
- **Required Fix:**  
  The extension's provider registration must explicitly handle auth header configuration:
  - Default to `authHeader: true` (or allow a `PRIME_AUTH_HEADER=bearer` switch) so all native dialects send `Authorization: Bearer <PRIME_LLM_KEY>` to the gateway.
  - Support setting provider-specific header overrides when a proxy requires both `Authorization: Bearer <PRIME_LLM_KEY>` and the native provider header.

---

### [BLOCKER-3] Missing Child Completion Signaling & Timeout/Reconciliation Contract

- **Location:** Spec Section: *Workflow policy* (lines 89–96); `prime-agent/packages/coding-agent/src/core/agent-session.ts:10200–10260`, `prime-agent-runtime/src/rlm/`.
- **Finding:**  
  In Prime Agent, `rlm()` is an asynchronous, fire-and-forget subagent admission call:
  ```python
  handle = await rlm(prompt, name="task-1-impl", model="...", thinking="...")
  ```
  The call returns an admission handle immediately—it **never** blocks until completion and **never** returns the child's text output.
  
  The spec notes:
  > "Children must write detailed results to files and send only a concise completion message to the parent with `agent_message.send`."
  
  However, if a dispatched worker or reviewer:
  1. Crashes due to an unhandled Python exception,
  2. Hits an API rate-limit or proxy error during its run,
  3. Reaches max turn limit without executing `agent_message.send(..., receiver_role="parent")`,
  
  the parent coordinator will sit in an indefinite wait for an `agent_message` that will never arrive. The spec specifies no polling, heartbeat, timeout, or recovery protocol.
- **Required Fix:**  
  The spec and the `prime-rlm-dispatch` skill must mandate a structured **reconciliation and heartbeat protocol**:
  1. The coordinator dispatches a child and records its `handle.name` in the ledger.
  2. The coordinator enters a bounded wait using `rlm_heartbeat.create(interval_minutes=5)` while inspecting status.
  3. The coordinator periodically calls `rlm.list_subagents()` to check if the child is still active (`running`) or has transitioned to `completed`/`errored`.
  4. If a child terminates without sending a parent `agent_message`, the coordinator inspects the child's output file and workspace error logs, logs the failure in the progress ledger, and initiates a clean fix round or retry instead of hanging.

---

## 2. Major Issues

### [MAJOR-1] Review Deadlock & Lack of Arbitration Rule in Multi-Model Councils

- **Location:** Spec Section: *Success criteria* (line 15), *Model policy* (lines 78–79), *Workflow policy* (lines 85–86, 93).
- **Finding:**  
  The workflow mandates that specs, plans, tasks, and code must pass fresh independent reviews by Sol, Opus, and Gemini with **zero blockers and zero majors** before proceeding.
  
  In practice, frontier models from different families (OpenAI, Anthropic, Google) often hold diverging design philosophies:
  - Opus frequently pushes for extensibility, abstract interfaces, and comprehensive edge-case hierarchies.
  - Sol prioritizes strict, minimal, gate-satisfying concrete implementations with zero extra surface area.
  - Gemini emphasizes broad integration robustness, large-context structural patterns, and strict standard adherence.
  
  If resolving an Opus finding causes Sol to raise a new major issue, or vice versa, the workflow will enter an infinite oscillation loop of revisions and fresh reviewer dispatches.
- **Required Fix:**  
  The spec must define an explicit **Coordinator Arbitration & Saliency Rule**:
  - The root coordinator (Sol:max) is the final authority.
  - When reviewers issue conflicting requirements or non-actionable stylistic critiques, the coordinator has the explicit authority to accept the trade-off, document the decision in the progress ledger (`.superpowers/sdd/<plan>/progress.md`), and mark the item as "Settled by Coordinator".
  - Subsequent review prompts must include the list of settled architectural decisions so fresh reviewers do not re-open closed decisions.

---

### [MAJOR-2] Fresh Reviewer Context Starvation & Review Oscillation

- **Location:** Spec Section: *Workflow policy* (lines 86, 92–93).
- **Finding:**  
  The spec states: *"dispatch fresh reviewers on the revised spec"* and *"dispatch fresh reviewers after each revision."*
  
  Because fresh reviewers are spawned in new RLM child sessions with depth 1, they have zero prior conversational context. If a reviewer receives only the modified file without the historical context of previous review rounds, it will frequently re-raise previously rejected alternatives or question intentional compromises made in Round 1.
- **Required Fix:**  
  The review dispatch contract must require passing the **Review Package**:
  1. The current artifact (spec, plan, or code diff).
  2. The previous round's review findings and the specific fixes applied.
  3. The coordinator's resolution notes.
  Fresh reviewers must be prompted using upstream Superpowers' `re-review-prompt.md` pattern rather than a naive blank-slate prompt.

---

### [MAJOR-3] Child CWD Inheritance vs Git Worktree Isolation

- **Location:** Spec Section: *Safety and compatibility* (lines 133–134); `prime-agent/packages/coding-agent/src/core/agent-session.ts:10242`.
- **Finding:**  
  In Prime Agent, `createRlmSubagentRuntime` sets `cwd: sessionManager.getCwd()`. Subagents inherit the coordinator's current working directory at the time the process started. There is no `cwd` parameter accepted by `rlm()`.
  
  If the workflow uses `using-git-worktrees` to isolate feature branches into separate directories (e.g. `.worktrees/feature-auth`), dispatched children will still have their Python process working directory pointing to the repository root.
  
  Any child executing relative file reads (`Path("src/index.ts")`) or running bash commands (`await bash("npm test")`) will run against the root repository rather than the worktree unless the child explicitly changes directory.
- **Required Fix:**  
  The `prime-rlm-dispatch` worker contract and prompt template must explicitly instruct every child:
  ```python
  import os
  os.chdir(task_working_directory)
  ```
  before executing any file system or shell operations.

---

### [MAJOR-4] Missing Anthropic 1-Hour Prompt Caching Beta Header Configuration

- **Location:** Spec Section: *Success criteria* (line 17), *Configuration contract* (line 125); `prime-agent/packages/ai/src/providers/anthropic.ts:64–77`.
- **Finding:**  
  The spec states:
  > "The launcher exports `PI_CACHE_RETENTION=long`, causing the Pi Anthropic client to attach `cache_control: {type: \"ephemeral\", ttl: \"1h\"}`."
  
  In Prime Agent 0.8.1, `packages/ai/src/providers/anthropic.ts` sends `ttl: "1h"` when `PI_CACHE_RETENTION=long`. However, Prime Agent **never** attaches the `extended-cache-ttl-2025-04-11` or `prompt-caching-2024-07-31` beta headers (there are zero occurrences of these headers across the codebase).
  
  While the public Anthropic endpoint or某些 proxies accept ephemeral cache markers without custom headers, many enterprise Anthropic proxies and older API gateways reject payloads containing `ttl: "1h"` with an `invalid_request_error` unless the corresponding beta header is present in the request headers.
- **Required Fix:**  
  The extension registering the `anthropic` provider must allow injecting custom headers via `headers`:
  ```typescript
  headers: {
    "anthropic-beta": "fine-grained-tool-streaming-2025-05-14,extended-cache-ttl-2025-04-11"
  }
  ```
  and `scripts/doctor` must test a small cache-control request against the proxy.

---

### [MAJOR-5] Hard Dependency on 3 Distinct Model Families Without Graceful Degradation

- **Location:** Spec Section: *Success criteria* (line 15), *Model policy* (lines 78–79).
- **Finding:**  
  The design strictly enforces that architectural, spec, and final review rounds must include at least Sol, Opus, and Gemini:
  > "Architectural and final review rounds use at least Sol, Opus, and Gemini... A task cannot be reviewed only by the same model family that implemented it."
  
  If a developer or team operates behind a proxy that only provides OpenAI and Anthropic models (e.g., Google is unconfigured or blocked by organizational policy), or if one provider encounters temporary rate limits / outages, the pipeline cannot satisfy the review policy and will completely halt.
- **Required Fix:**  
  Define an explicit **Model Policy Fallback Matrix** in `.prime/agent/skills/model-policy/SKILL.md`:
  - **Tier 1 (Full Council - Default):** Sol (OpenAI) + Opus (Anthropic) + Gemini (Google).
  - **Tier 2 (Dual-Family Fallback):** Sol (OpenAI) + Opus (Anthropic) + Sonnet/Terra (Cross-model secondary).
  - **Tier 3 (Constrained Fallback):** Explicitly log a warning in the review record that diversity was downgraded due to credential availability.

---

## 3. Minor Issues

### [MINOR-1] Missing CLI Parameter Forwarding in `./prime` Launcher

- **Location:** Spec Section: *Architecture* (lines 31–36), *Repository layout* (line 51).
- **Finding:**  
  The spec describes `./prime` as starting Prime Agent with `Sol:max`. It does not explicitly state that `./prime` must forward all incoming CLI arguments (`"$@"`) to the underlying `prime-agent` executable.
  
  Users and CI pipelines need to run non-interactive sessions (e.g., `./prime -p "run review"`, `./prime -c`, `./prime --resume`, `./prime --mode json`). If `./prime` does not pass `"$@"`, all headless, continuation, and testing workflows are disabled.
- **Required Fix:**  
  The launcher script must end with:
  ```bash
  exec prime-agent --model "${PRIME_MODEL_SOL:-openai/gpt-5.6-sol}:max" "$@"
  ```

---

### [MINOR-2] Automatic Environment File Sourcing (`.env` / `.env.local`)

- **Location:** Spec Section: *Repository layout* (line 49), *Configuration contract* (lines 100–123).
- **Finding:**  
  The repo layout lists `.env.example`, but the specification does not state whether `./prime` automatically sources `.env` or `.env.local` prior to launching `prime-agent`. If the operator defines `PRIME_BASE_URL` in `.env`, but `./prime` does not source it, the environment validation will fail unless the operator manually ran `export $(cat .env | xargs)`.
- **Required Fix:**  
  The launcher `./prime` should automatically check for and source `.env` and `.env.local` (with `set -a` / `set +a` or a safe line-by-line parser) if they exist.

---

### [MINOR-3] Upstream Superpowers Visual Companion Telemetry Suppression

- **Location:** Spec Section: *Architecture* (line 39); `superpowers/skills/brainstorming/scripts/server.cjs`.
- **Finding:**  
  Upstream Superpowers' `brainstorming` skill includes a Visual Companion server (`server.cjs` / `start-server.sh`) that attempts to download the Prime Radiant logo from external CDNs for telemetry and branding. In strict private or air-gapped proxy environments, this causes network timeouts or security warnings.
- **Required Fix:**  
  The `./prime` launcher should export `SUPERPOWERS_DISABLE_TELEMETRY=1` by default.

---

### [MINOR-4] Skill Frontmatter Strictness in Project Override (`using-superpowers`)

- **Location:** Spec Section: *Repository layout* (line 54); `prime-agent/packages/coding-agent/src/core/skills.ts`.
- **Finding:**  
  In Prime Agent, project-level skills in `.prime/agent/skills/` override package skills by matching directory name. However, Prime Agent's skill loader enforces strict YAML frontmatter parsing. If `.prime/agent/skills/using-superpowers/SKILL.md` is missing `name: using-superpowers` or `description: ...`, it is silently skipped, causing Prime Agent to fall back to the package's incompatible skill.
- **Required Fix:**  
  Add an explicit test in `tests/test-package.sh` and `scripts/doctor` that parses skill frontmatter to verify that `using-superpowers`, `prime-rlm-dispatch`, and `model-policy` are properly recognized.

---

### [MINOR-5] Windows / Cross-Platform Launcher Portability

- **Location:** Spec Section: *Repository layout* (line 51); `superpowers/docs/windows/polyglot-hooks.md`.
- **Finding:**  
  The repository layout defines `prime` as a Unix shell script. On Windows environments without WSL or Git Bash, users cannot execute `./prime`.
- **Required Fix:**  
  Include a lightweight `prime.cmd` wrapper or document the requirement for WSL/Git Bash in `README.md`.

---

## 4. Section-by-Section Verification & Consistency Check

| Spec Section | Status | Key Observations & Recommendations |
|---|:---:|---|
| **1. Purpose & Success criteria** | **Needs Adjustment** | Criterion 1 ("operator configures only PRIME_BASE_URL and PRIME_LLM_KEY") conflicts with provider-specific auth headers and Google URL pathing. Needs explicit proxy normalization rules. |
| **2. Non-goals** | **Approved** | Cleanly scoped. Keeping upstream skills un-forked is the right architectural choice. |
| **3. Architecture** | **Needs Adjustment** | Extension-based dynamic model registration is viable via `pi.registerProvider()`, but must account for model replacement vs baseUrl override behaviors. |
| **4. Repository layout** | **Approved** | Layout is minimal, clean, and directly leverages `.prime/agent/` conventions. |
| **5. Model policy** | **Needs Adjustment** | Role table is well-conceived, but needs an explicit fallback matrix when Google/Anthropic/OpenAI providers are partially available. |
| **6. Workflow policy** | **Needs Adjustment** | Steps 1–11 are comprehensive, but missing: (a) coordinator tie-breaking/arbitration, (b) re-review package context passing, (c) worker reconciliation loop. |
| **7. Configuration contract** | **Needs Adjustment** | Add `PRIME_GOOGLE_BASE_URL` path guidance (`/v1beta`) and `PRIME_AUTH_HEADER` options. |
| **8. Safety and compatibility** | **Approved** | `rlmMaxDepth: 1` and root-only bootstrap injection correctly prevent infinite recursion and prompt pollution. |
| **9. Verification** | **Needs Adjustment** | Add preflight probe checks in `scripts/doctor` for Google URL routing and proxy bearer tokens. |

---

## 5. Summary of Recommended Spec Changes

1. **Clarify Google Base URL Handling:** Specify that the extension or launcher ensures the Google endpoint path includes `/v1beta` when proxying Google GenAI.
2. **Define Proxy Auth Header Contract:** Document that `authHeader: true` is attached to registered providers to guarantee uniform `Authorization: Bearer` delivery to gateways.
3. **Formalize the Coordinator Bounded-Wait & Reconciliation Loop:** Update the workflow policy to state how the coordinator monitors subagent completion via `rlm.list_subagents()` and handles unhandled child terminations.
4. **Add Coordinator Arbitration & Tie-Breaking Authority:** Explicitly state that the coordinator resolves contradictory multi-model review findings and records decisions in the progress ledger.
5. **Incorporate Re-Review Package Protocol:** Require that fresh reviewers receive the previous review findings and resolution notes to prevent review oscillation.
6. **Mandate Child CWD Initialization:** Include `os.chdir(task_dir)` in the worker dispatch contract.
7. **Ensure CLI Argument Forwarding:** Specify `prime-agent ... "$@"` in the `./prime` launcher design.
