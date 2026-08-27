# Design Review — Prime Superpowers CLI (round 1)

Reviewer role: independent architecture and novel-value reviewer (Opus seat)
Subject: `docs/specs/2026-08-26-prime-superpowers-design.md` (status: draft)
Cross-checked against: `/home/user/workspace/prime-agent` (`prime-agent` 0.8.1, `packages/coding-agent` = `@earendil-works/pi-coding-agent` 0.8.1) and `/home/user/workspace/superpowers` (v6.3.0)
Method: read-only. No spec or implementation file was modified. All code claims below were verified against the checked-out sources; paths and line numbers are given so each finding is independently checkable.

Verdict: **do not proceed to task breakdown.** 6 Blockers, 10 Majors, 11 Minors. Two of the Blockers (B2, B3) mean the package as specified either silently loads none of its own configuration or sends the operator's existing provider credentials to a third-party proxy. The remaining Blockers are about the thing this review was asked to weigh: as written, the design's own success criteria cannot distinguish "improved outcomes on novel hard tasks" from "performed more ceremony," and its central gate contradicts the upstream skill it claims to run verbatim.

---

## What the design gets right

Worth stating, because these are the parts that should survive the rewrite.

1. **`rlmMaxDepth: 1` is a real structural gain, and the claim is accurate.** `_startRlmChildRun` throws when `this._rlmDepth >= this._rlmMaxDepth` (`packages/coding-agent/src/core/agent-session.ts:10214`); the root session is depth 0, so depth 1 permits the coordinator to dispatch and hard-fails any child that tries to. This converts upstream's most expensive observed failure mode — worker-spawned duplicate reviewers, called out explicitly in `skills/subagent-driven-development/SKILL.md` ("every reviewer a worker spawned duplicated the task review… a full extra review seat per task") — from prose into an error. Keep it.
2. **Package + thin override instead of a fork is the correct shape**, and the mechanism exists as described: `packages: [{ source: …, extensions: [] }]` is documented package filtering (`packages/coding-agent/docs/packages.md:183-209`, "`[]` to load none of that type"), and project skills shadow package skills by first-name-wins, so a project `using-superpowers` beats the package copy without touching upstream bodies.
3. **Refusing to flatten the wire is right.** Keeping `anthropic-messages`, `openai-responses`, and `google-generative-ai` native preserves thinking-level fidelity, Anthropic cache-control shape, and Anthropic cache pricing (`packages/ai/src/cache-pricing.ts` gates the ×1.25/×2.0 cache-write multipliers on provider `anthropic` or ids starting `claude-`, which the chosen ids satisfy). Most "one OpenAI-compatible endpoint" designs lose all three.
4. **File hand-off plus a short completion message is the only correct RLM report contract**, because `rlm()` returns an admission handle and never the child's answer. Getting this right in the design rather than discovering it at runtime is a genuine save.
5. **Model-diverse review is a defensible bet** for blind-spot discovery, and refusing arbitrary self-selection of models is right — free model choice is where agent cost blows up silently.

---

## Blockers

### B1 — The success criteria measure ceremony, not outcomes. Nothing in this design would notice if it made hard tasks worse.

All eight success criteria (spec lines 11-18) are configuration or process assertions: env vars set, Sol starts, children do implementation, reviews run until clean, cache retention exported. Zero of them are about the target project. The entire Verification section (lines 138-144) is JSON/shell/frontmatter linting plus `prime-agent model list`.

So the design's own definition of done is satisfiable by a package that never improves a single hard-task outcome and merely multiplies review seats. That is precisely the failure this review was asked to test for, and the spec currently has no defense against it.

This matters more than it sounds, because the added machinery is almost entirely *review multiplication*: 3-model spec review with a mandatory second round (steps 2-3), 2-model plan review with a mandatory second round (step 5), ≥2-model task review per task with fresh reviewers after *every* revision (steps 8-9), and a model-diverse whole-branch review (step 11). For a 10-task plan averaging 1.5 fix rounds per task, that is roughly `10×(1 implementer + 2 reviewers) + 10×1.5×(1 resume + 2 fresh reviewers) + 6 spec seats + 4 plan seats + 3 final seats ≈ 88 agent sessions`, every one of them at `high` or `max` effort (see M6). If that buys nothing measurable, it is not rigor, it is a tax.

