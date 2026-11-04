---
name: technical-art-animation
description: Use when improving visual readability, VFX, animation state flow, materials, lighting, particles, sprite/model import, or art pipeline.
---
# Technical art workflow

- Inspect the actual renderer, asset formats, import settings, animation system, material/shader conventions, and target resolution.
- Preserve the established visual direction; do not assume 2D, 2.5D, or 3D until confirmed.
- Prioritize gameplay readability: player silhouette, enemy roles, attack telegraphs, hit feedback, pickups, interactables, and danger zones.
- For animation, document states, transitions, blend conditions, interruption rules, and fallback poses.
- For VFX, define trigger, duration, scale, layering, color/shape language, lifetime, pooling/cleanup, and overdraw risks.
- Check visual effects at normal gameplay zoom and at peak enemy density.
- Do not invent asset paths or claim assets exist. If an asset is missing, provide a clear asset brief and integration point.
- Avoid expensive full-screen effects or excessive transparency without profiling.
