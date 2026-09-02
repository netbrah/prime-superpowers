# Design review — Opus, round 6

**Seat:** Opus frontier reviewer — architecture, novelty, forest-level correctness. Fresh and independent; I did not read the prior Opus/Sol/Gemini round-6 reviews' findings before forming my own, and I re-derived every structural claim from the pinned sources rather than from any resolution record.

**Posture:** hostile. I assume every claim in the amendment is false until a `file:line` in the pinned reference proves it.

**Statement of non-modification:** I modified no design, plan, product, test, or source file. My only writes are this review file and a byte-copy of the pre-existing `design-opus-round-6.md` (which reviewed the earlier 297-line artifact) preserved as `design-opus-round-6-prior-artifact-297L.md` so this round's file could take the requested name without destroying it.

**Execution caveat:** the sandbox runs Node v20.20.1, below Prime Agent's `>=22.8.0` floor, so the real 0.8.1 binary cannot be started here. **Every claim below is derived from reading the pinned source trees, not from executing Prime.** Where a claim would need runtime observation to settle, I say so explicitly instead of asserting it.

## Artifact state

| Item | Value |
|---|---|
| Artifact | `docs/specs/2026-08-26-prime-superpowers-design.md` |
| Lines | 340 (341 with trailing newline-terminated last line) |
| SHA-256 | `f4eb3590729c70fbfff5a8e58b8d2619286d94abde21197b03dd006de04c21ca` (verified, matches the pinned digest in the review brief) |
| Header status | `Status: draft, round 6 runtime-topology and depth amendment incorporated` (line 3) |
| Prime Agent reference | `/home/user/workspace/prime-agent` @ `bc0fa7606abb3b7af0f765319518d255e6ae553d`, `prime-agent` 0.8.1 |
| Superpowers reference | `/home/user/workspace/superpowers` @ `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`, `superpowers` 6.3.0 |
| Reviewer runtime | Node v20.20.1 — below the 22.8.0 floor; source-derived review only |
| Sections in scope | Architecture intro (l.30), flow diagram (l.32–48), Runtime home topology (l.54–67), Shared package cache (l.69–73), settings/.state paragraph (l.114), Depth guarantee (l.198–210), Verification bullets (l.272–273), Round 6 resolution record (l.330–334) |

## Counts

**1 Blocker, 4 Majors, 5 Minors.**

The zero-Blocker / zero-Major gate is **not met**. Verdict: **changes required**.

Severity discipline applied: Blocker = unimplementable or unsafe as written. Major = a real gap that causes rework, or a load-bearing claim that is false or unverifiable. Minor = clarity. I did not re-litigate settled text; every finding below is inside the round-6 amendment or is a contradiction the amendment newly created.

## What this round confirms as genuinely fixed (empirical, file:line)

These are real improvements, verified in source, not taken on the resolution record's word.

1. **The immutable-template decision is correct and load-bearing.** Prime resolves its entire home from one env var: `getAgentDir()` returns `process.env[ENV_AGENT_DIR]` (`prime-agent/packages/coding-agent/src/config.ts:525-531`), where `ENV_AGENT_DIR = "PRIME_AGENT_CODING_AGENT_DIR"` (`config.ts:502`). Prime then writes freely inside that directory — `settings.json` (`core/settings-manager.ts:228`, written via `withLock` at `:259-291`), `auth.json` (`config.ts:606`), `sessions/` (`config.ts:620-626`), `logs/` (`config.ts:540`), `bin/` (`config.ts:616`), `themes/` (`config.ts:535`), `cron-jobs.json` (`config.ts:611`), `<app>-debug.log` (`config.ts:635`), `daemon-workers/` (`modes/daemon/daemon-supervisor.ts:530`), `daemon-update-restarts/` (`config.ts:568-572`), `session-leases/` (`core/session-lease.ts:70,241`), `rlm-ledger/` (`modes/daemon/rlm-ledger.ts:41,196`), `harness/` (`core/refinement/refinement.ts:24,270`), `telemetry.json` (`core/telemetry.ts:14,257-284`), `keybindings.json` (`core/keybindings.ts:377`), plus in-place startup migrations that rewrite `settings.json` and rename `oauth.json` (`migrations.ts:33-85`). Pointing that env var at a committed, tracked directory was genuinely untenable; round 6 correctly stops doing it. **This is the single most valuable change in the amendment.**

2. **Per-run composition genuinely contains the `--global` depth-poisoning path.** `/rlm-max-depth N --global` does not merely set session state: `AgentSession.setRlmMaxDepth` calls `settingsManager.setRlmMaxDepth(maxDepth)` (`core/agent-session.ts:11160-11167`), which mutates `globalSettings.rlmMaxDepth` and persists it to `<agentDir>/settings.json` (`core/settings-manager.ts:775-779` → `:598-618` → `:567-596` → `:259-291`). Under the pre-amendment topology that write landed in the committed template and silently raised the depth ceiling for **all future runs**. Under round 6 it dies with the per-run home. The amendment closes a real, previously unnoticed persistence hole — and, notably, the design does not claim this credit.

