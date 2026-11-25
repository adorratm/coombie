import { WEAPON_SKINS, type SkinId } from './weaponSkins';
import { loadMetaSave, writeMetaSave } from './metaSave';
import { OPERATIVE_ROSTER, type OperativeId } from './roster';
import { WEAPONS, weaponVariantId, weaponByVariant } from './weapons';
import { loadHeroProgress } from './heroProgress';
import { ATTACHMENTS, ATTACHMENT_MAX, attachmentCost, attachmentsFor, emptyGear, POWER_MAX, powerCost, type AttachmentId, type WeaponGear } from './attachments';
import type { MissionSelection } from './gameModes';

/**
 * Player profile for the pre-run lobby: selected hero, owned cosmetics / weapons /
 * backpacks, per-hero loadout (costume, accessories, weapon slots, backpack) and
 * permanent Q/E/R ability levels. Credits stay in metaSave (earned per run).
 */

export type AbilitySlot = 'q' | 'e' | 'r';
export const ABILITY_SLOTS: AbilitySlot[] = ['q', 'e', 'r'];
export const ABILITY_MAX_LEVEL = 5;
export const BASE_WEAPON_SLOTS = 5;

export interface CostumeDef {
  id: string;
  name: string;
  cost: number;
  /** clothing recolour: null = original textures */
  primary: number | null;
  secondary: number | null;
  /** 0..1 how strongly cloth texels are pulled to the palette */
  strength: number;
  glow?: number;
  /** camo pattern (default solid two-tone) */
  pattern?: 'solid' | 'woodland' | 'desert' | 'digital' | 'tiger' | 'arctic' | 'urban';
  /** third and darkest pattern colours */
  accent?: number;
  dark?: number;
}

export const COSTUMES: CostumeDef[] = [
  { id: 'standard', name: 'Standart', cost: 0, primary: null, secondary: null, strength: 0 },
  { id: 'urban_night', name: 'Gece Operasyonu', cost: 250, primary: 0x2a2e33, secondary: 0x1a1d21, accent: 0x40464e, dark: 0x0e1012, strength: 0.92, pattern: 'urban' },
  { id: 'desert', name: 'Çöl Kamuflaj', cost: 250, primary: 0xc2a16a, secondary: 0x8f7046, accent: 0xd8c08e, dark: 0x5a4328, strength: 0.92, pattern: 'desert' },
  { id: 'woodland', name: 'Orman', cost: 250, primary: 0x55603a, secondary: 0x2f3a22, accent: 0x6e5a3a, dark: 0x16180f, strength: 0.92, pattern: 'woodland' },
  { id: 'digital', name: 'Dijital Kamuflaj', cost: 300, primary: 0x6b7356, secondary: 0x4a5139, accent: 0x8c8a6a, dark: 0x262a1c, strength: 0.92, pattern: 'digital' },
  { id: 'arctic', name: 'Kutup', cost: 350, primary: 0xe4eaee, secondary: 0xb5c0c8, accent: 0x8b98a2, dark: 0x4f5a62, strength: 0.9, pattern: 'arctic' },
  { id: 'tiger', name: 'Kaplan Çizgisi', cost: 400, primary: 0x6a7a44, secondary: 0x8b8a52, accent: 0x6a7a44, dark: 0x1a1c10, strength: 0.92, pattern: 'tiger' },
  { id: 'crimson', name: 'Kızıl Birlik', cost: 450, primary: 0x7a1414, secondary: 0x3a0e0e, accent: 0x9a2a1a, dark: 0x160808, strength: 0.9, pattern: 'woodland' },
  { id: 'neon_ops', name: 'Neon Ops', cost: 650, primary: 0x101418, secondary: 0x1e2a30, strength: 0.9, glow: 0x00ff87 },
  { id: 'gold_elite', name: 'Altın Elit', cost: 1200, primary: 0xc9a23a, secondary: 0x2a2418, strength: 0.85 },
  { id: 'navy_digital', name: 'Deniz Dijital', cost: 450, primary: 0x2e3e5a, secondary: 0x1c2638, accent: 0x4a5e80, dark: 0x0e1420, strength: 0.92, pattern: 'digital' },
  { id: 'jandarma', name: 'Jandarma', cost: 450, primary: 0x4a5a62, secondary: 0x2e383e, accent: 0x6a7a80, dark: 0x161c20, strength: 0.92, pattern: 'urban' },
  { id: 'sand_tiger', name: 'Kum Kaplanı', cost: 500, primary: 0xb89a62, secondary: 0x6a5434, accent: 0xb89a62, dark: 0x2a2014, strength: 0.92, pattern: 'tiger' },
  { id: 'toxic_ops', name: 'Zehirli Birlik', cost: 750, primary: 0x1a2014, secondary: 0x2a3a1a, strength: 0.9, glow: 0x9cff2e },
  { id: 'blood_moon', name: 'Kanlı Ay', cost: 850, primary: 0x1a0c0c, secondary: 0x3a1010, strength: 0.9, glow: 0xff2a3a },
  { id: 'shadow', name: 'Gölge', cost: 950, primary: 0x0c0c10, secondary: 0x1a1824, strength: 0.94, glow: 0xb26bff },
  { id: 'frost_ops', name: 'Buz Birliği', cost: 950, primary: 0xd8e4ec, secondary: 0x8aa0b0, accent: 0xb8c8d4, dark: 0x3a4a56, strength: 0.9, pattern: 'arctic', glow: 0x6ad8ff },
];

