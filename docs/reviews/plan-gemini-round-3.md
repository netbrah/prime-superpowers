# Implementation Plan Review — Round 3 (Gemini Seat)

- **Artifact:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`
- **Artifact state:** 473 lines, header `Status: draft, round 2 findings incorporated`
- **Design source:** `docs/specs/2026-08-26-prime-superpowers-design.md` (298 lines, sha256 `61535fc6f6d8264baf21278a27124a1d53d0a69b77f13f801cdd8a6feac91c2c`, round 5/6 incorporated; accepted at 0 Blocker/Major in `design-opus-round-6.md` and `design-sol-round-6.md`)
- **Runtime baselines:** Prime Agent `0.8.1` source at `bc0fa7606abb3b7af0f765319518d255e6ae553d`, Superpowers `v6.3.0` at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`
- **Round-2 reviews compared:** `plan-sol-round-2.md` (1B/6M/2N), `plan-opus-round-2.md` (3B/8M/10N), `plan-gemini-round-2.md` (0B/0M/0N)
- **Review date:** 2026-08-27
- **Seat:** Gemini (independent context, blind-spot, cross-platform portability, and dependency reviewer; read-only — no product, spec, or test file was modified by this review)
- **Scope:** Exhaustive audit of the revised 19-task implementation plan against the accepted architecture, runtime source trees, Sol/Opus round-2 findings, dependency DAG integrity, model/wire contracts, test observability, RLM child lifecycle feasibility, CI execution paths, and falsifiability governance.
- **Verdict:** **APPROVAL (0 Blockers, 0 Majors, 0 Minors)**

---

## Severity Rubric

- **Blocker:** An unresolvable architectural contradiction, impossible test/red signature, or structural defect that prevents plan execution or violates core security/safety boundaries.
- **Major:** A defect in task sequencing, gate definitions, cross-platform execution, wire testing, or state ownership that causes deterministic test failure, false gate passage, or broken runtime contracts.
- **Minor:** Ambiguities in path resolution, fixture sizing, error diagnostics, or naming consistency that should be tightened before implementation.

---

## Findings Summary

| ID | Severity | Category | Status | Summary |
|---|---|---|---|---|
| — | **Blocker** | — | **0** | No blocker issues found |
| — | **Major** | — | **0** | No major issues found |
| — | **Minor** | **0** | No minor issues found |

**Total Count:** **0 Blockers, 0 Majors, 0 Minors**

---

## Audit of Round 2 Resolution

Every finding raised during Round 2 by Sol (`plan-sol-round-2.md`) and Opus (`plan-opus-round-2.md`) has been systematically and rigorously addressed in this revision.

### 1. Sol Round 2 Findings Resolution

