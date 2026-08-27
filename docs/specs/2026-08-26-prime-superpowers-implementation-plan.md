# Prime Superpowers CLI Implementation Plan

Status: draft, round 1 findings incorporated

Design source: `docs/specs/2026-08-26-prime-superpowers-design.md`

## Execution contract

- Task 0 creates an isolated worktree and `prime/kit-build-<run-id>` branch. No implementation commit lands on `main` or `master`.
- The authoritative ledger is `.superpowers/sdd/2026-08-26-prime-superpowers-implementation-plan/progress.md` in that worktree. It records the target, worktree, branch, starting commit, plan hash, frozen acceptance commands, `BASE`, `HEAD`, red/green evidence, reviews, rulings, and outcome data.
- Implement one numbered task at a time. A workflow worker owns product/test edits, red and green runs, gates, report, and commit. The coordinator only updates orchestration artifacts.
- Every task has two red checkpoints when it introduces a module: an exact import/absence failure, followed by an importable fail-closed stub and the named behavioral assertion shown below. Green is not valid unless both are recorded.
- Red/green evidence records command, cwd, start/end timestamps, exit status, named failing subtest, stable failure substring, output-artifact path, and pre/post commit and tree hashes.
- After green, record `HEAD`, build `BASE..HEAD`, and dispatch the sealed primary reviewer. Ordinary tasks also receive one cross-family reviewer. Protocol, security, persistence, and concurrency tasks receive Sol, Opus, and Gemini seats with an implementer outside the sealed Sol seat.
- Review rounds are a loop with fresh reviewers and revised immutable ranges. The cap is five rounds; rounds four and five use frontier tiers. A Blocker/Major downgrade requires written concurrence from another family. A nonzero round-five result stops for the operator.
- Extend `tests/test-package.sh` in the same task that introduces a package-owned path.
- No task may modify paths outside its `Files` list. A new dependency requires a plan amendment and fresh plan review.
- Do not push, merge, release, or delete worktrees during implementation.

## Stage-aware gates

Task 1 creates `scripts/gate`; it discovers existing files by shebang/extension, uses null-safe file lists, and never passes literal unmatched globs. From Task 1 onward every task runs:

```bash
scripts/gate
```

The gate always runs `git diff --check`, `bash tests/test-package.sh`, shell syntax over existing POSIX shell files, and `node --test` over existing `tests/*.test.mjs`. It runs toolchain identity tests only after Task 1, launcher tests after Task 4, and later suites from the task that introduces them. Absence before introduction is skipped; absence after introduction is a failure. `toolchain/package.json` has no decorative `test` script, and the gate does not call `npm test --prefix toolchain`.

## Model profile fixture

Task 2 commits `tests/fixtures/model-profiles.json`; tests compare exported records to it. The source rows are Prime Agent 0.8.1 `packages/ai/src/models.generated.ts`: OpenAI 8424-8460, Anthropic 2219-2240 and 2289-2310, Google 5078-5099. Proxy provider and base URL replace only the source transport fields.

| Role | ID/name | API | Input | Cost in/out/cache read/write | Context/max | Complete thinking map | Required compat |
|---|---|---|---|---|---|---|---|
| Sol | `gpt-5.6-sol` / GPT-5.6 Sol | `openai-responses` | text,image | 4/20/0.4/5 | 1,050,000/128,000 | off=`none`, minimal=null, low=`low`, medium=`medium`, high=`high`, xhigh=`xhigh`, max=`max` | supports long cache retention |
| Terra | `gpt-5.6-terra` / GPT-5.6 Terra | `openai-responses` | text,image | 2/12/0.2/2.5 | 1,050,000/128,000 | off=`none`, minimal=null, low=`low`, medium=`medium`, high=`high`, xhigh=`xhigh`, max=`max` | supports long cache retention |
| Opus | `claude-opus-5` / Claude Opus 5 | `anthropic-messages` | text,image | 5/25/0.5/6.25 | 1,000,000/128,000 | off=`off`, minimal=null, low=`low`, medium=`medium`, high=`high`, xhigh=`xhigh`, max=`max` | adaptive thinking and eager tool input streaming |
| Sonnet | `claude-sonnet-5` / Claude Sonnet 5 | `anthropic-messages` | text,image | 2/10/0.2/2.5 | 1,000,000/128,000 | off=`off`, minimal=null, low=`low`, medium=`medium`, high=`high`, xhigh=`xhigh`, max=`max` | adaptive thinking and eager tool input streaming |
| Gemini | `gemini-3.1-pro-preview` / Gemini 3.1 Pro Preview | `google-generative-ai` | text,image | 2/12/0.2/0 | 1,048,576/65,536 | off=null, minimal=null, low=`LOW`, medium=null, high=`HIGH`, xhigh=null, max=null | none |

