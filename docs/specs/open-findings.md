# Open findings register

Deferred review findings carried into implementation. The plan gate was deliberately relaxed after design round 6 to avoid livelock: rather than iterating review rounds until zero findings remain, unresolved findings are recorded here with an owning task and the evidence required to close them. A finding is closed only by a merged change plus the named evidence, not by assertion.

**Status vocabulary:** `open` = not yet addressed. `owned` = assigned to a task that has not run. `closed-pending-proof` = change made, evidence not yet produced. `closed` = change made and evidence captured.

---

## Design round 6 — resolved in the design

These were fixed directly in `docs/specs/2026-08-26-prime-superpowers-design.md` (commit `32952c9`) because each was a factual error about Prime 0.8.1's real behavior that would otherwise propagate into every implementation batch. They remain listed because the design change still needs runtime proof.

| ID | Finding | Design resolution | Owning task | Evidence to close | Status |
| --- | --- | --- | --- | --- | --- |
| SOL-D6-B1 | Runtime topology assigned Prime state to paths 0.8.1 does not use (`auth/` vs file `auth.json`, missing `harness/`, fictitious `cache/`, process-global daemon socket breaking per-run isolation) | Path table rewritten to 0.8.1's real layout; per-run daemon socket passed explicitly on start/attach/status/stop; session-dir overrides made protected controls | Launcher composition task | Two concurrent runs hold distinct daemon sockets; `auth.json` created as a file; a template attempting `sessionDir` is refused | closed-pending-proof |
| SOL-D6-B2 | Shared cache linked at `packages/`, but Prime resolves the declared git source under `git/<host>/<path>` — the link would be ignored and Prime would clone | Link relocated to the exact computed leaf `git/github.com/obra/superpowers`, derived from the declared source rather than hardcoded; collision with a project-local package rejected | Package cache task | Prime loads a distinctive Superpowers skill from the leaf with network disabled; second run performs zero package network access | closed-pending-proof |
| SOL-D6-B3 | Controller cannot obtain `{value, source}` — its IPython host bridge registers no depth handler and the kernel env var is numeric-only and documented as possibly stale | Observation moved to Prime's daemon depth-status channel using the per-run socket and parent session identity, with fail-closed handling for disconnect and identity mismatch; guarantee narrowed to per-admission refusal plus bounded polling | Controller admission task | Admission refused when observed source is persisted chat state; admission refused on daemon disconnect; env var provably not consulted | closed-pending-proof |
| SOL-D6-M1 | Integrity lock covered only copied files, missing generated `models.json`, the package symlink, and its target; `0600` mislabeled as read-only | Manifest extended to all immutable inputs including symlink text and canonical target tree digest; ownership, atomic rename, and symlink-component rules added; column renamed to integrity-checked with the same-UID limitation stated | Launcher composition task | Mutating `models.json` or repointing the link fails the manifest check on attach | closed-pending-proof |
| SOL-D6-N1 | "Exactly four origins" contradicted the in-home `resources.lock.json` | Added as an explicit launcher-generated manifest row | Launcher composition task | Table and composition test agree on the allowed set | closed-pending-proof |

---

## Design round 6 — review coverage gap

| ID | Finding | Status |
| --- | --- | --- |
| COV-D6-1 | **CLOSED.** The Opus seat's *first* round-6 artifact examined the pre-amendment 297-line design (md5 `5156f716d59870854cab72621e862edb`), so its "0 Blockers" verdict validated only the round-5 closures. The seat subsequently delivered a genuine review of the amended 359-line artifact (sha256 `419a71c6…`), preserving the stale copy as `design-opus-round-6-prior-artifact-297L.md`. The runtime-home, package-cache, and depth sections now have two-seat coverage. Findings recorded in the round-6 section below. | closed |
| OPUS-D6-N1..N9 | Nine minors from the stale pre-amendment pass (documentary/annotation quality: unnamed compat flag, npm floor and `engine-strict` caveat, doctor host-runtime fault category, thinking-map annotations). Recorded in `docs/reviews/design-opus-round-6.md`. They target sections the amendment did not change, so they remain applicable. | open — non-blocking, sweep before ship |

---

## Plan round 3 — deferred to implementation

Findings from `docs/reviews/plan-{sol,opus}-round-3.md` that are **not** execution-blocking. Each is deferred because it depends on empirical observation of the real binary, which is impossible in the build sandbox (Node 20 there, below the 22.8.0 floor) and is exactly what the runtime-proof tasks exist to produce.

