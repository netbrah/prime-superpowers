# Prime Superpowers CLI Implementation Plan

Status: accepted for execution after a single-pass repair of round-3 findings

Design source: `docs/specs/2026-08-26-prime-superpowers-design.md`

Open findings register: `docs/specs/open-findings.md`

**Gate posture.** The zero-Blocker/zero-Major plan gate was deliberately relaxed after design round 6 to avoid livelock in review iteration. This plan received one bounded repair pass covering execution-blocking defects only: Task 8's incomplete `Files` manifest, Task 15's nonexistent `model list --json` oracle, the missing `E_PACKAGE_UNRESOLVED` emitter, unfrozen cross-batch interfaces, and non-disjoint batch partitioning. Every remaining finding is recorded in the register with an owning task and the evidence required to close it. Findings are resolved at implementation time against real evidence rather than by further review rounds.

**Phase 2 execution model.** Tasks 0 and 1 run sequentially, then Batches A, B, and C run in parallel with **no per-task review gate**, then Tasks 15-18 run sequentially. One tri-model review covers the entire implementation at the end and must also adjudicate the register.

## Execution contract

- Task 0 creates an isolated worktree and `prime/kit-build-<run-id>` branch. No implementation commit lands on `main` or `master`.
- The authoritative ledger is `.superpowers/sdd/2026-08-26-prime-superpowers-implementation-plan/progress.md` in that worktree. It records the target, worktree, branch, starting commit, plan hash, frozen acceptance commands, `BASE`, `HEAD`, red/green evidence, reviews, rulings, and outcome data.
- Implement one numbered task at a time. A workflow worker owns product/test edits, red and green runs, gates, report, and commit. The coordinator only updates orchestration artifacts.
- Every task that introduces an imported ESM module has two red checkpoints: an exact import failure, followed by an importable fail-closed stub and the named behavioral assertion shown below. Shell-owned, directory-owned, and composition tasks state their own reachable absence and behavioral signatures. Green is not valid unless every task-specific checkpoint is recorded.
- Red/green evidence records command, cwd, start/end timestamps, exit status, named failing subtest, stable failure substring, output-artifact path, and pre/post commit and tree hashes.
- After green, record `HEAD`, build `BASE..HEAD`, and dispatch the sealed primary reviewer. Ordinary tasks also receive one cross-family reviewer. Protocol, security, persistence, and concurrency tasks receive Sol, Opus, and Gemini seats with an implementer outside the sealed Sol seat.
- Review rounds are a loop with fresh reviewers and revised immutable ranges. The cap is five rounds; rounds four and five use frontier tiers. A Blocker/Major downgrade requires written concurrence from another family. A nonzero round-five result stops for the operator.
- Declare package-owned paths by writing `tests/package-manifest.d/<NN>-<name>.sh` in the same task that introduces them. Never edit `tests/test-package.sh` after Task 1; it is a fixed driver, and a shared append target would make parallel batches conflict.
- No task may modify paths outside its `Files` list. A new dependency requires a plan amendment and fresh plan review.
- Do not push, merge, release, or delete worktrees during implementation.

## Stage-aware gates

Task 1 creates `scripts/gate`; it discovers existing files by shebang/extension, uses null-safe file lists, and never passes literal unmatched globs. From Task 1 onward every task runs:

```bash
scripts/gate
```

The gate always runs `git diff --check`, `bash tests/test-package.sh`, shell syntax over existing POSIX shell files, and `node --test` over existing `tests/*.test.mjs`.

`tests/test-package.sh` is created once in Task 1 and never modified again. It is a driver that sources every `tests/package-manifest.d/*.sh` fragment in sorted order and emits their TAP assertions under one plan count. Each fragment declares only the paths its own task introduces, so every task writes exactly one file that no other task touches. A fragment that references a path outside its task's `Files` list is a gate failure.

The gate runs toolchain identity tests only after Task 1, launcher tests after Task 4, and later suites from the task that introduces them. Absence before introduction is skipped; absence after introduction is a failure. `toolchain/package.json` has no decorative `test` script, and the gate does not call `npm test --prefix toolchain`.

## Model profile fixture

Task 2 commits `tests/fixtures/model-profiles.json`; tests compare exported records to it. The source rows are Prime Agent 0.8.1 `packages/ai/src/models.generated.ts`: OpenAI 8424-8460, Anthropic 2219-2240 and 2289-2310, Google 5078-5099. Proxy provider and base URL replace only the source transport fields.

| Role | ID/name | API | Input | Cost in/out/cache read/write | Context/max | Complete thinking map | Required compat |
|---|---|---|---|---|---|---|---|
| Sol | `gpt-5.6-sol` / GPT-5.6 Sol | `openai-responses` | text,image | 0/0/0/0 | 1,050,000/128,000 | off=`none`, minimal=null, low=`low`, medium=`medium`, high=`high`, xhigh=`xhigh`, max=`max` | `{"supportsLongCacheRetention":true}` |
| Terra | `gpt-5.6-terra` / GPT-5.6 Terra | `openai-responses` | text,image | 0/0/0/0 | 1,050,000/128,000 | off=`none`, minimal=null, low=`low`, medium=`medium`, high=`high`, xhigh=`xhigh`, max=`max` | `{"supportsLongCacheRetention":true}` |
| Opus | `claude-opus-5` / Claude Opus 5 | `anthropic-messages` | text,image | 0/0/0/0 | 1,000,000/128,000 | off=`off`, minimal=null, low=`low`, medium=`medium`, high=`high`, xhigh=`xhigh`, max=`max` | `{"supportsEagerToolInputStreaming":true,"supportsLongCacheRetention":true}` |
| Sonnet | `claude-sonnet-5` / Claude Sonnet 5 | `anthropic-messages` | text,image | 0/0/0/0 | 1,000,000/128,000 | off=`off`, minimal=null, low=`low`, medium=`medium`, high=`high`, xhigh=`xhigh`, max=`max` | `{"supportsEagerToolInputStreaming":true,"supportsLongCacheRetention":true}` |
| Gemini | `gemini-3.1-pro-preview` / Gemini 3.1 Pro Preview | `google-generative-ai` | text,image | 0/0/0/0 | 1,048,576/65,536 | off=null, minimal=null, low=`LOW`, medium=null, high=`HIGH`, xhigh=null, max=null | key absent; Google accepts no compat object |