All records have `reasoning: true`. Provider IDs are `prime-proxy-openai`, `prime-proxy-anthropic`, and `prime-proxy-google`. The Anthropic `anthropic-beta` key is omitted when the configured extended-cache token is empty.

## Ownership classification

- **Runtime-enforced:** extension discovery, provider/model visibility, package loading/collisions, effective `rlmMaxDepth`, root cwd, child admission and depth rejection. Task 12 exercises the real pinned binary.
- **Helper-enforced:** argument firewall, worktree/run state, deadlines, retries, cancellation reconciliation, ledger schema, admissions, report quarantine, finding attribution, policy history, and outcome schema. Tasks 5-7 and 10 implement pure modules with injected adapters.
- **Prompt-only:** no coordinator product edits, novelty/value-hypothesis steps, reviewer independence, role selection, real-source verification, and real-format performance discipline. Task 9 tests exact contract text and Task 12 verifies effective prompt separation, but final compliance is review evidence rather than a false mechanical claim.

## Accepted layout amendment

This plan is the exact implementation file manifest and supersedes the design document's illustrative repository tree. The added `lib/` modules separate pure, testable policy from shell adapters; `scripts/gate`, `LICENSE`, `.gitignore`, `UPSTREAM.md`, fixtures, and CI are package-support files. The provider test is consistently named `tests/provider-config.test.mjs`. No provider, runtime, skill-precedence, worktree, or SDD architecture changes.

## Task and review matrix

| Task | Implementer | Sealed primary | Additional seats |
|---|---|---|---|
| 1 | Terra | Opus | Sol |
| 2 | Sol | Opus | Gemini |
| 3 | Sol | Opus | Gemini |
| 4 | Terra | Sol | Opus |
| 5 | Terra | Sol | Opus, Gemini |
| 6 | Terra | Sol | Opus, Gemini |
| 7 | Terra | Sol | Opus, Gemini |
| 8 | Opus | Sol | Gemini |
| 9 | Opus | Sol | Gemini |
| 10 | Terra | Sol | Opus, Gemini |
| 11 | Terra | Sol | Opus |
| 12 | Terra | Sol | Opus, Gemini |
| 13 | Sonnet | Sol | Opus, Gemini |

## Task 0: Establish the kit-build worktree and ledger

**Depends on:** approved implementation plan.

**Files:** `.superpowers/sdd/2026-08-26-prime-superpowers-implementation-plan/progress.md` only; this path is ignored by `.superpowers/sdd/.gitignore`.

**Procedure:** Initialize the local repository if needed, commit the approved specs/reviews as the immutable baseline, create an external worktree on `prime/kit-build-<run-id>`, and run all remaining tasks there. Record roots, branch, starting commit, plan SHA-256, acceptance commands, and frozen implementation range. This is orchestration setup, not a product commit.

**Acceptance:** `git rev-parse --abbrev-ref HEAD` is neither `main` nor `master`; the ledger roots equal the active worktree; `git status --short` does not show `.superpowers/sdd`; and the recorded plan hash matches `sha256sum`.

## Task 1: Repository skeleton, gate, and verified Prime toolchain

**Depends on:** Task 0.

**Files:** `.gitignore`, `LICENSE`, `toolchain/package.json`, `toolchain/package-lock.json`, `toolchain/SHA256SUMS`, `scripts/bootstrap-toolchain`, `scripts/gate`, `tests/toolchain.test.mjs`, `tests/test-package.sh`, `tests/fixtures/toolchain/`.

**Red:**

```bash
node --test tests/toolchain.test.mjs
```

