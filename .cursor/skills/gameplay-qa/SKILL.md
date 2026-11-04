---
name: gameplay-qa
description: Use after gameplay, UI, progression, save, enemy, or combat changes to independently verify behavior and regressions.
---
# Gameplay QA workflow

Act as a skeptical tester, not the feature author.

- Read the feature request and acceptance criteria.
- Inspect the diff and identify likely failure points.
- Run available automated tests/build checks found in the repository.
- Create reproducible manual test cases for normal, edge, failure, pause/resume, restart, death/victory, and scene transitions.
- Verify save/load and old-save compatibility when relevant.
- Check that UI, audio, VFX, and gameplay state remain synchronized.
- Do not infer runtime success from compilation.
- Report: passed, failed, not tested, reproduction steps, severity, and evidence.
- Do not silently modify the implementation while reviewing; report defects first unless explicitly asked to fix them.
