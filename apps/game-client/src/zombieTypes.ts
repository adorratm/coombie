import type { ZombieKind } from './zombieKinds';

/**
 * Thirty named zombie types layered on the base kinds: 10 giant bosses, 10 elites
 * (mid-size) and 10 specials (normal size, one trick each). A type picks a base kind
 * (mesh, attack set, AI), scales its stats and size, and adds traits that run in
 * zombieTraits.ts. Plain data so the arena, co-op replicas and tests share one table.
 *
 * New types unlock with run time (`fromMin`), so the opening stays as it was and
 * long runs keep getting new problems to solve.
 */

export type ZombieTier = 'boss' | 'elite' | 'special';

export interface ZombieTraits {
  /** fraction of incoming damage ignored */
  armor?: number;
  /** fraction of max hp healed per second after 2 s without being hit */
  regen?: number;
  /** spawns these on death */
  split?: { kind: ZombieKind; n: number };
  /** explodes on death: radius, damage = attackDamage × mul */
  blast?: { r: number; mul: number };
  /** seconds between short-range teleports toward the target */
  blink?: number;
  /** radius of a slowing frost aura */
  frostAura?: number;
  /** seconds between acid puddles left behind */
  toxicTrail?: number;
  /** seconds between fire patches left behind */
  fireTrail?: number;
  /** telegraphed shock nova: stun + damage (attackDamage × mul) */
  nova?: { every: number; r: number; mul: number };
  /** telegraphed ground slam: knock-back + damage */
  quake?: { every: number; r: number; mul: number };
  /** calls minions */
  summon?: { every: number; kind: ZombieKind; n: number };
  /** below this hp ratio: faster and harder hitting (once) */
  enrage?: number;
  /** untouchable windows */
  phase?: { every: number; dur: number };
  /** heals nearby zombies by pct of their max hp */
  healer?: { every: number; r: number; pct: number };
  /** frenzies nearby zombies */
  warcry?: { every: number; r: number };
  /** fan of acid globs at the nearest hero */
  volley?: { every: number; n: number; mul: number };
  /** telegraphed fire rocks around the heroes */
  meteor?: { every: number; n: number; mul: number; r: number };
  /** life-drain aura: attackDamage × dps per second, heals itself */
  drain?: { r: number; dps: number };
  /** yanks heroes toward itself */
  pull?: { every: number; r: number; dist: number };
}

export interface ZombieTypeDef {
  id: string;
  name: string;
  tier: ZombieTier;
  base: ZombieKind;
  /** run minute this type may first appear */
  fromMin: number;
  hpMul: number;
  speedMul: number;
  dmgMul: number;
  scaleMul: number;
  color: number;
  /** arrival banner (bosses, first sighting of a type) */
  intro: string;
  traits: ZombieTraits;
}

const T = (d: ZombieTypeDef) => d;