First red exits 1 at named subtest `bootstrap rejects unsupported Node` with `ERR_MODULE_NOT_FOUND`. After an importable fail-closed shell fixture exists, the behavioral red exits 1 with `not ok ... Node 22.7.0 is rejected before npm` and diagnostic `expected E_NODE_VERSION before E_NPM`.

**Green behavior:**

- Semantically reject Node below 22.8.0 before `npm ci` and before credentials enter the environment.
- `toolchain/package.json` pins the official 0.8.1 main release tarball; the committed lock pins all transitive public and three internal release artifacts.
- `npm ci --prefix toolchain` is the enforcing install gate. Verify installed package identity, lockfile integrity, and binary output exactly `0.8.1`.
- `toolchain/SHA256SUMS` records all four published SHA-256 values. `bootstrap-toolchain --verify-downloads` is the explicit network-dependent comparison that downloads to a temporary directory, hashes bytes, and deletes them. Offline unit tests validate its mismatch behavior with local fixture tarballs, not self-matching constants.
- `scripts/gate` is shebang-aware, null-glob safe, and activates suites only after their introducing task.
- Ignore `toolchain/node_modules`, agent runtime state, `.state`, secrets, `.worktrees`, and temporary downloads.

**Acceptance:** `node --test tests/toolchain.test.mjs`; `bash tests/test-package.sh`; `scripts/gate`. Network checksum verification is recorded once during this task and thereafter available through doctor live/provenance mode.

## Task 2: Pure environment and frozen provider configuration

**Depends on:** Task 1.

**Files:** `lib/config.mjs`, `tests/provider-config.test.mjs`, `tests/fixtures/model-profiles.json`, `tests/fixtures/env/`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/provider-config.test.mjs
```

First red is exact module absence. Behavioral red is named `derives three native proxy roots` and includes `expected anthropic=https://proxy.example, actual=https://proxy.example/v1`.

**Green behavior:**

- Parse `.env` as non-executing data with kit `.env`, target `.env`, kit `.env.local`, target `.env.local`, process environment precedence.
- Protect kit controls and redact secrets from errors and debug objects.
- Normalize one proxy root into OpenAI `/v1`, Anthropic bare root, and Google `/v1beta`; complete protocol-specific overrides remain unchanged.
- Validate bearer/native auth. Register unique providers with `PRIME_LLM_KEY`; never override built-ins or read provider-specific operator credentials.
- Export exactly the five frozen model records above. Alias overrides must retain the required family token and may change only transport ID.
- Omit `anthropic-beta` entirely for an empty cache-beta token. Otherwise include only the configured extended-cache token.

**Acceptance:** table tests cover malicious env syntax, precedence, empty/complete overrides, trailing slashes, auth, all thinking levels, aliases, redaction, empty header omission, every literal profile field, and `scripts/gate`.

## Task 3: Prime-loadable extension and universal child prompt

**Depends on:** Task 2.

**Files:** `agent-home/extensions/prime-superpowers.js`, `agent-home/settings.json`, `agent-home/AGENTS.md`, `agent-home/prompts/coordinator.md`, `agent-home/prompts/child.md`, `tests/extension.test.mjs`, `tests/fixtures/extension-api.mjs`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/extension.test.mjs
```

First red is exact module absence. Behavioral red is `before_agent_start selects child prompt at depth one` with `expected CHILD_CONTRACT, received COORDINATOR_CONTRACT`.

**Green behavior:**

- Load only from `.js`; import `lib/config.mjs` by relative ESM URL or `pathToFileURL`, including a Windows-path fixture.
- Register providers through Prime's extension API without overriding built-ins.
- Use `before_agent_start`, inspect `systemPromptOptions.rlmDepth`, and return `systemPrompt` idempotently on every turn. Depth zero receives the coordinator contract; depth greater than zero receives one universal role-neutral child tool contract.
- Worker versus reviewer policy is carried in each validated dispatch prompt, never inferred from depth or child name.
- Contracts name only `ipython`, `Path`, `bash`, `rlm`, `rlm.find_models`, and `agent_message.send(receiver_role="parent")`; removed `read`/`write`/`grep`/`ls` tool mappings are forbidden. Children must `os.chdir(worktree_root)`.
- Settings enforce `rlmMaxDepth: 1` and pin `git:github.com/obra/superpowers@v6.3.0` with `extensions: []`.

**Acceptance:** provider registration payloads, repeated-turn prompt replacement, depth split, package filter, no built-in collisions, positive/negative tool vocabulary, cross-platform import resolution, and `scripts/gate`.

## Task 4: Launcher shell, invariant environment, and process forwarding

**Depends on:** Tasks 1 and 3.

**Files:** `prime`, `prime.cmd`, `lib/launcher-process.mjs`, `tests/launcher-process.test.mjs`, `tests/fixtures/bin/fake-prime`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/launcher-process.test.mjs
```

