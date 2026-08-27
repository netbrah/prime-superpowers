# Prime Superpowers CLI Design

Status: draft, round 5 findings incorporated

## Purpose

Build a standalone CLI kit that can be cloned anywhere and launched against a hard target repository through Prime Agent. The kit combines upstream Superpowers methodology, explicit novel-value discovery, a mandatory SDD/TDD contract, Prime-native RLM subagents, model-diverse reviews, and one proxy credential surface without flattening provider-native protocols.

## Success criteria

- The common proxy case requires only `PRIME_BASE_URL` and `PRIME_LLM_KEY`; optional overrides handle nonstandard path and auth layouts without adding provider secrets.
- `./prime [TARGET_DIR] [-- SAFE_PRIME_ARGS...]` resolves the kit and target roots, creates or validates a worktree, changes to that worktree, and starts Sol as the maximum-effort coordinator while forwarding an allowlisted CLI surface plus Prime Agent's exit status and signals.
- Prime Agent discovers upstream Superpowers skills without loading its incompatible stock Pi bootstrap.
- Every implementation task is performed by an RLM child, never by the coordinator.
- Every review loop is bounded, risk-scaled, evidence-based, and auditable; accepted Blocker/Major findings are fixed and freshly re-reviewed, while disputed findings require a written ruling and cannot be silently parked.
- Model selection follows an explicit role policy instead of allowing arbitrary self-selection.
- Anthropic requests carry one-hour cache markers and, by default, the extended-cache beta required by some gateways. The supported adaptive-thinking model IDs make the complete static beta set deterministic. Long-retention behavior is verified on a captured or live native request.
- Existing global Prime Agent model configuration is not overwritten.
- The first real target task records whether the workflow delivered its frozen acceptance criteria, review rounds, human interventions, elapsed time, and available usage data. A simpler-approach reviewer must state whether the ceremony produced value.

## Non-goals

- Training or updating model weights with Prime-RL.
- Forking upstream Superpowers as a whole. Small local overrides are required where Prime's runtime or this workflow conflicts with upstream instructions.
- Hiding provider-native API differences behind one flattened OpenAI wire.
- Automatically pushing, merging, releasing, or deleting target worktrees. Local edits and commits inside an explicitly created target worktree are required.

## Architecture

The kit uses a committed, isolated Prime Agent home rather than depending on project resource discovery from the target directory. The launcher sets `PRIME_AGENT_CODING_AGENT_DIR` to `<kit>/agent-home`, creates or validates a worktree from the requested target repository, then changes to that worktree before starting Prime Agent. This makes the kit's global settings, extension, skills, depth limit, git context, and artifact root deterministic. Target-local `AGENTS.md` and `.prime/agent` resources are visible in the worktree and may add stricter rules.

```text
./prime /path/to/target
  -> resolves KIT_ROOT and TARGET_ROOT
  -> loads kit and target .env/.env.local without printing secrets
  -> creates or validates an isolated target worktree and run branch
  -> exports isolated agent home, PI_CACHE_RETENTION=long, and telemetry opt-out
  -> changes to WORKTREE_ROOT
  -> starts the checksum-verified Prime Agent 0.8.1 release binary with
     prime-proxy-openai/${PRIME_MODEL_SOL:-gpt-5.6-sol}:max
  -> forwards only arguments that cannot replace workflow invariants
     -> global kit extension registers three uniquely named native providers
     -> extension injects distinct root and child contracts
     -> kit skills override only conflicting Superpowers skills
     -> pinned upstream package supplies the remaining methodology skills
     -> target AGENTS.md and target-local resources remain authoritative additions
```

The proxy is one credential surface, not one protocol surface. The extension registers `prime-proxy-openai`, `prime-proxy-anthropic`, and `prime-proxy-google`, all using `PRIME_LLM_KEY`, so stored credentials for built-in providers can never win resolution or be sent to the proxy. The default bearer-auth mode sets `authHeader: true`; the only alternative secret placement is each native SDK's standard key header.

From a normalized `PRIME_BASE_URL`, the extension derives native endpoint roots: OpenAI Responses gets `/v1`, Anthropic Messages gets the bare root because its client appends `/v1/messages`, and Google Generative AI gets `/v1beta` because Prime disables SDK version insertion for custom base URLs. Per-dialect URL overrides replace, rather than append to, these defaults.

