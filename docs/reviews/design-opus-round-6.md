# Design review — Opus, round 6

**Seat:** Opus frontier reviewer — architecture, novelty, forest-level correctness. Fresh and independent: I formed every finding by reading the pinned reference trees directly and did not adopt any conclusion from a prior round's review or from the artifact's own resolution records.

**Posture:** hostile. Every claim in the amendment is treated as false until a `file:line` in the pinned source proves it.

**Statement of non-modification:** I modified no design, plan, product, test, or source file. My only writes are this review and a byte-copy of the pre-existing `design-opus-round-6.md` — which reviewed the earlier 297-line artifact — preserved as `design-opus-round-6-prior-artifact-297L.md` so this file could take the requested name without destroying prior work.

**Execution caveat:** this sandbox runs Node v20.20.1, below Prime Agent's `>=22.8.0` floor, so the 0.8.1 binary cannot be started here. **Every claim below is derived from reading the pinned source, not from executing Prime.** Where settling a point would require runtime observation, I say so rather than assert it.

## Artifact state

| Item | Value |
|---|---|
| Artifact | `docs/specs/2026-08-26-prime-superpowers-design.md` |
| **Lines reviewed** | **359** |
| **SHA-256 reviewed** | **`419a71c6a4d00b1dd7378fb86e2b576407ab1ecf9120af621f238c0168011504`** |
| SHA-256 named in my review brief | `f4eb3590729c70fbfff5a8e58b8d2619286d94abde21197b03dd006de04c21ca` (340 lines) — **no longer on disk** |
| Header status | `Status: draft, round 6 runtime-topology and depth amendment incorporated` (l.3) |
| Prime Agent reference | `/home/user/workspace/prime-agent` @ `bc0fa7606abb3b7af0f765319518d255e6ae553d`, v0.8.1 |
| Superpowers reference | `/home/user/workspace/superpowers` @ `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`, v6.3.0 |
| Reviewer runtime | Node v20.20.1 — below the 22.8.0 floor; source-derived review only |

> **Artifact drift disclosure.** The design was rewritten while this review was in progress (mtime 2026-09-02 21:48 UTC, during my evidence-gathering pass). The version I was asked to review no longer exists on disk. **Every line number and finding below refers to the 359-line `419a71c6…` artifact.** Roughly half the findings I had drafted against the 340-line version — most importantly that the package symlink was placed at a `packages/` path Prime never reads — are resolved in the current text, and I have moved them into "genuinely fixed" rather than reporting them. The findings that follow are all against the current text. Whoever consumes this review should confirm the hash before acting on it; a round whose artifact moves mid-review cannot be gated safely, and the drift itself is worth a process note.

## Counts

**1 Blocker, 3 Majors, 5 Minors.**

The zero-Blocker / zero-Major gate is **not met**. Verdict: **changes required**.

Severity discipline: Blocker = unimplementable or unsafe as written. Major = a real gap causing rework, or a load-bearing claim that is false or unverifiable. Minor = clarity. I did not re-litigate settled text; every finding is inside the round-6 amendment or is a contradiction the amendment newly created. The single Blocker is not a nit dressed up — it is a capability the amendment *creates* that did not exist before it.

## What this round confirms as genuinely fixed (empirical, file:line)

Verified against source, not against the resolution record.

1. **The package link is now at Prime's real computed leaf, and the design's reasoning for it is exactly right.** Lines 79–81 assert that a global git source installs at `<agentDir>/git/<host>/<repository path>`, that Prime tests that exact path and skips cloning only when it exists, and that a link anywhere else is silently ignored. All three are true: `getGitInstallPath()` returns `join(this.agentDir, "git", source.host, source.path)` (`core/package-manager.ts:1864-1872`); resolution checks `existsSync(installedPath)` at that path and otherwise clones (`core/package-manager.ts:1239-1249`); `parseGitUrl` on `git:github.com/obra/superpowers@v6.3.0` yields `host = "github.com"`, `path = "obra/superpowers"`, ref carried separately (`utils/git.ts:137-177`, especially `:163-170`), giving `<runtime-home>/git/github.com/obra/superpowers` verbatim as l.81 states. The instruction to derive the mapping from the declared source rather than hardcode it is the correct engineering call.

