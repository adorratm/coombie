import { spawnBudgetForLevel, waveKindForLevel } from '@protocol-z/shared';

/** Playable arena kinds. */
export type ZombieKind = 'grunt' | 'runner' | 'tank' | 'acid' | 'boss' | 'screamer';

export type ZombieAvatarKind = 'grunt' | 'acid' | 'boss';
export type ZombieSfxKind = 'grunt' | 'acid' | 'boss';

export interface ZombieKindStats {
  scale: number;
  fleshBase: [number, number, number];
  clothBase: [number, number, number];
  eyeColor: number;
  glow: number;
  emissiveIntensity: number;
  maxHp: number;
  speed: number;
  attackDamage: number;
  xpValue: number;
  barWidth: number;
  barY: number;
  barColor: number;
  silhouette: 'none' | 'boss' | 'acid' | 'runner' | 'tank' | 'screamer';
}

export function toZombieAvatarKind(kind: ZombieKind): ZombieAvatarKind {
  if (kind === 'acid') return 'acid';
  if (kind === 'boss' || kind === 'tank') return 'boss';
  // screamer / runner / grunt → lean grunt mesh
  return 'grunt';
}

export function toZombieSfxKind(kind: ZombieKind): ZombieSfxKind {
  if (kind === 'acid') return 'acid';
  if (kind === 'boss' || kind === 'tank') return 'boss';
  if (kind === 'screamer') return 'boss';
  return 'grunt';
}

export function rollZombieStats(kind: ZombieKind): ZombieKindStats {
  if (kind === 'boss') {
    const scale = 2.2;
    return {
      scale,
      fleshBase: [70, 28, 28],
      clothBase: [32, 36, 30],
      eyeColor: 0xff2a2a,
      glow: 0xb91c1c,
      emissiveIntensity: 0.35,
      maxHp: 80,
      speed: 1.55,
      attackDamage: 18,
      xpValue: 40,
      barWidth: 0.9 * scale + 0.6,
      barY: 3.4 * scale,
      barColor: 0xef4444,
      silhouette: 'boss',
    };
  }
  if (kind === 'tank') {
    const scale = 1.55;
    return {
      scale,
      fleshBase: [62, 42, 36],
      clothBase: [28, 30, 34],
      eyeColor: 0xfbbf24,
      glow: 0xb45309,
      emissiveIntensity: 0.28,
      maxHp: 42,
      speed: 1.35,
      attackDamage: 12,
      xpValue: 16,
      barWidth: 0.9 * scale + 0.25,
      barY: 2.7 * scale,
      barColor: 0xf59e0b,
      silhouette: 'tank',
    };
  }
  if (kind === 'acid') {
    const scale = 1.15;
    return {
      scale,
      fleshBase: [58, 88, 28],
      clothBase: [40, 55, 22],
      eyeColor: 0xc8ff2a,
      glow: 0x84cc16,
      emissiveIntensity: 0.35,
      maxHp: 14,
      speed: 2.9,
      attackDamage: 8,
      xpValue: 8,
      barWidth: 0.9 * scale,
      barY: 2.35 * scale,
      barColor: 0x84cc16,
      silhouette: 'acid',
    };
  }
  if (kind === 'screamer') {
    const scale = 1.22;
    return {
      scale,
      fleshBase: [72, 48, 88],
      clothBase: [40, 28, 52],
      eyeColor: 0xe879f9,
      glow: 0xa21caf,
      emissiveIntensity: 0.42,
      maxHp: 16,
      speed: 2.55,
      attackDamage: 4,
      xpValue: 12,
      barWidth: 0.95 * scale,
      barY: 2.55 * scale,
      barColor: 0xd946ef,
      silhouette: 'screamer',
    };
  }
  if (kind === 'runner') {
    const scale = 0.82 + Math.random() * 0.1;
    return {
      scale,
      fleshBase: [42, 62, 68],
      clothBase: [28, 40, 48],
      eyeColor: 0x22d3ee,
      glow: 0x0e7490,
      emissiveIntensity: 0.3,
      maxHp: 5 + Math.floor(Math.random() * 2),
      speed: 4.35 + Math.random() * 0.55,
      attackDamage: 4,
      xpValue: 5,
      barWidth: 0.85 * scale,
      barY: 2.25 * scale,
      barColor: 0x22d3ee,
      silhouette: 'runner',
    };
  }
  const scale = 0.92 + Math.random() * 0.22;
  return {
    scale,
    fleshBase: [48, 58, 42],
    clothBase: [32, 36, 30],
    eyeColor: 0xff2a2a,
    glow: 0x7f1d1d,
    emissiveIntensity: 0.12,
    maxHp: 6 + Math.floor(Math.random() * 3),
    speed: 2.15 + Math.random() * 0.85,
    attackDamage: 5,
    xpValue: 3,
    barWidth: 0.9 * scale,
    barY: 2.35 * scale,
    barColor: 0xef4444,
    silhouette: 'none',
  };
}

export function engageRangeFor(kind: ZombieKind): number {
  if (kind === 'acid') return 7.5;
  if (kind === 'screamer') return 6.4;
  if (kind === 'boss') return 2.4;
  if (kind === 'tank') return 1.85;
  if (kind === 'runner') return 1.35;
  return 1.15;
}

export function hitRadiusFor(kind: ZombieKind): number {
  if (kind === 'boss') return 1.35;
  if (kind === 'tank') return 1.15;
  if (kind === 'screamer') return 0.95;
  return 0.9;
}

export function moanChanceFor(kind: ZombieKind): number {
  if (kind === 'boss') return 0.35;
  if (kind === 'tank') return 0.28;
  if (kind === 'screamer') return 0.4;
  if (kind === 'acid') return 0.22;
  if (kind === 'runner') return 0.18;
  return 0.12;
}

/** Clamp shared budgets so arena stays under MAX_ZOMBIES pressure. */
export function clientWaveSpawnBudget(wave: number): number {
  return Math.min(28, spawnBudgetForLevel(wave));
}

export function pickWaveSpawnKind(wave: number, budgetAfterDecrement: number): ZombieKind {
  const wk = waveKindForLevel(wave);
  if (wk === 'elite_super' && budgetAfterDecrement === 0) return 'boss';
  if (wk === 'horde') {
    const r = Math.random();
    if (r < 0.48) return 'runner';
    if (r < 0.72) return 'grunt';
    if (r < 0.82) return 'screamer';
    if (r < 0.92) return 'acid';
    return 'tank';
  }
  const r = Math.random();
  if (r < 0.46) return 'grunt';
  if (r < 0.62) return 'runner';
  if (r < 0.72) return 'acid';
  if (r < 0.82) return 'screamer';
  if (r < 0.94) return 'tank';
  return 'boss';
}

export function deathBurstScale(kind: ZombieKind): number {
  if (kind === 'boss') return 2.2;
  if (kind === 'tank') return 1.7;
  if (kind === 'screamer') return 1.5;
  return 1.3;
}

export function deathDecalScale(kind: ZombieKind): number {
  if (kind === 'boss') return 2;
  if (kind === 'tank') return 1.55;
  if (kind === 'screamer') return 1.35;
  return 1.2;
}
