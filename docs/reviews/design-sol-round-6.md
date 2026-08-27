# Sol Design Review — Round 6

**Spec reviewed:** `docs/specs/2026-08-26-prime-superpowers-design.md` (current 298-line working copy; SHA-256 `61535fc6f6d8264baf21278a27124a1d53d0a69b77f13f801cdd8a6feac91c2c`)  
**Runtime baseline:** Prime Agent `0.8.1` source at `bc0fa7606abb3b7af0f765319518d255e6ae553d`  
**Review scope:** Fresh verification of the three remaining round-5 material findings, plus a regression scan of previously closed Blocker/Major areas  
**Review disposition:** **Approved — 0 Blockers, 0 Majors**  
**Blocker/Major state:** **ZERO**

## Method

I reviewed the current design directly rather than relying on its round-5 resolution record. I rechecked the affected Prime 0.8.1 implementation paths for the Node runtime guard, thinking-level support and adaptive Anthropic request construction, then spot-checked every previously material design area for contradictory edits or removed guarantees. No product or design file was modified by this review.

## Round-5 closure verification

| Prior finding | Round-6 result | Evidence |
|---|---|---|
| Node `>=22.8.0` must be checked before `npm ci` and before secrets are loaded | **Closed** | Design line 90 now makes a semantic Node `>=22.8.0` check the first bootstrap action, requires a distinct prerequisite diagnostic, orders it before `npm ci` and credential loading, and keeps `npm ci` before credentials enter its environment. Line 235 adds a pre-install verification case. This matches Prime's package `engines.node: ">=22.8.0"` and its dependency-free early guard in `packages/coding-agent/src/cli/node-version-check.ts`. |
| Opus/Sonnet `minimal` must not become invalid Anthropic effort `"minimal"` | **Closed** | Design line 135 maps Opus/Sonnet `minimal` to explicit `null`, and lines 138, 237, and 240 require unsupported-level behavior and wire checks. In Prime 0.8.1, `AnthropicEffort` contains only `low`, `medium`, `high`, `xhigh`, and `max`; a string map value is forwarded as effort, while `null` removes the level from `getSupportedThinkingLevels`. The invalid wire is therefore no longer representable by the profile, and explicit RLM dispatch at that level is rejected. |
| Adaptive Opus/Sonnet must use eager tool input with an extended-cache-only static beta header | **Closed** | Design line 209 now states the correct three-part invariant: enforced adaptive `opus-5`/`sonnet-5` IDs, eager tool-input streaming, and a static header containing only `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA`. Lines 217, 237, 238, and 289 consistently carry that policy into compatibility behavior and tests. Prime 0.8.1 defaults `supportsEagerToolInputStreaming` to true, emits `eager_input_streaming: true` on tools, suppresses the fine-grained beta in that mode, and suppresses the interleaved beta for adaptive IDs. The prior contradictory fine-grained token is absent. |

## Focused technical checks

### Node preflight and credential boundary

The design's order is now unambiguous:

1. Semantically compare the active Node version against `22.8.0`.
2. Fail with a prerequisite-specific diagnostic when unsupported.
3. Run `npm ci` only after that check.
4. Keep credentials out of the install environment.
5. Validate installed package identities, lock integrities, the absolute binary, and exact Prime version.

This closes the observed Node-20 failure mode in which npm reports only `EBADENGINE`, installs successfully, and the generated Prime binary then refuses to start. The verification section now prevents an implementation from treating `npm ci` success as the runtime-version gate.

### Anthropic effort map

The corrected `minimal: null` entry is consistent with the design's explicit-null convention and Prime's model capability machinery. It also leaves the role dispatch unchanged at `high`. The neighboring `off: off` entry remains valid because Prime takes the reasoning-disabled path before adaptive effort mapping, while `low` through `max` map to values admitted by `AnthropicEffort`.

### Anthropic beta/tool pairing

The current design no longer combines mutually exclusive fine-grained beta and eager tool-input modes. For the constrained adaptive model-ID families:

- adaptive thinking suppresses the interleaved-thinking beta;
- eager tool-input support suppresses the fine-grained-tool-streaming beta;
- tool schemas carry `eager_input_streaming: true`;
- the static provider header contributes only the optional extended-cache token;
- provider/header capture and tool-shape tests verify the final outbound combination;
- alias rejection prevents a model with a different wire contract from entering this profile.

The mechanism remains feasible because Prime's provider/options headers are merged after computed defaults and can supply the final `anthropic-beta` value.

## Regression audit

No Blocker or Major regression was found in the previously closed areas:

- isolated agent-home topology, global depth enforcement, and target-worktree cwd;
- unique provider IDs, native URL roots, bearer/native single-key authentication, and preserved global providers;
- pinned release artifact, complete lock-integrity coverage, installed package identities, `.js` extension discovery, and absolute executable path;
- whole-directory skill shadowing, vendored sibling assets, and localized final-reviewer prompt;
- model selection, exact thinking maps, fixed role profiles, and alias rejection;
- argument firewall and public-command routing;
- persistent single-run state, exact-parent attach, deadlines, cancellation, retry, cleanup failure, and late-report quarantine;
- TDD evidence, worker commits, `BASE..HEAD` review packages, reviewer non-mutation, and CI evidence;
- stable finding IDs, bounded convergence, taxonomy mapping, cannot-verify handling, deferred-Minor handoff, and cross-family concurrence for downgrades;
- review admissions, sealed primary findings, contribution attribution, and cross-run policy evidence.

## Findings

No Blocker or Major findings.

## Final verdict

**Blockers: 0**  
**Majors: 0**

Round 6 is **zero Blocker/Major**. The three remaining round-5 material findings are closed in the current design, and the targeted regression scan found no newly introduced material defect. The design may proceed to task breakdown and implementation.