3. **The retracted extension-interception claim was correctly retracted.** `/rlm-max-depth` is dispatched inside the interactive command handler (`modes/interactive/interactive-mode.ts:4731`, `:9138-9162`), and there is no depth field, getter, or event anywhere in the extension API surface — `grep` over `core/extensions/types.ts` for `rlm|Rlm|depth|Depth` returns nothing. Line 202's statement of the limitation is accurate.

4. **The `E_PACKAGE_UNRESOLVED` ownership argument is correct.** Prime's resolver really does degrade silently: in offline mode a missing git source hits `installMissing()` → `isOfflineModeEnabled()` → `return false` → `continue` (`core/package-manager.ts:1210-1213`, `:1241-1243`), collecting zero resources for that package and reporting nothing; the `onMissing` contract likewise permits `"skip"` (`:1219`). `DefaultResourceLoader.reload()` calls `packageManager.resolve()` with no `onMissing` callback (`core/resource-loader.ts:338`), so the workflow's methodology skills can silently vanish. Moving the fail-closed preflight into the launcher is the right call. (The mechanism the design specifies to satisfy it is wrong — see OPUS-D6-B1 — but the reasoning is sound.)

5. **Digest-locking copied resources is well-motivated.** Prime treats colliding skills as whole directories and resolves them from `join(this.agentDir, "skills")` (`core/resource-loader.ts:648`); nothing in Prime verifies that those files match anything. A launcher-side lock is the only place that check can live.

## Architectural assessment

### Is per-run composed home + shared symlinked package cache the right decomposition?

**The per-run home: yes, and it is the correct primitive.** Prime's home is a read-write working directory by construction (see the write inventory above). Any design that treats one directory as both "the tracked artifact" and "the runtime target" is fighting the binary. Splitting template from runtime target is the right cut, and the run-id keying gives you free per-run isolation of sessions, ledger, leases, and daemon state — all of which Prime already keys off `agentDir`. I would keep this even if every finding below were fixed by other means.

**The shared package cache: right idea, wrong seam, and it is currently inert.** The design symlinks `<runtime-home>/packages/` at a shared entry (l.62, l.71). Prime never reads `packages/`. Git-sourced user-scope packages resolve to `join(this.agentDir, "git", source.host, source.path)` (`core/package-manager.ts:1871`, consumed at `:1240`), and for `git:github.com/obra/superpowers@v6.3.0` that is `<agentDir>/git/github.com/obra/superpowers` (`utils/git.ts:163-170`: `host = info.domain`, `path = user/project`, ref carried separately and **not** in the path). So as written the symlink is decoration, and every run re-clones over the network into its own fresh home. That is strictly worse than the pre-amendment topology, where at least one persistent home amortised the clone. See OPUS-D6-B1.

**Now the harder question the brief asks: does this create a worse problem than it solves?** My honest answer: *not worse, but the amendment has not paid for the problems it creates.*

- **Concurrency.** The design already forbids two active coordinators per clone (l.118), so the run-id namespace is not contended. But the *shared cache* is the one thing that is now cross-run and cross-time, and `installGit` treats mere directory existence as "installed" with no completion marker: `if (existsSync(targetDir)) return;` (`core/package-manager.ts:1710-1712`). A cache entry interrupted mid-clone is indistinguishable from a complete one to Prime. The design's digest index (l.71) catches this **only if the launcher recomputes the digest on every use before spawning**, which l.71 arguably says and l.73 arguably contradicts ("already present and digest-valid performs no network access" — present and digest-valid is a stronger check than present). Make it explicit; materialize into a temp path and rename.
- **Disk growth and audit retention.** `<kit>/.state/runs/<run-id>/agent-home` retains full session transcripts, logs, RLM ledger, and daemon state, "removed only by explicit operator cleanup" (l.67) — and the kit-owned command surface is exactly `attach`, `status`, `stop` (l.251, l.118). There is no cleanup command, no size bound, and no retention policy anywhere in the document. Unbounded growth in a directory the design forbids anyone from touching is a real operational defect, not a nit; it is the second-order cost of choosing per-run homes and the amendment does not price it. See OPUS-D6-N1.
- **Stale cache.** Adequately handled *in principle* by digest verification against the pinned commit (l.71), but the cache key `<name>@<ref>` cannot be expressed at Prime's ref-less install path without an explicit symlink, so two refs cannot coexist and a ref bump silently serves the old tree via the existence check at `:1710`. Folded into OPUS-D6-B1.
- **Partial composition after crash.** The lock is written *after* composition (l.65), so a crash mid-compose leaves an unlocked, incomplete home. For a fresh run-id this is harmless (nothing reuses it), but it becomes indistinguishable audit garbage. Compose-to-temp-then-rename is one line of spec and removes the whole class. See OPUS-D6-N2.
- **The read-only-after-composition claim does not hold.** This is the brief's third question and the answer is unambiguous: Prime writes into its agent dir at runtime, constantly, and into several of the exact paths the table marks read-only. `bin/` (fd/rg downloads) is not in the table at all and is *evaluated at module load* — `const TOOLS_DIR = getBinDir()` (`utils/tools-manager.ts:11`) — then populated by `ensureTool("fd")` / `ensureToolWithStatus("rg")` during interactive `init()` (`modes/interactive/interactive-mode.ts:1362-1364`), downloading from GitHub when no system binary is found (`utils/tools-manager.ts:110-130`, `:132-145`). `models.json`'s directory also receives `prime-inference-private-models.json` (`core/model-registry.ts:417`, `:894-899`, `:927-938`). `settings.json` is rewritten on the telemetry notice (`core/agent-session-services.ts:181-192` → `core/settings-manager.ts:857-859` → `save()`), on onboarding (`modes/interactive/interactive-mode.ts:1718`), and by startup migration (`migrations.ts:60-73`). See OPUS-D6-M1 and OPUS-D6-M2.

