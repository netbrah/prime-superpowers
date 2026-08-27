# Sol Design Review — Round 2

**Review date:** 2026-08-26  
**Disposition:** **Changes required — do not proceed to task breakdown**  
**Finding count:** 2 Blockers, 3 Majors, 3 Minors  
**Design reviewed:** `docs/specs/2026-08-26-prime-superpowers-design.md`  
**Source baselines:** Prime Agent 0.8.1 at `bc0fa7606abb3b7af0f765319518d255e6ae553d`; Superpowers v6.3.0 at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`

## Verdict

Round 1 materially improved the design. The isolated agent home, unique provider IDs, native endpoint roots, package extension filtering, local skill precedence, explicit child cwd, durable ledger, five-round convergence protocol, machine-checkable TDD evidence, reviewer mutation checks, and outcome evaluation are all feasible against the reviewed sources.

The design is still not executable as a closed contract. A child has no runtime timeout parameter, yet the workflow defines neither an elapsed-time deadline nor the required cancellation/retry transition. Separately, forwarding arbitrary Prime arguments allows callers to override the target cwd, coordinator model/effort, and the very extensions and skills that enforce the workflow. Either gap can defeat a mandatory invariant during an otherwise conforming launch.

Three non-blocking but load-bearing contracts also remain incomplete: the mechanism that pins Prime Agent 0.8.1, the exact thinking maps, and the configuration schema for the promised explicit-header authentication mode.

This was a design/source review. The proposed kit currently contains only the design and review documents, so no kit launcher, extension, doctor, or package tests existed to execute.

## Severity rubric

- **Blocker:** A documented success criterion or mandatory workflow invariant can fail or hang under an allowed execution path.
- **Major:** The architecture is feasible, but an implementation or acceptance test must invent load-bearing behavior not fixed by the design.
- **Minor:** The current direction works, but determinism, portability, or maintainability needs a local clarification.

## Blockers

### SOL-R2-B1 — “Bounded waits” do not bound a child run

**Affected design lines:** 15, 113–120, 124–126, 185, 200.

**Finding:** The design adds periodic reconciliation and a `timed-out` ledger state, but it never defines a child deadline, what clock starts that deadline, which statuses consume it, or the required transition after expiry. Bounded *polling intervals* only bound how long the coordinator waits before looking again; they do not bound how long the child may remain `queued` or `running`.

**Source evidence:**

- Prime documents that `rlm()` returns immediately after admission and never waits for the answer: `prime-agent/packages/coding-agent/docs/rlm.md:53-72`.
- The only accepted `rlm.run` options are `name`, `model`, and `thinking`: `prime-agent/packages/coding-agent/docs/rlm-runtime.md:134-142`.
- The host rejects every other keyword: `prime-agent/packages/coding-agent/src/core/agent-session.ts:10200-10209`.
- Live child statuses include `queued` and `running`, and both count as active indefinitely: `prime-agent/packages/coding-agent/src/core/agent-session.ts:9931-9995`.
- Prime does provide the necessary cancellation primitive: `rlm.delete_subagent()` cancels/closes the runtime and writes a tombstone (`prime-agent/packages/coding-agent/docs/rlm-runtime.md:171-179`).
- Superpowers' five-to-ten-minute guidance is explicitly about wait/reconciliation intervals, not a total child deadline: `superpowers/skills/subagent-driven-development/SKILL.md:235-244`.

**What concretely breaks if ignored:** A provider stream, tool call, or child agent can remain live forever. The coordinator will faithfully wake, observe `running`, and wait again forever. That violates “every review loop is bounded,” prevents the five-round breaker from ever being reached, and makes `timed-out` an unreachable or subjective ledger state.

**Required change:** Define an executable lifecycle policy, for example:

1. Record `admitted_at`, `started_at`, `last_progress_at`, and a role-specific hard deadline.
2. On deadline, reconcile once, then call `await rlm.delete_subagent(handle.rlm_child_id)`.
3. Record `timed-out` only after cancellation/tombstone confirmation (or record a separate cleanup-failed state).
4. Define whether the attempt is retried, with which model, under what fresh child name, and how many admissions are allowed.
5. Count timeout retries against the five-round/task budget and prohibit duplicate live attempts for the same ledger task.
6. Test queued timeout, running timeout, cancellation failure, late report after timeout, restart during timeout, and retry idempotency.

### SOL-R2-B2 — Forwarded Prime arguments can disable the kit's mandatory invariants

**Affected design lines:** 12, 30, 36–43, 78–90, 128, 169–172, 180–185.

**Finding:** The public contract forwards unrestricted `PRIME_ARGS`, but it does not reserve or reject arguments that override the enforced cwd, model, effort, tools, extension loading, skill loading, or session identity. This conflicts directly with the promise that every invocation starts a Sol/max coordinator in the target with the kit extension and contracts active.

**Source evidence:**

- Prime's parser accepts `--provider`, `--model`, `--cwd`, `--system-prompt`, `--models`, `--tools`, and `--thinking`, with later occurrences assigned directly to the parsed result: `prime-agent/packages/coding-agent/src/cli/args.ts:131-171`.
- Prime supports `--no-extensions` and `--no-skills`, which disable the resources that implement this design: `prime-agent/packages/coding-agent/src/cli/args.ts:205-216` and `prime-agent/packages/coding-agent/src/cli/command-registry.ts:230-232`.
- Explicit `--thinking` overrides the thinking parsed from `<model>:<thinking>`: `prime-agent/packages/coding-agent/src/main.ts:538-542,569-572`.
- `--cwd` is an application-level option, not merely a shell concern: `prime-agent/packages/coding-agent/src/cli/command-registry.ts:195` and `prime-agent/packages/coding-agent/src/main.ts:1141`.
- The revised design simultaneously promises full argument forwarding and fixed coordinator/runtime invariants: design lines 12 and 38–43.

**What concretely breaks if ignored:** Allowed calls such as `./prime target -- --model other/provider`, `--thinking off`, `--cwd elsewhere`, `--no-extensions`, or `--no-skills` can start the wrong coordinator, load the wrong project, omit provider registration, omit the root/child contracts, or remove the workflow skills. Resume/fork options can similarly restore a session whose model and orchestration state do not satisfy the current kit contract. The run may appear healthy while bypassing the SDD and safety guarantees.

**Required change:** Define an argument firewall. Parse wrapper arguments before `exec`; reject reserved flags and their aliases (`--provider`, `--model`, `--models`, `--thinking`, `--cwd`, `--system-prompt`, `--append-system-prompt`, `--no-extensions`, `--no-skills`, `--no-tools`, and any session-resume mode not explicitly validated). Forward only a documented safe subset, or add a separately named unsafe escape hatch that prominently drops the workflow guarantees. Test both split and `--flag=value` forms, repeated flags, aliases, and resume/fork behavior.

## Major findings

### SOL-R2-M1 — Prime Agent 0.8.1 is asserted as pinned, but no pinning mechanism is specified

**Affected design lines:** 57, 74, 169, 180.

**Finding:** Line 74 says `agent-home/settings.json` “pins Prime Agent compatibility to 0.8.1.” Prime's settings schema has no executable-version or compatibility-pin field. The repository layout includes `package.json`, but the design never says whether the launcher uses a vendored binary, an exact package/tarball dependency, or a global `prime-agent`, nor does it require a startup version check.

**Source evidence:**

- Prime's complete `Settings` interface includes `rlmMaxDepth`, packages, extensions, skills, and other runtime preferences, but no Prime version field: `prime-agent/packages/coding-agent/src/core/settings-manager.ts:128-173`.
- `PRIME_AGENT_CODING_AGENT_DIR` only selects the agent home: `prime-agent/packages/coding-agent/src/config.ts:489-503`.
- The source package reports version 0.8.1, but its root dependency is a range (`"@earendil-works/pi-coding-agent": "^0.8.1"`): `prime-agent/package.json:48-54`.
- Prime's own README says public releases are versioned tarball artifacts and the release packaging rewrites the command to `prime-agent`: `prime-agent/packages/coding-agent/README.md:16,46-59`.

**What concretely breaks if ignored:** A machine with a newer or older `prime-agent` on `PATH` can launch successfully but have different provider schemas, RLM lifecycle behavior, settings precedence, or prompt APIs. The claimed compatibility guarantee and every source-backed acceptance test become non-reproducible.

**Required change:** Choose one exact executable provenance and specify it end to end: an exact checked-in checksum for a release artifact, an exact lockfile-resolved dependency invoked from the kit, or another immutable mechanism. The launcher/doctor must resolve the actual executable, run `prime-agent --version`, require exactly 0.8.1 (or an explicitly enumerated compatible set), and fail before loading credentials if it does not match. Move the pin claim out of `settings.json`.

### SOL-R2-M2 — The exact thinking-level maps are not defined

**Affected design lines:** 78–90, 104, 182, 185.

**Finding:** The design requires “exact model/thinking maps” in tests and says Gemini exposes *only* `low` and `high`, but it gives no map objects. Prime treats most reasoning levels as supported unless each undesired level is explicitly mapped to `null`.

**Source evidence:**

- Prime's model schema says `null` marks a thinking level unsupported: `prime-agent/packages/coding-agent/src/core/extensions/types.ts:1219-1232`.
- For every reasoning model, `off`, `minimal`, `low`, `medium`, and `high` are supported by default; `xhigh` and `max` become supported when mapped to a non-undefined value: `prime-agent/packages/ai/src/models.ts:65-75`.
- RLM rejects a requested level only after consulting that computed supported-level set: `prime-agent/packages/coding-agent/src/core/agent-session.ts:10232-10238`.

**What concretely breaks if ignored:** A natural implementation such as `{low: "low", high: "high"}` still exposes `off`, `minimal`, and `medium` for Gemini. Likewise, implementers cannot tell whether Sol/Terra or Opus/Sonnet should expose intermediate levels. The “unsupported thinking rejection” test has no unique expected result, and coordinators or operators can dispatch effort levels outside policy.

**Required change:** Put the complete seven-key map for every model family in the design (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`), including explicit `null` values. State the provider-native value for every enabled level and separately state the default dispatch level. Add table-driven tests over all seven inputs for all five role models.

