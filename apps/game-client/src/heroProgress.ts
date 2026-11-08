import type { OperativeId } from './roster';
import type { PlayerMods } from './progression';

/**
 * Persistent per-operative progression.
 *
 * Every operative has its own XP / level (cap 75) and its own skill tree. XP comes
 * from runs: the player's hero gets every point collected, squad mates get a share.
 * Each level gives one tree point; the tree holds exactly 74 ranks, so a Lv 75
 * operative can fill it completely. Nodes also need a minimum operative level.
 *
 * XP is written to storage while a run is still going (see `HeroXpLedger`), so
 * quitting, crashing or closing the window never loses collected XP.
 */

export const HERO_LEVEL_MAX = 75;
export const HERO_SAVE_KEY = 'protocol-z-heroes-v1';
/** Share of run XP that squad mates (not the player) receive. */
export const ALLY_XP_SHARE = 0.6;

export type TreeBranch = 'attack' | 'defense' | 'tactic';

/** Run-start effects a node can grant (per rank). */
export interface TreeEffect {
  mods?: Partial<PlayerMods>;
  /** extra shield points (in-run shield) */
  shield?: number;
  /** extra revives */
  revives?: number;
  /** heal on level-up (fraction of max hp) */
  levelHeal?: number;
  /** pickup radius (m) */
  pickup?: number;
  /** every slot weapon starts this many track levels up */
  weaponHeadStart?: number;
  /** +pierce on every bullet */
  pierce?: number;
  /** second weapon slot usable from the start */
  earlySlot?: boolean;
  /** run-skill damage multiplier (additive) */
  skillPower?: number;
  /** +levels on the hero's start skill */
  startSkill?: number;
  /** +1 active skill slot */
  skillSlot?: number;
  /** start with the hero's radio support (or a random extra skill) */
  startSupport?: boolean;
  /** +reroll / lockdown / banish */
  draftTools?: number;
  /** signature evolution never needs its passive */
  evoAny?: boolean;
}

export interface TreeNodeDef {
  id: string;
  branch: TreeBranch;
  name: string;
  icon: string;
  desc: string;
  maxRank: number;
  /** minimum operative level */
  reqLevel: number;
  /** another node that needs at least 1 rank first */
  requires?: string;
  effect: TreeEffect;
  /** "active" perks change how the run plays, "passive" are stat bonuses */
  type: 'passive' | 'active' | 'weapon';
}