### The depth guarantee: honest, or theatre? Who is actually being defended against?

This is the most interesting part of the amendment, and the answer inverts the design's own framing.

**Depth *is* mechanically enforced, in-process, by Prime.** `AgentSession` throws before any child is created when the spawning session is at its ceiling:

```
if (this._rlmDepth >= this._rlmMaxDepth) {
    throw new Error(`RLM recursion depth limit reached (RLM_DEPTH=${this._rlmDepth}, RLM_MAX_DEPTH=${this._rlmMaxDepth})`)
```
(`core/agent-session.ts:10214-10217`)

Children are constructed with `rlmDepth: this._rlmDepth + 1, rlmMaxDepth: this._rlmMaxDepth` (`core/agent-session.ts:9334-9335`). With the root at depth 0 and max 1, a child sits at depth 1 with max 1, and `1 >= 1` throws inside the child's own process before `createRlmSubagentRuntime` is ever reached. The system-prompt suppression (`allowRecursion: this._rlmDepth < this._rlmMaxDepth` at `:4373`, consumed at `core/prompts/rlm.ts:149`) is only the polite layer on top; the throw is the wall. The kernel env comment says so outright: *"the TypeScript-side spawn check remains authoritative"* (`core/agent-session.ts:9199-9200`).

So, threat by threat:

