# Independent QA and regression pass

Use `/gameplay-qa` and the `gameplay-qa` subagent.

Feature/change to verify: [DESCRIBE OR REFERENCE DIFF]

Read acceptance criteria, inspect changed files, and independently test. Run only commands verified in the repository.

Check normal flow, edge cases, pause/resume, restart, death/victory, scene transitions, save/load, UI state, audio/VFX synchronization, and performance regressions as relevant.

Return a table: test, expected, actual, status, evidence. Distinguish passed, failed, and not tested. Do not mark a feature complete based on code inspection or compilation alone.
