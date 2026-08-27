# Sol Plan Review — Round 3

**Artifact reviewed:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`  
**Accepted design:** `docs/specs/2026-08-26-prime-superpowers-design.md`  
**Prime Agent source:** commit `bc0fa7606abb3b7af0f765319518d255e6ae553d` (0.8.1)  
**Superpowers source:** commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0)  
**Prior reviews:** `docs/reviews/plan-sol-round-2.md`, `docs/reviews/plan-opus-round-2.md`  
**Reviewer:** Sol, fresh round-3 independent pass  
**Date:** 2026-08-27

## Verdict

**FAIL — implementation must not start.**

| Severity | Count |
|---|---:|
| Blocker | 4 |
| Major | 6 |
| Minor | 3 |

The gate requires zero Blocker and zero Major. The revision closes many round-2 findings, but it still contains four impossible execution contracts: the depth-lock input handler is unreachable on the supported interactive command path; Task 8 must edit two entry points forbidden by its manifest; Task 15 freezes a nonexistent JSON form of `model list`; and its direct-Prime package-negative case requires an error that Prime deliberately does not emit. The controller and all three effective-runtime transcript contracts also remain insufficiently frozen.

## Review method and pinned evidence

I read the complete current plan, complete design, and both round-2 reports; checked the working-tree diff that produced the current revision; traced every task dependency and every task `Files` list; and inspected the pinned Prime and Superpowers source directly.

Pinned-source facts used below:

- Prime `HEAD` is exactly `bc0fa7606abb3b7af0f765319518d255e6ae553d`; Superpowers `HEAD` is exactly `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`.
- Prime's public model command is `model list [search]`; `listModels()` prints a text table and has no JSON output mode (`packages/coding-agent/src/cli/command-registry.ts:151-164`, `cli/list-models.ts:16-101`, `cli/public-command.ts:318-339`).
- Extension `input` handlers exist (`core/extensions/types.ts:749-766`, `core/extensions/runner.ts:1045-1077`), but interactive built-in slash commands are consumed in `interactive-mode.ts` before text is submitted to the session. `/rlm-max-depth` is handled locally at `interactive-mode.ts:4731` and calls `setRlmMaxDepth`; the extension input path is reached only later through `AgentSession.submit()` (`core/agent-session.ts:4425`).
- Persisted chat depth has highest precedence over inherited/global/environment depth (`core/agent-session.ts:1553-1590`), and `setRlmMaxDepth` immediately appends `rlm_max_depth_state`, changes the live depth, and optionally rewrites global settings (`core/agent-session.ts:11144-11182`).
- Missing git packages are intentionally skipped when offline or when missing-source resolution returns skip (`core/package-manager.ts:1193-1251`). Resource resolution then continues with the reduced resource set (`core/package-manager.ts:849-906`). Prime has no kit-specific `E_PACKAGE_UNRESOLVED` diagnostic.
- The three upstream SDD helpers do accept the argument forms now stated in Task 9. `sdd-workspace PLAN_FILE` creates `.superpowers/sdd/.gitignore`; `task-brief PLAN_FILE N OUTFILE` and `review-package PLAN_FILE BASE HEAD OUTFILE` are correct in v6.3.0.

## Blockers

### SOL-R3-B1 — The planned `/rlm-max-depth` interception cannot run on the real interactive path

**Affected text:** plan lines 162, 165, 284, 399-406, and 432-439; design lines 168 and 240.

Task 3 says an extension `input` handler consumes every `/rlm-max-depth` form and that this “prevents persisted or `--global` depth mutation through the supported interactive command.” That is false for Prime 0.8.1.

The TUI parses and handles recognized slash commands before submitting ordinary input to `AgentSession`. At `interactive-mode.ts:4731`, `/rlm-max-depth` is consumed locally and `handleRlmMaxDepthCommand()` calls the agent connection's depth mutation API. The extension's `input` handlers run only through `AgentSession.submit()` at `agent-session.ts:4425`, so they never see the built-in command. A unit fixture that invokes the extension handler directly can pass while the real TUI bypasses it.

The consequence is load-bearing: during a live session an operator or prompt can set depth two, persist the override in the transcript, and admit a grandchild before any later attach-time check runs. Copying the agent-home template per run protects the tracked template but does not prevent this live or persisted session override. Task 17 tests a prebuilt retained-session fixture, not the supported interactive mutation that creates it.

**Required correction:** remove the impossible interception claim and design an effective control on the actual connection/session path. Since this kit cannot patch Prime, viable choices are to make workflow mode non-interactive on a controlled RPC/daemon surface that denies `set_rlm_max_depth`, or explicitly treat depth-one as prompt/operator policy and stop claiming mechanical prevention. Add a real-runtime transcript that submits `/rlm-max-depth 2` through the supported client surface and proves the mutation is rejected before it changes live state or transcript state.

### SOL-R3-B2 — Task 8 cannot wire the entry points without violating its exact `Files` manifest

**Affected text:** plan lines 17, 52-54, 265-288.

Task 4 creates `prime` and `prime.cmd` and requires both to fail closed with `E_NOT_COMPOSED`. Task 8 then requires:

> Replace Task 4's `E_NOT_COMPOSED` entry-point branch with calls to this controller.

But Task 8's `Files` list does not include either `prime` or `prime.cmd`; it lists only `lib/launcher.mjs`, `scripts/install-superpowers-package`, tests, fixtures, and `tests/test-package.sh`. The global contract forbids modifying a path outside the task's list, and the plan declares itself the exact implementation manifest. There is no execution that both wires the controller into both entry points and obeys the manifest.

**Required correction:** add `prime` and `prime.cmd` to Task 8's `Files`, specify the exact adapter invocation each one changes to, and add separate assertions that the POSIX and WSL paths no longer contain or return the pre-composition branch.

### SOL-R3-B3 — Task 15 freezes a Prime command/output contract that does not exist

**Affected text:** plan lines 405-408.

Task 15's exact command is:

```bash
env PRIME_AGENT_CODING_AGENT_DIR="$RUN_HOME" PRIME_AGENT_TELEMETRY=off PI_CACHE_RETENTION=long "$PRIME_BIN" model list --json
```

Prime 0.8.1 supports `model list [search]`, not `model list --json`. `rewriteNestedCommand()` forwards options into the internal argument parser, but `listModels()` always emits a formatted text table. There is no JSON branch for this command. Other public commands accept `--json`; model list does not.

The stated command therefore cannot produce the machine-readable model/resource inventory on which Task 15 relies. Even if `--json` is tolerated as an extension flag, the output remains a text table, not JSON.

**Required correction:** use the real `model list` text contract and freeze exact table parsing, or add a separate kit-owned adapter that imports/executes a supported Prime API and emits a versioned JSON schema. The corrected task must state the exact command, stdout schema, status, timeout, and failure signature.

### SOL-R3-B4 — Task 15's direct-Prime package-negative case cannot emit `E_PACKAGE_UNRESOLVED`

**Affected text:** plan lines 283, 403-408; design lines 92-94 and 223-225.

Task 8 can make the kit launcher fail closed by resolving and verifying the package before spawning Prime. Task 15, however, invokes the absolute Prime binary directly. It then removes the package cache, denies network, and requires the direct invocation to fail with the kit-defined `E_PACKAGE_UNRESOLVED`.

Prime's package manager does the opposite: in offline mode a missing git package returns `false`, the resolver executes `continue`, and startup proceeds with the package resources absent. No Task 15 product file is on the direct binary's pre-resource path, and the extension cannot infer a complete effective package inventory during `model list`. Thus the required error has no emitter.

**Required correction:** run this negative case through the Task 8 launcher/package preflight and assert that Prime is never spawned, or install a genuine fail-closed extension/adapter on a path known to execute before every relevant Prime command and prove that path in source and runtime. Do not require a direct upstream binary to invent a kit error.

## Majors

### SOL-R3-M1 — The controller owner is named, but its module and wire interfaces are still not specified

**Affected text:** plan lines 258, 348, 360, 372, and 376-391; design lines 144-170.

This revision correctly adds `lib/workflow-controller.mjs` and `scripts/workflow-controller`, closing the “unused pure modules” shape of SOL-R2-M1. It does not freeze the interfaces needed to wire them.

- Task 11 says “export pure transitions” but names no functions, argument records, return records, or error types.
- Task 12 says “export schema-versioned create/read/append functions” but gives no function names or record schemas.
- Task 13 names no exports at all.
- Task 14 says to invoke the “exact Task 11-13 module exports,” although no exact exports exist.
- The CLI operations `resolve`, `admit`, `poll`, `progress`, `cancel`, `retry`, `receive-report`, `open-review`, `record-finding`, `rule`, and `close-review` have no argv grammar, stdin JSON schema, stdout JSON schema, exit-code table, idempotency key, or transactional failure contract.
- “Emit Prime-ready Python snippets” does not define how the observed result is returned, authenticated to the pending operation, or atomically reconciled with ledger persistence.

An implementer must invent the controller protocol and can create mutually incompatible module/CLI/tests while satisfying prose-level assertions. The adapter can also acknowledge a transition before the ledger write unless the ordering and crash semantics are concrete.

**Required correction:** add exact TypeScript/JSDoc signatures for every Task 11-13 export and a versioned JSON request/response/error schema for every controller operation. Freeze operation IDs, attempt IDs, report digests, before/after state, ledger append ordering, idempotent replay behavior, and exit codes. Add one composition test that kills the controller between RLM observation and ledger acknowledgement and proves deterministic recovery.

### SOL-R3-M2 — The per-run agent-home change contradicts the accepted design without an architecture amendment

**Affected text:** design lines 30, 37-40, and 92; plan lines 52-54, 165, and 281-284.

The accepted design says the launcher sets `PRIME_AGENT_CODING_AGENT_DIR` to committed `<kit>/agent-home`. The plan now correctly recognizes that this is a runtime write target and instead copies the template into `.state/runs/<run-id>/agent-home`. That is a material runtime architecture change, yet the “Accepted layout amendment” says there are no runtime architecture changes.

The new approach is safer and is the right direction, but a plan cannot silently supersede an accepted architecture while claiming it does not. It also leaves unspecified whether package caches, sessions, auth, logs, and daemon sockets are all rooted in the per-run home and how attach/status/stop recover that exact root after launcher restart.

**Required correction:** amend the design explicitly to define committed agent-home as an immutable template and the per-run copy as the only runtime home. Freeze which Prime paths live under it, which are copied versus freshly created, the byte-identity boundary, permissions, symlink policy, and reuse rules for attach/status/stop.

### SOL-R3-M3 — Task 15's “real packaged-runtime” oracle does not expose most of the properties it claims to assert, and its behavioral red is not attributable

**Affected text:** plan lines 393-408.

Even after correcting `--json`, `model list` exposes models only. It does not expose package minimum skills, local override winners/losers, filtered package extensions, root cwd, effective depth source, or tracked-template byte identity. The plan says to save an “effective resource inventory” but names no command/API that produces it and does not prohibit substituting static filesystem inspection for runtime-loaded resources.

The prescribed behavioral red—`selector ... not found`—is also not attributable to Task 15. Provider registration was implemented and tested in Tasks 2-3. With correct setup, the model should already be listed before Task 15 adds any product behavior; with incorrect setup, the red diagnoses a bad test harness rather than a missing Task 15 implementation.

**Required correction:** split the oracles by observable surface. Use the real model command only for selectors. Use a real session/RPC diagnostic or a purpose-built extension report for effective loaded skills, collision winners, extension filters, cwd, and depth source. State the exact pre-Task-15 failure that the Task 15 implementation changes; do not manufacture red by omitting required setup.

### SOL-R3-M4 — Task 16 still lacks an exact native-wire transcript contract

**Affected text:** plan lines 410-424; design lines 237-241; SOL-R2-M6 and PLAN-OPUS-R2-B2.

The task is much better scoped than round 2, but “serve valid terminating streams” is still a placeholder for the central compatibility proof. The plan does not freeze:

- the exact Prime argv for each dialect, including selector, effort, mode, prompt, cwd, and session choice;
- the exact environment per case and which cache-beta opt-in/opt-out cases run;
- literal OpenAI SSE, Anthropic SSE, and Google streaming response frames, content types, terminators, and tool-free final message;
- how retries are disabled or counted;
- a versioned transcript JSON schema, canonical header casing/redaction, raw-body preservation, request-count expectations, and digest rules;
- exact expected body paths/values for all seven profile levels versus only role-dispatch levels;
- failure statuses/substrings for malformed path, auth, response dialect, timeout, and unsupported effort.

A fixture author still has to discover and choose the protocol, and a permissive mock can accept a malformed request and terminate successfully. “Inspect the three transcript artifacts” is not a machine-checkable acceptance contract.

**Required correction:** include literal response fixtures (or exact checked-in fixture filenames plus their full required JSON/SSE content), exact invocation tables, and a transcript schema. Require strict servers that reject unexpected method/path/header/body/request count before serving success. Name each TAP subtest and its stable failure code.

### SOL-R3-M5 — Task 17 still lacks an exact RLM request/response and kernel-event transcript contract

**Affected text:** plan lines 426-441; design lines 162-170 and 240; SOL-R2-M6 and PLAN-OPUS-R2-B2.

Kernel/tool installation is now assigned to Task 1, which closes the clean-run prerequisite. The actual child scenario remains underspecified. The plan does not provide:

- the exact Prime command, root prompt, selector/effort flags, session mode, and environment;
- the literal coordinator Responses API frames that invoke `ipython`;
- the exact Python cell that calls `scripts/workflow-controller`, consumes its emitted snippet, executes `rlm.run`, and reports the observed handle back;
- the literal child response frames/cell that writes the report and imports/calls `agent_message`;
- the exact parent continuation and termination frames;
- the kernel/controller/registry/ledger transcript schemas and correlation IDs joining one attempt across them;
- stable expected values for child handle, depth source/value, report digest, notification receipt, terminal state, deletion tombstone, and grandchild rejection;
- what “bounded reconciliation” means in poll count and elapsed fake/real time.

Without these, the fixture and implementation can collude. In particular, a file containing `CHILD_CONTRACT` and the worktree string does not prove those values came from the child's effective prompt/cwd unless the transcript links the actual child request, tool call, kernel session, report inode/digest, and parent notification.

**Required correction:** freeze the full scripted sequence as literal provider frames and versioned transcript records, with exact correlation keys and negative assertions. Add a strict assertion that the child-reported prompt marker is derived from the actual child request's system instructions, not copied from the fixture, and that the cwd is observed inside the child kernel process.

### SOL-R3-M6 — Task 0's baseline operation remains outside its manifest and does not freeze a clean starting tree

**Affected text:** plan lines 9-18 and 79-87.

Adding `.superpowers/sdd/.gitignore` closes SOL-R2-B1's direct contradiction. But Task 0 also says to “commit the approved specs/reviews as the immutable baseline” while its `Files` list contains only the two ignored orchestration paths. In the actual starting tree, the current plan is modified and `docs/reviews/plan-opus-round-2.md` is untracked. Creating the baseline necessarily stages/commits paths absent from Task 0's exact manifest.

Task 0 acceptance checks only that `.superpowers/sdd` is hidden; it does not require the repository to be otherwise clean, record the baseline tree hash, enumerate the committed approved docs, or ensure the external worktree starts at that exact baseline commit. This can make `BASE..HEAD` include review/plan setup or omit an approved review.

**Required correction:** list every baseline document path Task 0 may add/commit, require a clean status before creating the external worktree (except the ignored ledger), record baseline commit and tree hash, and assert the worktree `HEAD` and ledger starting commit equal that baseline. If baseline preparation is pre-execution rather than Task 0, remove it from Task 0 and state the precondition explicitly.

## Minors

### SOL-R3-N1 — “Exact manifest” still uses open-ended fixture directories

Tasks 1, 2, 6, 7, 12-15, 17, and others list directories such as `tests/fixtures/gate/` or `tests/fixtures/rlm-responses/` rather than exact files. Directory ownership can be a valid policy, but it is not an exact file manifest and does not tell a task worker which fixtures must exist. Either rename the claim to an exact path-ownership manifest or enumerate the fixture files, especially literal protocol fixtures.

### SOL-R3-N2 — Several first-red statements remain less exact than the execution contract

Tasks 2-6 say only “First red is exact module absence”; Task 9 says “exact missing directory”; Task 10 says “exact skill absence.” They do not consistently state the named subtest, exit status, and stable failure substring required by lines 12-13. The behavioral reds are generally much better. Add the missing absence signatures or narrow the global evidence rule.

### SOL-R3-N3 — Task 18's CI version language is not frozen

Task 18 pins Node 22.8.0 for one job but says “current supported LTS” for another. That value changes over time and conflicts with a reproducible implementation plan. Freeze an exact second Node version or state that it is an intentionally floating compatibility job excluded from the immutable acceptance baseline.

## Round-2 Blocker/Major closure audit

### Sol round 2

| Finding | Round-3 status | Evidence |
|---|---|---|
| SOL-R2-B1 Task 0 ignore manifest | **Partially closed; residual Major M6** | `.superpowers/sdd/.gitignore` is now listed with exact content and direct creation. Baseline docs remain outside the manifest and starting-tree cleanliness is not frozen. |
| SOL-R2-M1 no shipped runtime owner | **Partially closed; residual Major M1** | Task 14 adds a controller and skill wiring, but module exports and CLI protocol are not exact. |
| SOL-R2-M2 nonliteral model profile/pricing | **Closed** | Literal compat objects, zero proxy costs, exact record fields, provider object shape, and ID-derived Anthropic adaptation are now stated. |
| SOL-R2-M3 protocol council diversity | **Closed** | Tasks 2-3 use Terra with sealed Sol plus Opus and Gemini. |
| SOL-R2-M4 multi-module reds/oversized core | **Closed** | Registry/composition and lifecycle/ledger/governance are split; each module task has a named import and behavioral red. |
| SOL-R2-M5 placeholder prompt paths | **Closed for load-bearing product paths** | Task 10 enumerates every new prompt path and both modified skills; open-ended test-fixture directories remain Minor N1. |
| SOL-R2-M6 effective-runtime oracle | **Not closed; Majors M3-M5 and Blockers B3-B4** | Tasks 15-17 are split, but static, wire, and RLM contracts are not exact; Task 15's exact command and package negative are impossible. |

### Opus round 2

| Finding | Round-3 status | Evidence |
|---|---|---|
| PLAN-OPUS-R2-B1 unreachable Task 1 red | **Closed** | Task 1 now uses reachable spawn `ENOENT`/named-subtest absence and a separate behavioral red. |
| PLAN-OPUS-R2-B2 missing kernel/scripted child fixture | **Partially closed; residual Major M5** | Task 1 installs/verifies kernel, `rg`, and `fd`; Task 17 names a scripted proxy but still omits literal frames and event contracts. |
| PLAN-OPUS-R2-B3 Task 13 test-package edit missing | **Closed** | Current Task 18 lists `tests/test-package.sh` and explicitly adds TAP assertions first. |
| PLAN-OPUS-R2-M1 untested gate | **Closed** | Task 1 adds `tests/gate.test.mjs`, fixtures, named behavioral reds, and machine-readable suite-state assertions. |
| PLAN-OPUS-R2-M2 prose compat | **Closed** | All allowed compat objects are literal; Gemini compat is absent; adaptive Anthropic behavior is explicitly ID-derived. |
| PLAN-OPUS-R2-M3 nonzero unknown proxy costs | **Closed** | All costs are frozen to zero. |
| PLAN-OPUS-R2-M4 Task 4 missing Gemini seat | **Closed** | Task 4 now receives Sol, Opus, and Gemini review seats with Terra implementation. |
| PLAN-OPUS-R2-M5 three modules/one red | **Closed** | Tasks 11-13 are split with separate tests and behavioral signatures; Task 7 registry and Task 8 composition are also split. |
| PLAN-OPUS-R2-M6 mutable tracked home/depth override | **Not closed; Blocker B1 and Major M2** | Per-run copying closes tracked-template mutation. The proposed slash-command interception is unreachable, and the design was not amended for the new runtime-home architecture. |
| PLAN-OPUS-R2-M7 silent missing package | **Partially closed; Blocker B4** | Launcher preflight now claims fail-closed verification, but Task 15 bypasses it and requires impossible fail-closed behavior from direct Prime. |
| PLAN-OPUS-R2-M8 final status invalidates plan hash | **Closed** | Status edits are after zero-major final council, in a separate orchestration-only commit outside the reviewed range, with both hashes and one-line diff recorded. |

## Dependency-order assessment

The numbered implementation order is mostly coherent:

- Task 3 transitively receives Task 2 configuration; Task 4 receives Task 1 toolchain and Task 3 extension; Tasks 5-7 layer firewall, worktree, and registry; Task 8 composes them.
- Task 10 depends on Task 9 vendoring; Task 11 depends on registry and workflow contracts; Tasks 12-13 serialize after lifecycle; Task 14 depends on launcher plus all policy modules; Tasks 15-17 serialize static runtime, wires, then child lifecycle; Task 18 waits for all.
- Task 14's dependency on Task 9 is correctly transitive through Task 10.

The graph has one manifest-level break rather than a dependency break: Task 8 owns composition but is forbidden to edit the Task 4 entry points (B2). The execution contract also says one numbered task at a time, so Task 9's nominal dependency only on Task 3 does not permit it to run before Task 8 in the prescribed execution; nevertheless, expressing `Depends on: Tasks 3 and 8` would make the graph match the mandatory sequence and the runtime-home copy that later consumes the vendored overrides.

## Exact file-manifest assessment

The revision substantially improves path ownership: all Task 10 prompt paths are explicit, `tests/test-package.sh` is present where Task 18 needs it, and the two orchestration status files are named in the post-council rule. It still fails its “exact implementation file manifest” claim because:

1. Task 8 omits the two entry points it must edit (Blocker B2).
2. Task 0 performs a baseline commit over docs absent from its list (Major M6).
3. Multiple fixture directories are open-ended rather than exact files (Minor N1).
4. The separate post-council status commit is outside numbered-task manifests. This is acceptable only because it is explicitly orchestration-only; the plan should state that line 17's task-path restriction does not apply to that separately enumerated two-file commit.

## Red/green reachability assessment

Positive closures:

- Task 1's spawn `ENOENT` is reachable and correctly replaces the impossible ESM error.
- `scripts/gate` now has its own fail-open behavioral red.
- Tasks 7-8 and 11-14 have separated module absence and behavioral assertions.
- Task 18's TAP-first missing-document red is reachable.

Remaining problems:

- Task 3's depth-lock unit green cannot become a real-runtime green because the TUI bypasses the extension handler (B1).
- Task 15's selector behavioral red is not attributable to Task 15 and its exact invocation is invalid (B3/M3).
- Task 15's package-negative green is impossible on the direct upstream command (B4).
- Tasks 16-17 can create a harness red by initially omitting invocation/script steps, but without literal fixture contracts the red and green remain self-authored rather than independent protocol oracles (M4-M5).

## Runtime, controller, immutable-home, package, and transcript conclusions

- **Actual runtime feasibility:** The basic extension/provider/kernel/RLM path is source-feasible. The specific Task 3 depth control and Task 15 static command/package-negative path are not.
- **Controller wiring:** A production adapter now exists in the plan, but its module signatures and request/response transaction protocol are unspecified (M1). This is not yet an executable handoff between independent task workers.
- **Per-run immutable agent home:** The copy-on-run architecture correctly avoids tracked settings mutation and is a major improvement. It does not stop live chat depth mutation and is not reflected in the accepted design (B1/M2).
- **Package fail-closed behavior:** Launcher-side preflight is feasible in principle. Direct Prime remains fail-open by upstream design; Task 15 must test the launcher boundary rather than bypass it (B4).
- **Static transcript:** Invalid command and missing observability for resources/cwd/depth (B3/M3).
- **Native-wire transcript:** Dialects and high-level assertions are named, but exact argv, literal response frames, strict server behavior, and transcript schema are absent (M4).
- **RLM transcript:** The scenario is credible, but literal coordinator/child frames, Python cells, correlation IDs, kernel/controller/ledger schemas, and bounded reconciliation values are absent (M5).

## Required re-review gate

Do not begin implementation. Revise the plan and, where necessary, the accepted design, then obtain a fresh independent review. At minimum the next revision must:

1. Replace the unreachable slash-command interception with a control on the real supported client/session path, or downgrade the guarantee honestly.
2. Add `prime` and `prime.cmd` to Task 8.
3. Replace `model list --json` with a real, exact observable contract.
4. Route package-negative verification through the kit launcher/preflight, not direct Prime.
5. Freeze Task 11-14 module signatures and controller JSON/exit/crash protocol.
6. Amend the design for immutable per-run agent homes.
7. Specify literal static/wire/RLM commands, fixtures, event sequences, schemas, correlation, timeouts, statuses, and failure signatures.
8. Repair Task 0 baseline ownership and clean-tree invariants.

**Final gate: 4 Blockers, 6 Majors, 3 Minors — FAIL.**
