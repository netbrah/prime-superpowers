# Sol Plan Review — Round 2

**Artifact reviewed:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`  
**Accepted design:** `docs/specs/2026-08-26-prime-superpowers-design.md`  
**Prime Agent source:** commit `bc0fa7606abb3b7af0f765319518d255e6ae553d` (0.8.1)  
**Superpowers source:** commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0)  
**Reviewer:** Sol, fresh round-2 independent pass  
**Date:** 2026-08-27

## Verdict

**FAIL — implementation must not start.**

| Severity | Count |
|---|---:|
| Blocker | 1 |
| Major | 6 |
| Minor | 2 |

The implementation gate requires zero Blocker and zero Major. This plan has one internally impossible setup task, and six load-bearing gaps where an implementation could pass the stated tests without implementing the accepted design or where the implementer must invent contract details.

## Review method and evidence baseline

I read the complete plan, accepted design, all three round-1 plan reviews, and the relevant Prime Agent and Superpowers implementation paths. I also checked the two pinned source trees directly:

- Prime Agent `HEAD` is exactly `bc0fa7606abb3b7af0f765319518d255e6ae553d`.
- Superpowers `HEAD` is `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`, with tag `v6.3.0`.
- Plan SHA-256: `50ee26626fab8ac863997d70a5e195e62f34e2966d1642c83e143b902bd1db97`.
- Design SHA-256: `61535fc6f6d8264baf21278a27124a1d53d0a69b77f13f801cdd8a6feac91c2c`.

The review specifically tested: every prior Blocker/Major disposition; dependency order; task size; red/green observability; real-runtime feasibility; literal model records; workflow-state ownership; model-family review diversity; and whether each task is executable without unstated choices.

## Blocker

### SOL-R2-B1 — Task 0 cannot satisfy both its exact file manifest and its acceptance test

**Affected text:** plan lines 17, 52, and 72–80.

Task 0 permits only:

> `.superpowers/sdd/2026-08-26-prime-superpowers-implementation-plan/progress.md`

It simultaneously says that this file is ignored by `.superpowers/sdd/.gitignore`, requires `git status --short` not to show `.superpowers/sdd`, and globally forbids modifying any path not listed under `Files`.

The current `prime-superpowers` tree has no `.superpowers/sdd/.gitignore`. In a fresh Git repository, creating only the permitted progress file yields `?? .superpowers/`; adding `.superpowers/sdd/.gitignore` with an ignore rule makes the status clean, but that creates a path forbidden by Task 0's manifest. The plan also describes itself as the exact implementation file manifest at line 52.

This is not a stylistic ambiguity: there is no execution satisfying all three constraints in the stated starting state. It also means the claimed closure of worktree/ledger setup from round 1 is only partial.

**Required correction:** add `.superpowers/sdd/.gitignore` to Task 0's `Files`, specify its exact content and creation step, and state whether it is committed in the baseline or remains orchestration-only. Then make the acceptance command assert both the ignore rule and clean status.

## Majors

### SOL-R2-M1 — Workflow-state, ledger, and policy-history modules have no shipped runtime owner

**Affected text:** plan lines 44–48 and 301–324; design lines 142–170 and 240–246.

Task 10 creates three pure modules and tests them through injected fake clock/RLM adapters, but the plan never names a production consumer:

- Task 7 creates `lib/launcher.mjs` before Task 10, and Task 10 may not modify it.
- Task 9 creates the SDD/dispatch skills before Task 10, and Task 10 may not modify those paths.
- Task 10's `Files` contain only the three modules, their unit tests, and `tests/test-package.sh`.
- Task 12's `Files` contain integration tests, fixtures, an installer, and `tests/test-package.sh`, but no adapter or product path that invokes Task 10.
- No coordinator adapter, ledger command, or launcher integration path is named anywhere else in the plan.

Therefore all Task 10 tests can pass while no real coordinator path ever calls admission caps, deadline reconstruction, cancellation tombstones, retry gating, late-report quarantine, review-round limits, concurrence rules, or outcome gates. This fails the accepted workflow policy and runtime verification obligations in design lines 158–168, 240, and 246.

Calling these policies “helper-enforced” does not establish enforcement; a pure module that is never called is only a library of unused policy functions.

**Required correction:** name the production adapter and its owner task, add every wiring path to that task's `Files`, and add a real integration oracle that invokes the shipped coordinator/launcher/skill surface and proves transitions and gates flow through these modules. If the intended owner is prompt-only, the plan must instead say so and remove mechanical-enforcement claims.

### SOL-R2-M2 — The model profile is not a literal implementation contract and conflicts with the accepted pricing rule

**Affected text:** plan lines 30–42, 107–130, and 415; design lines 122–140.

The plan says Task 2 freezes a literal five-row fixture, but the table is prose rather than exact `Model`/provider JSON. In particular:

- “supports long cache retention”
- “adaptive thinking and eager tool input streaming”
- “none”

are not key/value records. Prime's actual compatibility keys are `supportsLongCacheRetention` and `supportsEagerToolInputStreaming` in `packages/ai/src/types.ts:330–350`. “Adaptive thinking” is not a compatibility field there; Prime derives adaptive Anthropic behavior from the model ID in `packages/ai/src/providers/anthropic.ts:743–762`.

The cited generated source rows do not contain compatibility objects at all:

- OpenAI: `packages/ai/src/models.generated.ts:8424–8459`
- Anthropic: `packages/ai/src/models.generated.ts:2219–2236` and `2289–2306`
- Google: `packages/ai/src/models.generated.ts:5078–5095`

Thus “replace only the source transport fields” conflicts with adding prose-only compatibility behavior not present in those rows. The exact nesting, omitted versus false values, and whether these are deliberate additions remain choices for the implementer.

The cost fields are also a direct design mismatch. The accepted design says to use zero cost metadata when proxy pricing is unknown (design line 130), but the plan copies nonzero provider prices without stating that the proxy uses those prices. This can make runtime cost/accounting evidence materially wrong.

**Required correction:** put the complete canonical JSON objects in the plan or a committed reviewed fixture, including every provider/model key, exact compatibility booleans, headers, costs, limits, input list, reasoning flag, and seven-level thinking map. Label every deliberate departure from the generated source. Use zero costs unless proxy pricing is explicitly known and frozen.

### SOL-R2-M3 — Protocol tasks violate the plan's own full-council diversity rule

**Affected text:** plan lines 14 and 54–70; design line 114.

The execution contract requires protocol tasks to receive Sol, Opus, and Gemini reviewer seats with an implementer outside the sealed Sol seat. The accepted design independently requires the full Sol/Opus/Gemini council for protocol work.

Task 2 defines native protocol roots, authentication behavior, provider registration, model wire profiles, compatibility behavior, and headers. Yet its matrix row uses Sol as implementer, Opus as primary, and Gemini as the only additional seat. There is no independent Sol reviewer, and the implementer is not outside the sealed Sol seat. Task 3 also registers providers through the extension API and has the same matrix shape.

This is an explicit internal contradiction. Moving other security/persistence tasks to Terra closed some round-1 diversity findings, but it did not close protocol review diversity.

**Required correction:** use a non-Sol implementer for Task 2 and any protocol-bearing portion of Task 3, with sealed Sol primary plus Opus and Gemini reviewers. Alternatively split protocol registration from non-protocol prompt/extension work and apply the full council to the protocol task.

### SOL-R2-M4 — The per-module red contract remains unsatisfied, and Task 10 is still too large

**Affected text:** plan lines 12–13, 228–250, and 301–324; design line 150.

The plan globally requires two reds for every introduced module: exact absence/import failure and an importable fail-closed behavioral assertion. It then groups modules without supplying module-specific oracles:

- Task 7 introduces `lib/run-registry.mjs` and `lib/launcher.mjs`, but supplies only one behavioral failure about a second coordinator.
- Task 10 introduces `lib/workflow-state.mjs`, `lib/ledger.mjs`, and `lib/policy-history.mjs`, but supplies only one behavioral failure about retry before a cancellation tombstone. There is no named fail-closed behavioral red for ledger persistence or policy-history enforcement.
- “First red is exact module absence” does not name which module, named subtest, expected status, or stable failure text when several modules are absent.

Task 10 also combines state-machine transitions, durable time restoration, RLM cancellation/retry reconciliation, concurrency-safe JSONL persistence, admission and review governance, severity concurrence, attribution, and the production outcome schema. That remains substantially larger than the accepted “bite-sized TDD tasks” requirement and can fail in multiple unrelated domains.

**Required correction:** split Task 10 at least into state/lifecycle, persistence, and review-governance/outcome tasks, with exact dependencies. For every introduced module, specify the exact first-red command, named failing subtest, stable failure substring, fail-closed stub state, behavioral-red command/signature, and independent green acceptance. Apply the same per-module treatment to Task 7.

### SOL-R2-M5 — The “exact implementation file manifest” still contains load-bearing placeholder paths

**Affected text:** plan lines 17, 50–52, 277–299, and 374–378.

Task 9's `Files` says:

> `their local prompt templates`

without naming those templates or their paths. Those files carry the dispatch/review role, immutable range, mutation, deadline, report, cwd, and parent-notification contracts. The acceptance test is expected to validate their exact tokens and link integrity, but the implementer must first invent the file names, number of templates, and references. The global rule then says no path outside the `Files` list may be modified, while the plan says the list is exact.

Task 13 similarly says “status lines in the design/plan” instead of naming the two files as modifiable paths. That phrase is less load-bearing than Task 9, but it confirms the manifest is not actually exact.

**Required correction:** enumerate every prompt-template path and every design/plan file Task 13 may edit. Include the intended link graph or which skill references each template. Do not use collective placeholders in a manifest that gates path ownership.

### SOL-R2-M6 — The real-runtime spike is source-feasible but not specified as an exact effective-runtime oracle

**Affected text:** plan lines 349–372; design lines 150 and 233–246.

The proposed spike is technically feasible in Prime 0.8.1:

- the extension loader accepts `.js` (`packages/coding-agent/src/core/extensions/loader.ts:464–465`);
- `before_agent_start` exposes `systemPromptOptions` and may return `systemPrompt` (`packages/coding-agent/src/core/extensions/types.ts:626–636,932–935`);
- the runner applies the hook result (`packages/coding-agent/src/core/agent-session.ts:930–990`);
- an explicit package `extensions: []` disables package extensions (`packages/coding-agent/src/core/package-manager.ts:1987–2001`);
- the public model-list command reaches a registry loaded before listing (`packages/coding-agent/src/main.ts:1589–1611`);
- runtime depth enforcement rejects excess nesting (`packages/coding-agent/src/core/agent-session.ts:10214–10216`).

Task 12 nevertheless freezes only one exact red: model listing. Its green bullets combine extension discovery, package collisions, settings precedence, root cwd, child prompt, grandchild rejection, and three native wire captures without specifying:

- exact Prime CLI invocations for each scenario;
- exact scripted mock responses and termination conditions;
- the session/output artifact that proves root and child cwd;
- how a real child is induced and how its effective prompt is observed;
- how a real grandchild attempt is induced and what exact rejection is captured;
- stable expected substrings/statuses and timeouts;
- a prohibition on substituting static file assertions for effective runtime assertions.

A test can therefore run the real binary for model listing and serializer requests while “verifying” the remaining claims from static settings/fixtures. That does not prove effective child behavior required by the design.

**Required correction:** freeze each runtime scenario as an executable transcript: exact command/cwd/environment, mock request/response sequence, expected process status, timeout, and captured artifact. Require the child-cwd/prompt and grandchild-rejection assertions to arise from an actual RLM execution path, not file inspection. Split the task if necessary to keep red/green evidence attributable.

## Minors

### SOL-R2-N1 — The toolchain prerequisite freezes Node but not the npm version needed by `npm ci`

**Affected text:** plan lines 82–105 and 388–394.

The local implementation environment currently has Node 20.20.1 and npm 10.8.2, so Node correctly fails the planned floor. Once Node is upgraded, however, the plan relies on `npm ci` without freezing a supported npm floor, package-manager identity, or an exact diagnostic. Node engine checks alone do not define npm behavior.

**Suggested correction:** state the supported npm range or pin it through `packageManager`, preflight it before installation, and add an exact failing fixture/diagnostic.

### SOL-R2-N2 — The Gemini “off” fixture value can be mistaken for the emitted reasoning-off wire

**Affected text:** plan lines 34–42, 121–130, and 363–370; design lines 132–138.

The seven-level profile correctly makes Gemini `off` explicit `null`, but Prime's Gemini 3.1 Pro reasoning-off path does not emit an absent/null thinking configuration. `packages/ai/src/providers/google.ts:417–433` emits `thinkingLevel: "LOW"` for Gemini 3.1 Pro because thinking cannot be fully disabled. The normal level mapper also groups minimal/low to `LOW` and medium/high to `HIGH` at lines 435–465.

Task 12 says to assert Gemini LOW/HIGH, but Task 2 says to cover “all thinking levels” without distinguishing profile clamp values from emitted wire values. A test author could incorrectly assert that `off=null` means no wire field.

**Suggested correction:** add an explicit emitted-wire truth table. For Gemini 3.1 Pro, state that profile `off=null` is the unsupported-level sentinel while a reasoning-off request is serialized as LOW, not omitted.

## Round-1 Blocker/Major closure audit

There were 25 prior Blocker/Major findings across the three independent reviews. Because several reviews found the same root causes, closure counts below are finding-by-finding rather than deduplicated: **15 closed, 8 partial, 2 open**.

### Gemini round 1

| Prior ID | Status | Round-2 determination |
|---|---|---|
| GEMINI-M1 | Closed | `scripts/gate` is now stage-aware and avoids literal unmatched globs (plan lines 20–28). |
| GEMINI-M2 | Closed | The undefined/decorative npm test script is removed from the gate contract (line 28). |

### Opus round 1

| Prior ID | Status | Round-2 determination |
|---|---|---|
| OPUS-B1 | Closed | Common gates are consolidated into the stage-aware `scripts/gate`. |
| OPUS-B2 | Partial | A real-binary Task 12 exists, but its effective runtime scenarios lack exact commands and observable oracles; see SOL-R2-M6. |
| OPUS-B3 | Closed | Task 8 now uses the real helper argument forms and temporary Git fixtures (lines 273–275). |
| OPUS-M1 | Closed | Task 1 owns checksum verification, and doctor exposes an explicit network verification mode. |
| OPUS-M2 | Closed | Task 1 uses Terra implementation, Opus primary, and Sol cross-family review. |
| OPUS-M3 | Closed | The original mixed launcher/security work is split and high-risk Tasks 5–7 have the full reviewer set. A separate current protocol-matrix defect remains in SOL-R2-M3. |
| OPUS-M4 | Partial | Most large tasks were split, but Task 10 remains multi-domain and oversized; see SOL-R2-M4. |
| OPUS-M5 | Partial | Named behavioral reds were added, but multi-module Tasks 7 and 10 do not satisfy the per-module contract; see SOL-R2-M4. |
| OPUS-M6 | Open | Pure modules are named, but no production consumer invokes them; see SOL-R2-M1. |
| OPUS-M7 | Partial | Task 0 now establishes a worktree and ledger, but its ignore/file-manifest requirements are impossible together; see SOL-R2-B1. |
| OPUS-M8 | Closed | Unsafe args, `.git/info/exclude`, `prime.cmd`, and related surfaces now have task owners. |
| OPUS-M9 | Closed | Task 12 covers real package installation and collision behavior. |
| OPUS-M10 | Closed | Task 3 names `before_agent_start`, `systemPromptOptions.rlmDepth`, and per-turn idempotent prompt selection. |
| OPUS-M11 | Closed | Task 10 defines the outcome schema and Task 13 requires the first outcome report. |

### Sol round 1

| Prior ID | Status | Round-2 determination |
|---|---|---|
| SOL-B1 | Closed | The broken repeated gate snippets were replaced with `scripts/gate`. |
| SOL-M1 | Partial | Behavioral reds are more specific, but multi-module tasks still lack per-module failure oracles; see SOL-R2-M4. |
| SOL-M2 | Open | Workflow ownership remains unwired; see SOL-R2-M1. |
| SOL-M3 | Partial | Launcher/worktree/policy work was split, but Task 10 remains oversized; see SOL-R2-M4. |
| SOL-M4 | Closed | Depth now chooses root versus universal child; validated dispatch prompts carry worker/reviewer policy. |
| SOL-M5 | Partial | A five-row table exists, but it is not literal JSON and conflicts with the design's cost rule; see SOL-R2-M2. |
| SOL-M6 | Closed | Task 8 now exercises the three helpers with their real interfaces. |
| SOL-M7 | Closed | Unsafe-argument ownership and first-production outcome evaluation are assigned. |
| SOL-M8 | Partial | Doctor/static/runtime responsibilities are better separated, but Task 12 does not freeze exact effective-runtime transcripts; see SOL-R2-M6. |

## Dependency and execution assessment

The high-level order is mostly coherent:

`toolchain → provider config → extension → launcher process → firewall → worktree → registry/launcher → vendoring/policy → workflow modules → doctor → runtime → docs/CI`

The source checks support the feasibility of the key Prime integration assumptions, and the Superpowers helper calls in Task 8 now match their real positional interfaces. The remaining execution failures are not primarily missing upstream capabilities; they are plan ownership and observability defects:

1. Task 0 cannot begin under its own manifest.
2. Task 10 cannot affect runtime under its own manifest.
3. Task 9 requires unnamed paths.
4. Task 12 does not define how to distinguish effective runtime behavior from static inspection.
5. Task 2 leaves exact model/provider objects to interpretation.

Until those are corrected, an implementer either must guess or can produce a green suite that does not establish the accepted design.

## Required re-review gate

Before implementation:

1. Resolve SOL-R2-B1.
2. Resolve all six Majors with plan edits, not implementation-time interpretation.
3. Recompute the plan hash and update the immutable baseline procedure.
4. Run another independent plan review against the same pinned source commits.
5. Start implementation only if that review reports **0 Blocker and 0 Major**.

