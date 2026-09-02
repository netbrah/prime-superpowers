# SDD fresh re-review prompt

ROLE_MARKER: `REVIEWER:RE-REVIEW:<task-id>:<round>` (validated before dispatch; reviewer must be fresh)
WORKTREE_ROOT: `<canonical absolute worktree root>`
IMMUTABLE_INPUT_OR_RANGE: `<new sealed fix-package SHA-256, prior finding IDs, and committed FIX_BASE..HEAD>`
MUTATION_POLICY: `READ_ONLY` for product code; write only OUTPUT_REPORT_PATH
OUTPUT_REPORT_PATH: `<absolute .superpowers/sdd/<plan>/reviews/task-<id>-round-<round>.md>`
DEADLINE_AT: `<absolute UTC timestamp; normally no more than 45 minutes>`
PARENT_NOTIFICATION: write and fsync the report, compute SHA-256, then call `agent_message.send(receiver_role="parent")` with only status, output report path, and digest.
MODEL_SELECTOR: `<full provider/model selector from the one rlm.find_models pass>`
EFFORT: `<explicit max or high from model policy>`

In `ipython`, assign `worktree_root` from WORKTREE_ROOT and run `os.chdir(worktree_root)`. Verify the new immutable package and range. With fresh context, test each prior finding against current real source and behavior, check for regressions and scope drift, and remain read-only. Performance evidence must be format-identical. For each finding write `resolved`, `open`, or `cannot verify`, evidence, current severity, and what breaks if ignored. Write the scoped verdict to OUTPUT_REPORT_PATH; do not inherit an earlier reviewer's conclusion.
