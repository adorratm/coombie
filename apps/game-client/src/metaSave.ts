import type { ProgressState } from './progression';

/** Bump when schema changes; migrate() must handle older versions. */
export const META_SAVE_VERSION = 1;
export const META_SAVE_KEY = 'protocol-z-meta-v1';

export interface MetaSaveData {
  version: number;
  credits: number;
  totalKills: number;
  totalRuns: number;
  bestWave: number;
  bestKills: number;
  bestTimeSec: number;
  unlocked: string[];
  updatedAt: number;
}

export interface MetaUnlockDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  bonusMaxHp?: number;
  bonusRerolls?: number;
  bonusXpMult?: number;
  bonusArmor?: number;
  burnChance?: number;
}

export interface RunSummary {
  kills: number;
  wave: number;
  level: number;
  runTimeSec: number;
}

export interface RunCommitResult {
  creditsEarned: number;
  meta: MetaSaveData;
  isNewBestWave: boolean;
  isNewBestKills: boolean;
}

export const META_UNLOCKS: readonly MetaUnlockDef[] = [
  {
    id: 'vital_boot',
    name: 'Vital Boot',
    description: 'Başlangıç +15 max HP',
    cost: 40,
    bonusMaxHp: 15,
  },
  {
    id: 'scrap_pouch',
    name: 'Scrap Pouch',
    description: '+2 reroll hakkı',
    cost: 35,
    bonusRerolls: 2,
  },
  {
    id: 'field_manual',
    name: 'Field Manual',
    description: '+10% XP',
    cost: 50,
    bonusXpMult: 0.1,
  },
  {
    id: 'kevlar_liner',
    name: 'Kevlar Liner',
    description: '+12 zırh',
    cost: 45,
    bonusArmor: 12,
  },
  {
    id: 'incendiary_primer',
    name: 'Incendiary Primer',
    description: 'Başlangıç %8 yanma şansı',
    cost: 70,
    burnChance: 0.08,
  },
];

export function createDefaultMetaSave(): MetaSaveData {
  return {
    version: META_SAVE_VERSION,
    credits: 0,
    totalKills: 0,
    totalRuns: 0,
    bestWave: 0,
    bestKills: 0,
    bestTimeSec: 0,
    unlocked: [],
    updatedAt: Date.now(),
  };
}

/** Schema migration stub — extend when META_SAVE_VERSION increases. */
export function migrateMetaSave(raw: unknown): MetaSaveData {
  const base = createDefaultMetaSave();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const version = typeof o.version === 'number' ? o.version : 0;

  // v0 / missing → v1
  if (version <= META_SAVE_VERSION) {
    return {
      ...base,
      version: META_SAVE_VERSION,
      credits: num(o.credits, 0),
      totalKills: num(o.totalKills, 0),
      totalRuns: num(o.totalRuns, 0),
      bestWave: num(o.bestWave, 0),
      bestKills: num(o.bestKills, 0),
      bestTimeSec: num(o.bestTimeSec, 0),
      unlocked: Array.isArray(o.unlocked)
        ? o.unlocked.filter((id): id is string => typeof id === 'string')
        : [],
      updatedAt: num(o.updatedAt, Date.now()),
    };
  }

  // Future versions: strip unknown until we know how to read them
  return base;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function loadMetaSave(): MetaSaveData {
  try {
    const raw = localStorage.getItem(META_SAVE_KEY);
    if (!raw) return createDefaultMetaSave();
    return migrateMetaSave(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultMetaSave();
  }
}

export function writeMetaSave(data: MetaSaveData): void {
  const payload: MetaSaveData = {
    ...data,
    version: META_SAVE_VERSION,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(META_SAVE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[metaSave] write failed', err);
  }
}

export function creditsForRun(summary: RunSummary): number {
  return Math.max(
    5,
    Math.floor(summary.kills * 0.45 + summary.wave * 8 + summary.level * 3 + summary.runTimeSec * 0.05),
  );
}

export function commitRunResults(summary: RunSummary, meta = loadMetaSave()): RunCommitResult {
  const creditsEarned = creditsForRun(summary);
  const isNewBestWave = summary.wave > meta.bestWave;
  const isNewBestKills = summary.kills > meta.bestKills;
  const next: MetaSaveData = {
    ...meta,
    credits: meta.credits + creditsEarned,
    totalKills: meta.totalKills + summary.kills,
    totalRuns: meta.totalRuns + 1,
    bestWave: Math.max(meta.bestWave, summary.wave),
    bestKills: Math.max(meta.bestKills, summary.kills),
    bestTimeSec: Math.max(meta.bestTimeSec, summary.runTimeSec),
    version: META_SAVE_VERSION,
    updatedAt: Date.now(),
  };
  writeMetaSave(next);
  return { creditsEarned, meta: next, isNewBestWave, isNewBestKills };
}

export function purchaseMetaUnlock(unlockId: string, meta = loadMetaSave()): MetaSaveData | null {
  const def = META_UNLOCKS.find((u) => u.id === unlockId);
  if (!def) return null;
  if (meta.unlocked.includes(unlockId)) return null;
  if (meta.credits < def.cost) return null;
  const next: MetaSaveData = {
    ...meta,
    credits: meta.credits - def.cost,
    unlocked: [...meta.unlocked, unlockId],
  };
  writeMetaSave(next);
  return next;
}

export function metaUnlockById(id: string): MetaUnlockDef | undefined {
  return META_UNLOCKS.find((u) => u.id === id);
}

/** Apply permanent unlock bonuses at the start of a run. */
export function applyMetaRunBonuses(
  progress: ProgressState,
  player: { maxHp: number; hp: number; healthBar: { setRatio: (n: number) => void } },
  meta: MetaSaveData = loadMetaSave(),
): void {
  for (const id of meta.unlocked) {
    const def = metaUnlockById(id);
    if (!def) continue;
    if (def.bonusMaxHp) {
      player.maxHp += def.bonusMaxHp;
      player.hp = player.maxHp;
      player.healthBar.setRatio(1);
    }
    if (def.bonusRerolls) progress.rerolls += def.bonusRerolls;
    if (def.bonusXpMult) progress.mods.xpMult += def.bonusXpMult;
    if (def.bonusArmor) progress.mods.armorFlat += def.bonusArmor;
    if (def.burnChance) progress.mods.burnChance += def.burnChance;
  }
}
