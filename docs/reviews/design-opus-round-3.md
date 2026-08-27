# Opus Independent Design Review — Round 3

**Reviewer seat:** Frontier / novel-value reviewer (architecture, novelty-vs-ceremony, usefulness on a hard frozen-spec task, source-backed runtime feasibility)
**Review date:** 2026-08-26
**Artifact reviewed:** `docs/specs/2026-08-26-prime-superpowers-design.md`, 239 lines, `Status: draft, round 2 findings incorporated`
**Artifact hash (md5):** `6e7a1c09e8d158815494147b36a3036f`
**Source baselines:** `prime-agent` 0.8.1 at commit `bc0fa7606abb3b7af0f765319518d255e6ae553d` (workspace package `@earendil-works/pi-coding-agent@0.8.1`); `superpowers` v6.3.0 at tag `v6.3.0`, commit `b36e082`
**Prior reviews read:** `design-opus-round-1.md`, `design-sol-round-1.md`, `design-gemini-round-1.md`, `design-sol-round-2.md`, `design-gemini-round-2.md`
**Scope note:** This is a fresh review of the current file. Any verdict I previously formed on an earlier hash is void. No spec or product file was edited.

## Verdict

**Changes required — not zero Blockers/Majors. 4 Blockers, 7 Majors, 7 Minors.**

Round 2 genuinely closed the round-2 Blockers at the policy level: the hard-deadline/cancel lifecycle is implementable against real primitives, the thinking-map semantics are now *more* correct than the shipped catalog in the one place that matters (explicit `null` vs `undefined` for `xhigh`/`max`), the environment schema is data-not-shell with a protected-control list, the auth schema is narrowed to two modes on one key, and the beta header is comma-joined instead of single-token. Those are real improvements and I am not reopening them.

What round 2 did not do is check the *new* mechanisms against the two systems this kit actually runs on. Three of the four Blockers below are round-2 fixes that name artifacts which do not exist in the reviewed sources: an npm package named `prime-agent`, a coordinator `git` context that contains the worker commits, and upstream Superpowers templates/scripts that survive Prime's skill-shadowing. The fourth is a hole in the new argument firewall: Prime routes subcommands off `argv[0]` before flag parsing and before `--`, so the firewall's own allowlisted category ("positional prompts") is an execution path to `package install`, `config`, `attach`, and `shutdown`.

On my seat's core question — does this improve outcomes on a hard frozen-spec task, or is it ceremony? My answer is **partly ceremony, and the spec currently prevents its own answer from being measurable** (OPUS-R3-M7). The genuinely novel, defensible parts are: the novel-value phase before spec freeze, counterfactual findings with stable IDs, machine-checkable red-before-green evidence, the immutable-range review package, and the deadline/late-report quarantine. The ceremony risk sits in the model policy: every seat is frontier at `high`/`max`, review is 2–3 seats per task, up to five fix rounds each with fresh reviewers, and line 99 explicitly refuses cheap seats — with no admissions cap, no cost/latency budget, and no control arm. Line 215 promises to remove seats that do not pay, but nothing in the design produces the number that would trigger removal. A simpler design — single-agent Superpowers SDD plus one cross-family reviewer at the spec freeze and the whole-branch gate — would pass every acceptance test in the Verification section except the ones that only assert the council exists.

## Severity rubric

- **Blocker:** a stated success criterion or mandatory invariant fails, hangs, or silently passes on an allowed execution path, or the design names a mechanism the reviewed sources do not provide.
- **Major:** architecture is feasible, but an implementer or acceptance test must invent load-bearing behavior, or a stated guarantee is unenforceable as written.
- **Minor:** direction is right; determinism, portability, or auditability needs a local clarification.

## Blockers

### OPUS-R3-B1 — The Prime Agent pin names an npm package and binary that do not exist in the reviewed source

**Affected spec lines:** 38–39, 59, 77, 192, 204, 234.

**Finding.** Line 77 requires `package.json` to declare "exact `prime-agent: 0.8.1`", a committed `package-lock.json` for its graph, and a launcher that "invokes only `node_modules/.bin/prime-agent`", with a pre-credential `--version` gate. In the reviewed source, the publishable package is `@earendil-works/pi-coding-agent` version `0.8.1`, its only `bin` entry is `pi`, and `prime-agent` is a *branding* value read from `piConfig.name`, not a package or binary name. The officially documented distribution channel is a checksum-verified release installer, not npm.

**Source evidence.**
- `prime-agent/packages/coding-agent/package.json:2-12` — `"name": "@earendil-works/pi-coding-agent"`, `"version": "0.8.1"`, `"piConfig": {"name": "prime-agent", "configDir": ".prime/agent"}`, `"bin": {"pi": "dist/bundle/cli.js"}`.
- `prime-agent/packages/coding-agent/src/config.ts:489-498` — `APP_NAME`/`ENV_AGENT_DIR` are derived from `pkg.piConfig?.name`; the string `prime-agent` is a display/env-prefix name only.
- `prime-agent/package.json:2-3` — the repo-root `prime-agent` package is `"private": true` (never published).
- `prime-agent/README.md:59-68` — `curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh`; "The installer downloads a versioned release, verifies its SHA-256 checksum, installs the `prime-agent` command".