## Repository layout

```text
AGENTS.md
README.md
.env.example
prime
prime.cmd
toolchain/package.json
toolchain/package-lock.json
toolchain/SHA256SUMS
agent-home/settings.json
agent-home/AGENTS.md
agent-home/extensions/prime-superpowers.js
agent-home/skills/using-superpowers/SKILL.md
agent-home/skills/using-superpowers/references/
agent-home/skills/prime-rlm-dispatch/SKILL.md
agent-home/skills/model-policy/SKILL.md
agent-home/skills/subagent-driven-development/SKILL.md
agent-home/skills/subagent-driven-development/*.md
agent-home/skills/subagent-driven-development/final-reviewer-prompt.md
agent-home/skills/subagent-driven-development/scripts/
scripts/doctor
tests/test-package.sh
tests/provider-config.test.mjs
tests/fixtures/
docs/specs/
docs/reviews/
```

The toolchain package depends on the official `prime-agent-0.8.1.tgz` release URL. Its committed npm lockfile pins integrity for the main package, all three Prime internal release dependencies, and public dependencies. The manifest additionally records the published SHA-256 values for all four Prime artifacts:

- `prime-agent-0.8.1.tgz`: `46c24db1782dd31adc35d5c6cbcc75564faba6ced3bf2ccf03d836ee77134475`
- `prime-agent-ai-0.8.1.tgz`: `f6c3bdb6093bc24a327546fe865ef9a4a172c734fcd4c4093e30c19476f0134d`
- `prime-agent-core-0.8.1.tgz`: `0cc3660953545f8ac9a7e704fcb9875f954d58c3085304080ef615c280aa5748`
- `prime-agent-tui-0.8.1.tgz`: `bd07bccee0ca495565b1d62e9411f3fdebe49e3dfa52870564f08af5e61fde15`

Bootstrap first requires Node.js `>=22.8.0` using semantic-version comparison and emits a distinct prerequisite diagnostic before `npm ci` or credential loading. It then runs `npm ci` in `toolchain/` before credentials enter its environment, verifies the installed package identities and lockfile integrities, invokes only `<kit>/toolchain/node_modules/.bin/prime-agent`, and requires `--version` 0.8.1. A mutated GitHub or R2 artifact fails npm integrity even if its URL remains stable. Missing dependencies, corrupt cache entries, registry substitution, or version mismatch fail closed.

`agent-home/settings.json` sets `rlmMaxDepth: 1` and installs `git:github.com/obra/superpowers@v6.3.0` with `extensions: []`. Runtime auth, sessions, logs, caches, and generated state under `agent-home` are ignored by Git.

Prime resolves a colliding skill as one whole directory, not a merged tree. Therefore the two intentional overrides vendor the sibling templates, scripts, and safe references they use from Superpowers v6.3.0. The SDD override replaces its outside-directory final reviewer link with local `final-reviewer-prompt.md`, copied from the pinned `requesting-code-review/code-reviewer.md`. Their provenance and hashes are recorded; the incompatible `using-superpowers/references/pi-tools.md` is excluded and no local file links to it. All non-colliding skills continue to come from the pinned package.

One kit clone supports one active coordinator. The persistent run record contains agent-home, target, worktree, branch, parent session identity, and state. It remains active across terminal detach and launcher exit; a new run queries the recorded daemon/session and refuses while it is live or retained. `./prime attach`, `./prime status`, and `./prime stop` operate only on that recorded session. Explicit completion or stop clears the record after child reconciliation. Stale or ambiguous state requires an interactive takeover and is unavailable headlessly.

## Model policy

