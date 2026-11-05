import type { StatusId } from './statusEffects';
import type { WeaponId } from './weapons';
import { WEAPONS, weaponById } from './weapons';

/** Extensible combat modifier bag — add keys freely; consumers read with defaults. */
export interface PlayerMods {
  damageMult: number;
  fireRateMult: number;
  moveSpeedMult: number;
  critChance: number;
  armorFlat: number;
  lifesteal: number;
  aoeRadiusMult: number;
  abilityCdr: number;
  maxHpMult: number;
  xpMult: number;
  /** Global on-hit status chances (0–1) */
  burnChance: number;
  toxinChance: number;
  chillChance: number;
  /** Multiplies DoT / chill power */
  statusPower: number;
}

export type AbilityKind =
  | 'kinetic_nova'
  | 'biotic_mist'
  | 'concussive_blast'
  | 'thermal_pierce'
  | 'overdrive'
  | 'toxin_cloud'
  | 'sentry_pulse'
  | 'cluster_barrage';

export type ClassId =
  | 'assaulter'
  | 'breacher'
  | 'gunner'
  | 'ghost'
  | 'medic'
  | 'alchemist'
  | 'engineer'
  | 'demolisher';

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  kind: AbilityKind;
  cooldown: number;
  duration?: number;
  power: number;
}

export interface WeaponClassDef {
  id: ClassId;
  name: string;
  role: string;
  weaponId: WeaponId;
  /** 1 = available at start */
  unlockLevel: number;
  accent: number;
  passiveLabel: string;
  passive: Partial<PlayerMods>;
  ability: AbilityDef;
  /** HUD diamond glyph */
  icon: string;
}

export type UpgradeKind =
  | 'stat'
  | 'unlock_weapon'
  | 'ability_boost'
  | 'weapon_mastery'
  | 'evolution'
  | 'status'
  | 'synergy';

export interface UpgradeCardDef {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic';
  kind: UpgradeKind;
  /** Stackable mod deltas */
  mods?: Partial<PlayerMods>;
  unlockWeapon?: WeaponId;
  /** Multiplies ability power / reduces CD */
  abilityPowerMult?: number;
  abilityCdrFlat?: number;
  /** Flat boost while holding this weapon */
  masteryWeapon?: WeaponId;
  masteryDamage?: number;
  masteryFireRate?: number;
  /** Evolve this base weapon (once) — mastery + status package */
  evolveWeapon?: WeaponId;
  evolutionName?: string;
  weaponStatus?: StatusId;
  weaponStatusChance?: number;
  weight?: number;
  /** Prefer when this class is active (YAZ-style class evolutions) */
  classId?: ClassId;
  /** Diamond icon letter shown on power-up cards */
  icon?: string;
  /** Synergy requires at least one of these status chances > 0 after previous picks */
  requiresStatus?: StatusId;
  /** +1 run level to the hero's Q / E / R ability (max +3 per run) */
  heroRank?: 'q' | 'e' | 'r';
}

export const DEFAULT_MODS: PlayerMods = {
  damageMult: 1,
  fireRateMult: 1,
  moveSpeedMult: 1,
  critChance: 0.12,
  armorFlat: 0,
  lifesteal: 0,
  aoeRadiusMult: 1,
  abilityCdr: 0,
  maxHpMult: 1,
  xpMult: 1,
  burnChance: 0,
  toxinChance: 0,
  chillChance: 0,
  statusPower: 1,
};

