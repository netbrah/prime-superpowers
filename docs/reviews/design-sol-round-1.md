# Sol Design Review — Round 1

**Review date:** 2026-08-26  
**Disposition:** **Changes required — not executable as specified**  
**Scope:** Executability, TDD/review convergence, Prime Agent API correctness, and missing blockers  
**Source baseline:** Local `prime-agent` checkout, version `0.8.1`, commit `bc0fa76`

## Summary

The design has a sound high-level direction: it correctly uses package filtering to retain Superpowers skills without loading the incompatible upstream extension; `rlm.find_models()` plus exact selectors is the right model-discovery mechanism; `rlm.run()` accepts `name`, exact `model`, and `thinking`; and an async extension can register providers before CLI model resolution.

It is not yet implementable without inventing important behavior. Four blockers prevent the launcher and workflow from meeting their stated guarantees:

1. The capability repository and target repository cannot both be the active Prime project under the proposed launch contract.
2. Project-local `rlmMaxDepth` is not honored by the current Prime Agent implementation.
3. The retained upstream subagent-driven-development skill conflicts with the proposed mandatory commit and review gates.
4. The target-repository mutation policy contradicts the implementation workflow.

The design also needs a concrete provider schema, a bounded review protocol, machine-verifiable TDD evidence, reviewer provenance controls, child recovery semantics, and integration tests that exercise Prime rather than inspect configuration text.

### Finding counts

| Severity | Count |
|---|---:|
| Blocker | 4 |
| Major | 10 |
| Minor | 5 |

## Severity rubric

- **Blocker:** The proposed system cannot start, cannot preserve a mandatory invariant, or has contradictory requirements that prevent a conforming implementation.
- **Major:** The implementation could be built, but a core correctness, convergence, safety, or verification guarantee is underspecified or untestable.
- **Minor:** The omission is locally repairable and does not invalidate the overall architecture.

---

## Blockers

### B1 — The launch contract does not define which repository is the Prime project

**Design area:** Repository layout, “cloned into or alongside a target repository,” launcher behavior.

Prime discovers project settings and project resources relative to the process working directory. The proposed `.prime/agent/settings.json`, extension, and skill overrides live in the capability repository. If `./prime` runs there, Prime sees the capability repository rather than the target repository as the project and coding context. If the user runs Prime from the target repository, the capability repository's project settings and resources are not discovered automatically.

The proposed launcher has no target argument, no target-root discovery rule, and no explicit `--extension`/`--skill` resource injection contract. “Alongside” therefore cannot work as written, and “inside” is ambiguous about whether the capability repository itself or its parent is the target.

**Local evidence:** Project resource discovery in `packages/coding-agent/src/core/settings-manager.ts` and the resource-loading path is rooted in the active working directory; child sessions inherit the root session's `cwd` and resource loader in `packages/coding-agent/src/core/agent-session.ts`.

**Required change:** Define one executable topology. For example:

- `./prime [TARGET_DIR]` resolves both roots, changes to `TARGET_DIR`, and passes the capability extension/skills/settings through supported explicit resource mechanisms; or
- installation copies/links the capability package into the target's `.prime/agent` tree, and the design drops the “alongside” claim.

Specify canonical path resolution, behavior for missing or dirty targets, how child `cwd` is inherited, and an integration test launched from both relative and absolute paths.

### B2 — Project-local `rlmMaxDepth: 1` does not enforce the claimed depth

**Design area:** Project settings and “children cannot spawn grandchildren.”

Current Prime Agent does not read `rlmMaxDepth` from the merged project settings. `SettingsManager.getRlmMaxDepth()` returns `this.globalSettings.rlmMaxDepth`. Session resolution then prefers persisted chat state, configured/inherited state, and the global setting before consulting `RLM_MAX_DEPTH`; the default is 2.

Consequently:

- placing `rlmMaxDepth: 1` in `.prime/agent/settings.json` has no effect;
- exporting `RLM_MAX_DEPTH=1` is not deterministic when the user already has a global value; and
- the design simultaneously forbids overwriting global configuration.

**Local evidence:** `getRlmMaxDepth()` in `packages/coding-agent/src/core/settings-manager.ts`; RLM depth resolution in `packages/coding-agent/src/core/agent-session.ts`; `/rlm-max-depth` is an interactive command, not a launcher option.