| Role | Default model | Effort | Allowed work |
|---|---|---:|---|
| Coordinator | Sol | max | Maintain saliency, sequence the workflow, reconcile reports, enforce gates |
| Novel-value architect | Opus | high | Generate competing approaches, find non-obvious value, resolve architectural uncertainty, frontier implementation |
| Context and blind-spot reviewer | Gemini 3.1 Pro Preview | high | Large-codebase reconnaissance and independent cross-checking; never implementation |
| Gate implementer | Sol | max | Implement difficult bounded tasks where strict tests and gates dominate |
| Balanced implementer | Terra | max | Implement bounded tasks requiring balanced reasoning and execution |
| Mechanical implementer | Sonnet | high | Implement only when the task is unusually complete and deterministic |
| TDD and blocker reviewer | Sol | max | Verify red-green evidence, gate closure, blocker and major discovery |
| Frontier reviewer | Opus | high | Review architecture, novelty, usefulness, and forest-level correctness |
| Simplicity reviewer | Cross-family model not used by author | high | Ask what breaks if a finding is ignored and whether a simpler solution passes the same acceptance tests |

The coordinator does not choose a model by name from memory. It resolves configured selectors once through `rlm.find_models`, requires one exact match, records the result in the durable ledger, and passes exact selectors plus explicit thinking levels to every `rlm()` call. There is no silent model fallback.

Review is model-diverse by construction but scaled to risk. Novel architecture, protocol, concurrency, persistence, security, and final reviews use the full Sol/Opus/Gemini council. Ordinary bounded tasks use two reviewers from different families, one of which differs from the implementer. Mechanical, low-risk fixes use one cross-family reviewer plus the coordinator's independent gate rerun. A task is escalated to the full council when any reviewer identifies load-bearing uncertainty.

The default policy deliberately favors frontier capability for discovery, architecture, difficult gates, and final review because the target workload is novel and high stakes. Small fix-diff re-reviews may use the least powerful configured cross-family seat that can verify the scoped claim; this does not replace frontier seats at the load-bearing gates. If a provider is unavailable, the coordinator may use a two-family fallback only when the frozen spec marks the task non-critical; otherwise it stops with a diagnostic. Any diversity downgrade is recorded in the ledger and final report.

Admissions and attributed usage are policy inputs. Defaults cap discovery/spec at 20 child admissions, each implementation task at 12, and the whole run at 80; the operator may raise these before launch, never silently mid-run. Hitting a cap stops for operator input.

At every review gate, the designated primary reviewer runs first and its finding set is sealed before cross-family results arrive. The full-council spec/final gates use Sol as primary; task gates choose a primary different from the implementer when possible. The final report identifies accepted findings unique to later seats, which model found them, their severity, and whether they changed implementation or acceptance outcomes. `<kit>/.state/policy-history.jsonl` retains per-seat admissions, usage, latency, accepted unique material findings, and outcome effects across runs. After three completed runs with no unique accepted material contribution from a seat at a given gate type, the final report recommends removal or demotion for operator approval; committed policy never mutates itself.

## Provider and model registration

| Provider ID | API | Default base | Auth | Models |
|---|---|---|---|---|
| `prime-proxy-openai` | `openai-responses` | `${PRIME_BASE_URL}/v1` | Bearer by default | Sol, Terra |
| `prime-proxy-anthropic` | `anthropic-messages` | `${PRIME_BASE_URL}` | Bearer by default; Anthropic beta header | Opus, Sonnet |
| `prime-proxy-google` | `google-generative-ai` | `${PRIME_BASE_URL}/v1beta` | Bearer by default | Gemini 3.1 Pro Preview |

Each model declaration supplies its ID, display name, native API, reasoning flag, `text` and `image` inputs, context window, maximum output, zero cost metadata when proxy pricing is unknown, compatibility flags, and a complete seven-level thinking map. The exact maps are:

| Family | `off` | `minimal` | `low` | `medium` | `high` | `xhigh` | `max` | Dispatch |
|---|---|---|---|---|---|---|---|---|
| Sol/Terra | `none` | `null` | `low` | `medium` | `high` | `xhigh` | `max` | `max` |
| Opus/Sonnet | `off` | `null` | `low` | `medium` | `high` | `xhigh` | `max` | `high` |
| Gemini | `null` | `null` | `LOW` | `null` | `HIGH` | `null` | `null` | `high` |

Every unsupported level is explicit `null`; no behavior depends on Prime's implicit defaults. Supported values preserve the matching 0.8.1 provider behavior, including reasoning-off wires.