**What concretely breaks if ignored.** `npm ci` in the kit either fails to resolve `prime-agent@0.8.1` or resolves an unrelated third-party package under that name and pins its integrity hash — a supply-chain hazard, not just an error. `node_modules/.bin/prime-agent` is never created, so the launcher cannot start, the pre-credential `--version` gate never runs, and the acceptance tests at lines 204 and 234 ("exact dependency and lockfile integrity", "pre-credential version enforcement") test a fiction. Every downstream guarantee that rests on "the tested 0.8.1 compatibility line" becomes unverifiable.

**Required change.** Pick a real provenance mechanism and name it exactly: either (a) depend on `@earendil-works/pi-coding-agent@0.8.1` with the committed lockfile and invoke `node_modules/.bin/pi`, asserting both `--version` == `0.8.1` and `piConfig.name` == `prime-agent`; or (b) pin the official release artifact by version *and* SHA-256, install it under `<kit>/toolchain/`, and invoke that absolute path. Note that the environment prefix `PRIME_AGENT_*` and config dir `.prime/agent` follow `piConfig`, so option (a) must assert it rather than assume it.

**Verification limit.** I could not query the npm registry from this environment. The claim above is that the *reviewed source tree* publishes no such package name or binary; if a separately published `prime-agent` npm distribution exists, the spec must cite it, because nothing in the 0.8.1 tree does.

### OPUS-R3-B2 — The coordinator's git context is the target checkout, not the worktree, so `BASE..HEAD` review packages and the ledger resolve in the wrong working tree

**Affected spec lines:** 30, 37, 123, 128–130, 132, 137, 143, 200.

**Finding.** The launcher chdirs to `TARGET_ROOT` (lines 30, 37) and the argument firewall rejects `--cwd` (line 184), so the coordinator session's cwd is the target's main checkout for the whole run. Only the *implementer* is told to `os.chdir(worktree_root)` (line 128). But three coordinator-owned steps are git- and path-relative: the ledger at `.superpowers/sdd/<plan>/progress.md` (line 123), the `BASE..HEAD` review package (line 129), the scoped fix-round package (line 130), and the independent gate rerun (line 132). Upstream resolves both the workspace and the diff from the *current* working tree.

**Source evidence.**
- `superpowers/skills/subagent-driven-development/scripts/sdd-workspace:34-39` — `root=$(git rev-parse --show-toplevel)`; workspace is `$root/.superpowers/sdd/<slug>`. In a linked worktree this is the worktree path; in the main checkout it is the target root. Two different roots.
- `superpowers/skills/subagent-driven-development/scripts/review-package:21-45` — verifies `BASE`/`HEAD` with `git rev-parse --verify` and emits `git log --oneline BASE..HEAD` and `git diff -U10 BASE..HEAD`, all in the caller's cwd.
- `superpowers/skills/subagent-driven-development/SKILL.md:141-149` — ledger identity and resume logic depend on finding *this plan's* ledger at `<workspace>/progress.md`; a ledger at another path is to be left alone and a fresh one started.
- `prime-agent/packages/coding-agent/src/cli/args.ts:135-136` — `--cwd` exists as the only CLI way to move the session root, and line 184 of the spec rejects it.
- `prime-agent/packages/coding-agent/src/core/agent-session-runtime.ts:313-325` — a child's cwd is `options.parentSession.sessionManager.getCwd()`, i.e. the launch cwd; a coordinator-side Python `os.chdir()` does *not* change it (that is why line 128's explicit instruction is correct — and why the coordinator's own git context is separate).

**What concretely breaks if ignored.** Worker commits land on the worktree's branch. In the coordinator's main checkout, `HEAD` is the untouched target branch, so `git rev-parse --verify HEAD` succeeds and `git log BASE..HEAD` is **empty**: `review-package` writes a valid-looking package containing zero commits and an empty diff, and the risk-scaled reviewer set faithfully reviews nothing and returns clean. That is a silent false pass of the entire review gate — the one gate the design's value rests on. Second failure: the coordinator's ledger is created under the target root while the workers' reports and packages are created under the worktree root, so after compaction the coordinator reads a ledger that does not contain the worker artifacts and re-dispatches completed tasks — the failure upstream names as "the single most expensive failure observed" (`SKILL.md:131-135`).

**Required change.** Make the coordinator's git context explicit and testable. State that immediately after worktree creation the coordinator executes `os.chdir(worktree_root)` in its own kernel and that every ledger, workspace, review-package, and gate command runs there (Prime's `bash()` re-reads `os.getcwd()` per call, so this works: `prime-agent/prime-agent-runtime/src/rlm/bash.py:166,175`), *or* mandate `git -C <worktree_root>` plus absolute workspace paths for every coordinator git/artifact command. Add the acceptance test that a review package built after a worker commit contains ≥1 commit and a non-empty diff, and that the ledger path resolves to one root for coordinator and workers alike.

### OPUS-R3-B3 — Prime shadows skills whole-directory, so the upstream templates and scripts this workflow depends on become unreachable

**Affected spec lines:** 43–44, 65–68, 123, 129–130, 194, 204.

