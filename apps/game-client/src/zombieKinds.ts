import { spawnBudgetForLevel, waveKindForLevel } from '@protocol-z/shared';

/** Playable arena kinds. */
export type ZombieKind = 'grunt' | 'runner' | 'tank' | 'acid' | 'boss' | 'screamer' | 'crawler' | 'bloater' | 'stalker' | 'burner' | 'riot' | 'hive' | 'volt' | 'hooker';

/** Display names (HUD, achievements). */
export const ZOMBIE_NAMES: Record<ZombieKind, string> = {
  grunt: 'Leş', runner: 'Koşucu', tank: 'Tank', acid: 'Asitçi', boss: 'Mutant', screamer: 'Çığırtkan', crawler: 'Sürüngen', bloater: 'Şişko',
  stalker: 'Gölge', burner: 'Kor', riot: 'Çevik Kuvvet', hive: 'Kovan', volt: 'Voltaj', hooker: 'Çengelci',
};

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
  silhouette: 'none' | 'boss' | 'acid' | 'runner' | 'tank' | 'screamer' | 'crawler' | 'bloater';
}

export function toZombieAvatarKind(kind: ZombieKind): ZombieAvatarKind {
  if (kind === 'acid') return 'acid';
  if (kind === 'boss' || kind === 'tank') return 'boss';
  // screamer / runner / grunt → lean grunt mesh
  return 'grunt';
}

export function toZombieSfxKind(kind: ZombieKind): ZombieSfxKind {
  if (kind === 'acid') return 'acid';
  if (kind === 'boss' || kind === 'tank' || kind === 'hooker' || kind === 'riot') return 'boss';
  if (kind === 'screamer' || kind === 'hive') return 'boss';
  return 'grunt';
}

const ext = (scale: number, flesh: [number, number, number], eye: number, glow: number, hp: number, speed: number, dmg: number, xp: number, bar: number): ZombieKindStats => ({
  scale,
  fleshBase: flesh,
  clothBase: [30, 32, 30],
  eyeColor: eye,
  glow,
  emissiveIntensity: 0.25,
  maxHp: hp,
  speed,
  attackDamage: dmg,
  xpValue: xp,
  barWidth: 0.95 * scale + (hp > 30 ? 0.3 : 0),
  barY: 2.45 * scale,
  barColor: bar,
  silhouette: 'none',
});

export function rollZombieStats(kind: ZombieKind): ZombieKindStats {
  switch (kind) {
    case 'stalker':
      return ext(0.95, [40, 42, 46], 0xf0f0ff, 0x30343a, 11, 3.6, 7, 9, 0x9aa4b0);
    case 'burner':
      return ext(1.05, [30, 22, 18], 0xff8a20, 0xb44a10, 13, 2.5, 6, 8, 0xff8a20);
    case 'riot':
      return { ...ext(1.12, [52, 56, 48], 0xffb020, 0x3a3020, 30, 1.9, 9, 14, 0x8a96a8), barY: 2.7 };
    case 'hive':
      return ext(1.25, [86, 74, 52], 0xd9c060, 0x6a5a10, 34, 1.45, 7, 16, 0xd9b040);
    case 'volt':
      return ext(1.0, [60, 68, 80], 0x9fd8ff, 0x3a6aa0, 14, 2.6, 6, 10, 0x9fd8ff);
    case 'hooker':
      return { ...ext(1, [60, 22, 20], 0x7cff3a, 0x2a6010, 55, 1.7, 12, 26, 0x7cff3a), barY: 3.2, barWidth: 1.4 };
    default:
      break;
  }
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
  if (kind === 'crawler') {
    const scale = 0.95;
    return {
      scale,
      fleshBase: [56, 50, 44],
      clothBase: [30, 30, 28],
      eyeColor: 0xff5a2a,
      glow: 0x7f1d1d,
      emissiveIntensity: 0.2,
      maxHp: 7,
      speed: 3.1,
      attackDamage: 6,
      xpValue: 5,
      barWidth: 0.85,
      barY: 1.2,
      barColor: 0xf97316,
      silhouette: 'crawler',
    };
  }
  if (kind === 'bloater') {
    const scale = 1.25;
    return {
      scale,
      fleshBase: [80, 86, 50],
      clothBase: [44, 46, 30],
      eyeColor: 0xd9f99d,
      glow: 0x65a30d,
      emissiveIntensity: 0.4,
      maxHp: 22,
      speed: 1.55,
      attackDamage: 7,
      xpValue: 10,
      barWidth: 1.15,
      barY: 2.6 * scale,
      barColor: 0xa3e635,
      silhouette: 'bloater',
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
  if (kind === 'crawler') return 1.2;
  if (kind === 'bloater') return 1.6;
  if (kind === 'hooker') return 2.2;
  if (kind === 'riot' || kind === 'hive') return 1.6;
  return 1.15;
}

export function hitRadiusFor(kind: ZombieKind): number {
  if (kind === 'boss') return 1.35;
  if (kind === 'tank') return 1.15;
  if (kind === 'screamer') return 0.95;
  if (kind === 'bloater' || kind === 'hive' || kind === 'riot') return 1.1;
  if (kind === 'hooker') return 1.25;
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

/** `horde` forces the fast horde mix (client hordes come more often than the shared canon's) */
export function pickWaveSpawnKind(wave: number, budgetAfterDecrement: number, horde = false): ZombieKind {
  const wk = horde ? 'horde' : waveKindForLevel(wave);
  if (wk === 'elite_super' && budgetAfterDecrement === 0) return wave % 2 === 0 ? 'hooker' : 'boss';
  // special infected join from wave 2 on, more of them later
  const sp = Math.min(0.32, 0.06 + wave * 0.035);
  if (wave >= 2 && Math.random() < sp) {
    const pool: ZombieKind[] = ['stalker', 'burner', 'volt'];
    if (wave >= 3) pool.push('riot', 'hive', 'stalker', 'burner');
    if (wave >= 4) pool.push('hooker');
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
  if (wk === 'horde') {
    const r = Math.random();
    if (r < 0.4) return 'runner';
    if (r < 0.62) return 'grunt';
    if (r < 0.72) return 'crawler';
    if (r < 0.8) return 'screamer';
    if (r < 0.87) return 'acid';
    if (r < 0.93) return 'bloater';
    return 'tank';
  }
  const r = Math.random();
  if (r < 0.4) return 'grunt';
  if (r < 0.54) return 'runner';
  if (r < 0.63) return 'crawler';
  if (r < 0.71) return 'acid';
  if (r < 0.79) return 'screamer';
  if (r < 0.86) return 'bloater';
  if (r < 0.96) return 'tank';
  return 'boss';
}

export function deathBurstScale(kind: ZombieKind): number {
  if (kind === 'boss') return 2.2;
  if (kind === 'tank') return 1.7;
  if (kind === 'screamer' || kind === 'hooker' || kind === 'hive') return 1.5;
  return 1.3;
}

export function deathDecalScale(kind: ZombieKind): number {
  if (kind === 'boss') return 2;
  if (kind === 'tank') return 1.55;
  if (kind === 'screamer') return 1.35;
  return 1.2;
}
