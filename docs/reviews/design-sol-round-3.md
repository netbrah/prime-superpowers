# Sol Design Review — Round 3

**Review date:** 2026-08-26  
**Disposition:** **Changes required — do not proceed to task breakdown**  
**Finding count:** **2 Blockers, 2 Majors**  
**Design reviewed:** `docs/specs/2026-08-26-prime-superpowers-design.md`  
**Prior review:** `docs/reviews/design-sol-round-2.md`  
**Source baselines:** Prime Agent 0.8.1 at `bc0fa7606abb3b7af0f765319518d255e6ae553d`; Superpowers v6.3.0 at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`

## Verdict

There are **not zero Blockers/Majors**.

Round 3 confirms that the argument firewall and complete thinking maps close their round-2 findings. The child deadline is executable while the original parent session remains available, but its claimed restart behavior is not: the safe CLI permits an in-memory session, rejects the resume mechanisms needed to restore a persisted parent, and Prime scopes child discovery and deletion to that parent transcript.

The Prime executable pin and authentication-schema findings also remain open. The proposed `prime-agent: 0.8.1` registry dependency is not the distribution mechanism documented by the pinned Prime source; Prime 0.8.1 is distributed as a versioned release tarball whose internal dependencies are themselves rewritten to release-artifact URLs. Separately, the architecture still promises an `explicit-header` auth mode that the configuration contract explicitly does not define.

The fresh pass found one additional Major: model-ID overrides are advertised, but no corresponding metadata schema is provided even though Prime requires complete model declarations.

This remains a design/source review. The kit still contains design and review documents only, so no launcher, lockfile, extension, doctor, or package tests existed to execute.

## Severity rubric

- **Blocker:** A documented success criterion or mandatory workflow invariant can fail or hang under an allowed execution path.
- **Major:** The architecture is feasible, but implementation or acceptance tests must invent load-bearing behavior not fixed by the design.
- **Minor:** The direction is workable, but a local clarification is needed for determinism, portability, or maintainability.

## Blockers

### SOL-R3-B1 — Restart-safe child deadlines cannot recover the required parent registry

**Affected design lines:** 137, 139–141, 184, 209, 232.

**Finding:** The design says the ledger is authoritative after restart, remaining child deadlines survive restart, and restart-mid-deadline behavior is tested. At the same time, the safe argument allowlist permits `--no-session` and rejects session resume/continue/fork. Prime cannot reconcile or delete an old child from an unrelated new parent: the child registry is explicitly scoped to the parent transcript. The persisted timestamps therefore do not provide the runtime authority needed to enforce the deadline after a process restart.

**Source evidence:**

- `--no-session` selects `SessionManager.inMemory()` rather than a persisted session: `prime-agent/packages/coding-agent/src/main.ts:456-465`.
- Prime's in-memory session manager is created with persistence disabled: `prime-agent/packages/coding-agent/src/core/session-manager.ts:2006-2008`.
- Persisted recovery uses `--resume` or `--continue`; without either, Prime creates a new session: `prime-agent/packages/coding-agent/src/main.ts:478-503`.
- The RLM registry survives a **parent restore**, but an unrelated new parent does not inherit children: `prime-agent/packages/coding-agent/docs/rlm-runtime.md:171-179`.
- Child resolution and deletion fail when no direct child matches in the current parent session: `prime-agent/packages/coding-agent/src/core/agent-session.ts:9563-9572,9616-9678`.
- The current spec expressly permits `--no-session` and rejects resume/continue/fork: design line 184.

**What concretely breaks if ignored:** If the coordinator exits or crashes while a child is queued or running, a safe `--no-session` invocation has no parent transcript to restore. Even for a normally persisted invocation, the documented wrapper contract provides no safe restoration path. A replacement coordinator can read `deadline_at` but cannot list or cancel the old child through `rlm.delete_subagent()`. It can either leave an unbounded orphan running, misclassify cleanup as complete, or launch a duplicate attempt, violating the hard-deadline, no-duplicate-live-attempt, and restart-idempotency guarantees.

**Required change:** Make persistence mandatory for workflow-enabled runs; remove `--no-session` from the safe allowlist. Define a kit-owned restart command/path that records the exact parent session selector and restores that same parent transcript without allowing the caller to choose an arbitrary session. Specify the fail-closed behavior when restoration or registry rehydration fails, and test a real process death with both queued and running children before deadline expiry.

### SOL-R3-B2 — The specified Prime Agent dependency does not identify the pinned Prime release artifact

**Affected design lines:** 38, 58–59, 77, 192, 204, 234.

**Finding:** The revision replaces an unspecified executable pin with `prime-agent: 0.8.1` in `package.json`, but the pinned Prime source says public releases are versioned tarball artifacts, not a registry package install. The release packer rewrites the public package name and command to `prime-agent` only inside that tarball and rewrites internal package dependencies to versioned release-artifact URLs. A bare semver dependency does not identify that artifact or its private dependency graph.

**Source evidence:**

- Prime's package README states that public releases are versioned tarball artifacts, that release packaging rewrites the application package and command to `prime-agent`, and that the inherited npm package must not be used as the install path: `prime-agent/packages/coding-agent/README.md:16`.
- The source coding package is actually named `@earendil-works/pi-coding-agent`, exposes a `pi` bin, and has version 0.8.1: `prime-agent/packages/coding-agent/package.json:2-11`.
- The repository root named `prime-agent` is private rather than a publishable runtime package: `prime-agent/package.json:2-4`.
- The release packer describes private npm tarballs, including `prime-agent-<version>.tgz`: `prime-agent/scripts/pack-prime-agent-release.mjs:91-103`.
- The packer rewrites the release package name/bin and rewrites internal dependencies to release URLs: `prime-agent/scripts/pack-prime-agent-release.mjs:155-200,250-271`.
- Release metadata records a tarball path and SHA-256 values for every artifact: `prime-agent/scripts/pack-prime-agent-release.mjs:314-337`.

**What concretely breaks if ignored:** `npm install` may fail because the intended package/version is not in the configured registry, or it may resolve an unrelated registry package named `prime-agent`. Even if a package with that name installs, the design has not tied it to the Prime 0.8.1 release tarball and its rewritten internal artifacts. The launcher therefore cannot guarantee that `node_modules/.bin/prime-agent` is the reviewed executable; in the failure case the kit cannot start at all, and in the substitution case all source-backed runtime assumptions become non-reproducible.

**Required change:** Pin the actual 0.8.1 release tarball by immutable URL plus integrity/checksum (or vendor the verified artifact), commit the resulting lockfile, and verify the artifact identity in package tests. Keep the pre-credential `--version` check, which Prime supports, but do not treat version text alone as provenance. Test missing/corrupt artifacts, checksum mismatch, registry substitution, and the exact release artifact's transitive dependency URLs.

## Major findings

### SOL-R3-M1 — The explicit-header authentication promise still contradicts the configuration contract

**Affected design lines:** 11, 48, 103–107, 178–180, 206, 236.

**Finding:** Architecture line 48 still promises optional `native` **or `explicit-header` modes**. The configuration contract defines only `bearer` and `native`, then says the design does not provide an arbitrary custom-secret-header mode. It also mentions per-dialect non-secret header environment variables without naming them or defining their grammar. This is the same load-bearing gap as SOL-R2-M3, not a completed closure.

**Source evidence:**

- Prime provider registration accepts literal custom headers and an `authHeader` boolean; `authHeader` specifically adds `Authorization: Bearer <key>`: `prime-agent/packages/coding-agent/src/core/extensions/types.ts:1186-1203`.
- Provider/model headers are merged and bearer authorization is applied afterward: `prime-agent/packages/coding-agent/src/core/model-registry.ts:1296-1344`.
- A provider with declared models still requires an `apiKey` or OAuth even when custom headers exist: `prime-agent/packages/coding-agent/src/core/model-registry.ts:1482-1503`.
- The spec's only auth-mode variable is `PRIME_PROXY_AUTH_MODE`, with `bearer` and `native` as its defined values: design lines 170–180.
- The round-2 resolution record claims arbitrary secret headers are out of scope, which directly conflicts with the retained architecture promise: design lines 48 and 236.

**What concretely breaks if ignored:** A gateway requiring a custom credential header remains promised by the architecture but impossible to configure from the documented surface. Implementers must either silently remove a documented mode, invent environment names and precedence, or accept secrets through the supposedly non-secret extra-header channel. The auth truth table cannot have a unique expected result, and a deployment may send the key in the wrong header or duplicate it unexpectedly.

**Required change:** Choose one contract. Either remove `explicit-header` from line 48 and state that only bearer/native secret placement is supported, or define the complete custom-header schema: mode value, per-dialect/global header-name variables, environment-only secret source, validation, collision precedence, and exact expected headers for every dialect. If non-secret extra headers remain, name their variables and define parsing/escaping and duplicate-name behavior.

### SOL-R3-M2 — Model-ID overrides have no metadata input or lookup contract

**Affected design lines:** 109, 117, 158–166, 182, 206–207.

**Finding:** The configuration advertises five model-ID override variables. The registration section says an override must also supply its metadata, but no metadata variables, file format, catalog lookup algorithm, or rejection rule is defined. Prime's provider API requires a complete model object; changing only an ID is not enough to register an unknown proxy model safely.

**Source evidence:**

- Prime requires every registered model to provide `id`, `name`, `reasoning`, supported inputs, cost fields, context window, and maximum output; API, URL, thinking map, headers, and compatibility may also be model-specific: `prime-agent/packages/coding-agent/src/core/extensions/types.ts:1219-1244`.
- Provider registration validates the declared provider/API but does not populate missing model metadata from the generated catalog: `prime-agent/packages/coding-agent/src/core/model-registry.ts:1482-1503`.
- The generated catalog contains provider-specific entries with materially different API, limits, maps, headers, and compatibility values, so ID alone is not a unique metadata key across providers: examples at `prime-agent/packages/ai/src/models.generated.ts:2875-2911,3174-3245,4552-4574`.
- The spec lists only `PRIME_MODEL_*` ID variables, while line 117 requires an override to “also” supply metadata through an unspecified mechanism: design lines 117 and 158–166.

**What concretely breaks if ignored:** An operator can set a documented override to a proxy-only or future model ID, after which the extension must invent context/output limits, capabilities, reasoning support, thinking values, and compatibility flags. Reusing the old model's metadata can produce invalid requests or unsafe context assumptions; omitting fields fails registration; guessing a catalog match can select metadata for the wrong provider/API. The doctor and provider tests have no deterministic expected declaration.

**Required change:** Define either (a) overrides are restricted to an enumerated set of exact 0.8.1 catalog IDs with a deterministic family/provider lookup and mismatch rejection, or (b) a complete structured metadata schema supplied from a named data-only file/environment variable. Include all required Prime fields, validation, precedence, and tests for unknown IDs, ambiguous catalog matches, API-family mismatch, and incomplete metadata.

## Round-2 Blocker/Major closure verification

| Round-2 ID | Round-3 disposition | Verification |
|---|---|---|
| SOL-R2-B1 — bounded child waits | **Not fully closed; superseded by SOL-R3-B1** | Lines 139–141 now define elapsed deadlines, cancellation, one retry, quarantine, and fail-closed cleanup for an uninterrupted/restored parent. Restart cannot enforce them under the allowed session contract. |
| SOL-R2-B2 — argument bypass | **Closed** | Line 184 uses an allowlist, rejects invariant-changing flags and aliases/forms, and places unrestricted forwarding behind a separately acknowledged mode that explicitly drops guarantees. The new safe `--no-session` defect is separately tracked as SOL-R3-B1. |
| SOL-R2-M1 — Prime executable pin | **Not closed; escalated to SOL-R3-B2** | The design now chooses a concrete mechanism, but `prime-agent: 0.8.1` is not the release-artifact provenance documented by Prime 0.8.1. |
| SOL-R2-M2 — thinking maps | **Closed** | Lines 111–117 provide all seven keys, explicit `null` values, native values, and dispatch defaults. These agree with Prime's supported-level computation and provider translations (`packages/ai/src/models.ts:65-75`; `providers/anthropic.ts:765-795`; `providers/google.ts:403-465`; `providers/openai-responses.ts:248-261`). |
| SOL-R2-M3 — explicit-header auth schema | **Not closed; restated as SOL-R3-M1** | The detailed section limits secret auth to bearer/native, but architecture still promises an explicit-header mode and the extra-header variable schema remains unnamed. |

## Preserved round-2 closures and assumptions

The following reviewed assumptions remain supported and were not regressed:

1. `PRIME_AGENT_CODING_AGENT_DIR` is the correct clone-local home selector (`prime-agent/packages/coding-agent/src/config.ts:487-503`).
2. Global `rlmMaxDepth: 1` remains enforceable independently of target project settings (`prime-agent/packages/coding-agent/src/core/settings-manager.ts:771-778`; `agent-session.ts:10214-10217`).
3. The child deadline can use an exact child ID with `rlm.delete_subagent()` while the owning parent is present (`prime-agent/packages/coding-agent/docs/rlm-runtime.md:171-179`).
4. Exact RLM selectors and explicit thinking values remain enforceable (`prime-agent/packages/coding-agent/src/core/agent-session.ts:10182-10238`).
5. The Sol/Terra, Opus/Sonnet, and Gemini thinking values in lines 113–115 are accepted by the corresponding Prime 0.8.1 provider translations.
6. The argument firewall reserves the actual Prime model, cwd, tool, extension, skill, prompt, session, and autonomous controls exposed in `prime-agent/packages/coding-agent/src/cli/args.ts:98-245`.
7. The Superpowers five-to-ten-minute wait guidance still concerns reconciliation intervals, not total deadlines (`superpowers/skills/subagent-driven-development/SKILL.md:235-244`); the design's new elapsed deadlines appropriately add a stricter local policy.
8. The local convergence override remains necessary because upstream Superpowers permits adjudication/parking at its five-round breaker (`superpowers/skills/subagent-driven-development/SKILL.md:73-120,411-433`).

## Required acceptance additions

In addition to the current verification section:

1. **Parent restoration matrix:** persisted parent restart with queued/running child, invalid/missing parent selector, corrupt parent transcript, failed registry rehydration, and an explicit assertion that workflow mode rejects `--no-session`.
2. **Release provenance:** install the exact 0.8.1 release tarball from a pinned immutable reference; verify its checksum, package identity, rewritten `prime-agent` bin, transitive artifact URLs, and `--version`.
3. **Auth contract truth table:** after resolving SOL-R3-M1, assert exact header presence and absence for every dialect/mode and every extra-header collision.
4. **Model override matrix:** known supported ID, unknown ID, ambiguous ID across providers, API mismatch, incomplete metadata, and context/output/thinking truth-table verification.

## Recommendation

Do not begin task breakdown. Resolve SOL-R3-B1 and SOL-R3-B2 first, then close SOL-R3-M1 and SOL-R3-M2 before freezing implementation tests. Preserve the round-2 argument-firewall and thinking-map changes.
