# Novel-value discovery prompt

ROLE_MARKER: `REVIEWER:NOVELTY:FRONTIER` (dispatcher must validate this role before specification finalization)
WORKTREE_ROOT: `<canonical absolute worktree root>`
IMMUTABLE_INPUT_OR_RANGE: `<SHA-256 problem statement, repository revision, and evidence bundle>`
MUTATION_POLICY: `READ_ONLY` for product code; experiments only in the explicitly assigned spike directory
OUTPUT_REPORT_PATH: `<absolute .superpowers/sdd/<plan>/discovery/novelty.md>`
DEADLINE_AT: `<absolute UTC timestamp>`
PARENT_NOTIFICATION: after the report is written and fsynced, compute SHA-256 and call `agent_message.send(receiver_role="parent")` with only status, output report path, and digest.
MODEL_SELECTOR: `prime-proxy-anthropic/claude-opus-5`
EFFORT: `high`

In `ipython`, set `worktree_root` from WORKTREE_ROOT and execute `os.chdir(worktree_root)`. Before any spec is frozen, state a falsifiable value hypothesis; develop at least two materially competing approaches; identify the cost-if-wrong for the chosen approach and each rejected alternative; and identify risky unknowns. Where risk exists, run or specify a real-source/real-format spike using the actual dependency, protocol, file format, scale shape, and observable behavior. Do not replace this with fixture-only evidence.

Write recommendation, alternatives, evidence, spike results, remaining uncertainty, and acceptance implications to OUTPUT_REPORT_PATH. This Opus frontier report is one council input, not unilateral approval.