Required before proceeding:
- Add an outcome criterion: a named set of 3-5 genuinely hard reference tasks, run with and without the package, comparing (a) task success against a pre-written acceptance test the agent does not see, (b) total token cost, (c) wall-clock, (d) number of human interventions. State the threshold that would make the package worth using and the threshold that would make it worth deleting.
- Add a counterfactual rule to every reviewer contract: a finding must state what breaks if it is not fixed. Findings that cannot answer that are Minor by definition. Without this, "zero blockers and zero majors" is a popularity contest with a taste-driven reviewer.
- Add one seat whose mandate is the opposite of the others: *is this solution actually better than the obvious approach, and would a simpler design pass the same tests?* Every current seat is biased toward finding more work; none is biased toward finding less.

### B2 — The launch contract does not define cwd, and Prime Agent reads project settings and project extensions from cwd only. "Clone into or alongside" silently disables the entire package.

The Purpose (line 7) promises a repository "cloned into or alongside a hard implementation project and launched immediately." The repository layout (lines 46-61) puts every load-bearing artifact under `.prime/agent/` of *this* repo: the settings that pin Superpowers and filter its extension, the extension that registers all five models, and the three override skills.

Project settings are resolved from cwd with no ancestor walk: `FileSettingsStorage` sets `projectSettingsPath = join(cwd, CONFIG_DIR_NAME, "settings.json")` (`packages/coding-agent/src/core/settings-manager.ts:227-230`). Project extensions are likewise discovered only at `<cwd>/.prime/agent/extensions/`. Project *skills*, by contrast, do walk ancestors up to the git root — which makes the failure asymmetric and therefore silent:

- Cloned **alongside** the target repo and launched from the target repo → no settings, no extension, no registered models, no Superpowers package, `rlmMaxDepth` back to its default of 2. The three override skills are also invisible (different git root). Nothing errors; Sol just starts as a stock agent.
- Cloned **into** the target repo as a subdirectory and launched from the repo root → same: settings and extension are one level down and are never read. Skills *are* found via the ancestor walk, so the model is told to use `rlm()` with models that were never registered.
- Launched from inside `prime-superpowers/` → settings and extension load, but cwd is now the wrong directory for the work: RLM children inherit the parent's cwd (`cwd: sessionManager.getCwd()` in `createRlmSubagentRuntime`, with no per-child cwd and no cwd kwarg on `rlm()`), so every implementer's relative paths, test runs, and git operations resolve against the config repo instead of the target project.

The spec must state exactly one supported topology and how `./prime` establishes cwd, and `scripts/doctor` must fail loudly when the project settings file that declares the Superpowers pin is not the one that got loaded. A one-line `prime-agent package list` assertion in the doctor covers most of it.

### B3 — Overriding the built-in `anthropic`/`openai`/`google` providers sends the operator's existing credentials to `PRIME_BASE_URL`, and `PRIME_LLM_KEY` is silently ignored.

The Architecture section says OpenAI, Anthropic, and Google models "remain registered with their native API dialects" with base URLs defaulting to `PRIME_BASE_URL` (lines 42, 120-122), and the chosen model ids (`gpt-5.6-sol`, `claude-opus-5`, `gemini-3.1-pro-preview`) are exactly the built-in catalog ids under providers `openai`, `anthropic`, and `google` (`packages/ai/src/models.generated.ts`, verified for all five role models). Registering those provider names with a proxy `baseUrl` is documented as preserving the existing models (`docs/custom-provider.md`, "Override Existing Provider").

Credential resolution then does the opposite of what the design intends. `getApiKeyAndHeaders` consults auth storage *first* and only falls back to the provider config key when auth storage returned nothing: `if (apiKey === undefined && providerConfig?.apiKey) { … }` (`packages/coding-agent/src/core/model-registry.ts:1295-1318`). Auth storage for non-Prime providers resolves stored `auth.json` credentials and then provider env vars (`packages/coding-agent/src/core/auth-storage.ts:833-880`; the env-var path is gated to Prime Inference only *above* the stored-credential branch, so a stored Anthropic API key or OAuth credential wins outright). Headers merge the same way, with auth-storage headers layered over provider headers (`model-registry.ts:1321-1331`).