All records have `reasoning: true`; unknown proxy pricing is deliberately represented by zero costs. Provider IDs are `prime-proxy-openai`, `prime-proxy-anthropic`, and `prime-proxy-google`. Adaptive Anthropic thinking is derived from the required `opus-5`/`sonnet-5` ID tokens, not a compat key. The Anthropic `anthropic-beta` key is omitted when the configured extended-cache token is empty. Gemini profile `off=null` is an unsupported-level sentinel; Prime serializes a reasoning-off request as `LOW`, never as an omitted thinking field.

The three provider fixtures are literal objects with exactly `id`, `name`, `api`, `baseUrl`, `apiKey`, `authHeader`, optional `headers`, and `models`. Their `apiKey` value is the string `PRIME_LLM_KEY`; `authHeader` is `true` in bearer mode and `false` in native mode. OpenAI and Google omit `headers`. Anthropic omits `headers` when `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA` is empty and otherwise emits exactly `{"anthropic-beta":"<validated token>"}`. No fixture contains a resolved credential.

## Ownership classification

- **Runtime-enforced:** extension discovery, provider/model visibility, package loading/collisions, effective `rlmMaxDepth`, root cwd, child admission and depth rejection. Tasks 15 and 17 exercise the real pinned binary.
- **Helper-enforced:** argument firewall, worktree/run state, deadlines, retries, cancellation reconciliation, ledger schema, admissions, report quarantine, finding attribution, policy history, and outcome schema. Tasks 5-8 and 11-14 implement pure modules plus the shipped controller adapter that invokes them.
- **Prompt-only:** no coordinator product edits, novelty/value-hypothesis steps, reviewer independence, role selection, real-source verification, and real-format performance discipline. Task 10 tests exact contract text and Task 17 verifies effective root/child prompt separation, but final compliance is review evidence rather than a false mechanical claim.

## Accepted layout amendment

This plan is the exact implementation file manifest and supersedes the design document's illustrative repository tree. The added `lib/` modules separate pure, testable policy from shell adapters; `scripts/gate`, `LICENSE`, `.gitignore`, `UPSTREAM.md`, fixtures, and CI are package-support files. The provider test is consistently named `tests/provider-config.test.mjs`. No provider, runtime, skill-precedence, worktree, or SDD architecture changes.

## Parallel batch partition

Phase 2 runs as three batches in parallel with no per-task review gate. A single tri-model review covers the whole implementation at the end. Parallel safety depends entirely on the batches owning disjoint file sets, so the partition below is normative: a task may not touch a path owned by another batch, and discovering that it needs to is a stop-and-amend condition, not a judgment call.

Tasks 0 and 1 run **sequentially before** the batches, because every batch depends on the worktree, the gate, and the `tests/test-package.sh` driver.

| Batch | Tasks (sequential within the batch) | Owned paths |
| --- | --- | --- |
| **A — launcher chain** | 4, 5, 6, 7, 8 | `prime`, `prime.cmd`, `lib/launcher-process.mjs`, `lib/argv-firewall.mjs`, `lib/worktree.mjs`, `lib/run-registry.mjs`, `lib/launcher.mjs`, `scripts/install-superpowers-package` |
| **B — configuration and workflow core** | 2, 11, 12, 13, 14 | `lib/config.mjs`, `lib/workflow-state.mjs`, `lib/ledger.mjs`, `lib/policy-history.mjs`, `lib/workflow-controller.mjs`, `scripts/workflow-controller` |
| **C — agent home and skills** | 3, 9, 10 | `agent-home/**`, `UPSTREAM.md` |

Each task additionally owns its own `tests/<name>.test.mjs`, its own `tests/fixtures/<name>/` directory, and exactly one `tests/package-manifest.d/<NN>-<name>.sh` fragment. Those are disjoint by construction.

Tasks 15, 16, 17, and 18 run **sequentially after** all three batches converge. Tasks 15-17 are the runtime proofs and must be serial: they execute the real Prime binary, bind ports, and write shared artifact directories.

**Verifying disjointness is a gate, not a hope.** Before dispatching the batches, assert that the union of Batch A, B, and C `Files` lists contains no duplicate path and no path that is a prefix of a path in another batch. Re-run the same assertion on the merged result.

## Frozen cross-batch interfaces

Batches cannot see each other's work in progress, so every value crossing a batch boundary is fixed here. An implementer writes to this contract, not to whatever the neighboring batch happens to produce. Deviating requires a plan amendment.

### `lib/config.mjs` — produced by Batch B (Task 2), consumed by Batch A (Task 8) and Task 15

```js
export function loadConfig({ kitRoot, targetRoot, env }): {
  providers: Array<{ id, baseUrl, dialect, authMode, headers }>,
  models: Array<{ selector, provider, modelId, thinking }>,
  protectedViolations: string[],   // non-empty means fail closed
}
export function generateModelsJson(config): object   // exact object written to <runtime-home>/models.json
export const PROTECTED_VARIABLES: string[]           // includes PRIME_AGENT_CODING_AGENT_DIR,
                                                     // PRIME_AGENT_SESSION_DIR and its legacy name
```

`loadConfig` is pure: it reads no process state and performs no I/O beyond the paths it is handed. Task 8 calls `generateModelsJson` and writes the result verbatim; it never constructs model JSON itself.

### Runtime home layout — produced by Batch A (Task 8), consumed by Batch C and Task 15

Batch C authors the template; Batch A composes it. The composed layout is exactly:

```text
<kit>/.state/runs/<run-id>/agent-home/
  settings.json  AGENTS.md  extensions/  skills/     # copied from template (Batch C)
  models.json                                        # generated via lib/config.mjs (Batch B)
  git/github.com/obra/superpowers -> <cache entry>   # symlink at Prime's computed leaf
  resources.lock.json                                # launcher-generated manifest
  auth.json  sessions/  logs/  harness/              # Prime-owned
  daemon/daemon.sock                                 # per-run socket, passed explicitly
```

Batch C must not assume any path outside the first line exists in the committed template.

### Controller CLI contract — implemented by Batch B (Task 14), referenced by Batch C (Task 10)

Task 10's skill documents instruct agents to invoke exactly these commands. Task 14 implements exactly these commands.

```text
scripts/workflow-controller admit   --task <id> --model <selector> --json
scripts/workflow-controller report  --child <id> --status <ok|fail> --json
scripts/workflow-controller status  --json
```