First red is exact module absence. Behavioral red is `preflight precedes credential export and spawn` with `expected preflight,credentials,spawn; got credentials,preflight,spawn`.

**Green behavior:**

- Provide a POSIX entry point and a `prime.cmd` WSL forwarder with `%*`, clear missing-WSL diagnostic, and nonzero exit; validate its command text and argument forwarding fixture.
- Resolve kit paths without changing target state. Invoke Node/toolchain preflight before credential loading.
- Spawn the absolute verified binary with invariant `PRIME_AGENT_CODING_AGENT_DIR`, `PI_CACHE_RETENTION=long`, telemetry opt-out, exact Sol selector, and inherited target worktree cwd supplied by later resolver code.
- Forward child exit status and termination signals. Never log secrets.

**Acceptance:** ordering, environment, selector, exit/signal forwarding, redaction, batch wrapper assertions, and `scripts/gate`.

## Task 5: Deny-by-default argument firewall

**Depends on:** Task 4.

**Files:** `lib/argv-firewall.mjs`, `tests/argv-firewall.test.mjs`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/argv-firewall.test.mjs
```

First red is exact module absence. Behavioral red is `rejects public command in first positional slot` with `expected E_PUBLIC_COMMAND, got allowed argv`.

**Green behavior:**

- Put invariant internal model arguments before all accepted user arguments.
- Allow only documented presentation/headless forms and validate split/equal/repeated values.
- Reject public/removed subcommands, unknown flags, all short aliases not explicitly allowed, provider/model/thinking/cwd/system/resource overrides, daemon/ACP/offline/goal/session controls, and `--no-session`.
- Implement `--unsafe-prime-args` only with an unmistakable guarantees-disabled banner and interactive confirmation. Reject it in print, JSON, RPC, piped, or other non-TTY modes.
- Export structured redacted diagnostics and the exact forwarded argv.

**Acceptance:** exhaustive table over Prime 0.8.1 public and removed commands, aliases, safe flags, unsafe TTY accept/decline, headless refusal, prompt positionals, and `scripts/gate`.

## Task 6: Target repository and isolated worktree resolution

**Depends on:** Task 5.

**Files:** `lib/worktree.mjs`, `tests/worktree.test.mjs`, `tests/fixtures/git/`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/worktree.test.mjs
```

First red is exact module absence. Behavioral red is `creates run branch before returning cwd` with `expected prime/run-test, got main`.

**Green behavior:**

- Resolve and validate the real target git root and starting commit.
- Create or select one isolated worktree and `prime/<run-id>` branch before Prime starts; return the worktree as session cwd.
- Support external worktrees and explicit in-repository `.worktrees/`. For in-repository mode update only `.git/info/exclude`; never create a tracked ignore rule.
- Fail closed on dirty-state ambiguity, existing branch mismatch, linked-worktree collision, non-repository target, or path escape.
- Never mutate or delete a worktree on validation failure.

**Acceptance:** temporary real git repositories cover external/in-repo paths, dirty targets, branch collisions, symlinks, excludes, unchanged tracked tree, and `scripts/gate`.

## Task 7: Persistent run registry and lifecycle commands

**Depends on:** Tasks 4 and 6.

