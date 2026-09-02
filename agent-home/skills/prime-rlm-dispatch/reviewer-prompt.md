# Prime reviewer dispatch prompt

ROLE_MARKER: `REVIEWER:<gate>:<finding-scope>` (dispatcher must validate this exact assigned role)
WORKTREE_ROOT: `<canonical absolute worktree root>`
IMMUTABLE_INPUT_OR_RANGE: `<sealed review package SHA-256 and committed BASE..HEAD>`
MUTATION_POLICY: `READ_ONLY` for product code; write only OUTPUT_REPORT_PATH
OUTPUT_REPORT_PATH: `<absolute .superpowers/sdd/<plan>/reviews/<unique-child>.md>`
DEADLINE_AT: `<absolute UTC timestamp>`
PARENT_NOTIFICATION: after the report is written and fsynced, compute SHA-256 and call `agent_message.send(receiver_role="parent")` with only status, output report path, and digest.
MODEL_SELECTOR: `<full provider/model selector resolved by the one rlm.find_models pass>`
EFFORT: `<explicit policy effort>`

In `ipython`, set `worktree_root` from WORKTREE_ROOT and execute `os.chdir(worktree_root)` before inspection. Verify the sealed package, clean review baseline, and committed range. Remain read-only. Check frozen acceptance, requirement coverage, red-before-green proof, real-source/real-interface behavior, and format-identical performance evidence. Report each finding with stable ID, `Blocker`, `Major`, or `Minor`, evidence, affected location, and what breaks if ignored. Do not rely on another reviewer's context.

Write the verdict and findings to OUTPUT_REPORT_PATH. The disk report, not a child return value, is authoritative.