`admit` exits `0` on admission. It exits non-zero with a machine-readable `code` field on refusal; the frozen codes are `E_DEPTH_SOURCE` (observed depth source is `chat` or `env`), `E_DEPTH_VALUE` (observed depth is not one), `E_DAEMON_UNREACHABLE` (handshake failed, session replaced, or identity mismatch), and `E_CONTROLLER_REQUIRED` (dispatch attempted outside the controller). All are fail-closed.

**The controller does not speak to the daemon.** The daemon client lives in the launcher (Task 8), because the same socket and dispatcher that serve `get_rlm_max_depth_status` also accept `set_rlm_max_depth {activeSessionId, maxDepth, global}` gated only by the session id. Handing the controller the socket path and session identity in order to read depth would hand a model-invoked process a depth-write primitive it otherwise does not have; Prime's RLM host bridge registers only run, model-discovery, subagent-listing, and subagent-deletion. The socket path and active session identity therefore must never appear in the controller's environment, arguments, or any model-reachable child environment, and must not appear in the kernel environment.

Instead the launcher exposes a **local depth-verdict endpoint** inside the run directory. The controller requests a verdict and receives only `{ok: boolean, code?: string}` — never the raw depth, source, socket path, or session id. The launcher performs the daemon read, applies the source predicate, and returns the verdict. Accepted sources are `global` and `inherited`; `chat` and `env` are refused. `inherited` must be accepted: a child session reports its configured depth with source `inherited`, so a `global`-only predicate is unsatisfiable in every non-root session and would refuse all legitimate nested admission. The controller must not read `RLM_MAX_DEPTH` from the kernel environment, which is numeric-only and documented in Prime's own source as possibly stale.

### Ledger record — produced by Batch B (Task 12), read by Batch A (Task 8) `status`

Append-only JSONL at `<kit>/.state/runs/<run-id>/ledger.jsonl`. Every record carries `{ ts, runId, taskId, event, detail }`. Task 8's `status` reads this file and must tolerate unknown `event` values rather than failing on them.

## Task and review matrix

| Task | Implementer | Sealed primary | Additional seats |
|---|---|---|---|
| 1 | Terra | Opus | Sol |
| 2 | Terra | Sol | Opus, Gemini |
| 3 | Terra | Sol | Opus, Gemini |
| 4 | Terra | Sol | Opus, Gemini |
| 5 | Terra | Sol | Opus, Gemini |
| 6 | Terra | Sol | Opus, Gemini |
| 7 | Terra | Sol | Opus, Gemini |
| 8 | Terra | Sol | Opus, Gemini |
| 9 | Opus | Sol | Gemini |
| 10 | Opus | Sol | Gemini |
| 11 | Terra | Sol | Opus, Gemini |
| 12 | Terra | Sol | Opus, Gemini |
| 13 | Terra | Sol | Opus, Gemini |
| 14 | Terra | Sol | Opus, Gemini |
| 15 | Terra | Sol | Opus, Gemini |
| 16 | Terra | Sol | Opus, Gemini |
| 17 | Terra | Sol | Opus, Gemini |
| 18 | Sonnet | Sol | Opus, Gemini; Gemini owns simplicity verdict |

## Task 0: Establish the kit-build worktree and ledger

**Depends on:** approved implementation plan.

**Files:** `.superpowers/sdd/.gitignore`, `.superpowers/sdd/2026-08-26-prime-superpowers-implementation-plan/progress.md`.

**Procedure:** Initialize the local repository if needed, commit the approved specs/reviews as the immutable baseline, create an external worktree on `prime/kit-build-<run-id>`, then create `.superpowers/sdd/.gitignore` with exact content `*` plus newline and the plan-scoped ledger directly. Run all remaining tasks there. Record roots, branch, starting commit, plan SHA-256, acceptance commands, and frozen implementation range. Both paths remain ignored orchestration state and are not committed.

**Acceptance:** `git rev-parse --abbrev-ref HEAD` is neither `main` nor `master`; the ledger roots equal the active worktree; `test "$(cat .superpowers/sdd/.gitignore)" = "*"`; `git status --short` does not show `.superpowers/sdd`; and the recorded plan hash matches `sha256sum`.

## Task 1: Repository skeleton, gate, and verified Prime toolchain

**Depends on:** Task 0.

**Files:** `.gitignore`, `LICENSE`, `toolchain/package.json`, `toolchain/package-lock.json`, `toolchain/SHA256SUMS`, `scripts/bootstrap-toolchain`, `scripts/gate`, `tests/test-package.sh`, `tests/package-manifest.d/01-skeleton.sh`, `tests/toolchain.test.mjs`, `tests/gate.test.mjs`, `tests/fixtures/toolchain/`, `tests/fixtures/gate/`.

This is the only task that creates `tests/test-package.sh`. It must be written as a fixed driver that sources `tests/package-manifest.d/*.sh` in sorted order, counts the assertions they register, and emits a single TAP plan. No later task modifies it.

**Red:**

```bash
node --test tests/toolchain.test.mjs
```

The absence red runs the named subtest `bootstrap rejects unsupported Node` before `scripts/bootstrap-toolchain` exists and exits 1 with `spawn scripts/bootstrap-toolchain` and `ENOENT`. After a fail-closed shell stub exists, the behavioral red exits 1 at `Node 22.7.0 is rejected before npm` with `expected E_NODE_VERSION before E_NPM`. Independently, `gate detects a syntax error in an existing POSIX shell file` first fails because `scripts/gate` is absent, then because a fail-open stub returns zero instead of reporting `E_SHELL_SYNTAX`.

**Green behavior:**

