# Upstream provenance

The two collision overrides are based on **Superpowers v6.3.0**, commit
`b36e0829c6d0140e93cfef2ca599b1b07d4a7797`. Source repository:
`https://github.com/obra/superpowers`.

Prime resolves a colliding skill as a whole directory. The kit therefore keeps
the complete safe sibling set used by `using-superpowers` and
`subagent-driven-development`. Hashes below are SHA-256. “Local SHA-256” records
the Task 9 vendoring baseline; files identified as policy bodies are
intentionally replaced by Task 10 and their final content is governed by the
workflow-contract suite.

| Local path | Upstream source path | Upstream SHA-256 | Local SHA-256 at Task 9 baseline | Treatment |
|---|---|---|---|---|
| `agent-home/skills/using-superpowers/SKILL.md` | `skills/using-superpowers/SKILL.md` | `30f2ab78e20ddc27ee7158ae4d4a2abe161c360981c7cc3548070913142d3dc3` | `3057ed20d2b86a8ea812d5eef3504df09df54e284f044e16736f5d0a54724bb9` | Intentional Task 9 diff removes the incompatible Pi reference; Task 10 supplies final Prime policy. |
| `agent-home/skills/using-superpowers/references/antigravity-tools.md` | `skills/using-superpowers/references/antigravity-tools.md` | `4880f6de3da4e32f9659ebe7a72b9e0ebfff04e028c2ed96173f86d0387a04c0` | `4880f6de3da4e32f9659ebe7a72b9e0ebfff04e028c2ed96173f86d0387a04c0` | Byte-identical sibling reference. |
| `agent-home/skills/using-superpowers/references/codex-tools.md` | `skills/using-superpowers/references/codex-tools.md` | `1a38ad9b188c393052f58d95657a1c35ea6aafc8b5a27f198f3922912f70bbe7` | `1a38ad9b188c393052f58d95657a1c35ea6aafc8b5a27f198f3922912f70bbe7` | Byte-identical sibling reference. |
| `agent-home/skills/using-superpowers/references/gemini-tools.md` | `skills/using-superpowers/references/gemini-tools.md` | `62b9157bcb0ee3c6784e3d0da0798ddfa5872f9e0c34bea48f3079dabea71965` | `62b9157bcb0ee3c6784e3d0da0798ddfa5872f9e0c34bea48f3079dabea71965` | Byte-identical sibling reference. |
| `agent-home/skills/using-superpowers/references/hermes-tools.md` | `skills/using-superpowers/references/hermes-tools.md` | `e2185c976a3c87503910e05e2aea58cc89bc8e569bb624b93df9958ac47a9190` | `e2185c976a3c87503910e05e2aea58cc89bc8e569bb624b93df9958ac47a9190` | Byte-identical sibling reference. |
| `agent-home/skills/subagent-driven-development/SKILL.md` | `skills/subagent-driven-development/SKILL.md` | `8dd1b8e698edec3700c6d89517dbe96febd3bacd3f6ea21c1a3569c62ea104b5` | `1b2b5da54c43e3e45bef013bd90ecdbf204fd0e7a7c2e1258dbb35a207d53414` | Intentional Task 9 diff localizes the final-review link; Task 10 supplies final Prime policy. |
| `agent-home/skills/subagent-driven-development/implementer-prompt.md` | `skills/subagent-driven-development/implementer-prompt.md` | `81dd9d5a3fb0b09b96b5829f03b9796842f3199ef7591d1ba1c2db2a515f64d0` | `81dd9d5a3fb0b09b96b5829f03b9796842f3199ef7591d1ba1c2db2a515f64d0` | Vendored baseline; Task 10 supplies final Prime contract. |
| `agent-home/skills/subagent-driven-development/task-reviewer-prompt.md` | `skills/subagent-driven-development/task-reviewer-prompt.md` | `eea23e33ec570c3041f40e9569fa711d61b8029f9eecf908345138aa1c6e61ab` | `eea23e33ec570c3041f40e9569fa711d61b8029f9eecf908345138aa1c6e61ab` | Vendored baseline; Task 10 supplies final Prime contract. |
| `agent-home/skills/subagent-driven-development/re-review-prompt.md` | `skills/subagent-driven-development/re-review-prompt.md` | `db0d5849478bc79cbde97b9b2cf0e58b50be8b8ed18464b0252c2bf27b6440a6` | `db0d5849478bc79cbde97b9b2cf0e58b50be8b8ed18464b0252c2bf27b6440a6` | Vendored baseline; Task 10 supplies final Prime contract. |
| `agent-home/skills/subagent-driven-development/final-reviewer-prompt.md` | `skills/requesting-code-review/code-reviewer.md` | `5eca5fcfd48a50e0a526ce5ffd64bf625d6b81bb46d11795274dae451fe6ffd4` | `5eca5fcfd48a50e0a526ce5ffd64bf625d6b81bb46d11795274dae451fe6ffd4` | Localized byte-identical baseline; Task 10 supplies final Prime contract. |
| `agent-home/skills/subagent-driven-development/scripts/review-package` | `skills/subagent-driven-development/scripts/review-package` | `fac3d4bd7f94369e8037b9ead2a8a502dca6ab333902b560b9455dbb3c450ebe` | `fac3d4bd7f94369e8037b9ead2a8a502dca6ab333902b560b9455dbb3c450ebe` | Byte-identical executable helper. |
| `agent-home/skills/subagent-driven-development/scripts/sdd-workspace` | `skills/subagent-driven-development/scripts/sdd-workspace` | `95a09d9d3983ad1aafd093ca72b4587946dea885c6e302caa02a779a2f911c31` | `95a09d9d3983ad1aafd093ca72b4587946dea885c6e302caa02a779a2f911c31` | Byte-identical executable helper. |
| `agent-home/skills/subagent-driven-development/scripts/task-brief` | `skills/subagent-driven-development/scripts/task-brief` | `d6954ef7841c7da3d77373e6ff5118b3f2f2e998606fd95d33e6527851bce044` | `d6954ef7841c7da3d77373e6ff5118b3f2f2e998606fd95d33e6527851bce044` | Byte-identical executable helper. |

Excluded intentionally:

- `skills/using-superpowers/references/pi-tools.md`
- the upstream Superpowers extension and every instruction to load it
- claims that Pi lacks native subagents

Prime supplies native RLM children, so importing Pi-specific bootstrap guidance
would conflict with the kit’s runtime and collision policy.