**Files:** `lib/run-registry.mjs`, `lib/launcher.mjs`, `tests/run-registry.test.mjs`, `tests/launcher.test.mjs`, `tests/fixtures/bin/fake-prime-session`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/run-registry.test.mjs tests/launcher.test.mjs
```

First red is exact module absence. Behavioral red is `second live coordinator is refused` with `expected E_RUN_ACTIVE, got second spawn`.

**Green behavior:**

- Implement `run`, `attach`, `status`, and `stop` over one atomic clone-local record containing agent home, target, worktree, branch, parent session identity, PID/start identity, timestamps, and state.
- Preserve the exact parent session across TUI detach. Attach/status/stop may address only the recorded parent.
- Refuse a second live or retained coordinator. Stale/ambiguous takeover is interactive only; unrecoverable parent loss transitions to `orphaned` without spawning a duplicate.
- Use advisory clone locking, atomic write/rename/fsync, schema versioning, corruption diagnostics, and injected clock/process adapters.
- Compose preflight, firewall, worktree, registry, and process modules without reopening their behavior.

**Acceptance:** live/detached/stale/orphaned states, PID reuse, lock contention, corrupt/partial records, exact session addressing, non-TTY takeover rejection, signal/exit propagation, and `scripts/gate`.

## Task 8: Pinned Superpowers vendoring and collision-safe resources

**Depends on:** Task 3.

**Files:** `agent-home/skills/using-superpowers/`, `agent-home/skills/subagent-driven-development/`, `UPSTREAM.md`, `tests/skills-vendor.test.mjs`, `tests/fixtures/plans/minimal.md`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/skills-vendor.test.mjs
```

First red is exact missing directory. Behavioral red is `all overriding-skill relative links resolve locally` with a missing localized `final-reviewer-prompt.md` path.

**Green behavior:**

- Copy the two whole-directory overrides from Superpowers v6.3.0 and include every required sibling template, script, and reference because Prime shadows by skill name at directory granularity.
- Localize upstream `requesting-code-review/code-reviewer.md` as `final-reviewer-prompt.md`.
- Exclude and unreference `pi-tools.md`, upstream extension loading, and all claims that Pi has no native subagent.
- Preserve vendored helpers byte-for-byte and record upstream commit, source path, upstream SHA-256, local SHA-256, and intentional skill-body diffs.
- Set executable bits on every vendored script and validate frontmatter names and links.
- Exercise real helper interfaces in a temporary git repo: `sdd-workspace PLAN_FILE`, `task-brief PLAN_FILE N OUTFILE`, and `review-package PLAN_FILE BASE HEAD OUTFILE`. Assert an ignored `.superpowers/sdd` workspace and a non-empty committed diff package.

**Acceptance:** `node --test tests/skills-vendor.test.mjs`; direct fixture invocations of all three helpers; `scripts/gate`.

## Task 9: Prime-native SDD, novelty, and model-routing policy

**Depends on:** Tasks 3 and 8.

**Files:** adapted `agent-home/skills/using-superpowers/SKILL.md`, adapted `agent-home/skills/subagent-driven-development/SKILL.md`, `agent-home/skills/prime-rlm-dispatch/SKILL.md`, `agent-home/skills/model-policy/SKILL.md`, their local prompt templates, `tests/workflow-contract.test.mjs`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/workflow-contract.test.mjs
```

First red is exact skill absence. Behavioral red is `dispatch contract requires disk report and parent signal` with missing token `agent_message.send(receiver_role="parent")`.

**Green behavior:**

- Freeze novelty discovery before spec finalization: value hypothesis, competing approaches, cost-if-wrong, real-source/real-format spike when risk exists, and Opus frontier seat.
- Route Sol max to coordination, gates, and bounded hard implementation; Opus high to novelty/architecture/frontier work; Terra max to bounded implementation; Sonnet high only to fully specified mechanical work; Gemini high to large-context blind-spot review and never implementation.
- Require one exact `rlm.find_models` resolution pass and full provider/model selector dispatches. Every prompt includes a validated role marker, worktree root, immutable input/range, mutation policy, output report path, deadline, and parent notification.
- Encode the user’s incremental SDD/TDD principles, no coordinator product edits, one item at a time, fresh review loops, real-source verification, and format-identical performance evidence.
- State which obligations are prompt-only. Do not claim that depth distinguishes workers from reviewers or that RLM returns child results.

**Acceptance:** exact positive and forbidden token sets, role/model/effort matrix, no Gemini implementation path, report/deadline/cwd contract, upstream-link integrity, and `scripts/gate`.

## Task 10: Workflow state, ledger, and policy-history enforcement

**Depends on:** Tasks 7 and 9.

**Files:** `lib/workflow-state.mjs`, `lib/ledger.mjs`, `lib/policy-history.mjs`, `tests/workflow-state.test.mjs`, `tests/ledger.test.mjs`, `tests/policy-history.test.mjs`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/workflow-state.test.mjs tests/ledger.test.mjs tests/policy-history.test.mjs
```

