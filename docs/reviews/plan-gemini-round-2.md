# Implementation Plan Review — Round 2 (Gemini Seat)

- **Artifact:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`
- **Artifact state:** 418 lines, header `Status: draft, round 1 findings incorporated`
- **Design source:** `docs/specs/2026-08-26-prime-superpowers-design.md` (298 lines, round 5/6 incorporated)
- **Runtime baselines:** Prime Agent `0.8.1` source at `bc0fa7606abb3b7af0f765319518d255e6ae553d`, Superpowers `v6.3.0` at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`
- **Review date:** 2026-08-27
- **Seat:** Gemini (independent context, blind-spot, and portability reviewer; read-only — no spec, product, or test file was edited by this review)
- **Scope:** Complete task breakdown audit focusing on cross-platform path/ESM/shell behavior, task ordering, exact filenames and commands, native provider wire probes, ephemeral-port mocks, static doctor without credentials, real binary/package test feasibility, and all prior Gemini findings.
- **Verdict:** **APPROVAL (0 Blockers, 0 Majors, 0 Minors)**

---

## Severity Rubric

- **Blocker:** An unresolvable architectural contradiction or defect that prevents plan execution or violates the core security/safety boundary.
- **Major:** A defect in task sequencing, gate definitions, cross-platform execution, or wire testing that causes deterministic test failure, false gate passage, or broken runtime contracts.
- **Minor:** Ambiguities in path resolution, fixture sizing, error diagnostics, or naming consistency that should be tightened before implementation.

---

## Findings Summary

| ID | Severity | Category | Status | Summary |
|---|---|---|---|---|
| — | **Blocker** | — | **0** | No blocker issues found |
| — | **Major** | — | **0** | No major issues found |
| — | **Minor** | — | **0** | No minor issues found |

**Total Count:** **0 Blockers, 0 Majors, 0 Minors**

---

## Verification of Round 1 Resolution

### 1. Prior Gemini Round 1 Findings Resolution Audit

Every finding raised by the Gemini seat in Round 1 (`docs/reviews/plan-gemini-round-1.md`) has been fully resolved in the updated implementation plan:

1. **GEMINI-PLAN-M1 (Common Gate failure on non-existent `prime`):**
   - *Status:* **Resolved.**
   - *Resolution:* Section *Stage-aware gates* (lines 20–28) introduces `scripts/gate` in Task 1. The gate is shebang-aware, null-glob safe, discovers existing POSIX shell files dynamically, and only activates launcher/runtime suites starting from the tasks that introduce them. Absence prior to introduction is skipped cleanly.
2. **GEMINI-PLAN-M2 (`npm test --prefix toolchain` unconfigured script):**
   - *Status:* **Resolved.**
   - *Resolution:* The decorative npm test script has been removed from `toolchain/package.json`, and the gate relies directly on `node --test` over existing test suites.
3. **GEMINI-PLAN-N1 (Test file naming mismatch):**
   - *Status:* **Resolved.**
   - *Resolution:* Harmonized across the plan to `tests/provider-config.test.mjs` (lines 52, 111, 116), matching the design layout.
4. **GEMINI-PLAN-N2 (`prime.cmd` batch syntax and WSL forwarding validation):**
   - *Status:* **Resolved.**
   - *Resolution:* Task 4 (lines 173, 178) explicitly requires validating the batch wrapper syntax, argument forwarding fixture (`%*`), missing-WSL diagnostic, and non-zero exit status.
5. **GEMINI-PLAN-N3 (Mock HTTP servers binding to ephemeral port 0):**
   - *Status:* **Resolved.**
   - *Resolution:* Task 12 (lines 368, 417) mandates binding mock HTTP protocol servers to `127.0.0.1:0`, dynamically retrieving `server.address().port` to prevent `EADDRINUSE` port collision under concurrent test execution.
6. **GEMINI-PLAN-N4 (Static `scripts/doctor` credential-free execution):**
   - *Status:* **Resolved.**
   - *Resolution:* Task 11 (lines 342–347) defines static mode as structural verification where missing proxy credentials emit an informational notice rather than an exit-1 failure. Live completions are strictly gated under `--live`.
7. **GEMINI-PLAN-N5 (Dynamic ESM import of `lib/config.mjs` on Windows file URLs):**
   - *Status:* **Resolved.**
   - *Resolution:* Task 3 (lines 148, 155) mandates using relative ESM URLs or `url.pathToFileURL` to resolve `lib/config.mjs`, backed by a dedicated cross-platform Windows path fixture test.
8. **GEMINI-PLAN-N6 (Executable bit `chmod +x` verification for vendored scripts):**
   - *Status:* **Resolved.**
   - *Resolution:* Task 8 (line 272) and Task 11 (line 342) enforce verifying `0o111` executable permissions on all vendored scripts and tooling executables.

---

### 2. Sol and Opus Round 1 Cross-Seat Resolutions Audit

The updated implementation plan has also resolved all major concerns raised across the other reviewer seats:

- **Worktree & Execution Contract (PLAN-OPUS-R1-M7, SOL-PLAN-R1-B1):** Task 0 establishes an isolated kit-build worktree on `prime/kit-build-<run-id>` and initial progress ledger. `main`/`master` remain untouched.
- **Two-Phase Red Signatures (SOL-PLAN-R1-M1, PLAN-OPUS-R1-M5):** Every task specifies a deterministic two-stage red protocol: first an import/absence failure, followed by an importable fail-closed stub failing a named behavioral subtest with explicit expected vs. actual assertion strings.
- **Task Decomposition & Scope (SOL-PLAN-R1-M3, PLAN-OPUS-R1-M4):** The plan was expanded from 8 overloaded tasks into 14 granular, bite-sized tasks (Tasks 0 through 13). Catch-all modifications were eliminated; each task has a strictly bounded `Files` manifest.
- **Packaged Prime Runtime Spike (PLAN-OPUS-R1-B2, SOL-PLAN-R1-M8):** Task 12 provides end-to-end integration by headlessly executing the real checksum-verified Prime Agent 0.8.1 binary against local loopback mock servers and a temporary repository fixture.
- **Superpowers Helper Interfaces (SOL-PLAN-R1-M6, PLAN-OPUS-R1-B3):** Task 8 uses exact upstream positional invocations (`sdd-workspace PLAN_FILE`, `task-brief PLAN_FILE N OUTFILE`, `review-package PLAN_FILE BASE HEAD OUTFILE`) against temporary git repositories, preserving byte-identical upstream provenance.
- **Lifecycle Ownership & Separation of Concerns (SOL-PLAN-R1-M2, PLAN-OPUS-R1-M6):** Pure state management is encapsulated in `lib/workflow-state.mjs`, `lib/ledger.mjs`, and `lib/policy-history.mjs` with injected adapters. Prompt-only obligations are explicitly cataloged in Section *Ownership classification* (lines 44–49).
- **Universal Child Prompt & Dynamic Role Injection (SOL-PLAN-R1-M4, PLAN-OPUS-R1-M10):** Extension hooks `before_agent_start` via `systemPromptOptions.rlmDepth` to replace `systemPrompt` per turn. Depth 0 receives coordinator contract; depth > 0 receives universal tool contract; worker vs. reviewer role policy is carried in validated prompt text.
- **Model Profile Fixture (SOL-PLAN-R1-M5):** Pinned 5-row model profile fixture (lines 34–40) commits exact costs, context windows, max tokens, compatibility flags, and 7-level thinking maps derived directly from Prime Agent 0.8.1 `models.generated.ts`.
- **Unsafe Escape Hatch & Outcome Evaluation (SOL-PLAN-R1-M7, PLAN-OPUS-R1-M11):** `--unsafe-prime-args` is implemented in Task 5 with interactive confirmation and headless rejection; Task 13 produces `outcome-kit-build.md` evaluating ceremony value and recording run 1 into `.state/policy-history.jsonl`.
- **Review Diversity & Matrix Governance (PLAN-OPUS-R1-M2, PLAN-OPUS-R1-M3, PLAN-OPUS-R1-N8, PLAN-OPUS-R1-N9):** Task matrix (lines 56–70) enforces cross-family primary reviewers distinct from implementers for every task, seats Sol/Opus/Gemini for protocol/security/persistence tasks, and collapses documentation verification into a single final whole-branch council.

---

## Detailed Focus Area Analysis

### Focus Area 1: Cross-Platform Path, ESM, and Shell Behavior

1. **Windows ESM Resolution:** In Prime Agent 0.8.1, extension modules are dynamically loaded via Node ESM (`import()`). Passing raw Windows drive paths (e.g. `C:\repo\lib\config.mjs`) triggers `ERR_UNSUPPORTED_ESM_URL_SCHEME`. Task 3's requirement to use relative ESM specifiers or `pathToFileURL` ensures cross-platform compatibility across Windows, WSL, macOS, and Linux environments.
2. **Batch Wrapper Forwarding (`prime.cmd`):** Task 4 validates batch syntax and argument forwarding (`%*`). In non-WSL Windows environments, `prime.cmd` halts with a clear prerequisite message and non-zero exit code rather than crashing with unhandled batch parsing errors.
3. **Shell Script Portability:** All shell scripts (`scripts/bootstrap-toolchain`, `scripts/gate`, `scripts/doctor`, `scripts/install-superpowers-package`, `tests/test-package.sh`) adhere to standard POSIX shell syntax. `scripts/gate` safely ignores unmatched globs using null-safe discovery and checks shebangs before dispatching `bash -n`.

### Focus Area 2: Task Ordering, Sizing, and Dependency DAG