export type AccessoryId = 'belt' | 'holster' | 'chest_rig' | 'kneepads' | 'headlamp' | 'helmet_mil' | 'helmet_swat' | 'helmet_fire' | 'vest_swat';
export type AccessorySlot = 'head' | 'torso' | 'waist' | 'leg' | 'knee';
export interface AccessoryDef {
  id: AccessoryId;
  name: string;
  cost: number;
  desc: string;
  /** one accessory per slot */
  slot: AccessorySlot;
}
export const ACCESSORIES: AccessoryDef[] = [
  { id: 'helmet_mil', name: 'Askeri Kask', cost: 300, desc: 'ACU kamuflajlı balistik kask.', slot: 'head' },
  { id: 'helmet_swat', name: 'SWAT Kaskı', cost: 380, desc: 'Siyah taktik kask.', slot: 'head' },
  { id: 'helmet_fire', name: 'İtfaiye Kaskı', cost: 260, desc: 'Isıya dayanıklı itfaiyeci kaskı.', slot: 'head' },
  { id: 'headlamp', name: 'Kafa Lambası', cost: 200, desc: 'Parlayan kafa lambası.', slot: 'head' },
  { id: 'chest_rig', name: 'Askeri Teçhizat', cost: 350, desc: 'ACU bel cepleri ve teçhizat kemeri.', slot: 'torso' },
  { id: 'vest_swat', name: 'SWAT Teçhizatı', cost: 450, desc: 'Görev kemeri ve bacak kılıfı.', slot: 'torso' },
  { id: 'belt', name: 'Taktik Kemer', cost: 150, desc: 'Cepli bel kemeri.', slot: 'waist' },
  { id: 'holster', name: 'Bacak Kılıfı', cost: 150, desc: 'Sağ uyluğa tabanca kılıfı.', slot: 'leg' },
  { id: 'kneepads', name: 'Dizlik', cost: 120, desc: 'Çift dizlik.', slot: 'knee' },
];

export interface BackpackDef {
  tier: 1 | 2 | 3;
  name: string;
  cost: number;
  slots: number;
}
export const BACKPACKS: BackpackDef[] = [
  { tier: 1, name: 'Hafif Çanta', cost: 400, slots: 1 },
  { tier: 2, name: 'Saldırı Çantası', cost: 900, slots: 2 },
  { tier: 3, name: 'Sefer Çantası', cost: 1600, slots: 3 },
];

export interface HeroLoadout {
  costume: string;
  accessories: AccessoryId[];
  /** weapon variant ids, length = 5 + backpack slots */
  slots: string[];
  backpack: 0 | 1 | 2 | 3;
  abilities: Record<AbilitySlot, number>;
}

export interface Profile {
  version: 1;
  hero: OperativeId;
  owned: string[];
  heroes: Record<string, HeroLoadout>;
  starterGranted: boolean;
  /** signature-weapon revision this save has been migrated to */
  signatures?: number;
  /** last chosen map / mode / difficulty */
  mission?: MissionSelection;
  /** armory gear per weapon variant: power level + attachments */
  gear?: Record<string, WeaponGear>;
  /** weapon finish per variant (cosmetic) */
  skins?: Record<string, string>;
}

const KEY = 'protocol-z-profile-v1';
const STARTER_CREDITS = 800;

export const itemKey = {
  weapon: (variant: string) => `w:${variant}`,
  costume: (id: string) => `c:${id}`,
  accessory: (id: AccessoryId) => `a:${id}`,
  backpack: (tier: number) => `bp:${tier}`,
  skin: (id: string) => `s:${id}`,
};