2. **The `E_PACKAGE_UNRESOLVED` ownership argument is correct, and Prime really does degrade silently.** Line 85's justification checks out: in offline mode a missing git source hits `installMissing()` → `isOfflineModeEnabled()` → `return false` → `continue` (`core/package-manager.ts:1210-1213`, `:1241-1243`), collecting zero resources and reporting nothing; the `onMissing` contract also permits `"skip"` (`:1219`), and `DefaultResourceLoader.reload()` passes no `onMissing` at all (`core/resource-loader.ts:338`). Moving fail-closed preflight to the launcher is right.

3. **The immutable-template split is the correct primitive.** Prime resolves its entire home from `PRIME_AGENT_CODING_AGENT_DIR` (`config.ts:502`, `:525-531`) and then writes into it continuously — `settings.json` (`core/settings-manager.ts:228`, `:259-291`), `auth.json` (`config.ts:606`), `sessions/` (`config.ts:620-626`), `logs/` (`config.ts:540`), `bin/` (`config.ts:616`), `themes/` (`config.ts:535`), plus in-place startup migrations that rewrite `settings.json` and rename `oauth.json` (`migrations.ts:33-85`). Pointing that variable at a tracked directory was untenable. This change is the most valuable thing in the amendment.

4. **The daemon-socket isolation point is real, not invented.** Line 69's claim that Prime's default socket is process-global under the system temp directory is correct (`modes/daemon/daemon-socket.ts:3,38` — `tmpdir()`-derived `defaultDaemonSocketPath()`), and the per-run override the launcher needs genuinely exists as `--daemon-socket <path>` (`cli/args.ts:107-108`; `cli/command-registry.ts:198`).

5. **The retracted interception claim was correctly retracted, and the replacement observation channel is real.** Line 214's limitation statement is accurate: `/rlm-max-depth` is dispatched inside the interactive command handler (`modes/interactive/interactive-mode.ts:4731`, `:9138-9162`), and no depth surface exists in the extension API (`grep -n 'rlm|Rlm|depth|Depth' core/extensions/types.ts` returns nothing). Line 216's characterization of the kernel channel is also exactly right: the RLM host handler set is precisely `rlm.run`, `rlm.find_models`, `rlm.list_subagents`, `rlm.delete_subagent` (`core/agent-session.ts:9063-9068`) with no depth handler, and the kernel env carries only numeric `RLM_DEPTH`/`RLM_MAX_DEPTH` whose own source comment warns it "may be stale in an already-running kernel" (`core/agent-session.ts:9198-9205`). And line 218's daemon channel exists and returns both fields: `get_rlm_max_depth_status` with `activeSessionId` (`modes/daemon/daemon-protocol.ts:636`), handled at `modes/daemon/daemon-mode.ts:4905-4907`, returning `RlmMaxDepthStatus {maxDepth, source}` (`core/rlm-max-depth.ts:3-8`). **The design correctly identified that the kernel variable is unusable and correctly found the one channel that carries the source.** That is good work. It is also the source of this round's Blocker, because that channel carries more than the design noticed.

6. **Per-run composition genuinely contains a persistence hole the design does not claim credit for.** `/rlm-max-depth N --global` does not merely set session state: it calls `settingsManager.setRlmMaxDepth()` (`core/agent-session.ts:11160-11167`) which persists to `<agentDir>/settings.json` (`core/settings-manager.ts:775-779` → `:598-618` → `:259-291`). Under the old topology that write landed in the committed template and raised the ceiling for all future runs. Under round 6 it dies with the run.

## Architectural assessment

### Is per-run composed home plus a shared symlinked package cache the right decomposition?

**Yes for the per-run home, and it is now correctly wired for the cache.** Prime's home is a read-write working directory by construction, so any design treating one directory as both tracked artifact and runtime target is fighting the binary. Run-id keying gives free isolation of sessions, ledger, leases, and daemon state, all of which Prime already keys off `agentDir`. With the package link now landing on Prime's actual computed leaf (l.81) and the socket forced per-run (l.69), the decomposition holds together.

**Does it create a worse problem than it solves? No — but two costs are still unpriced.**

