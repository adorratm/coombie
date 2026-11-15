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

/* ───────────── the ten newer modes (extraModes.ts) ───────────── */

export const CONVOY_HP = 100;
/** m/s while a hero is near the truck */
export const CONVOY_SPEED = 1.25;
/** stops on the way (each held under fire) */
export const CONVOY_CHECKPOINTS = 3;
export const CONVOY_CHECKPOINT_SECONDS = 30;
/** seconds between road ambushes while rolling */
export const CONVOY_AMBUSH_SECONDS = 16;
/** hp per second the crew patches back when no zombie is at the truck */
export const CONVOY_REPAIR = 1.2;
export const SUPPLY_CRATES = 8;
export const SUPPLY_SECONDS = 10 * 60;
export const KING_RADIUS = 6;
export const KING_TARGET = 150;
export const KING_MOVE_SECONDS = 75;
export const NESTS = 5;
export const NEST_PLANT_SECONDS = 6;
export const DARK_SECONDS = 12 * 60;
export const SIEGE_SECONDS = 12 * 60;
export const MUTATION_EVERY = 90;
export const MUTATION_SECONDS = 15 * 60;
export const ONELIFE_SECONDS = 12 * 60;
export const DELIVERIES = 4;
export const INFECTION_SECONDS = 12 * 60;
/** share of max hp lost per second while no sample was collected for 2 s */
export const INFECTION_DRAIN = 0.012;
/** share of max hp a collected sample restores */
export const INFECTION_SAMPLE_HEAL = 0.05;

export type MutationId = 'fast' | 'tough' | 'brutal' | 'giant' | 'swarm';
export const MUTATIONS: Record<MutationId, { name: string; desc: string }> = {
  fast: { name: 'Çevik', desc: 'zombiler %18 daha hızlı' },
  tough: { name: 'Kalın Deri', desc: 'zombilerin canı %35 fazla' },
  brutal: { name: 'Vahşi', desc: 'zombiler %30 sert vuruyor' },
  giant: { name: 'Dev Hücre', desc: 'zombiler büyüyor ve dayanıklılaşıyor' },
  swarm: { name: 'Sürü Bilinci', desc: 'daha kalabalık geliyorlar' },
};
const MUTATION_ORDER: MutationId[] = ['fast', 'tough', 'swarm', 'brutal', 'giant', 'fast', 'tough', 'swarm', 'brutal', 'giant'];
/** Mutations active after `t` seconds (one more every MUTATION_EVERY). */
export function mutationAt(t: number): MutationId[] {
  const n = Math.min(MUTATION_ORDER.length, Math.floor(t / MUTATION_EVERY));
  return MUTATION_ORDER.slice(0, n);
}
