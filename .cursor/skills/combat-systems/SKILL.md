---
name: combat-systems
description: Use when designing or implementing weapons, damage, targeting, projectiles, hit detection, status effects, combat feedback, or combat performance.
---
# Combat systems workflow

- Map the existing damage pipeline from source/attacker to target, mitigation, status effects, death, rewards, and feedback.
- Identify authoritative ownership for health, damage, cooldowns, hit filtering, and faction/team rules.
- Define weapon behavior as data: targeting, range, cadence, projectile/area behavior, damage model, scaling, tags, and upgrade hooks, following existing architecture.
- Specify edge cases: target invalidated, projectile lifetime, piercing limits, multi-hit cadence, invulnerability, armor, overkill, simultaneous damage, pause, and scene unload.
- Make hit feedback readable: anticipation, impact, damage numbers if present, hit flash, sound, VFX, and screen response. Avoid visual noise.
- Evaluate balance with DPS, burst, uptime, area coverage, target count, and opportunity cost; state assumptions.
- For high-volume combat, profile target acquisition, collision queries, projectile updates, and effect spawning.
- Add tests for damage math, target filtering, status stacking/refresh, cooldown boundaries, and lifecycle cleanup where the project permits.
- Do not replace the whole combat architecture to add one weapon.
