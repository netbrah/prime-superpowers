# Adapting Superpowers to Prime Agent — findings and proposed design

Read-only inspection. No files were edited.

Sources inspected:
- `/home/user/workspace/superpowers` (v6.3.0 — `package.json`)
- `/home/user/workspace/prime-agent` (`prime-agent` 0.8.1, `packages/coding-agent` = `@earendil-works/pi-coding-agent` 0.8.1, `prime-agent-runtime/src/rlm/`)

---

## 1. Bottom line

| Question | Answer |
|---|---|
| Does `pi install git:github.com/obra/superpowers` work? | **No.** The literal command fails. The equivalent that *does* work is `prime-agent package install git:github.com/obra/superpowers`. |
| Will the upstream Pi package load in Prime Agent at all? | **Yes, mechanically.** Prime Agent is a fork of the Pi coding agent and still reads the `pi` manifest key, so `pi.extensions` + `pi.skills` from Superpowers' `package.json` are honored, and every extension event the Superpowers extension subscribes to exists. |
| Is loading it enough? | **No.** The extension injects a *Pi* tool mapping that is wrong for Prime Agent and actively tells the model that subagents may not exist. On Prime Agent that mapping is the single biggest behavioral regression. |
| Recommended shape | **Install upstream unmodified as a git package (pinned), then add a thin project-local `.prime/agent/skills/` adapter layer that overrides only the harness-coupling surface** (`using-superpowers` bootstrap + tool mapping + an SDD dispatch contract skill). Do not vendor or fork the skill bodies. |

---

## 2. Install path: exact facts

### `pi install` is a removed command
`packages/coding-agent/src/cli/public-command.ts:210-211`:

```ts
} else if (command === "install") {
    replacement = 'Use "prime-agent package install".';
```

and `src/cli/command-registry.ts:185`:

```ts
export const REMOVED_COMMAND_NAMES = new Set(["app", "daemon", "install", "manage", "remove", "uninstall"]);
```

The registered path is `["package", "install"]` with usage `package install <source> [--local]` (`command-registry.ts:128-129`).

Note the naming trap: the npm `bin` is still literally `pi` (`packages/coding-agent/package.json` → `"bin": {"pi": "dist/bundle/cli.js"}`), while `install.sh` installs the launcher as `prime-agent` (`prime_agent_cmd="${PRIME_AGENT_CMD:-prime-agent}"`). So `pi` may exist on PATH, but `pi install …` still hits the removed-command error. `piConfig` sets `name: prime-agent`, `configDir: .prime/agent`.

### Working install forms (from `packages/coding-agent/docs/packages.md`)

```bash
# global (writes ~/.prime/agent/settings.json)
prime-agent package install git:github.com/obra/superpowers

# project-scoped, committable, auto-installed on startup for teammates
prime-agent package install git:github.com/obra/superpowers --local

# pinned to a ref (skipped by `package update`) — recommended
prime-agent package install git:github.com/obra/superpowers@v6.3.0 --local

# throwaway trial / local checkout, current run only
prime-agent -e git:github.com/obra/superpowers
prime-agent -e /path/to/superpowers
```

Git packages clone to `.prime/agent/git/<host>/<path>` (project) or `~/.prime/agent/git/…` (global) and run `npm install` after clone. Superpowers declares no `dependencies`, so nothing is fetched and the `@earendil-works/pi-coding-agent` import in the extension is type-only (erased by jiti) — no peer-dependency breakage.

### The manifest is honored
`superpowers/package.json`:

```json
"pi": { "extensions": ["./.pi/extensions/superpowers.ts"], "skills": ["./skills"] }
```

`docs/packages.md` states Prime Agent packages "declare resources in `package.json` under the `pi` key" for compatibility with the inherited extension ecosystem. Convention dirs (`skills/`, `extensions/`) are also auto-discovered.

