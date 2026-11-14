import * as THREE from 'three';
import type { WeaponSfxKind } from './audio';
import { metalMap, stdMat } from './materials';
import { buildWeaponModel } from './weaponModels';
import { hasGunModel, instantiateGun, loadGunTemplate, VARIANT_MODELS } from './weaponAssets';

export type WeaponId =
  | 'rifle'
  | 'smg'
  | 'shotgun'
  | 'sniper'
  | 'lmg'
  | 'pistol'
  | 'knife'
  | 'bat'
  | 'axe';

/** How the operative grips the weapon for IK / poses. */
export type WeaponGrip = 'rifle' | 'smg' | 'pistol' | 'melee';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  sfx: WeaponSfxKind;
  grip: WeaponGrip;
  fireRate: number;
  damage: number;
  range: number;
  spread: number;
  pellets: number;
  tracerColor: number;
  recoil: number;
  auto: boolean;
  magSize: number;
  reloadTime: number;
  /** Melee weapons ignore ammo / bullets */
  melee?: boolean;
  /** Arc half-angle for melee (radians) */
  meleeArc?: number;
  /** Unique catalog key (30 variants share 9 progression families in `id`). */
  variant?: string;
  tier?: 1 | 2 | 3 | 4;
  /** Armory price in credits (0 = starter) */
  cost?: number;
  desc?: string;
  /** Signature weapon: only this operative can equip it. */
  hero?: string;
  look?: WeaponLook;
  fx?: WeaponFxDef;
}

export type WeaponImpact = 'flesh' | 'incendiary' | 'shock' | 'explosive' | 'cryo' | 'toxic' | 'heavy';

export interface WeaponFxDef {
  /** muzzle flash colour + size multiplier */
  flash: number;
  flashScale: number;
  /** tracer thickness multiplier */
  tracer: number;
  impact: WeaponImpact;
  /** explosive radius (world units) */
  aoe?: number;
  /** shock: extra targets */
  chain?: number;
  /** chance to apply impact status (burn / chill / toxin) */
  statusChance?: number;
  /** bullets pass through this many zombies */
  pierce?: number;
  /** projectile speed multiplier (grenades < 1) */
  speed?: number;
}

export type WeaponBody = 'pistol' | 'revolver' | 'smg' | 'rifle' | 'bullpup' | 'shotgun' | 'double' | 'sniper' | 'lmg' | 'minigun' | 'launcher' | 'blade' | 'club' | 'axe' | 'machete';

