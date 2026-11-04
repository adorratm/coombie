import type { PowerUpDef } from './types';

export const POWER_UPS: readonly PowerUpDef[] = [
  {
    id: 'dmg_amp',
    name: 'Kinetic Amplifiers',
    description: '+12% weapon damage',
    rarity: 'common',
    effectKey: 'damageMult',
    effectValue: 0.12,
  },
  {
    id: 'fire_rate',
    name: 'Servo Triggers',
    description: '+10% fire rate',
    rarity: 'common',
    effectKey: 'fireRateMult',
    effectValue: 0.1,
  },
  {
    id: 'armor_plate',
    name: 'Reactive Plating',
    description: '+15 armor',
    rarity: 'common',
    effectKey: 'armorFlat',
    effectValue: 15,
  },
  {
    id: 'move_boost',
    name: 'Exo-Actuators',
    description: '+8% move speed',
    rarity: 'common',
    effectKey: 'moveSpeedMult',
    effectValue: 0.08,
  },
  {
    id: 'crit_optics',
    name: 'Threat Optics',
    description: '+8% crit chance',
    rarity: 'rare',
    effectKey: 'critChance',
    effectValue: 0.08,
  },
  {
    id: 'ability_cdr',
    name: 'Neuro Coolant',
    description: '-15% ability cooldown',
    rarity: 'rare',
    effectKey: 'abilityCdr',
    effectValue: 0.15,
  },
  {
    id: 'lifesteal',
    name: 'Hemophage Protocol',
    description: '4% damage returned as HP',
    rarity: 'rare',
    effectKey: 'lifesteal',
    effectValue: 0.04,
  },
  {
    id: 'aoe_radius',
    name: 'Blast Focusing',
    description: '+20% AoE radius',
    rarity: 'rare',
    effectKey: 'aoeRadiusMult',
    effectValue: 0.2,
  },
  {
    id: 'ammo_regen',
    name: 'Nanite Reloader',
    description: 'Passive ammo regen',
    rarity: 'epic',
    effectKey: 'ammoRegen',
    effectValue: 1,
  },
  {
    id: 'team_aura',
    name: 'Command Beacon',
    description: 'Nearby allies +6% damage',
    rarity: 'epic',
    effectKey: 'teamDamageAura',
    effectValue: 0.06,
  },
  {
    id: 'max_hp',
    name: 'Vital Lattice',
    description: '+120 max HP',
    rarity: 'epic',
    effectKey: 'maxHpFlat',
    effectValue: 120,
  },
] as const;

const RARITY_WEIGHT: Record<PowerUpDef['rarity'], number> = {
  common: 60,
  rare: 30,
  epic: 10,
};

function weightedPick(pool: readonly PowerUpDef[], rng: () => number): PowerUpDef {
  const total = pool.reduce((s, p) => s + RARITY_WEIGHT[p.rarity], 0);
  let roll = rng() * total;
  for (const p of pool) {
    roll -= RARITY_WEIGHT[p.rarity];
    if (roll <= 0) return p;
  }
  return pool[pool.length - 1]!;
}

/** Offer 3 unique power-up cards */
export function rollPowerUpChoices(
  count = 3,
  rng: () => number = Math.random,
): PowerUpDef[] {
  const chosen: PowerUpDef[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (chosen.length < count && guard++ < 100) {
    const pick = weightedPick(POWER_UPS, rng);
    if (used.has(pick.id)) continue;
    used.add(pick.id);
    chosen.push(pick);
  }
  return chosen;
}

/** Solo: picks = number of active squad characters (1..4). Co-op: always 1 per player. */
export function powerUpPickCount(mode: 'solo' | 'coop', squadSize: number): number {
  if (mode === 'coop') return 1;
  return Math.min(8, Math.max(1, squadSize));
}
