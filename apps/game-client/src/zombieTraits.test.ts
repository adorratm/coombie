import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ZombieVisual } from './characters';
import { traitDamageMul } from './zombieTraits';

/** just enough of a zombie for the damage maths */
const zombie = (ztype?: string, extra: Record<string, unknown> = {}): ZombieVisual => {
  const root = new THREE.Group();
  if (ztype) root.userData.ztype = ztype;
  Object.assign(root.userData, extra);
  return { root, kind: 'tank' } as unknown as ZombieVisual;
};

describe('trait damage multiplier, split for co-op', () => {
  it('a plain zombie takes full damage', () => {
    expect(traitDamageMul(zombie(), 10)).toBe(1);
    expect(traitDamageMul(zombie(), 10, undefined, 'static')).toBe(1);
    expect(traitDamageMul(zombie(), 10, undefined, 'dynamic')).toBe(1);
  });

  it("armour is the guest's part: the host does not take it off a second time", () => {
    const z = zombie('zirhli_kasap'); // armor 0.4
    expect(traitDamageMul(z, 10)).toBeCloseTo(0.6);
    expect(traitDamageMul(z, 10, undefined, 'static')).toBeCloseTo(0.6);
    expect(traitDamageMul(z, 10, undefined, 'dynamic')).toBe(1);
  });

  it('an aegis aura is something only the host knows', () => {
    const z = zombie(undefined, { aegisUntil: 20, aegisArmor: 0.5 });
    expect(traitDamageMul(z, 10)).toBeCloseTo(0.5);
    expect(traitDamageMul(z, 10, undefined, 'static')).toBe(1);
    expect(traitDamageMul(z, 10, undefined, 'dynamic')).toBeCloseTo(0.5);
    expect(traitDamageMul(z, 30, undefined, 'dynamic')).toBe(1); // aura ran out
  });

  it('a phased zombie cannot be hurt, whoever decided the hit', () => {
    const z = zombie('zirhli_kasap', { trs: { phaseUntil: 20 } });
    expect(traitDamageMul(z, 10)).toBe(0);
    expect(traitDamageMul(z, 10, undefined, 'dynamic')).toBe(0);
    expect(traitDamageMul(z, 10, undefined, 'static')).toBeCloseTo(0.6);
  });
});
