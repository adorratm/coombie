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
}

export const COSTUMES: CostumeDef[] = [
  { id: 'standard', name: 'Standart', cost: 0, primary: null, secondary: null, strength: 0 },
  { id: 'urban_night', name: 'Gece Operasyonu', cost: 250, primary: 0x1b1e22, secondary: 0x3a3f46, strength: 0.85 },
  { id: 'desert', name: 'Çöl Kamuflaj', cost: 250, primary: 0xb8965f, secondary: 0x6e5838, strength: 0.75 },
  { id: 'woodland', name: 'Orman', cost: 250, primary: 0x4d5a32, secondary: 0x2b3020, strength: 0.75 },
  { id: 'arctic', name: 'Kutup', cost: 350, primary: 0xdfe6ea, secondary: 0x8b98a2, strength: 0.8 },
  { id: 'crimson', name: 'Kızıl Birlik', cost: 450, primary: 0x7a1414, secondary: 0x241010, strength: 0.8 },
  { id: 'neon_ops', name: 'Neon Ops', cost: 650, primary: 0x101418, secondary: 0x1e2a30, strength: 0.85, glow: 0x00ff87 },
  { id: 'gold_elite', name: 'Altın Elit', cost: 1200, primary: 0xc9a23a, secondary: 0x2a2418, strength: 0.7 },
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
  for (const h of OPERATIVE_ROSTER) owned.add(itemKey.weapon(weaponVariantId(WEAPONS[h.weaponIndex] ?? WEAPONS[0]!)));
  const heroes: Record<string, HeroLoadout> = {};
  for (const h of OPERATIVE_ROSTER) heroes[h.id] = defaultHero(h.id);
  return { version: 1, hero: 'ironclad', owned: [...owned], heroes, starterGranted: false };
}

function sanitize(p: Profile): Profile {
  const base = freshProfile();
  const out: Profile = { ...base, ...p, owned: [...new Set([...(base.owned ?? []), ...(p.owned ?? [])])] };
  for (const h of OPERATIVE_ROSTER) {
    const cur = { ...defaultHero(h.id), ...(p.heroes?.[h.id] ?? {}) };
    cur.abilities = { ...defaultHero(h.id).abilities, ...(cur.abilities ?? {}) };
    const cap = BASE_WEAPON_SLOTS + slotBonus(cur.backpack);
    cur.slots = (cur.slots ?? []).filter((v) => out.owned.includes(itemKey.weapon(v))).slice(0, cap);
    if (cur.slots.length === 0) cur.slots = defaultSlots(h.id);
    out.heroes[h.id] = cur;
  }
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
