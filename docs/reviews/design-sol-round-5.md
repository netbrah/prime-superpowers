# Sol Design Review — Round 5

**Spec reviewed:** `docs/specs/2026-08-26-prime-superpowers-design.md` (current 291-line working copy; SHA-256 `08538286bab10385dc6ce9b1fc916c87ce6dd4a461b07ffc542f0fb44ffe808a`)  
**Baselines checked:** Prime Agent `0.8.1` source at `bc0fa7606abb3b7af0f765319518d255e6ae553d`; Superpowers `v6.3.0` at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`; actual `prime-agent-0.8.1.tgz` release artifact  
**Review disposition:** **Not approved — 0 Blockers, 1 Major**  
**Blocker/Major state:** **NONZERO**

## Scope and method

This was a fresh source-and-artifact review after the round-4 edits. I checked the current design rather than assuming the resolution record was correct, and re-read the prior Blocker/Major findings from all available Sol, Opus, and Gemini rounds.

The release artifact used for the executable checks was `/home/user/workspace/review-artifacts/prime-agent-0.8.1.tgz`. Its measured SHA-256 is `46c24db1782dd31adc35d5c6cbcc75564faba6ced3bf2ccf03d836ee77134475`, exactly matching the design. The extracted package declares `prime-agent@0.8.1`, bin `prime-agent -> dist/bundle/cli.js`, and `engines.node >=22.8.0`.

I also performed a clean local materialization probe with a minimal package whose sole direct dependency was the design's official GitHub release URL. `npm install --package-lock-only` produced a v3 lock containing SHA-512 integrity for the main tarball, all three R2-hosted Prime internal tarballs, and every non-link dependency. `npm ci` installed 193 packages and created `node_modules/.bin/prime-agent` with the expected target. The result below is based on the behavior of that installed release, not merely the source tree.

## Finding

### SOL-R5-M1 — The npm-ci toolchain still omits Prime 0.8.1's mandatory Node runtime contract

**Severity:** Major  
**Status:** Open  
**Affected spec lines:** 7, 83–90, 235, 287

**Evidence**

1. The actual release package's `package.json` declares `"engines": { "node": ">=22.8.0" }`.
2. Prime's shipped CLI performs an explicit runtime guard before loading the Node-22 module graph. The corresponding source is `packages/coding-agent/src/cli/node-version-check.ts`; the release prints a diagnostic and exits nonzero below 22.8.0.
3. The design now correctly says to run `npm ci` and invoke `<kit>/toolchain/node_modules/.bin/prime-agent`, but nowhere defines, supplies, or preflights a Node version. It also does not state a supported npm version or require npm's `engine-strict` behavior.
4. In the clean probe on the available Node `v20.20.1` / npm `10.8.2`, `npm ci` returned success after only an `EBADENGINE` warning. All four Prime package identities were `0.8.1`, all lock integrities were satisfied, and the expected binary shim existed. The very next required check, `node_modules/.bin/prime-agent --version`, exited 1 with: `prime-agent requires Node 22.8.0 or newer`.
5. Running the same installed release entry point under Node `22.8.0` returned `0.8.1`. This isolates the failure to the missing runtime prerequisite rather than the tarball, lockfile, or bin path.

**Concrete failure**

A host with a common pre-22.8 Node installation passes the design's `npm ci` step and package-integrity/identity checks, then cannot launch Prime. The purpose promises a standalone kit that can be cloned and launched, while the bootstrap contract leaves a load-bearing runtime prerequisite to implementation guesswork. Because npm does not fail on an engine mismatch by default, “npm ci succeeded” is not a sufficient installation gate.

The ordering also matters for the design's credential boundary: `npm ci` runs lifecycle scripts. The implementation must perform the Node/npm preflight and install in an environment from which `PRIME_LLM_KEY` and any other loaded secrets are explicitly absent, including secrets inherited from the invoking process; merely parsing `.env` later does not remove inherited variables.

**Required correction**

Define the executable runtime contract, not only the package contract:

- require and preflight Node `>=22.8.0` before `npm ci`, or pin/bootstrap an exact kit-owned Node release;
- state the supported/pinned npm version (or tested range) used to produce and consume the committed lockfile;
- either make an engine mismatch fatal (`engine-strict=true`) or perform an equivalent launcher check before install;
- run `npm ci` with an explicitly sanitized child environment so package lifecycle scripts cannot receive proxy credentials already present in the parent environment;
- add clean-machine tests for an unsupported Node failure and a Node-22.8+ success through the exact `.bin/prime-agent --version` path.

This is Major rather than Blocker because the chosen npm layout and artifact are valid and work under the release's required runtime; the missing contract is a prerequisite/preflight defect, not an impossible architecture.

## Requested round-4 fix verification

| Focus | Round-5 result | Evidence |
|---|---|---|
| Exact toolchain npm-ci installation | **Partially closed; SOL-R5-M1 remains** | The official URL is a valid npm dependency; a generated lock pins the main package, three internal packages, and public closure; `npm ci` creates the exact `.bin/prime-agent` path; the installed identities are all 0.8.1. The design still omits the tarball's Node `>=22.8.0` runtime and npm-version/preflight contract. |
| `.js` extension discovery | **Closed** | Prime source `core/extensions/loader.ts:464-466, 507-546` and shipped `dist/core/extensions/loader.js` accept direct `.ts`/`.js` files. The design now uses `agent-home/extensions/prime-superpowers.js`. |
| Static adaptive-only Anthropic beta set | **Closed** | Prime's `createClient` computes fine-grained/interleaved betas, then `mergeHeaders(..., optionsHeaders)` lets provider request headers replace the computed value. The design intentionally supplies the complete static list: fine-grained tool streaming plus the optional extended-cache token. `supportsAdaptiveThinking()` recognizes IDs containing `opus-5` or `sonnet-5`, and `needsInterleavedBeta` is false for those IDs, so the omitted interleaved token is not required on the constrained model set. The design rejects wire-changing aliases and requires an outbound-header capture. |
| Localized final reviewer prompt | **Closed** | Upstream SDD references `../requesting-code-review/code-reviewer.md` at `SKILL.md:88,117,453-454`. The design replaces that external-directory link with local `final-reviewer-prompt.md`, copied from the pinned prompt (upstream SHA-256 `5eca5fcfd48a50e0a526ce5ffd64bf625d6b81bb46d11795274dae451fe6ffd4`) and covered by provenance/hash and relative-link tests. |
| Per-gate policy evidence | **Closed** | The design now seals the designated primary finding set before later seats at every review gate, selects the primary per gate, attributes unique accepted later-seat findings and outcome effects, persists per-seat admissions/usage/latency/contribution history across runs, defines a three-run no-contribution trigger by gate type, and leaves policy changes to operator approval. Verification explicitly tests ordering and attribution. |

## Prior Blocker/Major regression audit

| Prior area | Round-5 status |
|---|---|
| Project/agent-home topology, global depth enforcement, target worktree cwd, and coordinator-vs-worker mutation boundary | **Closed; no regression found** |
| Unique provider IDs, native URL shapes, bearer/native single-key auth, and preservation of global provider configuration | **Closed; no regression found** |
| Child completion signaling, deadlines, cancellation, retry, late-report quarantine, same-parent attachment, orphan handling, and one-active-run state | **Closed in design; no regression found** |
| Review arbitration, stable findings, bounded convergence, taxonomy mapping, cannot-verify handling, deferred Minors, and severity-downgrade concurrence | **Closed; no regression found** |
| TDD evidence, `BASE..HEAD` packages, worker commits, reviewer non-mutation, and CI evidence contract | **Closed; no regression found** |
| Argument firewall and prompt/subcommand routing | **Closed; no regression found** |
| Whole-directory skill shadowing and required sibling assets | **Closed; no regression found** |
| Final reviewer cross-directory dependency | **Closed by localization; no regression found** |
| Model thinking maps, fixed role profiles, alias constraints, and Anthropic adaptive-vs-budget path | **Closed; no regression found** |
| Anthropic header mutation via impossible body hook | **Closed by the static adaptive-only set; no regression found** |
| Council cost/admission limits and contribution falsifiability | **Closed by per-gate sealing and persistent policy history; no regression found** |
| Release artifact identity, internal-artifact checksums, lock-integrity coverage, and local executable path | **Closed except for SOL-R5-M1's runtime/preflight gap** |

## Final verdict

**Blockers: 0**  
**Majors: 1**

Round 5 remains **nonzero Blocker/Major**. The four requested round-4 design corrections are otherwise technically sound against Prime Agent 0.8.1, Superpowers v6.3.0, and the actual release tarball. Release readiness requires one final toolchain correction: make Node `>=22.8.0` (and the npm/credential-sanitization behavior around `npm ci`) an explicit, tested bootstrap contract.
