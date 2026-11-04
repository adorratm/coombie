import { describe, expect, it } from 'vitest';
import { OPERATIVES, assertGenderBalance, ZOMBIES, waveKindForLevel, spawnBudgetForLevel } from '@protocol-z/shared';

describe('shared canon (via game-client)', () => {
  it('has 8 operatives with exactly 4 male and 4 female', () => {
    expect(OPERATIVES).toHaveLength(8);
    const ids = OPERATIVES.map((o) => o.id);
    expect(ids).toContain('warden');
    expect(ids).toContain('havoc');
    expect(ids).not.toContain('pyro');
    const males = OPERATIVES.filter((o) => o.gender === 'male');
    const females = OPERATIVES.filter((o) => o.gender === 'female');
    expect(males).toHaveLength(4);
    expect(females).toHaveLength(4);
    expect(() => assertGenderBalance()).not.toThrow();
  });

  it('lists playable zombie archetypes', () => {
    const ids = ZOMBIES.map((z) => z.id);
    expect(ids).toEqual(
      expect.arrayContaining(['grunt', 'runner', 'tank', 'acid', 'boss', 'screamer']),
    );
  });

  it('waveKindForLevel marks elite and horde intervals', () => {
    expect(waveKindForLevel(5)).toBe('elite_super');
    expect(waveKindForLevel(10)).toBe('horde');
    expect(waveKindForLevel(3)).toBe('normal');
    expect(spawnBudgetForLevel(10)).toBeGreaterThan(spawnBudgetForLevel(3));
  });
});