- Semantically reject Node below 22.8.0 before `npm ci` and before credentials enter the environment.
- Require npm 10.8.2 through `packageManager: "npm@10.8.2"` and reject a different package-manager identity/version with `E_NPM_VERSION` before installation.
- `toolchain/package.json` pins the official 0.8.1 main release tarball; the committed lock pins all transitive public and three internal release artifacts.
- Run `npm ci --prefix toolchain` with `PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL=1` and `PRIME_AGENT_BOOTSTRAP_TOOLS_ON_INSTALL=1`. The bootstrap script independently verifies the installed Python/IPython kernel, `rg`, and `fd` after postinstall because postinstall may report an optional-bootstrap failure without making npm fail.
- `npm ci --prefix toolchain` is the enforcing install gate. Verify installed package identity, lockfile integrity, binary output exactly `0.8.1`, and executable kernel/tool paths.
- `toolchain/SHA256SUMS` records all four published SHA-256 values. `bootstrap-toolchain --verify-downloads` is the explicit network-dependent comparison that downloads to a temporary directory, hashes bytes, and deletes them. Offline unit tests validate its mismatch behavior with local fixture tarballs, not self-matching constants.
- `scripts/gate` is shebang-aware, null-glob safe, and activates suites only after their introducing task. It prints one machine-readable `suite=<name> state=activated|skipped|failed` line per suite.
- `tests/gate.test.mjs` proves a broken existing POSIX shell is rejected with its path, a post-introduction missing suite fails, a future suite is skipped, unmatched globs never reach an interpreter, and a Node-shebang script is never passed to `bash -n`.
- Ignore `toolchain/node_modules`, agent runtime state, `.state`, secrets, `.worktrees`, and temporary downloads.

**Acceptance:** `node --test tests/toolchain.test.mjs tests/gate.test.mjs`; `bash tests/test-package.sh`; `scripts/gate`. Network checksum verification is recorded once during this task and thereafter available through doctor live/provenance mode.

## Task 2: Pure environment and frozen provider configuration

**Depends on:** Task 1.

**Files:** `lib/config.mjs`, `tests/provider-config.test.mjs`, `tests/fixtures/model-profiles.json`, `tests/fixtures/env/`, `tests/package-manifest.d/02-config.sh`.

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
- Provider declarations set `apiKey: "PRIME_LLM_KEY"` as the environment-variable name, never the resolved secret. Export exactly the five frozen model records above. Alias overrides must retain the required family token and may change only transport ID.
- Each fixture record is a literal object with exactly `id`, `name`, `api`, `provider`, `baseUrl`, `reasoning`, `input`, `cost`, `contextWindow`, `maxTokens`, `thinkingLevelMap`, and, where allowed, `compat`. The three fixture roots are `https://proxy.example/v1`, `https://proxy.example`, and `https://proxy.example/v1beta`; costs are `{input:0,output:0,cacheRead:0,cacheWrite:0}`; `compat` equals the literal JSON in the table and is absent for Gemini.
- Omit `anthropic-beta` entirely for an empty cache-beta token. Otherwise include only the configured extended-cache token.

**Acceptance:** table tests cover malicious env syntax, precedence, empty/complete overrides, trailing slashes, auth, all thinking levels, aliases, redaction, empty header omission, every literal profile field, and `scripts/gate`.

## Task 3: Prime-loadable extension and universal child prompt

**Depends on:** Task 2.

**Files:** `agent-home/extensions/prime-superpowers.js`, `agent-home/settings.json`, `agent-home/AGENTS.md`, `agent-home/prompts/coordinator.md`, `agent-home/prompts/child.md`, `tests/extension.test.mjs`, `tests/fixtures/extension-api.mjs`, `tests/package-manifest.d/03-extension.sh`.

`resources.lock.json` is **not** committed here. Per the amended design it is a launcher-generated manifest written into the per-run runtime home by Task 8; committing a template copy would be a second, divergent source of truth.

**Red:**

```bash
node --test tests/extension.test.mjs
```

First red is exact module absence. Behavioral red is `before_agent_start selects child prompt at depth one` with `expected CHILD_CONTRACT, received COORDINATOR_CONTRACT`.

**Green behavior:**

- Load only from `.js`; import `lib/config.mjs` by relative ESM URL or `pathToFileURL`, including a Windows-path fixture.
- Register providers through Prime's extension API without overriding built-ins.
- Use `before_agent_start`, inspect `systemPromptOptions.rlmDepth`, and return `systemPrompt` idempotently on every turn. Depth zero receives the coordinator contract; depth greater than zero receives one universal role-neutral child tool contract.
- **Do not attempt to intercept `/rlm-max-depth`.** An earlier draft registered an `input` handler for it; that cannot work. The command is a builtin consumed inside the interactive submit handler before a submission exists, extension `input` handlers run only after a submission exists, and a builtin name resolves ahead of any extension-registered command. Registering the handler would produce a test that passes against a mock and a guarantee that is false in the real binary. Depth is governed by the template default, Prime's in-process spawn guard, and the launcher's admission gate instead.
- Worker versus reviewer policy is carried in each validated dispatch prompt, never inferred from depth or child name.
- Contracts name only `ipython`, `Path`, `bash`, `rlm`, `rlm.find_models`, and `agent_message.send(receiver_role="parent")`; removed `read`/`write`/`grep`/`ls` tool mappings are forbidden. Children must `os.chdir(worktree_root)`.
- The committed `agent-home/` is an immutable template. Settings enforce `rlmMaxDepth: 1` and pin `git:github.com/obra/superpowers@v6.3.0` with `extensions: []`; Task 8 copies the complete template into ignored per-run state before startup so Prime never writes tracked settings.
- `resources.lock.json` lists every skill path present now and every exact path introduced by Tasks 9 and 10. Tests reject an AGENTS/prompt skill reference absent from both disk and this introduced-later manifest.

**Acceptance:** provider registration payloads, repeated-turn prompt replacement, depth split, absence of any `/rlm-max-depth` handler, package filter, no built-in collisions, positive/negative tool vocabulary, introduced-later resource validation, cross-platform import resolution, and `scripts/gate`.

## Task 4: Launcher shell, invariant environment, and process forwarding

**Depends on:** Tasks 1 and 3.

**Files:** `prime`, `prime.cmd`, `lib/launcher-process.mjs`, `tests/launcher-process.test.mjs`, `tests/fixtures/bin/fake-prime`, `tests/package-manifest.d/04-launcher-process.sh`.

**Red:**

```bash
node --test tests/launcher-process.test.mjs
```

First red is exact module absence. Behavioral red is `preflight precedes credential export and spawn` with `expected preflight,credentials,spawn; got credentials,preflight,spawn`.

**Green behavior:**

- Provide a POSIX entry point and a `prime.cmd` WSL forwarder with `%*`, clear missing-WSL diagnostic, and nonzero exit; validate its command text and argument forwarding fixture.
- Resolve kit paths without changing target state. Invoke Node/toolchain preflight before credential loading.
- Spawn the absolute verified binary with invariant `PRIME_AGENT_CODING_AGENT_DIR`, `PI_CACHE_RETENTION=long`, `PRIME_AGENT_TELEMETRY=off`, exact Sol selector, and inherited target worktree cwd supplied by later resolver code.
- Forward child exit status and termination signals. Never log secrets.
- Until Task 8 supplies the composed launcher controller, both entry points fail closed with `E_NOT_COMPOSED`; they must not pass unfiltered arguments to Prime.