### Every extension hook Superpowers uses exists
`.pi/extensions/superpowers.ts` subscribes to `resources_discover`, `session_start`, `session_compact`, `agent_end`, `context`. All five are present in the fork:
- `resources_discover` returning `{ skillPaths }` — `src/core/extensions/types.ts:478-485,993`, consumed at `src/core/agent-session.ts:8643-8657`
- `session_start`, `session_before_compact`/`session_compact`, `agent_start`/`agent_end`, `context` — all documented sections of `packages/coding-agent/docs/extensions.md`

So the hard requirement from Superpowers' own porting guide ("automatic session-start injection, no per-session opt-in", `docs/porting-to-a-new-harness.md` Part 2) is satisfied on Prime Agent via the in-process extension shape.

---

## 3. Incompatibilities with Prime Agent / RLM

Ordered by severity.

### 3.1 Wrong tool vocabulary — the bootstrap teaches tools Prime Agent does not have (critical)

The extension appends `piToolMapping()` to the injected bootstrap, telling the model:

> "Pi's built-in coding tools are lowercase: `read`, `write`, `edit`, `bash`, plus optional `grep`, `find`, and `ls`."

Prime Agent's model-facing default tool surface is **one tool**:

```ts
// packages/coding-agent/src/core/tools/index.ts
export type ToolName = "ipython";
export function createAllToolDefinitions(cwd, options) {
    return { ipython: createIpythonToolDefinition(cwd, options?.ipython) };
}
```

`bash.ts` and `edit.ts` exist as definitions for extensions/other modes, but the RLM contract (`docs/rlm.md`, "Core Invariants #1: Execution is programmatic") is: reading/editing files, running commands, invoking skills and delegating all begin inside the persistent Python kernel — `Path.read_text()`, `await bash("npm run check")`, etc. A bootstrap that names `read`/`write`/`grep`/`ls` invites hallucinated tool calls on every session.

### 3.2 The bootstrap denies subagents that Prime Agent has natively (critical)

Injected text:

> "Pi does not ship a standard subagent tool. … If no subagent tool is available, do the work in this session or explain the missing capability instead of inventing `Task` calls."

Same in `skills/using-superpowers/references/pi-tools.md`. On Prime Agent this is factually wrong and it degrades exactly the skills the user cares about: `subagent-driven-development` and `dispatching-parallel-agents` will run inline instead of dispatching. Prime Agent's subagents are first-class:

```python
handle = await rlm("Implement Task 3 …", name="task-3-impl", model="anthropic/claude-…", thinking="high")
children = await rlm.list_subagents()
await agent_message.send(findings, receiver_role="child", receiver_name=handle.name)
models = await rlm.find_models("haiku")
await rlm.delete_subagent(handle)
```

(`prime-agent-runtime/src/rlm/__init__.py`; `docs/rlm.md`; `packages/coding-agent/skills/agent-message/SKILL.md`.)

### 3.3 Fire-and-forget dispatch vs. request/response review loop (structural)

SDD's loop is written as "dispatch → read the report → review → fix round → re-review". Prime Agent's `rlm()` **never returns the child's answer**: it returns an admission handle the moment the task is admitted; results arrive only through `agent_message.send(..., receiver_role="parent")` or through files (`docs/rlm.md` Core Invariant #2).

This is adaptable rather than fatal, and upstream SDD already anticipates it:
- SDD mandates file hand-off (`scripts/task-brief`, `scripts/review-package`, per-task report files) precisely so nothing large flows through the controller's context — a perfect fit for the RLM file-based result channel.
- SDD's "Waiting on dispatched subagents" section already forbids tight polling and prescribes bounded waits plus reconciliation ("list them, and chase any that finished without reporting") — which maps 1:1 onto `rlm.list_subagents()` plus `rlm_heartbeat.create(...)` (`packages/coding-agent/skills/rlm-heartbeat/SKILL.md`).

What must be added is an explicit **report contract** for Prime: every dispatched worker/reviewer must (a) write its artifact to the SDD workspace path given in its prompt, and (b) `await agent_message.send(<short status contract>, receiver_role="parent")` as its last act. Without (b) the controller has no completion signal at all.

