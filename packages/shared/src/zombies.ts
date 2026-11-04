import type { ZombieDef } from './types';

/** Design table — gameplay numbers live in client `zombieKinds.ts` for the arena. */
export const ZOMBIES: readonly ZombieDef[] = [
  {
    id: 'grunt',
    name: 'Grunt',
    hp: 120,
    armor: 0,
    moveSpeed: 3.2,
    damage: 12,
    special: 'claw',
    specialCooldownMs: 0,
  },
  {
    id: 'runner',
    name: 'Runner',
    hp: 90,
    armor: 0,
    moveSpeed: 6.2,
    damage: 10,
    special: 'lunge',
    specialCooldownMs: 5000,
  },
  {
    id: 'tank',
    name: 'Tank',
    hp: 720,
    armor: 35,
    moveSpeed: 1.7,
    damage: 28,
    special: 'slam',
    specialCooldownMs: 9000,
  },
  {
    id: 'acid',
    name: 'Acid Spitter',
    hp: 280,
    armor: 8,
    moveSpeed: 2.9,
    damage: 16,
    special: 'spit',
    specialCooldownMs: 8000,
  },
  {
    id: 'boss',
    name: 'Behemoth',
    hp: 2400,
    armor: 70,
    moveSpeed: 2.0,
    damage: 55,
    special: 'slam_roar',
    specialCooldownMs: 10000,
  },
  {
    id: 'screamer',
    name: 'Neuro-Screamer',
    hp: 300,
    armor: 8,
    moveSpeed: 3.0,
    damage: 10,
    special: 'disrupt_slow',
    specialCooldownMs: 10000,
  },
] as const;

export const ZOMBIE_BY_ID = Object.fromEntries(
  ZOMBIES.map((z) => [z.id, z]),
) as Record<(typeof ZOMBIES)[number]['id'], ZombieDef>;

/** Every 5 levels: elite boss spawn */
export const ELITE_SUPER_INTERVAL = 5;
/** Every 10 levels: horde attack */
export const HORDE_INTERVAL = 10;

export function waveKindForLevel(
  level: number,
): 'normal' | 'elite_super' | 'horde' {
  if (level > 0 && level % HORDE_INTERVAL === 0) return 'horde';
  if (level > 0 && level % ELITE_SUPER_INTERVAL === 0) return 'elite_super';
  return 'normal';
}

export function spawnBudgetForLevel(level: number): number {
  const kind = waveKindForLevel(level);
  const base = 12 + level * 3;
  if (kind === 'horde') return base * 8;
  if (kind === 'elite_super') return base + 1;
  return base;
}