**Required change:** Choose and document a supported isolation mechanism. This likely requires either a Prime Agent change that honors project-scoped depth, a dedicated CLI/session API with higher precedence, or an isolated settings home whose global setting is owned by this package. Add a runtime test in which the real user-global setting is 2 and verify that a child receives a depth-rejection result when attempting to spawn a grandchild.

### B3 — The retained upstream execution skill contradicts the mandatory gates

**Design area:** Superpowers package filtering, subagent-driven development, clean-review-before-commit policy.

Filtering out only `.pi/extensions/superpowers.ts` leaves the upstream `subagent-driven-development` skill authoritative and discoverable. That skill:

- instructs implementers to commit before review;
- uses a five-round breaker that can adjudicate or park Important/load-bearing findings; and
- permits completion with parked findings.

The design instead requires review before commit and zero Blocker/Major findings before commit or completion. These are operationally incompatible instructions, not merely wording differences. The proposed overrides cover bootstrap/routing but do not replace or constrain the conflicting execution skill.

**Local evidence:** `/home/user/workspace/superpowers/skills/subagent-driven-development/SKILL.md` contains the pre-review commit sequence, five-round breaker, and parked-finding completion path. `/home/user/workspace/superpowers/skills/requesting-code-review/SKILL.md` also uses a different severity taxonomy.

**Required change:** Filter or locally override every conflicting workflow skill, especially `subagent-driven-development` and likely `requesting-code-review`. State explicit precedence: the local role, commit, severity, and convergence policies supersede upstream defaults. Add a test that renders the effective root and child instructions and fails if pre-review commits or parking of Major findings remain permitted.

### B4 — The target-mutation non-goal contradicts the implementation workflow

**Design area:** Non-goals versus task implementation and commits.

The design says that automatically modifying the target implementation repository is out of scope, while the core workflow dispatches implementation tasks, applies fixes, verifies the target source, and commits after review. A coordinator cannot satisfy both requirements.

**Required change:** Separate local modification from publication. A coherent policy would allow implementation and local commits in an isolated target worktree while prohibiting push, merge, release, or other publication without explicit user authorization. Define the allowed branch/worktree lifecycle and clean-up/retention behavior.

---

## Major findings

### M1 — The custom-provider contract is incomplete

**Design area:** Proxy-native provider registration.

`pi.registerProvider()` needs substantially more detail than base URL, API key, and model names. Each newly defined model requires `id`, `name`, `reasoning`, `input`, `cost`, `contextWindow`, and `maxTokens`; it may also need `api`, `baseUrl`, headers, compatibility flags, and `thinkingLevelMap`. The supported Google API identifier is `google-generative-ai`. The design does not specify these values or how they are derived, leaving the implementer to invent protocol-critical behavior.

The Sol/Terra requirement for `max` effort also needs an explicit `thinkingLevelMap`. Prime's default reasoning levels expose `off`, `minimal`, `low`, `medium`, and `high`; `max` is not automatically available. Gemini's “no user effort lever” likewise needs an explicit model declaration and selection rule.

**Local evidence:** `ExtensionAPI.registerProvider` and provider/model types in `packages/coding-agent/src/core/extensions/types.ts`; custom-provider documentation in `packages/coding-agent/docs/custom-provider.md`; reasoning-level construction in `packages/coding-agent/src/core/models.ts`.

**Required change:** Add a complete provider/model table containing unique provider name, API adapter, base-URL transformation, model ID and display name, reasoning flag, input modalities, context/output limits, cost policy, compatibility flags, and thinking-level map. Define whether unknown cost data is represented as zero and how doctor validates every field.

### M2 — Provider names must be isolated from existing global providers

**Design area:** “Do not overwrite global model configuration.”

Dynamic registration does not edit the global file, but registering models under an existing provider name can replace or alter that provider's effective model set for the session. Using generic names such as `anthropic`, `openai`, or `google` would therefore violate the behavioral intent of preserving global configuration.

**Local evidence:** Provider registration and model-registry update behavior in `packages/coding-agent/src/core/extensions/types.ts` and `packages/coding-agent/src/core/model-registry.ts`.

**Required change:** Reserve package-specific provider IDs such as `prime-proxy-anthropic`, `prime-proxy-openai`, and `prime-proxy-google`, and test that a fixture global provider/model remains present and unchanged after extension loading.

### M3 — The review loop lacks a deterministic convergence protocol

**Design area:** Fresh review until zero Blocker/Major findings.

