/** Pure rules for the objective modes, kept apart from three.js so they can be tested. */

export const ZONE_COUNT = 4;
export const ZONE_RADIUS = 6;
export const ZONE_HOLD_SECONDS = 35;
/** progress lost per second while nobody stands in the zone */
export const ZONE_DECAY = 0.5;

export const HUNT_TARGETS = 6;
export const HUNT_RESPITE_SECONDS = 8;
export const HUNT_TARGET_HP_MUL = 2.6;

export const BLITZ_SECONDS = 7 * 60;
export const BLITZ_BASE_KILLS = 260;
/** seconds added to the clock when a boss dies */
export const BLITZ_BOSS_BONUS = 25;

export interface Point {
  x: number;
  z: number;
}

/** Capture progress after `dt`: grows while held, drains (never below zero) while empty. */
export function zoneProgress(current: number, dt: number, held: boolean): number {
  return held ? current + dt : Math.max(0, current - dt * ZONE_DECAY);
}

/** Next zone: the candidate farthest from `from` that has not been used, so the squad has to move. */
export function pickNextZone(candidates: readonly Point[], used: ReadonlySet<number>, from: Point): number {
  let best = -1;
  let bestDist = -1;
  candidates.forEach((c, i) => {
    if (used.has(i)) return;
    const d = (c.x - from.x) ** 2 + (c.z - from.z) ** 2;
    if (d > bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** Kill quota for Katliam, scaled by how crowded the difficulty is. */
export function blitzTarget(countMul: number): number {
  return Math.round((BLITZ_BASE_KILLS * countMul) / 10) * 10;
}

/** Which infected the hunt marks: tougher kinds as the list goes on, a boss last. */
export function huntTargetKind(index: number): 'tank' | 'riot' | 'hooker' | 'boss' {
  if (index >= HUNT_TARGETS - 1) return 'boss';
  return (['tank', 'riot', 'hooker'] as const)[index % 3]!;
}
