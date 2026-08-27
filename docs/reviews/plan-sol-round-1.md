# Sol Implementation-Plan Review — Round 1

**Artifact reviewed:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`  
**Accepted design baseline:** `docs/specs/2026-08-26-prime-superpowers-design.md`, after `design-sol-round-6.md` reached zero Blocker/Major  
**Local runtime baselines:** Prime Agent 0.8.1 at `bc0fa7606abb3b7af0f765319518d255e6ae553d`; Superpowers v6.3.0 at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`  
**Disposition:** **Do not implement yet — 1 Blocker, 8 Majors**

## Review method

I checked the plan task-by-task against the accepted design and the local Prime Agent/Superpowers sources. The review covered task order, task size, exact files and commands, expected-red signatures, dependency sequencing, executable test oracles, and places where an implementer would have to choose load-bearing behavior not frozen by the plan.

Severity used here:

- **Blocker:** the numbered sequence cannot pass its own mandatory gate as written.
- **Major:** implementation can proceed only by guessing a load-bearing contract, or the stated acceptance test can pass without verifying an accepted-design guarantee.
- **Minor:** a bounded clarity or coverage defect that does not invalidate the sequence.

## Finding summary

| ID | Severity | Area | Result if ignored |
|---|---|---|---|
| SOL-PLAN-R1-B1 | Blocker | Common gates / task order | Task 1 cannot complete, so no later task is reachable under the execution contract |
| SOL-PLAN-R1-M1 | Major | Red signatures | A generic missing-file failure can be mistaken for the intended behavioral red |
| SOL-PLAN-R1-M2 | Major | Task 7 ownership/testability | Lifecycle and governance behavior can be “tested” by a disconnected simulation or invented runtime |
| SOL-PLAN-R1-M3 | Major | Task size/dependency sequencing | Tasks 4 and 5 exceed a reviewable TDD unit and Task 7 reopens already accepted surfaces |
| SOL-PLAN-R1-M4 | Major | Child prompt selection | `rlmDepth` distinguishes root from child, not worker from reviewer |
| SOL-PLAN-R1-M5 | Major | Provider/model contract | Required model limits and compatibility values are not frozen to a named pinned profile |
| SOL-PLAN-R1-M6 | Major | Superpowers helper command | The stated `sdd-workspace --help` acceptance command fails against v6.3.0 |
| SOL-PLAN-R1-M7 | Major | Accepted-design coverage | The unsafe escape hatch and first-production outcome evaluation have no implementation task or test |
| SOL-PLAN-R1-M8 | Major | Doctor/wire acceptance | The command lacks a credential-free fixture contract and the wire test need not exercise Prime’s real native serializers |

## Blocker

### SOL-PLAN-R1-B1 — The mandatory common gate references `prime` three tasks before it exists

- **Evidence**
  - The execution contract says every task runs `bash -n prime scripts/* tests/*.sh` and that absence is tolerated only “in the task that introduces” the file (`implementation plan:16-27`).
  - Task 1 creates `scripts/bootstrap-toolchain` and `tests/test-package.sh`, but `prime` is not created until Task 4 (`implementation plan:29-37, 133-140`).
  - A skeleton containing exactly Task 1’s listed shell files makes this command fail with `bash: prime: No such file or directory` and exit 127.
- **Location:** Common gates, lines 16-27; Task 1 files, lines 33-37; Task 4 files, lines 137-140.
- **Concrete failure:** Task 1’s workflow worker cannot produce a passing gate run. Line 13 forbids advancing after a failed gate, so Tasks 2-8 are unreachable without violating the plan.
- **Correction:** Make the gate stage-aware and exact. For Tasks 1-3 run:

  ```bash
  bash -n scripts/bootstrap-toolchain tests/test-package.sh
  ```

  Starting with Task 4 add `prime`; starting with Task 6 add `scripts/doctor`. Prefer an explicit file list or a checked helper such as `bash tests/test-syntax.sh` rather than globs over not-yet-created paths. State the expected file-absence rule per task, not globally.

## Major findings

### SOL-PLAN-R1-M1 — None of the tasks has the expected red signature required by the accepted design

- **Evidence**
  - The accepted design requires each breakdown item to contain an “expected red signature” (`design:142-155`, especially line 150).
  - Every Red section instead gives a class of causes: “module missing,” “extension missing,” “probes missing,” or “fixture not wired” (`implementation plan:38-44, 72-78, 109-115, 142-148, 181-187, 215-221, 248-254, 280-286`).
  - No task gives an assertion name, TAP `not ok` line, diagnostic substring, or expected exit code.