**Acceptance:** ordering, environment, selector, exit/signal forwarding, redaction, batch wrapper assertions, and `scripts/gate`.

## Task 5: Deny-by-default argument firewall

**Depends on:** Task 4.

**Files:** `lib/argv-firewall.mjs`, `tests/argv-firewall.test.mjs`, `tests/package-manifest.d/05-argv-firewall.sh`.

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

**Files:** `lib/worktree.mjs`, `tests/worktree.test.mjs`, `tests/fixtures/git/`, `tests/package-manifest.d/06-worktree.sh`.

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

## Task 7: Persistent run registry

**Depends on:** Task 6.

**Files:** `lib/run-registry.mjs`, `tests/run-registry.test.mjs`, `tests/fixtures/run-registry/`, `tests/package-manifest.d/07-run-registry.sh`.

**Red:**

```bash
node --test tests/run-registry.test.mjs
```

The import red is `ERR_MODULE_NOT_FOUND` for `lib/run-registry.mjs`. The fail-closed stub red is `second live coordinator is refused` with `expected E_RUN_ACTIVE, got reservation granted`.

**Green behavior:**

- Export `reserveRun`, `recordParentSession`, `readRun`, `transitionRun`, and `releaseRun` over one atomic clone-local record containing runtime agent home, target, worktree, branch, parent session identity, PID/start identity, timestamps, and state.
- Preserve the exact parent session across TUI detach. State queries and mutations may address only the recorded parent.
- Refuse a second live or retained coordinator. Stale/ambiguous takeover requires an explicit caller authorization; unrecoverable parent loss transitions to `orphaned` without granting a duplicate reservation.
- Use advisory clone locking, atomic write/rename/fsync, schema versioning, corruption diagnostics, and injected clock/process adapters.

**Acceptance:** live/detached/stale/orphaned states, PID reuse, lock contention, corrupt/partial records, exact session addressing, unauthorized takeover rejection, and `scripts/gate`.

## Task 8: Composed launcher controller and immutable runtime agent home

**Depends on:** Tasks 4-7 (same batch, sequential). Its dependency on Task 3's `agent-home/` template is **contract-only** and does not serialize against Batch C: build and test against `tests/fixtures/launcher/template/`, a fixture template conforming to the frozen runtime home layout. Its dependency on `lib/config.mjs` is likewise contract-only via the frozen `generateModelsJson` signature; stub it in this task's tests.

**Files:** `lib/launcher.mjs`, `scripts/install-superpowers-package`, `prime`, `lib/launcher-process.mjs`, `tests/launcher.test.mjs`, `tests/fixtures/bin/fake-prime-session`, `tests/fixtures/launcher/`, `tests/package-manifest.d/08-launcher.sh`.

`prime` and `lib/launcher-process.mjs` are listed because green behavior below replaces Task 4's `E_NOT_COMPOSED` branch inside them. Both are Batch A paths, so this task owns them at this point in the batch sequence.

**Red:**

```bash
node --test tests/launcher.test.mjs
```

The import red is `ERR_MODULE_NOT_FOUND` for `lib/launcher.mjs`. The fail-closed stub red is `run composes firewall worktree registry and process in order` with `expected firewall,worktree,runtime-home,package,registry,spawn; got E_NOT_COMPOSED`.

**Green behavior:**

- Export `run`, `attach`, `status`, and `stop` and compose the previously tested process, firewall, worktree, and registry interfaces without duplicating their policy.
- For each run, materialize `.state/runs/<run-id>/agent-home` in a temporary directory and atomically rename it into place: copy the committed `agent-home/` template regular files byte-for-byte, generate `models.json`, create the package symlink, and write `resources.lock.json`. Set `PRIME_AGENT_CODING_AGENT_DIR` to that path and prove the tracked template remains byte-identical after a simulated session write. Copy regular files only and fail closed if the template contains a symlink.
- Pass an explicit per-run daemon socket under the run directory on every spawn and on `attach`, `status`, and `stop`, because Prime's default socket is process-global and would let two runs share one daemon. Record the socket path in the run record. Strip `PRIME_AGENT_SESSION_DIR` and its legacy equivalent from the child environment and refuse to start if a template or target setting sets `sessionDir`.
- **Own the daemon client and expose only a depth verdict.** The socket path and active session identity stay in the launcher process. Serve the frozen depth-verdict endpoint returning `{ok, code?}` and nothing else, applying accepted sources `global` and `inherited` and refusing `chat` and `env`. Never place the socket path or session identity in the kernel environment, the controller's environment or arguments, or any model-reachable child environment. A test must assert `set_rlm_max_depth` is unreachable from the controller because it has no socket path to connect to.
- Link the shared package cache entry at the exact leaf Prime computes for the declared source, `<runtime-home>/git/github.com/obra/superpowers`, creating parent directories. Derive the leaf from the declared source rather than hardcoding it and assert the computed leaf equals the link created.
- **This task is the sole emitter of `E_PACKAGE_UNRESOLVED`.** Before Prime is spawned, verify the cache entry exists and its recomputed digest matches the recorded digest, and verify the minimum effective skill set `brainstorming`, `verification-before-completion`, and `requesting-code-review` is present in the linked tree. Any failure exits non-zero with `E_PACKAGE_UNRESOLVED` and Prime is never spawned. Prime is never relied upon to report the condition, because its resolver deliberately continues with a reduced resource set.
- Write `resources.lock.json` covering every immutable input: per-file digests of copied template files, the digest of the generated `models.json`, the literal symlink text, and the canonical resolved target plus its full tree digest. Require current-user ownership and owner-only permissions on `.state`, the run directory, and every parent component. Recompute and compare the full manifest on `attach`, `status`, and `stop`; a divergent runtime home is `orphaned`, never silently rebuilt.
- Check `settings.json` **semantically, never by digest**. Prime rewrites it in normal operation through a temporary file and atomic rename, so a byte comparison would falsely orphan a healthy run. Reject any runtime agent-home copy whose effective settings do not contain `rlmMaxDepth: 1`, the pinned package, and `extensions: []`; reject a retained session containing an effective depth override other than one. A rewrite preserving all predicates leaves the run healthy and is recorded as a governance event; one violating any predicate halts the run.
- Link `bin/` to the shared per-clone tool cache and digest-verify it at composition, so tools are not re-fetched per run and the network-disabled case stays reachable.
- Preserve the exact parent session for attach/status/stop, refuse duplicate live coordinators, and propagate child exit status and signals.
- Replace Task 4's `E_NOT_COMPOSED` entry-point branch with calls to this controller. Wrapper-owned `run`, `attach`, `status`, and `stop` are consumed before Prime sees argv.