export const ZOMBIE_TYPES: readonly ZombieTypeDef[] = [
  // ───────── giant bosses ─────────
  T({ id: 'dev', name: 'Dev', tier: 'boss', base: 'boss', fromMin: 6, hpMul: 3, speedMul: 0.8, dmgMul: 1.4, scaleMul: 1.5, color: 0x8a6a4a, intro: 'adımları yeri yarıyor — halkadan çık', traits: { quake: { every: 7, r: 7, mul: 1.6 }, armor: 0.2 } }),
  T({ id: 'buz_devi', name: 'Buz Devi', tier: 'boss', base: 'boss', fromMin: 9, hpMul: 2.6, speedMul: 0.85, dmgMul: 1.2, scaleMul: 1.45, color: 0x9be7ff, intro: 'etrafı donduruyor — yakınında kalma', traits: { frostAura: 7, nova: { every: 6, r: 6, mul: 0.9 } } }),
  T({ id: 'curuk_kralice', name: 'Çürük Kraliçe', tier: 'boss', base: 'boss', fromMin: 12, hpMul: 2.4, speedMul: 0.9, dmgMul: 1, scaleMul: 1.4, color: 0x9cbf2a, intro: 'sürüsünü iyileştiriyor — önce onu indir', traits: { summon: { every: 6, kind: 'runner', n: 3 }, toxicTrail: 0.8, healer: { every: 4, r: 9, pct: 0.05 } } }),
  T({ id: 'cehennem', name: 'Cehennem Bekçisi', tier: 'boss', base: 'boss', fromMin: 15, hpMul: 2.8, speedMul: 0.95, dmgMul: 1.3, scaleMul: 1.5, color: 0xff5a1a, intro: 'gökten ateş yağdırıyor — işaretlerden kaç', traits: { meteor: { every: 6, n: 4, mul: 1.4, r: 2.8 }, fireTrail: 0.6 } }),
  T({ id: 'yildirim', name: 'Yıldırım Lordu', tier: 'boss', base: 'boss', fromMin: 18, hpMul: 2.5, speedMul: 1.05, dmgMul: 1.1, scaleMul: 1.4, color: 0x7cc8ff, intro: 'şimşek gibi ışınlanıyor', traits: { nova: { every: 4.5, r: 7, mul: 1 }, blink: 7 } }),
  T({ id: 'vampir', name: 'Vampir Lord', tier: 'boss', base: 'boss', fromMin: 21, hpMul: 2.6, speedMul: 1.15, dmgMul: 1.2, scaleMul: 1.35, color: 0xb01030, intro: 'can emiyor — mesafeni koru', traits: { drain: { r: 6, dps: 0.35 }, regen: 0.012, blink: 6 } }),
  T({ id: 'demir_golem', name: 'Demir Golem', tier: 'boss', base: 'boss', fromMin: 24, hpMul: 3.6, speedMul: 0.75, dmgMul: 1.5, scaleMul: 1.6, color: 0x7a828c, intro: 'zırhı mermiyi sektiriyor', traits: { armor: 0.5, enrage: 0.35, quake: { every: 9, r: 6, mul: 1.4 } } }),
  T({ id: 'veba', name: 'Veba Taşıyıcı', tier: 'boss', base: 'boss', fromMin: 28, hpMul: 2.7, speedMul: 0.9, dmgMul: 1.1, scaleMul: 1.45, color: 0x6a8a20, intro: 'zehir yağmuru — durma, hareket et', traits: { volley: { every: 3.5, n: 6, mul: 0.9 }, toxicTrail: 0.6, blast: { r: 6, mul: 2 } } }),
  T({ id: 'kemik_kral', name: 'Kemik Kral', tier: 'boss', base: 'boss', fromMin: 33, hpMul: 3, speedMul: 1, dmgMul: 1.3, scaleMul: 1.5, color: 0xe8e0c8, intro: 'ölüleri kaldırıyor — ölünce dağılıyor', traits: { summon: { every: 7, kind: 'grunt', n: 4 }, warcry: { every: 8, r: 12 }, split: { kind: 'tank', n: 3 } } }),
  T({ id: 'kiyamet', name: 'Kıyamet', tier: 'boss', base: 'boss', fromMin: 40, hpMul: 5, speedMul: 1, dmgMul: 1.6, scaleMul: 1.75, color: 0xff2a6a, intro: 'son gün geldi', traits: { meteor: { every: 7, n: 5, mul: 1.5, r: 3 }, quake: { every: 10, r: 8, mul: 1.8 }, summon: { every: 9, kind: 'runner', n: 4 }, enrage: 0.4, phase: { every: 14, dur: 2.5 } } }),

  // ───────── elites (mid-size) ─────────
  T({ id: 'zirhli_kasap', name: 'Zırhlı Kasap', tier: 'elite', base: 'tank', fromMin: 5, hpMul: 2.2, speedMul: 1, dmgMul: 1.2, scaleMul: 1.25, color: 0x8a96a8, intro: 'zırhlı — yoğun ateş gerek', traits: { armor: 0.4 } }),
  T({ id: 'gurz', name: 'Gürz', tier: 'elite', base: 'tank', fromMin: 7, hpMul: 2, speedMul: 0.95, dmgMul: 1.3, scaleMul: 1.3, color: 0xb07a3a, intro: 'yere vuruyor — halkadan çık', traits: { quake: { every: 6, r: 4.5, mul: 1.2 } } }),
  T({ id: 'yanik_dev', name: 'Yanık Dev', tier: 'elite', base: 'tank', fromMin: 9, hpMul: 1.9, speedMul: 1, dmgMul: 1.1, scaleMul: 1.3, color: 0xff7a2a, intro: 'ölünce patlıyor', traits: { fireTrail: 0.7, blast: { r: 4, mul: 2 } } }),
  T({ id: 'buzul', name: 'Buzul', tier: 'elite', base: 'tank', fromMin: 11, hpMul: 2, speedMul: 0.95, dmgMul: 1, scaleMul: 1.3, color: 0x9be7ff, intro: 'yakınındakini yavaşlatıyor', traits: { frostAura: 5 } }),
  T({ id: 'saman', name: 'Şaman', tier: 'elite', base: 'screamer', fromMin: 10, hpMul: 2.5, speedMul: 0.9, dmgMul: 1, scaleMul: 1.3, color: 0x7cffb2, intro: 'sürüyü iyileştiriyor', traits: { healer: { every: 3, r: 8, pct: 0.06 }, warcry: { every: 7, r: 10 } } }),
  T({ id: 'kalkanci', name: 'Kalkancı', tier: 'elite', base: 'riot', fromMin: 8, hpMul: 2.2, speedMul: 1, dmgMul: 1.2, scaleMul: 1.3, color: 0xd8c070, intro: 'zırhlı ve kendini onarıyor', traits: { armor: 0.3, regen: 0.015 } }),
  T({ id: 'carpici', name: 'Çarpıcı', tier: 'elite', base: 'volt', fromMin: 12, hpMul: 2.4, speedMul: 1, dmgMul: 1.2, scaleMul: 1.35, color: 0x5cc8ff, intro: 'şok dalgası — halkadan çık', traits: { nova: { every: 5, r: 5, mul: 0.9 } } }),
  T({ id: 'tukurgen', name: 'Tükürgen Dev', tier: 'elite', base: 'acid', fromMin: 13, hpMul: 2.6, speedMul: 0.9, dmgMul: 1.1, scaleMul: 1.4, color: 0xa3e635, intro: 'asit yaylımı', traits: { volley: { every: 3, n: 4, mul: 0.8 } } }),
  T({ id: 'kulucka', name: 'Kuluçka', tier: 'elite', base: 'hive', fromMin: 14, hpMul: 2.2, speedMul: 0.9, dmgMul: 1, scaleMul: 1.3, color: 0xd9b040, intro: 'durmadan yavruluyor', traits: { summon: { every: 5, kind: 'crawler', n: 3 } } }),
  T({ id: 'avci', name: 'Gölge Avcı', tier: 'elite', base: 'stalker', fromMin: 16, hpMul: 2.4, speedMul: 1.15, dmgMul: 1.4, scaleMul: 1.25, color: 0xc4b5fd, intro: 'ışınlanıp arkandan vuruyor', traits: { blink: 4, enrage: 0.5 } }),

  // ───────── specials (normal size, one trick) ─────────
  T({ id: 'canli_bomba', name: 'Canlı Bomba', tier: 'special', base: 'runner', fromMin: 3, hpMul: 1, speedMul: 1.1, dmgMul: 1, scaleMul: 1, color: 0xff6a2a, intro: 'ölünce patlıyor — uzaktan vur', traits: { blast: { r: 3.2, mul: 2.2 } } }),
  T({ id: 'bolunen', name: 'Bölünen', tier: 'special', base: 'grunt', fromMin: 4, hpMul: 1.6, speedMul: 1, dmgMul: 1, scaleMul: 1.05, color: 0xd04040, intro: 'ölünce ikiye bölünüyor', traits: { split: { kind: 'runner', n: 2 } } }),
  T({ id: 'yenilenen', name: 'Yenilenen', tier: 'special', base: 'grunt', fromMin: 4, hpMul: 1.4, speedMul: 1, dmgMul: 1, scaleMul: 1, color: 0x5ad46a, intro: 'yaraları kapanıyor — bitir onu', traits: { regen: 0.06 } }),
  T({ id: 'isinlanan', name: 'Işınlanan', tier: 'special', base: 'runner', fromMin: 5, hpMul: 1.2, speedMul: 1, dmgMul: 1, scaleMul: 1, color: 0xb070ff, intro: 'ışınlanıyor', traits: { blink: 3.5 } }),
  T({ id: 'zehirli', name: 'Zehirli', tier: 'special', base: 'crawler', fromMin: 5, hpMul: 1.5, speedMul: 1, dmgMul: 1, scaleMul: 1.05, color: 0x84cc16, intro: 'arkasında asit bırakıyor', traits: { toxicTrail: 1 } }),
  T({ id: 'kiragi', name: 'Kırağı', tier: 'special', base: 'grunt', fromMin: 6, hpMul: 1.4, speedMul: 1, dmgMul: 1, scaleMul: 1, color: 0xcfefff, intro: 'yanında donarsın', traits: { frostAura: 3 } }),
  T({ id: 'hayalet', name: 'Hayalet', tier: 'special', base: 'stalker', fromMin: 7, hpMul: 1.3, speedMul: 1, dmgMul: 1, scaleMul: 1, color: 0xe8e8ff, intro: 'arada bir mermiler içinden geçiyor', traits: { phase: { every: 5, dur: 1.6 } } }),
  T({ id: 'ofkeli', name: 'Öfkeli', tier: 'special', base: 'runner', fromMin: 6, hpMul: 1.5, speedMul: 1, dmgMul: 1, scaleMul: 1, color: 0xff3030, intro: 'yaralanınca çıldırıyor', traits: { enrage: 0.6 } }),
  T({ id: 'suluk', name: 'Sülük', tier: 'special', base: 'grunt', fromMin: 7, hpMul: 1.5, speedMul: 1, dmgMul: 1, scaleMul: 1, color: 0x9a1030, intro: 'yakınındakinin canını emiyor', traits: { drain: { r: 3, dps: 0.4 } } }),
  T({ id: 'miknatis', name: 'Mıknatıs', tier: 'special', base: 'grunt', fromMin: 8, hpMul: 1.8, speedMul: 1, dmgMul: 1, scaleMul: 1.05, color: 0x5a7aff, intro: 'seni kendine çekiyor', traits: { pull: { every: 5, r: 9, dist: 3 } } }),
];