/** Class ↔ weapon map — 8 distinct playstyles matching the roster. */
export const WEAPON_CLASSES: WeaponClassDef[] = [
  {
    id: 'assaulter',
    name: 'Assaulter',
    role: 'Rifle',
    weaponId: 'rifle',
    unlockLevel: 1,
    accent: 0x6ea8ff,
    icon: 'AS',
    passiveLabel: '+8% damage',
    passive: { damageMult: 0.08 },
    ability: {
      id: 'kinetic_nova',
      name: 'Kinetic Nova',
      description: 'AoE shockwave around you',
      kind: 'kinetic_nova',
      cooldown: 9,
      power: 8,
    },
  },
  {
    id: 'medic',
    name: 'Field Medic',
    role: 'SMG',
    weaponId: 'smg',
    unlockLevel: 1,
    accent: 0x38bdf8,
    icon: 'MD',
    passiveLabel: '+10% fire rate',
    passive: { fireRateMult: 0.1 },
    ability: {
      id: 'biotic_mist',
      name: 'Biotic Mist',
      description: 'Heal self and nearby allies',
      kind: 'biotic_mist',
      cooldown: 11,
      power: 28,
    },
  },
  {
    id: 'breacher',
    name: 'Breacher',
    role: 'Shotgun',
    weaponId: 'shotgun',
    unlockLevel: 2,
    accent: 0xfbbf24,
    icon: 'BR',
    passiveLabel: '+12% AoE',
    passive: { aoeRadiusMult: 0.12 },
    ability: {
      id: 'concussive_blast',
      name: 'Concussive Blast',
      description: 'Cone knockback + heavy pellets',
      kind: 'concussive_blast',
      cooldown: 8,
      power: 4,
    },
  },
  {
    id: 'ghost',
    name: 'Ghost',
    role: 'Sniper',
    weaponId: 'sniper',
    unlockLevel: 3,
    accent: 0x88eeff,
    icon: 'GH',
    passiveLabel: '+10% crit',
    passive: { critChance: 0.1 },
    ability: {
      id: 'thermal_pierce',
      name: 'Thermal Pierce',
      description: 'Next shots pierce + bonus damage',
      kind: 'thermal_pierce',
      cooldown: 12,
      duration: 5,
      power: 2.2,
    },
  },
  {
    id: 'gunner',
    name: 'Gunner',
    role: 'LMG',
    weaponId: 'lmg',
    unlockLevel: 4,
    accent: 0x22d3ee,
    icon: 'GN',
    passiveLabel: '+8% max HP',
    passive: { maxHpMult: 0.08 },
    ability: {
      id: 'overdrive',
      name: 'Overdrive',
      description: 'Massive fire-rate surge',
      kind: 'overdrive',
      cooldown: 14,
      duration: 5,
      power: 0.55,
    },
  },
  {
    id: 'alchemist',
    name: 'Alchemist',
    role: 'Toxin',
    weaponId: 'smg',
    unlockLevel: 5,
    accent: 0x84cc16,
    icon: 'AL',
    passiveLabel: '4% lifesteal',
    passive: { lifesteal: 0.04 },
    ability: {
      id: 'toxin_cloud',
      name: 'Toxin Cloud',
      description: 'Poison zone that melts horde',
      kind: 'toxin_cloud',
      cooldown: 13,
      duration: 4,
      power: 2.5,
    },
  },
  {
    id: 'engineer',
    name: 'Engineer',
    role: 'Support',
    weaponId: 'rifle',
    unlockLevel: 3,
    accent: 0xf97316,
    icon: 'EN',
    passiveLabel: '+12% ability CDR',
    passive: { abilityCdr: 0.12 },
    ability: {
      id: 'sentry_pulse',
      name: 'Sentry Pulse',
      description: 'Deploy a damaging pulse field',
      kind: 'sentry_pulse',
      cooldown: 11,
      duration: 5,
      power: 3.2,
    },
  },
  {
    id: 'demolisher',
    name: 'Demolisher',
    role: 'Explosives',
    weaponId: 'shotgun',
    unlockLevel: 4,
    accent: 0xfb7185,
    icon: 'DM',
    passiveLabel: '+15% AoE + damage',
    passive: { aoeRadiusMult: 0.15, damageMult: 0.06 },
    ability: {
      id: 'cluster_barrage',
      name: 'Cluster Barrage',
      description: 'Ring of delayed explosions',
      kind: 'cluster_barrage',
      cooldown: 12,
      power: 5.5,
    },
  },
];

