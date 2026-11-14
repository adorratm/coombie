import { describe, expect, test } from 'vitest';
import { BOSS_VARIANTS, BOSS_VARIANT_IDS, pickBossVariant } from './bossVariants';

describe('pickBossVariant', () => {
  test('only the Mutant is available on the first waves', () => {
    for (const roll of [0, 0.5, 0.999]) expect(pickBossVariant(1, null, () => roll)).toBe('mutant');
  });

  test('never picks a variant before its unlock wave', () => {
    for (let wave = 1; wave <= 12; wave++) {
      for (let i = 0; i < 50; i++) {
        const picked = pickBossVariant(wave, null, () => i / 50);
        expect(BOSS_VARIANTS[picked].fromWave).toBeLessThanOrEqual(wave);
      }
    }
  });

  test('does not repeat the previous boss when another is unlocked', () => {
    for (const previous of BOSS_VARIANT_IDS) {
      for (let i = 0; i < 50; i++) expect(pickBossVariant(20, previous, () => i / 50)).not.toBe(previous);
    }
  });

  test('repeats the Mutant when it is the only one unlocked', () => {
    expect(pickBossVariant(2, 'mutant', () => 0.4)).toBe('mutant');
  });

  test('every variant can appear late in a run', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(pickBossVariant(20, null, () => i / 100));

    expect(seen.size).toBe(BOSS_VARIANT_IDS.length);
  });

  test('survives a random source that returns exactly 1', () => {
    expect(BOSS_VARIANT_IDS).toContain(pickBossVariant(20, null, () => 1));
  });
});
