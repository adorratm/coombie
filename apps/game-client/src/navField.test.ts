import { describe, expect, it } from 'vitest';
import { NavField } from './navField';
import { makeAabb } from './collision';

describe('zombie nav field', () => {
  // a long wall along x = 0 from z = -40 to z = 30, the only way round is the north end
  const wall = [makeAabb(0, -5, 0.5, 35)];

  it('routes around a wall to reach the hero on the other side', () => {
    const nav = new NavField(50, wall);
    nav.flood([{ x: 10, z: 0 }]);
    const out = { x: 0, z: 0 };
    // zombie west of the wall, level with the hero: must head north (+z) to the gap
    let x = -10;
    let z = 0;
    for (let i = 0; i < 200 && nav.distanceAt(x, z) > 1; i++) {
      expect(nav.steer(x, z, out)).toBe(true);
      x += out.x * 1;
      z += out.z * 1;
    }
    expect(Math.hypot(x - 10, z)).toBeLessThan(4);
    expect(nav.distanceAt(-10, 0)).toBeGreaterThan(20 / nav.cell);
  });

  it('a sealed pocket is unreachable', () => {
    const box = [makeAabb(0, 10, 10, 0.5), makeAabb(0, -10, 10, 0.5), makeAabb(10, 0, 0.5, 10), makeAabb(-10, 0, 0.5, 10)];
    const nav = new NavField(40, box);
    nav.flood([{ x: 30, z: 30 }]);
    expect(nav.distanceAt(0, 0)).toBe(Infinity);
    expect(Number.isFinite(nav.distanceAt(25, 25))).toBe(true);
  });
});
