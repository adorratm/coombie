/**
 * Spawn pacing — pure numbers, no scene access (unit-tested).
 *
 * Design: a run opens quiet (a handful of walkers), reaches "normal" pressure after
 * ~3.5 minutes and keeps growing with the wave. Every HORDE_EVERY-th wave is a horde:
 * announced a few seconds early, bigger, denser, and its zombies move faster.
 */

/** client horde cadence (waves are 45 s → a horde every 3 minutes, first at wave 4) */
export const HORDE_EVERY = 4;
/** seconds of warning before a horde wave starts */
export const HORDE_WARN_SECONDS = 6;
/** seconds until the opening ramp is over */
export const RAMP_SECONDS = 210;

export function isHordeWave(wave: number): boolean {
  return wave >= HORDE_EVERY && wave % HORDE_EVERY === 0;
}

/** 0 → 1 over the opening minutes */
export function openingRamp(simTime: number): number {
  return Math.max(0, Math.min(1, simTime / RAMP_SECONDS));
}

/** zombies placed before the first wave tick */
export function initialSpawnCount(countMul: number): number {
  return Math.max(1, Math.round(2 * countMul));
}

/** how many zombies the director tries to keep alive (before the hard cap) */
export function aliveTarget(simTime: number, wave: number, countMul: number, modeMul = 1): number {
  const base = 4 + 8 * openingRamp(simTime) + Math.min(40, Math.max(0, wave - 1) * 1.8);
  return Math.round(base * countMul * Math.min(1.8, modeMul));
}

/** extra bodies allowed above the target while a wave budget is draining */
export function aliveSlack(wave: number, horde: boolean): number {
  return (horde ? 14 : 4) + Math.min(6, Math.max(0, wave - 1));
}

/** spawns per second */
export function spawnRate(simTime: number, wave: number, horde: boolean): number {
  const r = 0.55 + openingRamp(simTime) * 1.4 + wave * 0.07;
  return horde ? r * 1.8 : r;
}

/** zombies added by a new wave */
export function waveBudget(wave: number): number {
  const base = Math.round(6 + wave * 3.2);
  if (isHordeWave(wave)) return Math.min(120, Math.round(base * 2.2));
  return Math.min(100, base);
}

/** chance per second of an ambient top-up spawn while below the alive target */
export function ambientRate(simTime: number, wave: number): number {
  return 0.35 + openingRamp(simTime) * 1.15 + Math.max(0, wave - 1) * 0.08;
}

/** zombies hit softer in the opening minutes (the start was too punishing) */
export function earlyDamageMul(simTime: number): number {
  return 0.65 + 0.35 * openingRamp(simTime);
}

/** zombie health per wave: linear early, extra growth after wave 15 so late runs don't empty the map */
export function zombieHpMul(wave: number): number {
  const w = Math.max(0, wave - 1);
  const late = Math.max(0, wave - 15);
  return 1 + w * 0.12 + late * late * 0.003;
}

/** horde zombies are a bit faster than the regular ones, more so later */
export function hordeSpeedMul(wave: number): number {
  return 1.15 + Math.min(0.15, Math.max(0, wave) * 0.005);
}
