# Prime Superpowers CLI Design — Gemini Independent Review (Round 5)

**Reviewer:** Gemini 3.1 Pro (Context, Protocol, Portability & Large-Context Blind-Spot Reviewer)  
**Date:** 2026-08-26 / 2026-08-27  
**Target Document:** `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` (Header: `Status: draft, round 4 findings incorporated`, 292 lines)  
**Reference Codebases:**  
- `prime-agent` (v0.8.1, commit `bc0fa7606abb3b7af0f765319518d255e6ae553d`, release artifact `prime-agent-0.8.1.tgz`)  
- `superpowers` (v6.3.0, commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`)  
**Prior Reviews Checked:** `design-sol-round-4.md`, `design-opus-round-4.md`, `design-gemini-round-4.md`, `design-sol-round-3.md`, `design-opus-round-3.md`, `design-gemini-round-3.md`, `design-sol-round-2.md`, `design-gemini-round-2.md`, `design-opus-round-1.md`, `design-sol-round-1.md`, `design-gemini-round-1.md`  
**Verdict:** **APPROVED — ZERO BLOCKERS, ZERO MAJORS** (0 Blockers, 0 Majors, 0 Minors)

---

## 1. Executive Summary & Verdict

The Round 5 revision of `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` successfully incorporates all corrections required by the Round 4 reviews from Sol and Opus (`SOL-R4-B1`, `SOL-R4-M1`, `OPUS-R4-B1`, `OPUS-R4-B2`, `OPUS-R4-B3`, `OPUS-R4-M1`, `OPUS-R4-M2`, `OPUS-R4-M3`).

Every load-bearing interface in the specification has been verified against the exact runtime source code and release bundle mechanics of **Prime Agent 0.8.1** and **Superpowers v6.3.0**:

1. **Toolchain Materialization:** Replaces extract-only phrasing with a deterministic, kit-local `npm ci` workflow in `toolchain/` backed by a committed lockfile and SHA-256 manifest pinning all four release artifacts (`prime-agent-0.8.1.tgz`, `prime-agent-ai-0.8.1.tgz`, `prime-agent-core-0.8.1.tgz`, `prime-agent-tui-0.8.1.tgz`). Invokes the real generated binary `<kit>/toolchain/node_modules/.bin/prime-agent` with pre-credential `--version` verification.
2. **Extension Discovery:** Replaces unsupported `.mjs` with `.js` (`agent-home/extensions/prime-superpowers.js`), conforming to Prime 0.8.1's `isExtensionFile` check (`loader.ts:464-466`) for global extension directory scanning.
3. **Anthropic Beta Headers:** Eliminates the impossible body-only `before_provider_request` header mutation. In its place, registers a complete static header on `prime-proxy-anthropic` combining `fine-grained-tool-streaming-2025-05-14` and `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA`, which is deterministic and safe for the enforced adaptive `opus-5` and `sonnet-5` model IDs.
4. **Skill Link Localization:** Resolves the whole-directory skill collision boundary by vendoring `final-reviewer-prompt.md` directly inside `agent-home/skills/subagent-driven-development/`, eliminating broken relative links to external packages.
5. **Council Governance & Falsifiability:** Extends the sealed Sol baseline protocol to every gate (task, spec, and whole-branch), records cross-run performance in `<kit>/.state/policy-history.jsonl`, and defines explicit operator-supervised demotion criteria after three zero-contribution runs.
6. **Session & Worktree Topology:** Maintains a single authoritative worktree root for coordinator and child sessions, strict parent-scoped persistence, deny-by-default argument firewalling, and isolated environment precedence.

**Final Finding Counts:**
- **Blockers:** 0
- **Majors:** 0
- **Minors:** 0

**Disposition:** **Approved for implementation (SDD / TDD task breakdown).**

---

## 2. Round-4 Finding Closure Verification Matrix

| Prior ID | Reviewer & Topic | Round 5 Status | Verification & Concrete Grounding |
|---|---|---|---|
| `SOL-R4-B1` / `OPUS-R4-B3` | Sol & Opus: Request-time Anthropic beta union on body-only hook | **CLOSED** | Spec lines 209–210 explicitly acknowledge that Prime 0.8.1 provider hooks are body-only (`extensions/runner.ts:896-927`, `sdk.ts:286-306`). The kit registers a static Anthropic provider header with `fine-grained-tool-streaming-2025-05-14` plus `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA`. Because `supportsAdaptiveThinking` (`anthropic.ts:746-763`) is true for `opus-5` and `sonnet-5`, `needsInterleavedBeta` is false, making the static set complete and lossless. Wire-changing aliases are rejected and doctor verifies wire emissions. |
| `SOL-R4-M1` / `OPUS-R4-B1` | Sol & Opus: Pinned tarball is npm package; extract-only fails to produce runnable binary | **CLOSED** | Spec lines 61–63, 83–91 define `toolchain/package.json`, committed `package-lock.json`, and `toolchain/SHA256SUMS`. Bootstrap runs `npm ci` in `toolchain/`, resolving internal and external runtime dependencies (`undici`, `koffi`, etc.) into `<kit>/toolchain/node_modules/`, and executes the resulting absolute binary `<kit>/toolchain/node_modules/.bin/prime-agent` with `--version` 0.8.1 gating before credentials enter the process. |
| `OPUS-R4-B2` | Opus: `.mjs` extension file skipped during directory discovery | **CLOSED** | Spec line 66 renames extension to `agent-home/extensions/prime-superpowers.js`. Prime 0.8.1 `loader.ts:464-466` `isExtensionFile` accepts only `.ts` and `.js`. Directory discovery in `discoverAndLoadExtensions` (`loader.ts:574-576`) scans `<agentDir>/extensions/` and loads `.js` files via ESM dynamic import. |
| `OPUS-R4-M1` | Opus: Supply-chain pin omits 3 internal deps and registry closure | **CLOSED** | Spec lines 83–91 and manifest layout pin the integrity hashes of the full dependency tree via `package-lock.json` and record the published SHA-256 for all four release tarballs (`prime-agent`, `prime-agent-ai`, `prime-agent-core`, `prime-agent-tui`). Mutated R2 or registry artifacts fail npm integrity validation on `npm ci`. |
| `OPUS-R4-M2` | Opus: SDD override broken cross-skill link to external `code-reviewer.md` | **CLOSED** | Spec lines 73, 94 localize the final reviewer prompt as `agent-home/skills/subagent-driven-development/final-reviewer-prompt.md` (copied with SHA-256 provenance from `requesting-code-review/code-reviewer.md`). Replaces the `../requesting-code-review/` link so all references remain strictly within the self-contained overriding skill directory. Line 245 verifies relative link resolution. |
| `OPUS-R4-M3` | Opus: Council falsifiability missing at per-task gates; no cross-run storage | **CLOSED** | Spec lines 118–120 mandate primary reviewer sealing at *every* gate (not just spec/final), track unique accepted material findings per seat, persist cross-run statistics in `<kit>/.state/policy-history.jsonl`, and trigger operator-supervised demotion recommendations after 3 zero-contribution runs. |
| `OPUS-R4-N1` | Opus: Name machine-readable session query observable | **CLOSED** | Spec line 96 defines durable session query semantics matching Prime's CLI session registry (`list --all --json` / `status --json`). |
| `OPUS-R4-N2` | Opus: Host tool dependencies vs bootstrap | **CLOSED** | Spec line 226 clarifies that worker contracts use native `bash()` and host tools (`rg`, `git`, `python3`), with doctor verifying environment readiness. |
| `OPUS-R4-N3` | Opus: Pinned git package integrity check | **CLOSED** | Spec lines 92, 245 require doctor verification of Superpowers checkout commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`. |
| `OPUS-R4-N4` | Opus: Shorthand `--model <selector>:<level>` syntax citation | **CLOSED** | Spec line 40 cites standard Prime `<model>:<level>` notation (`prime-proxy-openai/${PRIME_MODEL_SOL:-gpt-5.6-sol}:max`). |
| `OPUS-R4-N5` | Opus: Firewall `-p`/`--print` argument consumption | **CLOSED** | Spec line 215 explicitly bounds `-p`/`--print` and file argument consumption. |

---

## 3. In-Depth Focus-Area Audits

### 3.1. Toolchain Materialization & Release Provenance
- **Contract:** Pinned `toolchain/package.json` referencing official `prime-agent-0.8.1.tgz` release URL, committed `package-lock.json`, and published `toolchain/SHA256SUMS` for all four Prime artifacts:
  - `prime-agent-0.8.1.tgz`: `46c24db1782dd31adc35d5c6cbcc75564faba6ced3bf2ccf03d836ee77134475`
  - `prime-agent-ai-0.8.1.tgz`: `f6c3bdb6093bc24a327546fe865ef9a4a172c734fcd4c4093e30c19476f0134d`
  - `prime-agent-core-0.8.1.tgz`: `0cc3660953545f8ac9a7e704fcb9875f954d58c3085304080ef615c280aa5748`
  - `prime-agent-tui-0.8.1.tgz`: `bd07bccee0ca495565b1d62e9411f3fdebe49e3dfa52870564f08af5e61fde15`
- **Verification against Prime 0.8.1 Release:**
  - `prime-agent` v0.8.1 bundles runtime entry point `dist/bundle/cli.js` with external dependencies (`undici`, `koffi`, `@silvia-odwyer/photon-node`, `@mariozechner/clipboard`). Running `npm ci` in `toolchain/` creates the local `node_modules` hierarchy, installs dependencies, and links `<kit>/toolchain/node_modules/.bin/prime-agent`.
  - The lockfile provides cryptographic sha512/sha256 integrity for both external npm registry packages and R2-hosted subpackages.
  - Executing `<kit>/toolchain/node_modules/.bin/prime-agent --version` verifies 0.8.1 in a completely uncredentialed environment.
- **Audit Verdict:** Sound and fully verified.

### 3.2. Extension Discovery & Loader Compliance
- **Contract:** Global kit extension located at `<kit>/agent-home/extensions/prime-superpowers.js` (lines 66, 288).
- **Verification against Prime 0.8.1:**
  - In `prime-agent/packages/coding-agent/src/core/extensions/loader.ts:464-466`:
    ```typescript
    function isExtensionFile(name: string): boolean {
      return name.endsWith(".ts") || name.endsWith(".js");
    }
    ```
  - In `loader.ts:574-576`: `discoverAndLoadExtensions` scans `path.join(agentDir, "extensions")`.
  - When the launcher exports `PRIME_AGENT_CODING_AGENT_DIR=<kit>/agent-home`, Prime sets `agentDir` to `<kit>/agent-home` and scans `<kit>/agent-home/extensions/`.
  - `prime-superpowers.js` matches `isExtensionFile` and is loaded cleanly as an ESM module without error.
- **Audit Verdict:** Sound and fully verified.

### 3.3. Provider Headers, URL Roots & Static Beta Set
- **Contract:** Three distinct proxy providers (`prime-proxy-openai`, `prime-proxy-anthropic`, `prime-proxy-google`) mapped to `${PRIME_BASE_URL}/v1`, `${PRIME_BASE_URL}`, and `${PRIME_BASE_URL}/v1beta` respectively (lines 49–51, 124–128). Static Anthropic provider header containing `fine-grained-tool-streaming-2025-05-14` and `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA` (lines 209–210).
- **Verification against Prime 0.8.1:**
  - OpenAI Responses provider (`openai-responses.ts:210-215`) appends `/chat/completions` or `/responses` to `baseURL`, matching `${PRIME_BASE_URL}/v1`.
  - Anthropic Messages provider (`anthropic.ts:928-941`) passes `baseURL: model.baseUrl` to `@anthropic-ai/sdk`, which automatically appends `/v1/messages`.
  - Google Generative AI provider (`google.ts:328-332`) sets `apiVersion = ""` for custom `baseUrl`, requiring the version prefix (`/v1beta`) in `PRIME_GOOGLE_BASE_URL`.
  - In `anthropic.ts:868-879,932-940`, client headers are merged using `mergeHeaders({ ... }, model.headers, optionsHeaders)`. Placing `"anthropic-beta": "fine-grained-tool-streaming-2025-05-14,extended-cache-ttl-2025-04-11"` in `model.headers` replaces the default client header.
  - Because `supportsAdaptiveThinking` (`anthropic.ts:746-763`) returns `true` for `opus-5` and `sonnet-5`, `needsInterleavedBeta` (`anthropic.ts:853`) is false. Thus no other beta tokens are generated by Prime. The static header represents 100% of the required beta tokens without loss.
  - Restricting model IDs to the exact token family (`opus-5`, `sonnet-5`) prevents non-adaptive models from being misconfigured.
- **Audit Verdict:** Sound and fully verified.

### 3.4. Skill Collisions, Vendoring & Relative Link Integrity
- **Contract:** Pinned package `git:github.com/obra/superpowers@v6.3.0` in `settings.json`. Two overriding skills in `agent-home/skills/` (`using-superpowers` and `subagent-driven-development`) vendor their sibling templates, scripts, and safe references; `final-reviewer-prompt.md` is localized inside `subagent-driven-development/` (lines 67–74, 94).
- **Verification against Prime 0.8.1 & Superpowers v6.3.0:**
  - In `skills.ts:513-566`, Prime indexes skills by name, giving `user-auto` precedence over `package` and dropping the shadowed package directory as a single whole unit.
  - Localizing `final-reviewer-prompt.md` into `agent-home/skills/subagent-driven-development/` ensures all links inside `subagent-driven-development/SKILL.md` resolve to files within the same directory.
  - Incompatible `pi-tools.md` is excluded, preventing obsolete Pi tool references. Non-colliding skills (`brainstorming`, `systematic-debugging`, `executing-plans`, etc.) load from the package.
  - Doctor and unit tests assert existence and SHA-256 provenance of all vendored files (line 245).
- **Audit Verdict:** Sound and fully verified.

### 3.5. Session & Worktree Topology
- **Contract:** Target worktree and run branch are created/validated before Prime Agent starts. The launcher changes to `WORKTREE_ROOT` before executing Prime. Mandatory persistence (`--no-session` denied). Run record tracks session ID. Detach/reattach operates via kit wrapper `./prime attach` (lines 30, 36–38, 86, 146, 168).
- **Verification against Prime 0.8.1:**
  - `agent-session-runtime.ts:313-325` initializes `sessionManager.getCwd()` from process cwd. Because the launcher executes `cd WORKTREE_ROOT` before exec, the coordinator session cwd is `WORKTREE_ROOT`.
  - Child RLM sessions inherit the parent session cwd, and the worker dispatch contract enforces an explicit `os.chdir(worktree_root)` in Python.
  - Subagent registry in `session-manager.ts` and `rlm-runtime.ts` is scoped to the parent session. Reattaching to the recorded parent session ID preserves the child registry across disconnects.
  - If parent transcript is destroyed, run transitions fail-closed to `orphaned`, preventing duplicate concurrent runs.
- **Audit Verdict:** Sound and fully verified.

### 3.6. CLI Portability, Argument Firewall & Environment Isolation
- **Contract:** `./prime` POSIX script (macOS/Linux/WSL) and `prime.cmd` (WSL forwarder). Argument firewall places internal `--model` first, rejects public commands (`agents`, `attach`, `schedule`, `shutdown`, `package`, `session`, `config`), unknown flags, short aliases, and mode overrides. Non-executing `.env` parser with strict precedence and protected variable locking (lines 199, 211–215, 230).
- **Verification against Prime 0.8.1:**
  - Prime's `public-command.ts:39-56` evaluates `args[0]`. Placing `--model prime-proxy-openai/...:max` at `args[0]` prevents user prompt text from triggering public command routing.
  - Denying command names in user positionals provides defense-in-depth against prompt injection.
  - Protected controls (`PRIME_AGENT_CODING_AGENT_DIR`, toolchain paths, `PI_CACHE_RETENTION`, lock paths) cannot be overridden by target `.env` files.
- **Audit Verdict:** Sound and fully verified.

### 3.7. Multi-Model Governance & Cross-Run Falsifiability
- **Contract:** Role-specific model policy (Sol, Opus, Gemini, Terra, Sonnet). Hard admissions ceilings (20 discovery/spec, 12 per task, 80 per run) with operator stop. Sealed primary reviewer baseline at every review gate. Cross-run persistence in `<kit>/.state/policy-history.jsonl`. Operator-approved demotion after 3 zero-contribution runs (lines 100–120).
- **Verification against Superpowers & Quality Standards:**
  - Sealing findings before cross-family reviewers run provides rigorous, unpolluted measurement of each seat's unique contributions.
  - Retaining per-seat admissions, usage, latency, and unique accepted material findings across runs transforms multi-model review from ritual to empirical governance.
  - Severity taxonomy mapping (Blocker, Major, Minor; Critical→Blocker, Important→Major; failed spec verdict→Major; cannot-verify→coordinator-owned→Major if confirmed) prevents finding deflation.
  - Severity downgrades and `Settled` rulings require concurrence from a fresh cross-family reviewer.
- **Audit Verdict:** Sound and fully verified.

---

## 4. Comprehensive Historical Finding Resolution Matrix (Rounds 1–4)

| Finding ID | Reviewer | Core Topic | Final Status in Round 5 |
|---|---|---|---|
| `SOL-R1-1` / `OPUS-R1-1` | Sol & Opus | Agent-home vs target repository config collision | **Resolved** (`PRIME_AGENT_CODING_AGENT_DIR` isolation) |
| `SOL-R1-2` / `OPUS-R1-2` | Sol & Opus | Provider proxy overriding built-ins vs unique proxy IDs | **Resolved** (`prime-proxy-*` unique provider IDs) |
| `SOL-R1-3` / `GEMINI-R1-1` | Sol & Gemini | Endpoint path conventions (`/v1`, bare, `/v1beta`) | **Resolved** (Exact native base URL derivations) |
| `SOL-R1-4` / `OPUS-R1-4` | Sol & Opus | Worktree cwd and single git context | **Resolved** (Launcher pre-creates worktree & chdir) |
| `OPUS-R1-5` / `GEMINI-R1-2` | Opus & Gemini | RLM child depth / grandchild prevention | **Resolved** (`rlmMaxDepth: 1` in isolated settings) |
| `SOL-R1-6` / `GEMINI-R1-3` | Sol & Gemini | Red-green TDD contract and machine-readable evidence | **Resolved** (Explicit TDD red/green capture rules) |
| `SOL-R2-1` / `OPUS-R2-1` | Sol & Opus | Child timeout / deadline & cancellation confirmation | **Resolved** (Hard role deadlines & tombstone checks) |
| `SOL-R2-2` / `OPUS-R2-2` | Sol & Opus | CLI argument firewall allowlisting vs injection | **Resolved** (Deny-by-default CLI argument firewall) |
| `SOL-R2-3` / `GEMINI-R2-1` | Sol & Gemini | Thinking map levels (7-level truth table) | **Resolved** (Seven-level explicit provider table) |
| `SOL-R2-4` | Sol | Bearer vs native authentication modes | **Resolved** (`PRIME_PROXY_AUTH_MODE` bearer/native) |
| `SOL-R2-5` / `GEMINI-R2-2` | Sol & Gemini | Environment precedence and protected controls | **Resolved** (Strict non-executing parser & locked vars) |
| `SOL-R3-B1` | Sol | Detached launch / child registry recovery on same parent | **Resolved** (Mandatory persistence; exact parent attach) |
| `SOL-R3-B2` / `OPUS-R3-B1` | Sol & Opus | Missing npm package vs GitHub release tarball | **Resolved** (Official GitHub release tarball pinned) |
| `SOL-R3-M1` | Sol | Auth strategy contradiction (explicit-header vs bearer) | **Resolved** (Removed explicit-header; bearer/native only) |
| `SOL-R3-M2` / `OPUS-R3-M6` | Sol & Opus | Model aliases and Anthropic adaptive/budget path | **Resolved** (Fixed role profiles; wire token checks) |
| `OPUS-R3-B2` | Opus | Launcher chdir vs target checkout worktree | **Resolved** (Launcher changes to worktree before start) |
| `OPUS-R3-B3` | Opus | Whole-directory skill collision & missing sibling assets | **Resolved** (Vendored siblings with SHA-256 hashes) |
| `OPUS-R3-B4` | Opus | CLI argument firewall positional routing to subcommands | **Resolved** (Internal `--model` placed at `argv[0]`) |
| `OPUS-R3-M1` | Opus | Thinking map `off` column parity | **Resolved** (OpenAI `none`, Anthropic `off`, Google `null`) |
| `OPUS-R3-M2` | Opus | Anthropic beta header clobbering | **Resolved** (Superseded by static header union) |
| `OPUS-R3-M3` | Opus | Process lock vs durable daemon session lifetime | **Resolved** (Durable run record tied to session state) |
| `OPUS-R3-M4` | Opus | Review taxonomy mapping & deferred Minors | **Resolved** (Blocker/Major/Minor canonical taxonomy) |
| `OPUS-R3-M5` | Opus | Severity downgrade concurrence | **Resolved** (Cross-family concurrence required) |
| `OPUS-R3-M7` | Opus | Council budget, admissions cap & falsifiability | **Resolved** (Admissions ceilings & sealed baseline) |
| `SOL-R4-B1` / `OPUS-R4-B3` | Sol & Opus | Request-time Anthropic beta union on body-only hook | **Resolved** (Complete static beta header on provider) |
| `SOL-R4-M1` / `OPUS-R4-B1` | Sol & Opus | Toolchain install from package tarball | **Resolved** (`toolchain/` with lockfile, `npm ci`, and `SHA256SUMS`) |
| `OPUS-R4-B2` | Opus | Extension discovery failure on `.mjs` | **Resolved** (Renamed to `prime-superpowers.js`) |
| `OPUS-R4-M1` | Opus | Supply chain integrity for 4 artifacts & deps | **Resolved** (4 tarball SHA-256s + lockfile integrity) |
| `OPUS-R4-M2` | Opus | SDD override broken cross-skill link | **Resolved** (Localized `final-reviewer-prompt.md`) |
| `OPUS-R4-M3` | Opus | Council falsifiability per-task control arm & history | **Resolved** (Sealed gates + `.state/policy-history.jsonl`) |

---

## 5. Conclusion & Final Approval

The specification `prime-superpowers/docs/specs/2026-08-26-prime-superpowers-design.md` has converged completely. All 30 cumulative findings across 5 rounds of review have been resolved and grounded in the concrete behavior of Prime Agent 0.8.1 and Superpowers v6.3.0.

- **Blocker Count:** 0  
- **Major Count:** 0  
- **Minor Count:** 0  

**Verdict:** **APPROVED — ZERO BLOCKERS, ZERO MAJORS.**  
The design is finalized, robust, and ready to advance immediately to implementation and task breakdown (SDD / TDD).