**Finding.** The kit ships exactly four `SKILL.md` files (lines 65–68), two of which deliberately collide with upstream skill names, and line 194 says "the remaining upstream skill bodies are not copied". Prime resolves skills by frontmatter `name` with first-name-wins over a precedence-ordered path list: the winning skill is a single record pointing at the winning directory's `SKILL.md`. Sibling files of the *losing* directory are not merged and are not discoverable by name. Upstream's SDD skill is not self-contained: its workflow is carried by four sibling files and three scripts that the winning kit directory does not contain.

**Source evidence.**
- `prime-agent/packages/coding-agent/src/core/skills.ts:403` — `const name = frontmatter.name || parentDirName` (no package namespacing, so the collision the spec relies on does happen).
- `prime-agent/packages/coding-agent/src/core/skills.ts:513-566` — one `skillMap` keyed by name; on collision the later entry is dropped with a `collision` diagnostic naming `winnerPath`/`loserPath`. Only the winner's `filePath` survives.
- `prime-agent/packages/coding-agent/src/core/package-manager.ts:181-186` and `:2320-2338` — precedence ranks (`user-auto` 3 beats `package` 4 in ascending sort order), which is why the kit wins; nothing merges directory contents.
- `superpowers/skills/subagent-driven-development/` — `SKILL.md`, `implementer-prompt.md`, `task-reviewer-prompt.md`, `re-review-prompt.md`, `scripts/{sdd-workspace,review-package,task-brief}`; `SKILL.md:93,141,347,392-399,447-452` reference them by relative path.
- `superpowers/skills/using-superpowers/SKILL.md:54-59` — the harness reference files are likewise relative siblings.

**What concretely breaks if ignored.** The spec's own steps name artifacts the running system cannot locate: step 1's ledger convention comes from `scripts/sdd-workspace`, steps 7/8 depend on `scripts/review-package`, and the dispatch contracts for implementer / task reviewer / re-reviewer are upstream prompt files. With the kit's `SKILL.md` winning, relative links from it resolve inside the kit directory and miss; nothing in the spec gives the coordinator the shadowed package path. The coordinator will improvise prompts and hand-roll diffs, which removes the immutability property B2 also threatens and makes lines 129, 130, and 143 untestable.