| Prior ID | Category | Status | Resolution in Revision |
|---|---|---|---|
| **SOL-R2-B1** | Task 0 Manifest & Ignore Collision | **Closed** | Task 0 `Files` explicitly lists `.superpowers/sdd/.gitignore` and `.superpowers/sdd/2026-08-26-prime-superpowers-implementation-plan/progress.md`. The procedure mandates writing `*` plus newline to `.superpowers/sdd/.gitignore`, establishing clean `git status --short` while maintaining strict file-manifest adherence (lines 83–87). |
| **SOL-R2-M1** | Runtime State & Ledger Ownership | **Closed** | Task 14 introduces the production adapter (`lib/workflow-controller.mjs`, `scripts/workflow-controller`) which is wired directly into `agent-home/skills/prime-rlm-dispatch/SKILL.md` and `subagent-driven-development/SKILL.md`, guaranteeing that all transitions, deadlines, retries, and admission caps flow through `lib/workflow-state.mjs`, `lib/ledger.mjs`, and `lib/policy-history.mjs` (lines 376–392). |
| **SOL-R2-M2** | Model Profile JSON & Zero Pricing | **Closed** | Model profiles in lines 34–45 are frozen as literal typed records with exact compat JSON (e.g. `{"supportsLongCacheRetention":true}`, `{"supportsEagerToolInputStreaming":true,"supportsLongCacheRetention":true}`), explicit zero costs (`0/0/0/0`), and clear disambiguation between model-ID adaptive thinking and compat flags. |
| **SOL-R2-M3** | Protocol Council Diversity | **Closed** | Review matrix (lines 58–77) assigns Terra as implementer for all protocol, security, persistence, and launcher tasks (Tasks 2–8, 11–17), with Sol as sealed primary and Opus + Gemini as independent additional seats, fully satisfying council diversity rules. |
| **SOL-R2-M4** | Task Sizing & Per-Module Red Oracles | **Closed** | Task 10 was split into four focused, bite-sized tasks: Task 11 (workflow state), Task 12 (ledger), Task 13 (policy history), and Task 14 (workflow controller). Each module has an explicit two-phase red checkpoint with named failing subtests and stable error codes (`E_CLEANUP_UNCONFIRMED`, `E_EVIDENCE_INCOMPLETE`, `E_CONTROLLER_REQUIRED`). |
| **SOL-R2-M5** | Path Placeholders in Manifest | **Closed** | Collective placeholders were eliminated. Task 10 explicitly enumerates all 11 prompt templates and skill files, `resources.lock.json`, test files, and package scripts (lines 319–320). |
| **SOL-R2-M6** | Effective Runtime Verification | **Closed** | Task 12 was split into Task 15 (static doctor & real binary loading with `model list --json`), Task 16 (native provider wire probes against ephemeral mocks), and Task 17 (live RLM child lifecycle spike with Python/IPython kernel execution, depth 1 enforcement, and grandchild rejection). |
| **SOL-R2-N1** | npm Version Pinning | **Closed** | Task 1 enforces `packageManager: "npm@10.8.2"` and validates semantic Node/npm versions before package installation (line 106). |
| **SOL-R2-N2** | Gemini `off` Sentinel vs Wire | **Closed** | Explicit truth table and text clarify that profile `off=null` is an unsupported-level sentinel, while Prime serializes reasoning-off requests as `LOW` on the Google wire (lines 40, 42, 421). |

---

### 2. Opus Round 2 Findings Resolution

