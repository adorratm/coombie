import { loadMetaSave, writeMetaSave } from './metaSave';
import { OPERATIVE_ROSTER, type OperativeId } from './roster';
import { WEAPONS, weaponVariantId, weaponByVariant } from './weapons';
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
}

const KEY = 'protocol-z-profile-v1';
const STARTER_CREDITS = 800;

export const itemKey = {
  weapon: (variant: string) => `w:${variant}`,
  costume: (id: string) => `c:${id}`,
  accessory: (id: AccessoryId) => `a:${id}`,
  backpack: (tier: number) => `bp:${tier}`,
};

/** Bumped when operatives get new signature weapons, so old saves pick them up once. */
const SIGNATURE_REV = 1;

/** Signature weapons belong to one operative; everything else is free for all. */
export function canEquip(heroId: string, variant: string): boolean {
  const owner = weaponByVariant(variant).hero;
  return !owner || owner === heroId;
}

/** Signature weapon per hero (free) + sensible defaults. */
function defaultSlots(heroId: OperativeId): string[] {
  const hero = OPERATIVE_ROSTER.find((h) => h.id === heroId) ?? OPERATIVE_ROSTER[0]!;
  const sig = weaponVariantId(WEAPONS[hero.weaponIndex] ?? WEAPONS[0]!);
  const order = [sig, 'rifle', 'smg', 'shotgun', 'pistol', 'knife'];
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
  h.slots = h.slots.slice(0, cap);
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
    weaponSlots: h.slots.filter((v) => weaponByVariant(v)),
    abilityLevels: { ...h.abilities },
    mission: p.mission ?? { map: 'city', mode: 'survival', difficulty: 'normal' },
  };
}