First red is exact module absence. Behavioral red is `timed-out attempt cannot be retried before cancellation tombstone` with `expected E_CLEANUP_UNCONFIRMED, got retry admitted`.

**Green behavior:**

- Implement pure, schema-versioned transitions with injected clock and RLM adapters for admitted, queued, running, reported, completed, failed, timed-out, cleanup-failed, retrying, and quarantined-late-report states.
- Persist `admitted_at`, `started_at`, `last_progress_at`, `deadline_at`, unique attempt ID/name, model selector, report path, and parent session. Reconstruct deadlines after attach without resetting clocks.
- Require `rlm.delete_subagent` confirmation/tombstone before one fresh-name retry; reject duplicate live attempts; quarantine late reports. Cancellation uncertainty becomes `cleanup-failed`.
- Enforce discovery/spec cap 20, per-task cap 12, run cap 80, five review rounds, cannot-verify gate, deferred-Minor handoff, sealed primary findings, unique later-seat attribution, and independent cross-family severity-downgrade concurrence.
- Append redacted records to ignored clone-local `.state/policy-history.jsonl`; use atomic append/locking. Provide explicit export/import so an operator can preserve history across clones.
- Define the first-production outcome schema: frozen criteria results, rounds, interventions, elapsed time, admissions/available usage by seat, unique accepted findings and effects, and simplicity verdict.

**Acceptance:** deterministic fake-clock and fake-RLM tests cover all transitions, restart clocks, caps, attribution, concurrence, corruption, concurrent append, secret rejection, outcome missing-field gate, and `scripts/gate`.

## Task 11: Static doctor and credential-free diagnostics

**Depends on:** Tasks 1-10.