### SOL-R2-M3 — The promised explicit-header auth mode has no configuration schema

**Affected design lines:** 11, 46, 98–104, 151–161, 182–186.

**Finding:** Architecture line 46 promises “native or explicit-header modes,” while the configuration contract says `PRIME_PROXY_AUTH_MODE` supports only `bearer` and `native`. No variable defines an explicit header name, its secret source, whether it applies globally or per dialect, or collision precedence with `authHeader` and model/provider headers.

**Source evidence:**

- Prime's provider API accepts literal `headers: Record<string,string>`, an API-key source, and `authHeader`; `authHeader` specifically adds `Authorization: Bearer`: `prime-agent/packages/coding-agent/src/core/extensions/types.ts:1186-1203`.
- Provider and model headers are merged, and `authHeader` is applied afterward: `prime-agent/packages/coding-agent/src/core/model-registry.ts:1296-1344`.
- Provider registration requires `apiKey` or OAuth whenever models are declared, even if a custom header is also supplied: `prime-agent/packages/coding-agent/src/core/model-registry.ts:1482-1503`.
- The design exposes only `PRIME_PROXY_AUTH_MODE=bearer` and says that variable supports `bearer` and `native`: design lines 151–161.

**What concretely breaks if ignored:** A gateway requiring `X-API-Key`, a vendor-specific bearer header, or different auth placement by dialect cannot be configured from the documented surface. Implementers must invent environment variable names and precedence, and the doctor/mock-request tests cannot distinguish a correct implementation from an incompatible one.