Model overrides change only the proxy transport ID while retaining the role profile's fixed API, capabilities, limits, compatibility, and thinking map. They are accepted only when they retain the expected wire-family token: `gpt-5.6-sol`, `gpt-5.6-terra`, `opus-5`, `sonnet-5`, or `gemini-3.1-pro`. Unknown or mismatched IDs are rejected. Arbitrary future models require editing and reviewing the committed model profile rather than guessing metadata from an environment string. Doctor reports the resolved Anthropic effort-vs-budget path and rejects aliases that would change it.

## Workflow policy

The required state machine is:

1. **Setup:** the launcher creates or validates an isolated worktree and run branch before Prime starts, then makes that worktree the coordinator session cwd. The coordinator reads target `AGENTS.md` and records target root, worktree root, starting commit, frozen acceptance-command contract, and stable plan-file identity in `.superpowers/sdd/<plan>/progress.md` inside that worktree. Every coordinator and child git, ledger, report, review-package, and gate operation runs from this one root. Never implement on `main` or `master` without explicit operator permission.
2. **Novel-value discovery:** dispatch Opus to generate at least two materially different approaches, Gemini to gather repository and integration constraints, Sol to test tractability and gateability, and a simplicity seat to challenge whether the obvious approach is enough. Record the selected value hypothesis, rejected alternatives, cost-if-wrong, and any real-format/source spike needed to resolve a risky unknown.
3. **Specification:** write the chosen design incrementally, freeze observable acceptance criteria, and dispatch the full council. Every finding must have a stable ID, severity, evidence, affected location, and a counterfactual statement of what breaks if ignored.
4. **Spec convergence:** fix accepted Blocker/Major findings, then send fresh reviewers the current artifact, prior findings, artifact diff/hash, fixes, and rulings. Up to five rounds are allowed.
5. **Task breakdown:** produce bite-sized TDD tasks with exact paths, commands, dependencies, expected red signature, acceptance mapping, and suggested role model. Cross-review and converge under the same protocol.
6. **One-task implementation:** record `BASE`, dispatch one implementer into the worktree with an exact model, thinking level, report path, and explicit `os.chdir(worktree_root)` instruction. The implementer writes the failing test, captures red evidence, implements the minimum product change, captures green evidence, runs gates, writes the report, and commits locally.
7. **Task review:** build the review package over `BASE..HEAD`; use the risk-scaled reviewer set; require reviewers to remain read-only and write only their assigned review files.
8. **Fix loop:** rounds 1–3 resume the original implementer; rounds 4–5 use a fresh implementer one capability tier higher. Each fix is committed, receives a scoped review package, and is checked by fresh reviewers.
9. **Breaker:** after round 5, the Sol coordinator adjudicates disputed findings. A finding may be marked `Settled` only with evidence, rationale, and cost-if-wrong showing it is false, duplicate, superseded, stylistic, or outside the frozen spec. A genuinely accepted Blocker/Major cannot be parked: the workflow stops for operator input.
10. **Task completion:** independently rerun the final acceptance and repository gates, mark the task complete in the ledger, and move to the next task. The gate applies before task completion or branch integration, not before local worker commits.
11. **Whole-branch completion:** run the full council, verification-before-completion, and the frozen target acceptance suite. Report outcome metrics and stop before merge, push, release, or worktree deletion.

The canonical taxonomy is `Blocker`, `Major`, and `Minor`; upstream `Critical` maps to `Blocker` and `Important` maps to `Major`. A failed upstream spec verdict gates as Major. `Cannot verify` is coordinator-owned until resolved with evidence and becomes Major when confirmed as a real gap. Deferred Minors remain in the ledger and are explicitly handed to the whole-branch reviewers. Blocker, Major, failed-spec, and unresolved cannot-verify items gate progression.

Any downgrade or `Settled` ruling on a reviewer-raised Blocker/Major requires concurrence from a fresh cross-family reviewer who did not author the artifact. The ledger retains original severity, final severity, both rationales, and evidence. Whole-branch review audits every downgrade and settlement.

