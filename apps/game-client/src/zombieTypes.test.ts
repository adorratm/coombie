import { describe, expect, it } from 'vitest';
import { NET_ZOMBIE_KINDS } from './zombieKinds';
import { eliteChance, giantBossInterval, pickGiantBoss, rollSpawnType, specialChance, unlockedTypes, ZOMBIE_TYPES, zombieTypeIndex } from './zombieTypes';

describe('zombie types', () => {
  it('has 13 bosses, 14 elites and 20 specials with unique ids', () => {
    expect(ZOMBIE_TYPES).toHaveLength(47);
    expect(ZOMBIE_TYPES.filter((t) => t.tier === 'boss')).toHaveLength(13);
    expect(ZOMBIE_TYPES.filter((t) => t.tier === 'elite')).toHaveLength(14);
    expect(ZOMBIE_TYPES.filter((t) => t.tier === 'special')).toHaveLength(20);
    expect(new Set(ZOMBIE_TYPES.map((t) => t.id)).size).toBe(47);
  });

  it('builds on known base kinds and fits the co-op flag bits', () => {
    for (const t of ZOMBIE_TYPES) {
      expect(NET_ZOMBIE_KINDS).toContain(t.base);
      expect(Object.keys(t.traits).length).toBeGreaterThan(0);
    }
    expect(zombieTypeIndex(ZOMBIE_TYPES[ZOMBIE_TYPES.length - 1]!.id) + 1).toBeLessThan(64);
    expect(zombieTypeIndex(undefined)).toBe(-1);
  });

  it('bosses are giants, specials stay human sized', () => {
    for (const t of ZOMBIE_TYPES.filter((d) => d.tier === 'boss')) {
      expect(t.base).toBe('boss');
      expect(t.scaleMul).toBeGreaterThanOrEqual(1.35);
      expect(t.hpMul).toBeGreaterThanOrEqual(2.4);
    }
    for (const t of ZOMBIE_TYPES.filter((d) => d.tier === 'special')) expect(t.scaleMul).toBeLessThanOrEqual(1.1);
  });

  it('keeps the first minute plain and unlocks over time', () => {
    expect(specialChance(1)).toBe(0);
    expect(specialChance(2)).toBeGreaterThan(0);
    expect(eliteChance(3)).toBe(0);
    expect(rollSpawnType(1, () => 0)).toBeNull();
    expect(unlockedTypes('boss', 5)).toHaveLength(0);
    expect(unlockedTypes('boss', 60)).toHaveLength(13);
    expect(rollSpawnType(30, () => 0)?.tier).toBe('elite');
  });

  it('never repeats a giant boss back to back and comes more often late', () => {
    const a = pickGiantBoss(60, null, () => 0.5)!;
    for (let i = 0; i < 20; i++) expect(pickGiantBoss(60, a.id, () => i / 20)!.id).not.toBe(a.id);
    expect(pickGiantBoss(5, null)).toBeNull();
    expect(giantBossInterval(50)).toBeLessThan(giantBossInterval(10));
  });
});