**Files:** `scripts/doctor`, `lib/doctor.mjs`, `tests/doctor.test.mjs`, `tests/fixtures/doctor/`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/doctor.test.mjs
```

First red is exact module absence. Behavioral red is `static doctor passes structural checks without proxy secrets` with `expected exit 0, got E_MISSING_KEY`.

**Green behavior:**

- Static mode verifies Node, toolchain identity, extension filename/settings, skills/provenance, selectors, URL roots, auth mode, protected variables, executable bits, `rg`, `fd`, and Python/IPython prerequisites.
- Missing proxy credentials in static mode are a notice, not failure. `--live` requires credentials.
- `--verify-downloads` invokes Task 1’s network checksum path explicitly.
- Diagnostics distinguish prerequisite, unreachable, unauthorized, path/dialect mismatch, missing model, unsupported effort, and corrupt state without exposing key material.

**Acceptance:** secret-free structural fixture exits zero; structural defects fail with stable codes; live-without-key fails; redaction snapshots pass; `scripts/doctor`; `scripts/gate`.

## Task 12: Packaged Prime runtime integration and native-wire spike

**Depends on:** Tasks 1-11.

**Files:** `tests/prime-runtime.test.mjs`, `tests/wire-probe.test.mjs`, `tests/fixtures/mock-proxy.mjs`, `tests/fixtures/runtime-target/`, `scripts/install-superpowers-package`, `tests/test-package.sh`.

**Red:**

```bash
node --test tests/prime-runtime.test.mjs tests/wire-probe.test.mjs
```

The installed binary already exists, so the first required red is behavioral: named subtest `real Prime lists prime-proxy-openai model` fails with `selector prime-proxy-openai/gpt-5.6-sol not found`. No missing-module red counts for this task.

**Green behavior:**

- Install the pinned Superpowers package into an isolated temporary agent home through the real Prime package mechanism; fail closed with a clear offline/clone diagnostic.
- Run the checksum/lock-verified Prime 0.8.1 binary headlessly against a temporary real git target and the kit agent home. No fake Prime executable is allowed.
- Assert effective extension discovery, all three provider/model selectors, intended skill collision winners/losers, filtered package extension, `rlmMaxDepth: 1` despite an operator-home value of 2, root worktree cwd, universal child prompt, and grandchild rejection.
- Bind protocol mock servers to `127.0.0.1:0`. Capture real serializer requests for OpenAI Responses `/v1/responses`, Anthropic `/v1/messages`, and Google `/v1beta/models/...`.
- Assert bearer/native auth, text/image declarations, exact effort fields, OpenAI 24-hour retention under `PI_CACHE_RETENTION=long`, Anthropic `cache_control` `ttl: 1h`, optional extended-cache-only beta header, eager tool-input shape, and Gemini LOW/HIGH.
- Use only sentinel credentials and local loopback. Record the risky-unknown spike result and any plan amendment it forces.

**Acceptance:** `node --test tests/prime-runtime.test.mjs tests/wire-probe.test.mjs`; `scripts/doctor`; `scripts/gate`. The runtime integration suite may be a separately labeled network-bootstrap CI job, but once dependencies/package cache are present its provider calls remain local and secret-free.

## Task 13: Operator documentation, CI, and outcome evidence

**Depends on:** Tasks 1-12.

**Files:** `README.md`, `.env.example`, `AGENTS.md`, `.github/workflows/ci.yml`, `UPSTREAM.md`, `docs/reviews/README.md`, `docs/reviews/outcome-kit-build.md`, `.state/policy-history.jsonl` during the run only, and status lines in the design/plan.

**Red:**

```bash
bash tests/test-package.sh
```

The exact failing assertion is `not ok required operator document README.md` followed by analogous named missing-deliverable checks. A generic shell or glob failure does not count.

**Green behavior:**

- Document clone, Node >=22.8.0, two-variable quick start, toolchain install, target/worktree behavior, `run/attach/status/stop`, safe flags, unsafe escape hatch, model matrix, native protocol roots, auth overrides, Anthropic 1-hour caching, static/live doctor, package bootstrap, and recovery.
- Explain that Prime-RL weight/policy training is not used; this is an orchestration policy over Prime Agent RLM children.
- State POSIX/macOS/Linux/WSL support and the Windows-to-WSL wrapper.
- CI pins Node 22.8.0 and a current supported LTS. Separate offline syntax/unit/package jobs from the network toolchain/package bootstrap plus real-runtime job. No real proxy secret is required.
- Produce `outcome-kit-build.md` with frozen acceptance pass/fail, per-task rounds, interventions, elapsed time, admissions/available usage by seat, unique material findings, and a simplicity reviewer’s explicit verdict on whether the ceremony produced value.
- Append the kit-build policy record as run one, export a redacted copy into the outcome document, and leave `.state/` ignored.

**Acceptance:**

```bash
scripts/gate
scripts/doctor
git diff --check
```

Then dispatch one whole-branch Sol/Opus/Gemini council over the initial implementation range. This is the only final council for Task 13. Apply fixes through fresh worker tasks, rerun all gates, and repeat fresh reviews until zero Blocker/Major or the five-round operator stop.

## Round 1 resolution record

- **Broken common gates:** replaced with one stage-aware, shebang-aware `scripts/gate`; removed undefined npm test script.
- **Fixture-only integration:** added Task 12 using the real pinned binary, real package mechanism, real temporary git repo, real extension loader, and native serializers against loopback mocks.
- **Invalid helper command:** replaced `sdd-workspace --help` with exact upstream argument forms and real git fixtures.
- **Oversized tasks:** split launcher process, firewall, worktree, registry, vendoring, policy, workflow state, doctor, and runtime integration.
- **Lifecycle ownership:** frozen into pure helper modules with injected clock/RLM adapters; prompt-only obligations are labeled.
- **Role selection:** depth selects root versus universal child only; each dispatch prompt carries validated worker/reviewer role policy.
- **Model metadata:** frozen in a literal five-row fixture sourced from Prime 0.8.1.
- **Missing surfaces:** assigned unsafe args, `.git/info/exclude`, `prime.cmd`, Node preflight wiring, package install, policy history, and outcome evaluation.
- **Portability/minors:** harmonized `provider-config.test.mjs`, ephemeral loopback ports, credential-free static doctor, ESM file URL handling, script modes, tool prerequisites, explicit dependencies, and one nonduplicated final council.