- **Concurrency.** The design forbids two active coordinators per clone (l.130) and now forces a per-run daemon socket (l.69), so the run namespace is uncontended. The one genuinely cross-time surface is the shared cache, and there Prime's `installGit` treats bare directory existence as "installed" — `if (existsSync(targetDir)) return;` (`core/package-manager.ts:1710-1712`), with **no ref verification and no completion marker**. The design's atomic temp-then-rename for cache entries (l.83) is exactly the right mitigation and closes this. Good.
- **Disk growth and audit retention — still unpriced.** Line 75 retains runtime homes "removed only by explicit operator cleanup", and the kit-owned command surface at l.267 is exactly `attach`, `status`, `stop`. No cleanup verb, no bound, no retention policy exists anywhere in the document, while l.130 clears the run record on completion — so retained homes outlive the only records that name them. See OPUS-D6-N1.
- **Stale cache.** Digest verification against the pinned commit (l.83) handles content drift. What it does not address is that Prime's install path carries no ref component, so the cache key `<name>@<ref>` (l.79) cannot be expressed at the leaf; a ref bump must repoint the link, and if it does not, `:1710-1712` silently serves the old tree. See OPUS-D6-N3.
- **Partial composition after crash.** Handled: temp directory plus atomic rename (l.73). Correct.
- **Read-only-after-composition.** The design deserves credit for retiring that phrase in favour of "integrity-checked" with an explicit same-UID caveat (l.73). But it kept `settings.json` in the integrity-checked class (l.60) while Prime legitimately rewrites it, which turns manifest recomputation on attach into a false-orphan generator. See OPUS-D6-M1.

### Is the depth guarantee honest, and is it worth the machinery? Who is actually being defended against?

The honesty question and the worth question now split apart, and the answer to the second is worse than the first.

**On honesty, the section is close to right and in one place too modest.** Line 226's window analysis is correct: children are constructed with the parent's *resolved* ceiling (`core/agent-session.ts:9334-9335`), so a mid-run change reaches only children admitted afterward, and detection at the next poll is genuinely the best available. What the section omits is the strongest guarantee it actually has. Prime hard-refuses the spawn in compiled code:

```
if (this._rlmDepth >= this._rlmMaxDepth) {
    throw new Error(`RLM recursion depth limit reached (RLM_DEPTH=${this._rlmDepth}, RLM_MAX_DEPTH=${this._rlmMaxDepth})`)
```
(`core/agent-session.ts:10214-10217`)

With a root ceiling of 1, a child sits at depth 1 with max 1 and `1 >= 1` throws inside the child's own process, before any grandchild runtime is created. The system-prompt suppression at `:4373` (consumed at `core/prompts/rlm.ts:149`) is the polite layer; this throw is the wall. Prime's own comment says so: "the TypeScript-side spawn check remains authoritative" (`core/agent-session.ts:9199-9200`). The design gestures at this once ("Prime's own spawn guard", l.226) but never states it as a guarantee, so the document claims less safety than it has.

**On worth, the threat model inverts.** Here is who is actually stopped, by what:

| Threat | What stops it | Does controller admission add anything? |
|---|---|---|
| **Confused coordinator** — model tries to nest agents | Prime's hard throw, `agent-session.ts:10214-10217`; the child is not even told the `rlm` API exists (`prompts/rlm.ts:149`) | Marginally. Already impossible in compiled code. |
| **Careless operator** — human types `/rlm-max-depth 2` on the live root | Nothing prevents it; Prime honours it and source becomes `"chat"` (`agent-session.ts:11147-11157`), outranking global for that session (`:1570-1590`) | **Yes. This is the only real customer**, and l.226 says so honestly. |
| **Prompt-injected coordinator** — hostile text drives the model | Before round 6: the model had *no* depth-write primitive at all. RLM host handlers are read/dispatch only (`:9063-9068`), extensions expose nothing, and the kernel env is read-only values (`:9198-9205`). | **The amendment makes this worse.** See below. |

**The decisive observation.** The design's own fix hands the model the two inputs needed to *write* depth. Line 218 has the launcher pass "the per-run daemon socket path and the exact parent session identity to the controller", and l.216 states the controller "is invoked from a Prime IPython cell" — i.e. it is model-driven code with `bash()` and Python in the loop. That same socket accepts `set_rlm_max_depth` with `{activeSessionId, maxDepth, global}` (`modes/daemon/daemon-protocol.ts:637`), handled at `modes/daemon/daemon-mode.ts:4910-4913`, and it is in the supported capability sets alongside the getter (`daemon-mode.ts:326-327`; `daemon-supervisor.ts:254-255`). The protocol carries no token or authentication; access control is the socket file's permissions, and the controller runs as the same UID. So the amendment converts "the model provably cannot change depth" into "the model is handed exactly what it needs to change depth" — in order to *read* depth. That is a net loss against the one threat class where the kit previously had a structural, non-model-enforced guarantee. See OPUS-D6-B1.

