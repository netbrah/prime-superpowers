---
name: subagent-driven-development
description: Execute a frozen plan one TDD item at a time with durable Prime dispatch and fresh review loops.
---

# Prime-native Subagent-Driven Development

Read [dispatch](../prime-rlm-dispatch/SKILL.md) and [model policy](../model-policy/SKILL.md). The root coordinator maintains saliency, the ledger, admissions, reconciliation, and independent gates; it makes no product edits. Execute exactly one plan item at a time in one canonical worktree.

## Setup and discovery

Record the canonical worktree root, starting commit, plan digest, frozen acceptance commands, and current state in `.superpowers/sdd/<plan>/progress.md`. Before specification finalization, complete the model policy's novelty gate: value hypothesis, competing approaches, cost-if-wrong, real-source/real-format spikes for risky unknowns, and the Opus frontier seat.

Resolve model seats in one exact `rlm.find_models` pass. For every child, validate the complete prompt envelope from the dispatch skill, call `scripts/workflow-controller admit --task <id> --model <selector> --json`, then dispatch with a full provider/model selector and explicit effort.

## One-item TDD loop

1. Select one dependency-ready item and record `BASE=HEAD`. Generate a content-addressed brief with `scripts/task-brief` and dispatch [implementer-prompt.md](implementer-prompt.md).
2. Require exact absence/import red and named behavioral red before implementation. The implementer makes the minimum allowed change, records green and gates, self-reviews, writes its disk report, and commits locally.
3. Build an immutable `BASE..HEAD` package with `scripts/review-package`. Dispatch a fresh [task-reviewer-prompt.md](task-reviewer-prompt.md), read its disk report, and independently rerun acceptance and repository gates.
4. For findings, admit one bounded fix at a time. Rounds 1–3 may resume the original implementer; rounds 4–5 use a fresh, more capable implementer. Every round gets a fresh [re-review-prompt.md](re-review-prompt.md) against a newly sealed range. Never let stale review context stand in for a fresh check.
5. Accepted Blocker/Major findings gate completion. After round five, adjudicate with evidence and cost-if-wrong; stop when a genuine accepted blocker has no specified path. Record deferred Minors.
6. Only after independent gates and report reconciliation mark the item complete, then move to the next item. Never batch plan items.

All implementation and review must verify the target's real source, real binary/interface where behavior depends on it, and real formats. Performance evidence must compare format-identical inputs and outputs in the named environment. Fixture doubles are limited to negative paths the real dependency cannot produce.

Children write detailed results to disk and notify with `agent_message.send(receiver_role="parent")`; reconcile via `scripts/workflow-controller status --json`, then close via `scripts/workflow-controller report --child <id> --status <ok|fail> --json`. Role, cwd, mutation, evidence, report, deadline, and notification compliance are prompt-only obligations checked by the coordinator; controller admission and lifecycle state are enforceable.

After all items, dispatch [final-reviewer-prompt.md](final-reviewer-prompt.md) against the entire committed range. Use one bounded fix and a fresh scoped re-review if needed. Do not claim that child nesting identifies role, and do not rely on short child responses as results.