**Required change:** Either remove the explicit-header promise or define a complete schema. At minimum specify allowed mode values, per-dialect/global header-name variables, an environment-only secret-value source, validation of forbidden/empty header names, and precedence versus native headers and `authHeader`. Include expected headers—and whether native headers may coexist—for every dialect/mode combination.

## Minor findings

### SOL-R2-N1 — Environment-file precedence and protected variables are unspecified

**Affected design lines:** 35–38, 134–161, 180.

The design says the launcher loads kit and target `.env` plus `.env.local`, but does not define order, whether pre-existing process variables win, whether shell syntax is executed or parsed, or which kit-control variables a target file may set. Two valid implementations can therefore select different endpoints, keys, models, auth modes, and agent homes.

Define a precedence table and an allowlist. Prefer a data parser rather than shell `source`; never allow target files to replace `PRIME_AGENT_CODING_AGENT_DIR`; and test conflicting values, spaces, quotes, comments, empty values, command substitutions, symlinks, and secret redaction.

### SOL-R2-N2 — The launcher uses a display-name/fuzzy model selector where the workflow otherwise requires exact IDs

**Affected design lines:** 38, 90, 100, 141–149.

`prime-proxy-openai/Sol:max` can resolve today because CLI model selection permits partial ID/display-name matching (`prime-agent/packages/coding-agent/src/core/model-resolver.ts:120-147,334-343`). RLM, correctly, accepts only exact `provider/model-id` selectors (`prime-agent/packages/coding-agent/src/core/agent-session.ts:10173-10197`). Using `${PRIME_MODEL_SOL}` in the launcher would make startup follow the same exact-ID discipline and avoid ambiguity after display-name changes.