The loop has no stable finding identity, state transition rules, bounded retry policy, disagreement handling, or outcome for oscillating reviewers. “Fresh reviewer” alone does not establish closure: one reviewer may reopen an already adjudicated issue or change severity indefinitely. The upstream five-round breaker cannot fill this gap because it permits parking findings that this design says must be resolved.

**Required change:** Define a durable review record with at least artifact hash, round, reviewer role/model selector, finding ID, severity, evidence, affected location, status, supersession link, and disposition. Specify that re-review receives the prior ledger and verifies both fixes and regressions. Set a finite round limit with fail-closed human escalation; never silently park a Blocker or Major.

### M4 — TDD evidence is not machine-verifiable

**Design area:** Red/green workflow and task reports.

“Recorded failing/pass evidence” does not define what proves that the same relevant test failed before production code and passed afterward. Plain prose or pasted output can be stale, selectively quoted, or produced from a different tree.

**Required change:** Define a task-report schema containing exact command, working directory, start/end timestamps, exit status, output artifact, pre/post tree or commit hash, test-file diff hash, implementation diff hash, and the observed failure signature. Require the coordinator to validate red-before-green ordering and rerun the final command independently before accepting a task.

### M5 — Reviewer non-mutation cannot be attributed with the proposed shared workspace

**Design area:** Review-only agents and coordinator rejection of reviewer-originated changes.

In a shared working tree, before/after `git status` cannot reliably attribute a change when reviewers run concurrently, when the implementer is active, or when pre-existing untracked files exist. Prompting reviewers not to mutate is not enforcement.

**Required change:** Run each reviewer against a read-only snapshot or dedicated detached worktree, or run reviews serially with immutable baseline and post-run tree hashes. Define which generated review files are allowed, fail closed on any other delta, and test deliberate reviewer mutation.

### M6 — Child lifecycle and restart recovery are underspecified

**Design area:** `rlm.run()`, concise `agent_message.send`, durable progress ledger.

`rlm.run()` returns an admission handle, not the final answer. The design does not specify timeouts, completion polling, duplicate messages, a missing report, a report/message mismatch, child failure, or coordinator restart. Completed daemon-backed children can be rehydrated, while inline children survive only in the current process; the design does not select a mode or recovery policy.

**Local evidence:** RLM runtime behavior in `packages/coding-agent/docs/rlm-runtime.md`; child admission, depth, and inherited session options in `packages/coding-agent/src/core/agent-session.ts`.

**Required change:** Define the coordinator state machine and ledger schema for admitted, running, reported, reviewed, failed, timed-out, and superseded work. Choose daemon-backed execution or specify fresh-child recovery. Treat the durable report as authoritative and the message as a notification containing the report path and digest.

### M7 — The proposed test surface cannot verify the stated guarantees

**Design area:** Verification strategy and `tests/test-package.sh`.

A single shell test based mainly on file presence and source-text checks cannot prove:

- extension load order and provider registration;
- exact selector and thinking validation;
- root-versus-child bootstrap content;
- effective depth enforcement;
- preservation of existing providers/settings;
- native Anthropic/OpenAI/Google wire payloads;
- long-cache behavior; or
- reviewer and coordinator mutation gates.

**Required change:** Add unit tests around configuration generation and bootstrap selection, plus integration tests that launch the local Prime binary against mock HTTP endpoints for all three APIs. Assert request paths, headers, body shapes, model IDs, thinking fields, and Anthropic cache TTL. Include negative tests for missing credentials, ambiguous models, unsupported effort, attempted recursion, and pre-existing global configuration.

### M8 — Version and package-source compatibility are not pinned

**Design area:** Reproducible installation.

The design pins “Superpowers” conceptually but does not state an exact package source, immutable version/ref, integrity mechanism, or minimum/maximum Prime Agent version. The reviewed behavior depends on Prime Agent 0.8.1 and the local Superpowers 6.3.0 content; future API or skill changes can invalidate the package silently.

**Required change:** Pin the Superpowers source to an immutable commit or release with integrity verification, declare the supported Prime Agent version range, and make doctor fail clearly outside that range. Test package filtering against the pinned package manifest.

### M9 — The root coordinator's “never implement” rule is prompt-only

**Design area:** Root role isolation.

The root session retains mutating tools. A system-prompt statement does not ensure that it never edits implementation files or runs mutating shell commands, and the design has no audit rule comparable to the reviewer-origin check.