/** Level-up card pool — data-driven; append to extend. */
export const UPGRADE_CARDS: UpgradeCardDef[] = [
  { id: 'hero_rank_q', name: 'Taktik Eğitim [Q]', description: 'Q yeteneği +1 seviye: daha güçlü, geniş, sık', rarity: 'rare', kind: 'ability_boost', heroRank: 'q', icon: 'Q', weight: 7 },
  { id: 'hero_rank_e', name: 'Saha Uzmanlığı [E]', description: 'E yeteneği +1 seviye: daha güçlü, geniş, sık', rarity: 'rare', kind: 'ability_boost', heroRank: 'e', icon: 'E', weight: 7 },
  { id: 'hero_rank_r', name: 'Nihai Ustalık [R]', description: 'R yeteneği +1 seviye: daha güçlü, geniş, sık', rarity: 'epic', kind: 'ability_boost', heroRank: 'r', icon: 'R', weight: 6 },
  {
    id: 'dmg_amp',
    name: 'Kinetic Amplifiers',
    description: '+12% weapon damage',
    rarity: 'common',
    kind: 'stat',
    mods: { damageMult: 0.12 },
    weight: 10,
  },
  {
    id: 'servo_triggers',
    name: 'Servo Triggers',
    description: '+12% fire rate',
    rarity: 'common',
    kind: 'stat',
    mods: { fireRateMult: 0.12 },
    weight: 10,
  },
  {
    id: 'exo_actuators',
    name: 'Exo-Actuators',
    description: '+8% move speed',
    rarity: 'common',
    kind: 'stat',
    mods: { moveSpeedMult: 0.08 },
    weight: 9,
  },
  {
    id: 'reactive_plate',
    name: 'Reactive Plating',
    description: '+18 armor (damage reduction)',
    rarity: 'common',
    kind: 'stat',
    mods: { armorFlat: 18 },
    weight: 9,
  },
  {
    id: 'vital_weave',
    name: 'Vital Weave',
    description: '+10% max HP',
    rarity: 'common',
    kind: 'stat',
    mods: { maxHpMult: 0.1 },
    weight: 8,
  },
  {
    id: 'threat_optics',
    name: 'Threat Optics',
    description: '+8% crit chance',
    rarity: 'rare',
    kind: 'stat',
    mods: { critChance: 0.08 },
    weight: 6,
  },
  {
    id: 'hemophage',
    name: 'Hemophage Protocol',
    description: '+5% lifesteal',
    rarity: 'rare',
    kind: 'stat',
    mods: { lifesteal: 0.05 },
    weight: 5,
  },
  {
    id: 'blast_focus',
    name: 'Blast Focusing',
    description: '+20% ability / AoE radius',
    rarity: 'rare',
    kind: 'stat',
    mods: { aoeRadiusMult: 0.2 },
    weight: 5,
  },
  {
    id: 'neuro_coolant',
    name: 'Neuro Coolant',
    description: '-15% ability cooldown',
    rarity: 'rare',
    kind: 'ability_boost',
    abilityCdrFlat: 0.15,
    mods: { abilityCdr: 0.15 },
    weight: 5,
  },
  {
    id: 'ability_surge',
    name: 'Ability Surge',
    description: '+25% ability power',
    rarity: 'rare',
    kind: 'ability_boost',
    abilityPowerMult: 0.25,
    weight: 5,
  },
  {
    id: 'xp_antenna',
    name: 'XP Antenna',
    description: '+15% XP gain',
    rarity: 'rare',
    kind: 'stat',
    mods: { xpMult: 0.15 },
    weight: 4,
  },
  {
    id: 'unlock_shotgun',
    name: 'Authorize Breacher Kit',
    description: 'Unlock Combat Shotgun class',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'shotgun',
    weight: 3,
  },
  {
    id: 'unlock_sniper',
    name: 'Authorize Ghost Kit',
    description: 'Unlock Coil Rifle class',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'sniper',
    weight: 3,
  },
  {
    id: 'unlock_lmg',
    name: 'Authorize Gunner Kit',
    description: 'Unlock LMG class',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'lmg',
    weight: 2,
  },
  {
    id: 'mastery_rifle',
    name: 'Rifle Doctrine',
    description: 'Assault Rifle +18% dmg',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'rifle',
    masteryDamage: 0.18,
    weight: 4,
  },
  {
    id: 'mastery_smg',
    name: 'SMG Doctrine',
    description: 'SMG +15% fire rate',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'smg',
    masteryFireRate: 0.15,
    weight: 4,
  },
  {
    id: 'mastery_shotgun',
    name: 'Breacher Doctrine',
    description: 'Shotgun +20% damage',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'shotgun',
    masteryDamage: 0.2,
    weight: 3,
  },
  {
    id: 'mastery_pistol',
    name: 'Sidearm Doctrine',
    description: 'Pistol +20% fire rate',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'pistol',
    masteryFireRate: 0.2,
    weight: 4,
  },
  {
    id: 'mastery_knife',
    name: 'Blade Doctrine',
    description: 'Combat Knife +25% damage',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'knife',
    masteryDamage: 0.25,
    weight: 4,
  },
  {
    id: 'mastery_bat',
    name: 'Riot Doctrine',
    description: 'Riot Bat +22% damage',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'bat',
    masteryDamage: 0.22,
    weight: 3,
  },
  {
    id: 'mastery_axe',
    name: 'Cleaver Doctrine',
    description: 'Fire Axe +28% damage',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'axe',
    masteryDamage: 0.28,
    weight: 3,
  },
  {
    id: 'unlock_bat',
    name: 'Authorize Riot Kit',
    description: 'Unlock Riot Bat',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'bat',
    weight: 3,
  },
  {
    id: 'unlock_axe',
    name: 'Authorize Cleaver Kit',
    description: 'Unlock Fire Axe',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'axe',
    weight: 2,
  },
  {
    id: 'melee_tempo',
    name: 'Adrenaline Swing',
    description: '+15% fire rate (melee cadence)',
    rarity: 'common',
    kind: 'stat',
    mods: { fireRateMult: 0.15 },
    weight: 6,
  },
  {
    id: 'command_beacon',
    name: 'Command Beacon',
    description: '+10% damage & +6% move',
    rarity: 'epic',
    kind: 'stat',
    mods: { damageMult: 0.1, moveSpeedMult: 0.06 },
    weight: 2,
    icon: 'CB',
  },
  // ——— Class evolutions (YAZ-style unique ability power-ups) ———
  {
    id: 'evo_nova_overload',
    name: 'Kinetic Nova: Overload',
    description: 'Nova radius and power surge',
    rarity: 'epic',
    kind: 'ability_boost',
    classId: 'assaulter',
    icon: 'AS',
    abilityPowerMult: 0.4,
    mods: { aoeRadiusMult: 0.25 },
    weight: 3,
  },
  {
    id: 'evo_mist_cascade',
    name: 'Biotic Mist: Cascade',
    description: 'Stronger heals, wider mist',
    rarity: 'epic',
    kind: 'ability_boost',
    classId: 'medic',
    icon: 'MD',
    abilityPowerMult: 0.45,
    mods: { aoeRadiusMult: 0.2 },
    weight: 3,
  },
  {
    id: 'evo_concussive_breach',
    name: 'Concussive: Breach Charge',
    description: 'Blast damage and knockback up',
    rarity: 'epic',
    kind: 'ability_boost',
    classId: 'breacher',
    icon: 'BR',
    abilityPowerMult: 0.5,
    mods: { damageMult: 0.08 },
    weight: 3,
  },
  {
    id: 'evo_thermal_rail',
    name: 'Thermal Pierce: Rail',
    description: 'More pierce shots, higher crit',
    rarity: 'epic',
    kind: 'ability_boost',
    classId: 'ghost',
    icon: 'GH',
    abilityPowerMult: 0.35,
    mods: { critChance: 0.06 },
    weight: 3,
  },
  {
    id: 'evo_overdrive_redline',
    name: 'Overdrive: Redline',
    description: 'Longer overdrive, more fire rate',
    rarity: 'epic',
    kind: 'ability_boost',
    classId: 'gunner',
    icon: 'GN',
    abilityPowerMult: 0.3,
    mods: { fireRateMult: 0.12 },
    weight: 3,
  },
  {
    id: 'evo_toxin_virulent',
    name: 'Toxin Cloud: Virulent',
    description: 'Cloud DPS and duration climb',
    rarity: 'epic',
    kind: 'ability_boost',
    classId: 'alchemist',
    icon: 'AL',
    abilityPowerMult: 0.5,
    mods: { lifesteal: 0.03 },
    weight: 3,
  },
  {
    id: 'evo_sentry_fortify',
    name: 'Sentry Pulse: Fortify',
    description: 'Pulse lasts longer, hits harder',
    rarity: 'epic',
    kind: 'ability_boost',
    classId: 'engineer',
    icon: 'EN',
    abilityPowerMult: 0.4,
    abilityCdrFlat: 0.1,
    mods: { abilityCdr: 0.1 },
    weight: 3,
  },
  {
    id: 'evo_cluster_apocalypse',
    name: 'Cluster Barrage: Apocalypse',
    description: 'More blasts, bigger radius',
    rarity: 'epic',
    kind: 'ability_boost',
    classId: 'demolisher',
    icon: 'DM',
    abilityPowerMult: 0.45,
    mods: { aoeRadiusMult: 0.3 },
    weight: 3,
  },
  // ——— On-hit status packs ———
  {
    id: 'status_incendiary',
    name: 'Incendiary Tips',
    description: '25% chance to burn on hit',
    rarity: 'rare',
    kind: 'status',
    icon: 'BR',
    mods: { burnChance: 0.25 },
    weight: 5,
  },
  {
    id: 'status_venom',
    name: 'Venom Magazine',
    description: '25% chance to toxin on hit',
    rarity: 'rare',
    kind: 'status',
    icon: 'TX',
    mods: { toxinChance: 0.25 },
    weight: 5,
  },
  {
    id: 'status_cryo',
    name: 'Cryo Coating',
    description: '20% chance to chill on hit',
    rarity: 'rare',
    kind: 'status',
    icon: 'CR',
    mods: { chillChance: 0.2 },
    weight: 5,
  },
  {
    id: 'status_catalyst',
    name: 'Catalyst Core',
    description: '+35% status effect power',
    rarity: 'rare',
    kind: 'status',
    mods: { statusPower: 0.35 },
    weight: 4,
  },
  // ——— Synergies (gated by prior status) ———
  {
    id: 'syn_combustion',
    name: 'Combustion Loop',
    description: 'Burn builds: +8% crit, +20% status power',
    rarity: 'epic',
    kind: 'synergy',
    icon: 'CB',
    requiresStatus: 'burn',
    mods: { critChance: 0.08, statusPower: 0.2 },
    weight: 3,
  },
  {
    id: 'syn_neuroshock',
    name: 'Neuroshock',
    description: 'Toxin builds: +10% fire rate, +toxin chance',
    rarity: 'epic',
    kind: 'synergy',
    icon: 'NS',
    requiresStatus: 'toxin',
    mods: { fireRateMult: 0.1, toxinChance: 0.12 },
    weight: 3,
  },
  {
    id: 'syn_glacial',
    name: 'Glacial Pressure',
    description: 'Chill builds: +armor, stronger chill uptime',
    rarity: 'epic',
    kind: 'synergy',
    icon: 'GL',
    requiresStatus: 'chill',
    mods: { armorFlat: 14, chillChance: 0.1, statusPower: 0.15 },
    weight: 3,
  },
  // ——— Weapon evolutions (once per base weapon) ———
  {
    id: 'evo_weapon_rifle',
    name: 'Pulse Lance',
    description: 'Evolve Assault Rifle: +28% dmg, burn rounds',
    rarity: 'epic',
    kind: 'evolution',
    icon: 'PL',
    evolveWeapon: 'rifle',
    evolutionName: 'Pulse Lance',
    masteryWeapon: 'rifle',
    masteryDamage: 0.28,
    weaponStatus: 'burn',
    weaponStatusChance: 0.4,
    weight: 2,
  },
  {
    id: 'evo_weapon_smg',
    name: 'Neuro Storm',
    description: 'Evolve SMG: +22% fire rate, toxin spray',
    rarity: 'epic',
    kind: 'evolution',
    icon: 'NS',
    evolveWeapon: 'smg',
    evolutionName: 'Neuro Storm',
    masteryWeapon: 'smg',
    masteryFireRate: 0.22,
    weaponStatus: 'toxin',
    weaponStatusChance: 0.35,
    weight: 2,
  },
  {
    id: 'evo_weapon_shotgun',
    name: 'Frost Breach',
    description: 'Evolve Shotgun: +25% dmg, chill pellets',
    rarity: 'epic',
    kind: 'evolution',
    icon: 'FB',
    evolveWeapon: 'shotgun',
    evolutionName: 'Frost Breach',
    masteryWeapon: 'shotgun',
    masteryDamage: 0.25,
    weaponStatus: 'chill',
    weaponStatusChance: 0.45,
    weight: 2,
  },
  {
    id: 'evo_weapon_axe',
    name: 'Infernal Cleaver',
    description: 'Evolve Fire Axe: +32% dmg, heavy burn',
    rarity: 'epic',
    kind: 'evolution',
    icon: 'IC',
    evolveWeapon: 'axe',
    evolutionName: 'Infernal Cleaver',
    masteryWeapon: 'axe',
    masteryDamage: 0.32,
    weaponStatus: 'burn',
    weaponStatusChance: 0.55,
    weight: 2,
  },
];