| ID | Finding | Owning task | Evidence to close | Status |
| --- | --- | --- | --- | --- |
| SOL-P3-M4 | Native-wire transcript frame contract unspecified | Runtime proof — wire capture | Recorded frames from the mock server define the contract; assertions written against captured shape | owned |
| SOL-P3-M5 | RLM transcript frame contract unspecified | Runtime proof — RLM lifecycle | Observed child lifecycle frames define the contract | owned |
| SOL-P3-M6 | Task 0 baseline tree-hash formalities underspecified | Task 0 | Baseline hash recorded and re-verified at completion | owned |
| OPUS-P3-M2 | `resources.lock.json` representation for package-provided skills | Launcher composition task | Manifest schema covers package-provided resources; superseded in part by SOL-D6-M1 | owned |
| OPUS-P3-M3 | Per-run re-clone concern | Package cache task | Superseded by the shared cache design; closed by the SOL-D6-B2 offline proof | owned |
| SOL-P3-N1 | Open-ended fixture directories | Any task creating fixtures | Fixture roots enumerated | open |
| OPUS-P3-N1..N6 | Six minors, documentary | Ship sweep | — | open |

### Resolved in the single-pass plan repair

These were execution-blocking and are fixed in the plan rather than deferred: Task 8's `Files` manifest omitting the entry points it must modify; Task 15's oracle depending on a `model list --json` command that does not exist; `E_PACKAGE_UNRESOLVED` having no emitter on the direct path; unspecified cross-batch interfaces; and non-disjoint `Files` sets across the three parallel batches.

Depth-interception findings SOL-P3-B1 and OPUS-P3-B1 are superseded by the design's narrowed depth guarantee and the daemon observation channel.

---

## Standing rules that no finding may relax

- No implementation commit on `main` or `master`; Task 0 creates the `prime/kit-build-<run-id>` worktree.
- No task modifies paths outside its declared `Files` list.
- Every task carries reachable red and green oracles.
- Reviews are model-diverse; a single seat is never sufficient sign-off.

## Opus design round 6 (real review, 359-line artifact)

The earlier `COV-D6-1` coverage gap is **closed**. The Opus seat delivered a
genuine review of the amended 359-line artifact (sha256 `419a71c6…`), preserving
its stale predecessor as `design-opus-round-6-prior-artifact-297L.md`. The
amended runtime-home, package-cache, and depth sections now have two-seat
coverage.

| ID | Severity | Status | Owner | Closing evidence |
|---|---|---|---|---|
| OPUS-D6-B1 | Blocker | fixed in design + plan | Task 8, Task 14 | Socket path and session identity absent from kernel env, controller env/args, and every model-reachable child env; controller obtains verdict-only `{ok, code?}`; `set_rlm_max_depth` unreachable from controller |
| OPUS-D6-M1 | Major | fixed in design + plan | Task 8 | Prime-initiated `settings.json` rewrite preserving predicates leaves run healthy and does not orphan it |
| OPUS-D6-M2 | Major | fixed in design + plan | Task 8 | Admission accepted for source `inherited`, refused for `chat`/`env` |
| OPUS-D6-M3 | Major | fixed in design + plan | Task 8 | `bin/` resolves to shared cache; second run performs no tool download |
| OPUS-D6-N1..N5 | Minor | open | final review | Adjudicate at final tri-model review |

### OPUS-D6-B1 was a regression this project introduced

Recorded plainly because the register exists to prevent repeats. Round 6's own
depth fix created the vulnerability. Moving depth observation onto the daemon
channel was correct — it is the only surface exposing `{value, source}` — but the
fix handed the socket path and active session id to the *model-invoked
controller*. The same socket accepts `set_rlm_max_depth`, whose `global` form
persists to `settings.json`, gated only by the session id.

Before the fix the model had no depth-write primitive at all. After it, the
component whose privileges the depth guarantee is designed to bound could raise
its own limit. The lesson generalizes beyond depth: **granting a read capability
by handing over a channel grants every write the channel accepts.** The
correction keeps the daemon client on the launcher's side of the trust boundary
and passes a verdict rather than a channel.

The same review also found the design *under-claimed* its guarantee: Prime
hard-refuses grandchild spawn in-process at `agent-session.ts:10214-10217`. That
guard is now credited as the primary enforcement, with the kit's controls
positioned as configuration keeping and auditability. Task 15 must verify the
guard directly with the kit's gate stubbed open, so the two enforcement layers
are proven independent.

### Stale-mock hazard found while applying B1

Task 10 required an extension `input` handler to intercept `/rlm-max-depth`.
That is impossible against the real binary for the reason already documented in
the design, so the requirement was removed. It would have produced a green test
against a mock and a false guarantee in production. Any remaining requirement
whose oracle is satisfiable only by a mock should be treated the same way at
implementation time.
