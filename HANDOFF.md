# Prime Superpowers Local Continuation Handoff

## Intended Product

The finished repository should install one CLI command that can be run from any
Git repository:

```bash
prime run "Implement the frozen spec at docs/specs/feature.md"
```

The command should create an isolated target worktree, start Sol as the
coordinator, register OpenAI Responses, Anthropic Messages, and Google
Generative AI models through one `PRIME_BASE_URL` and one `PRIME_LLM_KEY`, load
the target repository's instructions and skills, and execute a model-routed
Superpowers SDD/TDD workflow.

Prime RL weight training is not part of this repository. The “policy” is the
orchestration policy used by Prime Agent's RLM subagents.

## Repository State

The accepted design is:

```text
docs/specs/2026-08-26-prime-superpowers-design.md
```

The current implementation plan is:

```text
docs/specs/2026-08-26-prime-superpowers-implementation-plan.md
```

The design reached zero Blocker and zero Major findings in the Sol and Opus
round-six reviews. The implementation plan has not reached that gate and no
product implementation has started.

All review artifacts are under `docs/reviews/`. Source analysis and exact
upstream revisions are under `docs/research/`.

## Current Plan Gate

**The plan gate is closed. Phase 0 (design amendment) and Phase 1 (plan repair)
are complete and pushed. Start at Task 0.**

The zero-Blocker/zero-Major gate was deliberately relaxed to avoid livelock in
review iteration. Instead of iterating review rounds, the design and plan
received one bounded repair pass covering execution-blocking defects only, and
every remaining finding was moved to a register with an owning task and the
evidence required to close it:

```text
docs/specs/open-findings.md
```

Read that register before starting, and again before the final review.

### What was fixed in this pass

Design (`32952c9`), from Sol design round 6 — three Blockers and one Major, all
factual errors about Prime 0.8.1's real behavior:

- Runtime topology now uses Prime's actual agent-dir layout: file `auth.json`
  (not a directory), `harness/`, no fictitious `cache/`. A per-run daemon socket
  is passed explicitly on every start/attach/status/stop, because Prime's
  default socket is process-global and would let two runs share one daemon.
  Session-dir overrides became protected controls.
- The package cache links at Prime's real computed leaf,
  `git/github.com/obra/superpowers`. The previous `packages/` location would
  have been silently ignored and Prime would have cloned over the network.
- Depth observation moved off the kernel's stale numeric `RLM_MAX_DEPTH` onto
  Prime's daemon depth-status channel, which is the only surface exposing
  `{value, source}`. The guarantee is now narrowed and honest: fail-closed
  refusal at each sanctioned admission plus bounded-poll detection, not
  instantaneous prevention.
- The integrity manifest now covers generated `models.json` and the package
  link's canonical target, not just copied files.

Plan (`9e94b76`), execution blockers only:

- Task 8's `Files` list now includes `prime` and `lib/launcher-process.mjs`,
  which its green behavior always required it to modify.
- Task 15's oracle no longer uses `model list --json`, which does not exist.
  Prime prints a chalk-colored human-readable table; the oracle now runs
  `model list` with `NO_COLOR=1` and parses columns.
- Task 8 is named the sole emitter of `E_PACKAGE_UNRESOLVED`, before spawn.
- `tests/test-package.sh` became a fixed driver created once in Task 1, sourcing
  per-task `tests/package-manifest.d/<NN>-<name>.sh` fragments. It was previously
  appended to by all 18 tasks, which made parallel batches impossible.
- Cross-batch interfaces are frozen in the plan: `lib/config.mjs` exports, the
  runtime home layout, the controller CLI contract and its error codes, and the
  ledger record shape.

### Review coverage gap to carry forward

The Opus seat's round-6 design review examined the **pre-amendment 297-line**
design, not the amended artifact. Its zero-Blocker verdict validates the round-5
closures only and is **not** approval of the runtime-home, package-cache, or
depth sections, which currently have single-seat (Sol) coverage. The final
tri-model review must explicitly cover those three sections and verify the
artifact hash it is reviewing.

### Phase 2 execution model

Tasks 0 and 1 sequentially, then three parallel batches with **no per-task
review gate**, then Tasks 15-18 sequentially, then one tri-model review of the
whole implementation that also adjudicates the register.

| Batch | Tasks | Owns |
|---|---|---|
| A | 4, 5, 6, 7, 8 | launcher chain, entry points |
| B | 2, 11, 12, 13, 14 | config and workflow core |
| C | 3, 9, 10 | `agent-home/`, skills |

Batch file sets were verified disjoint (no duplicate paths, no prefix overlaps).
Tasks 15-17 must stay serial: they run the real binary, bind ports, and write
shared artifact directories.

**This sandbox could not run Phase 2's runtime proofs.** Local Node is 20.x,
below Prime's hard `>=22.8.0` floor, so Tasks 15-17 were never executable here.
Verify `node --version` locally before Task 0.

## Required Working Method

Follow the repository's stated SDD discipline:

1. Revise the design first if a blocker requires an architecture change.
2. Obtain a fresh independent design review until Blocker and Major counts are
   both zero.
3. Revise the implementation plan incrementally.
4. Obtain fresh Sol, Opus, and Gemini plan reviews until all required seats
   report zero Blockers and zero Majors.
5. Create the isolated implementation worktree and ledger.
6. Implement one TDD task at a time through a worker, review that task's
   immutable commit range, resolve findings, re-review, then proceed.
7. Run the real packaged binary, native-wire probes, and RLM lifecycle proof.
8. Finish with a whole-branch model-diverse review and simplicity/value verdict.

The coordinator must not edit product code during implementation.

## Local Bootstrap

```bash
git clone https://github.com/netbrah/prime-superpowers.git
cd prime-superpowers
```

Clone the pinned reference repositories beside it using
`docs/research/source-provenance.md`. Node and npm runtime floors remain design
inputs until the plan is repaired; do not infer them from the host machine.

Useful first commands:

```bash
git status --short --branch
sha256sum docs/specs/2026-08-26-prime-superpowers-design.md
sha256sum docs/specs/2026-08-26-prime-superpowers-implementation-plan.md
sed -n '1,240p' docs/reviews/plan-sol-round-3.md
sed -n '1,280p' docs/reviews/plan-opus-round-3.md
```

## Material Deliberately Not Preserved

- Sandbox memory, session transcripts, and project metadata
- User uploads unrelated to the executable kit
- Environment files, credentials, and package caches
- Full third-party repository copies
- Downloaded release tarballs
- Generated build products and runtime state

No custom launcher, extension, test, or workflow-controller implementation
exists yet. The absence is intentional because the plan gate remains closed.