That is also why "is this security theatre?" has a sharper answer than usual here. Control #2 is model-enforced policy checked by the same model that would be subverted, so against a hostile prompt it is worth zero — but that was already true and merely wasteful. Granting the write capability to obtain the read is the part that is actively harmful. The fix is not to abandon the daemon channel; it is to put the socket on the launcher's side of the trust boundary, not the model's.

### Is there a materially simpler design that passes the same verification bullets?

Two, at different scopes.

**Simpler depth control.** Delete control #2 entirely and keep only the template default plus a launcher-owned poller that reads `get_rlm_max_depth_status` from outside the model's process and halts the run on a source transition. Verification bullets l.290 survive almost verbatim — "the controller obtains depth value and source over the daemon channel rather than the kernel environment variable" becomes "the launcher-side monitor obtains…". What is lost: admission-time granularity, so a grandchild could in principle be dispatched in the window between polls. What is gained: the model never touches the socket, which removes the Blocker outright, and Prime's compiled guard at `:10214` still covers the confused-model case for free. **This is strictly better and I recommend it.**

**Simpler topology (offered for completeness; I do not recommend switching).** Compose one runtime home per kit clone at `<kit>/.state/agent-home`, recomposed only when the template hash changes, with per-run isolation from `PRIME_AGENT_SESSION_DIR` — which Prime honours ahead of `<agentDir>/sessions` (`config.ts:620-631`). That amortises `git/` and `bin/` with no symlink and no cache subsystem, and makes offline repeat runs free including fd/rg. Lost: per-run manifest forensics, blast-radius containment, and the `--global` write containment credited above. The per-run home earns its cost; keep it.

### Cross-section contradictions introduced by the amendment

- **l.218 vs l.267.** The argument firewall deliberately makes the daemon socket an internal, non-user-selectable invariant and rejects "daemon socket" from the safe surface — then l.218 hands the path to the model-invoked controller, which is a far less constrained principal than the user the firewall was protecting against.
- **l.60 vs l.75 and l.290.** `settings.json` is integrity-checked, attach/status/stop "recompute the full manifest before trusting the runtime", and divergence makes the run `orphaned` — but Prime writes that file during normal operation (M1).
- **l.222 vs the depth precedence in source.** "Governs every new session, including every child session" is false, and it makes control #2's source predicate structurally unsatisfiable for any non-root session (M2).
- **l.75 vs l.130 and l.267.** Homes are retained; records are cleared on completion; no cleanup verb exists (N1).

---

## Blockers

### OPUS-D6-B1 — Giving the model-invoked controller the daemon socket hands it a depth-*write* primitive it previously did not have

**Affected text:** line 216 ("The kit controller is invoked from a Prime IPython cell"), line 218 ("The launcher therefore passes the per-run daemon socket path and the exact parent session identity to the controller, and the controller performs the daemon handshake and queries that status directly"), line 223, line 290 ("the controller obtains depth value and source over the daemon channel"), line 351.

**Evidence:**
- `prime-agent/packages/coding-agent/src/modes/daemon/daemon-protocol.ts:637` — the same protocol that carries the getter carries `{ id?: string; type: "set_rlm_max_depth"; activeSessionId: string; maxDepth: number; global?: boolean }`.
- `prime-agent/packages/coding-agent/src/modes/daemon/daemon-mode.ts:4910-4913` — handler: `getSessionState(command.activeSessionId)` then `await state.runtime.session.setRlmMaxDepth(command.maxDepth, { global: command.global })`. Note it takes the *same* `activeSessionId` the design instructs the launcher to hand over.
- `prime-agent/packages/coding-agent/src/modes/daemon/daemon-mode.ts:326-327` and `modes/daemon/daemon-supervisor.ts:254-255` — `get_rlm_max_depth_status` and `set_rlm_max_depth` sit adjacently in the supported-capability sets; there is no read-only client mode.
- No authentication in the protocol: `grep -n "token|auth|secret|credential" modes/daemon/daemon-protocol.ts` returns only `authoritative_child_roster` capability strings. Access control is filesystem permissions on the socket, and the controller runs as the same UID as Prime.
- Effect of the write: `core/agent-session.ts:11147-11157` appends the persisted branch entry and sets source `"chat"`; with `global` it additionally calls `settingsManager.setRlmMaxDepth` (`:11160-11167`) → `core/settings-manager.ts:775-779` → `save()` `:598-618` → atomic temp-write and `renameSync` into `<runtime-home>/settings.json` (`:259-291`).
- What the model could reach **before** this amendment: RLM host handlers are exactly `rlm.run`, `rlm.find_models`, `rlm.list_subagents`, `rlm.delete_subagent` (`core/agent-session.ts:9063-9068`); the extension API has no depth surface (`core/extensions/types.ts`); the kernel env carries read-only, possibly-stale numbers (`core/agent-session.ts:9198-9205`). **There was no model-reachable depth-write path at all.**

