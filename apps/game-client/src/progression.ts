import type { StatusId } from './statusEffects';
import type { WeaponId } from './weapons';
import { WEAPONS, weaponById } from './weapons';
import { applyRunSkillCard, createRunSkillState, pendingEvolution, runSkillCards, type RunSkillCard, type RunSkillState, RUN_SKILLS } from './runSkills';

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
  | 'synergy'
  | 'skill';

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
  /** YAZS run skill / passive / evolution */
  runSkill?: { kind: RunSkillCard['kind']; id: string; level: number };
  /** per-weapon upgrade track step */
  weaponLevel?: { weaponId: WeaponId; level: number };
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
    name: 'Taarruz',
    role: 'Rifle',
    weaponId: 'rifle',
    unlockLevel: 1,
    accent: 0x6ea8ff,
    icon: 'AS',
    passiveLabel: 'Hasar +%8',
    passive: { damageMult: 0.08 },
    ability: {
      id: 'kinetic_nova',
      name: 'Kinetik Nova',
      description: 'Etrafında şok dalgası',
      kind: 'kinetic_nova',
      cooldown: 9,
      power: 8,
    },
  },
  {
    id: 'medic',
    name: 'Sıhhiyeci',
    role: 'SMG',
    weaponId: 'smg',
    unlockLevel: 1,
    accent: 0x38bdf8,
    icon: 'MD',
    passiveLabel: 'Ateş hızı +%10',
    passive: { fireRateMult: 0.1 },
    ability: {
      id: 'biotic_mist',
      name: 'Biyotik Sis',
      description: 'Kendini ve yakındaki ekibi iyileştirir',
      kind: 'biotic_mist',
      cooldown: 11,
      power: 28,
    },
  },
  {
    id: 'breacher',
    name: 'Kapı Kırıcı',
    role: 'Shotgun',
    weaponId: 'shotgun',
    unlockLevel: 2,
    accent: 0xfbbf24,
    icon: 'BR',
    passiveLabel: 'Alan +%12',
    passive: { aoeRadiusMult: 0.12 },
    ability: {
      id: 'concussive_blast',
      name: 'Sarsıcı Patlama',
      description: 'Koni geri itme + ağır saçma',
      kind: 'concussive_blast',
      cooldown: 8,
      power: 4,
    },
  },
  {
    id: 'ghost',
    name: 'Hayalet',
    role: 'Sniper',
    weaponId: 'sniper',
    unlockLevel: 3,
    accent: 0x88eeff,
    icon: 'GH',
    passiveLabel: 'Kritik +%10',
    passive: { critChance: 0.1 },
    ability: {
      id: 'thermal_pierce',
      name: 'Termal Delici',
      description: 'Sonraki mermiler deler + ek hasar',
      kind: 'thermal_pierce',
      cooldown: 12,
      duration: 5,
      power: 2.2,
    },
  },
  {
    id: 'gunner',
    name: 'Makineli',
    role: 'LMG',
    weaponId: 'lmg',
    unlockLevel: 4,
    accent: 0x22d3ee,
    icon: 'GN',
    passiveLabel: 'Azami can +%8',
    passive: { maxHpMult: 0.08 },
    ability: {
      id: 'overdrive',
      name: 'Aşırı Hız',
      description: 'Büyük ateş hızı artışı',
      kind: 'overdrive',
      cooldown: 14,
      duration: 5,
      power: 0.55,
    },
  },
  {
    id: 'alchemist',
    name: 'Simyacı',
    role: 'Toxin',
    weaponId: 'smg',
    unlockLevel: 5,
    accent: 0x84cc16,
    icon: 'AL',
    passiveLabel: 'Can çalma %4',
    passive: { lifesteal: 0.04 },
    ability: {
      id: 'toxin_cloud',
      name: 'Zehir Bulutu',
      description: 'Sürüyü eriten zehir alanı',
      kind: 'toxin_cloud',
      cooldown: 13,
      duration: 4,
      power: 2.5,
    },
  },
  {
    id: 'engineer',
    name: 'Mühendis',
    role: 'Support',
    weaponId: 'rifle',
    unlockLevel: 3,
    accent: 0xf97316,
    icon: 'EN',
    passiveLabel: 'Yetenek bekleme −%12',
    passive: { abilityCdr: 0.12 },
    ability: {
      id: 'sentry_pulse',
      name: 'Nöbetçi Darbe',
      description: 'Hasar veren darbe alanı kurar',
      kind: 'sentry_pulse',
      cooldown: 11,
      duration: 5,
      power: 3.2,
    },
  },
  {
    id: 'demolisher',
    name: 'Yıkıcı',
    role: 'Explosives',
    weaponId: 'shotgun',
    unlockLevel: 4,
    accent: 0xfb7185,
    icon: 'DM',
    passiveLabel: 'Alan ve hasar +%15',
    passive: { aoeRadiusMult: 0.15, damageMult: 0.06 },
    ability: {
      id: 'cluster_barrage',
      name: 'Salkım Bombardıman',
      description: 'Gecikmeli patlama halkası',
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
    name: 'Kinetik Yükselteç',
    description: 'Silah hasarı +%12',
    rarity: 'common',
    kind: 'stat',
    mods: { damageMult: 0.12 },
    weight: 10,
  },
  {
    id: 'servo_triggers',
    name: 'Servo Tetik',
    description: 'Ateş hızı +%12',
    rarity: 'common',
    kind: 'stat',
    mods: { fireRateMult: 0.12 },
    weight: 10,
  },
  {
    id: 'exo_actuators',
    name: 'Dış İskelet',
    description: 'Hareket hızı +%8',
    rarity: 'common',
    kind: 'stat',
    mods: { moveSpeedMult: 0.08 },
    weight: 9,
  },
  {
    id: 'reactive_plate',
    name: 'Reaktif Zırh',
    description: '+18 zırh (hasar azaltma)',
    rarity: 'common',
    kind: 'stat',
    mods: { armorFlat: 18 },
    weight: 9,
  },
  {
    id: 'vital_weave',
    name: 'Can Örgüsü',
    description: 'Azami can +%10',
    rarity: 'common',
    kind: 'stat',
    mods: { maxHpMult: 0.1 },
    weight: 8,
  },
  {
    id: 'threat_optics',
    name: 'Tehdit Optiği',
    description: 'Kritik şansı +%8',
    rarity: 'rare',
    kind: 'stat',
    mods: { critChance: 0.08 },
    weight: 6,
  },
  {
    id: 'hemophage',
    name: 'Kan Emici Protokol',
    description: 'Can çalma +%5',
    rarity: 'rare',
    kind: 'stat',
    mods: { lifesteal: 0.05 },
    weight: 5,
  },
  {
    id: 'blast_focus',
    name: 'Patlama Odağı',
    description: 'Yetenek / alan yarıçapı +%20',
    rarity: 'rare',
    kind: 'stat',
    mods: { aoeRadiusMult: 0.2 },
    weight: 5,
  },
  {
    id: 'neuro_coolant',
    name: 'Nöro Soğutucu',
    description: 'Yetenek bekleme süresi −%15',
    rarity: 'rare',
    kind: 'ability_boost',
    abilityCdrFlat: 0.15,
    mods: { abilityCdr: 0.15 },
    weight: 5,
  },
  {
    id: 'ability_surge',
    name: 'Yetenek Dalgası',
    description: 'Yetenek gücü +%25',
    rarity: 'rare',
    kind: 'ability_boost',
    abilityPowerMult: 0.25,
    weight: 5,
  },
  {
    id: 'xp_antenna',
    name: 'XP Anteni',
    description: 'XP kazancı +%15',
    rarity: 'rare',
    kind: 'stat',
    mods: { xpMult: 0.15 },
    weight: 4,
  },
  {
    id: 'unlock_shotgun',
    name: 'Kapı Kırıcı Kiti',
    description: 'Savaş Pompalısı sınıfını açar',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'shotgun',
    weight: 3,
  },
  {
    id: 'unlock_sniper',
    name: 'Hayalet Kiti',
    description: 'Bobin Nişancı sınıfını açar',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'sniper',
    weight: 3,
  },
  {
    id: 'unlock_lmg',
    name: 'Makineli Kiti',
    description: 'Hafif makineli sınıfını açar',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'lmg',
    weight: 2,
  },
  {
    id: 'mastery_rifle',
    name: 'Tüfek Doktrini',
    description: 'Piyade Tüfeği +%18 hasar',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'rifle',
    masteryDamage: 0.18,
    weight: 4,
  },
  {
    id: 'mastery_smg',
    name: 'Hafif Makineli Doktrini',
    description: 'Hafif makineli ateş hızı +%15',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'smg',
    masteryFireRate: 0.15,
    weight: 4,
  },
  {
    id: 'mastery_shotgun',
    name: 'Pompalı Doktrini',
    description: 'Pompalı hasarı +%20',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'shotgun',
    masteryDamage: 0.2,
    weight: 3,
  },
  {
    id: 'mastery_pistol',
    name: 'Tabanca Doktrini',
    description: 'Tabanca ateş hızı +%20',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'pistol',
    masteryFireRate: 0.2,
    weight: 4,
  },
  {
    id: 'mastery_knife',
    name: 'Bıçak Doktrini',
    description: 'Savaş Bıçağı +%25 hasar',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'knife',
    masteryDamage: 0.25,
    weight: 4,
  },
  {
    id: 'mastery_bat',
    name: 'Sopa Doktrini',
    description: 'Beyzbol Sopası +%22 hasar',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'bat',
    masteryDamage: 0.22,
    weight: 3,
  },
  {
    id: 'mastery_axe',
    name: 'Balta Doktrini',
    description: 'Yangın Baltası hasarı +%28',
    rarity: 'rare',
    kind: 'weapon_mastery',
    masteryWeapon: 'axe',
    masteryDamage: 0.28,
    weight: 3,
  },
  {
    id: 'unlock_bat',
    name: 'Sopa Kiti',
    description: 'Beyzbol Sopası açılır',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'bat',
    weight: 3,
  },
  {
    id: 'unlock_axe',
    name: 'Balta Kiti',
    description: 'Yangın Baltası açılır',
    rarity: 'epic',
    kind: 'unlock_weapon',
    unlockWeapon: 'axe',
    weight: 2,
  },
  {
    id: 'melee_tempo',
    name: 'Adrenalin Savuruşu',
    description: 'Saldırı hızı +%15 (yakın dövüş)',
    rarity: 'common',
    kind: 'stat',
    mods: { fireRateMult: 0.15 },
    weight: 6,
  },
  {
    id: 'command_beacon',
    name: 'Komuta İşareti',
    description: 'Hasar +%10, hareket +%6',
    rarity: 'epic',
    kind: 'stat',
    mods: { damageMult: 0.1, moveSpeedMult: 0.06 },
    weight: 2,
    icon: 'CB',
  },
  // ——— Class evolutions (YAZ-style unique ability power-ups) ———
  {
    id: 'evo_nova_overload',
    name: 'Kinetik Nova: Aşırı Yük',
    description: 'Nova alanı ve gücü artar',
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
    name: 'Biyotik Sis: Çağlayan',
    description: 'Daha güçlü iyileştirme, daha geniş sis',
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
    name: 'Sarsıcı: Kırma Şarjı',
    description: 'Patlama hasarı ve geri itme artar',
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
    name: 'Termal Delici: Ray',
    description: 'Daha çok delici mermi, daha yüksek kritik',
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
    name: 'Aşırı Hız: Kırmızı Çizgi',
    description: 'Daha uzun süre, daha çok ateş hızı',
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
    name: 'Zehir Bulutu: Öldürücü',
    description: 'Bulut hasarı ve süresi artar',
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
    name: 'Nöbetçi Darbe: Tahkimat',
    description: 'Darbe daha uzun sürer, daha sert vurur',
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
    name: 'Salkım Bombardıman: Kıyamet',
    description: 'Daha çok patlama, daha geniş alan',
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
    name: 'Yakıcı Uçlar',
    description: 'İsabette %25 yakma şansı',
    rarity: 'rare',
    kind: 'status',
    icon: 'BR',
    mods: { burnChance: 0.25 },
    weight: 5,
  },
  {
    id: 'status_venom',
    name: 'Zehirli Şarjör',
    description: 'İsabette %25 zehirleme şansı',
    rarity: 'rare',
    kind: 'status',
    icon: 'TX',
    mods: { toxinChance: 0.25 },
    weight: 5,
  },
  {
    id: 'status_cryo',
    name: 'Kriyo Kaplama',
    description: 'İsabette %20 dondurma şansı',
    rarity: 'rare',
    kind: 'status',
    icon: 'CR',
    mods: { chillChance: 0.2 },
    weight: 5,
  },
  {
    id: 'status_catalyst',
    name: 'Katalizör Çekirdek',
    description: 'Durum etkisi gücü +%35',
    rarity: 'rare',
    kind: 'status',
    mods: { statusPower: 0.35 },
    weight: 4,
  },
  // ——— Synergies (gated by prior status) ———
  {
    id: 'syn_combustion',
    name: 'Yanma Döngüsü',
    description: 'Yanma için: kritik +%8, durum gücü +%20',
    rarity: 'epic',
    kind: 'synergy',
    icon: 'CB',
    requiresStatus: 'burn',
    mods: { critChance: 0.08, statusPower: 0.2 },
    weight: 3,
  },
  {
    id: 'syn_neuroshock',
    name: 'Nöroşok',
    description: 'Zehir için: ateş hızı +%10, zehir şansı artar',
    rarity: 'epic',
    kind: 'synergy',
    icon: 'NS',
    requiresStatus: 'toxin',
    mods: { fireRateMult: 0.1, toxinChance: 0.12 },
    weight: 3,
  },
  {
    id: 'syn_glacial',
    name: 'Buzul Baskısı',
    description: 'Dondurma için: zırh ve dondurma süresi artar',
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
    name: 'Darbe Mızrağı',
    description: 'Piyade Tüfeği evrimi: +%28 hasar, yakıcı mermi',
    rarity: 'epic',
    kind: 'evolution',
    icon: 'PL',
    evolveWeapon: 'rifle',
    evolutionName: 'Darbe Mızrağı',
    masteryWeapon: 'rifle',
    masteryDamage: 0.28,
    weaponStatus: 'burn',
    weaponStatusChance: 0.4,
    weight: 2,
  },
  {
    id: 'evo_weapon_smg',
    name: 'Nöro Fırtına',
    description: 'Hafif makineli evrimi: ateş hızı +%22, zehirli mermi',
    rarity: 'epic',
    kind: 'evolution',
    icon: 'NS',
    evolveWeapon: 'smg',
    evolutionName: 'Nöro Fırtına',
    masteryWeapon: 'smg',
    masteryFireRate: 0.22,
    weaponStatus: 'toxin',
    weaponStatusChance: 0.35,
    weight: 2,
  },
  {
    id: 'evo_weapon_shotgun',
    name: 'Buz Kırıcı',
    description: 'Pompalı evrimi: hasar +%25, dondurucu saçma',
    rarity: 'epic',
    kind: 'evolution',
    icon: 'FB',
    evolveWeapon: 'shotgun',
    evolutionName: 'Buz Kırıcı',
    masteryWeapon: 'shotgun',
    masteryDamage: 0.25,
    weaponStatus: 'chill',
    weaponStatusChance: 0.45,
    weight: 2,
  },
  {
    id: 'evo_weapon_axe',
    name: 'Cehennem Baltası',
    description: 'Yangın Baltası evrimi: hasar +%32, ağır yanma',
    rarity: 'epic',
    kind: 'evolution',
    icon: 'IC',
    evolveWeapon: 'axe',
    evolutionName: 'Cehennem Baltası',
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
  /** additive crit chance while holding this weapon */
  crit?: number;
  /** extra bullet pierce */
  pierce?: number;
}

/** In-run level cap. */
export const RUN_LEVEL_MAX = 200;
/** Steps on each weapon's upgrade track. */
export const WEAPON_LEVEL_MAX = 8;

interface WeaponStep {
  label: string;
  damage?: number;
  fireRate?: number;
  crit?: number;
  pierce?: number;
}
/** What every weapon gains per level (index 0 = Sv1). */
export const WEAPON_TRACK: readonly WeaponStep[] = [
  { label: '+%15 hasar', damage: 0.15 },
  { label: '+%12 atış hızı', fireRate: 0.12 },
  { label: '+%5 kritik şansı', crit: 0.05 },
  { label: 'Delici mermi: +1 delme, +%15 hasar', pierce: 1, damage: 0.15 },
  { label: '+%12 atış hızı', fireRate: 0.12 },
  { label: '+%20 hasar', damage: 0.2 },
  { label: '+%6 kritik şansı', crit: 0.06 },
  { label: 'USTALIK: +%30 hasar, +%15 atış hızı, +1 delme', damage: 0.3, fireRate: 0.15, pierce: 1 },
];

export function weaponLevel(state: ProgressState, weaponId: WeaponId): number {
  return state.weaponLevels.get(weaponId) ?? 0;
}

/** Apply one weapon-track step (used by cards and by hero-tree head starts). */
export function applyWeaponStep(state: ProgressState, weaponId: WeaponId): boolean {
  const lv = weaponLevel(state, weaponId);
  if (lv >= WEAPON_LEVEL_MAX) return false;
  const step = WEAPON_TRACK[lv]!;
  let m = state.masteries.find((x) => x.weaponId === weaponId);
  if (!m) {
    m = { weaponId, damage: 0, fireRate: 0 };
    state.masteries.push(m);
  }
  m.damage += step.damage ?? 0;
  m.fireRate += step.fireRate ?? 0;
  m.crit = (m.crit ?? 0) + (step.crit ?? 0);
  m.pierce = (m.pierce ?? 0) + (step.pierce ?? 0);
  state.weaponLevels.set(weaponId, lv + 1);
  return true;
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
  /** YAZS run skills / passives / evolutions */
  runSkills: RunSkillState;
  /** weapon families currently usable in the run (unlocked slots) → display name */
  slotWeapons: Map<WeaponId, string>;
  /** weapon upgrade-track level per family */
  weaponLevels: Map<WeaponId, number>;
  /** total XP collected this run (feeds persistent hero XP) */
  totalXp: number;
}

/**
 * XP needed for the next level. Quadratic early (fast first levels), then linear so
 * a 20 min run lands around Lv 90-110 and 60 min runs can reach the Lv 200 cap.
 */
export function xpForLevel(level: number): number {
  if (level <= 12) return Math.floor(18 + level * 12 + level * level * 2.2);
  return Math.floor(18 + 12 * 12 + 144 * 2.2 + (level - 12) * 18);
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
    runSkills: createRunSkillState(),
    slotWeapons: new Map(),
    weaponLevels: new Map(),
    totalXp: 0,
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

/** Add stat deltas the same way class passives do (additive keys add, others multiply). */
export function applyModDeltas(mods: PlayerMods, deltas: Partial<PlayerMods>): void {
  applyPassive(mods, deltas);
}

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
  if (card.runSkill) {
    applyRunSkillCard(state.runSkills, card.runSkill.kind, card.runSkill.id);
    return;
  }
  if (card.weaponLevel) {
    applyWeaponStep(state, card.weaponLevel.weaponId);
    return;
  }
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

function runSkillUpgradeCards(state: ProgressState): UpgradeCardDef[] {
  return runSkillCards(state.runSkills).map((c) => ({
    id: `rs:${c.kind}:${c.id}:${c.level}`,
    name: c.name,
    description: c.description,
    rarity: c.rarity,
    kind: 'skill' as const,
    icon: c.icon,
    // hero-exclusive radio support shows up almost immediately once
    weight: c.kind === 'evo' ? 70 : c.kind === 'fuse' ? 55 : c.kind === 'skill' ? (RUN_SKILLS[c.id as keyof typeof RUN_SKILLS]?.heroes ? (c.level === 1 ? 60 : 12) : c.level === 1 ? 8 : 11) : 6,
    runSkill: { kind: c.kind, id: c.id, level: c.level },
  }));
}

function weaponUpgradeCards(state: ProgressState): UpgradeCardDef[] {
  const out: UpgradeCardDef[] = [];
  for (const [weaponId, name] of state.slotWeapons) {
    const lv = weaponLevel(state, weaponId);
    if (lv >= WEAPON_LEVEL_MAX) continue;
    const step = WEAPON_TRACK[lv]!;
    out.push({
      id: `wl:${weaponId}:${lv + 1}`,
      name: `${name} Sv${lv + 1}`,
      description: step.label,
      rarity: lv + 1 === WEAPON_LEVEL_MAX ? 'epic' : lv + 1 === 4 ? 'rare' : 'common',
      kind: 'weapon_mastery',
      icon: 'W',
      weight: 9,
      weaponLevel: { weaponId, level: lv + 1 },
    });
  }
  return out;
}

/** Always-available fallback so a level-up can never run out of cards. */
const FILLER_CARD: UpgradeCardDef = {
  id: 'filler:reinforce',
  name: 'Takviye',
  description: '+%3 hasar, +%3 can',
  rarity: 'common',
  kind: 'stat',
  icon: '+',
  mods: { damageMult: 0.03, maxHpMult: 0.03 },
  weight: 1,
};

export function rollUpgradeChoices(state: ProgressState, count = 4): UpgradeCardDef[] {
  // A max-level skill must evolve first: the draft is its 2-3 branches.
  const evoFor = pendingEvolution(state.runSkills);
  if (evoFor) {
    const evo = runSkillUpgradeCards(state).filter((c) => c.runSkill?.kind === 'evo' && c.runSkill.id.startsWith(`${evoFor}:`));
    if (evo.length) return evo.slice(0, 3);
  }
  const pool = [...runSkillUpgradeCards(state), ...weaponUpgradeCards(state), FILLER_CARD, ...UPGRADE_CARDS.filter((card) => {
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
  }).map((c) => ({ ...c, weight: (c.weight ?? 5) * 0.55 }))];

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
  const gained = amount * state.mods.xpMult;
  state.totalXp += gained;
  if (state.level >= RUN_LEVEL_MAX) {
    // capped: keep the bar full, the XP still counts for the hero (totalXp)
    state.xp = state.xpToLevel;
    return 0;
  }
  state.xp += gained;
  while (state.xp >= state.xpToLevel && state.level < RUN_LEVEL_MAX) {
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
  if (state.level >= RUN_LEVEL_MAX) state.xp = state.xpToLevel;
  if (state.pendingPicks > 0 && state.choices.length === 0) {
    state.choices = rollUpgradeChoices(state, 4);
    // never leave the game frozen on an empty draft
    if (state.choices.length === 0) state.pendingPicks = 0;
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

/** What the hero has now, so a card shows "current >> after" (stacks add up). */
export interface CardStatContext {
  mods: PlayerMods;
  abilityPowerMult: number;
  masteries: ReadonlyArray<{ weaponId: WeaponId; damage: number; fireRate: number }>;
}

const MOD_LABEL: Partial<Record<keyof PlayerMods, string>> = {
  damageMult: 'Hasar',
  fireRateMult: 'Ateş hızı',
  moveSpeedMult: 'Hareket',
  maxHpMult: 'Can',
  critChance: 'Kritik',
  armorFlat: 'Zırh',
  xpMult: 'XP',
  lifesteal: 'Can çalma',
  aoeRadiusMult: 'Alan',
  abilityCdr: 'Bekleme −',
  burnChance: 'Yanma şansı',
  toxinChance: 'Zehir şansı',
  chillChance: 'Dondurma şansı',
  statusPower: 'Durum gücü',
};

export function cardStatLines(card: UpgradeCardDef, ctx?: CardStatContext): Array<{ label: string; before: string; after: string }> {
  const lines: Array<{ label: string; before: string; after: string }> = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const defaults = DEFAULT_MODS;
  if (card.mods) {
    for (const [k, v] of Object.entries(card.mods) as [keyof PlayerMods, number][]) {
      if (!v || !MOD_LABEL[k]) continue;
      const cur = ctx ? ctx.mods[k] : defaults[k];
      const additive = ADDITIVE_MOD_KEYS.has(k);
      const next = additive ? cur + v : cur * (1 + v);
      if (k === 'armorFlat') lines.push({ label: MOD_LABEL[k]!, before: String(Math.round(cur)), after: String(Math.round(next)) });
      else lines.push({ label: MOD_LABEL[k]!, before: pct(cur), after: pct(next) });
    }
  }
  if (card.abilityPowerMult) {
    const cur = ctx?.abilityPowerMult ?? 1;
    lines.push({ label: 'Yetenek gücü', before: pct(cur), after: pct(cur * (1 + card.abilityPowerMult)) });
  }
  if (card.abilityCdrFlat) {
    const cur = ctx?.mods.abilityCdr ?? 0;
    lines.push({ label: 'Bekleme −', before: pct(cur), after: pct(cur + card.abilityCdrFlat) });
  }
  if (card.masteryWeapon && (card.masteryDamage || card.masteryFireRate)) {
    const m = ctx?.masteries.find((x) => x.weaponId === card.masteryWeapon);
    if (card.masteryDamage) lines.push({ label: 'Silah hasarı', before: pct(1 + (m?.damage ?? 0)), after: pct(1 + (m?.damage ?? 0) + card.masteryDamage) });
    if (card.masteryFireRate) lines.push({ label: 'Silah ateş hızı', before: pct(1 + (m?.fireRate ?? 0)), after: pct(1 + (m?.fireRate ?? 0) + card.masteryFireRate) });
  }
  if (card.unlockWeapon) {
    lines.push({ label: 'Silah', before: '—', after: weaponById(card.unlockWeapon).name });
  }
  if (card.evolveWeapon) {
    lines.push({ label: 'Evrim', before: weaponById(card.evolveWeapon).name, after: card.evolutionName ?? card.name });
  }
  if (card.weaponStatus) {
    const tr: Record<StatusId, string> = { burn: 'Yanma', toxin: 'Zehir', chill: 'Dondurma' };
    lines.push({ label: 'Silah etkisi', before: '—', after: `${tr[card.weaponStatus] ?? card.weaponStatus} %${Math.round((card.weaponStatusChance ?? 0.35) * 100)}` });
  }
  if (card.runSkill) {
    const lv = card.runSkill.level;
    if (card.runSkill.kind === 'evo') lines.push({ label: 'Evrim', before: 'Sv 5', after: 'EVRİM' });
    else if (card.runSkill.kind === 'fuse') lines.push({ label: 'Füzyon', before: '2 yetenek', after: 'BİRLEŞİK' });
    else lines.push({ label: card.runSkill.kind === 'passive' ? 'Pasif seviye' : 'Seviye', before: lv <= 1 ? '—' : `Sv ${lv - 1}`, after: `Sv ${lv}` });
  }
  if (card.weaponLevel) {
    const lv = card.weaponLevel.level;
    lines.push({ label: 'Silah seviyesi', before: lv <= 1 ? 'Sv 0' : `Sv ${lv - 1}`, after: `Sv ${lv}` });
  }
  if (card.heroRank) lines.push({ label: `${card.heroRank.toUpperCase()} yeteneği`, before: 'Sv', after: '+1' });
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

/**
 * Rebuild a card from its id (saved runs: a co-op guest who comes back replays the
 * picks they had). Fixed cards come from the table; skill and weapon-track cards are
 * generated, so their ids carry everything needed.
 */
export function cardFromId(id: string): UpgradeCardDef | null {
  const fixed = UPGRADE_CARDS.find((c) => c.id === id) ?? (id === FILLER_CARD.id ? FILLER_CARD : null);
  if (fixed) return fixed;
  const rs = /^rs:([a-z]+):([a-z0-9_]+):(\d+)$/.exec(id);
  if (rs) {
    return { id, name: rs[2]!, description: '', rarity: 'common', kind: 'skill', icon: 'S', weight: 0, runSkill: { kind: rs[1] as RunSkillCard['kind'], id: rs[2]!, level: Number(rs[3]) } };
  }
  const wl = /^wl:([a-z0-9_]+):(\d+)$/.exec(id);
  if (wl) {
    return { id, name: wl[1]!, description: '', rarity: 'common', kind: 'weapon_mastery', icon: 'W', weight: 0, weaponLevel: { weaponId: wl[1] as WeaponId, level: Number(wl[2]) } };
  }
  return null;
}

/** What a co-op guest keeps when they drop out and come back. */
export interface SavedRunProgress {
  level: number;
  xp: number;
  totalXp: number;
  picks: string[];
  hp: number;
  kills: number;
}

export function exportRunProgress(state: ProgressState, hpRatio: number, kills: number): SavedRunProgress {
  return { level: state.level, xp: state.xp, totalXp: state.totalXp, picks: [...state.pickedIds], hp: hpRatio, kills };
}

/** Replay saved picks onto a fresh run state. Unknown ids are skipped. */
export function importRunProgress(state: ProgressState, saved: SavedRunProgress): void {
  state.level = Math.max(1, Math.min(200, Math.floor(saved.level) || 1));
  state.xp = Math.max(0, saved.xp || 0);
  state.xpToLevel = xpForLevel(state.level);
  state.totalXp = Math.max(0, saved.totalXp || 0);
  for (const id of Array.isArray(saved.picks) ? saved.picks.slice(0, 400) : []) {
    const card = cardFromId(String(id));
    if (card) applyUpgradeCard(state, card);
  }
}