export interface WeaponLook {
  body: WeaponBody;
  /** overall length multiplier */
  length?: number;
  barrel?: number;
  mag?: 'none' | 'straight' | 'curved' | 'drum' | 'box' | 'tube';
  scope?: 'none' | 'dot' | 'long' | 'holo';
  stock?: 'none' | 'fixed' | 'folding' | 'wood';
  muzzle?: 'none' | 'suppressor' | 'brake' | 'flash';
  /** main finish */
  finish: number;
  /** secondary (furniture) */
  trim: number;
  /** emissive strip colour, 0 = none */
  glow?: number;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'rifle',
    variant: 'rifle', tier: 1, cost: 0, desc: 'Dengeli otomatik tüfek.', look: { body: 'rifle', mag: 'curved', scope: 'dot', stock: 'fixed', finish: 0x1c2228, trim: 0x2b3138 }, fx: { flash: 0xffd27a, flashScale: 1, tracer: 1, impact: 'flesh' },
    name: 'Assault Rifle',
    sfx: 'rifle',
    grip: 'rifle',
    fireRate: 0.11,
    damage: 1.2,
    range: 28,
    spread: 0.02,
    pellets: 1,
    tracerColor: 0xffe08a,
    recoil: 0.12,
    auto: true,
    magSize: 30,
    reloadTime: 1.55,
  },
  {
    id: 'smg',
    variant: 'smg', tier: 1, cost: 0, desc: 'Hızlı, kısa menzil.', look: { body: 'smg', mag: 'straight', stock: 'folding', finish: 0x22262b, trim: 0x111417 }, fx: { flash: 0xffc98a, flashScale: 0.7, tracer: 0.8, impact: 'flesh' },
    name: 'SMG',
    sfx: 'smg',
    grip: 'smg',
    fireRate: 0.06,
    damage: 0.7,
    range: 18,
    spread: 0.05,
    pellets: 1,
    tracerColor: 0xffd0a0,
    recoil: 0.06,
    auto: true,
    magSize: 40,
    reloadTime: 1.25,
  },
  {
    id: 'shotgun',
    variant: 'shotgun', tier: 1, cost: 0, desc: 'Yakın mesafe yıkım.', look: { body: 'shotgun', mag: 'tube', stock: 'fixed', finish: 0x1d2024, trim: 0x3a2a1e }, fx: { flash: 0xffb45e, flashScale: 1.5, tracer: 0.8, impact: 'heavy' },
    name: 'Combat Shotgun',
    sfx: 'shotgun',
    grip: 'rifle',
    fireRate: 0.55,
    damage: 1.1,
    range: 12,
    spread: 0.14,
    pellets: 6,
    tracerColor: 0xffaa66,
    recoil: 0.35,
    auto: true,
    magSize: 8,
    reloadTime: 2.1,
  },
  {
    id: 'sniper',
    variant: 'sniper', tier: 2, cost: 450, desc: 'Manyetik hızlandırıcı, uzun menzil.', look: { body: 'sniper', mag: 'box', scope: 'long', stock: 'fixed', finish: 0x20262c, trim: 0x0f1316, glow: 0x88eeff }, fx: { flash: 0x9ef0ff, flashScale: 1.2, tracer: 1.6, impact: 'heavy', pierce: 2 },
    name: 'Coil Marksman',
    sfx: 'sniper',
    grip: 'rifle',
    fireRate: 0.85,
    damage: 6,
    range: 48,
    spread: 0.004,
    pellets: 1,
    tracerColor: 0x88eeff,
    recoil: 0.4,
    auto: true,
    magSize: 5,
    reloadTime: 2.4,
  },
  {
    id: 'lmg',
    variant: 'lmg', tier: 2, cost: 600, desc: 'Uzun namlulu AK, ağır baskı ateşi.', look: { body: 'lmg', mag: 'box', scope: 'dot', stock: 'fixed', finish: 0x262a24, trim: 0x15170f }, fx: { flash: 0xffd06a, flashScale: 1.2, tracer: 1.1, impact: 'flesh' },
    name: 'RPK Light MG',
    sfx: 'lmg',
    grip: 'rifle',
    fireRate: 0.09,
    damage: 1.5,
    range: 32,
    spread: 0.035,
    pellets: 1,
    tracerColor: 0xffcc55,
    recoil: 0.16,
    auto: true,
    magSize: 60,
    reloadTime: 2.8,
  },
  {
    id: 'pistol',
    variant: 'pistol', tier: 1, cost: 0, desc: 'Güvenilir yedek.', look: { body: 'pistol', mag: 'none', finish: 0x1b1e22, trim: 0x0f1113 }, fx: { flash: 0xffe0a0, flashScale: 0.6, tracer: 0.7, impact: 'flesh' },
    name: 'Service Pistol',
    sfx: 'pistol',
    grip: 'pistol',
    fireRate: 0.18,
    damage: 1.05,
    range: 16,
    spread: 0.04,
    pellets: 1,
    tracerColor: 0xffe4b0,
    recoil: 0.1,
    auto: true,
    magSize: 15,
    reloadTime: 1.1,
  },
  {
    id: 'knife',
    variant: 'knife', tier: 1, cost: 0, desc: 'Sessiz ve hızlı.', look: { body: 'blade', finish: 0xb8c0c8, trim: 0x15181b }, fx: { flash: 0, flashScale: 0, tracer: 0, impact: 'flesh' },
    name: 'Combat Knife',
    sfx: 'melee',
    grip: 'melee',
    fireRate: 0.38,
    damage: 4.2,
    range: 2.2,
    spread: 0,
    pellets: 1,
    tracerColor: 0xc0c8d0,
    recoil: 0.2,
    auto: true,
    magSize: 1,
    reloadTime: 0.01,
    melee: true,
    meleeArc: 0.95,
  },
  {
    id: 'bat',
    variant: 'bat', tier: 1, cost: 150, desc: 'Geniş savuruş, geri itme.', look: { body: 'club', finish: 0x7a4a2a, trim: 0x15181b }, fx: { flash: 0, flashScale: 0, tracer: 0, impact: 'heavy' },
    name: 'Riot Bat',
    sfx: 'melee',
    grip: 'melee',
    fireRate: 0.55,
    damage: 6.4,
    range: 2.6,
    spread: 0,
    pellets: 1,
    tracerColor: 0xb45309,
    recoil: 0.35,
    auto: true,
    magSize: 1,
    reloadTime: 0.01,
    melee: true,
    meleeArc: 1.15,
  },
  {
    id: 'axe',
    variant: 'axe', tier: 2, cost: 350, desc: 'Ağır, yüksek hasar.', look: { body: 'axe', finish: 0xc02a2a, trim: 0x4a3020 }, fx: { flash: 0, flashScale: 0, tracer: 0, impact: 'heavy' },
    name: 'Fire Axe',
    sfx: 'melee',
    grip: 'melee',
    fireRate: 0.72,
    damage: 9.6,
    range: 2.8,
    spread: 0,
    pellets: 1,
    tracerColor: 0xef4444,
    recoil: 0.45,
    auto: true,
    magSize: 1,
    reloadTime: 0.01,
    melee: true,
    meleeArc: 1.25,
  },
];