**Acceptance:** composition order, immutable template, per-run copy, fail-closed package absence, semantic settings check surviving a Prime rewrite, `bin/` cache reuse, depth-verdict endpoint returning verdict-only with `inherited` accepted, socket path and session identity absent from every model-reachable environment, effective-depth refusal, exact session addressing, duplicate refusal, signal/exit propagation, and `scripts/gate`.

## Task 9: Pinned Superpowers vendoring and collision-safe resources

**Depends on:** Task 3.

**Files:** `agent-home/skills/using-superpowers/`, `agent-home/skills/subagent-driven-development/`, `UPSTREAM.md`, `tests/skills-vendor.test.mjs`, `tests/fixtures/plans/minimal.md`, `tests/package-manifest.d/09-skills-vendor.sh`.

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

## Task 10: Prime-native SDD, novelty, and model-routing policy

**Depends on:** Tasks 3 and 9.

**Files:** `agent-home/skills/using-superpowers/SKILL.md`, `agent-home/skills/subagent-driven-development/SKILL.md`, `agent-home/skills/subagent-driven-development/implementer-prompt.md`, `agent-home/skills/subagent-driven-development/task-reviewer-prompt.md`, `agent-home/skills/subagent-driven-development/re-review-prompt.md`, `agent-home/skills/subagent-driven-development/final-reviewer-prompt.md`, `agent-home/skills/prime-rlm-dispatch/SKILL.md`, `agent-home/skills/prime-rlm-dispatch/worker-prompt.md`, `agent-home/skills/prime-rlm-dispatch/reviewer-prompt.md`, `agent-home/skills/model-policy/SKILL.md`, `agent-home/skills/model-policy/novelty-prompt.md`, `tests/workflow-contract.test.mjs`, `tests/package-manifest.d/10-workflow-contract.sh`.

This task writes the **final** text of `prime-rlm-dispatch/SKILL.md` and `subagent-driven-development/SKILL.md`, including their references to the controller. It writes those references against the frozen controller CLI contract below, so Task 14 does not need to reopen these files. `resources.lock.json` is runtime-generated by Task 8 and is not committed.

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
- Consume every introduced-later resource entry from `agent-home/resources.lock.json`; after this task the manifest contains no unresolved skill or prompt path.

**Acceptance:** exact positive and forbidden token sets, role/model/effort matrix, no Gemini implementation path, report/deadline/cwd contract, upstream-link integrity, and `scripts/gate`.

## Task 11: Child lifecycle state engine

**Depends on:** Tasks 7 and 10.

**Files:** `lib/workflow-state.mjs`, `tests/workflow-state.test.mjs`, `tests/package-manifest.d/11-workflow-state.sh`.

**Red:** `node --test tests/workflow-state.test.mjs` first fails with `ERR_MODULE_NOT_FOUND`. With the fail-closed stub, `timed-out attempt cannot be retried before cancellation tombstone` fails with `expected E_CLEANUP_UNCONFIRMED, got retry admitted`.

**Green behavior:** Export pure, schema-versioned transitions with injected clock/RLM adapters for admitted, queued, running, reported, completed, failed, timed-out, cleanup-failed, retrying, and quarantined-late-report states. Persist `admitted_at`, `started_at`, `last_progress_at`, `deadline_at`, unique attempt ID/name, selector, report path, and parent session; reconstruct deadlines after attach without resetting clocks. Require confirmed `rlm.delete_subagent` tombstones before one fresh-name retry, reject duplicate live attempts, and quarantine late reports.

**Acceptance:** deterministic fake-clock/RLM tests cover every transition, restart clocks, deadline expiry, cancellation uncertainty, retry naming, duplicate attempts, late reports, and `scripts/gate`.

## Task 12: Auditable SDD ledger

**Depends on:** Task 11.

**Files:** `lib/ledger.mjs`, `tests/ledger.test.mjs`, `tests/fixtures/ledger/`, `tests/package-manifest.d/12-ledger.sh`.

**Red:** `node --test tests/ledger.test.mjs` first fails with `ERR_MODULE_NOT_FOUND`. With the fail-closed stub, `ledger rejects incomplete red green evidence` fails with `expected E_EVIDENCE_INCOMPLETE for missing post_tree_hash, got append accepted`.

**Green behavior:** Export schema-versioned create/read/append functions for plan identity, immutable `BASE..HEAD` ranges, command/cwd/timestamps/status/subtest/failure/artifact fields, pre/post commit and tree hashes, review rounds, findings, resolutions, rulings, and outcomes. Use locking plus atomic write/rename/fsync; reject mutation of frozen plan hash or acceptance commands, corrupt history, non-monotonic rounds, mutable review ranges, and secrets.

**Acceptance:** complete/incomplete evidence, plan-hash drift, immutable ranges, concurrent append, crash recovery, corruption, redaction, and `scripts/gate`.

## Task 13: Review governance and policy history

**Depends on:** Task 12.

**Files:** `lib/policy-history.mjs`, `tests/policy-history.test.mjs`, `tests/fixtures/policy-history/`, `tests/package-manifest.d/13-policy-history.sh`.

**Red:** `node --test tests/policy-history.test.mjs` first fails with `ERR_MODULE_NOT_FOUND`. With the fail-closed stub, `later-seat unique finding is not credited to sealed primary` fails with `expected seat=gemini, got seat=sol`.

**Green behavior:** Enforce discovery/spec cap 20, per-task cap 12, run cap 80, five review rounds, cannot-verify gate, deferred-Minor handoff, sealed-primary findings, unique later-seat attribution, and independent cross-family severity-downgrade concurrence. Append redacted, locked records to ignored `.state/policy-history.jsonl`; provide explicit export/import. Validate the first-production outcome schema: frozen criteria, rounds, interventions, elapsed time, admissions/available usage by seat, unique accepted findings/effects, and Gemini simplicity verdict.

