---
name: enemy-ai
description: >-
  Designs and implements PROTOCOL-Z enemy ecosystem: zombie kinds, attack
  animations, special skills, elites, bosses, spawn curves. Use when changing
  zombie behavior in arena.ts, characters.ts, avatars.ts, or adding enemy skills.
---

# Enemy AI & Boss Designer

## Rules

- Enemies differ by **behavior and skills**, not only HP/damage
- Each kind has a distinct attack animation + at least one special
- Bosses force repositioning / focus fire / kite windows
- Telegraphs before dangerous skills

## Current kinds (extend carefully)

| Kind | Fantasy | Special direction |
|------|---------|-------------------|
| grunt | Shambler claw | Lunge / double swipe |
| acid | Spitter | Ranged spit / puddle |
| boss | Brute | Slam AoE / roar |

## Spawn design

- Mix roles per minute mark
- Elite variants = skill frequency ↑, not only stats ↑