export interface MasteryBonus {
  weaponId: WeaponId;
  damage: number;
  fireRate: number;
}

export interface WeaponEvolutionState {
  weaponId: WeaponId;
  name: string;
  status?: StatusId;
  statusChance: number;
}

export interface ProgressState {
  level: number;
  xp: number;
  xpToLevel: number;
  mods: PlayerMods;
  unlockedWeapons: Set<WeaponId>;
  unlockedClasses: Set<ClassId>;
  activeClassId: ClassId;
  abilityPowerMult: number;
  masteries: MasteryBonus[];
  evolutions: Map<WeaponId, WeaponEvolutionState>;
  pickedIds: string[];
  pendingPicks: number;
  choices: UpgradeCardDef[];
  abilityCooldown: number;
  abilityActiveUntil: number;
  pierceShots: number;
  overdriveUntil: number;
  rerolls: number;
  lockdowns: number;
  banishes: number;
  lockedChoiceIndex: number | null;
  banishedIds: Set<string>;
  heroRankBonus: { q: number; e: number; r: number };
}

export function xpForLevel(level: number): number {
  return Math.floor(18 + level * 12 + level * level * 2.2);
}

export function classByWeapon(weaponId: WeaponId): WeaponClassDef | undefined {
  return WEAPON_CLASSES.find((c) => c.weaponId === weaponId && c.unlockLevel <= 99);
}