const N = (d: TreeNodeDef) => d;
export const TREE_NODES: TreeNodeDef[] = [
  // ---------------------------------------------------------------- ATTACK (23)
  N({ id: 'a_dmg', branch: 'attack', type: 'passive', icon: '🎯', name: 'Keskin Nişan', desc: '+%3 hasar / sv', maxRank: 5, reqLevel: 1, effect: { mods: { damageMult: 0.03 } } }),
  N({ id: 'a_rate', branch: 'attack', type: 'passive', icon: '⚡', name: 'Tetik Parmağı', desc: '+%3 atış hızı / sv', maxRank: 5, reqLevel: 8, requires: 'a_dmg', effect: { mods: { fireRateMult: 0.03 } } }),
  N({ id: 'a_crit', branch: 'attack', type: 'passive', icon: '✴', name: 'Ölümcül Vuruş', desc: '+%2 kritik şansı / sv', maxRank: 5, reqLevel: 16, requires: 'a_rate', effect: { mods: { critChance: 0.02 } } }),
  N({ id: 'a_weapon', branch: 'attack', type: 'weapon', icon: '🔧', name: 'Silah Bakımı', desc: 'Açılan her silah +1 seviyeyle başlar / sv', maxRank: 2, reqLevel: 28, requires: 'a_crit', effect: { weaponHeadStart: 1 } }),
  N({ id: 'a_pierce', branch: 'attack', type: 'weapon', icon: '➶', name: 'Zırh Delici', desc: 'Tüm mermiler +1 zombiyi deler', maxRank: 1, reqLevel: 40, requires: 'a_weapon', effect: { pierce: 1 } }),
  N({ id: 'a_slot', branch: 'attack', type: 'weapon', icon: '🗃', name: 'Hızlı Cephanelik', desc: '2. silah slotu baştan açık', maxRank: 1, reqLevel: 52, requires: 'a_pierce', effect: { earlySlot: true } }),
  N({ id: 'a_skill', branch: 'attack', type: 'active', icon: '💥', name: 'Yıkım Uzmanı', desc: 'Yetenek hasarı +%5 / sv', maxRank: 3, reqLevel: 64, requires: 'a_slot', effect: { skillPower: 0.05 } }),
  N({ id: 'a_cap', branch: 'attack', type: 'passive', icon: '☠', name: 'Ölüm Makinesi', desc: '+%10 hasar, +%5 atış hızı', maxRank: 1, reqLevel: 75, requires: 'a_skill', effect: { mods: { damageMult: 0.1, fireRateMult: 0.05 } } }),
  // --------------------------------------------------------------- DEFENSE (26)
  N({ id: 'd_hp', branch: 'defense', type: 'passive', icon: '❤', name: 'Sağlam Bünye', desc: '+%4 can / sv', maxRank: 5, reqLevel: 1, effect: { mods: { maxHpMult: 0.04 } } }),
  N({ id: 'd_armor', branch: 'defense', type: 'passive', icon: '🛡', name: 'Zırh Plakası', desc: '+1 zırh / sv', maxRank: 5, reqLevel: 8, requires: 'd_hp', effect: { mods: { armorFlat: 1 } } }),
  N({ id: 'd_leech', branch: 'defense', type: 'passive', icon: '🩸', name: 'Kan Emici', desc: '+%1 can çalma / sv', maxRank: 3, reqLevel: 16, requires: 'd_armor', effect: { mods: { lifesteal: 0.01 } } }),
  N({ id: 'd_shield', branch: 'defense', type: 'active', icon: '◈', name: 'Kalkan Jeneratörü', desc: '+15 yenilenen kalkan / sv', maxRank: 3, reqLevel: 24, requires: 'd_leech', effect: { shield: 15 } }),
  N({ id: 'd_revive', branch: 'defense', type: 'active', icon: '✚', name: 'Son Nefes', desc: '+1 dirilme hakkı', maxRank: 1, reqLevel: 36, requires: 'd_shield', effect: { revives: 1 } }),
  N({ id: 'd_move', branch: 'defense', type: 'passive', icon: '👟', name: 'Hareketli Hedef', desc: '+%3 hareket hızı / sv', maxRank: 5, reqLevel: 44, requires: 'd_revive', effect: { mods: { moveSpeedMult: 0.03 } } }),
  N({ id: 'd_medic', branch: 'defense', type: 'active', icon: '💉', name: 'Saha Hekimi', desc: 'Seviye atlayınca +%10 ek can / sv', maxRank: 3, reqLevel: 56, requires: 'd_move', effect: { levelHeal: 0.1 } }),
  N({ id: 'd_cap', branch: 'defense', type: 'passive', icon: '⛨', name: 'Ölümsüz', desc: '+%15 can, +3 zırh', maxRank: 1, reqLevel: 75, requires: 'd_medic', effect: { mods: { maxHpMult: 0.15, armorFlat: 3 } } }),
  // ---------------------------------------------------------------- TACTIC (25)
  N({ id: 't_xp', branch: 'tactic', type: 'passive', icon: '📈', name: 'Hızlı Öğrenme', desc: '+%4 XP / sv', maxRank: 5, reqLevel: 1, effect: { mods: { xpMult: 0.04 } } }),
  N({ id: 't_magnet', branch: 'tactic', type: 'passive', icon: '🧲', name: 'Mıknatıs', desc: '+0.4 m toplama yarıçapı / sv', maxRank: 3, reqLevel: 8, requires: 't_xp', effect: { pickup: 0.4 } }),
  N({ id: 't_cdr', branch: 'tactic', type: 'passive', icon: '❆', name: 'Soğuk Kafa', desc: '−%3 Q/E/R bekleme / sv', maxRank: 5, reqLevel: 16, requires: 't_magnet', effect: { mods: { abilityCdr: 0.03 } } }),
  N({ id: 't_start', branch: 'tactic', type: 'active', icon: '★', name: 'İmza Yetenek', desc: 'Başlangıç yeteneği +1 seviye / sv', maxRank: 2, reqLevel: 24, requires: 't_cdr', effect: { startSkill: 1 } }),
  N({ id: 't_slot', branch: 'tactic', type: 'active', icon: '⊕', name: 'Ek Yetenek Yuvası', desc: '7. aktif yetenek yuvası', maxRank: 1, reqLevel: 34, requires: 't_start', effect: { skillSlot: 1 } }),
  N({ id: 't_radio', branch: 'tactic', type: 'active', icon: '📻', name: 'Telsiz Bağlantısı', desc: 'Koşuya telsiz desteği (ya da ek bir yetenek) ile başla', maxRank: 1, reqLevel: 44, requires: 't_slot', effect: { startSupport: true } }),
  N({ id: 't_aoe', branch: 'tactic', type: 'passive', icon: '◯', name: 'Patlama Alanı', desc: '+%5 etki alanı / sv', maxRank: 3, reqLevel: 54, requires: 't_radio', effect: { mods: { aoeRadiusMult: 0.05 } } }),
  N({ id: 't_draft', branch: 'tactic', type: 'active', icon: '🃏', name: 'Taktik Deha', desc: '+1 yenile / kilitle / ele / sv', maxRank: 3, reqLevel: 62, requires: 't_aoe', effect: { draftTools: 1 } }),
  N({ id: 't_evo', branch: 'tactic', type: 'active', icon: '🧬', name: 'Evrim Ustası', desc: 'İmza evrimi için pasif eşya gerekmez (her zaman 3 dal)', maxRank: 1, reqLevel: 70, requires: 't_draft', effect: { evoAny: true } }),
  N({ id: 't_cap', branch: 'tactic', type: 'passive', icon: '♛', name: 'Komutan', desc: '+%10 XP, yetenek hasarı +%10', maxRank: 1, reqLevel: 75, requires: 't_evo', effect: { mods: { xpMult: 0.1 }, skillPower: 0.1 } }),
];

