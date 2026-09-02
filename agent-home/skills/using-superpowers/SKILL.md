---
name: using-superpowers
description: Start here to select the required Prime skill and enter the governed workflow before acting.
---

# Using Superpowers in Prime

Read applicable skills before responding or acting. User and repository instructions remain authoritative. For plan execution, read [Prime-native SDD](../subagent-driven-development/SKILL.md), [dispatch](../prime-rlm-dispatch/SKILL.md), and [model policy](../model-policy/SKILL.md) before admitting work.

Before a specification is finalized, complete the novelty gate in `../model-policy/novelty-prompt.md`. During implementation, execute one plan item at a time with fresh review loops. The root coordinator coordinates and runs gates but makes no product edits.

Prime-native actions use `ipython`, Python `Path`, `bash()`, `rlm`, `rlm.find_models`, and `agent_message.send(receiver_role="parent")`. Do not invent harness tools. Detailed child results live on disk; notifications carry only the report path and digest.

Platform references retained from the pinned upstream package are available for [Codex](references/codex-tools.md), [Antigravity](references/antigravity-tools.md), and [Hermes](references/hermes-tools.md).
