---
name: feature-vertical-slice
description: Use to implement a complete, bounded gameplay or UI feature in the existing game while minimizing regressions.
---
# Feature vertical slice

1. Read `docs/PROJECT_PROFILE.md`; verify relevant facts against current source.
2. Convert the request into player-visible behavior and testable acceptance criteria.
3. Locate existing systems and identify the narrowest extension point.
4. Present a short plan: files, data/config changes, risks, tests, and fallback.
5. Implement one complete slice; do not opportunistically refactor unrelated code.
6. Add/update tests or deterministic debug scenarios using project conventions.
7. Run the smallest relevant checks, then broader build/tests if feasible.
8. Perform or describe a runtime smoke test. Do not claim visual/runtime success without observing it.
9. Update docs/profile only if architecture or commands changed.
10. Report changed files, acceptance criteria status, checks run, and remaining risks.

Stop and ask before destructive asset conversion, save-format breakage, engine migration, or broad architecture changes.