/** Bumped when operatives get new signature weapons, so old saves pick them up once. */
const SIGNATURE_REV = 1;

/**
 * Heavy machine guns (minigun, drum launcher, the AK-LMG) are the gunner's trade.
 * Nobody else can carry them, and the gunner starts with the lightest one: the
 * rest open with operator level.
 */
export const HEAVY_CLASS = 'gunner';
export const HEAVY_UNLOCK_LEVEL: Record<string, number> = { lmg: 1, kara_tufek: 1, cehennem_m60: 25, thumper_gl: 20, shredder: 40 };
export const isHeavyWeapon = (variant: string): boolean => weaponByVariant(variant).id === 'lmg';
export const isMeleeWeapon = (variant: string): boolean => weaponByVariant(variant).grip === 'melee';
export const isPistolWeapon = (variant: string): boolean => weaponByVariant(variant).grip === 'pistol';

/** Why `heroId` cannot carry `variant` (null = allowed). */
export function equipBlock(heroId: string, variant: string): string | null {
  const w = weaponByVariant(variant);
  if (w.hero && w.hero !== heroId) return 'Başka bir operatörün özel silahı';
  if (isHeavyWeapon(variant)) {
    const hero = OPERATIVE_ROSTER.find((h) => h.id === heroId);
    if (hero?.classId !== HEAVY_CLASS) return 'Ağır silahları sadece Gunner sınıfı taşıyabilir';
    const need = HEAVY_UNLOCK_LEVEL[weaponVariantId(w)] ?? 30;
    if (loadHeroProgress(heroId as OperativeId).level < need) return `Operatör Sv ${need} gerekir`;
  }
  return null;
}

/** Signature weapons belong to one operative; heavy guns to the gunner (by level). */
export function canEquip(heroId: string, variant: string): boolean {
  return equipBlock(heroId, variant) === null;
}

/** Every loadout carries at least one melee weapon and one pistol. */
export function missingRequired(slots: readonly string[]): string | null {
  if (!slots.some((v) => isMeleeWeapon(v))) return 'En az bir yakın dövüş silahı takılı olmalı';
  if (!slots.some((v) => isPistolWeapon(v))) return 'En az bir tabanca takılı olmalı';
  return null;
}

/** Puts the default knife / pistol back if a loadout lost them (old saves). */
export function withRequired(slots: string[], cap: number): string[] {
  const out = [...slots];
  const need: string[] = [];
  if (!out.some((v) => isMeleeWeapon(v))) need.push('knife');
  if (!out.some((v) => isPistolWeapon(v))) need.push('pistol');
  for (const v of need) {
    if (out.length < cap) out.push(v);
    else {
      // replace the last slot that is not itself a required kind
      for (let i = out.length - 1; i >= 0; i--) {
        const cur = out[i]!;
        if ((isMeleeWeapon(cur) && out.filter(isMeleeWeapon).length === 1) || (isPistolWeapon(cur) && out.filter(isPistolWeapon).length === 1) || i === 0) continue;
        out[i] = v;
        break;
      }
    }
  }
  return out;
}

/** Signature weapon per hero (free) + sensible defaults. */
function defaultSlots(heroId: OperativeId): string[] {
  const hero = OPERATIVE_ROSTER.find((h) => h.id === heroId) ?? OPERATIVE_ROSTER[0]!;
  const sig = weaponVariantId(WEAPONS[hero.weaponIndex] ?? WEAPONS[0]!);
  const order = [sig, 'pistol', 'knife', 'rifle', 'smg', 'shotgun'];
  return [...new Set(order)].slice(0, BASE_WEAPON_SLOTS);
}

function defaultHero(heroId: OperativeId): HeroLoadout {
  return {
    costume: 'standard',
    accessories: [],
    slots: defaultSlots(heroId),
    backpack: 0,
    abilities: { q: 1, e: 1, r: 1 },
  };
}

function freshProfile(): Profile {
  const owned = new Set<string>([itemKey.costume('standard')]);
  for (const w of WEAPONS) if ((w.cost ?? 0) === 0) owned.add(itemKey.weapon(weaponVariantId(w)));
  // signature weapons are owned by everyone but only their operative can equip them (see canEquip)
  for (const h of OPERATIVE_ROSTER) owned.add(itemKey.weapon(weaponVariantId(WEAPONS[h.weaponIndex] ?? WEAPONS[0]!)));
  const heroes: Record<string, HeroLoadout> = {};
  for (const h of OPERATIVE_ROSTER) heroes[h.id] = defaultHero(h.id);
  return { version: 1, hero: 'ironclad', owned: [...owned], heroes, starterGranted: false, signatures: SIGNATURE_REV };
}

