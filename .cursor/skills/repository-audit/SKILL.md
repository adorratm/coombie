---
name: repository-audit
description: Use first on an unfamiliar or existing game repository to discover the real engine, language, architecture, build workflow, gameplay systems, assets, and risks without modifying files.
---
# Repository audit

1. Inspect root files, directory tree, manifests, project files, build scripts, CI, tests, asset metadata, and documentation.
2. Identify engine/framework, language(s), renderer, physics, audio, input, UI, animation, entity model, serialization/save system, and target platforms. Cite exact file paths as evidence.
3. Trace the playable loop: boot/menu -> run setup -> gameplay -> XP/upgrade -> boss/wave -> death/victory -> results/meta progression.
4. Trace key systems: player, enemy, weapon, projectile, damage, spawn director, progression, UI, audio, VFX, save/load.
5. Identify performance-sensitive code paths and existing profiling/test facilities.
6. Record build, run, test, lint, and packaging commands only when found in repository evidence.
7. Separate confirmed facts, likely inferences, and unknowns.
8. Do not edit source, assets, project settings, or dependencies during the audit.

## Deliverables
Create or update `docs/PROJECT_PROFILE.md` with:
- Verified technology stack and evidence paths
- Repository map
- Runtime architecture and key entry points
- Current gameplay loop and implemented systems
- Build/test/run commands
- Asset pipeline and file formats
- Save-data and compatibility notes
- Performance risks and known limitations
- Open questions requiring the developer

Finish with a prioritized list of 10 improvements. Each item must include player value, technical risk, estimated scope (S/M/L), dependencies, and a suggested validation method.