The ledger is authoritative after compaction and reattachment to the same persisted parent. It records artifact hashes, exact model selectors, child names/handles, state transitions (`admitted`, `running`, `reported`, `failed`, `timed-out`, `orphaned`, `reviewed`, `complete`, `superseded`), report path/digest, red/green evidence, finding IDs and dispositions, severity changes, deferred Minors, admissions, elapsed time, attributed usage/cost when available, and coordinator rulings. A task with a valid `Task N: complete` marker and matching commit is never re-dispatched.

Children write detailed results to files and send only a concise notification with the path and digest using `agent_message.send(receiver_role="parent")`. The coordinator polls at no more than one-minute intervals near a deadline and at 5–10 minute intervals otherwise, reconciles `rlm.list_subagents()`, and records `admitted_at`, `started_at`, `last_progress_at`, and `deadline_at`. Defaults are 45 minutes for reconnaissance/review, 90 minutes for implementation/fix, and 120 minutes for frontier architecture or CI verification; the frozen plan may lower them.

When a deadline expires, the coordinator reconciles once, calls `rlm.delete_subagent(child_id)`, and treats a returned deletion plus the registry's terminal cancelled/tombstoned state as confirmation. `skipped_running`, a cleanup-failure notice, or absence of terminal state after the cancellation grace period becomes `cleanup-failed` and stops the task. A timed-out admission may be retried once under a fresh unique child name, with the same immutable input package and either the same role model or the policy's next capability tier. The retry consumes a fix/review round and task admission budget. There may never be two live attempts for one ledger item. A report arriving after timeout is quarantined and cannot advance state.

Persistence is mandatory; workflow mode rejects `--no-session`. Normal detach is recovered only with the kit-owned `./prime attach`, which targets the recorded parent session so the same child registry remains authoritative. If the daemon or parent transcript cannot be restored, the run becomes `orphaned`, no retry may start, and the operator must explicitly stop/clean up or take over. The kit does not claim automatic recovery from destruction of the parent registry. Compaction and attachment do not reset deadline clocks. `rlmMaxDepth: 1` is enforced by the isolated global settings so workers cannot dispatch grandchildren.

The root contract permits the coordinator to write only specs, plans, ledgers, review packages, and orchestration artifacts. Product-code changes must be attributable to worker commits. Reviewer prompts are read-only contracts; reviews run against immutable commit ranges or serial immutable baselines so any unexpected mutation fails the round.

On the second consecutive failed fix round for the same root cause, the workflow must invoke systematic debugging rather than continue patching symptoms.

Reconnaissance begins with targeted inventory and search such as `git ls-files` and `rg`. Agents inspect outlines and bounded ranges before whole large files and exclude generated output, dependencies, locks, binaries, and logs unless the task requires them.

## Configuration contract

Required:

```bash
PRIME_BASE_URL=https://proxy.example.test
PRIME_LLM_KEY=secret
```

Optional model-ID overrides:

```bash
PRIME_MODEL_SOL=gpt-5.6-sol
PRIME_MODEL_TERRA=gpt-5.6-terra
PRIME_MODEL_OPUS=claude-opus-5
PRIME_MODEL_SONNET=claude-sonnet-5
PRIME_MODEL_GEMINI=gemini-3.1-pro-preview
```

Optional protocol URL overrides:

```bash
PRIME_OPENAI_BASE_URL=$PRIME_BASE_URL/v1
PRIME_ANTHROPIC_BASE_URL=$PRIME_BASE_URL
PRIME_GOOGLE_BASE_URL=$PRIME_BASE_URL/v1beta
PRIME_PROXY_AUTH_MODE=bearer
PRIME_ANTHROPIC_EXTENDED_CACHE_BETA=extended-cache-ttl-2025-04-11
```

URL overrides are complete endpoint roots and are never suffix-adjusted. Empty overrides are rejected. `PRIME_PROXY_AUTH_MODE` supports `bearer` by default and `native` for gateways that require provider-native key placement.

`bearer` sets `authHeader: true`; native SDK key headers may coexist and must carry the same `PRIME_LLM_KEY`. `native` sets `authHeader: false` and relies on the dialect's standard key placement. The design provides neither arbitrary custom-secret headers nor generic extra-header variables.