export const TREE_TOTAL_RANKS = TREE_NODES.reduce((s, n) => s + n.maxRank, 0);

export interface HeroProgress {
  xp: number;
  level: number;
  ranks: Record<string, number>;
}

type Store = Partial<Record<OperativeId, HeroProgress>>;

/** XP from level L to L+1. Lv 1→75 ≈ 820k XP (≈ 7 full 20 min runs as the player). */
export function heroXpForLevel(level: number): number {
  return Math.round(300 + 90 * level + 4 * level * level);
}

const fresh = (): HeroProgress => ({ xp: 0, level: 1, ranks: {} });

function sanitize(raw: unknown): HeroProgress {
  const r = (raw ?? {}) as Partial<HeroProgress>;
  const level = Math.max(1, Math.min(HERO_LEVEL_MAX, Math.floor(Number(r.level) || 1)));
  const xp = Math.max(0, Number(r.xp) || 0);
  const ranks: Record<string, number> = {};
  for (const n of TREE_NODES) {
    const v = Math.floor(Number(r.ranks?.[n.id]) || 0);
    if (v > 0) ranks[n.id] = Math.min(n.maxRank, v);
  }
  return { xp, level, ranks };
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(HERO_SAVE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Store = {};
    for (const [k, v] of Object.entries(obj)) out[k as OperativeId] = sanitize(v);
    return out;
  } catch {
    return {};
  }
}