- **Location:** All eight Red sections.
- **Concrete failure:** A syntax error, import error, missing fixture, or wrong test path satisfies the prose just as well as the intended behavioral failure. The worker can record a meaningless red and still claim red-before-green compliance.
- **Correction:** Give every task one deterministic first-red oracle: exact command, expected nonzero exit code, named failing subtest, and a stable diagnostic/assertion substring. Once a prerequisite file exists, require the red to reach the intended assertion rather than failing during module loading. Split multi-behavior tasks so each newly introduced behavior has its own red.

### SOL-PLAN-R1-M2 — Task 7 has no product component that owns the lifecycle state machine it claims to test

- **Evidence**
  - Task 7 lists only a test and fixtures, then permits unspecified changes to “launcher, skills, and helpers” (`implementation plan:239-247`).
  - Its required behavior includes queued/running deadlines, cancellation confirmation, cleanup failure, retry exclusion, report quarantine, parent-loss orphaning, sealed finding sets, downgrade concurrence, admissions ceilings, and policy history (`implementation plan:256-262`).
  - In the accepted design these are coordinator workflow rules implemented through prompts/skills and Prime RLM operations (`design:142-172`), not launcher behavior.
  - Prime’s real RLM API is asynchronous and session-bound: `rlm.run()` returns an admission handle, while `rlm.list_subagents()` and `rlm.delete_subagent()` operate on the current parent registry (`prime-agent-runtime/src/rlm/__init__.py:81-175`). There is no kit runtime module named in Tasks 1-6 that exposes the Task 7 transitions.
- **Location:** Task 7, lines 239-268; dependency on Task 5’s prompt policy, lines 168-204.
- **Concrete failure:** An implementer must either (a) invent a new workflow engine under an unspecified “helper,” changing the accepted prompt-orchestration architecture, or (b) write a fake state simulation disconnected from Prime and let all Task 7 acceptance claims pass without testing the shipped workflow.
- **Correction:** Before implementation, choose and freeze the ownership boundary. A viable correction is to add a dedicated, pure `lib/workflow-state.mjs` (or named equivalent) with exact transition functions, persisted schema, clock/cancellation adapters, and a fake Prime-RLM adapter; make the skills call that contract. Break Task 7 into focused state-transition, persistence/reattach, and review-governance tasks. If policy intentionally remains prompt-only, replace the “end-to-end” claim with contract tests plus one explicit live Prime fixture gate, and state which guarantees cannot be proved offline.

### SOL-PLAN-R1-M3 — Tasks 4 and 5 are not bite-sized TDD tasks, and Task 7 retroactively reopens both

- **Evidence**
  - Task 4 combines argument parsing/firewalling, repository discovery, worktree and branch creation, environment construction, process spawning, signal/exit forwarding, run locking, persistence, and four public commands in three product files (`implementation plan:133-166`).
  - Task 5 combines two whole-directory upstream overrides, provenance, four workflow policies, several vendored scripts/templates, model routing, timeout/cancellation policy, admissions, review governance, and final-review localization (`implementation plan:168-204`).
  - Task 7 then authorizes further launcher/skill/helper edits after those tasks have passed review (`implementation plan:243-247`).
  - The accepted workflow requires one bounded task at a time and a review over that task’s immutable `BASE..HEAD` range (`design:150-155`).
- **Location:** Tasks 4, 5, and 7.
- **Concrete failure:** One red test cannot localize failures across these independent concerns; review packages become too broad for reliable attribution; Task 7 can invalidate Task 4/5 review closure without a declared dependency-specific re-review.
- **Correction:** Split Task 4 at least into (1) pure CLI parser/firewall, (2) target/worktree resolution, (3) process launch/signal forwarding, and (4) persistent run-state management commands. Split Task 5 into (1) pinned vendoring/provenance/link integrity, (2) Prime tool-contract adaptation, (3) dispatch/model policy, and (4) SDD lifecycle/review policy. Move lifecycle implementation before its focused tests, and state `Depends on:` plus the exact prior acceptance surface for every task.

### SOL-PLAN-R1-M4 — Task 3 asks the extension to infer worker versus reviewer from a value that carries no role

- **Evidence**
  - Task 3 says children receive “role-appropriate worker/reviewer contracts based on `rlmDepth`” (`implementation plan:119-123`).
  - Prime’s `BuildSystemPromptOptions` exposes `rlmDepth`, parent identity, cwd, tools, and loaded resources, but no worker/reviewer role (`prime-agent/packages/coding-agent/src/core/system-prompt.ts:10-37`).
  - `SessionStartEvent` likewise contains only start reason and previous session file (`prime-agent/packages/coding-agent/src/core/extensions/types.ts:489-497`).
  - RLM spawn accepts an arbitrary prompt and optional kwargs/name/model/thinking; its handle records child ID, name, session directory, and model, not a typed role (`prime-agent-runtime/src/rlm/__init__.py:14-21, 81-112`).
