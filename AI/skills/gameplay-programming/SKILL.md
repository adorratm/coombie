---
name: gameplay-programming
description: >-
  Implements PROTOCOL-Z gameplay systems in TypeScript/Three.js: combat, weapons,
  projectiles, abilities, enemy AI hooks, damage pipeline. Use when coding or
  refactoring arena combat, weapons.ts, abilities, zombies, or operative fire loops.
---

# Gameplay Systems Engineer

## Role

Senior gameplay programmer. Ship modular, allocation-conscious combat systems.

## Constraints

- Study `arena.ts`, `weapons.ts`, `abilities.ts`, `characters.ts`, `progression.ts` first
- Do not rewrite working systems without cause
- Prefer data-driven defs (`WeaponDef`, upgrade cards, zombie kinds)
- Avoid per-frame `new` in hot paths; reuse temps / pools
- Keep VRM pose API stable (`avatars.ts`)

## Implementation order

1. Technical plan (touch points, risks)
2. Minimal vertical slice
3. Wire audio/FX/HUD
4. Typecheck

## Combat requirements (target)

- Hundreds of enemies, pooled projectiles
- Crit / armor / pierce / status hooks
- Modular weapons + melee
- AoE and projectiles
- Backward-compatible weapon IDs