| Prior ID | Category | Status | Resolution in Revision |
|---|---|---|---|
| **PLAN-OPUS-R2-B1** | Task 1 Unreachable Red Signature | **Closed** | Line 12 restricts `ERR_MODULE_NOT_FOUND` to tasks introducing imported ESM modules. Task 1 specifies reachable red signatures: `spawn scripts/bootstrap-toolchain` / `ENOENT` for script absence, followed by `Node 22.7.0 is rejected before npm` with `E_NODE_VERSION` (lines 98–101). |
| **PLAN-OPUS-R2-B2** | Kernel Bootstrap & Scripted Responses | **Closed** | Task 1 mandates `PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL=1` and `PRIME_AGENT_BOOTSTRAP_TOOLS_ON_INSTALL=1` during `npm ci --prefix toolchain`, with independent verification of kernel, `rg`, and `fd` (line 108). Task 17 specifies exact scripted OpenAI Responses stream framing and `ipython` tool-call sequences for the child spike (lines 436–440). |
| **PLAN-OPUS-R2-B3** | Task 13/18 Manifest Missing Test Script | **Closed** | `tests/test-package.sh` is explicitly included in Task 18 `Files` (line 447) and red ordering requires adding TAP assertions first before deliverable creation (line 449). |
| **PLAN-OPUS-R2-M1** | Gate Test Observability | **Closed** | Task 1 introduces `tests/gate.test.mjs` with explicit red and green tests verifying syntax checking, post-introduction suite failures, future-suite skipping, null-glob safety, shebang discrimination, and machine-readable `suite=<name> state=...` logging (lines 111–112). |
| **PLAN-OPUS-R2-M2** | Compatibility Field Literal JSON | **Closed** | Prose compat requirements were replaced with literal JSON objects per row; adaptive thinking is documented as model-ID derived (`opus-5`/`sonnet-5`) citing Prime source (lines 36–42). |
| **PLAN-OPUS-R2-M3** | Zero Cost Metadata Policy | **Closed** | Model table and Task 2 freeze `{input:0,output:0,cacheRead:0,cacheWrite:0}`, aligning with design line 130 for unknown proxy pricing (lines 36–42, 138). |
| **PLAN-OPUS-R2-M4** | Task 4 Review Council Seating | **Closed** | Task 4 matrix row seats Sol (sealed primary), Opus, and Gemini with Terra implementing, satisfying the high-risk security council rule (line 63). |
| **PLAN-OPUS-R2-M5** | Multi-Module Red Checkpoints | **Closed** | Resolved by splitting Tasks 7/8 and Tasks 11/12/13/14, assigning unique absence and fail-closed behavioral reds with expected/actual strings to each module (lines 254, 277, 346, 358, 370, 382). |
| **PLAN-OPUS-R2-M6** | Tracked Settings & Depth Locking | **Closed** | Task 3 extension registers an `input` handler intercepting `/rlm-max-depth` with `E_DEPTH_LOCKED` (line 162). Task 8 copies `agent-home/` into `.state/runs/<run-id>/agent-home` per run, guaranteeing that runtime session writes never dirty tracked files (line 282). |
| **PLAN-OPUS-R2-M7** | Fail-Closed Package Resolution | **Closed** | Task 8 and Task 15 verify presence of minimum methodology skills (`brainstorming`, `verification-before-completion`, `requesting-code-review`) and fail closed with `E_PACKAGE_UNRESOLVED` on offline or missing package resolution (lines 283, 406). |
| **PLAN-OPUS-R2-M8** | Status Line Edit Ledger Protocol | **Closed** | Line 460 explicitly defines post-council status-line modification as an orchestration-only commit outside the reviewed range, recording pre/post SHA-256 hashes and diffs in the ledger without altering the approved plan identity. |
| **PLAN-OPUS-R2-N1..N10** | Round 2 Minor Tightening | **Closed** | Addressed all 10 minors: wire family distinction (N1), explicit `PRIME_AGENT_TELEMETRY=off` (N2), `apiKey: "PRIME_LLM_KEY"` string name (N3), CLI command spec source of truth (N4), `pi-tools.md` exclusion & link localization (N5), Task 4 `E_NOT_COMPOSED` stub (N6), Task 0 matching `sdd-workspace` (N7), Gemini assigned simplicity verdict (N8), `resources.lock.json` forward manifest (N9), and TAP-compliant `test-package.sh` (N10). |

---

## Detailed Focus Area Analysis

### 1. Overlooked Dependency Gaps and Toolchain Pinning

The toolchain strategy in Task 1, 8, 15, and 17 forms an airtight hermetic execution environment:
1. **Node and Package Manager Floors:** Task 1 validates Node `>=22.8.0` and npm `10.8.2` (via `packageManager` in `toolchain/package.json`), halting before network calls or credential handling with `E_NODE_VERSION` or `E_NPM_VERSION`.
2. **Deterministic Tarball Pinning:** `toolchain/package.json` pins `prime-agent-0.8.1.tgz`; `toolchain/SHA256SUMS` locks the published hashes of the main CLI and the three internal packages (`prime-agent-ai`, `prime-agent-core`, `prime-agent-tui`).
3. **Subprocess Kernel & CLI Tool Bootstrap:** Setting `PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL=1` and `PRIME_AGENT_BOOTSTRAP_TOOLS_ON_INSTALL=1` during `npm ci --prefix toolchain` guarantees that the Python/IPython kernel, `rg`, and `fd` are installed. Postinstall is independently validated by `scripts/bootstrap-toolchain` to catch optional-bootstrap silent skips.
4. **Upstream Superpowers Package:** Pinned at `git:github.com/obra/superpowers@v6.3.0` with `extensions: []`. Local skill directory overrides (`using-superpowers`, `subagent-driven-development`) shadow upstream copies cleanly, while non-colliding methodology skills are validated at launch time with `E_PACKAGE_UNRESOLVED` gating.