### SOL-R2-N3 — Concurrency expectations for the shared clone-local agent home are absent

**Affected design lines:** 7, 30, 74, 167–169, 180–181.

The isolation mechanism is valid relative to the operator's normal Prime home, but every invocation from one kit clone shares the same global settings, package installation tree, auth/cache area, and default session storage. Prime uses locks for settings writes (`prime-agent/packages/coding-agent/src/core/settings-manager.ts:259-291`), but the design does not state whether concurrent launches against different targets are supported.

State the support policy. If concurrency is supported, add a two-process test covering first-run package installation, settings stability, distinct sessions, and no cross-target resource leakage. If not, add a clone-level lock and a clear diagnostic.

## Round-1 resolution verification

| Round-1 area | Round-2 disposition | Evidence / qualification |
|---|---|---|
| Project root and isolated home | **Closed** | `PRIME_AGENT_CODING_AGENT_DIR` is the correct computed variable (`config.ts:489-503`), while target cwd remains independently selectable. |
| Global depth enforcement | **Closed** | `getRlmMaxDepth()` reads global settings only (`settings-manager.ts:771-778`); child spawn checks depth before admission (`agent-session.ts:10214-10217`). |
| Unique provider identities | **Closed** | Dynamic provider registration supports unique names and complete model declarations (`model-registry.ts:1482-1550`). |
| Native endpoint roots | **Closed** | OpenAI passes the configured base to the Responses client; Google disables version insertion for custom bases (`providers/openai-responses.ts:210-215`; `providers/google.ts:323-340`); Anthropic passes the bare base to its Messages client (`providers/anthropic.ts:928-941`). |
| Package extension suppression | **Closed** | Filtered package sources support `extensions: []` (`settings-manager.ts:78-90`), and Superpowers declares its Pi extension separately from skills (`superpowers/package.json`). |
| Local workflow overrides | **Closed** | Local/user resources precede package resources and skill-name collision resolution is first-wins (`package-manager.ts:168-180`; `skills.ts:525-549`). |
| Root/child contract split | **Closed** | `before_agent_start` exposes `systemPromptOptions`, including `rlmDepth` (`extensions/types.ts:627-637`; `system-prompt.ts:9-38`), so the extension can distinguish root from child. |
| Explicit child worktree cwd | **Closed with test obligation** | Children inherit the parent `AgentSession.cwd` (`agent-session.ts:9348-9403`), while kernel `os.chdir()` persists across later `bash()` calls (`docs/rlm.md:45-51`). The explicit instruction is therefore necessary and feasible. |
| Child completion notification | **Closed** | Prime synthesizes completion-without-reply, error, and cancellation notices (`agent-session.ts:10460-10518`) and retains an inspectable registry. The separate total-timeout defect is SOL-R2-B1. |
| Review convergence and breaker | **Closed** | Stable findings, artifact hashes, fresh review packages, five rounds, and fail-closed accepted Blocker/Major handling are now explicit. The local SDD override is necessary because upstream still permits rulings/parking at its breaker (`superpowers/.../subagent-driven-development/SKILL.md:73-120`). |
| Commit/worktree/TDD evidence | **Closed** | `BASE..HEAD`, local worker commits, independent reruns, and machine-checkable red/green evidence now form one consistent flow. |
| Reviewer mutation controls | **Closed at design level** | Read-only prompts, immutable baselines, assigned report-only writes, and delta invalidation are specified; implementation tests remain required. |
| CI evidence | **Closed** | Named environment, revision, command, toolchain, logs, and fail-closed unavailability are explicit. |
| Outcome/novel-value evaluation | **Closed** | Frozen acceptance criteria, alternative generation, simplicity review, and ceremony-removal criteria address the earlier outcome-measurement objection. |
| Prime version pin | **Still open** | See SOL-R2-M1. |
| Child timeout/recovery | **Partially open** | Completion recovery is fixed; total timeout/cancel/retry semantics remain missing in SOL-R2-B1. |
| Provider schema | **Partially open** | Native APIs, URLs, IDs, auth key, cache behavior, and required model fields are specified; explicit-header mode and exact thinking maps remain open in SOL-R2-M2/M3. |

