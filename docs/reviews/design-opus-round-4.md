# Design review — round 4 (Opus seat)

- **Artifact:** `docs/specs/2026-08-26-prime-superpowers-design.md`
- **Artifact state:** 271 lines, md5 `d2a6632c2d9e14ef36ae9a182265560c`, header `Status: draft, round 3 findings incorporated`
- **Review date:** 2026-08-26
- **Seat:** Opus (independent; no spec or product file edited by this review)
- **Verdict:** **NONZERO** — 3 Blockers, 3 Majors, 5 Minors

## Baselines used for verification

| Baseline | Identity |
| --- | --- |
| Prime Agent source | `/home/user/workspace/prime-agent` @ `bc0fa7606abb3b7af0f765319518d255e6ae553d` (tag `beta`), `@earendil-works/pi-coding-agent` 0.8.1 |
| Superpowers source | `/home/user/workspace/superpowers` @ `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (tag `v6.3.0`) |
| Release metadata | GitHub release `v0.8.1` of `PrimeIntellect-ai/prime-agent` ([release API](https://api.github.com/repos/PrimeIntellect-ai/prime-agent/releases/tags/v0.8.1), [release page](https://github.com/PrimeIntellect-ai/prime-agent/releases/tag/v0.8.1)) |
| Official installer | [`install.sh`](https://app.primeintellect.ai/prime-agent/install.sh) |

Severity rubric for this round: **Blocker** = as written, the design cannot execute on 0.8.1 / v6.3.0, or a stated safety guarantee is unattainable. **Major** = executes but a load-bearing claim is unverifiable, unenforceable, or silently degrades. **Minor** = correctness or clarity fix with no topology impact.

---

## Blockers

### OPUS-R4-B1 — Extract-only toolchain install cannot produce a runnable `prime-agent`

- **Affected lines:** 61, 80 (also 255, 264 resolution records)
- **Spec claim:** line 80 — "Bootstrap downloads to a temporary file, verifies SHA-256 before extraction, installs under `<kit>/toolchain/prime-agent-0.8.1`, invokes only its absolute `prime-agent` binary, and checks `--version` before credentials enter its environment."
- **Evidence:**
  - The pinned asset is an **npm tarball**, not a self-contained archive. `scripts/pack-prime-agent-release.mjs:159-195` rewrites `bin` to `{prime-agent: …}`, sets `piConfig`, and rewrites the three internal deps (`prime-agent-core|ai|tui`) to R2 URLs while **retaining `dependencies`** from the source package.
  - `packages/coding-agent/scripts/bundle.mjs:43` keeps `koffi`, `undici`, `@silvia-odwyer/photon-node`, `@mariozechner/clipboard` **external**: "they resolve from node_modules at runtime".
  - `packages/coding-agent/src/cli-main.ts:31-33` performs `await import("undici")` on the primary startup path, in parallel with `./main.js`, i.e. before any argument handling completes.
  - The official installer resolves this with `npm install -g` of the verified tarball, not extraction ([install.sh](https://app.primeintellect.ai/prime-agent/install.sh)).
- **Concrete failure:** after checksum verification and `tar -x` into `<kit>/toolchain/prime-agent-0.8.1`, `node dist/bundle/cli.js --version` throws `ERR_MODULE_NOT_FOUND: undici`. The pre-credential `--version` gate in line 80 fails on every fresh clone, so the launcher never reaches Prime at all. Nothing in the design degrades gracefully here; the guarantee inverts (fail-closed becomes fail-always).
- **Required change:** state a dependency-resolving install step — e.g. `npm install --prefix <kit>/toolchain/prime-agent-0.8.1 --no-audit --no-fund <verified tarball>` (or `npm install -g --prefix` into a kit-private prefix) — and keep the absolute-binary and pre-credential `--version` rules on the resulting `bin/prime-agent` shim. If offline/extract-only remains a requirement, the kit must vendor a pre-installed `node_modules` and say so.

### OPUS-R4-B2 — The `.mjs` extension file is never discovered

- **Affected lines:** 64 (consequences at 51, 113-116, 156-158, 197)
- **Spec claim:** line 64 — `agent-home/extensions/prime-superpowers.mjs`.
- **Evidence:** `packages/coding-agent/src/core/extensions/loader.ts:464-466` — `isExtensionFile()` returns `name.endsWith(".ts") || name.endsWith(".js")` only; it gates the file branch of directory scanning at `loader.ts:530-531`. The directory form requires `index.ts`/`index.js` or a `package.json` with `pi.extensions`.
- **Concrete failure:** `<agentDir>/extensions/prime-superpowers.mjs` is skipped silently at discovery. All three proxy providers (`prime-proxy-openai|anthropic|google`), the root/child contract injection, and the Anthropic beta hook never register. `--model prime-proxy-openai/…:max` then fails model resolution, and the launcher's own internal `--model` (line 201) fails before any user prompt runs. No test in the Verification section asserts extension *discovery* by filename, so the design as written would ship this.
- **Required change:** rename to `agent-home/extensions/prime-superpowers.js` (ESM is fine — the bundle is `format: "esm"` per `bundle.mjs:39`) or use the directory form with `index.js`, and add a verification item asserting the extension is listed as loaded from the isolated agent home. Note this contradicts nothing else in the spec: `tests/provider-config.test.mjs` (line 74) is run by Node directly and may keep `.mjs`.

### OPUS-R4-B3 — Request-time Anthropic beta union has no surface in 0.8.1; the hook it names cannot set headers

- **Affected lines:** 17, 197, 205, 225, 226
- **Spec claim:** line 197 — "A `before_provider_request` hook unions `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA` into the request's runtime-computed Anthropic beta list, never a static provider header, thereby preserving conditional fine-grained-tool-streaming and interleaved-thinking tokens."
- **Evidence:**
  - The hook is **body-only**: `core/extensions/types.ts:612-617` (`BeforeProviderRequestEvent { payload: unknown }`), `types.ts:905` (`BeforeProviderRequestEventResult = unknown`), `core/extensions/runner.ts:896-899` (`emitBeforeProviderRequest(payload)`), `core/sdk.ts:301-307` (wired to `onPayload`).
  - In the Anthropic provider the payload is the **body params only** and the hook fires **after** the client already exists: `packages/ai/src/providers/anthropic.ts:507` creates the client, `:516-520` builds `params` then `await options?.onPayload?.(params, model)` and casts the result to `MessageCreateParamsStreaming`. Headers are not part of that object and per-request `requestOptions` (`:521+`) are assembled from `options`, not from the hook result.
  - `anthropic-beta` is a **client default header** computed in `createClient`: `anthropic.ts:854-859` builds `betaFeatures` (fine-grained tool streaming, interleaved thinking) and joins it into `"anthropic-beta"` at `:875`, `:895`, `:916`, `:936`.
  - The token the spec wants to preserve is genuinely per-request: `anthropic.ts:503` passes `shouldUseFineGrainedToolStreamingBeta(model, context)`, defined at `:1215-1217` as `!!context.tools?.length && !compat.supportsEagerToolInputStreaming` — true for essentially every agent turn.
- **Concrete failure:** an extension that returns a mutated payload cannot add `anthropic-beta`; the gateway never receives `extended-cache-ttl-2025-04-11`, so one-hour retention is billed/served as 5-minute and the "verified on a captured or live native request" claim at line 17 passes only because line 226's assertion would be written against the header Prime already emits. The obvious fallback — declaring a static `headers: {"anthropic-beta": …}` on the provider/model config — is what line 197 forbids, and for good reason: it replaces the client default and drops the per-request fine-grained-tool-streaming token computed at `anthropic.ts:503`.
- **Required change:** pick one and name it. (a) Register `prime-proxy-anthropic` with a custom `streamSimple` handler (`core/extensions/types.ts` ~1186-1216 `ProviderConfig`) that wraps the Anthropic streamer and unions the beta into headers it fully controls — the only 0.8.1 surface with request-header authority; (b) declare the union out of scope for 0.8.1 and require the proxy to inject the beta server-side; or (c) accept a static provider header **and** state the fine-grained-tool-streaming token explicitly in it, with a test asserting both tokens are present. Option (b) is the smallest and keeps line 205's opt-out story intact.

---

## Majors

### OPUS-R4-M1 — The supply-chain pin covers one of four release artifacts and none of the registry dependencies

- **Affected lines:** 61, 80, 211, 223
- **Evidence:** the v0.8.1 release carries `prime-agent-0.8.1.tgz` (`46c24db1…`, the pinned one), plus `prime-agent-ai-0.8.1.tgz` (`f6c3bdb6…`), `prime-agent-core-0.8.1.tgz` (`0cc36609…`), `prime-agent-tui-0.8.1.tgz` (`bd07bcce…`), `SHA256SUMS` and `latest.json` ([release API](https://api.github.com/repos/PrimeIntellect-ai/prime-agent/releases/tags/v0.8.1)). `scripts/pack-prime-agent-release.mjs:159-180` rewrites the three internal deps to `https://pub-728493de92a943e2a9b2d17b4719f318.r2.dev/releases/v0.8.1/…` — a mutable R2 path, not the immutable GitHub asset — and leaves ~22 registry dependencies unpinned by the kit.
- **Concrete failure:** once B1 is fixed with an install step, resolution fetches three R2 tarballs and the registry closure with **no kit-side integrity**, while line 80 claims "Missing, corrupt, substituted, or mismatched artifacts fail closed" and line 223 claims the release checksum/provenance is validated. A substituted R2 artifact passes every check the design describes.
- **Required change:** pin all four release assets by SHA-256 in `toolchain/SHA256SUMS` (mirroring the release's own `SHA256SUMS`), pre-place the three internal tarballs and install from local paths, and commit an `npm-shrinkwrap.json`/lockfile with integrity hashes for the registry closure — or explicitly scope the guarantee to "the entry tarball only" and remove the fail-closed language.

### OPUS-R4-M2 — The final reviewer contract lives outside the sibling set the design vendors

- **Affected lines:** 84, 144, 213, 233
- **Evidence:** Superpowers v6.3.0 `skills/subagent-driven-development/SKILL.md:453-454` points the whole-branch review at `superpowers:requesting-code-review`'s `[code-reviewer.md](../requesting-code-review/code-reviewer.md)`, and the flow diagram repeats it at `:88`, `:117-118`. Spec lines 84 and 213 vendor only **sibling** files of the two overridden directories. Prime resolves a colliding skill as one whole directory (verified round 3), so a kit-owned `subagent-driven-development/` resolves `../requesting-code-review/code-reviewer.md` to `<agentDir>/skills/requesting-code-review/code-reviewer.md`, which does not exist — the package copy lives at `<agentDir>/git/github.com/obra/superpowers/skills/…` (`core/package-manager.ts:1864-1872`, `getGitInstallPath`).
- **Concrete failure:** line 233's own test ("every relative file referenced by a local overriding skill exists") fails by construction, or the implementer silently drops the link and the coordinator improvises the final reviewer contract — which breaks line 158's immutable read-only reviewer contract and the round-1 convergence rules that depend on a fixed reviewer prompt.
- **Required change:** either add `requesting-code-review/code-reviewer.md` to the vendored set with provenance (and accept the whole-directory override that implies), or specify that vendored bodies rewrite cross-skill links to the deterministic package path `<agent-home>/git/github.com/obra/superpowers/skills/requesting-code-review/code-reviewer.md`, and record which form line 233 asserts.

### OPUS-R4-M3 — The council is still not falsifiable where it spends most of its admissions

- **Affected lines:** 108, 234, 236 (round-3 M7 partial closure)
- **Evidence:** line 108 seals a Sol control baseline at exactly two points — "the first spec and final branch review" — while lines 100-102 route every ordinary task through 2–3 reviewers with up to five fix rounds, capped at 12 admissions per task and 80 per run. The demotion trigger is "if repeated runs show no unique accepted material findings from a seat", but no cross-run record, storage location, retention, or comparison procedure is defined anywhere in the spec (the ledger at lines 148-150 is per-run, and line 86's run record is cleared on completion). Upstream takes the opposite default: `superpowers/skills/subagent-driven-development/SKILL.md:184-199` directs the least powerful model that can do each role.
- **Concrete failure:** for per-task reviews there is no control arm and no attribution, so a seat that contributes nothing at the task level can never be shown to contribute nothing — the removal rule is unfireable for the majority of spend. With N=1 first run (line 236), "repeated runs" is also unreachable, so the policy is decorative on the only run that is actually planned.
- **Required change:** add (a) a per-task control arm — for a named sample of tasks, seal the single cheapest cross-family reviewer's findings before the other seats' results are visible, and record unique-accepted-findings per seat; and (b) a durable location and schema for cross-run seat statistics (e.g. `docs/reviews/seat-ledger.jsonl` outside the cleared run record) with the exact threshold that triggers demotion. Round-3 M7's requested single-agent control arm remains unadopted; if it is being rejected as a settled choice, say so explicitly with the cost argument.

---

## Round-3 closures verified sound (do not reopen)

| Round-3 ID | Claim | Round-4 verification |
| --- | --- | --- |
| R3-B1 | Executable provenance | Line 80's URL and SHA-256 `46c24db1…` match the real v0.8.1 asset ([release API](https://api.github.com/repos/PrimeIntellect-ai/prime-agent/releases/tags/v0.8.1)). Closed as to *identity*; installability is B1 and completeness is M1. |
| R3-B2 | Coordinator/child git context | Session cwd is explicit and transmitted, not daemon-process cwd: `cli/owned-session-worker.ts:37,111,128` (`cwd: session.sessionManager.getCwd()`); cold daemons spawn with the launcher cwd (`cli/daemon-launch.ts:375,574-580`). Launcher-chdir-then-exec (line 134) is sufficient. Closed. |
| R3-B3 | Skill collision / whole-directory override | Agent-home skills win as user scope over package scope; layout lines 65-71 vendor siblings. Closed except for the cross-skill link (M2). |
| R3-B4 | Argument firewall ordering | `cli/public-command.ts:39-56` keys only on `args[0]`; `normalizeLeadingDaemonSocketOption` (`:153-164`) rewrites only a leading `--daemon-socket … stop|rename`. Placing the internal `--model` first (line 201) does prevent prompt→subcommand routing. Closed. |
| R3-M1 | Thinking maps and reasoning-off wires | Anthropic: `ai/src/providers/anthropic.ts:806-812` branches on the **level** `off` and disables thinking, `mapThinkingLevelToEffort` (`:768-796`) clamps then reads `thinkingLevelMap`. OpenAI Responses: `openai-responses.ts:154-156` maps `off`→`undefined`, and `:258-262` then emits `reasoning.effort = thinkingLevelMap.off ?? "none"`. Both match the spec's tables. Closed. |
| R3-M6 | Model-ID sniffing | `anthropic.ts:746-763` `supportsAdaptiveThinking` requires `opus-5`/`sonnet-5`-class tokens, matching the alias-token constraint at line 128. Closed. |
| R3-M3 | One coordinator per kit clone | The invariant is now session-state based (line 86) and a machine-readable observable exists (`cli/command-registry.ts:25` `list [--all] [--json]`, `cli/daemon-command.ts:642`), so it is implementable. Downgraded to Minor N1 (name the observable). |

## Minors

- **OPUS-R4-N1 (line 86):** name the liveness observable. `prime-agent list --all --json` and `status --json` (`cli/command-registry.ts:25,79`) are the only supported machine-readable session queries; "queries the recorded daemon/session" otherwise invites parsing human output.
- **OPUS-R4-N2 (lines 80, 162):** the official installer also bootstraps `rg`/`fd` and the Python kernel via postinstall (`packages/coding-agent/postinstall.cjs`, `PRIME_AGENT_BOOTSTRAP_TOOLS_ON_INSTALL=1` in [install.sh](https://app.primeintellect.ai/prime-agent/install.sh)). Line 162's `rg`-based reconnaissance and `ipython`/`bash()` conventions (line 214) depend on that bootstrap; state whether the kit runs it or requires host-provided tools.
- **OPUS-R4-N3 (line 82):** git package sources are not version-verified on load — `core/package-manager.ts:1239-1247` only checks existence, and `getGitInstallPath` (`:1864-1872`) has no tag component, unlike the pinned-version check npm gets at `:1227-1231`. Add a doctor assertion that `<agent-home>/git/github.com/obra/superpowers` is at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`.
- **OPUS-R4-N4 (line 40):** the `--model <pattern>:<level>` shorthand is real (`packages/coding-agent/src/main.ts:538-540`, explicit `--thinking` still wins) — worth citing in the spec so the firewall's internal-option form is unambiguous.
- **OPUS-R4-N5 (lines 202-203):** `--print`/`-p` consumes the next non-`-`/`@` argument as the message (`cli/args.ts:178-186`); harmless but the firewall's ordering rules should say so explicitly, and vendored skill bodies still carry Claude-style `superpowers:<skill>` references (`skills/subagent-driven-development/SKILL.md:91,127,487`) that Prime resolves by bare name.

## Answers to the seat questions

- **Is the executable topology sound?** No. Three independent links in the boot chain are broken or unattainable as written: the toolchain install (B1), extension discovery (B2), and the Anthropic beta union (B3). Each fails on the very first run, and the current Verification list would not catch B1 or B2.
- **Is the model-diverse policy now falsifiable rather than ceremony?** Partially. Admissions ceilings and attributed usage (line 108) make cost visible and are a real improvement over round 3. Falsifiability is still missing exactly where the money goes — per-task reviews have no control arm — and the demotion rule depends on cross-run data the design never stores (M3).

## Sources

- Prime Agent v0.8.1 release metadata: https://api.github.com/repos/PrimeIntellect-ai/prime-agent/releases/tags/v0.8.1 and https://github.com/PrimeIntellect-ai/prime-agent/releases/tag/v0.8.1
- Official Prime Agent installer: https://app.primeintellect.ai/prime-agent/install.sh
- Superpowers v6.3.0: https://github.com/obra/superpowers/tree/v6.3.0 (local checkout `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`)
- Local Prime Agent source at `bc0fa7606abb3b7af0f765319518d255e6ae553d`: `packages/coding-agent/src/{cli-main.ts,main.ts,cli/*.ts,core/extensions/{loader,types,runner}.ts,core/{sdk,package-manager}.ts}`, `packages/ai/src/providers/{anthropic,openai-responses}.ts`, `packages/coding-agent/scripts/bundle.mjs`, `scripts/pack-prime-agent-release.mjs`, `packages/coding-agent/docs/packages.md`
