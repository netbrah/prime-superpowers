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

## Environment blocker CLOSED — real binary is reachable

Earlier rounds deferred every runtime proof (Tasks 15-17) on the belief that the
pinned binary could not run in a sandbox. Both halves of that belief were wrong,
and the correction is recorded here because it invalidates a deferral that had
been treated as structural.

1. **Node floor.** Assumed unfixable. Node 22.20.0 plus npm 10.8.2 are now
   installed at `/home/user/workspace/.tools/node22/bin`, satisfying the
   `>=22.8.0` floor.
2. **Artifact reachability.** I concluded the release was unreachable from an npm
   registry 404 for `@earendil-works/pi-coding-agent@0.8.1`. That was the wrong
   lookup: the package is published as GitHub release assets under the name
   `prime-agent`, and the `@earendil-works/pi-*` names are internal deps. The
   404 was real but meaningless.

Verified end to end: four published SHA-256 values match recomputed bytes,
install succeeds, and `--version` prints exactly `0.8.1`. `model list` with an
isolated `PRIME_AGENT_CODING_AGENT_DIR` and `NO_COLOR=1` runs clean and, with no
generated profile, prints `No models available` — so Task 15 must assert against
a home where the kit has generated `models.json`, not an empty one.

**Consequence:** Tasks 15-17 are no longer deferred and must produce real runtime
evidence in this environment. Any finding in this register whose closing evidence
was deferred "pending local execution" is now due here. The lesson worth keeping:
a single negative probe was allowed to establish a structural limit for several
rounds, and it was never cross-checked against the project's own upstream.

## Batch 1 execution findings (Tasks 2, 3, 9, 10)

| ID | Finding | Status | Owner |
|---|---|---|---|
| EXEC-B1-1 | Task 9 owns provenance hashes for vendored Superpowers files, but Task 10 rewrites some of those same files. Batch 1 treated the Task 9 hashes as baselines rather than final. The ownership split needs an explicit rule: either Task 10 re-records provenance after rewriting, or Task 9's manifest excludes Task 10's rewrite targets. | open | final review |
| EXEC-B1-2 | Task 10 both consumes `resources.lock.json` and depends on it being runtime-generated by Task 8, which had not run. Batch 1 proved every listed resource exists while leaving the template lockfile absent. Task 8 now generates it, so Task 10's consumption path is still unproven end to end. | open — verify in Task 15 | Task 15 |
| EXEC-B1-3 | An invalid package/gate invocation printed manifest-function errors while still returning exit zero. The worker discarded and corrected it, but a wrapper that errors and exits zero is a fail-open hazard in the acceptance harness itself. | open | Task 15 |

### Process defect: build branch drifted from spec branch

Tasks 0, 1 and Batch 1 executed against a **stale copy of the plan**. The build
branch was cut from `9463b6a`, and three later spec commits — verified release
provenance, the serial-batch amendment, and the continuous-push amendment — were
committed to `main` only. So the worktree plan still forbade pushing and still
described parallel batches with contract-only stubs while workers were doing the
opposite.

No damage resulted, because each worker's dispatch brief carried the corrected
instructions, and Batch 1 independently reported the missing heading rather than
silently proceeding. That report is the only reason this was caught.

Corrected by cherry-picking the three commits onto the build branch. **Standing
rule going forward: spec amendments during implementation land on the build
branch, not on `main`, and `main` is reconciled when the branch integrates.**
Amending specs on two branches at once is what created the drift.

## Batch 2 execution findings (Tasks 4-8)

### EXEC-B2-1 (Major, verified against Prime 0.8.1 source) — env stripping is defense-in-depth, not the depth guarantee

Task 8's worker reported that its tests prove the socket path and session id are
absent from model-reachable environments, but do not prove unreachability from a
hostile same-UID process. Verified directly in Prime 0.8.1 source, and the
situation is stronger than "limitation" implies:

- The daemon performs **no client authentication**. No `SO_PEERCRED`, no
  `getpeereid`, no token. Searched `packages/coding-agent/src` — nothing.