**Required change:** Either enforce a root tool policy through extension hooks/tool wrapping or define a verifiable filesystem/commit audit that attributes all implementation deltas to accepted worker tasks. Specify narrowly permitted coordinator writes, such as ledger and review artifacts, and test a prohibited root edit.

### M10 — CI-specific failure reproduction has no executable contract

**Design area:** “CI-only failures must reproduce the named CI environment.”

The design does not define how the environment is named, captured, provisioned, or invoked. Without an executor/image/workflow reference and exact command, the requirement cannot be implemented or accepted.

**Required change:** Require a reproducibility record containing CI provider/workflow/job, revision, OS/image or container digest, toolchain versions, relevant environment, setup commands, test command, and logs. Define when local equivalence is acceptable and when the workflow must stop for unavailable infrastructure.

---

## Minor findings

### N1 — Severity terminology needs one canonical mapping

Upstream review material uses `Critical`, `Important`, and `Minor`, while this design uses `Blocker`, `Major`, and `Minor`. Define a canonical internal taxonomy and explicit translation (`Critical` → `Blocker`, `Important` → `Major`) so a finding cannot bypass a gate due to vocabulary.

### N2 — Exact model resolution still needs ambiguity and absence rules

`rlm.find_models(query, limit)` is appropriate discovery, but a bounded fuzzy query can return multiple or incomplete matches. Require an exact provider-and-model identity after discovery, fail on zero or multiple matches, record the resolved selector, and forbid silent fallback to another role/model.

### N3 — The long-cache test must inspect an emitted request

`PI_CACHE_RETENTION=long` produces a one-hour Anthropic cache TTL only when the selected model's compatibility metadata declares long-cache support. A source check for the environment variable and compatibility flag does not verify the effective wire. Assert `ttl: "1h"` in a captured Anthropic request and also test the unsupported-model path.

**Local evidence:** Cache-retention handling in `packages/ai/src/providers/anthropic.ts`.

### N4 — Launcher portability and path semantics are unstated

Specify supported shells/platforms, symlink handling, spaces in paths, repository paths outside the capability tree, signal forwarding, and exit-code propagation. If POSIX-only is intentional, state it and test on the supported shell set.

### N5 — Doctor needs secret-safe URL and credential validation rules

Define base-URL normalization, allowed schemes, trailing-path behavior, empty override handling, timeout/TLS diagnostics, and redaction. Doctor must never print keys or authorization headers and should distinguish missing credentials, unreachable endpoints, authentication failures, and incompatible API responses.

---

## Confirmed Prime Agent API assumptions

The following design assumptions match the reviewed local source:

1. `rlm.find_models(query="", limit=8)` returns model records including provider, ID, name, and exact selector.
2. `rlm.run(prompt, **kwargs)` accepts `name`, exact `model`, and `thinking`; unknown options and unsupported thinking levels fail validation.
3. Child sessions inherit the root resource loader, model registry, tools, and working directory.
4. `before_agent_start` receives `systemPromptOptions`, including RLM depth/parent context, so an extension can inject different root and child bootstrap text without relying on a process-global environment flag.
5. Async extension initialization is awaited before initial CLI model resolution, so provider registration at extension startup is viable.
6. Package object filters can disable an upstream extension while retaining the package's skills.

These confirmations should be converted into integration tests rather than left as undocumented implementation knowledge.

## Required acceptance additions

Before implementation begins, the design should add acceptance tests for:

1. Launch from a target separate from the capability checkout, with correct target `cwd` in root and child sessions.
2. A pre-existing global RLM depth of 2 while the package still prevents grandchildren.
3. A pre-existing global provider and package configuration remaining behaviorally unchanged.
4. Root and child prompts containing only their intended bootstrap sections.
5. Each role resolving to exactly one expected provider/model/effort tuple.
6. Captured native requests for Anthropic Messages, OpenAI Responses, and Google Generative AI.
7. Anthropic one-hour cache TTL on the supported model.
8. A real red/fail then green/pass evidence chain tied to tree hashes.
9. Reviewer and root mutation attempts being detected and rejected.
10. Restart after child admission, with deterministic recovery from the durable ledger.
11. Review disagreement reaching bounded fail-closed escalation rather than infinite looping or parked Major findings.
12. Local target changes and commits occurring only in the explicitly authorized worktree, with no push or merge.

## Recommendation

Do not start implementation from this revision. Resolve B1–B4 first, then revise the provider schema, workflow state machine, and verification plan. After those changes, conduct another design review against the same Prime Agent source baseline before generating an implementation plan.
