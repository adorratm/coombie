---
name: performance-profiling
description: Use when investigating frame drops, memory growth, high enemy/projectile counts, rendering cost, loading stalls, or Steam PC performance.
---
# Performance profiling workflow

1. Establish a reproducible workload and target hardware assumptions. Ask for them if missing.
2. Capture baseline frame time (CPU/GPU if available), memory, entity counts, draw calls/batches, physics cost, and loading time using the project's actual tools.
3. Identify the dominant bottleneck with evidence. Do not optimize by intuition.
4. Propose ranked fixes with expected impact, complexity, and gameplay/visual risks.
5. Change one bottleneck at a time.
6. Re-run the same workload and compare before/after.
7. Stress test peak enemy count, projectile count, VFX, boss effects, pause/resume, and repeated run restarts.
8. Check for leaks, stale pooled objects, event subscriptions, dangling references, and unbounded queues.
9. Report exact measurements or state that profiling could not be performed.