export function sanitize(p: Profile): Profile {
  const base = freshProfile();
  const out: Profile = { ...base, ...p, owned: [...new Set([...(base.owned ?? []), ...(p.owned ?? [])])] };
  for (const h of OPERATIVE_ROSTER) {
    const cur = { ...defaultHero(h.id), ...(p.heroes?.[h.id] ?? {}) };
    cur.abilities = { ...defaultHero(h.id).abilities, ...(cur.abilities ?? {}) };
    const cap = BASE_WEAPON_SLOTS + slotBonus(cur.backpack);
    cur.slots = (cur.slots ?? []).filter((v) => out.owned.includes(itemKey.weapon(v)) && canEquip(h.id, v)).slice(0, cap);
    // one-time: older saves get the operative's new signature weapon in slot 1
    const sig = weaponVariantId(WEAPONS[h.weaponIndex] ?? WEAPONS[0]!);
    if ((p.signatures ?? 0) < SIGNATURE_REV && !cur.slots.includes(sig)) cur.slots = [sig, ...cur.slots.slice(1)];
    if (cur.slots.length === 0) cur.slots = defaultSlots(h.id);
    cur.slots = withRequired(cur.slots, cap);
    out.heroes[h.id] = cur;
  }
  out.signatures = SIGNATURE_REV;
  if (!OPERATIVE_ROSTER.some((h) => h.id === out.hero)) out.hero = 'ironclad';
  return out;
}

let cached: Profile | null = null;

export function loadProfile(): Profile {
  if (cached) return cached;
  let p: Profile = freshProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) p = sanitize(JSON.parse(raw) as Profile);
  } catch {
    /* private mode / corrupt → fresh */
  }
  if (!p.starterGranted) {
    const meta = loadMetaSave();
    meta.credits += STARTER_CREDITS;
    writeMetaSave(meta);
    p.starterGranted = true;
  }
  cached = p;
  saveProfile(p);
  return p;
}