**Acceptance:** caps, attribution, concurrence, cannot-verify, deferred Minors, missing outcome fields, concurrent append, import/export, secret rejection, and `scripts/gate`.

## Task 14: Shipped workflow controller adapter

**Depends on:** Tasks 11-13 (same batch, sequential). Its dependency on Task 8 is **contract-only** and does not serialize against Batch A: call the launcher's depth-verdict endpoint at the frozen run-relative path and test against a fixture endpoint under `tests/fixtures/workflow-controller/` that returns each verdict shape. The controller must never read the daemon socket path or session identity, and a test must assert both are absent from its environment and arguments. Its relationship to Task 10 is the frozen controller CLI contract, asserted from both sides.

**Files:** `lib/workflow-controller.mjs`, `scripts/workflow-controller`, `tests/workflow-controller.test.mjs`, `tests/fixtures/workflow-controller/`, `tests/package-manifest.d/14-workflow-controller.sh`.

The two skill documents previously listed here are owned by Task 10, which writes them against the frozen controller CLI contract. This task implements that contract and must not edit `agent-home/`; a mismatch between them is a contract violation caught by `tests/workflow-contract.test.mjs`, not fixed by editing the skill text.

**Red:** `node --test tests/workflow-controller.test.mjs` first fails with `ERR_MODULE_NOT_FOUND`. With the fail-closed stub, `dispatch is denied when admission ledger and lifecycle checks are bypassed` fails with `expected E_CONTROLLER_REQUIRED, got child admitted`.

**Green behavior:**

- Make this adapter the only supported coordinator path for resolve, admit, poll, progress, cancel, retry, receive-report, open-review, record-finding, rule, and close-review operations.
- Invoke the exact Task 11-13 module exports and persist every transition to the Task 12 ledger before acknowledging success. No duplicate policy arithmetic is allowed in prompts or the launcher.
- Emit Prime-ready Python snippets for `rlm.find_models`, `rlm.run`, `rlm.list_subagents`, `rlm.delete_subagent`, and `agent_message.send`; require callers to return the observed result for reconciliation.
- Update both skills to invoke `scripts/workflow-controller` and to reject direct unmanaged RLM dispatch. Tests prove lifecycle/cap/deadline/review gates flow through the shipped adapter.

**Acceptance:** end-to-end fake-RLM scenarios cover success, timeout/cancel/retry, late report, cap stop, review loop, concurrence, and outcome closure; direct bypass is rejected; `scripts/gate`.

## Task 15: Static doctor and real packaged-runtime loading

**Depends on:** Tasks 1-14.

**Files:** `scripts/doctor`, `lib/doctor.mjs`, `tests/doctor.test.mjs`, `tests/prime-runtime.test.mjs`, `tests/fixtures/doctor/`, `tests/fixtures/runtime-target/`, `tests/package-manifest.d/15-doctor.sh`.

**Red:** `node --test tests/doctor.test.mjs tests/prime-runtime.test.mjs`. The doctor import first fails with `ERR_MODULE_NOT_FOUND`; its stub fails `static doctor passes structural checks without proxy secrets` with `expected exit 0, got E_MISSING_KEY`. The real-runtime behavioral red is `real Prime lists prime-proxy-openai model` with `selector prime-proxy-openai/gpt-5.6-sol not found`.

**Oracle correction:** Prime 0.8.1 has no `--json` output for model listing. `--list-models` was removed and now rewrites to the public nested command `model list [search]` (`packages/coding-agent/src/cli/public-command.ts:142`, `packages/coding-agent/src/cli/args.ts:275-291`). `listModels` prints a **human-readable table** with columns `provider`, `model`, `context`, `maxOut`, `thinking`, `images` and has no JSON mode (`packages/coding-agent/src/cli/list-models.ts:19-60`). Assertions therefore parse that table, not JSON.

**Green behavior:**

- Static doctor verifies Node/npm, toolchain identity, executable kernel/`rg`/`fd`, extension discovery filename, immutable template, runtime-copy settings, provider roots/auth/model selectors, skills/provenance/minimum package resources, protected variables, and executable bits. Missing proxy secrets are notices; `--live` requires them.
- `--verify-downloads` invokes Task 1's network checksum path. Diagnostics distinguish prerequisite, unresolved package, unauthorized, path/dialect mismatch, missing model, unsupported effort, effective-depth override, tracked-template drift, and corrupt state without exposing keys.
- In a temporary git target, run the absolute checksum/lock-verified Prime 0.8.1 binary with sentinel environment and a per-run agent-home copy. Exact command: `env PRIME_AGENT_CODING_AGENT_DIR="$RUN_HOME" PRIME_AGENT_TELEMETRY=off PI_CACHE_RETENTION=long NO_COLOR=1 "$PRIME_BIN" model list`. `NO_COLOR=1` is required because the table is chalk-colored and ANSI codes would break column parsing.
- Require exit 0 within 60 seconds; save stdout/stderr and effective resource inventory under `tests/.artifacts/prime-runtime/<case>/`. Assert that each of the five selectors appears as a `provider`/`model` row pair in the parsed table, and assert stderr contains no `Warning: errors loading models.json` line, which is how the registry reports a malformed generated profile. Assert package minimum skills, local override winners, filtered package extensions, root worktree cwd, and tracked template byte identity.
- Negative case: remove the package cache entry and deny network. Assert the **launcher** exits non-zero with `E_PACKAGE_UNRESOLVED` before Prime is spawned, and assert no Prime process was started. A reduced-but-successful Prime session is a failure of this assertion, not a pass.

**Acceptance:** `node --test tests/doctor.test.mjs tests/prime-runtime.test.mjs`; `scripts/doctor`; `scripts/gate`.

## Task 16: Native provider wire probes

**Depends on:** Task 15.

**Files:** `tests/wire-probe.test.mjs`, `tests/fixtures/mock-proxy.mjs`, `tests/fixtures/wire-responses/`, `tests/package-manifest.d/16-wire-probe.sh`.

**Red:** `node --test tests/wire-probe.test.mjs` first fails at `Sol uses OpenAI Responses native path` with `expected POST /v1/responses, got no request`. The fixture must already start and emit a valid terminating response, so server/bootstrap errors do not count.

**Green behavior:**

