import { describe, expect, it } from 'vitest';
import { beginZombieLodFrame, zombieVrmLod } from './vrmLod';
import type { ZombieVisual } from './characters';

function fakeZombie(opts: {
  x: number;
  z: number;
  attackAnim?: number;
  lodPhase?: number;
}): ZombieVisual {
  return {
    root: { position: { x: opts.x, z: opts.z } },
    attackAnim: opts.attackAnim ?? 0,
    activeSkill: 'none',
    lodPhase: opts.lodPhase ?? 0,
  } as unknown as ZombieVisual;
}

describe('zombieVrmLod', () => {
  it('uses proxy for far idle zombies', () => {
    beginZombieLodFrame(12);
    const z = fakeZombie({ x: 50, z: 0 });
    expect(zombieVrmLod(z, 0, 0, 0)).toBe('proxy');
  });

  it('prefers full for nearby idle when budget remains', () => {
    beginZombieLodFrame(12);
    const z = fakeZombie({ x: 4, z: 0 });
    expect(zombieVrmLod(z, 0, 0, 0)).toBe('full');
  });

  it('keeps attackers readable under budget pressure', () => {
    beginZombieLodFrame(1);
    const near = fakeZombie({ x: 3, z: 0 });
    const attacker = fakeZombie({ x: 40, z: 0, attackAnim: 0.4 });
    expect(zombieVrmLod(near, 0, 0, 0)).toBe('full');
    const lod = zombieVrmLod(attacker, 0, 0, 0);
    expect(lod === 'full' || lod === 'reduced').toBe(true);
  });

  it('never flips mid-far zombies to proxy between cheap ticks (no VRM/proxy flicker)', () => {
    const z = fakeZombie({ x: 31, z: 0 });
    for (let frame = 0; frame < 8; frame++) {
      beginZombieLodFrame(12);
      const lod = zombieVrmLod(z, 0, 0, frame);
      expect(lod === 'reduced' || lod === 'skip').toBe(true);
    }
  });
});