function writeStore(s: Store): void {
  try {
    localStorage.setItem(HERO_SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage full / blocked: keep playing */
  }
}

export function loadHeroProgress(id: OperativeId): HeroProgress {
  return readStore()[id] ?? fresh();
}

export function saveHeroProgress(id: OperativeId, p: HeroProgress): void {
  const s = readStore();
  s[id] = sanitize(p);
  writeStore(s);
}

/** Pure: add XP to a progress record. Returns levels gained. */
export function addXpTo(p: HeroProgress, amount: number): number {
  if (!(amount > 0) || p.level >= HERO_LEVEL_MAX) return 0;
  let gained = 0;
  p.xp += amount;
  while (p.level < HERO_LEVEL_MAX && p.xp >= heroXpForLevel(p.level)) {
    p.xp -= heroXpForLevel(p.level);
    p.level += 1;
    gained += 1;
  }
  if (p.level >= HERO_LEVEL_MAX) p.xp = 0;
  return gained;
}

export function addHeroXp(id: OperativeId, amount: number): number {
  const p = loadHeroProgress(id);
  const g = addXpTo(p, amount);
  saveHeroProgress(id, p);
  return g;
}

export function spentPoints(p: HeroProgress): number {
  let s = 0;
  for (const v of Object.values(p.ranks)) s += v;
  return s;
}

/** One point per level after 1 (Lv 75 = 74 points = the whole tree). */
export function availablePoints(p: HeroProgress): number {
  return Math.max(0, p.level - 1 - spentPoints(p));
}

export function nodeById(id: string): TreeNodeDef | undefined {
  return TREE_NODES.find((n) => n.id === id);
}

export type UnlockBlock = 'max' | 'level' | 'requires' | 'points' | null;

export function unlockBlock(p: HeroProgress, id: string): UnlockBlock {
  const n = nodeById(id);
  if (!n) return 'max';
  if ((p.ranks[id] ?? 0) >= n.maxRank) return 'max';
  if (p.level < n.reqLevel) return 'level';
  if (n.requires && (p.ranks[n.requires] ?? 0) < 1) return 'requires';
  if (availablePoints(p) < 1) return 'points';
  return null;
}

export function unlockTreeNode(heroId: OperativeId, id: string): boolean {
  const p = loadHeroProgress(heroId);
  if (unlockBlock(p, id) !== null) return false;
  p.ranks[id] = (p.ranks[id] ?? 0) + 1;
  saveHeroProgress(heroId, p);
  return true;
}

/** Refund every point (free respec). */
export function resetTree(heroId: OperativeId): void {
  const p = loadHeroProgress(heroId);
  p.ranks = {};
  saveHeroProgress(heroId, p);
}

/** Summed run-start effects of a hero's tree. */
export interface TreeTotals {
  mods: Partial<PlayerMods>;
  shield: number;
  revives: number;
  levelHeal: number;
  pickup: number;
  weaponHeadStart: number;
  pierce: number;
  earlySlot: boolean;
  skillPower: number;
  startSkill: number;
  skillSlot: number;
  startSupport: boolean;
  draftTools: number;
  evoAny: boolean;
}

export function treeTotals(p: HeroProgress): TreeTotals {
  const t: TreeTotals = {
    mods: {},
    shield: 0,
    revives: 0,
    levelHeal: 0,
    pickup: 0,
    weaponHeadStart: 0,
    pierce: 0,
    earlySlot: false,
    skillPower: 0,
    startSkill: 0,
    skillSlot: 0,
    startSupport: false,
    draftTools: 0,
    evoAny: false,
  };
  for (const n of TREE_NODES) {
    const r = p.ranks[n.id] ?? 0;
    if (r <= 0) continue;
    const e = n.effect;
    if (e.mods) {
      for (const [k, v] of Object.entries(e.mods) as [keyof PlayerMods, number][]) {
        t.mods[k] = (t.mods[k] ?? 0) + v * r;
      }
    }
    t.shield += (e.shield ?? 0) * r;
    t.revives += (e.revives ?? 0) * r;
    t.levelHeal += (e.levelHeal ?? 0) * r;
    t.pickup += (e.pickup ?? 0) * r;
    t.weaponHeadStart += (e.weaponHeadStart ?? 0) * r;
    t.pierce += (e.pierce ?? 0) * r;
    t.skillPower += (e.skillPower ?? 0) * r;
    t.startSkill += (e.startSkill ?? 0) * r;
    t.skillSlot += (e.skillSlot ?? 0) * r;
    t.draftTools += (e.draftTools ?? 0) * r;
    if (e.earlySlot) t.earlySlot = true;
    if (e.startSupport) t.startSupport = true;
    if (e.evoAny) t.evoAny = true;
  }
  return t;
}

/**
 * Buffers run XP per operative and flushes it to storage on a cadence, so nothing
 * collected is lost if the run ends abruptly. The player's hero gets 100 %,
 * squad mates `ALLY_XP_SHARE`.
 */
export class HeroXpLedger {
  private readonly pending = new Map<OperativeId, number>();
  /** XP banked per operative this run (for the results screen) */
  readonly earned = new Map<OperativeId, number>();
  readonly levelsGained = new Map<OperativeId, number>();
  private sinceFlush = 0;

  add(id: OperativeId, amount: number): void {
    if (!(amount > 0)) return;
    this.pending.set(id, (this.pending.get(id) ?? 0) + amount);
    this.earned.set(id, (this.earned.get(id) ?? 0) + amount);
  }

  /** Call every frame; writes at most every `interval` seconds. */
  tick(dt: number, interval = 5): void {
    this.sinceFlush += dt;
    if (this.sinceFlush >= interval) this.flush();
  }

  flush(): void {
    this.sinceFlush = 0;
    if (!this.pending.size) return;
    const s = readStore();
    for (const [id, amount] of this.pending) {
      const p = s[id] ?? fresh();
      const g = addXpTo(p, amount);
      if (g) this.levelsGained.set(id, (this.levelsGained.get(id) ?? 0) + g);
      s[id] = p;
    }
    this.pending.clear();
    writeStore(s);
  }
}