export function saveProfile(p: Profile): void {
  cached = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function credits(): number {
  return loadMetaSave().credits;
}

export function owns(key: string): boolean {
  return loadProfile().owned.includes(key);
}

/** Spend credits and add `key` to owned. Returns false when unaffordable / owned. */
export function purchase(key: string, cost: number): boolean {
  const p = loadProfile();
  if (p.owned.includes(key)) return false;
  const meta = loadMetaSave();
  if (meta.credits < cost) return false;
  meta.credits -= cost;
  writeMetaSave(meta);
  p.owned.push(key);
  saveProfile(p);
  return true;
}

export function heroLoadout(heroId: OperativeId = loadProfile().hero): HeroLoadout {
  return loadProfile().heroes[heroId] ?? defaultHero(heroId);
}

export function slotBonus(tier: number): number {
  return BACKPACKS.find((b) => b.tier === tier)?.slots ?? 0;
}

export function slotCapacity(heroId: OperativeId = loadProfile().hero): number {
  return BASE_WEAPON_SLOTS + slotBonus(heroLoadout(heroId).backpack);
}

export function updateHero(heroId: OperativeId, fn: (h: HeroLoadout) => void): void {
  const p = loadProfile();
  const h = p.heroes[heroId] ?? defaultHero(heroId);
  fn(h);
  const cap = BASE_WEAPON_SLOTS + slotBonus(h.backpack);
  h.slots = withRequired(h.slots.filter((v) => canEquip(heroId, v)).slice(0, cap), cap);
  p.heroes[heroId] = h;
  saveProfile(p);
}

export function selectHero(heroId: OperativeId): void {
  const p = loadProfile();
  p.hero = heroId;
  saveProfile(p);
}

export function abilityUpgradeCost(level: number): number {
  return level >= ABILITY_MAX_LEVEL ? Infinity : 250 * level;
}

export function upgradeAbility(heroId: OperativeId, slot: AbilitySlot): boolean {
  const h = heroLoadout(heroId);
  const lvl = h.abilities[slot];
  const cost = abilityUpgradeCost(lvl);
  const meta = loadMetaSave();
  if (!Number.isFinite(cost) || meta.credits < cost) return false;
  meta.credits -= cost;
  writeMetaSave(meta);
  updateHero(heroId, (x) => {
    x.abilities[slot] = Math.min(ABILITY_MAX_LEVEL, lvl + 1);
  });
  return true;
}

/** Everything the arena needs to start a run. */
export interface RunLoadout {
  heroId: OperativeId;
  costume: CostumeDef;
  accessories: AccessoryId[];
  backpack: 0 | 1 | 2 | 3;
  weaponSlots: string[];
  abilityLevels: Record<AbilitySlot, number>;
  mission?: MissionSelection;
}

export function setMission(m: MissionSelection): void {
  const p = loadProfile();
  p.mission = m;
  saveProfile(p);
}

export function currentMission(): MissionSelection {
  return loadProfile().mission ?? { map: 'city', mode: 'survival', difficulty: 'normal' };
}

export function currentRunLoadout(): RunLoadout {
  const p = loadProfile();
  const h = heroLoadout(p.hero);
  return {
    heroId: p.hero,
    costume: COSTUMES.find((c) => c.id === h.costume) ?? COSTUMES[0]!,
    accessories: [...h.accessories],
    backpack: h.backpack,
    weaponSlots: withRequired(h.slots.filter((v) => weaponByVariant(v) && canEquip(p.hero, v)), BASE_WEAPON_SLOTS + slotBonus(h.backpack)),
    abilityLevels: { ...h.abilities },
    mission: p.mission ?? { map: 'city', mode: 'survival', difficulty: 'normal' },
  };
}

// ---------------------------------------------------------------------------
// Armory gear (weapon power + attachments)
// ---------------------------------------------------------------------------

/** Weapon finish picked for a variant ('standart' when none / not owned). */
export function weaponSkin(variant: string): SkinId {
  const p = loadProfile();
  const id = p.skins?.[variant];
  return id && id in WEAPON_SKINS && (id === 'standart' || p.owned.includes(itemKey.skin(id))) ? (id as SkinId) : 'standart';
}

/** Buy a finish (once, usable on every weapon). */
export function buySkin(id: SkinId): boolean {
  if (id === 'standart') return true;
  return purchase(itemKey.skin(id), WEAPON_SKINS[id].cost);
}

export function setWeaponSkin(variant: string, id: SkinId): boolean {
  const p = loadProfile();
  if (id !== 'standart' && !p.owned.includes(itemKey.skin(id))) return false;
  p.skins = { ...(p.skins ?? {}), [variant]: id };
  saveProfile(p);
  return true;
}

export function weaponGear(variant: string): WeaponGear {
  const g = loadProfile().gear?.[variant];
  return g ? { power: g.power ?? 0, levels: { ...(g.levels ?? {}) }, on: { ...(g.on ?? {}) } } : emptyGear();
}

function saveGear(variant: string, g: WeaponGear): void {
  const p = loadProfile();
  p.gear = { ...(p.gear ?? {}), [variant]: g };
  saveProfile(p);
}

function spend(cost: number): boolean {
  const meta = loadMetaSave();
  if (!Number.isFinite(cost) || meta.credits < cost) return false;
  meta.credits -= cost;
  writeMetaSave(meta);
  return true;
}

/** Raise a weapon's base power one level (credits). */
export function upgradeWeaponPower(variant: string): boolean {
  if (!owns(itemKey.weapon(variant))) return false;
  const w = weaponByVariant(variant);
  const g = weaponGear(variant);
  if (g.power >= POWER_MAX || !spend(powerCost(w, g.power))) return false;
  g.power += 1;
  saveGear(variant, g);
  return true;
}

/** Buy (level 1) or level up an attachment; it is equipped in its slot. */
export function upgradeAttachment(variant: string, id: AttachmentId): boolean {
  if (!owns(itemKey.weapon(variant))) return false;
  const w = weaponByVariant(variant);
  if (!attachmentsFor(w).includes(id)) return false;
  const g = weaponGear(variant);
  const lv = g.levels[id] ?? 0;
  if (lv >= ATTACHMENT_MAX || !spend(attachmentCost(w, id, lv))) return false;
  g.levels[id] = lv + 1;
  g.on[ATTACHMENTS[id].slot] = id;
  saveGear(variant, g);
  return true;
}

/** Swap to an owned attachment (or take it off). Free. */
export function toggleAttachment(variant: string, id: AttachmentId): void {
  const g = weaponGear(variant);
  if (!(g.levels[id] ?? 0)) return;
  const slot = ATTACHMENTS[id].slot;
  if (g.on[slot] === id) delete g.on[slot];
  else g.on[slot] = id;
  saveGear(variant, g);
}