## Confirmed implementation assumptions

The following design assumptions are supported by the reviewed Prime Agent 0.8.1 and Superpowers v6.3.0 sources:

1. `PRIME_AGENT_CODING_AGENT_DIR` selects a clone-local global home.
2. `rlmMaxDepth: 1` in that global settings file cannot be raised by target project settings.
3. A package object with `extensions: []` can retain Superpowers skills while excluding its Pi extension.
4. Local skills can shadow same-named package skills deterministically.
5. A provider extension can register models with unique IDs, native API values, base URLs, API-key environment names, headers, compatibility flags, and thinking maps before model use.
6. `rlm.find_models()` returns exact selectors, and child spawn rejects unavailable selectors and unsupported effort.
7. Root and child sessions can receive different prompt contracts based on `systemPromptOptions.rlmDepth`.
8. Child reports can be recovered from files and the persistent child registry even when the explicit parent message is missing.
9. `PI_CACHE_RETENTION=long` causes Anthropic `cache_control.ttl="1h"` when compatibility permits (`providers/anthropic.ts:50-76`).
10. The pinned Superpowers Git-source spelling is supported: Prime parses `git:github.com/owner/repo@ref`, marks it pinned, clones it, and checks out the ref (`utils/git.ts:24-76,130-170`; `package-manager.ts:1708-1726`).

## Required acceptance additions before implementation

In addition to the design's existing verification list:

1. **Argument-firewall matrix:** prove every reserved option and alias is rejected, including repeated flags and `--flag=value`; prove safe options and exit/signal forwarding still work.
2. **Child deadline matrix:** queued, running, silent-complete, failed, cancelled, cleanup-failed, late-report, restart-mid-wait, and retry paths.
3. **Executable provenance:** corrupt/missing binary, 0.8.0, 0.8.1, and future version; verify failure occurs before credentials are made available to a process.
4. **Thinking truth table:** all seven Prime levels against each configured model.
5. **Auth truth table:** every dialect under bearer, native, and any retained explicit-header mode; assert exact header presence and absence, not merely request success.
6. **Environment precedence:** process environment, kit `.env`, kit `.env.local`, target `.env`, and target `.env.local`, including attempts to replace protected launcher controls.
7. **Concurrent-launch test or lock test:** two targets using one kit clone.

## Recommendation

Do not begin task breakdown until SOL-R2-B1 and SOL-R2-B2 are resolved in the design. Resolve SOL-R2-M1 through SOL-R2-M3 before freezing implementation tests. The remaining architecture is coherent and the round-1 fixes should be preserved.
