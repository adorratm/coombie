# PROTOCOL-Z — AI Agent System

Survivor-like (YAZ / Vampire Survivors–adjacent) development agents for this repo.
**Do not copy proprietary assets, characters, or content** from commercial games.
Use these roles when the task matches. Prefer the **single most specific** skill.

## Project context

- Monorepo: Yarn workspaces
- Game client: `apps/game-client` — Three.js + VRM, Vite
- Systems: weapons, progression cards, abilities, rescue squad, audio (CC0 samples)
- Design north star: deep buildcraft, readable combat, distinct class identities

## Agents

| Agent | File | Primary skills |
|-------|------|----------------|
| Game Designer | [agents/game-designer.md](agents/game-designer.md) | game-design, roguelike-progression, game-balancing |
| Gameplay Engineer | [agents/gameplay-engineer.md](agents/gameplay-engineer.md) | gameplay-programming, combat-design, enemy-ai |
| Technical Artist | [agents/technical-artist.md](agents/technical-artist.md) | ui-ux-design, combat-design (VFX readability) |
| QA Engineer | [agents/qa-engineer.md](agents/qa-engineer.md) | performance-optimization, game-balancing |

## Skills

| Skill | Path |
|-------|------|
| Game Design Specialist | [skills/game-design/SKILL.md](skills/game-design/SKILL.md) |
| Gameplay Systems Engineer | [skills/gameplay-programming/SKILL.md](skills/gameplay-programming/SKILL.md) |
| Roguelike Progression Designer | [skills/roguelike-progression/SKILL.md](skills/roguelike-progression/SKILL.md) |
| Enemy AI & Boss Designer | [skills/enemy-ai/SKILL.md](skills/enemy-ai/SKILL.md) |
| UI/UX Game Designer | [skills/ui-ux-design/SKILL.md](skills/ui-ux-design/SKILL.md) |
| Game Balancing Specialist | [skills/game-balancing/SKILL.md](skills/game-balancing/SKILL.md) |
| Game Performance Engineer | [skills/performance-optimization/SKILL.md](skills/performance-optimization/SKILL.md) |
| Combat Design | [skills/combat-design/SKILL.md](skills/combat-design/SKILL.md) |

## Workflow

1. **Audit / roadmap** → Game Designer + Prompt 1 (`prompts/01-design-audit.md`) — **no code**
2. **Combat / weapons / AI** → Gameplay Engineer — plan first, then patch
3. **Progression / cards / meta** → Roguelike Progression + Balancing
4. **HUD / upgrade UX** → Technical Artist / UI-UX
5. **Lag / pooling / 500+ enemies** → Performance Engineer

## Hard rules

- Study existing architecture before rewriting
- Prefer incremental patches over greenfield rewrites
- TypeScript, no `any`, match `apps/game-client` style
- License-safe assets only (CC0 / owned)
- Turkish UI copy when touching player-facing strings
