---
name: ui-skills-motion
description: Standards from ui-skills.com for smooth animations, zero layout thrashing, and high-performance 60+ FPS UI transitions.
---
# UI Skills Motion & Performance (from ui-skills.com)

- **Compositor Only**: Animate purely on GPU compositor properties (`transform`, `opacity`, `filter`). Avoid modifying layout properties (`width`, `height`, `top`, `margin`) during frequent animations.
- **Micro-Interaction Durations**: Keep HUD feedback snappy (damage numbers, card hover, button taps: 100-200ms). Never stall user inputs with sluggish animations.
- **Screen Shake & Punch**: Combat camera shake and recoil punch must use damped springs or decay curves, preventing jarring camera disorientation.
- **Accessibility**: Provide support for reduced-motion settings or sensible fallbacks for high-frequency strobe effects (e.g. muzzle flashes and hit flashes).

