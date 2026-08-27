# Plan review — Opus, round 3

Reviewer seat: Opus (fresh, independent). Posture: hostile and empirical. No plan, product, or
test file was modified by this review.

## Artifact state

| Artifact | State |
|---|---|
| Plan under review | `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, 472 lines, sha256 `6646274e7265f76bdfd69da4c5fff68b7b28ef46b416a658b36094c4f0891c6a`, header "Status: draft, round 2 findings incorporated" |
| Design | `docs/specs/2026-08-26-prime-superpowers-design.md`, 297 lines, sha256 `61535fc6f6d8264baf21278a27124a1d53d0a69b77f13f801cdd8a6feac91c2c`, "round 5 findings incorporated" |
| Prime Agent | `/home/user/workspace/prime-agent` @ `bc0fa7606abb3b7af0f765319518d255e6ae553d`, published version `0.8.1` (`packages/coding-agent/package.json:3`) |
| Superpowers | `/home/user/workspace/superpowers` @ `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0) |
| Prior rounds audited | `docs/reviews/plan-opus-round-2.md` (3 Blockers / 8 Majors / 10 Minors), `docs/reviews/plan-sol-round-2.md` (1/6/2) |
| Local runtime | Node v20.20.1, npm 10.8.2 — below the plan's Node ≥ 22.8.0 floor, so the real binary could not be executed here; every runtime claim below is derived from source reading, not from a live run, and is cited by file:line. |

## Counts

**3 Blockers, 3 Majors, 6 Minors.** Gate (zero Blocker/Major) **not met**. Verdict: **changes required**.

---

## What round 3 confirms as genuinely fixed

These are empirical confirmations, not restatements of the plan's claims.

1. **Task 1's absence red is reachable.** Round-2 Opus B1 (an `ERR_MODULE_NOT_FOUND` red demanded of a
   shell script) is gone; the red is now `spawn scripts/bootstrap-toolchain` / `ENOENT`, which is what
   Node actually produces for a missing spawn target.
2. **The bootstrap flags exist and the "postinstall can fail silently" premise is correct.**
   `PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL` / `PRIME_AGENT_BOOTSTRAP_TOOLS_ON_INSTALL` are read at
   `packages/coding-agent/src/postinstall.ts:4-5`; failures are caught and logged at
   `postinstall.ts:30-32`, and the CJS shim always exits 0 (`packages/coding-agent/postinstall.cjs:11-14`).
   Task 1's demand for independent kernel/`rg`/`fd` verification after install is therefore necessary
   and correctly specified.
3. **`--version` prints exactly the package version** (`main.ts:1100-1102`, `VERSION` from
   `config.ts:499`), so "binary output exactly `0.8.1`" is a valid assertion.
4. **`PRIME_AGENT_TELEMETRY=off` really disables telemetry.** `parseBooleanOverride` accepts
   `off` (`core/telemetry.ts:198-200`) and `isTelemetryEnabled` honours the override before settings
   (`telemetry.ts:204-218`). Sol round-2 N-item closed.
5. **`PI_CACHE_RETENTION=long` is effective.** `resolveCacheRetention` only consults the env var when no
   explicit option is passed (`packages/ai/src/providers/openai-responses.ts:35-44`,
   `providers/anthropic.ts:54-62`), and the coding agent never passes `cacheRetention` (the only
   producer is `packages/agent/src/proxy.ts:93`). So `prompt_cache_retention: "24h"` and Anthropic
   `ttl:"1h"` (`anthropic.ts:72-76`) are reachable from the launcher's invariant environment.
6. **Gemini reasoning-off is serialized as `LOW`, never omitted**, for `gemini-3.1-pro*`
   (`providers/google.ts:409-411, 417-425`). Sol round-2 N2 closed correctly, and the fixture ID
   `gemini-3.1-pro-preview` matches the regex.
7. **The pinned package syntax is valid.** `git:github.com/obra/superpowers@v6.3.0` parses to
   repo `github.com/obra/superpowers`, ref `v6.3.0`, `pinned: true`
   (`core/package-manager.ts:1372-1392`, `utils/git.ts:57-77, 137-170`); the same shape is exercised
   upstream at `packages/coding-agent/test/package-manager.test.ts:743, 1804`.
