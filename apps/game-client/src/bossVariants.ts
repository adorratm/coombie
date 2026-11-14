/**
 * Boss variants: the same big body, different fight. Kept as plain data so the
 * arena, combat code and tests share one table.
 */
export type BossVariant = 'mutant' | 'kasap' | 'kor' | 'kovan' | 'salter';

export interface BossVariantDef {
  id: BossVariant;
  name: string;
  /** shown on the arrival banner */
  intro: string;
  /** first wave this variant may appear on */
  fromWave: number;
  color: number;
  hpMul: number;
  speedMul: number;
  damageMul: number;
  scaleMul: number;
}

export const BOSS_VARIANTS: Record<BossVariant, BossVariantDef> = {
  mutant: { id: 'mutant', name: 'Mutant', intro: 'yeri titretiyor', fromWave: 1, color: 0xb91c1c, hpMul: 1, speedMul: 1, damageMul: 1, scaleMul: 1 },
  kasap: { id: 'kasap', name: 'Kasap', intro: 'koşarak geliyor — mesafeni koru', fromWave: 3, color: 0xff7a1a, hpMul: 0.7, speedMul: 1.35, damageMul: 1.25, scaleMul: 0.88 },
  kor: { id: 'kor', name: 'Kor', intro: 'bastığı yeri yakıyor', fromWave: 5, color: 0xff4d00, hpMul: 0.95, speedMul: 0.95, damageMul: 1, scaleMul: 1 },
  kovan: { id: 'kovan', name: 'Ana Kovan', intro: 'yavruluyor — önce onu indir', fromWave: 7, color: 0xb8a000, hpMul: 1.25, speedMul: 0.8, damageMul: 0.85, scaleMul: 1.12 },
  salter: { id: 'salter', name: 'Şalter', intro: 'şok dalgası yayıyor — halkadan çık', fromWave: 9, color: 0x5cc8ff, hpMul: 1.05, speedMul: 1, damageMul: 0.9, scaleMul: 1 },
};

export const BOSS_VARIANT_IDS = Object.keys(BOSS_VARIANTS) as BossVariant[];

/** Kovan: seconds between broods and how many crawlers each one drops. */
export const KOVAN_BROOD_SECONDS = 7;
export const KOVAN_BROOD_SIZE = 2;
export const KOVAN_DEATH_BROOD = 5;
/** Kor: seconds between fire patches left behind. */
export const KOR_TRAIL_SECONDS = 0.7;
/** Şalter: nova cadence, warning lead and radius. */
export const SALTER_NOVA_SECONDS = 6;
export const SALTER_NOVA_LEAD = 1.2;
export const SALTER_NOVA_RADIUS = 5.5;
export const SALTER_STUN_SECONDS = 0.8;

/**
 * Which boss shows up. Only variants unlocked by `wave` are eligible and the
 * previous one is skipped while there is a choice, so two bosses in a row differ.
 */
export function pickBossVariant(wave: number, previous: BossVariant | null, random: () => number = Math.random): BossVariant {
  const unlocked = BOSS_VARIANT_IDS.filter((id) => BOSS_VARIANTS[id].fromWave <= wave);
  const pool = unlocked.length > 1 ? unlocked.filter((id) => id !== previous) : unlocked;
  if (pool.length === 0) return 'mutant';
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}