export function classById(id: ClassId): WeaponClassDef {
  return WEAPON_CLASSES.find((c) => c.id === id) ?? WEAPON_CLASSES[0]!;
}

export function createProgressState(startClass: ClassId = 'assaulter'): ProgressState {
  const cls = classById(startClass);
  const unlockedWeapons = new Set<WeaponId>(['rifle', 'smg', 'pistol', 'knife']);
  const unlockedClasses = new Set<ClassId>(['assaulter', 'medic']);
  for (const c of WEAPON_CLASSES) {
    if (c.unlockLevel <= 1) {
      unlockedWeapons.add(c.weaponId);
      unlockedClasses.add(c.id);
    }
  }

  const mods = { ...DEFAULT_MODS };
  applyPassive(mods, cls.passive);

  return {
    level: 1,
    xp: 0,
    xpToLevel: xpForLevel(1),
    mods,
    unlockedWeapons,
    unlockedClasses,
    activeClassId: cls.id,
    abilityPowerMult: 1,
    masteries: [],
    evolutions: new Map(),
    pickedIds: [],
    pendingPicks: 0,
    choices: [],
    abilityCooldown: 0,
    abilityActiveUntil: 0,
    pierceShots: 0,
    overdriveUntil: 0,
    rerolls: 7,
    lockdowns: 2,
    banishes: 2,
    lockedChoiceIndex: null,
    banishedIds: new Set(),
    heroRankBonus: { q: 0, e: 0, r: 0 },
  };
}

const ADDITIVE_MOD_KEYS: ReadonlySet<keyof PlayerMods> = new Set([
  'critChance',
  'armorFlat',
  'lifesteal',
  'abilityCdr',
  'xpMult',
  'burnChance',
  'toxinChance',
  'chillChance',
  'statusPower',
]);

