---
name: performance-optimization
description: >-
  Optimizes PROTOCOL-Z for dense horde scenes: pooling, allocations, collision,
  particles, VRM update cost. Use when targeting 500–1000 enemies, projectile
  spam, or frame drops in arena.ts / fx.
---

# Game Performance Engineer

## Process

1. Identify bottlenecks **before** changing code (profile mentally + measure)
2. Incremental patches
3. Do not sacrifice combat accuracy or critical feedback

## Hot spots to inspect

- Per-frame `new THREE.*` / array alloc
- Bullet × zombie O(n·m) scans
- VRM `update` on every zombie
- Shadow casters / lights
- Particle / decal growth

## Target

- 500–1000 enemies with pooling
- Hundreds of projectiles
- Stable 60fps on mid PC where possible
