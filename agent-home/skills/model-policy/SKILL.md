---
name: model-policy
description: Resolve and route Prime's configured models to explicit workflow roles without fallback.
---

# Model Policy

Use one exact `rlm.find_models` pass at setup, require one match per seat, and persist full selectors. Dispatch every seat with the full `provider/model` selector and explicit effort.

| Role | Selector | Effort | Allowed work |
|---|---|---|---|
| Coordinator | `prime-proxy-openai/gpt-5.6-sol` | `max` | coordination, reconciliation, gates; no product edits |
| Gate implementer | `prime-proxy-openai/gpt-5.6-sol` | `max` | bounded hard implementation dominated by strict gates |
| TDD/blocker reviewer | `prime-proxy-openai/gpt-5.6-sol` | `max` | red-green and Blocker/Major verification |
| Novel-value architect | `prime-proxy-anthropic/claude-opus-5` | `high` | novelty, architecture, frontier work |
| Frontier reviewer | `prime-proxy-anthropic/claude-opus-5` | `high` | architecture, usefulness, forest-level review |
| Balanced implementer | `prime-proxy-openai/gpt-5.6-terra` | `max` | bounded implementation |
| Mechanical implementer | `prime-proxy-anthropic/claude-sonnet-5` | `high` | only fully specified, deterministic mechanical work |
| Context/blind-spot reviewer | `prime-proxy-google/gemini-3.1-pro-preview` | `high` | large-context reconnaissance and independent blind-spot review; never implementation |

A simplicity reviewer uses a `high`-effort cross-family model not used by the artifact author. Novel architecture, protocol, concurrency, persistence, security, and final gates use the Sol/Opus/Gemini council. No unavailable-model fallback is implicit.

Before finalizing a specification, run [the novelty prompt](novelty-prompt.md). Record the value hypothesis, at least two materially competing approaches, cost-if-wrong, and a real-source/real-format spike for every risky unknown. Opus high owns the frontier seat; Gemini high supplies blind-spot context and does not implement.
