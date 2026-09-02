# Prime worker dispatch prompt

ROLE_MARKER: `WORKER:<task-id>` (dispatcher must validate this exact assigned role)
WORKTREE_ROOT: `<canonical absolute worktree root>`
IMMUTABLE_INPUT_OR_RANGE: `<SHA-256 task brief and frozen BASE commit>`
MUTATION_POLICY: `<explicit allowed paths from the current task only>`
OUTPUT_REPORT_PATH: `<absolute .superpowers/sdd/<plan>/reports/<unique-child>.md>`
DEADLINE_AT: `<absolute UTC timestamp>`
PARENT_NOTIFICATION: after the report is written and fsynced, compute SHA-256 and call `agent_message.send(receiver_role="parent")` with only status, output report path, and digest.
MODEL_SELECTOR: `<full provider/model selector resolved by the one rlm.find_models pass>`
EFFORT: `<explicit policy effort>`

In `ipython`, set `worktree_root` from WORKTREE_ROOT and execute `os.chdir(worktree_root)` before any read, command, or mutation. Verify the immutable task brief/digest and BASE. Work on exactly one item. Write the named failing test and capture the expected red before the minimum product change; then capture green, run the frozen acceptance commands and repository gate, self-review the diff, and commit locally. Use the target's real source and real interfaces. For performance or serialization claims, use format-identical inputs and outputs; do not substitute a toy format. Do not touch paths outside MUTATION_POLICY.

Write exact commands, pass/fail counts, red/green evidence, commit, changed paths, unresolved risks, and real-source verification to OUTPUT_REPORT_PATH. The disk report, not a child return value, is authoritative.