- **Location:** Task 3 Green behavior, lines 117-123.
- **Concrete failure:** Depth can safely select coordinator versus child, but cannot select worker versus reviewer. Any implementation that parses free-form prompt text or child names invents an unauthenticated role protocol; a reviewer can receive mutation instructions or a worker can receive a read-only contract.
- **Correction:** Either define one universal child contract containing both role-neutral Prime tool mechanics and require each dispatch prompt to carry the worker/reviewer policy, or introduce an exact validated role marker in every RLM prompt/name and specify its grammar, collision handling, default/failure behavior, and tests. Do not state that `rlmDepth` selects the child role.

### SOL-PLAN-R1-M5 — The plan requires “complete” role-model records without freezing their load-bearing numeric and compatibility values

- **Evidence**
  - Task 2 requires five complete role-model records and “full required model metadata” tests but supplies no context-window, maximum-output, or exact compatibility values (`implementation plan:80-97`).
  - Prime’s provider API requires `reasoning`, `input`, `cost`, `contextWindow`, and `maxTokens`; `compat` and `thinkingLevelMap` control wire behavior (`prime-agent/packages/coding-agent/src/core/extensions/types.ts:1186-1244`).
  - The accepted design says these limits and compatibility flags are fixed and retained across aliases, but also gives no numbers (`design:130-140`).
  - The local Prime 0.8.1 generated catalog contains these IDs under multiple provider profiles (`models.generated.ts`, including direct-ID occurrences at lines 2220, 2290, 2876, 2894, 4553, 4819, 4838, and 5079). The plan neither names the authoritative provider/profile row nor says which fields must be copied and which are deliberate proxy overrides.
- **Location:** Task 2 Green/Acceptance, lines 80-97; accepted design provider/model section, lines 122-140.
- **Concrete failure:** Different implementers can choose different `contextWindow`, `maxTokens`, and `compat` values while passing self-authored tests. Wrong values can truncate work or change OpenAI storage/reasoning and Anthropic eager-tool/cache wires.
- **Correction:** Add a literal five-row profile table to the plan (or a named committed fixture) containing every `ProviderModelConfig` field: IDs, names, API, input, reasoning, cost, context window, max tokens, thinking map, and every compatibility key/value. Cite the source for each nonzero/behavioral value. Make the tests compare the exported records to this frozen fixture rather than values invented in the test.

### SOL-PLAN-R1-M6 — Task 5’s exact helper acceptance command contradicts the pinned v6.3.0 helper

- **Evidence**
  - Task 5 requires `bash agent-home/skills/subagent-driven-development/scripts/sdd-workspace --help` (`implementation plan:197-202`).
  - The pinned script’s usage is `sdd-workspace PLAN_FILE`; it has no `--help` branch and treats `--help` as a plan path (`superpowers@v6.3.0:skills/subagent-driven-development/scripts/sdd-workspace:21-28`).
  - Running the pinned helper with `--help` exits 2 and prints `no such plan file: --help`.
  - Task 5 says to copy required scripts and adapt “the two overriding skill bodies,” not to change helper CLI behavior (`implementation plan:189-195`).
- **Location:** Task 5 Green behavior and Acceptance, lines 189-202.
- **Concrete failure:** A faithful vendored helper fails acceptance. Making it pass silently creates an unplanned fork whose hash cannot match upstream provenance.
- **Correction:** Either change acceptance to a real temporary plan-file invocation and assert the resolved workspace, or explicitly require and test a local `--help` patch, record the file as modified provenance (upstream hash plus local hash/diff), and update `UPSTREAM.md` expectations.

### SOL-PLAN-R1-M7 — Two accepted-design behaviors are absent from the plan: the unsafe escape hatch and outcome evaluation

- **Evidence**
  - The accepted design requires `--unsafe-prime-args` with a warning, interactive confirmation, and headless rejection (`design:213-215`). The implementation plan never mentions this option; Task 4 tests only the safe and rejected surfaces (`implementation plan:150-166`).
  - The design’s success criteria and verification require the first production task to freeze hidden/external acceptance criteria, record outcomes/interventions/time/usage, and obtain a simplicity reviewer’s material-value verdict (`design:19, 248`). None of Tasks 5, 7, or 8 mentions these records or an acceptance test.
