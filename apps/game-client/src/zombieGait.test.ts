import { describe, expect, it } from 'vitest';
import { sampleZombieGait } from './zombieGait';

describe('sampleZombieGait', () => {
  it('produces opposing leg swings while moving', () => {
    const a = sampleZombieGait({ animPhase: Math.PI / 2, moving: true });
    expect(Math.sign(a.leftUpperLegX)).not.toBe(Math.sign(a.rightUpperLegX) || 0);
    expect(a.leftLowerLegX).toBeGreaterThan(0);
    expect(a.bobY).toBeGreaterThanOrEqual(0);
  });

  it('keeps VRM arms hung with forward Y (not pinned behind)', () => {
    const g = sampleZombieGait({ animPhase: 1.2, moving: true });
    expect(Math.abs(g.vrmLeftUpper[2])).toBeGreaterThan(1.15);
    expect(Math.abs(g.vrmRightUpper[2])).toBeGreaterThan(1.15);
    expect(g.vrmLeftUpper[1]).toBeGreaterThan(0.45);
    expect(g.vrmRightUpper[1]).toBeLessThan(-0.45);
    expect(Math.abs(g.vrmLeftUpper[0])).toBeLessThan(0.4);
  });

  it('keeps slam |Z| high while raising pitch', () => {
    const g = sampleZombieGait({
      animPhase: 1,
      moving: false,
      attackAnim: 0.3,
      skill: 'slam',
    });
    expect(g.vrmLeftUpper[0]).toBeGreaterThan(0.3);
    expect(Math.abs(g.vrmLeftUpper[2])).toBeGreaterThan(0.9);
  });
});