The 14-task dependency DAG is strictly sequential and acyclic:
- **Task 0 (Setup):** Worktree isolation and ledger baseline.
- **Task 1 (Toolchain):** Node `>=22.8.0` preflight, `toolchain/` package pinning, `scripts/gate`.
- **Task 2 (Config):** Pure `.env` parsing, proxy root URL derivations, model profile fixture.
- **Task 3 (Extension):** `prime-superpowers.js` loader, `before_agent_start` depth prompt replacement, tool whitelist.
- **Task 4 (Launcher):** Invariant environment export, `prime`/`prime.cmd`, signal/exit forwarding.
- **Task 5 (Firewall):** Deny-by-default CLI argument firewall, `--unsafe-prime-args` interactive gate.
- **Task 6 (Worktree):** Git target validation, external and `.worktrees/` in-repository branch management with `.git/info/exclude`.
- **Task 7 (Lifecycle):** Atomic run registry, parent session locking, attach/status/stop operations.
- **Task 8 (Vendoring):** Superpowers v6.3.0 skill vendoring, provenance validation, script permissions.
- **Task 9 (Policy):** Workflow contract skills, novelty discovery, model routing rules.
- **Task 10 (State Engine):** Pure `lib/workflow-state.mjs`, `lib/ledger.mjs`, `lib/policy-history.mjs`, deadlines, retry tombstones, late-report quarantine.
- **Task 11 (Doctor):** Static repository health verification without secrets, live network checksums and completion probes.
- **Task 12 (Integration Spike):** Pinned Superpowers package installation, real Prime Agent 0.8.1 headless runtime execution, loopback mock wire probes (`/v1/responses`, `/v1/messages`, `/v1beta/models/...`).
- **Task 13 (Docs & Outcome):** Operator documentation, CI workflows, `outcome-kit-build.md`, and final whole-branch council review.

Each task is bite-sized, decoupled, independently testable, and modifies only its declared `Files` set.

### Focus Area 3: Exact Filenames, Commands, and Two-Phase Red Signatures

- All file paths across `lib/`, `scripts/`, `agent-home/`, `tests/`, `tests/fixtures/`, and `docs/` match the accepted design layout and formal layout amendment.
- Every test command uses Node's native runner (`node --test`) or explicit bash scripts without reliance on unconfigured npm scripts.
- Every task includes an explicit, deterministic two-phase red checkpoint:
  1. Module/path absence check (`ERR_MODULE_NOT_FOUND` / ENOENT).
  2. Behavioral failure check on an importable fail-closed stub asserting specific TAP failure messages (e.g. `derives three native proxy roots`, `creates run branch before returning cwd`, `second live coordinator is refused`, `timed-out attempt cannot be retried before cancellation tombstone`).

### Focus Area 4: Native Provider Wire Probes and Ephemeral-Port Mocks

- Task 12 validates Prime Agent's native serializer requests against ephemeral-port HTTP servers (`127.0.0.1:0`):
  - **OpenAI Responses:** `POST /v1/responses`, verifying bearer auth, `prompt_cache_retention: "24h"` under `PI_CACHE_RETENTION=long`, and `{ effort: "none"|"low"|"medium"|"high"|"xhigh"|"max" }`.
  - **Anthropic Messages:** `POST /v1/messages`, verifying bearer/native auth, `cache_control: { type: "ephemeral", ttl: "1h" }`, static extended-cache `anthropic-beta` header (or complete key omission when empty), and `eager_input_streaming: true` on tool definitions.
  - **Google Generative AI:** `POST /v1beta/models/...`, verifying thinking levels `LOW` and `HIGH`.
- Ephemeral port binding guarantees complete isolation during parallel test execution in local developer environments and CI runners.

### Focus Area 5: Static Doctor Without Credentials

- Task 11 implements `scripts/doctor` with three distinct operational tiers:
  1. **Static Mode (default):** Validates Node version, toolchain identity, extension syntax, settings, skill provenance, model selectors, URL derivations, executable bits, and system tool prerequisites (`rg`, `fd`, Python/IPython). Emits a clear diagnostic notice for missing `PRIME_LLM_KEY` without failing the process (exit code 0).
  2. **Live Mode (`--live`):** Requires `PRIME_LLM_KEY` and performs live end-to-end completion probes across configured model roles.
  3. **Verification Mode (`--verify-downloads`):** Downloads and validates SHA-256 sums for Prime release tarballs.
- This clean separation allows CI and offline local workflows to verify package health with zero secret exposure.

### Focus Area 6: Real Binary and Package Test Feasibility

- Task 12 exercises the real Prime Agent 0.8.1 binary in headless mode:
  - Validates extension loading from `agent-home/extensions/prime-superpowers.js`.
  - Asserts provider registration and model selector visibility (`prime-proxy-openai/gpt-5.6-sol`, etc.).
  - Installs the pinned Superpowers v6.3.0 package into an isolated temporary agent home via `scripts/install-superpowers-package`, confirming that local skill overrides (`using-superpowers`, `subagent-driven-development`) win collisions over package copies while non-colliding skills remain active.
  - Validates `rlmMaxDepth: 1` enforcement and grandchild rejection.
  - Verifies worktree cwd inheritance for root and child sessions.
- Tests run entirely against local loopback mocks with sentinel credentials, requiring no external network connectivity once dependencies are installed.

---

## Verdict and Approval

The round-2 implementation plan in `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md` is exhaustive, rigorous, cross-platform sound, and faithful to the accepted architecture. It completely addresses all prior review findings across all seats.

- **Blockers:** **0**
- **Majors:** **0**
- **Minors:** **0**

**Disposition:** **APPROVED for implementation.**
