/**
 * How each melee weapon is swung: which mocap segment plays, how the
 * procedural fallback pose moves, and what the swing trail looks like.
 */
export type MeleeStyle = 'stab' | 'swing' | 'chop' | 'slash';

export interface MeleeStyleDef {
  id: MeleeStyle;
  /** mocap segment (operator.anim.json clip, seconds) and its ideal playback length */
  clip: { id: string; from: number; to: number; dur: number };
  /** procedural pose weights, all 0..1.5: arm raise on wind-up, sideways sweep, forward thrust, torso twist */
  pose: { raise: number; sweep: number; thrust: number; twist: number };
  /** camera shake on swing */
  shake: number;
  /** swing duration as a fraction of the weapon's fire interval */
  tempo: number;
}

export const MELEE_STYLES: Record<MeleeStyle, MeleeStyleDef> = {
  // knife: short jab straight ahead
  stab: { id: 'stab', clip: { id: 'castShove', from: 1.0, to: 1.75, dur: 0.3 }, pose: { raise: 0.2, sweep: 0.1, thrust: 1.3, twist: 0.3 }, shake: 0.04, tempo: 0.8 },
  // bat: wide sideways swing from the shoulder
  swing: { id: 'swing', clip: { id: 'castMelee', from: 0.3, to: 1.6, dur: 0.5 }, pose: { raise: 0.6, sweep: 1.4, thrust: 0.3, twist: 1.2 }, shake: 0.08, tempo: 0.9 },
  // axe: slow overhead chop
  chop: { id: 'chop', clip: { id: 'castMelee', from: 0.15, to: 1.9, dur: 0.66 }, pose: { raise: 1.5, sweep: 0.2, thrust: 0.5, twist: 0.5 }, shake: 0.16, tempo: 0.92 },
  // machete: fast diagonal cut
  slash: { id: 'slash', clip: { id: 'castThrow', from: 0.95, to: 1.9, dur: 0.38 }, pose: { raise: 1.0, sweep: 0.9, thrust: 0.4, twist: 0.8 }, shake: 0.07, tempo: 0.85 },
};

const BY_VARIANT: Record<string, MeleeStyle> = { knife: 'stab', bat: 'swing', axe: 'chop', machete: 'slash' };

/** Style for a weapon variant; unknown melee weapons swing like a bat. */
export function meleeStyleOf(variant: string): MeleeStyle {
  return BY_VARIANT[variant] ?? 'swing';
}

/** Clip playback length: the style's own, but never longer than the weapon can swing. */
export function meleeClipSeconds(style: MeleeStyle, fireRate: number): number {
  const def = MELEE_STYLES[style];
  return Math.max(0.18, Math.min(def.clip.dur, fireRate * def.tempo));
}
