import type { OperativeDef } from './types';

export const OPERATIVES: readonly OperativeDef[] = [
  {
    id: 'ironclad',
    codename: 'IRONCLAD',
    displayName: 'Marcus Vance',
    gender: 'male',
    role: 'tank',
    activeAbility: 'Kinetic Nova',
    passive: '+40% Armor',
    primaryWeapon: 'Mag-Pulse Shotgun',
    baseStats: { hp: 1400, armor: 80, moveSpeed: 4.2, damage: 55 },
    animationSet: 'anim/ironclad',
  },
  {
    id: 'valkyrie',
    codename: 'VALKYRIE',
    displayName: 'Elena Rostova',
    gender: 'female',
    role: 'medic',
    activeAbility: 'Biotic Mist',
    passive: '+25% Revive Speed',
    primaryWeapon: 'MK-4 Surgical SMG',
    baseStats: { hp: 900, armor: 35, moveSpeed: 5.0, damage: 42 },
    animationSet: 'anim/valkyrie',
  },
  {
    id: 'breaker',
    codename: 'BREAKER',
    displayName: 'Jax Thorne',
    gender: 'male',
    role: 'gunner',
    activeAbility: 'Concussive Blast',
    passive: '+30% Magazine Capacity',
    primaryWeapon: 'Titan Rotary Cannon',
    baseStats: { hp: 1100, armor: 50, moveSpeed: 4.0, damage: 38 },
    animationSet: 'anim/breaker',
  },
  {
    id: 'tox',
    codename: 'TOX',
    displayName: 'Dr. Sarah Chen',
    gender: 'female',
    role: 'bio_alchemist',
    activeAbility: 'Toxin Cloud',
    passive: 'Acid Corrosion DoT',
    primaryWeapon: 'Acid Launcher 9mm',
    baseStats: { hp: 850, armor: 30, moveSpeed: 4.8, damage: 48 },
    animationSet: 'anim/tox',
  },
  {
    id: 'ghost',
    codename: 'GHOST',
    displayName: 'Vera Sokolov',
    gender: 'female',
    role: 'sniper',
    activeAbility: 'Thermal Pierce',
    passive: '+50% Headshot Crit',
    primaryWeapon: 'AP-50 Coil Rifle',
    baseStats: { hp: 800, armor: 25, moveSpeed: 4.6, damage: 95 },
    animationSet: 'anim/ghost',
  },
  {
    id: 'spark',
    codename: 'SPARK',
    displayName: 'Maya Ramirez',
    gender: 'female',
    role: 'engineer',
    activeAbility: 'Sentry Pulse',
    passive: 'Ammo Drone Supply',
    primaryWeapon: 'Arc-Stun Carbine',
    baseStats: { hp: 950, armor: 40, moveSpeed: 4.7, damage: 44 },
    animationSet: 'anim/spark',
  },
  {
    id: 'warden',
    codename: 'WARDEN',
    displayName: 'Kane Sterling',
    gender: 'male',
    role: 'heavy',
    activeAbility: 'Overdrive',
    passive: '+20% Sustained Fire',
    primaryWeapon: 'Twin Mag Minigun',
    baseStats: { hp: 1250, armor: 70, moveSpeed: 3.8, damage: 40 },
    animationSet: 'anim/warden',
  },
  {
    id: 'havoc',
    codename: 'HAVOC',
    displayName: 'Victor Reyes',
    gender: 'male',
    role: 'demolisher',
    activeAbility: 'Cluster Barrage',
    passive: 'Blast Radius +15%',
    primaryWeapon: 'Fragment Launcher',
    baseStats: { hp: 1050, armor: 45, moveSpeed: 4.4, damage: 52 },
    animationSet: 'anim/havoc',
  },
] as const;

export const OPERATIVE_BY_ID = Object.fromEntries(
  OPERATIVES.map((o) => [o.id, o]),
) as Record<(typeof OPERATIVES)[number]['id'], OperativeDef>;

/** Roster size and gender balance guard — exactly 4 male and 4 female operatives. */
export function assertGenderBalance(): void {
  if (OPERATIVES.length !== 8) {
    throw new Error(`Expected 8 operatives, got ${OPERATIVES.length}`);
  }
  const males = OPERATIVES.filter((o) => o.gender === 'male').length;
  const females = OPERATIVES.filter((o) => o.gender === 'female').length;
  if (males !== 4 || females !== 4) {
    throw new Error(`Expected exactly 4 male and 4 female operatives, got ${males}M / ${females}F`);
  }
}