**Concrete failure:** The coordinator executes attacker-influenced text — a target repository's `AGENTS.md`, a README, a test fixture, a review artifact, any of which the workflow reads by design. One line written to the socket the design just handed it (`{"type":"set_rlm_max_depth","activeSessionId":"<the id the design also handed it>","maxDepth":8,"global":true}`) raises the live ceiling and rewrites the runtime home's `settings.json`. Nested subagent fan-out then proceeds past Prime's compiled guard at `core/agent-session.ts:10214-10217`, which is the only non-model-enforced depth control in the entire system. Control #2 does not catch this, because control #2 is prose executed by the same compromised model. The corrupted `settings.json` additionally breaks the integrity manifest, so the next `./prime attach` marks a live run `orphaned` (l.75) and the operator loses recovery. The design's stated posture — "it defends against a confused coordinator and an accidental override" (l.226) — is no longer accurate once the confused coordinator is given a write handle to the control it is supposed to be confused about.

**Required correction:** Move the daemon socket to the launcher's side of the trust boundary. Concretely: (a) state that the raw socket path and the parent session id **must never** appear in the coordinator's environment, system prompt, ledger, run record, or any file readable from the worktree or runtime home; (b) have a launcher-owned monitor process — outside the model's process, holding the socket — perform the depth-status polling of control #3 and halt the run on a source transition; (c) if admission-time checking is retained, expose it to the controller as a launcher-mediated, read-only endpoint (a proxy socket that allowlists `get_rlm_max_depth_status` and drops every other command type, or a launcher-written status file the controller reads), never the raw daemon socket; (d) add a verification case asserting that a `set_rlm_max_depth` command issued from the coordinator's own kernel is refused, and that the socket path is absent from the coordinator's environment and prompt; (e) update l.216–218, l.223, l.290, and the l.351 resolution record accordingly.

## Majors

### OPUS-D6-M1 — `settings.json` is classified integrity-checked, but Prime rewrites it in normal operation, so every attach false-orphans a healthy run

**Affected text:** line 60 (`settings.json` in the "launcher-owned, integrity-checked" row), line 73 ("integrity is enforced by manifest comparison"), line 75 ("each recomputes the full manifest before trusting the runtime, and a missing or divergent runtime home makes the run `orphaned` rather than silently rebuilt"), line 289 ("attach, status, and stop recompute the full manifest before trusting the runtime").

**Evidence — Prime writes this file during ordinary runs:**
- `core/settings-manager.ts:228` — `globalSettingsPath = join(agentDir, "settings.json")`; `:259-291` — `withLock()` writes a temp file and `renameSync`s it into place with mode `0600`. **A read-only file mode does not prevent this**: rename inside a `0700` directory owned by the user succeeds regardless of the target file's mode.
- **Telemetry notice:** `core/agent-session-services.ts:181-192` → `core/settings-manager.ts:857-859` (`setTelemetryNoticeShown`) → `save()` at `:598-618`.
- **First-run onboarding:** `modes/interactive/interactive-mode.ts:1718` → `core/settings-manager.ts:661-663` (`setOnboardingShown`) → `save()`.
- **Depth change with `--global`:** `core/agent-session.ts:11160-11167` → `core/settings-manager.ts:775-779` → `save()`.
- **Startup migration:** `migrations.ts:33-85`, which rewrites `settings.json` in place at `:60-73`.

**Concrete failure:** The design's telemetry opt-out (l.38) covers exactly one of these four writers. On the first interactive run that shows onboarding, and on any run where the operator uses `--global`, `<runtime-home>/settings.json` diverges from its recorded digest through entirely legitimate Prime behaviour. The very next `./prime attach` recomputes the manifest, finds divergence, and per l.75 marks the run `orphaned` — at which point l.202 forbids retries and the operator must stop or take over. A healthy, mid-workflow run becomes unrecoverable because Prime did what Prime does. The verification bullet at l.289 will reproduce this the first time it is run against a real interactive session, so the design fails its own test.