- Bind scripted loopback servers to `127.0.0.1:0`, use sentinel keys only, and invoke the real Prime binary in print mode once per dialect with a 60-second timeout. Each server records method, path, redacted headers, body, response sequence, exit status, and stdout/stderr in `tests/.artifacts/wire/<dialect>/transcript.json`.
- Serve valid terminating streams for OpenAI Responses, Anthropic Messages, and Google Generative AI. Assert `/v1/responses`, `/v1/messages`, and `/v1beta/models/...`; bearer/native auth; exact effort fields; OpenAI 24-hour retention; Anthropic `cache_control` `ttl:"1h"`, optional extended-cache-only beta header, and eager tool-input shape; Gemini LOW/HIGH including reasoning-off serialized as LOW.
- Static config inspection is forbidden as a substitute for captured requests. Any wire mismatch is a recorded risky-unknown failure requiring a plan amendment before proceeding.

**Acceptance:** `node --test tests/wire-probe.test.mjs`; inspect the three transcript artifacts; `scripts/gate`.

## Task 17: Real RLM child and depth lifecycle spike

**Depends on:** Tasks 14-16.

**Files:** `tests/rlm-runtime.test.mjs`, `tests/fixtures/rlm-scripted-proxy.mjs`, `tests/fixtures/rlm-responses/`, `tests/package-manifest.d/17-rlm-runtime.sh`.

**Red:** `node --test tests/rlm-runtime.test.mjs` starts the real installed kernel and scripted proxy, then fails at `child receives universal prompt and inherited worktree cwd` with `expected CHILD_CONTRACT and <worktree>, got no child report`. Missing Python/IPython/`rg`/`fd` is a Task 1 regression, not a skip.

**Green behavior:**

- Start a temporary real git worktree, per-run agent home, and state/ledger directory. Launch the real Prime binary with `PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL=1` already verified by Task 1 and a 120-second scenario deadline.
- The scripted OpenAI Responses server emits a coordinator `ipython` tool call that invokes the shipped workflow controller and `rlm.run`; it then serves the child request, whose tool call writes a report containing cwd and prompt markers and sends the parent notification. A final coordinator response terminates the run.
- Save every HTTP request/response frame, kernel event, controller transition, child registry snapshot, report, ledger entry, stdout/stderr, and exit status under `tests/.artifacts/rlm/<case>/`.
- Assert real child admission, universal child contract, inherited worktree cwd, disk report plus parent notification, bounded reconciliation, and effective depth source/value one. A second scripted case makes the child attempt `rlm.run`; require the exact `RLM recursion depth limit reached` failure, no grandchild admission, and a completed parent reconciliation. A retained-session fixture with depth two must fail closed before dispatch.

**Acceptance:** `node --test tests/rlm-runtime.test.mjs`; inspect both immutable transcripts; `scripts/gate`.

## Task 18: Operator documentation, CI, and outcome evidence

**Depends on:** Tasks 1-17.

**Files:** `README.md`, `.env.example`, `AGENTS.md`, `.github/workflows/ci.yml`, `docs/reviews/README.md`, `docs/reviews/outcome-kit-build.md`, `tests/package-manifest.d/18-docs-ci.sh`, `.state/policy-history.jsonl` during the run only.

**Red:** Add TAP assertions to `tests/package-manifest.d/18-docs-ci.sh` first, then run `bash tests/test-package.sh`. The exact first failure is `not ok required operator document README.md`; analogous named missing-deliverable failures follow. Generic shell/glob failures do not count.

**Green behavior:**

- Document clone, Node 22.8.0, npm 10.8.2, two-variable quick start, toolchain/package install, target/worktree behavior, `run/attach/status/stop`, safe flags, unsafe escape hatch, model matrix, protocol roots, auth modes, Anthropic one-hour cache, doctor modes, and recovery.
- Explain that Prime-RL weight/policy training is not used; this is an orchestration policy over Prime Agent RLM children. State POSIX/macOS/Linux/WSL support and the Windows-to-WSL wrapper.
- CI pins Node 22.8.0 and current supported LTS. Separate offline syntax/unit/package jobs, network bootstrap, real packaged-runtime loading, three local wire probes, and the RLM child spike. No real proxy secret is required.
- Produce `outcome-kit-build.md` with frozen acceptance results, per-task rounds, interventions, elapsed time, admissions/available usage by seat, unique material findings, outcome effects, and Gemini's explicit simplicity verdict. Append run one to ignored policy history and export a redacted copy into the outcome document.

**Acceptance:** `scripts/gate`; `scripts/doctor`; `git diff --check`. Dispatch one whole-branch Sol/Opus/Gemini council over the immutable implementation range; apply fixes through fresh worker tasks and repeat until zero Blocker/Major or the five-round stop.

After that council alone reaches zero Blocker/Major, make a separate orchestration-only commit changing only the status line in `docs/specs/2026-08-26-prime-superpowers-design.md` and this plan. Record approved and post-status SHA-256 values plus the one-line diff in the ledger. This commit is outside the frozen implementation review range and does not retroactively change the approved plan identity.

## Round 1 resolution record

- **Broken common gates:** replaced with one stage-aware, shebang-aware `scripts/gate`; removed undefined npm test script.
- **Fixture-only integration:** Tasks 15-17 use the real pinned binary, real package mechanism, real temporary git worktree, real extension loader, native serializers against loopback mocks, and a real RLM child/kernel path.
- **Invalid helper command:** replaced `sdd-workspace --help` with exact upstream argument forms and real git fixtures.
- **Oversized tasks:** split launcher process, firewall, worktree, registry, composition, vendoring, policy, lifecycle, ledger, governance, controller wiring, static runtime, native wires, and RLM child integration.
- **Lifecycle ownership:** frozen into pure helper modules with injected clock/RLM adapters and wired through the shipped `workflow-controller`; prompt-only obligations are labeled.
- **Role selection:** depth selects root versus universal child only; each dispatch prompt carries validated worker/reviewer role policy.
- **Model metadata:** frozen in a literal five-row fixture sourced from Prime 0.8.1.
- **Missing surfaces:** assigned unsafe args, `.git/info/exclude`, `prime.cmd`, Node/npm preflight wiring, kernel/tool bootstrap, fail-closed package install, immutable runtime agent homes, policy history, and outcome evaluation.
- **Portability/minors:** harmonized `provider-config.test.mjs`, ephemeral loopback ports, credential-free static doctor, ESM file URL handling, script modes, tool prerequisites, explicit dependencies, and one nonduplicated final council.