Prime 0.8.1 itself emits the one-hour `cache_control.ttl` marker but not the extended-cache beta token, and its body-only provider hook cannot mutate final headers. For the supported adaptive Opus/Sonnet IDs, Prime uses eager tool-input streaming in the tool schema and computes no fine-grained or interleaved beta header. The kit therefore registers a static Anthropic provider header containing only `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA`. The token may be empty only when the proxy explicitly does not require it. Wire-changing model aliases are rejected, and doctor captures and reports both the final beta header and `eager_input_streaming` tool shape.

Environment files are data, not shell scripts. A parser accepts comments, quoted/unquoted scalar values, and escapes but never executes command substitution or expansion. Precedence from lowest to highest is kit `.env`, target `.env`, kit `.env.local`, target `.env.local`, then the existing process environment. Target files may set public `PRIME_BASE_URL`, model IDs, timeouts, and proxy compatibility values, but cannot set protected controls including `PRIME_AGENT_CODING_AGENT_DIR`, executable path/version, `PI_CACHE_RETENTION`, package/skill/extension settings, model/provider/thinking/cwd CLI overrides, or lock location.

The CLI argument firewall is deny-by-default. The launcher places its internal `--model` option first, before any user positionals, so Prime cannot treat a user prompt as `argv[0]` and route it to a public management command. It nevertheless rejects every public and removed command name in prompt position, including `agents`, `attach`, `schedule`, `shutdown`, `package`, `session`, and `config`.

The safe surface is limited to positional prompts/file references after the internal options, `-p`/`--print`, `--mode text|json|rpc`, verbosity, and color. It rejects unknown flags; daemon/ACP mode; daemon socket; session-dir/offline/goal controls; split, equal, alias, or repeated provider/model/key/thinking/cwd/system-prompt settings; all extension/skill/tool/theme/template/context selection or `--no-*` disabling; autonomous gates; and resume/continue/fork/no-session. Kit-owned `attach`, `status`, and `stop` are wrapper commands consumed before Prime invocation and operate only on recorded run state. `--unsafe-prime-args` is a separately named escape hatch that prints that workflow guarantees are disabled and requires interactive confirmation; it is unavailable in headless mode.

The launcher exports `PI_CACHE_RETENTION=long`, which affects Anthropic, OpenAI, and other supported Prime providers rather than Anthropic alone. Anthropic-compatible models declare long-cache support and emit `cache_control: {type: "ephemeral", ttl: "1h"}`. The static provider header optionally includes `extended-cache-ttl-2025-04-11`; compatibility switches can omit that token or disable long retention per dialect if the gateway rejects it.

## Safety and compatibility

- The launcher never prints or commits secrets and never reads or edits the operator's normal Prime Agent home.
- The isolated agent home uses unique provider IDs, so built-in provider auth storage cannot override `PRIME_LLM_KEY`.
- The package pins Superpowers at `v6.3.0`; the immutable release URL and published SHA-256 pin the Prime Agent 0.8.1 artifact.
- The upstream Superpowers extension is disabled because its Pi mapping incorrectly denies Prime-native RLM subagents.
- Local overrides reconcile upstream commit, severity, convergence, and dispatch instructions. Only the selected sibling files needed by the two whole-directory overrides are copied with provenance; all other skill bodies remain package-owned.
- The root coordinator receives the full workflow bootstrap. Children receive a short worker/reviewer contract that explicitly maps Prime's `ipython`, `Path`, `bash()`, skill-reading, `agent_message`, and worktree-cwd conventions and never advertises nonexistent `read`, `write`, `grep`, or `ls` tools.
- Review-only agents are instructed not to mutate product code. Reviews run serially against immutable commit ranges or dedicated snapshots, and unexpected working-tree deltas invalidate the review.
- The target repository remains the verification source. CI-specific failures must be reproduced on the named CI environment.
- CI evidence records provider, workflow/job, revision, OS/image or container digest, toolchain, relevant environment, exact command, and logs. If the required environment is unavailable, the workflow stops rather than substituting a local proxy measurement.
- POSIX shells on macOS, Linux, and WSL are the primary supported launcher environment; `prime.cmd` forwards Windows users to WSL with a clear diagnostic.
- Worktrees default outside the target checkout. If an in-repository `.worktrees/` location is selected, setup adds it to `.git/info/exclude`, never a tracked `.gitignore`.

