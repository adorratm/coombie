import { describe, expect, it } from 'vitest';
import { autoHeliInterval, densestCrowd } from './runSkills';

const z = (x: number, zz: number, hp = 1) => ({ hp, root: { position: { x, z: zz } } });

describe('automatic gunship', () => {
  it('aims at the biggest crowd near the hero', () => {
    const list = [z(10, 0), z(10.5, 0.5), z(9.6, -0.4), z(10.2, 1), z(-8, 0), z(-8.5, 0), z(40, 40)];
    const c = densestCrowd(list, { x: 0, z: 0 }, 22, 3)!;
    expect(c.count).toBe(4);
    expect(c.at.x).toBeGreaterThan(9);
    expect(densestCrowd([z(1, 1, 0)], { x: 0, z: 0 }, 22, 3)).toBeNull();
  });

  it('comes more often with levels and evolution', () => {
    expect(autoHeliInterval(5, false)).toBeLessThan(autoHeliInterval(1, false));
    expect(autoHeliInterval(5, true)).toBeLessThan(autoHeliInterval(5, false));
  });
});