export const ZOMBIE_TYPE_BY_ID: ReadonlyMap<string, ZombieTypeDef> = new Map(ZOMBIE_TYPES.map((t) => [t.id, t]));

/** Wire index for co-op snapshots (append-only). */
export const zombieTypeIndex = (id: string | undefined): number => (id ? ZOMBIE_TYPES.findIndex((t) => t.id === id) : -1);

/** XP multiplier per tier on top of the base kind's value. */
export const TIER_XP: Record<ZombieTier, number> = { boss: 10, elite: 3.5, special: 1.6 };

/** Chance a regular spawn becomes a special / elite at this run minute. */
export function specialChance(min: number): number {
  return Math.max(0, Math.min(0.3, (min - 2.5) * 0.025));
}
export function eliteChance(min: number): number {
  return Math.max(0, Math.min(0.09, (min - 4.5) * 0.008));
}

/** Seconds between giant bosses at this minute (more often as the run goes on). */
export function giantBossInterval(min: number): number {
  return Math.max(140, 300 - min * 3);
}

/** How many giants may be alive at once. */
export function giantBossCap(min: number): number {
  return min >= 40 ? 2 : 1;
}

export function unlockedTypes(tier: ZombieTier, min: number): ZombieTypeDef[] {
  return ZOMBIE_TYPES.filter((t) => t.tier === tier && t.fromMin <= min);
}

/** Roll a special/elite type for an ordinary spawn (null = plain zombie). */
export function rollSpawnType(min: number, random: () => number = Math.random): ZombieTypeDef | null {
  const r = random();
  const e = eliteChance(min);
  const tier: ZombieTier | null = r < e ? 'elite' : r < e + specialChance(min) ? 'special' : null;
  if (!tier) return null;
  const pool = unlockedTypes(tier, min);
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

/** Next giant boss: newest unlocks are favoured, never the same one twice in a row. */
export function pickGiantBoss(min: number, previous: string | null, random: () => number = Math.random): ZombieTypeDef | null {
  const unlocked = unlockedTypes('boss', min);
  const pool = unlocked.length > 1 ? unlocked.filter((t) => t.id !== previous) : unlocked;
  if (!pool.length) return null;
  // weight: later (harder) bosses a little more likely once unlocked
  const weights = pool.map((t) => 1 + t.fromMin / 20);
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}