## Verification

- Validate Node.js `>=22.8.0` preflight before install, JSON, JavaScript, shell syntax, executable bits, skill frontmatter whose `name` exactly matches its directory, release URL/checksum/provenance, `.env` data parsing/precedence/protected controls, argument/signal/exit forwarding, path normalization, persistent run-state behavior, and secret redaction.
- Assert the isolated agent home is active, global `rlmMaxDepth: 1` takes effect even if the operator's normal home says 2, the package extension is filtered, and the created worktree is the cwd for root and child sessions. After a worker commit, the coordinator-built `BASE..HEAD` package must contain at least one commit and a non-empty diff, and coordinator/worker ledger paths must resolve identically.
- Unit-test provider registration: unique provider IDs, complete schemas, seven-entry model/thinking truth tables plus emitted reasoning wires, native endpoint derivation, bearer/native auth modes, exact extended-cache-only Anthropic beta header and opt-out, eager tool-input streaming shape, compatible adaptive model-ID aliases, rejection of wire-changing aliases, and preservation of fixture global providers.
- Capture mock-server requests for OpenAI Responses, Anthropic Messages, and Google Generative AI. Assert path, auth headers, native body shape, model ID, thinking field, image capability declaration, OpenAI long-retention behavior, and Anthropic one-hour cache marker plus beta header.
- Assert the root and child contracts contain only their intended instructions; the worker contract names `ipython`, `Path`, `bash`, and `agent_message`, and neither contract teaches nonexistent file tools.
- Exercise RLM model discovery by full selector, exact untruncated resolution, unsupported thinking rejection, child report reconciliation, dead-child recovery, queued/running deadlines, cancellation and cleanup failure, one-retry enforcement, late-report quarantine, same-parent detach/attach deadline preservation, orphaned-parent fail-closed behavior, grandchild rejection, and deliberate reviewer/root mutation detection.
- `scripts/doctor` performs safe static checks by default and a minimal real completion for every configured role with `--live`; it distinguishes unreachable, unauthorized, wrong path, incompatible dialect, missing model, and unsupported effort without exposing credentials.
- Verify a fixture task records machine-checkable red-before-green evidence: exact command, cwd, timestamps, exit status, output artifact, failure signature, tree/commit hashes, and final independent rerun.
- Record independent design and implementation review rounds under `docs/reviews/`.
- Test the argument firewall across every public/removed subcommand, split/equal forms, every alias, duplicates, unknown flags, safe headless/output flags, exit/signal forwarding, and rejection of daemon/offline/goal/session/resource controls. Test detach with a live recorded session, refusal of a second run, exact-session attach/status/stop, and stale-state takeover.
- Assert every relative file referenced by a local overriding skill exists, vendored file hashes match Superpowers v6.3.0 provenance, collision diagnostics contain exactly the intended winners/losers, and no rendered contract can reach the incompatible `pi-tools.md`.
- Test admissions ceilings, usage accounting, sealed Sol baseline ordering, unique accepted cross-family finding attribution, severity downgrade concurrence, unresolved cannot-verify gating, and deferred-Minor handoff.

The first production use is also an outcome evaluation. Before execution, the operator supplies hidden or externally verifiable acceptance criteria where practical. The final report records pass/fail, human interventions, elapsed time, review/fix rounds, and available usage. The simplicity reviewer must state whether the multi-model process found a material issue or novel value that a straightforward single-agent Superpowers run likely would not have found. Repeated runs that add ceremony without better acceptance outcomes trigger removal or simplification of the extra seats.

## Round 1 resolution record

- **Topology and depth:** replaced target-project config with an isolated agent home and explicit target cwd.
- **Credential safety:** replaced built-in provider overrides with three unique proxy providers.
- **Native wires:** defined `/v1`, bare Anthropic, and `/v1beta` roots plus auth modes and live probes.
- **Novel value:** added competing-design generation, context gathering, tractability testing, and a simplicity counter-seat before spec freeze.
- **Convergence:** adopted stable IDs, counterfactual findings, five-round cap, review packages, coordinator rulings, and fail-closed treatment of accepted Blocker/Major findings.
- **Git/TDD:** aligned local worker commits with `BASE..HEAD` review packages, worktree isolation, machine-verifiable red/green evidence, and no automatic publication.
- **RLM lifecycle:** added report digests, bounded waits, status reconciliation, dead-child recovery, compaction-safe ledger state, and explicit child cwd.
- **Tool mapping:** applied Prime-native tool instructions to workers and reviewers, not only the coordinator.
- **Caching:** documented cross-provider effect, Anthropic beta header, compatibility opt-out, and emitted-request tests.
- **Scope:** retained upstream skills where compatible and explicitly overrides only conflicting execution instructions.