/**
 * Armory catalogue: 21 variants on top of the 9 base weapons = 30.
 * `id` is the progression family (cards, mastery, evolutions keep working);
 * `variant` is what the loadout stores.
 */
const V = (d: Omit<WeaponDef, 'variant'> & { variant: string }): WeaponDef => d;
WEAPONS.push(
  // ——— Pistols (5) ———
  V({ id: 'pistol', variant: 'viper9', name: 'Viper 9', sfx: 'pistol', grip: 'pistol', fireRate: 0.11, damage: 0.85, range: 16, spread: 0.05, pellets: 1, tracerColor: 0xffe4b0, recoil: 0.08, auto: true, magSize: 20, reloadTime: 1.0, tier: 1, cost: 200, desc: 'Yarı otomatik, yüksek atış hızı.',
    look: { body: 'pistol', finish: 0x2e3238, trim: 0x8a6a3a, muzzle: 'brake' }, fx: { flash: 0xffe0a0, flashScale: 0.6, tracer: 0.7, impact: 'flesh' } }),
  V({ id: 'pistol', variant: 'magnum44', name: 'Hand Cannon .45', sfx: 'sniper', grip: 'pistol', fireRate: 0.42, damage: 3.4, range: 20, spread: 0.02, pellets: 1, tracerColor: 0xffd27a, recoil: 0.32, auto: true, magSize: 6, reloadTime: 1.7, tier: 2, cost: 420, desc: 'Ağır kalibre tabanca, delip geçer.',
    look: { body: 'revolver', length: 1.15, finish: 0xb9bec4, trim: 0x3a2618 }, fx: { flash: 0xffc070, flashScale: 1.2, tracer: 1.2, impact: 'heavy', pierce: 1 } }),
  V({ id: 'pistol', variant: 'flare', name: 'Ember Pistol', sfx: 'shotgun', grip: 'pistol', fireRate: 0.6, damage: 1.6, range: 18, spread: 0.03, pellets: 1, tracerColor: 0xff5a1f, recoil: 0.2, auto: true, magSize: 4, reloadTime: 1.4, tier: 2, cost: 380, desc: 'Yanıcı mermi: isabet edeni tutuşturur.',
    look: { body: 'pistol', length: 1.2, barrel: 1.4, finish: 0xd9561c, trim: 0x1a1a1a }, fx: { flash: 0xff6a2a, flashScale: 1.1, tracer: 2.2, impact: 'incendiary', statusChance: 1, aoe: 1.8, speed: 0.55 } }),
  V({ id: 'pistol', variant: 'arc_pistol', name: 'Arc Pistol', sfx: 'pistol', grip: 'pistol', fireRate: 0.24, damage: 1.3, range: 15, spread: 0.02, pellets: 1, tracerColor: 0x7cd4ff, recoil: 0.1, auto: true, magSize: 12, reloadTime: 1.3, tier: 3, cost: 750, desc: 'Elektrik zinciri 2 hedefe sıçrar.',
    look: { body: 'pistol', finish: 0x20242c, trim: 0x3a4250, glow: 0x5cc8ff }, fx: { flash: 0x8fdcff, flashScale: 0.8, tracer: 1.3, impact: 'shock', chain: 2 } }),
  // ——— SMGs (5) ———
  V({ id: 'smg', variant: 'vector', name: 'Stinger PDW', sfx: 'smg', grip: 'smg', fireRate: 0.045, damage: 0.62, range: 17, spread: 0.06, pellets: 1, tracerColor: 0xffd0a0, recoil: 0.05, auto: true, magSize: 33, reloadTime: 1.2, tier: 2, cost: 400, desc: 'Kompakt PDW, aşırı yüksek atış hızı.',
    look: { body: 'smg', length: 0.95, mag: 'straight', scope: 'holo', stock: 'folding', finish: 0x2a2d30, trim: 0x6b6f45 }, fx: { flash: 0xffc98a, flashScale: 0.6, tracer: 0.7, impact: 'flesh' } }),
  V({ id: 'smg', variant: 'compact_mp', name: 'M10 Machine Pistol', sfx: 'smg', grip: 'smg', fireRate: 0.07, damage: 0.8, range: 16, spread: 0.045, pellets: 1, tracerColor: 0xffe0b0, recoil: 0.05, auto: true, magSize: 30, reloadTime: 1.1, tier: 1, cost: 220, desc: 'Kabzadan şarjörlü, kompakt makineli tabanca.',
    look: { body: 'smg', length: 0.85, mag: 'straight', stock: 'none', muzzle: 'suppressor', finish: 0x15171a, trim: 0x2a2d30 }, fx: { flash: 0xffd9a0, flashScale: 0.3, tracer: 0.6, impact: 'flesh' } }),
  V({ id: 'smg', variant: 'cryo_smg', name: 'Cryo SMG', sfx: 'smg', grip: 'smg', fireRate: 0.08, damage: 0.7, range: 17, spread: 0.05, pellets: 1, tracerColor: 0x9be7ff, recoil: 0.05, auto: true, magSize: 36, reloadTime: 1.3, tier: 3, cost: 700, desc: 'Dondurucu mermi: yavaşlatır.',
    look: { body: 'smg', mag: 'drum', stock: 'fixed', finish: 0xdfe8ee, trim: 0x2b3a46, glow: 0x7fe0ff }, fx: { flash: 0xb8f0ff, flashScale: 0.7, tracer: 1, impact: 'cryo', statusChance: 0.35 } }),
  V({ id: 'smg', variant: 'bulldog_pdw', name: 'Bulldog PDW', sfx: 'smg', grip: 'smg', fireRate: 0.075, damage: 0.95, range: 19, spread: 0.04, pellets: 1, tracerColor: 0xffcc80, recoil: 0.07, auto: true, magSize: 50, reloadTime: 1.6, tier: 2, cost: 520, desc: 'Yüksek kapasiteli şarjör, delici mermi.',
    look: { body: 'smg', length: 1.05, mag: 'drum', scope: 'dot', stock: 'fixed', finish: 0x3b3a2e, trim: 0x1a1a14 }, fx: { flash: 0xffc070, flashScale: 0.8, tracer: 0.9, impact: 'flesh', pierce: 1 } }),
  V({ id: 'smg', variant: 'toxin_smg', name: 'Plague Sprayer', sfx: 'smg', grip: 'smg', fireRate: 0.07, damage: 0.6, range: 15, spread: 0.07, pellets: 1, tracerColor: 0x9cff2e, recoil: 0.05, auto: true, magSize: 40, reloadTime: 1.4, tier: 3, cost: 680, desc: 'Zehirli mermi, zamanla hasar.',
    look: { body: 'smg', mag: 'curved', stock: 'folding', finish: 0x2c3a22, trim: 0x101410, glow: 0x9cff2e }, fx: { flash: 0xb6ff5a, flashScale: 0.7, tracer: 0.9, impact: 'toxic', statusChance: 0.4 } }),
  // ——— Rifles (6) ———
  V({ id: 'rifle', variant: 'carbine_m4', name: 'H-17 Battle Rifle', sfx: 'rifle', grip: 'rifle', fireRate: 0.1, damage: 1.25, range: 30, spread: 0.018, pellets: 1, tracerColor: 0xffe08a, recoil: 0.11, auto: true, magSize: 30, reloadTime: 1.45, tier: 1, cost: 300, desc: 'Ağır kalibre muharebe tüfeği, isabetli.',
    look: { body: 'rifle', length: 0.95, mag: 'straight', scope: 'holo', stock: 'folding', finish: 0x2b2d2f, trim: 0x111316 }, fx: { flash: 0xffd27a, flashScale: 0.9, tracer: 1, impact: 'flesh' } }),
  V({ id: 'rifle', variant: 'ak_ravager', name: 'AK Ravager', sfx: 'rifle', grip: 'rifle', fireRate: 0.12, damage: 1.6, range: 27, spread: 0.035, pellets: 1, tracerColor: 0xffc060, recoil: 0.16, auto: true, magSize: 30, reloadTime: 1.7, tier: 2, cost: 480, desc: 'Ağır kalibre, sert tepme.',
    look: { body: 'rifle', mag: 'curved', stock: 'wood', muzzle: 'brake', finish: 0x1d1f21, trim: 0x6a3a1c }, fx: { flash: 0xffb050, flashScale: 1.2, tracer: 1.1, impact: 'heavy' } }),
  V({ id: 'rifle', variant: 'bullpup_f2', name: 'Krinkov Carbine', sfx: 'rifle', grip: 'rifle', fireRate: 0.085, damage: 1.15, range: 29, spread: 0.02, pellets: 1, tracerColor: 0xfff0a0, recoil: 0.1, auto: true, magSize: 36, reloadTime: 1.6, tier: 2, cost: 520, desc: 'Katlanır dipçikli kısa AK, hızlı ateş.',
    look: { body: 'bullpup', mag: 'straight', scope: 'dot', finish: 0x4b4f36, trim: 0x15170f }, fx: { flash: 0xffe08a, flashScale: 0.9, tracer: 1, impact: 'flesh' } }),
  V({ id: 'rifle', variant: 'dmr_burst', name: 'Marksman DMR', sfx: 'sniper', grip: 'rifle', fireRate: 0.26, damage: 2.8, range: 38, spread: 0.008, pellets: 1, tracerColor: 0xffffff, recoil: 0.2, auto: true, magSize: 20, reloadTime: 1.8, tier: 3, cost: 760, desc: 'Uzun namlu, delici atış.',
    look: { body: 'rifle', length: 1.2, barrel: 1.3, mag: 'box', scope: 'long', stock: 'fixed', finish: 0x26292c, trim: 0x585e64 }, fx: { flash: 0xfff0c0, flashScale: 1, tracer: 1.4, impact: 'heavy', pierce: 1 } }),
  V({ id: 'rifle', variant: 'inferno_ar', name: 'Inferno AR', sfx: 'rifle', grip: 'rifle', fireRate: 0.11, damage: 1.2, range: 26, spread: 0.025, pellets: 1, tracerColor: 0xff7a2a, recoil: 0.12, auto: true, magSize: 30, reloadTime: 1.6, tier: 3, cost: 820, desc: 'Yanıcı mermi: tutuşturur.',
    look: { body: 'rifle', mag: 'curved', scope: 'dot', stock: 'fixed', muzzle: 'flash', finish: 0x2a1a14, trim: 0x111111, glow: 0xff6a1a }, fx: { flash: 0xff7a2a, flashScale: 1.2, tracer: 1.2, impact: 'incendiary', statusChance: 0.3 } }),
  // ——— Shotguns (4) ———
  V({ id: 'shotgun', variant: 'double_barrel', name: 'Sawed-Off', sfx: 'shotgun', grip: 'rifle', fireRate: 0.32, damage: 1.4, range: 10, spread: 0.18, pellets: 9, tracerColor: 0xffaa66, recoil: 0.45, auto: true, magSize: 4, reloadTime: 1.6, tier: 1, cost: 260, desc: 'Kesik namlu pompalı, devasa saçma.',
    look: { body: 'double', stock: 'wood', finish: 0x2c2e30, trim: 0x6b3f2a }, fx: { flash: 0xffa04a, flashScale: 1.8, tracer: 0.8, impact: 'heavy' } }),
  V({ id: 'shotgun', variant: 'saiga_auto', name: 'Saiga Auto', sfx: 'shotgun', grip: 'rifle', fireRate: 0.26, damage: 0.95, range: 12, spread: 0.13, pellets: 6, tracerColor: 0xffb070, recoil: 0.3, auto: true, magSize: 12, reloadTime: 2.2, tier: 2, cost: 620, desc: 'Şarjörlü yarı otomatik av tüfeği.',
    look: { body: 'shotgun', mag: 'drum', stock: 'folding', finish: 0x1a1c1e, trim: 0x2d3034 }, fx: { flash: 0xffb45e, flashScale: 1.4, tracer: 0.8, impact: 'heavy' } }),
  V({ id: 'shotgun', variant: 'dragons_breath', name: "Dragon's Breath", sfx: 'shotgun', grip: 'rifle', fireRate: 0.6, damage: 0.9, range: 11, spread: 0.16, pellets: 7, tracerColor: 0xff5a1f, recoil: 0.35, auto: true, magSize: 6, reloadTime: 2.0, tier: 3, cost: 880, desc: 'Ateş saçması: koni şeklinde alev.',
    look: { body: 'shotgun', mag: 'tube', stock: 'fixed', muzzle: 'flash', finish: 0x261612, trim: 0x111111, glow: 0xff5a1f }, fx: { flash: 0xff5a1f, flashScale: 2.2, tracer: 1.3, impact: 'incendiary', statusChance: 0.5 } }),
  // ——— Snipers (3) ———
  V({ id: 'sniper', variant: 'hunter_bolt', name: 'Bullpup .338', sfx: 'sniper', grip: 'rifle', fireRate: 1.0, damage: 7.5, range: 50, spread: 0.003, pellets: 1, tracerColor: 0xffffff, recoil: 0.42, auto: true, magSize: 5, reloadTime: 2.2, tier: 2, cost: 560, desc: 'Bullpup keskin nişancı, tek atış tek ölüm.',
    look: { body: 'sniper', mag: 'box', scope: 'long', stock: 'wood', finish: 0x2a2c2e, trim: 0x5a3a20 }, fx: { flash: 0xfff0c0, flashScale: 1.1, tracer: 1.5, impact: 'heavy', pierce: 2 } }),
  V({ id: 'sniper', variant: 'anti_materiel', name: 'Anti-Materiel .50', sfx: 'sniper', grip: 'rifle', fireRate: 1.3, damage: 14, range: 60, spread: 0.002, pellets: 1, tracerColor: 0xffd27a, recoil: 0.7, auto: true, magSize: 4, reloadTime: 2.8, tier: 4, cost: 1500, desc: 'Her şeyi delip geçer, şok dalgası.',
    look: { body: 'sniper', length: 1.35, barrel: 1.5, mag: 'box', scope: 'long', stock: 'fixed', muzzle: 'brake', finish: 0x3a3d33, trim: 0x15170f }, fx: { flash: 0xffc070, flashScale: 2, tracer: 2.2, impact: 'explosive', aoe: 1.6, pierce: 8 } }),
  // ——— Heavy (3: LMG family) ———
  V({ id: 'lmg', variant: 'shredder', name: 'Shredder Minigun', sfx: 'lmg', grip: 'rifle', fireRate: 0.035, damage: 0.9, range: 26, spread: 0.07, pellets: 1, tracerColor: 0xffcc55, recoil: 0.08, auto: true, magSize: 200, reloadTime: 3.4, tier: 4, cost: 1400, desc: 'Döner namlu, mermi yağmuru.',
    look: { body: 'minigun', mag: 'box', finish: 0x2a2c2e, trim: 0x6b6f72 }, fx: { flash: 0xffd06a, flashScale: 1.1, tracer: 1, impact: 'flesh' } }),
  V({ id: 'lmg', variant: 'thumper_gl', name: 'Thumper GL', sfx: 'shotgun', grip: 'rifle', fireRate: 0.75, damage: 4.5, range: 26, spread: 0.02, pellets: 1, tracerColor: 0xffaa33, recoil: 0.4, auto: true, magSize: 6, reloadTime: 2.6, tier: 3, cost: 980, desc: 'Bombaatar: alan hasarı.',
    look: { body: 'launcher', mag: 'drum', stock: 'fixed', finish: 0x3b4030, trim: 0x15170f }, fx: { flash: 0xffaa33, flashScale: 1.6, tracer: 3, impact: 'explosive', aoe: 3.2, speed: 0.45 } }),
  // ——— Melee (4th) ———
  V({ id: 'knife', variant: 'machete', name: 'Machete', sfx: 'melee', grip: 'melee', fireRate: 0.42, damage: 5.6, range: 2.6, spread: 0, pellets: 1, tracerColor: 0xd0d8e0, recoil: 0.25, auto: true, magSize: 1, reloadTime: 0.01, melee: true, meleeArc: 1.1, tier: 2, cost: 300, desc: 'Uzun bıçak, geniş kesik.',
    look: { body: 'machete', finish: 0xc8d0d8, trim: 0x2a1a10 }, fx: { flash: 0, flashScale: 0, tracer: 0, impact: 'flesh' } }),
);