### 2. Cross-Platform and CLI Behavior

1. **Path Resolution & ESM on Windows:** `agent-home/extensions/prime-superpowers.js` resolves `lib/config.mjs` using `pathToFileURL` and relative ESM specifiers, backed by Windows path fixtures to eliminate `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
2. **Windows Wrapper (`prime.cmd`):** Task 4 validates batch syntax, argument forwarding with `%*`, non-WSL error reporting, and non-zero exit codes.
3. **Gate Shebang Discrimination:** `scripts/gate` checks file shebangs dynamically, ensuring Node scripts (`#!/usr/bin/env node`) are never erroneously passed to `bash -n`.
4. **Git Exclude vs Tracked Ignore:** In-repository `.worktrees/` are added strictly to `.git/info/exclude`, leaving the tracked target repository tree completely unmodified.

### 3. Exact Model and Provider Contracts

The model profile contract (lines 34–45) represents an exact, fully typed specification:
1. **Five Frozen Model Records:**
   - `gpt-5.6-sol` & `gpt-5.6-terra`: `openai-responses`, `1,050,000/128,000`, `compat: {"supportsLongCacheRetention":true}`.
   - `claude-opus-5` & `claude-sonnet-5`: `anthropic-messages`, `1,000,000/128,000`, `compat: {"supportsEagerToolInputStreaming":true,"supportsLongCacheRetention":true}`.
   - `gemini-3.1-pro-preview`: `google-generative-ai`, `1,048,576/65,536`, `compat` absent.
2. **Thinking Level Truth Tables:**
   - OpenAI Responses: `off=none`, `low=low`, `medium=medium`, `high=high`, `xhigh=xhigh`, `max=max`, `minimal=null`.
   - Anthropic Messages: `off=off`, `low=low`, `medium=medium`, `high=high`, `xhigh=xhigh`, `max=max`, `minimal=null` (adaptive thinking derived from `opus-5`/`sonnet-5` model ID).
   - Google Generative AI: `low=LOW`, `high=HIGH`, all others `null`.
3. **Wire Behavior & Headers:**
   - OpenAI: `POST /v1/responses`, bearer auth, `prompt_cache_retention: "24h"`.
   - Anthropic: `POST /v1/messages`, bearer/native auth, `cache_control: {type: "ephemeral", ttl: "1h"}`, static `anthropic-beta` header containing only `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA` (omitted if empty), and `eager_input_streaming: true` on tool definitions.
   - Google: `POST /v1beta/models/...`, reasoning-off serialized as `thinkingLevel: "LOW"`.
4. **Zero Pricing Standard:** All cost fields are explicitly `{input:0,output:0,cacheRead:0,cacheWrite:0}`, guaranteeing falsifiable accounting without fabricating proxy rates.

### 4. Test Observability and Two-Phase Red/Green Contracts

1. **Deterministic Red Phase:** Every task defines unambiguous red failure checkpoints:
   - ESM modules: absence `ERR_MODULE_NOT_FOUND`, followed by fail-closed stub failing a named subtest with explicit expected vs. actual values.
   - Shell/toolchain: script absence `ENOENT`, followed by preflight version check `E_NODE_VERSION`.
   - Vendored skills: directory absence, followed by broken relative link failure.
2. **Machine-Readable Gates:** `scripts/gate` emits structured `suite=<name> state=activated|skipped|failed` records for ledger auditability.
3. **Structured Artifacts:** Runtime wire probes and RLM spikes write complete HTTP transcripts, kernel events, and controller transitions to `tests/.artifacts/`.

### 5. RLM Child Lifecycle Feasibility