Consequences on any machine where the operator has ever authenticated Anthropic, OpenAI, or Gemini in Prime Agent — i.e. the expected machine:

1. The operator's real Anthropic/OpenAI/Google credential is transmitted to a third-party proxy URL. That is a credential-exfiltration bug, not a config quirk.
2. `PRIME_LLM_KEY` is never used, so the proxy rejects the request and the failure looks like a proxy problem.
3. Success criterion "existing global Prime Agent model configuration is not overwritten" (line 18) is technically satisfied on disk and violated in effect at runtime.

Fix: register **new provider names** (`prime-openai`, `prime-anthropic`, `prime-google`) that have no auth-storage entries, with `apiKey: "PRIME_LLM_KEY"` and `authHeader: true` where the dialect wants bearer auth. Keep the model *ids* as `claude-opus-5` etc. so Anthropic cache pricing still applies (`packages/ai/src/cache-pricing.ts`). Note this changes every selector the coordinator passes to `rlm()`, and therefore must be decided before the model-policy table is frozen.

### B4 — The commit gate contradicts the pinned upstream skill, has no round cap, and uses a severity taxonomy the reviewer templates do not emit.

Spec steps 9-10 and success criterion line 15 define the gate as: fresh reviewers after every revision, commit only when a complete round reports zero blockers and zero majors. Upstream `subagent-driven-development` — which the spec says is used verbatim — defines the loop as **five rounds maximum per task**, followed by a breaker in which the controller *adjudicates* each open finding, parks contestable and non-load-bearing ones with a recorded `Ruling:`, and proceeds. Rounds 1-3 resume the implementer; rounds 4-5 dispatch a fresh implementer one capability tier up.

Three distinct defects follow:

1. **No termination.** "Repeat until zero blockers and zero majors" with fresh reviewers each round has no fixed point on genuinely novel work — fresh reviewers legitimately raise new architectural objections to unfamiliar designs. Upstream's cap exists because past-cap rounds were observed not to converge ("Past the cap, rounds don't converge — the failure is structural").
2. **Two contradictory authorities in one session.** The coordinator will hold both the project skill (never commit until zero) and the upstream skill (adjudicate at the cap and move on). Which one wins depends on read order. Contradictory instructions in one context degrade adherence to *both*.
3. **Taxonomy mismatch.** Upstream reviewer templates emit `Spec ✅/❌` plus `Critical` / `Important` / `Minor` and route Minor findings to a deferred ledger list. The spec's gate is defined over `Blocker` / `Major` / `Minor`. No mapping is given. As written, a reviewer returning "Spec ❌, one Important finding" does not obviously trip a gate defined on Blockers and Majors.

Also note the omitted upstream mechanism this creates: **no ruling authority anywhere in the spec.** Upstream is explicit that "a running plan does not wait on a human" and that every judgment call is a ledger `Ruling:` with its cost-if-wrong. Remove that and the design's only exit from a disagreement is to keep dispatching, or to stop and ask the operator — which is exactly the failure mode of unattended long runs.

Fix: adopt upstream's taxonomy verbatim, state the Blocker/Major/Minor mapping explicitly if the project insists on its own names, import the 5-round cap and the adjudication/parking rules, and define who holds ruling authority.

### B5 — The evidence and review-package mechanism is incompatible with "commit only after review is clean," and no branch or worktree isolation is specified.

Step 7 requires "recorded failing-test and passing-test evidence plus repository gates"; step 8 dispatches task reviews; step 10 commits only after a clean round. Upstream's review package is `scripts/review-package PLAN_FILE BASE HEAD` — a git diff over a *commit range*, with a loud warning never to use `HEAD~1` because it truncates multi-commit tasks, and with `BASE` recorded via `git rev-parse HEAD` before dispatching the implementer. Upstream's implementer commits its own work; the fix loop diffs `FIX_BASE..HEAD`.