// Class signature weapons. Appended last so existing weapon indices stay put.
WEAPONS.push(
  V({ id: 'smg', variant: 'sirt_pompasi', hero: 'tox', name: 'Sırt Pompası', sfx: 'smg', grip: 'smg', fireRate: 0.07, damage: 0.58, range: 14, spread: 0.085, pellets: 1, tracerColor: 0x9cff2e, recoil: 0.04, auto: true, magSize: 45, reloadTime: 1.5, tier: 1, cost: 0, desc: 'Zirai ilaç pompası: kısa menzil, zehir zamanla eritir.',
    look: { body: 'smg', mag: 'drum', stock: 'none', finish: 0x3a5a22, trim: 0xc9a227, glow: 0x9cff2e }, fx: { flash: 0xb6ff5a, flashScale: 0.6, tracer: 0.9, impact: 'toxic', statusChance: 0.25 } }),
  V({ id: 'rifle', variant: 'civi_tabancasi', hero: 'spark', name: 'Çivi Tabancası', sfx: 'pistol', grip: 'rifle', fireRate: 0.13, damage: 1.3, range: 24, spread: 0.022, pellets: 1, tracerColor: 0xcfd8e3, recoil: 0.1, auto: true, magSize: 32, reloadTime: 1.5, tier: 1, cost: 0, desc: 'Kompresörlü çivi tabancası: çivi ilk hedefi delip geçer.',
    look: { body: 'bullpup', mag: 'box', stock: 'none', finish: 0xd9a514, trim: 0x22262c, glow: 0x5cc8ff }, fx: { flash: 0xd8ecff, flashScale: 0.5, tracer: 1.1, impact: 'heavy', pierce: 1 } }),
  V({ id: 'shotgun', variant: 'boru_havan', hero: 'havoc', name: 'Boru Havan', sfx: 'shotgun', grip: 'rifle', fireRate: 0.7, damage: 3.4, range: 18, spread: 0.03, pellets: 1, tracerColor: 0xffaa33, recoil: 0.42, auto: true, magSize: 5, reloadTime: 2.3, tier: 1, cost: 0, desc: 'El yapımı boru havan: tek mermi, küçük alan patlaması.',
    look: { body: 'launcher', mag: 'none', stock: 'wood', finish: 0x5a5148, trim: 0x2a1a10 }, fx: { flash: 0xffaa33, flashScale: 1.4, tracer: 3, impact: 'explosive', aoe: 2.2, speed: 0.45 } }),
);