**Required correction:** Split `settings.json` out of the byte-identical integrity class. Either (a) verify it semantically — assert the specific keys the kit depends on (`rlmMaxDepth`, the declared package, `extensions: []`) rather than a whole-file digest, and record that Prime-owned keys may drift; or (b) keep the digest but enumerate the sanctioned writers (naming the four above with citations) and specify that divergence limited to those keys is tolerated while any change to kit-controlled keys is a governance event. Either way, state explicitly that file permissions do not make it immutable, because Prime writes by rename (`core/settings-manager.ts:278-284`). Update l.60, l.75, and l.289 to match.

### OPUS-D6-M2 — "Governs every new session, including every child session" is false; children resolve `inherited`, which outranks global

**Affected text:** line 222 ("The runtime home's global settings set `rlmMaxDepth: 1`, which governs every new session, **including every child session**"), and consequentially line 223 ("refuses admission unless the value is one and the source is the kit's global settings") and line 290 ("global `rlmMaxDepth: 1` takes effect even if the operator's normal home says 2").

**Evidence:**
- `core/agent-session.ts:1570-1590` — `_resolveRlmMaxDepth()` precedence in order: persisted chat entry → `"chat"`; `this._configuredRlmMaxDepth !== undefined` → `"inherited"`; `settingsManager.getRlmMaxDepth()` → `"global"`; `process.env.RLM_MAX_DEPTH` → `"env"`; else `2` → `"default"`. **Global is third of five.**
- `core/agent-session.ts:9334-9335` — every child is constructed with `rlmDepth: this._rlmDepth + 1, rlmMaxDepth: this._rlmMaxDepth`, the parent's already-resolved ceiling.
- `core/agent-session.ts:1247-1256` — the child stores that value into `_configuredRlmMaxDepth`, so it resolves `"inherited"` and **never consults global settings at all**.
- `core/rlm-max-depth.ts:3` — `RlmMaxDepthSource = "default" | "env" | "global" | "inherited" | "chat"`, confirming `"inherited"` is a distinct returned value the controller will actually see.

**Concrete failure:** Two things break. (1) The stated mechanism is wrong in a way that matters operationally: if the operator raises the root's ceiling, children inherit the raised value regardless of what global settings say, so the template default protects the root session only — which is the precise scenario control #2 exists to catch, described inaccurately. (2) Control #2 as written is unsatisfiable outside the root: a controller running in any non-root session queries `get_rlm_max_depth_status` and receives source `"inherited"`, not `"global"`, so a literal implementation refuses every admission and the workflow deadlocks. Line 204's root contract makes only the coordinator dispatch, so this is latent rather than immediately fatal — but an implementer building to l.222–223 has no way to know that, and the false statement will propagate into the code.

**Required correction:** Rewrite l.222 to state the real precedence (`chat > inherited > global > env > default 2`, citing `core/agent-session.ts:1570-1590`), that children inherit the parent's resolved ceiling (`:9334-9335`, `:1247-1256`) rather than re-reading global, and that the template default therefore governs the root session. Specify that control #2's accepted source set is `{"global"}` **for the root coordinator specifically**, and say what a non-root controller does. Add the guarantee the section currently omits: Prime hard-refuses grandchild spawn at `core/agent-session.ts:10214-10217`, so with a root ceiling of 1 the depth-one property is mechanically enforced in compiled code, and the kit's remaining job is detecting an operator raising the root's ceiling mid-run. Adjust l.226's "honest guarantee" to claim that strength rather than less.

### OPUS-D6-M3 — `bin/` is unclassified and repopulated by network download every run, so "offline-capable" and the network-disabled verification case do not hold

**Affected text:** lines 58–65 (the topology table, which contains no `bin/` row), line 85 ("repeated runs are offline-capable"), line 288 ("Prime loads a distinctive Superpowers skill from it with network access disabled; that a second run performs no package network access").

**Evidence:**
- `config.ts:614-617` — `getBinDir()` returns `join(getAgentDir(), "bin")`, documented as the managed binaries directory for fd and rg.
- `utils/tools-manager.ts:11` — `const TOOLS_DIR = getBinDir();` is evaluated at **module load**, binding to whatever `PRIME_AGENT_CODING_AGENT_DIR` names for that process, i.e. the fresh per-run home.
- `utils/tools-manager.ts:110-130` — `getToolPath()` checks `TOOLS_DIR` first, then system PATH, returning `null` if neither has the tool.
- `utils/tools-manager.ts:36-40, 132-145` — on `null`, unless `PI_OFFLINE` is set, `ensureToolWithStatus` fetches `https://api.github.com/repos/<repo>/releases/latest` and downloads.
- `modes/interactive/interactive-mode.ts:1362-1368` — interactive `init()` unconditionally awaits `ensureTool("fd")` and `ensureToolWithStatus("rg")` before the UI is built, warning via `formatMissingRipgrepMessage` when `rg` comes back unavailable.