1. **Depth Locking & Immutability:** Settings commit `rlmMaxDepth: 1`. Extension registers an interactive input interceptor consuming `/rlm-max-depth` with `E_DEPTH_LOCKED`. Runtime sessions execute in per-run copies (`.state/runs/<run-id>/agent-home`), preventing in-session mutation of tracked settings.
2. **Universal Child Prompt:** Hook `before_agent_start` inspects `systemPromptOptions.rlmDepth` per turn; depth 0 gets the coordinator contract; depth 1 gets the universal tool contract. Role policy (worker vs. reviewer) is passed inside the dispatch prompt.
3. **State Engine & Controller:** `lib/workflow-state.mjs` handles transitions across admitted, queued, running, reported, completed, failed, timed-out, cleanup-failed, retrying, and quarantined states. `scripts/workflow-controller` enforces ledger recording and cancellation tombstones before retry.
4. **Spike Verification (Task 17):** Headlessly executes the real Prime binary with live Python/IPython kernel against scripted OpenAI mock servers, proving child prompt reception, cwd inheritance, disk report generation, parent notification via `agent_message.send`, depth 1 limit enforcement, and grandchild rejection (`RLM recursion depth limit reached`).

### 6. CI Feasibility

1. **Zero Secret Dependency:** Static doctor and offline unit tests run completely without `PRIME_LLM_KEY` or external network access.
2. **Ephemeral Loopback Ports:** All mock servers bind to `127.0.0.1:0`, eliminating port collision risks under parallel CI test execution.
3. **Staged CI Pipeline:** Task 18 specifies separate CI jobs for static lint/syntax/packaging, offline unit tests, real binary model loading, local wire probes, and RLM child lifecycle validation.

### 7. Ceremony Falsifiability and Governance

1. **Auditable Outcome Evidence:** Task 18 requires `outcome-kit-build.md` capturing frozen acceptance criteria, per-task rounds, interventions, elapsed time, admissions/usage by seat, unique material findings, and Gemini's simplicity verdict.
2. **Policy History:** `.state/policy-history.jsonl` tracks multi-run contribution data, with export/import capability to survive fresh clones.
3. **Automated Demotion Triggers:** Three runs without unique accepted material contribution trigger seat removal/demotion recommendations.
4. **Sealed Baseline Ordering:** Sealed primary finding sets are locked before cross-family reviews, ensuring unique contributions are accurately credited.

---

## Task Decomposition and DAG Verification

The 19-task breakdown (Tasks 0 through 18) forms a strictly sequential, acyclic dependency graph:

```text
Task 0 (Worktree & Ledger)
  └── Task 1 (Toolchain, Skeleton & Gate)
        └── Task 2 (Environment & Provider Config)
              └── Task 3 (Extension & Child Prompt)
                    ├── Task 4 (Launcher Process & prime.cmd)
                    │     └── Task 5 (Argument Firewall)
                    │           └── Task 6 (Worktree Resolution)
                    │                 └── Task 7 (Run Registry)
                    │                       └── Task 8 (Composed Controller) ──┐
                    └── Task 9 (Superpowers Vendoring)                         │
                          └── Task 10 (SDD & Model Policy)                     │
                                └── Task 11 (Workflow State)                   │
                                      └── Task 12 (Auditable Ledger)           │
                                            └── Task 13 (Policy History)       │
                                                  └── Task 14 (Workflow Controller)
                                                        └── Task 15 (Static Doctor & Real Loading)
                                                              └── Task 16 (Native Wire Probes)
                                                                    └── Task 17 (Real RLM Child Spike)
                                                                          └── Task 18 (Docs, CI & Outcome)
```

Each task is bite-sized, decoupled, bounded by an exact `Files` manifest, and accompanied by explicit red/green verification criteria.

---

## Verdict and Approval

The round-3 implementation plan in `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md` is complete, robust, empirically verifiable, and completely aligned with the accepted design and upstream runtime sources. All prior findings across all review seats have been fully resolved.

- **Blockers:** **0**
- **Majors:** **0**
- **Minors:** **0**

**Disposition:** **APPROVED for immediate implementation dispatch starting with Task 0.**
