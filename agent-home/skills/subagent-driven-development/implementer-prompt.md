# SDD implementer prompt

ROLE_MARKER: `WORKER:IMPLEMENTER:<task-id>` (validated before dispatch)
WORKTREE_ROOT: `<canonical absolute worktree root>`
IMMUTABLE_INPUT_OR_RANGE: `<task-brief SHA-256, plan SHA-256, and BASE commit>`
MUTATION_POLICY: `<only the current task's explicit Files list>`
OUTPUT_REPORT_PATH: `<absolute .superpowers/sdd/<plan>/reports/task-<id>-implementer.md>`
DEADLINE_AT: `<absolute UTC timestamp; normally no more than 90 minutes>`
PARENT_NOTIFICATION: write and fsync the report, compute SHA-256, then call `agent_message.send(receiver_role="parent")` with only status, output report path, and digest.
MODEL_SELECTOR: `<full provider/model selector from the one rlm.find_models pass>`
EFFORT: `<explicit max or high from model policy>`

In `ipython`, assign `worktree_root` from WORKTREE_ROOT and run `os.chdir(worktree_root)` before any operation. Verify immutable inputs and clean scope. Implement exactly one item with strict TDD: capture the required absence/import red, then the named behavioral red, then make the minimum product change. Run item tests, package test, and frozen gate. Verify assumptions against real source and real behavior; a mock cannot prove a real integration claim. Use format-identical evidence for performance/serialization. Commit locally, self-review, and write commands, counts, evidence paths, commit, diff scope, risks, and anything not genuinely verified to OUTPUT_REPORT_PATH.