**Concrete failure:** Every run composes an empty home, so on any host without system-installed fd and rg, Prime contacts GitHub and downloads two binaries at startup — on every single run, which is a direct cost of choosing per-run homes and is nowhere acknowledged. Line 85's "repeated runs are offline-capable" is therefore false at the run level even though it is true for package resolution. Worse, the verification case at l.288 explicitly runs with network access disabled: on a host lacking system `rg` that run emits a missing-ripgrep warning, and the workflow's mandated `rg`-based reconnaissance (l.208) degrades inside the very test meant to prove offline capability. `bin/` also appears in no row of the topology table, so it belongs to no integrity class and is covered by no manifest.

**Required correction:** Add `bin/` to the topology table. Either classify it as a per-clone shared, integrity-checked entry materialized once by the launcher (the same treatment `git/` receives, which also makes repeat runs genuinely offline-capable), or classify it Prime-owned read-write and state explicitly that the launcher exports `PI_OFFLINE` and preflights system `rg`/`fd` with its own fail-closed diagnostic. Then narrow or strengthen l.85 to say which kinds of network access a warm-cache repeat run avoids, and extend the l.288 network-disabled case to assert that `rg` is available and no warning is emitted.

## Minors

### OPUS-D6-N1 — Retained runtime homes have no cleanup verb, no bound, and outlive the records that name them

**Affected text:** line 75 ("Runtime homes are retained after completion for audit and are removed only by explicit operator cleanup"), against line 130 ("Explicit completion or stop clears the record after child reconciliation") and line 267 (kit-owned commands are exactly `attach`, `status`, `stop`).

**Evidence:** No cleanup command appears anywhere in the document; l.267 enumerates the complete kit-owned surface. Each retained home holds that run's full session transcripts (`config.ts:620-626`), logs (`config.ts:540`), RLM refinement state (`core/refinement/refinement.ts:24,270`), and — absent M3's fix — two downloaded binaries under `bin/`.

**Concrete failure:** `<kit>/.state/runs/` grows without bound in a tree the design otherwise forbids touching, and because the run record is cleared on completion while the home is retained, the operator accumulates directories with no record pointing at them and no supported way to enumerate or remove them.

**Required correction:** Add a kit-owned cleanup verb to l.267 and l.75 (e.g. `./prime clean [--keep N]`), state a retention default, and reconcile l.130 with l.75 by specifying that record clearing leaves a completed-run index entry naming the retained home path.

### OPUS-D6-N2 — The Prime-owned row enumerates four paths where Prime uses more than a dozen

**Affected text:** line 64 (`auth.json`, `sessions/`, `logs/`, `harness/`), read against line 56 ("Every path below is a path Prime actually computes from the agent dir").

**Evidence — additional paths Prime computes from the agent dir:** `bin/` (`config.ts:616`); `themes/` (`config.ts:535`); `cron-jobs.json` (`config.ts:611`); `<APP_NAME>-debug.log` (`config.ts:635`); `daemon-update-restarts/` (`config.ts:568-572`); `daemon-workers/` (`modes/daemon/daemon-supervisor.ts:530`; `cli/daemon-ps.ts:998`); `session-leases/` (`core/session-lease.ts:70,241`); `rlm-ledger/` (`modes/daemon/rlm-ledger.ts:41,196`); `telemetry.json` (`core/telemetry.ts:14,257-284`); `keybindings.json` (`core/keybindings.ts:377`); `git/.gitignore`, written by `ensureGitIgnore` (`core/package-manager.ts:1817-1825`); and `prime-inference-private-models.json`, written alongside `models.json` (`core/model-registry.ts:417,894-899,927-938`).

**Concrete failure:** None immediate — Prime creates these itself with recursive mkdir. But l.56 reads as an exhaustive inventory, an implementer will treat it as one, and the `models.json` sibling in particular means the launcher-owned `models.json` directory receives a Prime-written file, which matters for how M1's integrity check is scoped. The `git/.gitignore` case is subtler: Prime writes it into the directory whose leaf is a symlink into the shared cache, so the launcher should pre-create it rather than let Prime write into a partially launcher-owned tree.

