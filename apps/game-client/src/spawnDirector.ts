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

/*
 * ───────── late game ─────────
 * Heroes keep stacking levels, evolutions and items, so after the opening ~12 minutes
 * zombies grow on two tracks: a fixed curve by run time, and an adaptive tuner that
 * notices when the heroes clear the field faster than it fills.
 */

/** extra zombie health by run minute (1 until minute 12) */
export function lateHpMul(min: number): number {
  const a = Math.max(0, min - 12);
  const b = Math.max(0, min - 30);
  return 1 + a * 0.045 + b * b * 0.0012;
}

/** extra zombie damage by run minute (1 until minute 15) */
export function lateDamageMul(min: number): number {
  return 1 + Math.max(0, min - 15) * 0.03;
}

/** zombies get a little quicker late (capped at +30 %) */
export function lateSpeedMul(min: number): number {
  return 1 + Math.min(0.3, Math.max(0, min - 15) * 0.007);
}

export interface PressureSample {
  simTime: number;
  /** zombies alive now */
  alive: number;
  /** what the director wants alive */
  target: number;
  /** 0..1 hero health */
  heroHp: number;
}

/**
 * Adaptive late-game pressure. Every few seconds (after the opening) it checks how
 * full the field is: if the heroes keep it mostly empty they are out-killing the
 * spawns, so new zombies get tougher; if the field is packed and the hero is low,
 * it eases off a little. Only health and damage of new spawns change.
 */
export class PressureTuner {
  /** health multiplier for new spawns */
  hpMul = 1;
  /** damage multiplier for new spawns (grows slower than health) */
  dmgMul = 1;
  private acc = 0;
  private fill = 0;
  private samples = 0;
  static readonly START_SECONDS = 600;
  static readonly WINDOW = 10;
  static readonly MAX = 12;

  update(dt: number, s: PressureSample): void {
    if (s.simTime < PressureTuner.START_SECONDS || s.target <= 0) return;
    this.acc += dt;
    this.fill += Math.min(1.5, s.alive / s.target);
    this.samples++;
    if (this.acc < PressureTuner.WINDOW) return;
    const fill = this.fill / Math.max(1, this.samples);
    this.acc = 0;
    this.fill = 0;
    this.samples = 0;
    let k = 1;
    if (fill < 0.45) k = 1.14;
    else if (fill < 0.7) k = 1.06;
    else if (fill > 0.95 && s.heroHp < 0.35) k = 0.92;
    this.hpMul = Math.max(1, Math.min(PressureTuner.MAX, this.hpMul * k));
    this.dmgMul = Math.pow(this.hpMul, 0.35);
  }
}