If nothing is committed until the review is clean, `BASE..HEAD` is empty and there is no review package. The spec never says whether the implementer commits (contradicting step 10), the coordinator commits (contradicting "every implementation task is performed by an RLM child" and upstream's "never fix findings yourself in the controller session"), or reviewers get an uncommitted working-tree diff (which breaks scoped re-reviews, since `FIX_BASE` no longer exists).

Compounding this: upstream's Setup section mandates worktree isolation and forbids starting implementation on main/master without explicit consent. The spec's 11-step flow has no setup step at all — no worktree, no branch, no ledger check. And because all children share the coordinator's single cwd (B2), there is exactly one working tree for the coordinator, every implementer, and every reviewer.

Fix: make step 0 explicit (worktree/branch creation, ledger resolution, plan pre-flight conflict scan), and state the commit protocol: implementer commits, coordinator records `BASE` before dispatch, gate is on *merge/finish*, not on commit.

### B6 — The tool-vocabulary correction is injected only into the coordinator, but the children are the agents that touch files.

Spec line 132: "The local bootstrap is injected only into the root coordinator. Children receive a small worker contract instead of the full workflow bootstrap." Line 142 verifies only that *the bootstrap* names `ipython`, `rlm`, `agent_message`, and `rlm.find_models`.

The reason a Prime tool mapping is needed at all is that Prime Agent's model-facing default tool surface is a single `ipython` tool, while the upstream corpus is written in Claude/Pi vocabulary. That vocabulary is not confined to `using-superpowers`: the dispatch templates the children actually receive say "**Read** your task brief first", "**Write** tests", "**Read** the implementer's report", "do not **Read** a changed file" (`skills/subagent-driven-development/implementer-prompt.md:15,36,130`; `task-reviewer-prompt.md:23,30,38-40`), and `skills/using-superpowers/references/` ships harness mappings for Codex, Pi, Gemini, Antigravity, and Hermes — with no Prime entry.

So the population that hallucinates `read`/`write`/`grep` tool calls is precisely the population the design decides not to give the mapping to. The coordinator, which mostly dispatches and reconciles, gets it.

Fix: the worker contract must carry the Prime tool mapping (file I/O via `Path().read_text()`/`write_text()`, shell via `await bash(...)`, skills by reading `SKILL.md` or `/skill:<name>` with no `superpowers:` prefix, no todo tool, report via `agent_message.send(..., receiver_role="parent")`), and Verification must assert that the *worker* contract names those and names no nonexistent tools. Keeping the worker contract short is right; keeping it silent on tools is not.

---

## Majors

### M1 — One `PRIME_BASE_URL` cannot serve three dialects: each client composes a different path shape.

- Anthropic: the SDK gets `baseURL: model.baseUrl` and appends its own `/v1/messages` (`packages/ai/src/providers/anthropic.ts:889,910,930`); the built-in value is `https://api.anthropic.com` — **no version segment**.
- OpenAI Responses: `baseURL: model.baseUrl` with the SDK appending `/responses`; the built-in value is `https://api.openai.com/v1` — **version segment required**.
- Google: when `model.baseUrl` is set the provider also forces `httpOptions.apiVersion = ""` with the comment "baseUrl already includes version path, don't append" (`packages/ai/src/providers/google.ts:328-331`); the built-in value is `https://generativelanguage.googleapis.com/v1beta` — **version segment mandatory or every request 404s**.

The spec's `.env.example` (lines 119-122) sets all three overrides to bare `$PRIME_BASE_URL`, which is wrong for at least two of the three. Either document the exact suffix per dialect (`…/v1`, `…`, `…/v1beta`) and have the extension append the right one per dialect by default, or drop the "one URL" framing.

### M2 — Nothing exercises the wire. The RLM auth preflight only checks that a key exists, and dispatch is fire-and-forget.

`_resolveRlmSubagentModel` validates the selector against `_authenticatedRlmModels()` and then calls `getApiKeyAndHeaders` (`agent-session.ts:10172-10197`); that preflight resolves a key and headers and returns `ok`. It never contacts the provider. So a proxy that does not implement `/v1/responses`, or rejects Google's `x-goog-api-key`, or 404s on a missing version segment (M1), passes every check the spec specifies — `prime-agent model list` and a "dry startup" (line 143) included — and fails inside a child, mid-workflow, where `rlm()` has already returned an admission handle and the coordinator has no completion signal.

Fix: `scripts/doctor` must issue one minimal real completion per role model (one token, `thinking` at the level the policy will actually use) and print per-model pass/fail with the HTTP status. This is the single highest-value item in the whole verification section and it is currently absent.

### M3 — The Gemini row of the model policy is wrong, and it contradicts the design's own dispatch rule.

`google/gemini-3.1-pro-preview` carries `thinkingLevelMap: {"off":null,"minimal":null,"low":"LOW","medium":null,"high":"HIGH"}` (`packages/ai/src/models.generated.ts`). `getSupportedThinkingLevels` drops every `null` entry and requires explicit entries for `xhigh`/`max` (`packages/ai/src/models.ts:67-76`), so the **only legal explicit levels for this model are `low` and `high`**. `_startRlmChildRun` throws on any other explicit level (`agent-session.ts:10233-10241`). Meanwhile omitting `thinking` does not give a "provider default": the child inherits `clampThinkingLevel(options.model, this.thinkingLevel)` (`agent-session.ts:9324-9325`), so a Sol:max coordinator silently yields Gemini at `HIGH`.

Therefore: the table's "provider default" (line 69) is not a thing that exists; the policy rule "passes exact selectors plus explicit thinking levels to every `rlm()` call" (line 76) would hard-throw for Gemini at any level other than `low`/`high`; and line 125's "Gemini is configured without a user-facing effort lever" is false. Specify `high` explicitly and delete the exception.

### M4 — No ledger, no compaction contract, no resume rule — against the one failure upstream calls its most expensive.

The spec mentions a "durable ledger" exactly once, and only to record resolved model selectors (line 76). Upstream devotes its Setup section to the opposite emphasis: "Conversation memory does not survive compaction. In real sessions, controllers that lost their place have re-dispatched entire completed task sequences — the single most expensive failure observed," with a defined path (`<repo-root>/.superpowers/sdd/<plan-basename>/progress.md`), an identity first line, `Task <N>: complete` idempotency markers, mid-loop resume semantics, and a rule to trust the ledger and `git log` over recollection.

A Sol:max coordinator running an 11-step flow over ~88 child sessions *will* compact. The spec needs: the ledger path, its identity line, the completion/fix-round line formats, the "do not re-dispatch a task with a completion line" rule, and where the `Ruling:` lines from B4 live. Right now recovery after compaction is undefined, which is how an unattended run redoes a day of work.

### M5 — No waiting or reconciliation contract for a fire-and-forget dispatch primitive.

The spec says children write files and send a concise completion message (line 96). It does not say what the coordinator does between dispatch and message. `rlm()` returns on admission, not completion; a child that dies, or finishes without sending, produces silence indistinguishable from work in progress. Upstream already prescribes the shape (never tight-poll; do local work; wait in bounded 5-10 minute stretches; between stretches post one status line and reconcile live children), and Prime Agent supplies the primitives — `rlm.list_subagents()` plus the `rlm-heartbeat` skill. None of this appears in the spec, and `agent_message.send` does not block (`deliveryStatus` may be `queued`), so the completion signal is best-effort. Add the bounded-wait + reconcile loop and a dead-child rule.

### M6 — The model policy contradicts upstream's Model Selection section and has no cheap tier at all.

Upstream's rule is "use the least powerful model that can handle each role," with an explicit cheapest tier for transcription-style implementers and single-file mechanical fixes, review capability scaled to the diff's size and risk, and cheap-to-mid for scoped re-reviews of small fix diffs. The spec instead assigns `max` to the coordinator, `max` to two of three implementer tiers, `high` to the third, `max` to the TDD reviewer, `high` to the frontier reviewer, and mandates a ≥3-model council on architectural and final rounds. The cheapest capable model in the catalog — `gpt-5.6-luna` at $0.20/$1.20 per Mtok versus Sol's $4/$20, a 20× spread — appears nowhere.

Two problems. First, the coordinator will hold two contradictory model policies (project skill vs. pinned upstream skill), same defect as B4.3. Second, the spec's own "Mechanical implementer: Sonnet at high, only when the task is unusually complete and deterministic" describes exactly the case upstream says to give the *cheapest* tier — so the design has a mechanical tier in name and a premium tier in price. At ~88 sessions per 10-task plan (B1), this is the dominant cost term and it is chosen without a stated rationale.

If the deliberate bet is "capability everywhere beats cost," say so as a design decision with the cost accepted, and override upstream's section explicitly rather than leaving both in context. Upstream's own counter-argument ("Turn count beats token price") is worth engaging directly, not ignoring.

### M7 — "The coordinator detects and rejects reviewer-originated working-tree changes" is not implementable as described.

Line 133 promises detection of reviewer-originated mutations. There is exactly one working tree shared by the coordinator and every child (no per-child cwd; `rlm()` accepts only `name`, `model`, `thinking` — `agent-session.ts:10205-10209` throws on any other kwarg), and the host-side levers that could scope a child's tools (`allowedToolNames`, `customTools`, `scopedModels`) are unreachable from Python. A `git status` diff therefore cannot attribute a change to a reviewer rather than to the implementer, a stray coordinator action, or a background test run that wrote artifacts.

Either downgrade the claim to a prompt-level contract (honest, and what upstream does), or implement the mechanism that actually works: a `tool_call` extension hook that blocks working-tree mutation for sessions whose names match the reviewer convention (`pi.on("tool_call", …)` supports `return {block: true, reason}`). The reviewer naming convention the spec needs for this is also currently unspecified.

### M8 — Verification does not cover the design's own load-bearing claims.

The Verification section checks JSON/shell/frontmatter, that Superpowers is pinned and its extension filtered, that the launcher exports long retention and starts Sol:max, that five models are registered, and that the bootstrap names four APIs. It does **not** assert:

- `rlmMaxDepth: 1` is set and takes effect (the design's only structural enforcement — trivially verifiable by asserting the error text from `agent-session.ts:10214`);
- children do **not** receive the coordinator bootstrap (a stated safety property, line 132);
- the worker contract's contents (B6);
- reviewer-mutation rejection (M7);
- that the project settings file which pins Superpowers is the one actually loaded from the launch cwd (B2);
- the pinned Superpowers ref value;
- that each role model answers over the wire (M2).

A verification suite that green-lights a build in which none of the above hold is testing the packaging, not the design.

### M9 — Nothing in this flow produces novelty. It only reviews it.

The workflow begins at step 1, "write the frozen specification incrementally." Where the specification's *content* comes from is unaddressed. Upstream's answer is `brainstorming` — the HARD-GATE that refuses to code before the problem is framed, and the skill that most directly determines hard-task outcomes. It appears in the spec's architecture diagram (line 39) and then never in the mandatory flow. `systematic-debugging` — the highest-leverage skill when a hard task goes sideways, which it will — is absent entirely, as are `using-git-worktrees` (see B5), `verification-before-completion`, and `receiving-code-review`.

Meanwhile the seat named "Novel-value architect" (Opus, line 68) is dispatched in the flow only as a reviewer: spec review (step 2), task-breakdown cross-review (step 5), and final review (step 11). There is no step in which anyone generates two competing designs, spikes the risky unknown, or defends a non-obvious approach against the obvious one.

This is the structural reason B1 bites. The design adds a lot of *evaluation* capacity and no *generation* capacity, and evaluation pressure without a novelty-defense seat has a predictable direction: implementers converge on whatever is easiest to defend to a fresh reviewer, which is the conventional solution. On novel hard tasks that is not a neutral outcome — it is regression to the mean, purchased at 88 sessions.

Minimum fix: make brainstorming a gate before step 1; add an explicit alternatives step (≥2 candidate designs with a written comparison and a recorded decision) before the spec freezes; name `systematic-debugging` as mandatory on the second consecutive failed fix round; and give one reviewer the "is the simpler design better" mandate from B1.

### M10 — `PI_CACHE_RETENTION=long` is not Anthropic-scoped, and the spec's claim about it is narrower than its effect.

Success criterion line 17 and the contract at line 125 frame long retention as an Anthropic behavior. In fact `resolveCacheRetention()` is duplicated across `anthropic.ts`, `openai-responses.ts`, `openai-completions.ts`, and `amazon-bedrock.ts`, and the env var flips all of them. On the OpenAI paths that means `prompt_cache_retention: "24h"` and `prompt_cache_key` are sent to the proxy; on Anthropic paths `cache_control` gains `ttl: "1h"` with **no `api.anthropic.com` base-URL gate**, so a custom Anthropic-dialect proxy does receive it. Separately, no `extended-cache-ttl-*` beta header is ever sent anywhere in the codebase, so a proxy that requires that header for 1h TTLs will silently degrade or reject.

The spec's configuration contract has no per-provider `compat` lever and no header-injection lever, so there is no way to opt a misbehaving dialect out (`compat.supportsLongCacheRetention: false`) or to add a required beta header. Both belong in the contract, and the claim should be restated as "all dialects request long retention."

---

## Minors

1. **The Superpowers pin has no value.** Lines 29 and 130 promise pinning; neither the layout nor the configuration contract names a ref. Pin to `v6.3.0` (the checked-out version) explicitly — package identity for git sources is the URL without ref, so an unpinned global install would otherwise be superseded silently by scope precedence.
2. **The effort assignment is inverted at the top end.** `claude-opus-5` declares `thinkingLevelMap: {"xhigh":"xhigh","max":"max"}`, so `max` is available, yet the frontier architect and frontier reviewer run at `high` while mechanical implementers run at `max`. If cost is the reason, say so; as written the seats that most need reasoning depth are the ones capped below capability.
3. **"The operator configures only two variables" is not accurate.** Given M1, per-dialect URL suffixes are effectively mandatory, and the five model-id overrides become mandatory the moment the proxy's ids differ from the built-in catalog (the usual case). Say "two secrets, plus proxy-shape configuration" and give one worked `.env.example` for a real proxy layout.
4. **Per-dispatch latency from Codex catalog discovery.** `rlm.find_models` and every `rlm()` model resolution route through `getExecutableModels()`, which — when any `openai-codex` model is authenticated — performs a network fetch with a 5s timeout, cached 5 minutes (`model-registry.ts:967-1010`). On a proxy-only or offline network this adds latency to dispatches. Worth a doctor note.
5. **`/model` and RLM use different catalogs.** The comment at `model-registry.ts:376-385` documents that a model can be interactively selectable yet rejected as an RLM child. Since the design's entire premise is RLM dispatch, `scripts/doctor` should assert via `rlm.find_models` rather than `prime-agent model list` (line 143), which reads the unfiltered list.
6. **No `docs/reviews/` contract.** Line 144 says to record review rounds there; no naming convention, index, or retention rule. With fresh reviewers per revision this directory will hold dozens of files per plan.
7. **The launcher's `--model` selector must be derived from env.** If `PRIME_MODEL_SOL` is overridden, a hardcoded `Sol:max` selector in `./prime` breaks. State that the launcher composes `<provider>/<resolved-id>:max`.
8. **Assert input capabilities, don't assume them.** Line 141 verifies "intended input capabilities"; note that all five role models declare `["text","image"]` in the catalog while many proxies drop image support — so this assertion needs a wire check (M2), not a config check.
9. **Non-goal vs. workflow.** "Automatically publishing or modifying the target implementation repository" is a non-goal (line 25), but step 10 commits to it. Draw the line explicitly: commits inside the worktree yes, merge/push/publish no (which matches upstream's four named stop conditions).
10. **Expected-noise documentation.** The `using-superpowers` name collision will emit a diagnostic naming the package copy as the loser. That is the correct signal; say so, or the first operator will file it as a bug.
11. **Brainstorming companion telemetry.** `skills/brainstorming/scripts/` ships a Node visual companion that fetches a remote asset; `SUPERPOWERS_DISABLE_TELEMETRY=1` belongs in `.env.example` for anyone running this on a locked-down network.

---

## The novel-value question, answered directly

**Will this improve outcomes on novel hard tasks, or enforce ceremony?** As specified, mostly ceremony — but the gap is closable, and three of the five levers that would close it are cheap.

What genuinely helps hard tasks, and is present: fresh isolated context per task (real, and the main reason SDD works); structural prevention of recursive agent sprawl (`rlmMaxDepth: 1`); file-based hand-off keeping the coordinator's context clean; explicit model selection instead of inheritance; and model-diverse review for blind spots, which is a defensible bet even though the design never tries to measure it.

What the design adds that is ceremony-shaped:

- **Review multiplication without risk scaling.** Every task gets the same ≥2 reviewers plus fresh reviewers per revision, regardless of whether the diff is a one-line constant or a concurrency change. Upstream explicitly scales review capability to diff risk; the spec drops that and keeps only the cost.
- **An unbounded gate with no adjudication.** "Zero blockers and zero majors, fresh reviewers each round" (B4) has no fixed point on novel work and no ruling authority to break ties. This is the mechanism by which a review regime turns from brakes into churn.
- **Evaluation capacity without generation capacity** (M9). No brainstorming gate, no alternatives step, no spike, no systematic-debugging. The one seat named for novel value spends the flow reviewing.
- **Process-only success criteria** (B1). Nothing would detect the ceremony outcome, which is why it is the top Blocker rather than a stylistic note.

The five changes that would most move this from ceremony toward outcomes, in order:

1. Define outcome measurement and a kill threshold (B1). Without this, every other argument here is unsettleable.
2. Import upstream's cap, breaker, adjudication, and ledger wholesale rather than paraphrasing a stricter gate over the top of them (B4, M4). The pinned skill is more operationally mature than the spec's replacement on exactly these points.
3. Add generation steps: brainstorming gate, ≥2 candidate designs with a recorded decision, spike-the-unknown, systematic-debugging on repeated fix failure (M9).
4. Add the "simpler design would pass the same tests" reviewer seat and the counterfactual requirement on all findings (B1). This is the only structural defense against reviewer-driven regression to the conventional.
5. Scale review cost to diff risk and introduce a cheap tier (M6). The savings fund items 1 and 3.

None of that is worth building until B2 and B3 are resolved, because until then the package either loads none of its own configuration or ships the operator's credentials to a proxy.

---

## Evidence index

| Claim | Source |
|---|---|
| Project settings resolve from cwd only | `packages/coding-agent/src/core/settings-manager.ts:227-230` |
| Auth storage key wins over provider-config key; header merge order | `packages/coding-agent/src/core/model-registry.ts:1295-1331` |
| Auth storage source order (stored credential, then env) | `packages/coding-agent/src/core/auth-storage.ts:833-880` |
| RLM depth limit and error text | `packages/coding-agent/src/core/agent-session.ts:10214` |
| `rlm()` accepts only `name`/`model`/`thinking` | `packages/coding-agent/src/core/agent-session.ts:10205-10209` |
| Explicit unsupported thinking level throws | `packages/coding-agent/src/core/agent-session.ts:10233-10241` |
| Omitted thinking clamps the parent's level | `packages/coding-agent/src/core/agent-session.ts:9324-9325` |
| Auth preflight never contacts the provider | `packages/coding-agent/src/core/agent-session.ts:10172-10197` |
| Supported-level derivation; `xhigh`/`max` need explicit map entries | `packages/ai/src/models.ts:67-99` |
| Role-model ids, providers, dialects, `thinkingLevelMap`s | `packages/ai/src/models.generated.ts` (providers `openai`, `anthropic`, `google`) |
| Google forces `apiVersion: ""` when `baseUrl` is set | `packages/ai/src/providers/google.ts:325-340` |
| Anthropic / OpenAI-Responses base URL composition | `packages/ai/src/providers/anthropic.ts:889,910,930`; `packages/ai/src/providers/openai-responses.ts:212` |
| Anthropic cache-write pricing gated on provider/id naming | `packages/ai/src/cache-pricing.ts` |
| Package filtering (`extensions: []`), scope precedence, git identity | `packages/coding-agent/docs/packages.md:183-221` |
| Provider override preserves models; async factory awaited pre-startup | `packages/coding-agent/docs/custom-provider.md` |
| Upstream fix-loop cap, breaker, rulings, ledger, model selection, worktree setup | `superpowers/skills/subagent-driven-development/SKILL.md` |
| Claude-vocabulary tool names in the dispatch templates children receive | `superpowers/skills/subagent-driven-development/implementer-prompt.md:15,36,130`; `task-reviewer-prompt.md:23,30,38-40` |
| No Prime entry among harness platform-adaptation references | `superpowers/skills/using-superpowers/references/` |
| Prior read-only inspections corroborating the above | `/home/user/workspace/prime-agent-integration-findings.md`; `/home/user/workspace/superpowers-to-prime-adaptation-findings.md` |
