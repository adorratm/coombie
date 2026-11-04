---
name: ui-ux-survivor
description: Use when designing or implementing HUD, menus, character selection, upgrade choices, pause, results, settings, accessibility, or Steam-facing UI.
---
# UI/UX workflow

- Inspect current UI framework, resolution/scaling approach, input navigation, localization, fonts, and screen transitions.
- Design for keyboard and controller navigation where supported; do not assume controller support exists.
- Prioritize in-run information: health, XP/progress, level-up choice, cooldown/resource, objective, boss/wave status, and threat cues as relevant.
- Upgrade choices must communicate effect, rarity, current value, new value, and synergy where applicable.
- Preserve readability at target PC resolutions and common aspect ratios; account for safe areas and UI scaling.
- Include focus states, disabled states, pause behavior, confirmation for destructive actions, and clear feedback.
- Avoid blocking combat with excessive UI and avoid relying on color alone.
- Test menu flow, focus order, back navigation, resolution changes, and localization expansion where supported.