**Required change.** Choose one and write it down: (a) the kit vendors the sibling templates and scripts it overrides into `agent-home/skills/subagent-driven-development/` (and drops line 194's blanket "not copied" for these files); or (b) the kit's SKILL.md addresses upstream artifacts by resolved absolute package path, and the extension exports that path (for example via the resource metadata available to it) so the coordinator never guesses; or (c) the kit renames its skills (e.g. `prime-sdd`) so no collision occurs and upstream stays intact, with the kit skill explicitly superseding upstream's. Add an acceptance test that every relative path referenced by a kit skill exists after installation, and that collision diagnostics list exactly the intended winner/loser pairs.

### OPUS-R3-B4 — The argument firewall's allowlisted "positional prompts" are an execution path to Prime's management subcommands

**Affected spec lines:** 12, 40, 184, 213.

**Finding.** Line 184 defines an allowlist that "accepts positional prompts and file references" and enumerates rejected *flags*. Prime dispatches management subcommands from `argv[0]` before flag parsing and independently of the POSIX `--` separator. Any forwarded first positional that matches a public command name is executed as that command, not as a prompt. The rejected-flag list also omits several flags that move the very invariants the firewall exists to protect.

**Source evidence.**
- `prime-agent/packages/coding-agent/src/main.ts:1055-1066` — `--offline` is honored by a raw `args.includes()` before anything else; then `handlePublicCommand(args)` runs before `parseArgs`.
- `prime-agent/packages/coding-agent/src/cli/public-command.ts:39-56` — routing is keyed on `const command = args[0]` against `PUBLIC_COMMAND_NAMES`; the `--` separator is only consulted afterwards for `--help` placement (`:66-72`), never to suppress command routing.
- `prime-agent/packages/coding-agent/src/cli/command-registry.ts:19,30,56-73,89,122-145,165-176` — public command paths include `agents`, `attach`, `schedule add|cancel|list`, `shutdown`, `package install|remove|update|list`, `session export`, `config`.
- `prime-agent/packages/coding-agent/src/cli/args.ts:100-330` — flags not covered by line 184's reject list: `--mode daemon|acp`, `--daemon-socket`, `--session-dir`, `--offline`, `--goal`/`--goal-token-budget`, `--no-context-files`, `--no-themes`, `--no-prompt-templates`, plus short aliases `-nt`, `-nbt`, `-ne`, `-ns`, `-np`, `-c`, `-r`, `-t`, `-e`; unknown `--flags` are collected into `unknownFlags` and handed to extensions (`:59`, `:299-313`).

**What concretely breaks if ignored.** A single forwarded positional executes fleet management inside the isolated home: `package install <anything>` adds extensions/skills to `agent-home` (defeating lines 43–44, 77, 193), `config` toggles resources, `attach`/`agents` reaches other sessions, `shutdown` kills every agent and worker mid-task, and `schedule add` arranges unattended re-entry. `--offline` additionally sets `PI_SKIP_VERSION_CHECK`. So the invariant promised at line 12 ("starts Sol as the maximum-effort coordinator … forwarding an allowlisted CLI surface") is bypassable through the allowlist itself, and the line 213 firewall tests would pass while the hole remains.

**Required change.** Specify the firewall as: reject any argument in first position that matches Prime's public command set or a removed-command name; always place the kit's own bootstrap prompt as `argv[0]` and pass user positionals only after the kit's `--`; enumerate the reject list from `args.ts` (including short aliases, `--mode` values other than `text|json|rpc`, `--daemon-socket`, `--session-dir`, `--offline`, `--goal*`, and all `--no-*` resource flags); and deny-by-default any unknown `--flag` rather than forwarding it to extensions. Extend line 213's tests with a case per public subcommand name and per short alias.

## Majors

### OPUS-R3-M1 — The thinking-map table contradicts line 117's catalog-parity claim for `off`, and makes "off" unreachable

**Affected spec lines:** 109–117.

**Finding.** Line 117 says the maps use "the matching 0.8.1 generated-catalog values", but the table's `off` column (`null` for every family) contradicts the catalog for both non-Google families, and `null` at `off` has a specific runtime meaning: the level becomes unsupported and is silently clamped upward.

**Source evidence.**
- `prime-agent/packages/ai/src/models.generated.ts` — `openai` provider `gpt-5.6-sol`/`gpt-5.6-terra`: `thinkingLevelMap: {"off":"none","xhigh":"xhigh","minimal":null,"max":"max"}`; `anthropic` provider `claude-opus-5`/`claude-sonnet-5`: `thinkingLevelMap: {"xhigh":"xhigh","max":"max"}` (no `off` key at all); `google` provider `gemini-3.1-pro-preview`: `{"off":null,"minimal":null,"low":"LOW","medium":null,"high":"HIGH"}` — only the Gemini row of the spec table matches its catalog entry.
- `prime-agent/packages/ai/src/models.ts:67-97` — `null` ⇒ unsupported; for `xhigh`/`max` `undefined` is also unsupported; for other levels `undefined` ⇒ supported (identity passthrough). `clampThinkingLevel` silently returns the next supported level upward.
- `prime-agent/packages/ai/src/providers/openai-responses.ts:155,248-262` — with `off` mapped to `null`, the `else if (… model.thinkingLevelMap?.off !== null)` branch is skipped, so no `reasoning` block is sent at all; with the catalog's `"none"` it would send `effort: "none"`.
- `prime-agent/packages/ai/src/providers/anthropic.ts:809-812` — `reasoning === "off"` is what disables thinking; if `off` is unsupported, `clampThinkingLevel` raises the request to `low` and `mapThinkingLevelToEffort` (`:770-796`) sends an effort instead.

**What concretely breaks if ignored.** `off` becomes unreachable for all five models: a request for no reasoning is silently upgraded to `low`, so `scripts/doctor --live` probes and any cheap mechanical call are billed and latency-shaped as reasoning calls, and the "unsupported effort" diagnostic at line 210 cannot distinguish a rejected level from a clamped one. Simultaneously, any test asserting line 117's catalog parity fails against the table. The two statements cannot both be implemented.

**Required change.** Either drop the parity sentence and justify each deliberate deviation (documenting that `off` is intentionally unavailable and that clamping to `low` is accepted), or set `off` to `"none"` for Sol/Terra and leave `off` supported for Opus/Sonnet, keeping explicit `null` only where the catalog has it. Add a truth-table test that asserts, per family, both `getSupportedThinkingLevels` and the emitted wire field for every one of the seven levels.

### OPUS-R3-M2 — A statically configured `anthropic-beta` header overwrites Prime's runtime betas, and the header the spec calls "required" exists nowhere in 0.8.1

**Affected spec lines:** 17, 106, 175, 180, 186, 206–207.

**Finding.** Line 180's comma-join fixes the *self-inflicted* half of the round-1 clobber but not the mechanism: any `anthropic-beta` supplied through provider/model headers replaces Prime's computed beta list wholesale, and that list is conditional on the model id at request time. Separately, `extended-cache-ttl-2025-04-11` does not appear anywhere in the reviewed 0.8.1 tree — Prime obtains 1-hour caching purely by emitting `ttl: "1h"` in `cache_control`.

**Source evidence.**
- `prime-agent/packages/ai/src/providers/anthropic.ts:225-233` — `mergeHeaders` is `Object.assign` semantics: later wins.
- `prime-agent/packages/ai/src/providers/anthropic.ts:843-861,928-941` — `betaFeatures` is built at request time from `FINE_GRAINED_TOOL_STREAMING_BETA` (`:170`) and `INTERLEAVED_THINKING_BETA` (`:171`), the latter only when `interleavedThinking && !supportsAdaptiveThinking(model.id)`; the default client merges `{... "anthropic-beta": betaFeatures.join(",")}` **then** `model.headers` **then** `optionsHeaders`.
- `grep -rn "extended-cache-ttl" prime-agent/packages/` → no matches.
- `prime-agent/packages/ai/src/providers/anthropic.ts:52-75,176` — `ttl: "1h"` is applied when retention is long and `compat.supportsLongCacheRetention ?? true`.

**What concretely breaks if ignored.** With the default `claude-opus-5`/`claude-sonnet-5` ids the static two-token header happens to be complete (adaptive models skip the interleaved beta), so the design looks correct in testing. The moment `PRIME_MODEL_OPUS`/`PRIME_MODEL_SONNET` points at a non-adaptive id, Prime would add `interleaved-thinking-2025-05-14` and the static header deletes it — silently degrading interleaved thinking with tool use, with no diagnostic. And the success criterion at line 17 asserts a "required beta header" that the runtime never produces on its own, so the mock-request assertion at line 207 is testing the kit's own injection, not Prime's behavior; if the gateway rejects unknown beta tokens, the kit fails closed for a header 0.8.1 does not consider necessary.

**Required change.** State that the kit *adds* to, never replaces, Prime's runtime beta list — i.e. compute the header per request (an extension `before_provider_request` hook can union tokens; `prime-agent/packages/coding-agent/src/core/extensions/types.ts:613-617`) or explicitly declare interleaved-thinking a non-goal and require adaptive-only model ids. Re-word line 17 to say the *kit* injects the extended-cache-ttl token for gateways that require it, note that Prime 0.8.1 itself does not send it, and make it removable via the compatibility switch already promised at line 186.

### OPUS-R3-M3 — "One active coordinator per clone" is unenforceable because Prime sessions are daemon-backed and outlive the launcher

**Affected spec lines:** 79, 204, 213.

**Finding.** The lock is described as a launcher-held, clone-level advisory lock taken "before package installation or startup". Prime's sessions run in a background daemon and survive terminal disconnect, so lock lifetime (launcher process) and coordinator lifetime (daemon session plus RLM children) are different intervals.

**Source evidence.**
- `prime-agent/README.md:50` — "Sessions run in the background: daemon-backed agents keep running when the terminal disconnects and can be reattached later."
- `prime-agent/README.md:79-85` — `prime-agent agents|attach|status|shutdown` manage those persistent sessions.
- `prime-agent/packages/coding-agent/src/core/agent-session-runtime.ts:313-325` and `prime-agent/packages/coding-agent/docs/rlm-runtime.md:169-179` — children are independent (optionally daemon-backed) sessions retained in a registry that "survives kernel restart, compaction, and parent restore".

**What concretely breaks if ignored.** Operator detaches (or the launcher exits) while the coordinator and its children keep working; the advisory lock releases; a second `./prime` run acquires the lock, passes the "no other run is active" check, and starts a second coordinator against the same `agent-home`, the same ledger file, and the same worktree. That directly violates line 141's "There may never be two live attempts for one ledger item", produces interleaved ledger writes with no locking discipline, and can produce two implementers committing to one branch. The line 213 test ("concurrent starts against one clone") passes because it only exercises two simultaneous *launchers*.

**Required change.** Base the invariant on observable session state rather than process lifetime: before startup, enumerate live sessions/agents for this agent home and refuse if any coordinator session is running or retained; hold the lock for the session's lifetime (or record the session id in the lock file and treat a live session as the owner); and specify the operator recovery path (attach vs explicit takeover). Add the acceptance test where run 1 is detached and still live, and run 2 must be refused with a diagnostic naming the live session.

### OPUS-R3-M4 — The severity mapping drops two upstream gate signals and the deferred-Minor roll-up

**Affected spec lines:** 129–132, 135, 137.

**Finding.** Line 135 maps only `Critical→Blocker` and `Important→Major` and states that only those gate progression. Upstream's task review has two additional gate-bearing outputs and one mandatory bookkeeping duty that the canonical taxonomy does not mention.

**Source evidence.**
- `superpowers/skills/subagent-driven-development/SKILL.md:356` — the fix loop triggers on "spec ❌, any Critical or Important finding, **or a ⚠️ item you confirmed as a real gap**".
- `superpowers/skills/subagent-driven-development/SKILL.md:346-354` — "⚠️ Cannot verify from diff" items must be resolved by the controller; a confirmed gap "is treated as a failed spec review".
- `superpowers/skills/subagent-driven-development/SKILL.md:361-366` — Minor findings must be ledgered as `Task <N>: minor (deferred): …` and the final whole-branch review pointed at that list, because "a roll-up nobody reads is a silent discard".
- `superpowers/skills/subagent-driven-development/task-reviewer-prompt.md:176-178,207` and `superpowers/skills/requesting-code-review/code-reviewer.md:96-102,143` — the reviewer report format is `Critical / Important / Minor` plus a spec verdict.

**What concretely breaks if ignored.** A task review that returns spec ❌ with zero Critical/Important findings satisfies the spec's gate as written and the task is marked complete against a frozen criterion it fails; every "cannot verify from diff" item — exactly the cross-task and unchanged-code requirements a diff-scoped reviewer cannot see — falls on the floor; and deferred Minors are never triaged at the whole-branch gate. This silently weakens the design's headline claim (line 15) that every loop is evidence-based and auditable.

**Required change.** Extend line 135: map upstream's spec verdict to a gating outcome, define `⚠️ Cannot-verify` as a coordinator-owned item that must be resolved with recorded evidence before completion (and becomes a Major when confirmed), and require the deferred-Minor list in the ledger plus its hand-off to the whole-branch review at step 11.

### OPUS-R3-M5 — Fail-closed Blocker/Major with no severity check creates a severity-deflation incentive

**Affected spec lines:** 15, 131, 135, 137.

**Finding.** Line 131 removes upstream's park-with-ruling route for real findings: an accepted Blocker/Major stops the workflow for the operator. The same coordinator that pays the stop cost also owns severity adjudication and `Settled` rulings, and nothing in the design audits downgrades.

**Source evidence.**
- `superpowers/skills/subagent-driven-development/SKILL.md:411-436` — upstream's breaker deliberately permits parking with a recorded ruling for findings that are contestable *or* real-but-not-load-bearing, stopping only when "the defect leaves every path forward a guess".
- `superpowers/skills/subagent-driven-development/SKILL.md:337-346` — upstream forbids pre-judging precisely because dispatchers are tempted to spare themselves a loop ("If the prompt you are writing contains 'do not flag,' … 'at most Minor' — stop").
- Spec lines 131/135/137 give the coordinator both the severity map and the ruling authority with no cross-seat check.

**What concretely breaks if ignored.** The cheapest way for a coordinator to avoid an operator stop at 2 a.m. is to rule a finding Minor or `Settled`; the ledger records the ruling and nothing flags the pattern. The design's auditability claim then becomes unfalsifiable in the exact situation it was written for, and the fail-closed policy produces *less* signal than upstream's park-with-ruling, which at least surfaces both sides to the final review.

**Required change.** Keep fail-closed, but split the roles: severity downgrades and `Settled` rulings on reviewer-raised Blocker/Major findings require concurrence from a fresh cross-family seat that did not author the artifact; every downgrade records `severity_original`, `severity_final`, and rationale; and the whole-branch review (step 11) must audit the full downgrade list. Alternatively re-adopt upstream's park-with-ruling for real-but-not-load-bearing findings and reserve the hard stop for load-bearing ones.

### OPUS-R3-M6 — Model-ID substring sniffing means `PRIME_MODEL_*` overrides can silently change the Anthropic wire shape

**Affected spec lines:** 109, 114, 117, 158–166, 210.

**Finding.** Line 117 anticipates metadata drift ("unless an environment model override also supplies its metadata"), but Prime selects the Anthropic request *shape* from the model id string, which no amount of supplied metadata changes.

**Source evidence.**
- `prime-agent/packages/ai/src/providers/anthropic.ts:746-763` — `supportsAdaptiveThinking` is a substring test over a fixed id list (`opus-5`, `sonnet-5`, `opus-4-6`, …).
- `prime-agent/packages/ai/src/providers/anthropic.ts:809-838` — adaptive ids take the effort-based path (`effort` from the thinking map); everything else takes the budget-token path (`adjustMaxTokensForThinking` + `thinkingBudgetTokens`), where the spec's `high → "high"` mapping is not what is sent.
- `prime-agent/packages/ai/src/providers/anthropic.ts:855-859` — the same predicate decides whether the interleaved beta is added (see OPUS-R3-M2).
- `prime-agent/packages/ai/src/providers/google.ts:409-411` — `isGemini3ProModel` is an unanchored regex, so Gemini aliases containing `gemini-3.1-pro` are safe; `prime-agent/packages/ai/src/cache-pricing.ts:14-18` also accepts `anthropic/` and `claude-` prefixes. The exposure is specific to the Anthropic adaptive-thinking id list.

**What concretely breaks if ignored.** An operator points `PRIME_MODEL_OPUS` at a gateway alias such as `opus-latest`, `claude-opus`, or a proxy-side name without the `opus-5` token. Nothing errors: the request silently switches to budget-token thinking with a derived `max_tokens` adjustment, the declared effort map is ignored, and the interleaved beta handling flips — a different reasoning contract for the seat the design designates as its architecture authority, invisible to `scripts/doctor` because a minimal completion still succeeds.

**Required change.** Constrain overrides: validate each `PRIME_MODEL_*` value against the id patterns whose wire path the kit depends on (require the `opus-5`/`sonnet-5` token for the Anthropic seats, or require an explicit `PRIME_ANTHROPIC_THINKING_MODE=effort|budget` acknowledgement), and add a doctor check that reports the resolved wire path (effort vs budget) and beta list per configured model rather than only reachability.

### OPUS-R3-M7 — The design mandates a frontier council with no budget, no admissions cap, and no control arm, so its own ceremony test cannot fire

**Affected spec lines:** 19, 83–99, 124–133, 139, 215.

**Finding.** This is my seat's assignment, so I state it as a finding rather than commentary. The model policy fixes nine seats, all frontier, at `high`/`max`; review is two to three seats per ordinary task and the full council for anything novel, protocol, concurrency, persistence, security, or final; each of up to five fix rounds gets *fresh* reviewers; the novel-value phase adds four more admissions before the spec is even frozen; deadlines are 45–120 minutes per admission. Line 99 explicitly refuses cheaper seats. Line 215 then promises that "repeated runs that add ceremony without better acceptance outcomes trigger removal or simplification of the extra seats" — but the design defines no cost or admission ceiling, no per-task admission cap, no wall-clock budget, and no comparison arm. Upstream's own guidance is the opposite default: "Use the least powerful model that can handle each role" (`superpowers/skills/subagent-driven-development/SKILL.md:184-199`), reserving the most capable model for architecture and the final whole-branch review.

**Source evidence.**
- Spec lines 85–93 (nine frontier seats), 97 (2–3 reviewers, full council on escalation), 99 ("bounded rather than replaced with cheap seats"), 124 (four discovery admissions), 126 (five spec rounds), 130 (five fix rounds with fresh reviewers), 139 (45/90/120-minute deadlines), 215 (removal rule with no metric).
- `superpowers/skills/subagent-driven-development/SKILL.md:184-199` — upstream's cost-scaled model selection, including "Scoped re-reviews of small fix diffs take a cheap-to-mid tier".
- `prime-agent/packages/coding-agent/docs/rlm-runtime.md:181-189` — Prime does attribute child usage and cost into the parent turn, so the measurement the spec needs is available and simply not required by it.

**What concretely breaks if ignored.** On a single hard task the mandated path admits roughly 4 (discovery) + 3 (spec council) × up to 5 rounds + 1 implementer + 2–3 reviewers per task × up to 5 fix rounds + 3 (final council) frontier admissions, each with a 45–120 minute ceiling. Nothing stops that, and because no control run and no budget exist, the line 215 verdict reduces to the simplicity reviewer's opinion — a subjective judgement the design elsewhere forbids for findings (line 125 demands counterfactuals). The predictable outcome is that ceremony is never removed, because removal requires a number the design never collects.

**Required change.** Make the ceremony test executable: (1) record per-task and per-run admission counts, wall-clock, and Prime-attributed usage/cost in the ledger and final report; (2) set a per-task admission ceiling and a run-level budget that, when exceeded, stops for operator input like any other fail-closed condition; (3) require one control arm on the first production task — a single-agent Superpowers SDD run against the same frozen acceptance criteria (separate worktree, no council) — so "found a material issue the simpler run would not have found" is a comparison rather than a claim; (4) adopt upstream's cheap-tier default for scoped re-reviews of small fix diffs, keeping frontier seats for architecture, TDD-gate, and whole-branch review. Without (1)–(3), I cannot certify that this design improves hard-task outcomes; with them, the design becomes falsifiable, which is its most valuable novel property.

## Minors

1. **OPUS-R3-N1 — Cancellation confirmation signal is unnamed (lines 140–141).** `rlm.delete_subagent` resolves to `{subagent, outcome?: "deleted" | "skipped_running"}` (`prime-agent/packages/coding-agent/src/core/rlm-runtime.ts:37-40`), a running child's cancellation is confirmed asynchronously via a `cancelled` terminal notice, and cleanup failure surfaces as a separate message instructing a retry (`agent-session.ts:9605-9613, 10333-10356`). Name which of these three signals constitutes "registry confirms cancellation/tombstone" and which maps to `cleanup-failed`, or the state machine is untestable.
2. **OPUS-R3-N2 — Deadline vs poll interval interaction (line 139).** With 5–10 minute polling, a 45-minute deadline is enforced at 45–55 minutes. State whether the deadline is poll-bounded or must be checked by a shorter timer, so the tests at line 209 have a tolerance.
3. **OPUS-R3-N3 — Plan-file identity and location unspecified (lines 123, 127).** `scripts/sdd-workspace` requires an existing plan file and derives the workspace slug from its basename. Say where the plan lives (kit `docs/` vs target worktree) and that its basename is stable, since it names the ledger directory.
4. **OPUS-R3-N4 — Untracked writes into the target main checkout (lines 123, 200).** `sdd-workspace` creates `.superpowers/sdd/.gitignore` containing `*` inside the resolved repo root (`sdd-workspace:36-39`). Line 200 covers `.worktrees/` exclusion but not this write. Confirm it is acceptable (it is self-ignoring) and state which root it lands in — this also interacts with OPUS-R3-B2.
5. **OPUS-R3-N5 — `rlm.find_models` result cap (line 95).** Limits are 8 by default and 20 maximum (`prime-agent/packages/coding-agent/src/core/rlm-runtime.ts:59-60`, `:187-190`). A broad selector could return a truncated list in which the single exact match is absent. Require querying by full `provider/id` selector and treating a truncated result as a hard error.
6. **OPUS-R3-N6 — Verification gap for the shadowed upstream Pi bootstrap (lines 13, 193, 208).** The mapping that denies subagents and names removed tools lives in both the extension body (`superpowers/.pi/extensions/superpowers.ts:88-95`, naming `read`/`write`/`edit`/`grep`/`find`/`ls`, all of which 0.8.1 removed — `prime-agent/packages/coding-agent/src/cli/args.ts:63-64`) **and** a skill body the package still installs (`superpowers/skills/using-superpowers/references/pi-tools.md`, reachable from `using-superpowers/SKILL.md:54-59`). `extensions: []` filters only the former (`prime-agent/packages/coding-agent/docs/packages.md:183-209`; skills load from the manifest's `pi.skills`, `superpowers/package.json:15-21`). Add an assertion that no rendered contract can reach `references/pi-tools.md` and that the kit's `using-superpowers` override does not link it.
7. **OPUS-R3-N7 — Lock diagnostic contents (line 79).** Include the agent-home path and target root in the diagnostic, not just PID/start time/target: with per-clone homes, the operator's most common confusion will be two clones pointed at one target.

## Round-2 fixes I verified as sound (not reopened)

| Round-2 claim | Verification |
|---|---|
| Hard deadline + cancel + tombstone + one retry (139–141) | `rlm.delete_subagent` cancels/closes and tombstones (`docs/rlm-runtime.md:171-179`), cleanup failure is reported with a retry instruction (`agent-session.ts:10345-10356`); statuses are observable via `rlm.list_subagents()` (`agent-session.ts:9472-9489`). Policy is implementable; see OPUS-R3-N1 for the one missing definition. |
| Explicit `null` for unsupported levels (117) | Correct and load-bearing: `xhigh`/`max` require a *defined* mapping, other levels treat `undefined` as passthrough (`packages/ai/src/models.ts:67-75`). The Gemini row matches the catalog exactly. |
| Env files are data, precedence, protected controls (182) | Sound; `PRIME_AGENT_CODING_AGENT_DIR` is the single point of isolation (`config.ts:501-531`, `settings-manager.ts:227-230`, `resource-loader.ts:648-651`, `package-manager.ts:1871-1881`) and correctly listed as protected. |
| Bearer/native only, forbidden header names (180) | Matches the provider-config surface: `authHeader` adds `Authorization: Bearer` without removing native key headers (`model-registry.ts:1295-1345`, schema at `core/extensions/types.ts:1186-1246`). |
| Unique proxy provider IDs and per-dialect roots (48–50, 105–107) | Confirmed again: Google zeroes `apiVersion` for custom `baseUrl` (`providers/google.ts:323-340`), the Anthropic SDK appends `/v1/messages`, and stored built-in auth cannot win for unique provider ids. |
| `rlmMaxDepth: 1` from the isolated home (77, 141, 205) | Global settings beat the `RLM_MAX_DEPTH` env default and gate child recursion (`settings-manager.ts:771-779`, `agent-session.ts:1570-1590`, `:4373`, throw at `:10214`). |
| Package pin + `extensions: []` (77, 192–193) | Ref pinning and filtering behave as claimed (`docs/packages.md:73-97,183-209`); skills still load from the manifest (`superpowers/package.json:15-21`), so disabling the extension does not disable methodology skills. |
| Worker `os.chdir(worktree_root)` (128) | Correct and necessary: child cwd is inherited from the parent's session cwd (`agent-session-runtime.ts:313-325`), and `bash()` re-reads `os.getcwd()` per call (`prime-agent-runtime/src/rlm/bash.py:166,175`). |
| Reconnaissance hygiene (147), in-repo worktree exclude (200), strict frontmatter tests (204) | Reasonable; frontmatter `name` is what drives collisions (`skills.ts:403`), so directory-matching tests are well targeted — and they are what would have caught OPUS-R3-B3. |

## Answer to the seat questions

- **Does the design improve outcomes on a hard frozen-spec task?** The evidence discipline (frozen acceptance commands, machine-checkable red-before-green, immutable review ranges, counterfactual findings, ledger-over-memory) is genuinely valuable and I would keep all of it. The multi-model council is unproven here and, as specified, unmeasurable (OPUS-R3-M7).
- **Would a simpler design pass the same acceptance tests?** Yes for most of them. A single coordinator running upstream SDD with one cross-family reviewer at spec freeze and at the whole-branch gate would satisfy every Verification bullet except those that assert the council's existence. The council must therefore earn its place with recorded cost/outcome data, not with policy text.
- **Blocking assessment.** Three of the four Blockers are cheap to fix in text (name the real binary, name the coordinator's git context, vendor or locate the upstream templates) and one requires enumerating Prime's subcommand surface in the firewall. None invalidates the architecture. Fix them, then this spec is ready for task breakdown.

## Sources

- Prime Agent 0.8.1 (local, commit `bc0fa7606abb3b7af0f765319518d255e6ae553d`): `packages/coding-agent/package.json`, `README.md`, `packages/coding-agent/src/config.ts`, `src/cli/args.ts`, `src/cli/public-command.ts`, `src/cli/command-registry.ts`, `src/main.ts`, `src/core/skills.ts`, `src/core/package-manager.ts`, `src/core/settings-manager.ts`, `src/core/model-registry.ts`, `src/core/agent-session.ts`, `src/core/agent-session-runtime.ts`, `src/core/rlm-runtime.ts`, `src/core/extensions/types.ts`, `packages/ai/src/models.ts`, `packages/ai/src/models.generated.ts`, `packages/ai/src/cache-pricing.ts`, `packages/ai/src/providers/{anthropic,openai-responses,google}.ts`, `prime-agent-runtime/src/rlm/bash.py`, `packages/coding-agent/docs/{packages.md,rlm-runtime.md}`. Upstream project: [PrimeIntellect-ai/prime-agent](https://github.com/PrimeIntellect-ai/prime-agent).
- Superpowers v6.3.0 (local, commit `b36e082`): `package.json`, `.pi/extensions/superpowers.ts`, `skills/using-superpowers/SKILL.md`, `skills/using-superpowers/references/pi-tools.md`, `skills/subagent-driven-development/{SKILL.md,implementer-prompt.md,task-reviewer-prompt.md,re-review-prompt.md,scripts/sdd-workspace,scripts/review-package}`, `skills/requesting-code-review/code-reviewer.md`, `skills/using-git-worktrees/SKILL.md`. Upstream project: [obra/superpowers](https://github.com/obra/superpowers).
- Prior reviews in this repository: `docs/reviews/design-opus-round-1.md`, `design-sol-round-1.md`, `design-gemini-round-1.md`, `design-sol-round-2.md`, `design-gemini-round-2.md`.
