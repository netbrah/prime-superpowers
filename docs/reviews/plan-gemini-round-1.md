# Implementation Plan Review — Round 1 (Gemini Seat)

- **Artifact:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`
- **Artifact state:** 306 lines, md5 `a65a266395ec1dfba277889dcba2d708`, header `Status: draft`
- **Design source:** `docs/specs/2026-08-26-prime-superpowers-design.md` (298 lines, round 5/6 incorporated)
- **Runtime baseline:** Prime Agent `0.8.1` source at `bc0fa7606abb3b7af0f765319518d255e6ae553d`, Superpowers `v6.3.0` at `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`
- **Review date:** 2026-08-27
- **Seat:** Gemini (independent context, blind-spot, and portability reviewer; read-only — no spec, product, or test file was edited by this review)
- **Scope:** Complete task breakdown audit focusing on provider wire tests, portability, dependency/task sequencing, context/fixture scale, exact paths, and cross-platform edge cases.
- **Verdict:** **2 Majors, 6 Minors** (0 Blockers)

---

## Severity Rubric

- **Blocker:** An unresolvable architectural contradiction or defect that prevents plan execution or violates the core security/safety boundary.
- **Major:** A defect in task sequencing, gate definitions, cross-platform execution, or wire testing that causes deterministic test failure, false gate passage, or broken runtime contracts.
- **Minor:** Ambiguities in path resolution, fixture sizing, error diagnostics, or naming consistency that should be tightened before implementation.

---

## Findings Summary

| ID | Severity | Category | Summary |
|---|---|---|---|
| **GEMINI-PLAN-M1** | **Major** | Sequencing / Gates | Common Gate `bash -n prime scripts/* tests/*.sh` fails deterministically on Tasks 1–3 before `prime` is created |
| **GEMINI-PLAN-M2** | **Major** | Toolchain / Gates | `npm test --prefix toolchain` common gate fails because `toolchain/package.json` test script is unspecified |
| **GEMINI-PLAN-N1** | **Minor** | Path Consistency | Test file naming mismatch: plan `tests/config.test.mjs` vs design layout `tests/provider-config.test.mjs` |
| **GEMINI-PLAN-N2** | **Minor** | Portability | `prime.cmd` batch script syntax and WSL forwarding behavior lack automated validation |
| **GEMINI-PLAN-N3** | **Minor** | Wire Tests / Concurrency | Mock HTTP servers in `tests/wire-probe.test.mjs` must explicitly bind to ephemeral port 0 |
| **GEMINI-PLAN-N4** | **Minor** | Doctor / CI Safety | Static `scripts/doctor` in CI must distinguish missing repo assets from missing proxy credentials |
| **GEMINI-PLAN-N5** | **Minor** | Cross-Platform ESM | Dynamic import of `lib/config.mjs` inside `agent-home/extensions/prime-superpowers.js` must handle Windows file URLs |
| **GEMINI-PLAN-N6** | **Minor** | Fixture Scale / Permissions | Executable bit (`chmod +x`) verification for vendored scripts under `agent-home/skills/` needs explicit assertion |

---

## Detailed Major Findings

### GEMINI-PLAN-M1: Common Gate `bash -n prime ...` fails deterministically on Tasks 1–3

- **Location:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, lines 18–28 (Section *Common gates*).
- **Evidence:**
  Lines 20–25 specify:
  ```bash
  bash -n prime scripts/* tests/*.sh
  npm test --prefix toolchain
  node --test tests/*.test.mjs
  bash tests/test-package.sh
  ```
  In Task 1 (lines 29–62), Task 2 (lines 63–98), and Task 3 (lines 99–132), the executable `prime` does not exist on disk. It is introduced only in Task 4 (lines 137–140: `Create prime, prime.cmd, lib/launcher.mjs`).
  When bash executes `bash -n prime scripts/* tests/*.sh` on a literal unquoted filename `prime` that does not exist, bash immediately halts with an error:
  `bash: prime: No such file or directory` (exit code 127 or 2).
  Line 27 states: *"Commands for files not yet introduced may report the plan-defined expected absence only in the task that introduces them. After that task, absence is a failure."*
  However, `bash -n` is an atomic shell invocation; bash does not possess custom logic to catch `ENOENT` on positional arguments and report a "plan-defined expected absence." It simply exits non-zero, causing the common gate to fail on Tasks 1, 2, and 3.
- **Concrete Failure:**
  The workflow worker cannot pass the mandatory common gates for Tasks 1, 2, and 3, halting the TDD loop before running `tests/toolchain.test.mjs`, `tests/config.test.mjs`, or `tests/extension.test.mjs`.
- **Correction:**
  Make the syntax gate file list dynamic or conditional on file existence during Tasks 1–3, or qualify the gate per task:
  ```bash
  bash -n $([ -f prime ] && echo prime) scripts/* tests/*.sh
  ```
  Alternatively, explicitly state that in Tasks 1–3 the syntax gate runs `bash -n scripts/* tests/*.sh`, and adds `prime` from Task 4 onwards.

---

### GEMINI-PLAN-M2: Common Gate `npm test --prefix toolchain` fails due to unspecified test script

- **Location:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, line 22 (*Common gates*) and Task 1 (lines 33–53).
- **Evidence:**
  Line 22 mandates executing `npm test --prefix toolchain` as part of the Common Gates run on *every* task.
  Task 1 specifies creating `toolchain/package.json` and `toolchain/package-lock.json` with dependency on `prime-agent-0.8.1.tgz`.
  However, Task 1 does not specify what script is placed under `"scripts": { "test": "..." }` in `toolchain/package.json`. By default, an unconfigured npm manifest either lacks a `test` script (yielding `npm ERR! Missing script: "test"`, exit code 1) or has the default `npm init` stub (`echo "Error: no test specified" && exit 1`, exit code 1).
- **Concrete Failure:**
  Any execution of `npm test --prefix toolchain` in the common gate will exit with status 1 on Task 1 and every subsequent task unless `toolchain/package.json` explicitly defines a passing test command.
- **Correction:**
  Explicitly specify in Task 1 that `toolchain/package.json` defines a functional test script (for example, `"test": "node --test ../tests/toolchain.test.mjs"` or a verification script that checks `node_modules/.bin/prime-agent --version`), or update the Common Gates to rely on `node --test tests/*.test.mjs` for testing toolchain invariants.

---

## Detailed Minor Findings

### GEMINI-PLAN-N1: Test file naming mismatch between plan and accepted design layout

- **Location:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, Task 2 (lines 70, 75, 94) vs `docs/specs/2026-08-26-prime-superpowers-design.md`, line 77.
- **Evidence:**
  Design line 77 lists `tests/provider-config.test.mjs` in the official repository layout.
  Task 2 of the implementation plan names the file `tests/config.test.mjs`.
- **Concrete Failure:**
  In Task 8, `bash tests/test-package.sh` checks the package structure against the design layout. If it checks for `tests/provider-config.test.mjs`, it will fail unless `tests/config.test.mjs` is harmonized.
- **Correction:**
  Harmonize the test file name across the design and implementation plan (preferably `tests/config.test.mjs` or `tests/provider-config.test.mjs`) so that package layout validation passes cleanly.

---

### GEMINI-PLAN-N2: Windows wrapper (`prime.cmd`) syntax and execution testing missing

- **Location:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, Task 4 (lines 137–167) and Task 8 (lines 280–303).
- **Evidence:**
  Task 4 creates `prime.cmd` for Windows users. Design line 230 specifies: *"POSIX shells on macOS, Linux, and WSL are the primary supported launcher environment; `prime.cmd` forwards Windows users to WSL with a clear diagnostic."*
  However, `bash -n` does not validate `.cmd` syntax, and `tests/launcher.test.mjs` only specifies testing the shell launcher and Node modules.
- **Concrete Failure:**
  Syntax errors, improper argument escaping (`%*`), or invalid errorlevel exits in `prime.cmd` would escape CI on Linux/macOS and only surface when executed by a Windows operator.
- **Correction:**
  Add a dedicated unit test in `tests/launcher.test.mjs` that inspects `prime.cmd` content to assert proper batch syntax, correct WSL invocation (`wsl.exe ./prime %*`), and clear error diagnostic messaging when WSL is unavailable.

---

### GEMINI-PLAN-N3: Mock HTTP servers in `tests/wire-probe.test.mjs` must explicitly bind to ephemeral port 0

- **Location:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, Task 6 (lines 213, 218, 226–228, 233).
- **Evidence:**
  Task 6 runs `node --test tests/doctor.test.mjs tests/wire-probe.test.mjs` to capture OpenAI Responses (`/v1/responses`), Anthropic Messages (`/v1/messages`), and Google (`/v1beta/models/...`) wire requests.
  Node's native test runner (`node --test`) executes test suites with concurrency. If mock HTTP servers use hardcoded port numbers, test runs will encounter intermittent `EADDRINUSE` failures.
- **Concrete Failure:**
  Parallel test runs fail nondeterministically in local environments or CI.
- **Correction:**
  In Task 6 green behavior and acceptance, explicitly require mock servers in `tests/wire-probe.test.mjs` to listen on `127.0.0.1:0` (ephemeral port), retrieve `server.address().port`, and pass `http://127.0.0.1:${port}` as the dynamic `PRIME_BASE_URL`.

---

### GEMINI-PLAN-N4: Static `scripts/doctor` in CI must distinguish missing repo assets from missing proxy credentials

- **Location:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, Task 6 (lines 234–237) and Task 8 (lines 294–303).
- **Evidence:**
  Task 6 Acceptance runs `scripts/doctor` directly.
  Task 8 states CI runs tests *without secrets*.
  Static doctor checks runtime, toolchain, extension discovery, settings, skills, environment, selector uniqueness, paths, auth mode, and protected variables.
  If static `scripts/doctor` exits non-zero whenever `PRIME_LLM_KEY` is not exported in the environment, running `scripts/doctor` as an acceptance step or CI step without secrets will fail.
- **Concrete Failure:**
  CI runners or local developers verifying repository health without exporting real credentials will fail the static doctor gate.
- **Correction:**
  Specify that static `scripts/doctor` (when run without `--live`) treats missing credentials as a diagnostic notice/warning (or passes when testing against a dummy fixture), reserving exit code 1 for structural repository/runtime failures or when `--live` is explicitly requested without credentials.

---

### GEMINI-PLAN-N5: Dynamic import of `lib/config.mjs` inside `agent-home/extensions/prime-superpowers.js` must handle Windows file URLs

- **Location:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, Task 3 (lines 105, 119–120).
- **Evidence:**
  `agent-home/extensions/prime-superpowers.js` is loaded dynamically by Prime Agent 0.8.1. It imports pure configuration logic from `lib/config.mjs`.
  On Windows systems or when resolving absolute paths across directories, Node's ESM `import()` fails on raw Windows backslash paths (e.g., `import('C:\\...')` throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`).
- **Concrete Failure:**
  If the extension uses `path.resolve` without `url.pathToFileURL`, extension discovery and registration crash on Windows/WSL cross-drive mounts.
- **Correction:**
  In Task 3, specify that `prime-superpowers.js` uses relative specifiers (`../../lib/config.mjs`) or `url.pathToFileURL(path.resolve(...)).href` when importing `lib/config.mjs`.

---

### GEMINI-PLAN-N6: Executable bit (`chmod +x`) verification for vendored scripts under `agent-home/skills/` needs explicit assertion

- **Location:** `docs/specs/2026-08-26-prime-superpowers-implementation-plan.md`, Task 5 (lines 175, 201).
- **Evidence:**
  Task 5 vendors sibling scripts into `agent-home/skills/subagent-driven-development/scripts/` (e.g. `sdd-workspace`).
  Design line 235 requires validating "executable bits" on scripts.
  Task 5 acceptance runs `bash agent-home/skills/subagent-driven-development/scripts/sdd-workspace --help`.
  Invoking via `bash script` masks missing executable permissions (`+x`) on the script itself.
- **Concrete Failure:**
  When subagents or external tools invoke `./sdd-workspace` directly without the `bash` prefix, execution fails with `EACCES (Permission denied)` if the git file mode is `100644` instead of `100755`.
- **Correction:**
  In Task 5 `tests/skills.test.mjs`, add an explicit assertion checking `(fs.statSync(scriptPath).mode & 0o111) !== 0` for all scripts in `scripts/` and `agent-home/skills/.../scripts/`.

---

## Focus Area Analysis

### 1. Provider Wire Tests & Mocking Fidelity (Tasks 2, 6)
- **OpenAI Responses:** Verified that `packages/ai/src/providers/openai-responses.ts` calls `POST /v1/responses` with `prompt_cache_retention: "24h"` when `PI_CACHE_RETENTION=long` and `compat.supportsLongCacheRetention: true`. Reasoning map `off` emits `{ effort: "none" }`. Task 2 and Task 6 specifications align with this wire shape.
- **Anthropic Messages:** Verified that `packages/ai/src/providers/anthropic.ts` appends `/v1/messages` to the base URL, sets `cache_control: { type: "ephemeral", ttl: "1h" }`, marks tools `eager_input_streaming: true`, and omits fine-grained / interleaved beta headers for adaptive `opus-5`/`sonnet-5`. Static provider header contains only `PRIME_ANTHROPIC_EXTENDED_CACHE_BETA`. Task 2/6 tests properly capture both headers and body payloads.
- **Google Generative AI:** Verified that `packages/ai/src/providers/google.ts` calls `/v1beta/models/...` with thinking levels `LOW` and `HIGH`. Task 2/6 specs match.

### 2. Dependency & Task Sequencing
- Task 1 to Task 8 ordering is logical: Toolchain Skeleton -> Config -> Extension -> Launcher -> Skills -> Doctor/Wire Probes -> E2E Lifecycle -> Final Verification & Documentation.
- As identified in **GEMINI-PLAN-M1** and **GEMINI-PLAN-M2**, Common Gates must be adjusted so they do not execute non-existent files (`prime`) or unconfigured scripts (`npm test --prefix toolchain`) during Tasks 1–3.

### 3. Context & Fixture Scale
- Fixture requirements across tasks are bounded and decoupled from network access:
  - Task 1: Synthesized old-Node versions and lockfiles.
  - Task 2: Pure `.env` string fixtures and provider record tables.
  - Task 3: Extension harness mocks.
  - Task 4: Lightweight fake git/Prime mock executables.
  - Task 6: Local loopback mock HTTP servers (using ephemeral ports per **GEMINI-PLAN-N3**).
  - Task 7: Temporary local git repositories with minimal commit histories.
- All tests execute offline without requiring external API calls or real proxy secrets.

---

## Verdict

- **Blockers:** 0
- **Majors:** 2 (**GEMINI-PLAN-M1**, **GEMINI-PLAN-M2**)
- **Minors:** 6 (**GEMINI-PLAN-N1** through **GEMINI-PLAN-N6**)

The implementation plan is structurally sound and adheres closely to the accepted design in `2026-08-26-prime-superpowers-design.md`. Resolving the 2 Majors (Common Gate bash execution on non-existent `prime` in Tasks 1–3, and the `toolchain/package.json` test script specification) will ensure a seamless, non-failing TDD workflow from Task 1 through Task 8.
