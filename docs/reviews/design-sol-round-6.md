# Design review — Sol, round 6

**Reviewer seat:** Sol. **Posture:** fresh, independent, hostile, source-first. I modified nothing in the design, plan, Prime Agent source, Superpowers source, or any product file; this review is the only file I wrote.

## Artifact state

| Item | Verified state |
|---|---|
| Artifact | `docs/specs/2026-08-26-prime-superpowers-design.md` |
| Lines | 340 |
| SHA-256 | `f4eb3590729c70fbfff5a8e58b8d2619286d94abde21197b03dd006de04c21ca` |
| Prime Agent reference | `bc0fa7606abb3b7af0f765319518d255e6ae553d` (0.8.1) |
| Superpowers reference | `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0) |
| Runtime limitation | The available Node is v20.x, below the design's Node `>=22.8.0` floor (`docs/specs/2026-08-26-prime-superpowers-design.md:112`). I did not claim a binary execution result; all Prime behavior below is derived from pinned source reading. |

## Counts

**3 Blockers, 1 Major, 1 Minor.**

The zero-Blocker/zero-Major gate is **not met**. Verdict: **changes required**.

## What this round confirms as genuinely fixed

- The template/runtime split is directionally real for Prime's actual agent-dir consumers. `PRIME_AGENT_CODING_AGENT_DIR` is the environment override used by `getAgentDir()` (`packages/coding-agent/src/config.ts:501-530`); settings use `<agentDir>/settings.json` (`packages/coding-agent/src/core/settings-manager.ts:223-230`), services bind auth and models to `<agentDir>/auth.json` and `<agentDir>/models.json` (`packages/coding-agent/src/core/agent-session-services.ts:140-148`), and the resource loader passes that same agent dir to the package/resource machinery (`packages/coding-agent/src/core/resource-loader.ts:213-225`). A per-run agent dir can therefore isolate the committed settings, models, extensions, skills, ordinary logs, and ordinary sessions—subject to the exceptions in SOL-D6-B1.
- The revised explanation that an extension cannot intercept `/rlm-max-depth` is accurate. Interactive mode consumes that builtin directly (`packages/coding-agent/src/modes/interactive/interactive-mode.ts:4731-4734`), while the mutation calls the active connection's setter (`packages/coding-agent/src/modes/interactive/interactive-mode.ts:9134-9178`). Prime persists the chat value and immediately changes the in-memory source to `chat` (`packages/coding-agent/src/core/agent-session.ts:11147-11176`). The old extension-interception promise is gone.
- The depth precedence itself is now stated against real behavior: persisted chat, inherited configuration, global settings, environment, then default (`packages/coding-agent/src/core/agent-session.ts:1555-1589`). Prime also has a typed `{maxDepth, source}` status object (`packages/coding-agent/src/core/rlm-max-depth.ts:1-12`) and an active-session daemon command that returns it (`packages/coding-agent/src/modes/daemon/daemon-protocol.ts:632-640`; `packages/coding-agent/src/modes/daemon/daemon-mode.ts:4905-4908`). The remaining defect is reachability from the actual controller, not absence of the state in Prime; see SOL-D6-B3.
- Prime does honor an already-present Git package install path: it tests the computed path with `existsSync`, skips installation when it exists, and collects resources from it (`packages/coding-agent/src/core/package-manager.ts:1193-1249`). Resource discovery follows directory symlinks when it enumerates package contents (`packages/coding-agent/src/core/package-manager.ts:568-609`). Therefore a launcher-owned, digest-checked shared tree can work without Prime cloning it—but only when exposed at Prime's real install path, not at the path specified this round; see SOL-D6-B2.
- The template-symlink rule and a launcher-created runtime symlink are not inherently contradictory. The text rejects symlinks *from the template* but separately declares a launcher-created cache link (`docs/specs/2026-08-26-prime-superpowers-design.md:62-65`). The defect is the link's destination path and integrity coverage, not that distinction.

## Blockers

### SOL-D6-B1 — The runtime topology assigns Prime state to paths Prime 0.8.1 does not use

**Affected text:** `docs/specs/2026-08-26-prime-superpowers-design.md:30`, `:56-65`, `:114`, `:272-273`.

**Evidence:** The agent-dir override is real, but its concrete layout is not the table's layout. Prime reads/writes credentials at the file `<agentDir>/auth.json`, not under `auth/` (`packages/coding-agent/src/config.ts:604-607`; `packages/coding-agent/src/core/agent-session-services.ts:140-148`). Sessions default to `<agentDir>/sessions` but can be redirected by `PRIME_AGENT_SESSION_DIR`, its legacy equivalent, or startup settings (`packages/coding-agent/src/config.ts:619-630`; `packages/coding-agent/src/main.ts:1174-1178`). Logs are under `<agentDir>/logs` (`packages/coding-agent/src/config.ts:538-565`). Prime's global RLM state uses `<agentDir>/harness`, a mutable path omitted from the table (`packages/coding-agent/src/core/refinement/refinement.ts:24,269-278`). Most importantly, the default daemon socket is `/tmp/prime-agent-<uid>/daemon.sock` on POSIX (or a fixed named pipe on Windows), independent of the agent dir (`packages/coding-agent/src/modes/daemon/daemon-socket.ts:38-43,216-219`); main uses that default unless an explicit daemon socket argument is supplied (`packages/coding-agent/src/main.ts:1174-1182`). Prime has no generic `<agentDir>/cache` root in this topology, and its temporary package cache is instead under `tmpdir()/pi-extensions` (`packages/coding-agent/src/core/package-manager.ts:1884-1889`).

**Concrete failure:** Shipping this table creates unused `auth/`, `cache/`, and `daemon/` directories while Prime places live state elsewhere. The daemon can be shared through the process-global `/tmp` socket, breaking per-run isolation and making the recorded runtime-home path insufficient for exact `attach/status/stop`. The design's assertion that daemon sockets and caches exist only under `<kit>/.state/` is false, and the two verification bullets cannot pass as written.

**Required correction:** Replace the table with Prime's exact 0.8.1 names: `auth.json`, `sessions/`, `logs/`, `harness/`, `git/…`, plus every other launcher-permitted mutable path. Have the launcher pass its own internal `--daemon-socket <run>/agent-home/daemon/daemon.sock` (or an explicitly documented sibling path under the run) on every start/attach/status/stop path, and record that socket path. Prohibit or preflight `PRIME_AGENT_SESSION_DIR`, the legacy session-dir variable, and `sessionDir` settings so sessions cannot escape. Remove the fictitious generic `cache/` entry or identify the exact Prime consumer that uses it. Add platform-specific named-pipe treatment for Windows rather than claiming a filesystem directory there.

### SOL-D6-B2 — The shared cache is linked at `packages/`, but Prime resolves the declared Git package under `git/<host>/<path>`

**Affected text:** `docs/specs/2026-08-26-prime-superpowers-design.md:62`, `:69-73`, `:114`, `:272`.

**Evidence:** For a user/global Git source, Prime computes the install path as `<agentDir>/git/<host>/<repository path>` and the root as `<agentDir>/git` (`packages/coding-agent/src/core/package-manager.ts:1864-1882`). Resolution checks that exact computed path; only if it exists does Prime skip installation and collect its resources (`packages/coding-agent/src/core/package-manager.ts:1239-1249`). If absent, Prime's installer creates parent directories, clones the repository, checks out the ref, and may run dependency installation (`packages/coding-agent/src/core/package-manager.ts:1708-1726`). No resolver branch consults `<agentDir>/packages/`. The design's declared source `git:github.com/obra/superpowers@v6.3.0` therefore resolves beneath `<agentDir>/git/github.com/obra/superpowers`, not beneath `packages/`.

**Concrete failure:** The launcher's `<runtime-home>/packages` symlink is ignored. Prime sees its real Git install path as missing and either performs its own network clone into the per-run home or, if network/package mutation is prevented, silently continues without the Superpowers resources. Repeat runs are not offline-capable by this mechanism, “materialized once per kit clone” is false, and `E_PACKAGE_UNRESOLVED` preflight validates a tree Prime never consumes.

**Required correction:** Expose the verified shared entry at Prime's exact computed leaf, e.g. `<runtime-home>/git/github.com/obra/superpowers -> <kit>/.state/packages/<name>@<ref>`, with parent directories created by the launcher. Preflight the exact source-to-install-path mapping derived from Prime's parser, reject project-local package collisions, and test that Prime resolves a distinctive Superpowers skill from that leaf with network disabled. Keep the launcher-owned digest/index and `E_PACKAGE_UNRESOLVED` behavior, but apply them to the path Prime actually opens.

### SOL-D6-B3 — The controller cannot obtain `{value, source}` through its actual IPython bridge, so the admission control is not implementable as specified

**Affected text:** `docs/specs/2026-08-26-prime-superpowers-design.md:200`, `:204-210`, `:273`, `:277`, `:334`.

**Evidence:** Prime's in-session TypeScript object can report `{maxDepth, source}` (`packages/coding-agent/src/core/agent-session.ts:11143-11145`), and its daemon protocol exposes `get_rlm_max_depth_status` when a caller has the daemon socket and `activeSessionId` (`packages/coding-agent/src/modes/daemon/daemon-protocol.ts:632-640`; `packages/coding-agent/src/modes/daemon/daemon-mode.ts:4905-4908`). But the IPython host bridge—the surface from which the kit controller is invoked—registers only `rlm.run`, `rlm.find_models`, `rlm.list_subagents`, `rlm.delete_subagent`, `model.info`, and conditional goal/compact/refine handlers; there is no max-depth status handler (`packages/coding-agent/src/core/agent-session.ts:9061-9088`). The Python `rlm` API correspondingly exposes run/find/list/delete but no depth status operation (`prime-agent-runtime/src/rlm/__init__.py:92-181`). The kernel environment exports only numeric `RLM_MAX_DEPTH`; its own comment says that value may be stale, and it exports no source (`packages/coding-agent/src/core/agent-session.ts:9198-9215`). It also exports no daemon socket or parent `activeSessionId` in that environment block. Thus the controller cannot distinguish `global` from `chat` through its sanctioned invocation surface.

The “detected on mutation” and “stops the current task” statements are independently stronger than Prime's events permit. A slash command mutates the session immediately (`packages/coding-agent/src/modes/interactive/interactive-mode.ts:9134-9178`), while the design only describes a read immediately before a future admission; no extension event or kernel host event is emitted for the mutation in the cited implementation. At best, an external poller could detect it later.

**Concrete failure:** The controller must either trust a stale numeric environment variable, which accepts a chat override indistinguishably from the global setting, or call an unsupported host request. The required source check, ledger evidence, persisted-chat refusal test, and claimed halt-on-mutation cannot be implemented from the process the design assigns to enforcement. If the operator changes depth between checks, Prime's authoritative spawn guard uses the changed live value, not the controller's earlier observation (`packages/coding-agent/src/core/agent-session.ts:10190-10216`).

**Required correction:** Specify and implement one real, race-aware observation channel. The least invasive option for the pinned binary is a launcher/controller daemon client: pass the per-run daemon socket and exact parent `activeSessionId` to the controller, perform the daemon protocol handshake, call `get_rlm_max_depth_status` immediately around every admission, and define fail-closed behavior for disconnects, session replacement, or identity mismatch. Because Prime provides no atomic “check source and spawn” operation, narrow the guarantee to “refuses the next sanctioned admission after observation” unless the design adds continuous polling plus a post-spawn reconciliation/cancellation protocol. Remove “detected on mutation” and “stops the current task” unless an actual event/polling mechanism makes those statements true.

## Majors

### SOL-D6-M1 — The lock and permission contract does not cover all executable or routing inputs

**Affected text:** `docs/specs/2026-08-26-prime-superpowers-design.md:60-67`, `:71-73`, `:114`, `:272`.

**Evidence:** The design records per-file digests only for “every copied path” (`docs/specs/2026-08-26-prime-superpowers-design.md:65`), but `models.json` is generated, the package entry is a symlink, and mutable Prime-created paths are outside that copied set (`:61-63`). Prime loads models directly from `<agentDir>/models.json` (`packages/coding-agent/src/core/agent-session-services.ts:145-148`) and executes package-discovered extension/resource paths from the resolved package root (`packages/coding-agent/src/core/package-manager.ts:1239-1249,1937-1963`). Mode `0600` is owner-readable **and owner-writable**, so it does not make copied files “read-only after composition.” The shared cache paragraph specifies a digest but no owner-only mode, ownership check, atomic materialization/rename, symlink-component rejection, or revalidation rule for attach. Line 67 promises a “digest-divergent runtime home” will become orphaned, yet the defined lock cannot detect replacement of generated `models.json`, replacement of the package symlink, mutation of its target after preflight, or addition of a new executable resource path.

**Concrete failure:** A changed generated model profile can alter provider routing without tripping `resources.lock.json`; a changed cache symlink/target can change the skills or extension code Prime loads; and attach can reuse those changes while claiming the exact audited runtime home. The verification bullet can pass its copied-file checks while load-bearing runtime inputs have diverged.

**Required correction:** Define one complete manifest over every immutable runtime input: copied files, generated `models.json`, declared symlink text plus canonical target identity, and the full verified package-tree digest. Require owner-only permissions and current-user ownership for `.state`, run directories, cache indexes, cache entries, manifests, and all parent components; use temp-directory materialization plus atomic rename; reject unexpected symlinks in all non-declared components. Recompute and compare the complete manifest before initial spawn and every attach/status/stop action that trusts the runtime. If “read-only” means an OS property, enforce it; otherwise rename the column to “launcher-owned, integrity-checked” and state the same-UID threat limitation.

## Minors

### SOL-D6-N1 — “Exactly four origins” omits the manifest the launcher itself creates inside the runtime home

**Affected text:** `docs/specs/2026-08-26-prime-superpowers-design.md:56-65`.

**Evidence:** The table claims the runtime home is composed from “exactly four origins and nothing else” (`docs/specs/2026-08-26-prime-superpowers-design.md:56`), but the following paragraph creates `<run>/agent-home/resources.lock.json` (`:65`). That file is neither a template copy, generated `models.json`, the package symlink, nor a Prime-owned empty directory.

**Concrete failure:** An implementer cannot satisfy both the closed origin list and the required in-home lockfile, and tests derived literally from the table will disagree about whether the manifest is allowed.

**Required correction:** Add `resources.lock.json` as a launcher-generated, immutable manifest row (and include its mode/ownership), or store it outside `agent-home` under the run record and update all references consistently.