function applyPassive(mods: PlayerMods, passive: Partial<PlayerMods>): void {
  for (const [k, v] of Object.entries(passive) as [keyof PlayerMods, number][]) {
    if (ADDITIVE_MOD_KEYS.has(k)) {
      mods[k] += v;
    } else {
      mods[k] *= 1 + v;
    }
  }
}

export function applyUpgradeCard(state: ProgressState, card: UpgradeCardDef): void {
  state.pickedIds.push(card.id);
  if (card.heroRank) state.heroRankBonus[card.heroRank] = Math.min(3, state.heroRankBonus[card.heroRank] + 1);

  if (card.mods) {
    for (const [k, v] of Object.entries(card.mods) as [keyof PlayerMods, number][]) {
      if (v === undefined) continue;
      if (ADDITIVE_MOD_KEYS.has(k)) {
        state.mods[k] += v;
      } else {
        state.mods[k] *= 1 + v;
      }
    }
  }

  if (card.unlockWeapon) {
    state.unlockedWeapons.add(card.unlockWeapon);
    for (const c of WEAPON_CLASSES) {
      if (c.weaponId === card.unlockWeapon) state.unlockedClasses.add(c.id);
    }
  }

  if (card.abilityPowerMult) state.abilityPowerMult *= 1 + card.abilityPowerMult;
  if (card.abilityCdrFlat) state.mods.abilityCdr += card.abilityCdrFlat;

  if (card.masteryWeapon) {
    const existing = state.masteries.find((m) => m.weaponId === card.masteryWeapon);
    if (existing) {
      existing.damage += card.masteryDamage ?? 0;
      existing.fireRate += card.masteryFireRate ?? 0;
    } else {
      state.masteries.push({
        weaponId: card.masteryWeapon,
        damage: card.masteryDamage ?? 0,
        fireRate: card.masteryFireRate ?? 0,
      });
    }
  }

  if (card.evolveWeapon && !state.evolutions.has(card.evolveWeapon)) {
    state.evolutions.set(card.evolveWeapon, {
      weaponId: card.evolveWeapon,
      name: card.evolutionName ?? card.name,
      status: card.weaponStatus,
      statusChance: card.weaponStatusChance ?? 0.35,
    });
  }
}

export function hasStatusChance(state: ProgressState, id: StatusId): boolean {
  if (id === 'burn') return state.mods.burnChance > 0.01;
  if (id === 'toxin') return state.mods.toxinChance > 0.01;
  return state.mods.chillChance > 0.01;
}

export function weaponDisplayName(state: ProgressState, weaponId: WeaponId): string {
  const evo = state.evolutions.get(weaponId);
  if (evo) return evo.name;
  return weaponById(weaponId).name;
}

function rarityWeight(rarity: UpgradeCardDef['rarity']): number {
  if (rarity === 'epic') return 0.45;
  if (rarity === 'rare') return 0.75;
  return 1;
}

export function rollUpgradeChoices(state: ProgressState, count = 4): UpgradeCardDef[] {
  const pool = UPGRADE_CARDS.filter((card) => {
    if (state.banishedIds.has(card.id)) return false;
    if (state.pickedIds.includes(card.id) && (card.classId || card.kind === 'evolution' || card.kind === 'synergy' || card.kind === 'status')) {
      return false;
    }
    if (card.unlockWeapon && state.unlockedWeapons.has(card.unlockWeapon)) return false;
    // Soft-lock high unlocks until level gate from class defs
    if (card.unlockWeapon) {
      const cls = WEAPON_CLASSES.find((c) => c.weaponId === card.unlockWeapon);
      if (cls && state.level + 1 < cls.unlockLevel) return false;
    }
    if (card.evolveWeapon) {
      if (!state.unlockedWeapons.has(card.evolveWeapon)) return false;
      if (state.evolutions.has(card.evolveWeapon)) return false;
      if (state.level < 4) return false;
    }
    if (card.requiresStatus && !hasStatusChance(state, card.requiresStatus)) return false;
    if (card.heroRank && state.heroRankBonus[card.heroRank] >= 3) return false;
    return true;
  });

  const picks: UpgradeCardDef[] = [];
  const used = new Set<string>();
  for (let n = 0; n < count; n++) {
    let total = 0;
    const weights: number[] = [];
    for (const card of pool) {
      if (used.has(card.id)) {
        weights.push(0);
        continue;
      }
      let w = (card.weight ?? 5) * rarityWeight(card.rarity);
      // Bias class evolutions toward the active class (YAZ feel)
      if (card.classId) {
        w *= card.classId === state.activeClassId ? 3.2 : 0.35;
      }
      weights.push(w);
      total += w;
    }
    if (total <= 0) break;
    let r = Math.random() * total;
    let chosen = pool[0]!;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        chosen = pool[i]!;
        break;
      }
    }
    used.add(chosen.id);
    picks.push(chosen);
  }
  return picks;
}

