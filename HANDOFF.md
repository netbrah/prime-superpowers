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

The authoritative latest hostile reviews are:

```text
docs/reviews/plan-sol-round-3.md
docs/reviews/plan-opus-round-3.md
```

Gemini round three approved the plan, but Sol reported four Blockers and six
Majors, and Opus reported three Blockers and three Majors. Do not start Task 0
until a revised plan receives fresh zero-Blocker/zero-Major reviews.

### Blockers to resolve

- The proposed extension `input` hook cannot intercept the built-in
  `/rlm-max-depth` TUI command. Persisted session depth has higher precedence
  than global settings, so depth-one enforcement needs a feasible mechanism or
  a consciously reduced guarantee.
- Task 8 modifies the `prime` and `prime.cmd` entry points without listing them
  in its exact file manifest.
- Prime Agent 0.8.1 does not provide the frozen `model list --json` contract,
  and that command cannot expose skill collisions, extension filtering, cwd,
  or prompt composition.
- A direct Prime command cannot emit the kit-owned `E_PACKAGE_UNRESOLVED`
  failure because Prime silently skips an unavailable package. The kit launcher
  must own and exercise this check.

### Major issues to resolve

- Freeze exact exported interfaces for the workflow controller and its state,
  ledger, and policy-history dependencies.
- Reconcile cross-task ownership where later tasks modify skill files asserted
  by earlier frozen tests.
- Define how `resources.lock.json` represents package-provided skills.
- Record the per-run agent-home architecture change explicitly in the design,
  or choose a different immutable runtime topology.
- Prevent each per-run agent-home copy from re-cloning Superpowers. Use a
  verified shared package cache or another pinned, offline-capable materialized
  source.
- Replace the static runtime oracle with observable system-prompt/resource
  output produced through a real model turn.
- Freeze exact native-wire and RLM scripted response frames, termination events,
  artifact paths, and expected statuses.
- Make Task 0 start from a committed clean tree and list every path it changes.

Read the complete reviews rather than relying only on this summary.

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