8. **`extensions: []` really disables a package's extensions** — every collected file is registered with
   `enabled=false` (`package-manager.ts:1993-2002`), so
   Task 3's filter claim holds.
9. **Credential-free model listing is feasible.** `getAvailable()` filters on `hasConfiguredAuth`
   (`core/model-registry.ts:768-778, 1025-1027`), which resolves through
   `getProviderRequestAuthSource` (`1073-1110, 1188-1191`): a provider declaring
   `apiKey: "PRIME_LLM_KEY"` yields an `environment` source when the variable is set and still yields a
   `models_json_key` source when it is not. Task 15's "missing proxy secrets are notices" is achievable.
   Extension-registered providers are installed into the registry during runtime creation
   (`core/agent-session-services.ts:192-204`), i.e. before `listModels` runs.
10. **Real RLM child mechanics support Task 17's assertions.** Children are created in-process
    (`core/agent-session.ts:9340-9349`), inherit the parent cwd (`9349`), get `rlmDepth + 1` and the
    parent's `rlmMaxDepth` (`9334-9335`), and a grandchild attempt throws exactly
    `RLM recursion depth limit reached (RLM_DEPTH=…, RLM_MAX_DEPTH=…)` (`10214-10218`). Print mode is a
    normal in-process session with headless extension binding
    (`modes/print-mode.ts:50-52`, `modes/agent-connection/in-process-agent-connection.ts:109-112`), so
    the scripted-proxy scenario is feasible. Round-2 Opus B2 is substantively closed.
11. **Depth precedence is as the plan assumes:** persisted chat state → configured/inherited → global
    settings → `RLM_MAX_DEPTH` → 2 (`agent-session.ts:1569-1589`), and `rlmMaxDepth` is a global
    settings key documented as a *default for new sessions* (`core/settings-manager.ts:136`), which is
    why Task 8's retained-session check is required.
12. **Task 18's red is inside its own Files list** (TAP assertions added to `tests/test-package.sh`),
    closing round-2 Opus B3, and the status-line commit is correctly deferred outside the frozen range,
    closing round-2 Opus M8.
13. Round-2 Opus M1-M5, M7 and Sol B1, M1, M3-M5, N1 are addressed as claimed: `scripts/gate` plus
    `tests/gate.test.mjs` exist as a task deliverable, compat is literal JSON, costs are zero, Task 4
    seats Opus and Gemini, the oversized module tasks are split (Tasks 11-14), `E_PACKAGE_UNRESOLVED`
    replaces the silent skip, and `.superpowers/sdd/.gitignore` is in Task 0's Files.

---

## Blockers

### PLAN-OPUS-R3-B1 — Task 3's `/rlm-max-depth` interception is impossible in the real binary; the depth-1 guarantee remains operator-breakable mid-run