**Required correction:** Either enumerate the Prime-owned set completely with citations, or replace l.56's exhaustive framing with "the paths below are the ones this design constrains; all other Prime-computed paths under the agent dir are Prime-owned and unmanifested", and explicitly name `git/.gitignore` and `prime-inference-private-models.json` as expected additions inside otherwise launcher-owned directories.

### OPUS-D6-N3 — The cache key carries a ref that Prime's install path cannot express

**Affected text:** line 79 (`<kit>/.state/packages/<name>@<ref>/`), line 81, line 83.

**Evidence:** `utils/git.ts:163-170` — `parseGitUrl` returns `host` and `path` (`user/project`) with the ref as a separate field; `core/package-manager.ts:1864-1872` builds `join(agentDir, "git", host, path)` with **no ref component**. Combined with `core/package-manager.ts:1710-1712` (`if (existsSync(targetDir)) return;` — existence only, no ref verification), the leaf is a single slot per repository.

**Concrete failure:** The cache can hold `superpowers@v6.3.0` and `superpowers@v6.4.0` side by side, but the runtime home has exactly one leaf for `github.com/obra/superpowers`. Nothing in the text says the link is repointed when the pinned ref changes, and if a stale link survives, Prime's existence check accepts it silently and the run loads the wrong Superpowers version with a passing preflight.

**Required correction:** State that the launcher recreates the leaf link on every composition from the currently declared ref — never reuses an existing link — and add a verification case that bumps the pinned ref and asserts the loaded skill set comes from the new cache entry.

### OPUS-D6-N4 — Cache materialization does not say whether Prime's post-clone `npm install` is part of the digested tree

**Affected text:** line 83 ("Materialization verifies the resolved git commit against the pinned reference and records the tree digest").

**Evidence:** `core/package-manager.ts:1708-1727` — after clone and checkout, if the package has a `package.json`, `installGit` runs `npm install --omit=dev` **inside the checkout** (`getGitDependencyInstallArgs()` at `:1673-1679`). Superpowers v6.3.0 has a `package.json` (declaring `pi.extensions` and `pi.skills`) and no committed lockfile, so npm would write `package-lock.json` into the tree.

**Concrete failure:** If the launcher clones only and hashes the working directory, its digest describes a tree that differs from what a Prime-materialized entry would contain; if any path later lets Prime touch a cache entry, the recorded digest mismatches and l.83 rejects a healthy cache. The document never states which tree is authoritative.

**Required correction:** State that the launcher materializes by `git clone` plus `git checkout <pinned commit>` and nothing else, that it hashes the git tree object at the pinned commit rather than the working directory, and that generated artifacts such as `package-lock.json` and `node_modules/` are outside the digest — or, alternatively, that the launcher reproduces `npm install --omit=dev` and hashes afterward. Pick one explicitly.

### OPUS-D6-N5 — Resolution records are out of order

**Affected text:** the Round 6 resolution record at lines 347–353 appears before the Round 5 record at lines 355–359.

**Concrete failure:** None functional. A reader scanning the appendix chronologically encounters round 6 between rounds 4 and 5 and may conclude the round-5 record is missing.

**Required correction:** Move the Round 6 block after the Round 5 block.

---

## Notes on what I deliberately did not raise

- I did not re-litigate the Anthropic beta header, thinking maps, Node preflight, argument firewall, toolchain checksums, model policy, or skill-collision handling. I spot-checked that the amendment did not disturb them and it did not.
- I did not raise line 214's account of `/rlm-max-depth` as a builtin resolved ahead of extension commands. It is accurate as far as `modes/interactive/interactive-mode.ts:4731,9138-9162` and the absent depth surface in `core/extensions/types.ts` allow me to verify, and it was settled earlier.
- I did not raise concurrency between two kit clones on one machine, because nothing in the design shares state across clones and `.state/` is clone-local by construction.
- I did not raise the `installGit` existence-only check as its own finding, because l.83's atomic temp-then-rename cache materialization already prevents the partial-entry case; the residual ref concern is N3.
- I could not execute Prime Agent 0.8.1 to observe any of this at runtime; Node here is v20.20.1 against a `>=22.8.0` floor. Every finding is derived from the pinned sources at the commits in the artifact-state table, and every claim carries a `file:line` a later reviewer can check without running anything.
- Process note, restated because it affects gating: the artifact's hash changed during this review. This review is valid only against `419a71c6a4d00b1dd7378fb86e2b576407ab1ecf9120af621f238c0168011504`.
