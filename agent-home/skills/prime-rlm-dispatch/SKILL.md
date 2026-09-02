---
name: prime-rlm-dispatch
description: Admit, dispatch, reconcile, and close bounded Prime RLM child work through the durable controller contract.
---

# Prime RLM Dispatch

Read [model policy](../model-policy/SKILL.md) before dispatch. Worker and reviewer roles are carried by a validated prompt, not inferred from child nesting or names. The child call is asynchronous: durable reports and explicit parent notifications are the result channel.

## Resolve once, dispatch exactly

At workflow setup, call `rlm.find_models` exactly once. Require exactly one configured match for every policy seat, record each full `provider/model` selector in the ledger, and stop on zero or multiple matches. Every `rlm()` dispatch supplies that full selector and the explicit effort level; there is no silent fallback and no later model-discovery pass.

Before each dispatch, run exactly:

`scripts/workflow-controller admit --task <id> --model <selector> --json`

Only an exit-zero admission permits `rlm()`. Reconcile with:

`scripts/workflow-controller status --json`

After validating the child's disk report and notification, run exactly:

`scripts/workflow-controller report --child <id> --status <ok|fail> --json`

The controller and launcher provide enforceable admission/lifecycle state. Prompt role, cwd, mutation bounds, evidence quality, report production, deadline behavior, and parent notification are prompt-only obligations: validate their presence before dispatch and verify their evidence afterward.

## Required prompt envelope

Every dispatch prompt must contain nonempty, validated values for all fields:

- `ROLE_MARKER`: one explicit worker or reviewer role.
- `WORKTREE_ROOT`: the canonical absolute worktree root; require `os.chdir(worktree_root)` before any operation.
- `IMMUTABLE_INPUT_OR_RANGE`: a content-addressed input package, commit range, or both.
- `MUTATION_POLICY`: exact allowed paths, or `READ_ONLY`.
- `OUTPUT_REPORT_PATH`: unique absolute path inside the plan workspace.
- `DEADLINE_AT`: absolute UTC deadline appropriate to the role.
- `PARENT_NOTIFICATION`: write and fsync the report, compute its SHA-256, then call `agent_message.send(receiver_role="parent")` with only status, report path, and digest.

Reject missing fields, relative roots/report paths, uncommitted review ranges, overlapping live attempts, or a selector not resolved in the single discovery pass. Start from [worker-prompt.md](worker-prompt.md) or [reviewer-prompt.md](reviewer-prompt.md). Never treat a short child response as the detailed result.