### 3.4 Fix rounds 1–3 ("resume the original implementer") — supported, with a lifecycle caveat

`agent_message.send(..., receiver_role="child", receiver_name=…)` to an idle completed child "starts an ordinary follow-up turn in that same child session and context" — exactly SDD's resume semantics. Caveats to encode:
- Children remain addressable only while the parent session is open; do not `delete_subagent` a worker until its task is complete and reviewed (the agent-message skill's own Safety section says the same).
- `deliveryStatus` may be `queued`; `send` does not block.
- Reach is parent/siblings/direct children only — no grandchildren. Combined with 3.6 this means the controller must own every review seat, which is what SDD wants anyway.

### 3.5 `rlm()` accepts only three kwargs (constraint on review isolation)

`packages/coding-agent/src/core/agent-session.ts:10205-10212`:

```ts
const { name: rawName, model: rawModel, thinking: rawThinking, ...unsupported } = kwargs;
if (unsupportedKwargs.length > 0) throw new Error(`Unsupported rlm.run kwargs: …`);
```

So `name`, `model`, `thinking` only. The host *can* scope a child's tools (`allowedToolNames`, `activeToolNames`, `customTools`, `scopedModels` in `createRlmSubagentRuntime`), but none of it is reachable from Python. Consequences:
- **"Your review is read-only on this checkout"** cannot be enforced technically from a dispatch; it stays a prompt-level contract (as the upstream templates already write it). If hard enforcement is wanted, it needs a Prime extension registering a `tool_call` gate for reviewer-named sessions — optional future work, not required for parity.
- Children inherit the parent's **cwd** (`cwd: sessionManager.getCwd()` in `createRlmSubagentRuntime`). There is no per-child cwd. Worktree isolation therefore must come from the *controller's* cwd (start the session inside the worktree) — `using-git-worktrees` still works, but "Work from: [directory]" in the implementer template must be honored by the child via `os.chdir(...)` in its own kernel (each child has its own kernel, so this is safe).

### 3.6 Recursion depth: default lets workers spawn their own reviewers

`this._rlmDepth >= this._rlmMaxDepth` throws (`agent-session.ts:10214`); default `rlmMaxDepth` is **2** (`settings-manager.ts:136`: "unset falls through to `RLM_MAX_DEPTH`, then 2"). Root is depth 0, so with the default a *child* can still spawn a grandchild. SDD's "You Do Not Dispatch Subagents" contract (in both the implementer and reviewer templates) is prose-only under that default.

**Recommendation:** set `rlmMaxDepth: 1` in the project's `.prime/agent/settings.json` for SDD work. That converts the most expensive observed SDD failure mode (worker-spawned duplicate reviewers) from a prose rule into a hard error.

### 3.7 The bootstrap is injected into every child session (cost + behavior)

The `context` hook re-inserts the `<EXTREMELY_IMPORTANT>` bootstrap whenever `injectBootstrap` is true, and children are full runtimes created with the parent's `runtimeConfig` and a `session_start` event (`daemon-mode.ts` `createRlmSubagentRuntime`). Every implementer and reviewer therefore pays for the whole `using-superpowers` skill and is told to consider brainstorming/SDD.

Upstream's only defense is the `<SUBAGENT-STOP>` clause at the top of `using-superpowers/SKILL.md`, but the extension's wrapper text ("Follow it now") pulls the other way. The `context` event does not carry an is-subagent flag, so a Prime-native injector should decide from session metadata / `RLM_DEPTH` and skip injection for depth > 0 (or inject a 5-line worker-discipline preamble instead).

### 3.8 Skill-invocation semantics and namespacing (minor)

- Prime Agent has native skills per the Agent Skills spec and no Claude `Skill` tool. Skills load by reading `SKILL.md` from the kernel or via `/skill:<name>`; only descriptions sit in the system prompt (`docs/skills.md`). Superpowers' cross-references are written `superpowers:brainstorming` — on Prime the command is `/skill:brainstorming`. Worth one line in the tool mapping.
- Model invocation of skills is unreliable everywhere (`docs/skills.md`: "models don't always do this; use prompting or `/skill:name` to force it"), which matches the user's own note that *skill activation is miserable* and that a strong `AGENTS.md`/`CLAUDE.md` beats skill annotation. Prime Agent loads `AGENTS.md`/`CLAUDE.md` from cwd, ancestors and `~/.prime/agent/` (`src/core/resource-loader.ts:59`, `docs/usage.md:136`) — so the belt-and-braces path is bootstrap extension **plus** a short project `AGENTS.md` contract block.
- Superpowers' `hooks/hooks.json` (Claude `SessionStart`) and the `.claude-plugin`/`.codex-plugin`/`.opencode` trees are inert on Prime Agent. Harmless.
- `brainstorming/scripts/` ships a Node visual companion (`server.cjs`, `start-server.sh`) that fetches a Prime Radiant logo for telemetry; set `SUPERPOWERS_DISABLE_TELEMETRY=1` if that is unwanted (documented in the Superpowers README).
- The bash scripts (`sdd-workspace`, `task-brief`, `review-package`) are POSIX `bash` + `git` + `awk` only and run fine via `await bash(...)` in the kernel. `sdd-workspace`'s comment about Claude Code protecting `.git/` is irrelevant here but harmless.

### 3.9 What is *better* on Prime than on stock Pi

- **Multi-model is native and cheap to express.** SDD's Model Selection section ("Always specify the model explicitly when dispatching a subagent"; escalate one tier in fix rounds 4–5; final whole-branch review on the most capable model) maps directly onto `rlm(..., model="provider/id", thinking=...)`, with `rlm.find_models(query, limit)` for discovery against the user's live credentials. Stock Pi has no such surface.
- Durable coordination state: kernel variables survive compaction, the child registry survives kernel restart and parent restoration, `session_dir` artifacts persist — reinforcing SDD's ledger discipline rather than fighting it.
- Skill discovery follows symlinks and de-duplicates by real path (`src/core/skills.ts`: `entry.isSymbolicLink()` → `statSync`, plus `canonicalizePath` dedupe), and user/project skills are loaded **before** package/`--skill` paths so first-found wins. That gives clean overrides without forking.

---

## 4. Direct-install vs. project-local adapter

**Direct install alone: insufficient.** It works mechanically, but ships §3.1 and §3.2 into every session — wrong tool names and a false "no subagents here" claim.

**Vendoring/copying skills: rejected.** Upstream's contribution rules (`docs/porting-to-a-new-harness.md`, Part 1 rules 1–2 and `CLAUDE.md`) treat skill bodies as tuned behavior-shaping content: ports add a tool mapping and a bootstrap injector and never edit `skills/*/SKILL.md`. A vendored copy also forfeits `prime-agent package update`.

**Recommended: package + thin override layer.** Prime Agent's precedence order makes this a supported, non-invasive pattern:

```
loadSkills(): user (~/.prime/agent/skills) → project (.prime/agent/skills) → explicit paths (packages, --skill)
first name wins; identical real paths de-duplicate silently
```

So a project skill named `using-superpowers` shadows the package's copy, while all 15 other Superpowers skills continue to come from the pinned upstream clone. Symlinks are legal if you ever want to expose a subset by hand.

---

## 5. Proposed Prime-native adaptation

### 5.1 Layout

```
<repo>/
  AGENTS.md                              # short contract block: SDD gate + review gate (user prefers this over skill annotation)
  .prime/agent/
    settings.json                        # packages: git:…/superpowers@vX.Y.Z ; rlmMaxDepth: 1
    extensions/
      superpowers-prime.ts               # Prime-native bootstrap injector (replaces upstream's Pi one)
    skills/
      using-superpowers/SKILL.md         # override: upstream body + Prime platform-adaptation pointer
      prime-rlm-dispatch/SKILL.md        # NEW: the RLM dispatch/report/resume contract + model tiering
      # (nothing else — brainstorming, writing-plans, TDD, SDD, reviews all come from upstream)
```

`.prime/agent/settings.json` sketch:

```json
{
  "packages": [
    { "source": "git:github.com/obra/superpowers@v6.3.0", "extensions": [] }
  ],
  "rlmMaxDepth": 1,
  "enableSkillCommands": true
}
```

`"extensions": []` uses the documented package-filtering form (`docs/packages.md` → Package Filtering) to load Superpowers' **skills only** and suppress its Pi extension, so there is exactly one bootstrap injector and no contradictory tool mapping. Pinning to a tag makes `package update` skip it, so upstream text never changes under a running plan.

### 5.2 The Prime bootstrap injector (what it must do differently)

Same skeleton as upstream (`resources_discover` → package skills dir is already covered; `session_start`/`session_compact` set the flag; `context` inserts after any `compactionSummary`; `agent_end` clears it), with four changes:

1. **Skip injection for children.** If the session is an RLM subagent (depth > 0), inject nothing — or a ~5-line worker preamble: "you are a dispatched worker; ignore session-bootstrap workflows; write your artifact to the path you were given; end by `agent_message.send(..., receiver_role='parent')`; you do not dispatch subagents."
2. **Replace `piToolMapping()` with a Prime mapping** (see 5.3).
3. **Idempotence marker** kept, so a hand-run `/skill:using-superpowers` doesn't double-inject.
4. Optional: a `tool_call` gate that blocks working-tree mutation for sessions whose name matches the reviewer naming convention, since §3.5 makes read-only unenforceable from the dispatch itself.

### 5.3 Prime tool mapping (content of the override)

| Action a skill asks for | Prime Agent |
|---|---|
| invoke a skill | native skills; read the `SKILL.md` from the kernel, or `/skill:<name>` (unprefixed — not `superpowers:<name>`) |
| read / write / edit a file | inside `ipython`: `Path(...).read_text()`, `write_text()`, patch in Python. There is no `read`/`write`/`grep`/`ls` tool |
| run a shell command | `await bash("…")` in the kernel (own process per call; `os.chdir`/`os.environ` persist) |
| dispatch a subagent | `await rlm(prompt, name=…, model=…, thinking=…)` → admission handle only; results arrive by file + `agent_message` |
| choose a model per role | `await rlm.find_models("haiku")` → pass `model="provider/id"`; always explicit (SDD Model Selection) |
| send findings to a live worker | `await agent_message.send(text, receiver_role="child", receiver_name=handle.name)` (resumes its context = SDD fix rounds 1–3) |
| worker reports to controller | `await agent_message.send(status, receiver_role="parent")`, artifact written to the SDD workspace path |
| wait on dispatched work | never tight-poll: do local ledger/packaging work; reconcile with `await rlm.list_subagents()`; use `rlm_heartbeat.create(...)` for bounded 5–10 min stretches |
| task tracking / todos | no todo tool: the plan file plus `<repo>/.superpowers/sdd/<plan>/progress.md` ledger is the task list (upstream's ledger already is the source of truth) |
| retire a worker | `await rlm.delete_subagent(handle)` only after its task is complete and reviewed |

### 5.4 `prime-rlm-dispatch` skill (the only genuinely new content)

One skill, description scoped to "dispatching and coordinating Prime Agent RLM subagents for SDD", holding:
- the **dispatch recipe** (one `rlm()` per task, never parallel implementers, name convention `task-<N>-impl` / `task-<N>-review` / `task-<N>-rereview-<R>` so agent-message selectors are predictable and collision-free);
- the **report contract** (§3.3) restated as the last line of every dispatch prompt;
- the **model tier table** materialized against `rlm.find_models` output — cheap tier for transcription-style implementers and small re-reviews, mid tier as the floor for reviewers and prose-driven implementers, top tier for architecture and the final whole-branch review, one tier up for fix rounds 4–5. This is where the user's Opus-decides / Sol-codes split belongs: top-tier model as controller and final reviewer, strong-coding model as implementer;
- the **bounded-wait + reconcile loop** using `list_subagents` + `rlm_heartbeat`;
- the **no-recursion note** (`rlmMaxDepth: 1` → a worker attempting `rlm()` gets a hard error; that error is a finding, not a retry);
- explicit statement that reviewer read-only-ness is a contract, plus the optional extension gate.

Everything else — brainstorming's HARD-GATE and three paths, writing-plans, test-driven-development, requesting-code-review's `code-reviewer.md`, the SDD implementer/task-reviewer/re-review templates, `finishing-a-development-branch` — is used **verbatim from upstream**.

### 5.5 Enforcing the user's SDD + iterative-review rules

Layer them so a single missed skill activation cannot bypass the gates:

1. **`AGENTS.md` contract block** (loaded unconditionally from cwd/ancestors, `resource-loader.ts:59`): design approval before implementation; TDD red-green before any implementation commit; every task passes a fresh-reviewer gate; no self-merge of unreviewed fixes. This addresses the user's stated preference for a solid `AGENTS.md`/`CLAUDE.md` contract over relying on skill activation, and their preference for explicit agents.md contract language when building production software.
2. **Bootstrap injector** — the `<EXTREMELY_IMPORTANT>` skill-check rule, every session and after every compaction.
3. **Upstream skills** — the actual workflow bodies, untouched and updatable.
4. **Structural enforcement** — `rlmMaxDepth: 1` (no worker-spawned reviewers), per-plan git-ignored workspace + ledger via `scripts/sdd-workspace` (survives compaction), file-based hand-off so review artifacts never pollute the controller's context.
5. **Optional hard gate** — a `tool_call` extension hook blocking `git merge`/`git push`/`rm -rf` outside the plan workspace unless confirmed, matching SDD's four named stop conditions.

### 5.6 Verification plan (mirrors upstream's Part 3 definition of done)

1. `prime-agent package list` shows the pinned Superpowers git package; `/skill` list shows all 16 upstream skills with the project `using-superpowers` winning the name collision (a collision diagnostic naming the package copy as loser is the expected, correct signal).
2. Smoke: fresh session, "describe your superpowers" → bootstrap present.
3. Acceptance: fresh session, "Let's make a react todo list" → `brainstorming` triggers before any code.
4. Tool-mapping check: the model reaches for `ipython`/`bash()`, never for a `read`/`write`/`grep` tool.
5. RLM check: a two-task throwaway plan executed under SDD actually spawns `task-1-impl`, receives a parent-directed `agent_message`, dispatches a reviewer on a *different, explicitly named* model, runs one fix round by resuming the same child, and writes ledger lines to `.superpowers/sdd/<plan>/progress.md`.
6. Depth check: a worker instructed to spawn a subagent fails with `RLM recursion depth limit reached`.
7. Child-injection check: a child session's transcript does not contain the full `using-superpowers` bootstrap.

---

## 6. Open items for the parent agent

- **Model selectors are user-credential-dependent.** The tier table must be filled from `rlm.find_models` on the actual machine; nothing here hardcodes model ids.
- **Reviewer read-only enforcement** is prompt-level unless the optional `tool_call` extension gate is built (§3.5 / §5.2 item 4). Decide whether that is in scope.
- **Upstream contribution path:** a `references/prime-tools.md` + a `.prime`-flavored injector would be a legitimate upstream harness port under `docs/porting-to-a-new-harness.md`; the project-local adapter above is the fast path and does not preclude it.
- Superpowers' visual brainstorming companion telemetry: set `SUPERPOWERS_DISABLE_TELEMETRY=1` if the local-hosted-only preference applies.