## Round 2 resolution record

- **Child deadline:** converted bounded polling into hard role deadlines, cancellation/tombstone confirmation, one retry, late-report quarantine, restart-safe clocks, and fail-closed cleanup.
- **Argument bypass:** replaced unrestricted forwarding with an allowlist firewall and a separately acknowledged unsafe mode.
- **Executable provenance:** moved the Prime Agent pin to an exact npm dependency and committed integrity lockfile, with pre-credential version enforcement.
- **Thinking maps:** specified all seven Prime levels for every family, including explicit unsupported values and dispatch defaults.
- **Authentication schema:** limited secret auth to bearer or native modes using the single proxy key; arbitrary secret headers are out of scope and non-secret headers are constrained.
- **Environment and concurrency:** defined non-executing environment precedence, protected controls, one active coordinator per clone, and lock diagnostics.
- **Model selector and context hygiene:** launcher uses the exact configured Sol model ID, and reconnaissance starts with targeted inventory/search rather than bulk reads.
- **Repository hygiene:** defined local exclude behavior for in-repository worktrees and strict skill frontmatter tests.

## Round 3 resolution record

- **Prime artifact:** replaced the nonexistent npm package/bin with the real v0.8.1 GitHub release tarball, immutable URL, published SHA-256, absolute binary, and pre-secret version check.
- **Single git context:** launcher now creates/selects the worktree before Prime starts and makes it the root for coordinator, children, ledger, reviews, and gates.
- **Skill collisions:** retained package delivery but vendored the required sibling files for two intentional whole-directory overrides, with hashes and incompatible Pi reference exclusion.
- **CLI routing:** placed invariant options first, deny-listed public commands, deny-defaulted flags/aliases, and moved management to exact recorded-session wrapper commands.
- **Persistence:** removed `--no-session` and automatic unrelated-parent restart claims; detach/attach preserves the same registry and unrecoverable parent loss becomes fail-closed orphan state.
- **Provider policy:** aligned reasoning-off maps with native wires, restricted model aliases to fixed compatible role profiles, and moved Anthropic beta union to request time with opt-out.
- **Review integrity:** mapped failed-spec, cannot-verify, and deferred-Minor signals; cross-family concurrence audits severity downgrades and settlements.
- **Council falsifiability:** added admissions ceilings, attributed usage, a sealed Sol control finding set, and automatic seat demotion/removal criteria.

## Round 4 resolution record

- **Toolchain installation:** replaced extract-only language with `npm ci` over the official package tarball, committed lock integrities, all four published Prime artifact checksums, installed package identity checks, and the real absolute binary path.
- **Extension discovery:** changed the extension from unsupported `.mjs` to Prime-loadable `.js`.
- **Anthropic headers:** removed the impossible body-hook mutation and uses a static extended-cache-only beta header, safe under enforced adaptive Opus/Sonnet IDs whose tool schema uses eager input streaming, with proxy opt-out and wire capture.
- **Final review template:** localized the outside-directory reviewer prompt into the SDD override with pinned provenance.
- **Per-task policy evidence:** seals a primary finding set at every gate and persists per-seat contribution history; policy changes require operator approval.

## Round 5 resolution record

- **Runtime prerequisite:** added a pre-install, pre-secret Node.js `>=22.8.0` semantic-version gate with a distinct diagnostic.
- **Anthropic effort:** marked `minimal` unsupported so it cannot reach `output_config.effort` as an invalid value.
- **Anthropic tool/cache beta:** removed the legacy fine-grained token; adaptive Opus/Sonnet use eager tool-input streaming and the static header contains only the optional extended-cache token.