**Location:** plan line 162 ("Register an `input` handler that consumes every `/rlm-max-depth` form with
`{action:"handled"}` … This prevents persisted or `--global` depth mutation through the supported
interactive command"), plan line 167 acceptance token "`/rlm-max-depth` interception", plan line 48
("Runtime-enforced: … effective `rlmMaxDepth`"), design line 168.

**Evidence:** `rlm-max-depth` is a *builtin* slash command declared at
`packages/coding-agent/src/core/slash-commands.ts:175` and dispatched entirely inside the TUI editor
submit handler: `modes/interactive/interactive-mode.ts:4606` (`defaultEditor.onSubmit`) →
`4636-4638` (`parseSlashCommand` + `resolveBuiltinSlashCommandName`) → `4731-4735`
(`if (commandName === "rlm-max-depth") { … await this.handleRlmMaxDepthCommand(commandArgs); return; }`).
The handler mutates depth locally (`interactive-mode.ts:9134-9146+`) and the function **returns before
any submission is created**. Extension `input` handlers are only reached from
`core/agent-session.ts:4424-4425` (`_normalizeSubmission` → `_extensionRunner.emitInput`, runner at
`core/extensions/runner.ts:1045-1073`), i.e. strictly after a submission exists. Session-level slash
parsing confirms the command is not a session command at all:
`parseSessionSlashCommand("/rlm-max-depth 3 --global")` is `undefined`
(`packages/coding-agent/test/slash-commands.test.ts:260`). There is no extension or hooks API for depth
at all — `grep rlmMaxDepth core/extensions/types.ts core/hooks/*.ts` returns nothing — and the builtin
name is resolved before any extension-registered command, so shadowing is impossible.

**Concrete failure:** the mandated `input` handler can only ever be observed by the kit's own
`tests/fixtures/extension-api.mjs`, so Task 3's acceptance item "/rlm-max-depth interception" passes
against a fixture that cannot fail for the right reason. In the shipped product an operator typing
`/rlm-max-depth 3` inside the coordinator TUI persists a chat-scoped override that wins precedence
(`agent-session.ts:1573-1576`, source `"chat"`) and immediately unblocks grandchildren for the rest of
the run. Task 8's per-run agent-home copy neutralizes only the `--global` *persistence* across runs; it
does nothing in-run. Round-2 Opus M6(a) is therefore **not closed**, and the plan's Ownership section
mis-labels effective `rlmMaxDepth` as runtime-enforced.

**Correction:** delete the interception claim and the acceptance token. Either (a) demote in-run depth
immutability to an explicitly labelled prompt-only/observed obligation and add a Task 17 assertion that
detects a mid-run override (poll `getRlmMaxDepthStatus`/persisted state via the controller and fail
closed), or (b) enforce it where it is enforceable: keep the persisted-override refusal in Task 8
(already specified) and add a controller-side pre-dispatch check that re-reads the effective depth and
refuses dispatch when source ≠ `global` or value ≠ 1. Any wording that says the extension prevents the
interactive command must be removed from plan lines 48 and 162.

### PLAN-OPUS-R3-B2 — Task 15's frozen command cannot produce the artifacts or the assertions it mandates

**Location:** plan lines 404-408 (exact command `env … "$PRIME_BIN" model list --json`; "save
stdout/stderr and effective resource inventory"; "Assert all five selectors, package minimum skills,
local override winners, filtered package extensions, root worktree cwd, and tracked template byte
identity"), plan line 401 (red substring `selector prime-proxy-openai/gpt-5.6-sol not found`).

**Evidence:**
- `model list` is rewritten to the internal flag: `cli/public-command.ts:142` →
  `rewriteNestedCommand("model","list","--list-models", …)` (`public-command.ts:318-339`), and
  `--list-models` is only honoured behind `INTERNAL_RUNTIME_COMMAND_MARKER` (`cli/args.ts:66, 81,
  275-291`).
- `--json` is **not** an option on that route. `doctor --json` exists
  (`cli/command-registry.ts:83-87`) but `model list` has no `--json` (`command-registry.ts:155-164`).
  An unrecognized flag lands in the unknown/extension-flag bucket (`args.ts:299-312`) and becomes an
  error diagnostic (`core/agent-session-services.ts:109-135`) — but `main.ts` executes
  `listModels(...)` and `process.exit(0)` *before* `reportDiagnostics` + exit 1
  (`main.ts:1608-1611` vs `1637-1639`). So the command exits 0 while silently ignoring `--json`.
- `cli/list-models.ts` emits only a fixed human table (provider/model/context/max-out/thinking/images).
  There is no JSON mode, so "effective resource inventory" has no producer and the plan's red substring
  targets text the real output never contains.
- Skills/collision facts are not in that output at all. Collision diagnostics are produced in
  `core/skills.ts:522-547` and rendered **only** by the TUI
  (`modes/interactive/interactive-mode.ts:2125-2155, 2194`). Runtime diagnostics — the only thing a
  headless run prints (`main.ts:149-155`) — are assembled from services diagnostics, settings errors and
  extension *load* errors (`main.ts:766-773`) and contain no resource inventory. Nothing in a
  `model list` run reveals override winners, filtered package extensions, or the session cwd.

**Concrete failure:** the task's only frozen command exits 0 with a text table; five of its six named
assertions have no observable, and its named red string is unreachable. A worker can only "pass" Task 15
by asserting on files (which the plan elsewhere forbids as a substitute) or by inventing a different
command, which the Execution contract forbids without a plan amendment.

**Correction:** (1) drop `--json`; freeze `model list` (text) plus an explicit parse of that table for
the five selectors, and record `--version` for identity. (2) Move the effective-resource assertions to a
real oracle that exists: the captured **system prompt** on the loopback transcript. Prime emits
`<available_skills>` with `<name>`, `<type>`, `<description>` and an absolute `<location>` per skill
(`core/skills.ts:443-473`, injected at `core/system-prompt.ts:169-172`), so Task 16/17's captured request
body proves package minimum skills, override winner paths, and (by absence of package extension tools)
the extension filter; the child/root cwd marker is already in Task 17. (3) Restate "effective resource
inventory" as the specific artifact file that produces it.

### PLAN-OPUS-R3-B3 — Task 15's negative package case cannot produce `E_PACKAGE_UNRESOLVED` through the mandated command

**Location:** plan line 408 ("Remove the package cache and deny network in the negative case; require
`E_PACKAGE_UNRESOLVED`, not a silent reduced session").

**Evidence:** with the cache removed and the network denied, Prime's resolver takes
`installMissing()` → `isOfflineModeEnabled()` → `return false` → `if (!installed)
continue;` (`core/package-manager.ts:1210-1212, 1230-1232` for npm; `1239-1243` for git), i.e. it starts a reduced session with no error and no
nonzero exit. `E_PACKAGE_UNRESOLVED` is a **kit** error owned by the Task 8 launcher (plan line 289),
and Task 15's frozen command invokes `"$PRIME_BIN"` directly, bypassing the launcher entirely. The
mandated failure signature therefore cannot appear.

**Concrete failure:** the negative case either fails permanently (nothing emits the required string) or
gets "closed" by a worker silently swapping in a different entry point — again a contract violation.

**Correction:** run the negative case through the kit entry point (`./prime …` or `lib/launcher.mjs run`)
with a pre-seeded-cache-removed runtime home and `PI_OFFLINE=1` (the exact switch read by
`isOfflineModeEnabled`), assert the launcher's `E_PACKAGE_UNRESOLVED` and nonzero exit, and separately
assert (from the raw binary) that Prime alone exits 0 with a reduced skill set — that contrast is the
evidence that the launcher check is load-bearing.

---

## Majors

### PLAN-OPUS-R3-M1 — Cross-task file ownership makes Tasks 10 and 14 unable to go green without a plan amendment

**Location:** Task 9 Files (plan line 323: `UPSTREAM.md`, `tests/skills-vendor.test.mjs`), Task 10 Files
(plan line 341), Task 14 Files (plan line 371), Execution contract (plan line 19: "No task may modify
paths outside its `Files` list"), Stage-aware gates (plan line 27: the gate runs `node --test` over all
existing `tests/*.test.mjs`).

**Evidence and concrete failure:**
- Task 14 rewrites `agent-home/skills/prime-rlm-dispatch/SKILL.md` and
  `agent-home/skills/subagent-driven-development/SKILL.md` to require `scripts/workflow-controller` and
  to forbid direct RLM dispatch. Task 10's `tests/workflow-contract.test.mjs` asserts "exact positive and
  forbidden token sets" over those same files but is **not** in Task 14's Files list. The first
  contradictory token makes `scripts/gate` red in Task 14 with no permitted file to repair.
- Symmetrically, Task 10 edits vendored bodies (`using-superpowers/SKILL.md`,
  `subagent-driven-development/SKILL.md`, plus the localized prompts) whose "intentional skill-body
  diffs" are recorded in Task 9's `UPSTREAM.md` and validated by Task 9's `tests/skills-vendor.test.mjs`
  ("Preserve vendored helpers byte-for-byte … record upstream commit, source path, upstream SHA-256,
  local SHA-256, and intentional skill-body diffs", plan line 330). Neither file is in Task 10's Files.

**Correction:** add `tests/workflow-contract.test.mjs` to Task 14's Files and `UPSTREAM.md` +
`tests/skills-vendor.test.mjs` to Task 10's Files (or split the contract assertions so the token sets
that Task 14 changes live in Task 14's own test file and Task 9's provenance test hashes only the
byte-preserved helper scripts, not skill bodies). State explicitly which task owns the final token set
for each SKILL.md.

### PLAN-OPUS-R3-M2 — The `resources.lock.json` contract has no representation for package-provided skills, so its own validation rule cannot hold

**Location:** plan line 165 ("`resources.lock.json` lists every skill path present now and every exact
path introduced by Tasks 9 and 10. Tests reject an AGENTS/prompt skill reference absent from both disk
and this introduced-later manifest"), plan line 336 ("upstream-link integrity").

**Evidence:** the vendored bodies reference sibling skills by namespaced name, not path:
`skills/subagent-driven-development/SKILL.md:91, 120, 127, 453, 487, 567` reference
`superpowers:finishing-a-development-branch`, `superpowers:using-git-worktrees`,
`superpowers:requesting-code-review`; `skills/using-superpowers/SKILL.md:30-31` reference
`superpowers:brainstorming` and `superpowers:systematic-debugging`. None of those skills is vendored
(Task 9 vendors exactly two directories) and none has a committed path, so none can appear in a manifest
defined as a list of paths. They resolve only at runtime from the pinned package clone under
`<runtime agent home>/git/github.com/obra/superpowers/skills/*` (`package-manager.ts:1871`).

**Concrete failure:** a literal implementation of the Task 3 rule fails on the first vendored
cross-reference; the only escapes are to silently weaken the test (destroying the guarantee round 2
asked for) or to vendor the whole upstream skill tree (contradicting the pinned-package design).

**Correction:** define two classes in `resources.lock.json` — committed paths (present or
introduced-later) and *package-resolved names* validated against the pinned package's skill inventory
(offline-checkable against the vendored upstream checkout, and at runtime against the resolved package
dir). Name the exact expected set (`brainstorming`, `verification-before-completion`,
`requesting-code-review`, `using-git-worktrees`, `finishing-a-development-branch`,
`systematic-debugging`, `writing-plans`, `test-driven-development`, `executing-plans`,
`receiving-code-review`) so the test can fail for the right reason.

### PLAN-OPUS-R3-M3 — The immutable per-run agent home makes every launch network-dependent, and the plan never says so

**Location:** plan line 288 ("copy the committed `agent-home/` template byte-for-byte into ignored
`.state/runs/<run-id>/agent-home`"), plan line 289 ("Before spawn, install/resolve the pinned
Superpowers package into the runtime agent home … Missing, offline, or silently skipped resolution fails
with `E_PACKAGE_UNRESOLVED`").

**Evidence:** user-scope git packages install to `join(this.agentDir, "git", host, path)`
(`core/package-manager.ts:1864-1872`), i.e. *inside* the agent home. A fresh per-run copy of a tracked
template can never contain that clone (the template is immutable and the cache is ignored), so each run
re-clones `github.com/obra/superpowers@v6.3.0` over the network. Combined with the (correct) fail-closed
rule, the kit cannot start at all without network access — including for Task 17's real-RLM spike and
any offline operator use — yet neither the plan nor the design states this, and README requirements
(Task 18) list only Node/npm/two variables.

**Correction:** either specify a verified pre-seeded cache (resolve once into a kit-level cache and copy
or hard-link `git/github.com/obra/superpowers` into each runtime home, verifying the checked-out ref and
tree hash before spawn), or document network-per-run as a hard prerequisite in Task 18's README/doctor
prerequisites and mark the offline CI jobs as unable to exercise `run`. Whichever is chosen must be
asserted by Task 8's tests (a run with `PI_OFFLINE=1` and a warm cache must succeed or fail *by design*,
not by accident).

---

## Minors

- **PLAN-OPUS-R3-N1 — `agent-home/prompts/` has runtime meaning.** `coordinator.md` and `child.md`
  (plan line 152) sit in a directory Prime loads as user prompt templates / slash commands
  (`core/prompt-templates.ts:207-221, 254-257`; also a package resource type,
  `core/package-manager.ts:195-197`). The contracts become operator-invocable `/coordinator` and
  `/child` commands and can collide with package-provided prompts. Either move them (e.g.
  `agent-home/contracts/`) or add an explicit assertion that the registration is intended and
  collision-free.
- **PLAN-OPUS-R3-N2 — the model-profile provenance claim is false as written.** The plan says the fixture
  rows are the cited Prime rows with "provider and base URL replace only the source transport fields"
  (plan line 42). Source rows are `thinkingLevelMap: {"off":"none","xhigh":"xhigh","minimal":null,"max":"max"}`
  (`packages/ai/src/models.generated.ts:8431, 8449`) and `{"xhigh":"xhigh","max":"max"}`
  (`models.generated.ts:2226, 2296`); the plan's table adds `low`/`medium`/`high` (and `off` for
  Anthropic) and sets Anthropic `minimal: null`, which *narrows* `getSupportedThinkingLevels`
  (`packages/ai/src/models.ts:67-76`) relative to the cited rows. The wire results are equivalent
  (OpenAI mappings are identity, `?? options.reasoningEffort` at
  `providers/openai-responses.ts:251`; Anthropic `off` never reaches the map,
  `providers/anthropic.ts:809-812`; Anthropic `minimal` maps to `low` either way,
  `anthropic.ts:781-786`), so this is documentation accuracy: state that costs are zeroed *and* the
  thinking map is normalized to a complete literal map, with the behavioural-equivalence argument.
- **PLAN-OPUS-R3-N3 — `superpowers:` namespace prefixes are not Prime skill names.** Prime resolves
  skills by frontmatter `name` (`brainstorming`, `subagent-driven-development`;
  `superpowers/skills/*/SKILL.md:2`) and advertises them in `<available_skills>` by that name
  (`core/skills.ts:459-468`). Task 10's rewrite list (plan lines 333-337) removes Pi claims and
  `read`/`write`/`grep`/`ls` mappings but never normalizes `superpowers:<name>` references. Add it to the
  forbidden/positive token sets.
- **PLAN-OPUS-R3-N4 — "effective resource inventory" is an undefined artifact.** Plan line 407 requires
  saving it without naming any producing command or schema (see B2). Name the file, its producer, and
  its fields.
- **PLAN-OPUS-R3-N5 — the Anthropic beta header is safe only by coincidence; assert the precondition.**
  `mergeHeaders` is `Object.assign`-based and lets `model.headers` overwrite Prime's computed
  `anthropic-beta` (`providers/anthropic.ts:225-233, 928-941`). With the frozen fixture this is inert,
  because `useFineGrainedToolStreamingBeta` is `!!tools?.length && !supportsEagerToolInputStreaming`
  (`anthropic.ts:1216`) — false when the compat flag is `true` — and interleaved thinking is skipped for
  adaptive `opus-5`/`sonnet-5` (`anthropic.ts:746-762, 853`). Task 16 should assert that the observed
  `anthropic-beta` equals exactly the configured extended-cache token *and* that tools carry
  `eager_input_streaming: true` (`anthropic.ts:1233`), so a future compat flip cannot silently drop
  `fine-grained-tool-streaming-2025-05-14`.
- **PLAN-OPUS-R3-N6 — Task 5's illustrative command list is incomplete.** Real top-level public commands
  are `help, agents, list, attach, stop, rename, send, schedule, status, doctor, shutdown, mcp, package,
  update, model, session, config` (`cli/command-registry.ts:14-178`, `PUBLIC_COMMAND_NAMES` at
  `181-183`), plus removed `app, daemon, install, manage, remove, uninstall` (`185`) and removed *flags*
  `--list-models` / `--export` handled in `cli/args.ts:275-291`. The plan's prose names only a subset;
  since three of them (`attach`, `status`, `stop`) are also kit wrapper verbs consumed before the
  firewall (plan line 292), the enumeration source and the wrapper-precedence rule should be cited
  explicitly in Task 5 so the "exhaustive table" is reproducible.

---

## Prior-round closure ledger

| Prior finding | Round-3 verdict |
|---|---|
| Opus R2 B1 unreachable Task 1 red | Closed (spawn ENOENT is real) |
| Opus R2 B2 kernel/scripted response infeasible | Closed for mechanics (in-process child, print mode, inherited cwd/depth, exact depth error) |
| Opus R2 B3 red edits file outside Files | Closed (Task 18 red is inside its Files) |
| Opus R2 M1 untested `scripts/gate` | Closed (`tests/gate.test.mjs`) |
| Opus R2 M2 prose compat | Closed (literal JSON, matches `packages/ai/src/types.ts:331-350`) |
| Opus R2 M3 nonzero costs | Closed (zeros, stated as deliberate) |
| Opus R2 M4 Task 4 third seat | Closed (matrix line 63) |
| Opus R2 M5 three modules one red | Closed (Tasks 11-14 split); Task 10 still carries 11 files behind one behavioral red — acceptable for a prompt/docs task |
| Opus R2 M6(a) depth override | **Not closed → B1** |
| Opus R2 M6(b) tracked agent home mutable | Closed (per-run copy; `PRIME_AGENT_CODING_AGENT_DIR` verified at `config.ts:501-502`, `agent-session.ts:9220`) |
| Opus R2 M7 silent package skip | Closed in the launcher; **the Task 15 negative case still cannot show it → B3** |
| Opus R2 M8 status-line commit | Closed (separate post-council commit) |
| Sol R2 B1 `.gitignore` not in Files | Closed |
| Sol R2 M1 no shipped runtime owner | Closed (Task 14 controller + `scripts/workflow-controller`); new ownership defect introduced → M1 |
| Sol R2 M2 non-literal fixture / cost conflict | Closed; provenance sentence still inaccurate → N2 |
| Sol R2 M3 protocol council diversity | Closed |
| Sol R2 M4 per-module reds | Closed |
| Sol R2 M5 placeholder paths | Closed |
| Sol R2 M6 spike is not an effective-runtime oracle | **Not closed → B2** (the frozen command observes neither skills nor collisions nor cwd) |
| Sol R2 N1 npm floor | Closed (npm 10.8.2; note npm itself does not enforce `packageManager`, so the bootstrap script's own comparison is required — as the plan specifies) |
| Sol R2 N2 Gemini `off` wire | Closed (`google.ts:417-425`) |

## Seat questions answered

- **Can Tasks 15-17 produce the claimed artifacts through the real binary/kernel/RLM path?** Task 16 and
  Task 17 — yes. Endpoint shapes are reachable: OpenAI Responses via the official SDK with
  `baseURL: model.baseUrl` (`providers/openai-responses.ts:212`) giving `POST /v1/responses`; Anthropic
  with `baseURL: model.baseUrl` (`anthropic.ts:930`) giving `/v1/messages`; Google via `@google/genai`
  with `httpOptions.baseUrl` and `apiVersion: ""` (`google.ts:328-339`, stream at `86`) giving
  `/v1beta/models/…:streamGenerateContent`. Print mode is available (`-p` / `--print`,
  `cli/args.ts:178`; `--mode`, `args.ts:102`) and `--model` accepts a selector (`args.ts:133`).
  Task 15 — **no**, as written (B2, B3).
- **Is runtime agent-home immutability sound?** Yes for tracked state, given the per-run copy; the
  package cache location (`package-manager.ts:1871`) makes it network-costly (M3).
- **Is depth enforcement runtime-enforced?** Only across runs and for child admission
  (`agent-session.ts:10214-10218`). Not within an interactive run (B1).
- **Response-stream feasibility for scripted loopback servers?** Feasible; all three dialects go through
  vendor SDKs against an arbitrary base URL, and terminating SSE sequences are scriptable. The plan's
  requirement that the fixture must already start and emit a valid terminating response before the red
  counts is the right guard.
- **Package install semantics / CLI forms?** Install is `npm ci --prefix toolchain` against a lock that
  must pin the three internal artifacts, because the release CLI package rewrites its internal
  dependencies to absolute tarball URLs (`scripts/pack-prime-agent-release.mjs:154-166, 265-271`) and is
  renamed to `prime-agent` with bin `prime-agent` (`pack-prime-agent-release.mjs:20-30, 186-196`) — the
  plan's Task 1 wording matches this reality.

## Verdict

**3 Blockers, 3 Majors, 6 Minors — not accepted.** B1 removes a guarantee the design treats as
runtime-enforced; B2 and B3 leave Task 15 unable to satisfy its own frozen acceptance contract; M1 makes
two tasks unable to reach green under the plan's own file-ownership rule; M2 makes a stated validation
rule unsatisfiable; M3 hides a hard operational prerequisite. All five are fixable by re-specification
without architectural change, and none of the round-2 closures I could verify were found to be cosmetic
other than the ones listed above.

## Sources

Prime Agent 0.8.1 (`bc0fa76`): `packages/coding-agent/package.json:3, 10-12, 44`;
`packages/coding-agent/postinstall.cjs:5-14`; `src/postinstall.ts:4-5, 23-32`;
`src/config.ts:490-504`; `src/main.ts:140-155, 766-773, 1095-1107, 1596-1611, 1637-1639`;
`src/cli/args.ts:66, 81, 100-102, 128-178, 275-312`; `src/cli/command-registry.ts:14-195`;
`src/cli/public-command.ts:110, 142, 255, 318-339`; `src/cli/list-models.ts`;
`src/core/agent-session-services.ts:23, 89-135, 175-215`;
`src/core/agent-session.ts:1555-1589, 4424-4425, 8823-8828, 9198-9220, 9307-9349, 10200-10320`;
`src/core/agent-session-runtime.ts:25, 77, 101`; `src/core/extensions/runner.ts:281-315, 949-978,
1045-1073`; `src/core/extensions/types.ts:628, 1018, 1129-1191, 1336-1337`;
`src/core/extensions/loader.ts:333-346, 465`; `src/core/model-registry.ts:768-778, 1025-1027,
1073-1110, 1188-1191`; `src/core/package-manager.ts:171, 195-197, 859-863, 1206-1243, 1372-1392,
1854-1900, 1975-2008, 2143-2149`; `src/core/prompt-templates.ts:207-265`;
`src/core/settings-manager.ts:136, 772-777`; `src/core/skills.ts:443-473, 522-547, 566-621`;
`src/core/slash-commands.ts:175`; `src/core/system-prompt.ts:31, 66-91, 129-172`;
`src/core/telemetry.ts:195-219`; `src/core/diagnostics.ts:11-14`;
`src/modes/print-mode.ts:1-52`; `src/modes/agent-connection/in-process-agent-connection.ts:109-112`;
`src/modes/agent-connection/types.ts:97-100`;
`src/modes/interactive/interactive-mode.ts:2125-2194, 4606-4638, 4700-4763, 9134-9146`;
`src/utils/git.ts:24-77, 100-195`; `test/slash-commands.test.ts:260`;
`test/package-manager.test.ts:743, 1619, 1804-1808`;
`packages/ai/src/models.ts:67-97`; `packages/ai/src/types.ts:56, 331-350, 451-461, 465-471`;
`packages/ai/src/models.generated.ts:2219-2240, 2289-2310, 5078-5095, 8424-8460`;
`packages/ai/src/providers/openai-responses.ts:30-70, 212, 251-260`;
`packages/ai/src/providers/anthropic.ts:52-76, 170-175, 225-233, 740-830, 845-941, 990-1000,
1216-1240`; `packages/ai/src/providers/google.ts:86, 328-339, 405-465`;
`packages/agent/src/proxy.ts:54, 93`; `scripts/pack-prime-agent-release.mjs:18-30, 100-120, 154-196,
265-275`.

Superpowers v6.3.0 (`b36e082`): `skills/` inventory (14 skills);
`skills/subagent-driven-development/SKILL.md:88, 91, 117-127, 453-454, 487, 567`;
`skills/subagent-driven-development/scripts/{sdd-workspace,task-brief,review-package}`;
`skills/using-superpowers/SKILL.md:2, 30-31, 57`; `skills/using-superpowers/references/pi-tools.md`;
`skills/requesting-code-review/code-reviewer.md`; `skills/brainstorming/SKILL.md:2`.

Kit specs: `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md:7-20, 27, 42, 48, 63, 152,
162-167, 288-292, 323-341, 371, 401-408`;
`docs/specs/2026-08-26-prime-superpowers-design.md:90, 168`;
`docs/reviews/plan-opus-round-2.md`; `docs/reviews/plan-sol-round-2.md`.