export function gainProgressXp(state: ProgressState, amount: number): number {
  let levelsGained = 0;
  state.xp += amount * state.mods.xpMult;
  while (state.xp >= state.xpToLevel) {
    state.xp -= state.xpToLevel;
    state.level += 1;
    state.xpToLevel = xpForLevel(state.level);
    levelsGained += 1;
    state.pendingPicks += 1;

    // Auto-unlock by level gate
    for (const c of WEAPON_CLASSES) {
      if (c.unlockLevel <= state.level) {
        state.unlockedWeapons.add(c.weaponId);
        state.unlockedClasses.add(c.id);
      }
    }
  }
  if (state.pendingPicks > 0 && state.choices.length === 0) {
    state.choices = rollUpgradeChoices(state, 4);
  }
  return levelsGained;
}

export function selectUpgrade(state: ProgressState, index: number): UpgradeCardDef | null {
  if (state.pendingPicks <= 0 || state.choices.length === 0) return null;
  const card = state.choices[index];
  if (!card) return null;
  applyUpgradeCard(state, card);
  state.pendingPicks -= 1;
  state.lockedChoiceIndex = null;
  state.choices = state.pendingPicks > 0 ? rollUpgradeChoices(state, 4) : [];
  return card;
}

export function rerollUpgrades(state: ProgressState): boolean {
  if (state.pendingPicks <= 0 || state.rerolls <= 0 || state.choices.length === 0) return false;
  state.rerolls -= 1;
  const locked =
    state.lockedChoiceIndex != null ? state.choices[state.lockedChoiceIndex] ?? null : null;
  const next = rollUpgradeChoices(state, 4);
  if (locked && state.lockedChoiceIndex != null && state.lockedChoiceIndex < next.length) {
    next[state.lockedChoiceIndex] = locked;
  } else if (locked) {
    next[0] = locked;
    state.lockedChoiceIndex = 0;
  }
  state.choices = next;
  return true;
}

export function lockdownUpgrade(state: ProgressState, index: number): boolean {
  if (state.pendingPicks <= 0 || state.lockdowns <= 0) return false;
  if (!state.choices[index]) return false;
  state.lockdowns -= 1;
  state.lockedChoiceIndex = index;
  return true;
}

export function banishUpgrade(state: ProgressState, index: number): boolean {
  if (state.pendingPicks <= 0 || state.banishes <= 0) return false;
  const card = state.choices[index];
  if (!card) return false;
  state.banishes -= 1;
  state.banishedIds.add(card.id);
  const locked =
    state.lockedChoiceIndex != null ? state.choices[state.lockedChoiceIndex] ?? null : null;
  const next = rollUpgradeChoices(state, 4);
  if (locked && state.lockedChoiceIndex != null) {
    const keepIdx = Math.min(state.lockedChoiceIndex, next.length - 1);
    if (keepIdx >= 0) next[keepIdx] = locked;
  }
  state.choices = next;
  return true;
}

export function skipUpgrade(state: ProgressState): boolean {
  if (state.pendingPicks <= 0) return false;
  state.pendingPicks -= 1;
  state.lockedChoiceIndex = null;
  state.choices = state.pendingPicks > 0 ? rollUpgradeChoices(state, 4) : [];
  return true;
}

