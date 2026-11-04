---
name: enemy-boss-design
description: Use when designing zombie archetypes, elite enemies, spawn director logic, boss phases, telegraphs, and encounter pacing.
---
# Enemy and boss design workflow

1. Inspect enemy base types, movement, navigation, targeting, damage, animation, spawn director, and reward flow.
2. Design enemies around readable roles: pressure, flanking, zoning, disruption, tanking, summoning, or support.
3. For each archetype specify silhouette, movement, attack loop, range, damage window, telegraph, counterplay, resistances, spawn rules, reward, and scaling.
4. For bosses define phases, transition conditions, arena interaction, attack patterns, safe zones, telegraphs, recovery windows, and fail states.
5. Avoid unavoidable damage and overlapping attacks that obscure all counterplay.
6. Define difficulty scaling without simply multiplying HP. Consider composition, spawn cadence, pressure, and mechanics.
7. Validate enemy combinations, not just enemies in isolation.
8. Add reproducible encounter seeds/scenarios where supported and test lifecycle cleanup.