export function weaponVariantId(w: WeaponDef): string {
  return w.variant ?? w.id;
}

export function weaponByVariant(variant: string): WeaponDef {
  return WEAPONS.find((w) => weaponVariantId(w) === variant) ?? WEAPONS[0]!;
}

export function weaponIndexOfVariant(variant: string): number {
  const i = WEAPONS.findIndex((w) => weaponVariantId(w) === variant);
  return i >= 0 ? i : 0;
}

export const FIREARM_IDS: WeaponId[] = ['rifle', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol'];
export const MELEE_IDS: WeaponId[] = ['knife', 'bat', 'axe'];

export function weaponById(id: WeaponId): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0]!;
}

export function weaponByIndex(index: number): WeaponDef {
  const i = ((index % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
  return WEAPONS[i]!;
}

export function isMeleeWeapon(weapon: WeaponDef | WeaponId): boolean {
  const id = typeof weapon === 'string' ? weapon : weapon.id;
  return weaponById(id).melee === true;
}

/** Build weapon mesh + muzzle/tip anchor (local +Z tip). Clears mount first. */
export function attachWeaponMesh(
  mount: THREE.Group,
  weapon: WeaponDef,
  accentColor: number,
  scale = 1,
): THREE.Object3D {
  while (mount.children.length > 0) {
    const child = mount.children[0]!;
    mount.remove(child);
  }

  const s = scale;
  const variant = weapon.variant ?? weapon.id;
  mount.userData.weaponVariant = variant;
  // Realistic model (CC0 Flat Guns + PBR). If it is still loading, show the procedural
  // stand-in now and swap in place when ready — the returned muzzle object stays the same.
  const real = instantiateGun(variant, s);
  if (real) {
    mount.add(real.group);
    return real.tip;
  }
  if (weapon.look) {
    const built = buildWeaponModel(weapon.look, s);
    mount.add(built.group);
    if (hasGunModel(variant)) {
      const tip = built.tip;
      void loadGunTemplate(VARIANT_MODELS[variant]!.file).then(() => {
        if (mount.userData.weaponVariant !== variant) return;
        const now = instantiateGun(variant, s);
        if (!now) return;
        mount.remove(built.group);
        mount.add(now.group);
        // keep the caller's muzzle handle: move it to the real muzzle
        tip.removeFromParent();
        tip.position.copy(now.tip.position);
        now.group.add(tip);
        now.tip.removeFromParent();
      });
    }
    return built.tip;
  }
  const gunMat = stdMat(metalMap(), 0x1c2228, { metalness: 0.72, roughness: 0.32 });
  const dark = stdMat(null, 0x0c1014, { metalness: 0.25, roughness: 0.55 });
  const accent = stdMat(null, accentColor, {
    metalness: 0.35,
    roughness: 0.45,
    emissive: accentColor,
    emissiveIntensity: 0.4,
  });
  const wood = stdMat(null, 0x6b3f2a, { metalness: 0.05, roughness: 0.75 });
  const tip = new THREE.Object3D();
  tip.name = 'muzzlePoint';

  const g = new THREE.Group();

  if (weapon.id === 'pistol') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * s, 0.025 * s, 0.28 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.16 * s;
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.1 * s, 0.22 * s), dark);
    slide.position.z = 0.06 * s;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.2 * s, 0.1 * s), dark);
    grip.position.set(0, -0.12 * s, -0.02 * s);
    g.add(barrel, slide, grip);
    tip.position.set(0, 0, 0.32 * s);
  } else if (weapon.id === 'knife') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.02 * s, 0.32 * s), gunMat);
    blade.position.z = 0.18 * s;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 0.14 * s, 8), dark);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -0.02 * s;
    g.add(blade, handle);
    tip.position.set(0, 0, 0.36 * s);
  } else if (weapon.id === 'bat') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.045 * s, 0.85 * s, 8), wood);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.35 * s;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.18 * s, 8), dark);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = -0.05 * s;
    g.add(shaft, grip);
    tip.position.set(0, 0, 0.8 * s);
  } else if (weapon.id === 'axe') {
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 0.7 * s, 8), wood);
    haft.rotation.x = Math.PI / 2;
    haft.position.z = 0.28 * s;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28 * s, 0.08 * s, 0.16 * s), gunMat);
    head.position.set(0.06 * s, 0, 0.58 * s);
    g.add(haft, head);
    tip.position.set(0.08 * s, 0, 0.7 * s);
  } else if (weapon.id === 'smg') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * s, 0.032 * s, 0.55 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.28 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.14 * s, 0.28 * s), dark);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.1 * s, 0.16 * s), dark);
    stock.position.z = -0.18 * s;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.28 * s, 0.08 * s), accent);
    mag.position.set(0, -0.18 * s, 0.05 * s);
    g.add(barrel, receiver, stock, mag);
    tip.position.set(0, 0, 0.58 * s);
  } else if (weapon.id === 'shotgun') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.85 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.4 * s;
    const barrel2 = barrel.clone();
    barrel2.position.x = 0.06 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.16 * s, 0.3 * s), dark);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.14 * s, 0.32 * s), dark);
    stock.position.set(0, -0.02 * s, -0.28 * s);
    g.add(barrel, barrel2, receiver, stock);
    tip.position.set(0.03 * s, 0, 0.85 * s);
  } else if (weapon.id === 'sniper') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.035 * s, 1.35 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.55 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.14 * s, 0.4 * s), dark);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.28 * s, 10), accent);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1 * s, 0.05 * s);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.12 * s, 0.36 * s), dark);
    stock.position.z = -0.32 * s;
    g.add(barrel, receiver, scope, stock);
    tip.position.set(0, 0, 1.25 * s);
  } else if (weapon.id === 'lmg') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.045 * s, 1.1 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.48 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.2 * s, 0.42 * s), dark);
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.28 * s, 0.04 * s, 0.04 * s), gunMat);
    bipod.position.set(0, -0.12 * s, 0.35 * s);
    const boxMag = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.22 * s, 0.18 * s), accent);
    boxMag.position.set(0, -0.2 * s, 0.05 * s);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.14 * s, 0.28 * s), dark);
    stock.position.z = -0.3 * s;
    g.add(barrel, receiver, bipod, boxMag, stock);
    tip.position.set(0, 0, 1.05 * s);
  } else {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.04 * s, 0.95 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.42 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.16 * s, 0.32 * s), dark);
    receiver.position.set(0, -0.02 * s, 0.05 * s);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.12 * s, 0.26 * s), dark);
    stock.position.set(0, -0.02 * s, -0.26 * s);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.18 * s, 0.1 * s), dark);
    grip.position.set(0, -0.14 * s, -0.02 * s);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.2 * s, 0.1 * s), accent);
    mag.position.set(0, -0.16 * s, 0.12 * s);
    g.add(barrel, receiver, stock, grip, mag);
    tip.position.set(0, 0, 0.95 * s);
  }

  g.add(tip);
  mount.add(g);
  return tip;
}