| Threat | Stopped by what | Does controller admission add anything? |
|---|---|---|
| **Confused model** — coordinator's child tries to spawn a grandchild | Prime's hard throw, `agent-session.ts:10214` | **No.** Already impossible. The child cannot even be told the `rlm` API exists (`prompts/rlm.ts:149`). |
| **Hostile prompt injection into the coordinator** — attacker text tells the coordinator to nest agents | Prime's hard throw, at depth 1 | **No.** And note the controller is *invoked by the model*: it is skill prose, not code. A coordinator that ignores its skill is not stopped by its skill. This control is exactly as strong as the model's compliance, i.e. zero against a successful injection. |
| **Hostile prompt injection targeting depth escalation** — injected text tells the coordinator to raise depth | Nothing in the design, but nothing is needed: the model has no path to `/rlm-max-depth`. It is an interactive slash command consumed in the submit handler (`interactive-mode.ts:4731`, `:9138-9162`), and there is no depth setter in the RLM host API (`agent-session.ts:9063-9068` — `rlm.run`, `rlm.find_models`, `rlm.list_subagents`, `rlm.delete_subagent`, and nothing else) or in the extension API (`core/extensions/types.ts`, no depth surface). A model with `bash()` could rewrite `<runtime-home>/settings.json`, but that value is outranked by `inherited` and `chat` for every session already alive (`agent-session.ts:1570-1590`). | Marginal. Detection only. |
| **Careless operator** — human types `/rlm-max-depth 2` mid-run | Nothing prevents it. Prime honours it (`:11147-11157`, source becomes `"chat"`), and it outranks global for that session and every session forked from that branch (`:1574-1577`). | **Yes — this is the only real customer.** Ledger detection (l.208) genuinely converts an invisible policy drift into a halt. |
| **Operator using `--global`** — persists depth 2 to disk | Per-run composition (see "genuinely fixed" #2). | Yes, but that credit belongs to the topology change, not the depth section. |

**Verdict on the machinery:** the depth section is now *honest* (its retraction at l.200–202 is accurate), but it is **aimed at the wrong threat and under-claims the real guarantee**. Control #2 ("controller admission") is model-enforced policy defending against a scenario Prime already blocks in compiled code; against a hostile prompt it is theatre, because the same model that would be subverted is the one running the check. Control #3 (ledger detection) is the only one earning its keep, and it earns it against a *careless operator*, not an adversary. Control #1 (template default) is real and cheap.

**What the design should say instead:** state plainly that Prime 0.8.1 hard-refuses grandchild spawn at `agent-session.ts:10214`, that this covers the confused-model and injected-model cases without any kit machinery, that the residual hole is exclusively an interactive operator raising depth on the live root session, and that controls #2/#3 exist to *detect and halt on operator drift* — not to constrain the model. Naming the defended threat is what turns this from theatre into an honest, narrow, correct control. The document currently claims less safety than it has while spending more machinery than it needs. Both halves of that are worth fixing.

### Is there a materially simpler design that passes the same verification bullets?

Yes, and it is close to what is already written.

**Simpler alternative — "one persistent kit home + per-run session namespace":** keep `<kit>/agent-home` as the immutable template, but compose exactly **one** runtime home per kit clone at `<kit>/.state/agent-home`, recomposed (and digest-locked) only when the template hash changes. Per-run isolation comes from `PRIME_AGENT_SESSION_DIR` — Prime already honours it ahead of `<agentDir>/sessions` (`config.ts:620-631`) — pointed at `<kit>/.state/runs/<run-id>/sessions`.

What that buys: `git/` and `bin/` are naturally amortised across runs with no symlink, no shared-cache subsystem, no digest index, no `E_PACKAGE_UNRESOLVED` cache-validity branch, and offline repeat runs come for free including the fd/rg downloads. Verification bullets l.272–273 survive nearly verbatim (drop only "packages/ entry resolves to a digest-valid shared cache entry"; keep "second run performs no package network access", which this satisfies *more* completely than the current design). Disk growth becomes bounded-ish, because only transcripts accumulate.

What is lost, and it is not nothing: (a) the runtime home is no longer per-run immutable, so a `/rlm-max-depth --global` write persists across runs again — you would have to re-assert `rlmMaxDepth` from the template at every launch, which is a cheap check but a real one; (b) forensic reconstruction of "what resources did run X actually see" gets weaker, since one home serves many runs and the lock is per-template not per-run; (c) if a run corrupts the home, all runs are affected, whereas today the blast radius is one run.

**My judgment:** the per-run home is worth its cost *for the audit and blast-radius properties*, so I do not recommend switching. But the shared package cache as specified is the worst of both worlds — it adds a subsystem, a digest index, a preflight error code, and a symlink that Prime does not read. If OPUS-D6-B1 is fixed by symlinking `<runtime-home>/git` and `<runtime-home>/bin` at per-clone shared directories, the design gets the simpler design's amortisation *and* keeps per-run isolation, at the cost of one extra sentence. That is the right destination.

### Cross-section contradictions introduced by the amendment

- **Verification (l.272) vs. reality:** the bullet asserts a `packages/` entry that Prime never consults, and asserts "a second run performs no package network access" — which the amendment as written cannot deliver for the package tree (B1) and cannot deliver at all for `bin/` (M2).
- **Verification (l.273) vs. Depth guarantee (l.207-208):** asserting "the controller refuses admission when the observed depth source is persisted chat state" requires an observable *source*, which no API exposes (M3).
- **Runtime home topology (l.60-63) vs. Repository layout (l.114):** l.114 says the template contains no runtime state and that "auth, sessions, logs, caches, daemon sockets, and package trees exist only under `<kit>/.state/`" — a list that matches the table's invented directory names rather than Prime's actual ones, propagating the same error into a previously-settled paragraph.
- **Runtime home topology (l.67) vs. Configuration contract (l.251) and run record (l.118):** l.67 mandates operator cleanup; l.251 defines the complete kit-owned command surface as `attach`, `status`, `stop`, with no cleanup verb; l.118 says explicit completion or stop "clears the record" while l.67 says the home is retained — leaving record and home lifetimes divergent with no reconciliation (N1).
- **Safety and compatibility (l.257-267):** unchanged and not contradicted, but it never gained a bullet for the new symlink-out-of-tree surface or the shared `.state/packages` permission posture (N3).

---

## Blockers

### OPUS-D6-B1 — The shared package cache is wired to a directory Prime never reads, so it is inert and every run re-clones

**Affected text:** lines 62 (`| \`packages/\` | symlink to the shared package cache entry | read-only, cache-owned |`), 69–73 (entire "Shared package cache" subsection), 114 ("package trees exist only under `<kit>/.state/`"), 272 ("its `packages/` entry resolves to a digest-valid shared cache entry, a second run performs no package network access"), 333 (Round 6 resolution record).

**Evidence:**
- `prime-agent/packages/coding-agent/src/core/package-manager.ts:1864-1872` — `getGitInstallPath()`; user scope returns `join(this.agentDir, "git", source.host, source.path)`. There is no `packages` path anywhere in the resolver; `grep -rn '"packages"'` over `packages/coding-agent/src` returns only `core/settings-manager.ts:996,1003` (the settings *field* name, unrelated to any directory).
- `prime-agent/packages/coding-agent/src/utils/git.ts:163-170` — for `git:github.com/obra/superpowers@v6.3.0`, `host = "github.com"` and `path = "obra/superpowers"`; the ref is returned as a separate `ref` field and **never appears in the install path**. Concrete install target: `<agentDir>/git/github.com/obra/superpowers`.
- `prime-agent/packages/coding-agent/src/core/package-manager.ts:1239-1249` — resolution checks `existsSync(installedPath)` at that exact path; if absent it calls `installMissing()`.
- `prime-agent/packages/coding-agent/src/core/package-manager.ts:1708-1727` — `installGit()` does `git clone` then `git checkout <ref>`, i.e. full network fetch.
- `prime-agent/packages/coding-agent/src/core/package-manager.ts:1710-1712` — `if (existsSync(targetDir)) return;`. Existence alone, with **no ref verification and no completion marker**.

**Concrete failure:** With a fresh per-run home, `<runtime-home>/git/github.com/obra/superpowers` never exists, so Prime clones `obra/superpowers` from GitHub on **every single run**, ignoring the shared cache entirely. The kit's `E_PACKAGE_UNRESOLVED` preflight validates a cache that nothing consumes, the `index.json` digest lock protects a tree Prime never loads, and the design's headline claim — "repeated runs are offline-capable and do not re-clone the pinned repository" (l.73) — is false in production. Worse, in an actually-offline environment the launcher preflight passes (cache present and valid) and Prime then hits `isOfflineModeEnabled() → return false → continue` (`:1210-1213`, `:1241-1243`) and starts the coordinator with **zero Superpowers skills and no error**, which is precisely the silent-degradation failure mode l.73 says it exists to prevent. Separately, because Prime's path has no ref component, a future ref bump cannot coexist with `v6.3.0` and the existence check at `:1710` will silently serve the stale tree.

**Required correction:** Replace `packages/` with Prime's real layout throughout (l.62, l.71–73, l.114, l.272). Specifically: (a) the runtime home's `git/github.com/obra/superpowers` entry must be a symlink — or the shared root `<runtime-home>/git` must be a symlink to `<kit>/.state/packages/git` — such that Prime's own `getGitInstallPath()` resolves into the cache; (b) state that Prime's install path carries no ref, so the launcher must guarantee the linked tree is at the pinned commit before every spawn rather than relying on Prime's existence check; (c) state that the launcher verifies the cache entry's recorded digest on **every** run, not only when absent, and materializes into a temporary path renamed into place on success; (d) update l.272 to assert the `git/` linkage and to assert that an offline run with a valid cache still loads the full skill set.

## Majors

### OPUS-D6-M1 — The four-origin table names three directories Prime does not use and omits roughly a dozen paths Prime writes, so "read-only after composition" and "exactly four origins and nothing else" are both false

**Affected text:** lines 56 ("composed from exactly four origins and nothing else"), 58–63 (the path/origin/mutability table, especially `auth/`, `cache/`, `daemon/` and the `read-only after composition` rows), 65 (permissions and digest lock), 114.

**Evidence — invented names:** `auth.json` is a **file** at the home root, not an `auth/` directory (`config.ts:604-607`; `core/agent-session-services.ts:145`; `core/auth-storage.ts:109,264`). There is no `cache/` directory: `grep -rn 'getAgentDir()\|agentDir,' --include=*.ts` over `packages/coding-agent/src` yields no `cache` path. There is no `daemon/` directory; the real ones are `daemon-workers/` (`cli/daemon-ps.ts:998`; `modes/daemon/daemon-supervisor.ts:530`) and `daemon-update-restarts/` (`config.ts:568-572`).

**Evidence — omitted write targets, all under `getAgentDir()`:** `bin/` (`config.ts:614-617`, populated by download at `utils/tools-manager.ts:11,110-130` via `modes/interactive/interactive-mode.ts:1362-1364`); `themes/` (`config.ts:535`); `cron-jobs.json` (`config.ts:610-612`); `<APP_NAME>-debug.log` (`config.ts:633-635`); `keybindings.json` (`core/keybindings.ts:377`); `session-leases/` (`core/session-lease.ts:70,241`); `rlm-ledger/` (`modes/daemon/rlm-ledger.ts:41,196`); `harness/` (`core/refinement/refinement.ts:24,270`); `telemetry.json` (`core/telemetry.ts:14,257-284`); `git/.gitignore` (`core/package-manager.ts:1713-1715,1817-1825`); `prime-inference-private-models.json`, written **next to `models.json`** (`core/model-registry.ts:417,894-899,927-938`); `tools/` → `bin/` migration (`migrations.ts:286-321`); and `oauth.json` → `auth.json` migration plus an in-place `settings.json` rewrite at startup (`migrations.ts:33-85`, especially `:60-73`).

**Evidence — the read-only rows are violated:** `settings.json` is marked read-only at l.60, but Prime rewrites it via `FileSettingsStorage.withLock` → temp-write + `renameSync` (`core/settings-manager.ts:259-291`) whenever any global field is marked modified — triggered at minimum by the telemetry notice (`core/agent-session-services.ts:181-192` → `core/settings-manager.ts:857-859` → `save()` at `:598-618`), by first-run onboarding (`modes/interactive/interactive-mode.ts:1718` → `core/settings-manager.ts:661-663`), and by `/rlm-max-depth N --global` (`core/agent-session.ts:11160-11167` → `core/settings-manager.ts:775-779`). Note that a `0400` file mode does **not** stop this: the write path is temp-file + rename inside a `0700` directory the user owns.

**Concrete failure:** An implementer building to this table creates `auth/`, `cache/`, and `daemon/` — none of which Prime uses — and does not create `bin/`, `themes/`, `session-leases/`, `rlm-ledger/`, `harness/`, `git/`, or `daemon-workers/`. Prime creates them itself with `mkdirSync(..., {recursive:true})`, so the run does not crash, but every one of those paths is then outside the "exactly four origins" invariant and outside the digest lock's coverage. Meanwhile any verification test that asserts post-run digest stability of `settings.json` will fail on the first interactive run that shows onboarding or the telemetry notice, and any test asserting "the home contains only the four origins" fails immediately. The reviewer or auditor who later relies on `resources.lock.json` to prove "the run saw exactly these resources" gets a lock that silently covers a strict subset of what was actually loaded.

**Required correction:** Rewrite the table using Prime's real path names, with citations. Split the mutability column into three states, not two: *launcher-owned, digest-locked* (`settings.json`, `AGENTS.md`, `extensions/`, `skills/`, `models.json`); *cache-linked* (`git/`, and `bin/` if adopted per M2); *Prime-owned, unlocked* — and enumerate that third set explicitly (`auth.json`, `sessions/`, `logs/`, `themes/`, `cron-jobs.json`, `keybindings.json`, `telemetry.json`, `session-leases/`, `rlm-ledger/`, `harness/`, `daemon-workers/`, `daemon-update-restarts/`, `prime-inference-private-models.json`, `<app>-debug.log`). Replace "read-only after composition" with the accurate and testable claim: *the launcher records digests at composition and re-verifies the digest-locked set before reuse; divergence marks the run orphaned*. State that `settings.json` may legitimately diverge (naming the three writers) and say whether that divergence is tolerated or fails the run — the document currently implies the latter without saying so.

### OPUS-D6-M2 — "Offline-capable repeat runs" is false: the per-run home forces a fresh fd/rg download from GitHub on every run

**Affected text:** lines 63 (the created-empty row, which omits `bin/`), 73 ("repeated runs are offline-capable"), 272 ("a second run performs no package network access"), 333.

**Evidence:**
- `prime-agent/packages/coding-agent/src/config.ts:614-617` — `getBinDir()` returns `join(getAgentDir(), "bin")`, documented as "managed binaries directory (fd, rg)".
- `prime-agent/packages/coding-agent/src/utils/tools-manager.ts:11` — `const TOOLS_DIR = getBinDir();` evaluated at **module load**, so it binds to whatever `PRIME_AGENT_CODING_AGENT_DIR` names for that process.
- `prime-agent/packages/coding-agent/src/utils/tools-manager.ts:110-130` — `getToolPath()` checks `TOOLS_DIR` first, then falls back to system PATH; returns `null` if neither.
- `prime-agent/packages/coding-agent/src/utils/tools-manager.ts` (`ensureToolWithStatus`) — on `null`, unless `PI_OFFLINE` is set it downloads from GitHub, first hitting `https://api.github.com/repos/${repo}/releases/latest` (`:132-145`).
- `prime-agent/packages/coding-agent/src/modes/interactive/interactive-mode.ts:1362-1364` — interactive `init()` unconditionally awaits `ensureTool("fd")` and `ensureToolWithStatus("rg")`.

**Concrete failure:** On any host without system `fd`/`rg` — which the design's own reconnaissance policy assumes are present (l.196 mandates `rg`) — each run composes an empty `bin/`, so Prime contacts the GitHub releases API and downloads two binaries before the coordinator starts. On a genuinely offline or air-gapped host the downloads fail, `rg` is reported unavailable via `formatMissingRipgrepMessage` (`interactive-mode.ts:1365-1367`), and the workflow's mandated `rg`-based reconnaissance (l.196) degrades with only a warning. The design's offline claim is therefore false at the whole-run level even after B1 is fixed, and the l.272 assertion is scoped too narrowly ("package network access") to catch it.

**Required correction:** Add `bin/` to the topology as a per-clone shared, cache-linked entry (same treatment as `git/`), materialized once by the launcher; or state explicitly that the launcher exports `PI_OFFLINE` and preflights system `rg`/`fd` availability with its own fail-closed diagnostic. Broaden l.272 from "no package network access" to "no network access of any kind during a second run with a warm cache", and add a verification case that runs with the network denied and asserts the coordinator starts with the full skill set and a working `rg`.

### OPUS-D6-M3 — The controller cannot observe the depth *source*; Prime exposes it to no interface the controller can call

**Affected text:** lines 207 ("Before admitting any child it reads the effective depth and the source that produced it, and refuses admission unless the value is one and the source is the kit's global settings"), 208 ("Every admission records the observed depth value and source"), 273 ("the controller refuses admission when the observed depth source is persisted chat state"), 334.

**Evidence:**
- `prime-agent/packages/coding-agent/src/core/rlm-max-depth.ts:3-13` — `RlmMaxDepthSource = "default" | "env" | "global" | "inherited" | "chat"` and `RlmMaxDepthStatus {maxDepth, source}` exist, so the concept is real.
- `prime-agent/packages/coding-agent/src/core/agent-session.ts:11143-11145` — `getRlmMaxDepthStatus()` is an `AgentSession` method, reachable only over the agent-connection/daemon protocol (`modes/agent-connection/types.ts:749`; `modes/daemon/daemon-mode.ts:4907`) and rendered by the interactive `/rlm-max-depth` command (`modes/interactive/interactive-mode.ts:9138-9152`).
- `prime-agent/packages/coding-agent/src/core/agent-session.ts:9063-9068` — the complete RLM host-handler set available to the model: `rlm.run`, `rlm.find_models`, `rlm.list_subagents`, `rlm.delete_subagent`. No depth accessor.
- `prime-agent/packages/coding-agent/src/core/extensions/types.ts` — `grep -n 'rlm|Rlm|depth|Depth'` returns nothing; the kit extension cannot read it either.
- `prime-agent/packages/coding-agent/src/core/agent-session.ts:9198-9205` — the kernel env carries `RLM_DEPTH` and `RLM_MAX_DEPTH` **values only, no source**, and the code comment at `:9199-9200` warns "RLM_MAX_DEPTH may be stale in an already-running kernel; the TypeScript-side spawn check remains authoritative."

**Concrete failure:** The controller is a model executing Python in a long-lived kernel. It can read `RLM_MAX_DEPTH` (possibly stale by Prime's own admission) and nothing else. There is no call — tool, host handler, or extension hook — that returns `source`. An implementer building to l.207 will discover this at implementation time and either invent a substitute silently or stall; the verification case at l.273 cannot be written at all. This is the classic unverifiable-claim shape: it reads as a mechanism but names no mechanism.

**Required correction:** State the actual implementable path or drop the source predicate. The one path that works with 0.8.1: the controller reads its own session transcript — whose absolute path Prime injects into the system prompt as `messagesPath` (`core/system-prompt.ts:23,48,55,125`) — and scans the branch for a `custom` entry with `customType === "rlm_max_depth_state"` (`core/agent-session.ts:919`, appended by `setRlmMaxDepth` at `:11152`). Presence of that entry ⇒ source is `chat`; absence, combined with the template's `rlmMaxDepth: 1` and `_configuredRlmMaxDepth === undefined` for the root, ⇒ source is `global` (precedence at `:1570-1590`). Write that down concretely, or replace l.207–208 with "reads `RLM_MAX_DEPTH` and refuses admission when it is not 1, and independently scans the session transcript for a persisted depth override", and rewrite l.273 to assert what that implementation can actually observe.

### OPUS-D6-M4 — "Global settings govern every child session" is false: children resolve depth from inherited config, which outranks global

**Affected text:** lines 206 ("The runtime home's global settings set `rlmMaxDepth: 1`, which governs every new session, **including every child session**, so the default posture is depth one even when the operator's normal home says otherwise"), and consequentially 273 ("global `rlmMaxDepth: 1` takes effect even if the operator's normal home says 2").

**Evidence:**
- `prime-agent/packages/coding-agent/src/core/agent-session.ts:1570-1590` — `_resolveRlmMaxDepth()` precedence, in order: persisted chat entry → `"chat"`; `this._configuredRlmMaxDepth !== undefined` → `"inherited"`; `settingsManager.getRlmMaxDepth()` → `"global"`; `process.env.RLM_MAX_DEPTH` → `"env"`; else `2` → `"default"`. **Global is third.**
- `prime-agent/packages/coding-agent/src/core/agent-session.ts:9334-9335` — every child is constructed with `rlmDepth: this._rlmDepth + 1, rlmMaxDepth: this._rlmMaxDepth`, i.e. the parent's *resolved* ceiling.
- `prime-agent/packages/coding-agent/src/core/agent-session.ts:1247-1256` — the child's constructor stores `config.rlmMaxDepth` into `_configuredRlmMaxDepth`, so the child resolves `"inherited"` and **never consults global settings at all**.

**Concrete failure:** Two things break. (1) The stated mechanism is wrong: a child's ceiling is whatever the root resolved, so if the operator sets `/rlm-max-depth 2` on the root, children inherit **2** no matter what the template's global setting says — the global default protects only the root, and only until the operator overrides it. (2) The controller-admission rule at l.207 demands the source be `"global"`; for any child session that value is structurally `"inherited"`, so a literal implementation of l.207 inside a child would refuse every admission. Since the design also says the controller is the only sanctioned dispatch path (l.207) and only the coordinator dispatches, this is latent rather than immediately fatal — but it is exactly the kind of false mechanism statement that produces a wrong implementation. It also leaves the real guarantee unstated: grandchildren are blocked not by the global setting but by Prime's hard throw at `core/agent-session.ts:10214-10217`.

**Required correction:** Rewrite l.206 to state the actual precedence (`chat > inherited > global > env > default 2`, citing `agent-session.ts:1570-1590`), that children inherit the parent's resolved ceiling (`:9334-9335`) rather than re-reading global, and that the template default therefore governs the **root** session only. Add the guarantee the design is currently missing: Prime refuses grandchild spawn in compiled code (`agent-session.ts:10214-10217`), so with a root ceiling of 1 the depth-one property is mechanically enforced, and the kit's remaining job is to detect an operator raising the root's ceiling mid-run. Reframe l.210's "honest guarantee" accordingly, and state the threat model explicitly — this control stops a careless operator, not a prompt-injected coordinator (which is already stopped by the compiled check).

## Minors

### OPUS-D6-N1 — Retained runtime homes have no cleanup verb, no bound, and a lifetime that contradicts the run record

**Affected text:** line 67 ("Runtime homes are retained after completion for audit and are removed only by explicit operator cleanup"), against line 118 ("Explicit completion or stop clears the record after child reconciliation") and line 251 (kit-owned commands are exactly `attach`, `status`, `stop`).

**Evidence:** No cleanup command exists anywhere in the document; l.251 enumerates the full kit-owned surface. Each retained home holds the run's full session transcripts (`config.ts:620-626`), logs (`config.ts:540`), RLM ledger (`modes/daemon/rlm-ledger.ts:196`), and — absent M2's fix — two downloaded binaries in `bin/`.

**Concrete failure:** `<kit>/.state/runs/` grows without bound in a directory the design forbids anyone from touching casually, on a per-run basis that includes multi-megabyte binaries. Meanwhile the run record is cleared on completion (l.118) while the home is retained (l.67), so after a few runs the operator has orphaned home directories with no record pointing at them and no supported way to identify or remove them.

**Required correction:** Add a kit-owned cleanup verb to l.251 and l.67 (e.g. `./prime clean [--keep N]`), state the retention default explicitly, and reconcile l.118 with l.67 by saying that record clearing preserves a completed-run index entry naming the retained home path.

### OPUS-D6-N2 — Composition is not atomic: the digest lock is written after the copy, so a crash leaves an unlocked partial home

**Affected text:** line 65 ("After composition the launcher records the template tree hash and the per-file digests ... in `<run>/agent-home/resources.lock.json`").

**Evidence:** Ordering is stated as copy-then-lock. Prime's own analogous writes use temp-then-rename precisely to avoid this (`core/settings-manager.ts:278-284`; `core/telemetry.ts:240-254`; `core/model-registry.ts:932-935`).

**Concrete failure:** A crash or SIGKILL between the copy and the lock write leaves a fully-formed-looking runtime home with no `resources.lock.json`. Nothing in the document distinguishes that state from "an operator deleted the lock", and for a fresh run-id nothing reuses it, so it accumulates as indistinguishable audit garbage inside the retention set from N1.

**Required correction:** Specify that the launcher composes into `<kit>/.state/runs/<run-id>/agent-home.tmp`, writes `resources.lock.json` last inside it, then `rename()`s into place, and that a directory named `agent-home` without a lock file is always treated as corrupt.

### OPUS-D6-N3 — The permission invariant stops at the symlink boundary

**Affected text:** line 65 ("Copied files are written `0600`, directories `0700`, and the runtime home is rejected if it is group- or world-accessible") against line 62 and lines 71–73.

**Evidence:** The shared cache lives at `<kit>/.state/packages/...`, outside the runtime home. No permission, ownership, or symlink-target validation is specified for it. Prime itself will follow the link without comment: `existsSync` at `core/package-manager.ts:1241` and `collectPackageResources` at `:1248` both resolve through symlinks.

**Concrete failure:** A world-writable or wrong-owner shared cache satisfies the runtime-home permission check while supplying every methodology skill the coordinator loads. The symlink-rejection rule at l.65 is scoped to the *template*, so it does not cover this direction at all.

**Required correction:** Extend the permission and ownership invariant to `<kit>/.state/packages/` and its entries, and require the launcher to `realpath` the link target and confirm it is inside `<kit>/.state/` and owner-only before spawning Prime.

### OPUS-D6-N4 — Cache materialization does not account for Prime's post-clone `npm install`, which mutates the tree the digest describes

**Affected text:** line 71 ("Materialization verifies the resolved git commit against the pinned reference and records the tree digest in `<kit>/.state/packages/index.json`").

**Evidence:** `prime-agent/packages/coding-agent/src/core/package-manager.ts:1723-1726` — after clone and checkout, if the package has a `package.json`, `installGit` runs `npm install --omit=dev` (`getGitDependencyInstallArgs()` at `:1673-1679`) **inside the checkout**. Superpowers has a `package.json` (`superpowers/package.json`, with `pi.extensions` and `pi.skills`) and no committed lockfile, so npm will write `package-lock.json` (and `node_modules/` if any dependency existed) into the tree.

**Concrete failure:** If the launcher materializes by cloning only, the tree digest it records is not what a Prime-materialized entry would contain — and if any code path later lets Prime touch the entry, the recorded digest immediately mismatches and the entry is "rejected and must be rebuilt explicitly" (l.71) on a healthy cache. Either way the recorded digest and the on-disk tree disagree about whether `package-lock.json` is part of the package.

**Required correction:** State that the launcher materializes by `git clone` + `git checkout <pinned-commit>` **and nothing else**, that it hashes the git tree object at the pinned commit rather than the working directory, and that generated artifacts such as `package-lock.json` and `node_modules/` are excluded from the digest — or, alternatively, that the launcher reproduces the `npm install --omit=dev` step and hashes afterward. Pick one and say which.

### OPUS-D6-N5 — Resolution records are out of order

**Affected text:** lines 330–334 ("Round 6 resolution record") placed before lines 336–340 ("Round 5 resolution record").

**Concrete failure:** None functional. A reader scanning the appendix chronologically encounters round 6 between rounds 4 and 5 and may assume a round-5 record is missing.

**Required correction:** Move the Round 6 block after the Round 5 block.

---

## Notes on what I deliberately did not raise

- I did not re-litigate the Anthropic beta header, thinking maps, Node preflight, argument firewall, toolchain checksums, or skill-collision handling. I spot-checked that the amendment did not disturb them and it did not.
- I did not raise line 202's characterization of `/rlm-max-depth` as a builtin consumed before extension `input` handlers. It is accurate as far as I can verify from `modes/interactive/interactive-mode.ts:4731,9138-9162` and the absence of any depth surface in `core/extensions/types.ts`, and it was settled in a prior round.
- I did not raise concurrency between two kit clones sharing a machine, because nothing in the design shares state across clones and `.state/` is clone-local by construction.
- I could not execute Prime Agent 0.8.1 to observe any of the above at runtime; Node here is v20.20.1 against a `>=22.8.0` floor. Every finding is derived from the pinned sources at the commits named in the artifact-state table, and every claim carries a `file:line` a subsequent reviewer can check without running anything.