- `set_rlm_max_depth` sits in the same accepted-command list as
  `get_rlm_max_depth_status` (`daemon-supervisor.ts:255`,
  `daemon-protocol.ts:637`), so any client that can open the socket can lower
  or raise depth, and the `global` form persists to `settings.json`.
- The agent ships a **`bash` tool** (`core/tools/bash.ts`). A model therefore
  has shell under the same UID as the launcher.

Consequence: a model that goes looking can locate the socket on the filesystem
and speak the protocol regardless of what the kit removes from its environment.
Environment stripping raises cost and blocks accidental inheritance; it is not
a boundary against a deliberate agent.

**This does not sink the design, because depth was never guaranteed by env
stripping.** Prime hard-refuses grandchild spawn in-process at
`agent-session.ts:10214-10217`, which round 6 already credited as PRIMARY
enforcement. The honest claim is layered:

1. **Primary:** Prime's in-process refusal. Not reachable over the daemon socket.
2. **Secondary:** the launcher's semantic `settings.json` predicates, which
   detect a tampered `rlmMaxDepth` at verdict time.
3. **Tertiary:** environment stripping, which prevents accidental leakage.

**Required before release: the design must stop implying the trust boundary is
env stripping.** Task 15 must verify claim 1 independently with the kit's gate
stubbed open, and should add a negative proof that a same-UID client CAN reach
the socket, so the documented boundary matches reality rather than aspiration.

### Other Batch 2 findings

| ID | Finding | Status |
|---|---|---|
| EXEC-B2-2 | Task 8's original text still says to use fixture templates and stub config, contradicting the serial amendment. Worker correctly followed the amendment. Plan text should be reconciled. | open |
| EXEC-B2-3 | Prime 0.8.1 has no `--color` flag; wrapper translates to `NO_COLOR`/`FORCE_COLOR`. Design should record this. | open |
| EXEC-B2-4 | `status --daemon-socket PATH` is unsupported ("Unknown option for status"). Supported per-socket form is `list --daemon-socket PATH --json`. Wrapper status goes through the launcher-owned client instead. | open |
| EXEC-B2-5 | Task 4's inherited test still expects `E_NOT_COMPOSED` though Task 8 supersedes that stub. Task 8 could not edit Task 4's test under the file contract. Reconcile at Task 18. | open |

## Coordinator error: PROC-1 — `git add -A` swept an unreviewed implementation into a plan commit

Commit `79f7cdc`, whose message reads `plan: add Task 8a launcher ledger init,
freeze admission binding`, actually contains **708 lines of unreviewed Task 14
implementation** in addition to the 41-line plan amendment:

```
docs/specs/...implementation-plan.md          |  41 ++
lib/workflow-controller.mjs                   | 447 +++
scripts/workflow-controller                   |  13 +
tests/fixtures/workflow-controller/README.txt |   2 +
tests/package-manifest.d/14-workflow-controller.sh |   5 +
tests/workflow-controller.test.mjs            | 241 +++
```

Cause: the coordinator ran `git add -A` while a prior worker's deliberately
uncommitted Task 14 candidate sat untracked in the worktree. The worker had
refused to commit that candidate precisely because it was known-red.

Three consequences, all real:

1. **The commit message is false.** It advertises a plan amendment and delivers
   an implementation.
2. **`79f7cdc` is a known-red commit on the branch.** The Task 14 integration
   test failed there. This violates the execution contract's own rule that
   "each commit's recorded state is truthful", and it is why the isolated
   Task 8a commit `b9d78b1` does not independently pass the full gate.
3. **A worker's correct refusal was silently overridden.** The strongest
   safety behavior observed in this build — stopping rather than shipping a
   fixture-only green — was undone by coordinator carelessness, not by any
   decision to accept the candidate.

History is NOT being rewritten: `79f7cdc` is an ancestor of the pushed, green
`b9d78b1` and `ac26c42`, and rewriting would invalidate two legitimately
reviewed commits to cosmetically repair one. The branch is green at `ac26c42`
(132 tests, 79 ownership assertions, 18 suites).

**Standing rule going forward: the coordinator commits with explicit paths
(`git add <path>`), never `git add -A`, while any worker's uncommitted state may
be present.** Bisecting this branch across `79f7cdc` will hit a red commit;
the final review should be told so it is not read as a regression.