- **Location:** Task 4 Green/Acceptance; Tasks 5, 7, and 8.
- **Concrete failure:** The shipped CLI can omit a documented recovery mechanism, and the whole package can pass while never measuring whether its multi-model ceremony improved an actual outcome—the design’s falsifiability criterion.
- **Correction:** Add the unsafe path to the pure firewall task with exact TTY/headless behavior and argv expectations. Add an explicit production-outcome contract to the workflow-policy task, a fixture test for required fields and missing-field gating, and operator documentation describing when criteria are captured and where the final evaluation is stored.

### SOL-PLAN-R1-M8 — Task 6 does not define a runnable static-doctor fixture or require wire tests to traverse the real Prime serializers

- **Evidence**
  - The accepted design says static doctor checks environment/auth/path correctness and live mode alone performs real completions (`design:233-242`).
  - Task 6’s acceptance runs bare `scripts/doctor`, while the required `PRIME_BASE_URL` and `PRIME_LLM_KEY` are not committed (`implementation plan:223-237`; `design:176-183`).
  - Task 6 says “captured requests prove” native wire shapes but does not say that the test launches the verified 0.8.1 binary/extension. A hand-built fetch client or fixture payload can satisfy the listed assertions without exercising Prime’s OpenAI, Anthropic, or Google serializers.
- **Location:** Task 6 Green/Acceptance, lines 223-237.
- **Concrete failure:** In a clean checkout, bare doctor either fails for missing required environment or must weaken the environment check. Separately, wire-probe tests can pass while the actual extension/provider registration emits a different path, header, thinking field, cache marker, or tool schema.
- **Correction:** Define the static acceptance environment explicitly, for example with a temporary kit/target fixture and non-secret sentinel values, and state its expected exit/status output. For wire probes, require spawning the checksum-verified Prime 0.8.1 executable with the real extension and each exact model selector against local protocol-specific mock servers; assert the requests those servers capture. If this is too heavy for a unit task, separate provider-record tests from a dedicated packaged-runtime integration task.

## Minor findings

### SOL-PLAN-R1-N1 — `npm test --prefix toolchain` has no specified script

Task 1 creates `toolchain/package.json`, and the common gate immediately invokes its `test` script, but neither Files nor Green behavior defines that script. A package manifest without it exits 1 with `Missing script: "test"`. Specify the exact script (and avoid recursively invoking the entire common gate).

### SOL-PLAN-R1-N2 — Several paths are placeholders rather than exact paths

“request fixtures,” “an extension-API fixture,” “shell fixtures,” “local mock servers,” “fixture repositories,” and “review index” have no filenames (`implementation plan:69-70, 105-107, 139-140, 212-213, 243-246, 274-278`). Name them before dispatch so independent workers do not create incompatible layouts.

### SOL-PLAN-R1-N3 — The plan does not explicitly map tasks to prerequisites

The numeric order is mostly sensible—configuration precedes extension, launcher precedes doctor, and skills precede lifecycle verification—but no task has a `Depends on:` field as required by the accepted breakdown contract. Add explicit dependencies and exported interfaces, especially for Tasks 3, 4, 6, and 7.

### SOL-PLAN-R1-N4 — Package verification is deferred too aggressively

`tests/test-package.sh` is “minimal” in Task 1 and appears to receive its full documentation/CI coverage only in Task 8. Require each task that adds a package-owned path to extend the package test in the same commit; otherwise common gates do not verify accumulating package completeness.

## Required plan changes before implementation

1. Fix the stage-aware syntax gate so Task 1 can pass.
2. Replace generic Red prose with exact failing assertions and exit/signature expectations.
3. Split Tasks 4, 5, and 7 into bounded units with explicit dependencies and immutable review surfaces.
4. Freeze the lifecycle ownership/API and test adapter before asking for lifecycle E2E coverage.
5. Correct child-contract selection so depth is not treated as a worker/reviewer discriminator.
6. Freeze every required provider-model field, especially limits and compatibility flags.
7. Correct or explicitly fork the `sdd-workspace` acceptance contract.
8. Add the accepted unsafe-argument and production-outcome evaluation requirements.
9. Make doctor and wire-probe commands executable in a clean checkout and require the wire tests to traverse the packaged Prime runtime.

## Final verdict

**Blockers: 1**  
**Majors: 8**

The overall ordering has the right broad dependency direction, but the plan is not implementation-ready. The common gate blocks Task 1 outright, and several later tasks would force implementers to invent precisely the persistent-state, role-selection, model-profile, and lifecycle behavior that the task breakdown was meant to freeze.