export function cardStatLines(card: UpgradeCardDef): Array<{ label: string; before: string; after: string }> {
  const lines: Array<{ label: string; before: string; after: string }> = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (card.mods?.damageMult) {
    lines.push({ label: 'Hasar', before: '100%', after: pct(1 + card.mods.damageMult) });
  }
  if (card.mods?.fireRateMult) {
    lines.push({ label: 'Ateş hızı', before: '100%', after: pct(1 + card.mods.fireRateMult) });
  }
  if (card.mods?.moveSpeedMult) {
    lines.push({ label: 'Hareket', before: '100%', after: pct(1 + card.mods.moveSpeedMult) });
  }
  if (card.mods?.maxHpMult) {
    lines.push({ label: 'Can', before: '100%', after: pct(1 + card.mods.maxHpMult) });
  }
  if (card.mods?.critChance) {
    lines.push({
      label: 'Kritik',
      before: '12%',
      after: `${Math.round((0.12 + card.mods.critChance) * 100)}%`,
    });
  }
  if (card.mods?.armorFlat) {
    lines.push({ label: 'Zırh', before: '0', after: `+${card.mods.armorFlat}` });
  }
  if (card.mods?.xpMult) {
    lines.push({ label: 'XP', before: '100%', after: pct(1 + card.mods.xpMult) });
  }
  if (card.mods?.lifesteal) {
    lines.push({ label: 'Can çal', before: '0%', after: pct(card.mods.lifesteal) });
  }
  if (card.mods?.aoeRadiusMult) {
    lines.push({ label: 'Alan', before: '100%', after: pct(1 + card.mods.aoeRadiusMult) });
  }
  if (card.abilityPowerMult) {
    lines.push({ label: 'Yetenek', before: '100%', after: pct(card.abilityPowerMult) });
  }
  if (card.abilityCdrFlat) {
    lines.push({ label: 'CD', before: '0%', after: `-${Math.round(card.abilityCdrFlat * 100)}%` });
  }
  if (card.masteryDamage) {
    lines.push({ label: 'Hasar', before: '100%', after: pct(1 + card.masteryDamage) });
  }
  if (card.masteryFireRate) {
    lines.push({ label: 'Ateş hızı', before: '100%', after: pct(1 + card.masteryFireRate) });
  }
  if (card.unlockWeapon) {
    lines.push({ label: 'Silah', before: '—', after: card.unlockWeapon.toUpperCase() });
  }
  if (card.evolveWeapon) {
    lines.push({ label: 'Evrim', before: card.evolveWeapon.toUpperCase(), after: card.evolutionName ?? card.name });
  }
  if (card.mods?.burnChance) {
    lines.push({ label: 'Yanma', before: '0%', after: pct(card.mods.burnChance) });
  }
  if (card.mods?.toxinChance) {
    lines.push({ label: 'Toksin', before: '0%', after: pct(card.mods.toxinChance) });
  }
  if (card.mods?.chillChance) {
    lines.push({ label: 'Donma', before: '0%', after: pct(card.mods.chillChance) });
  }
  if (card.mods?.statusPower) {
    lines.push({ label: 'Status', before: '100%', after: pct(1 + card.mods.statusPower) });
  }
  if (card.weaponStatus) {
    lines.push({
      label: 'Silah DoT',
      before: '—',
      after: `${card.weaponStatus.toUpperCase()} ${Math.round((card.weaponStatusChance ?? 0.35) * 100)}%`,
    });
  }
  if (lines.length === 0) {
    lines.push({ label: 'Etki', before: '—', after: 'Aktif' });
  }
  return lines.slice(0, 3);
}

export function rarityTierLabel(rarity: UpgradeCardDef['rarity']): string {
  if (rarity === 'epic') return 'EVRİM';
  if (rarity === 'rare') return 'KADEME III';
  return 'KADEME I';
}

export function effectiveWeaponStats(
  state: ProgressState,
  weaponId: WeaponId,
): { damageMult: number; fireRateMult: number; critChance: number } {
  const mastery = state.masteries.find((m) => m.weaponId === weaponId);
  let damageMult = state.mods.damageMult * (1 + (mastery?.damage ?? 0));
  let fireRateMult = state.mods.fireRateMult * (1 + (mastery?.fireRate ?? 0));
  if (state.overdriveUntil > 0) {
    const gunner = classById('gunner');
    fireRateMult *= 1 + gunner.ability.power * state.abilityPowerMult;
  }
  return {
    damageMult,
    fireRateMult,
    critChance: state.mods.critChance,
  };
}

export function getActiveClass(state: ProgressState): WeaponClassDef {
  return classById(state.activeClassId);
}

export function setActiveClassForWeapon(state: ProgressState, weaponId: WeaponId): void {
  const preferred = WEAPON_CLASSES.find(
    (c) => c.weaponId === weaponId && state.unlockedClasses.has(c.id),
  );
  if (preferred) state.activeClassId = preferred.id;
}

export function abilityReady(state: ProgressState): boolean {
  return state.abilityCooldown <= 0;
}

export function startAbilityCooldown(state: ProgressState, now: number): AbilityDef {
  const cls = getActiveClass(state);
  const cdr = Math.min(0.6, state.mods.abilityCdr);
  state.abilityCooldown = cls.ability.cooldown * (1 - cdr);
  if (cls.ability.duration) {
    state.abilityActiveUntil = now + cls.ability.duration;
  }
  if (cls.ability.kind === 'thermal_pierce') {
    state.pierceShots = Math.floor(4 * state.abilityPowerMult);
  }
  if (cls.ability.kind === 'overdrive') {
    state.overdriveUntil = now + (cls.ability.duration ?? 5);
  }
  return cls.ability;
}

export function tickProgressTimers(state: ProgressState, dt: number, now: number): void {
  state.abilityCooldown = Math.max(0, state.abilityCooldown - dt);
  if (state.abilityActiveUntil > 0 && now >= state.abilityActiveUntil) {
    state.abilityActiveUntil = 0;
  }
  if (state.overdriveUntil > 0 && now >= state.overdriveUntil) {
    state.overdriveUntil = 0;
  }
}

export function listUnlockedWeaponDefs(state: ProgressState) {
  return WEAPONS.filter((w) => state.unlockedWeapons.has(w.id));
}

export function weaponUnlockLabel(weaponId: WeaponId): string {
  const cls = WEAPON_CLASSES.find((c) => c.weaponId === weaponId);
  const w = weaponById(weaponId);
  return cls ? `${w.name} · ${cls.name}` : w.name;
}
