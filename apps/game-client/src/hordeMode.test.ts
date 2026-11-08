import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HORDE_WAVES, ModeRuntime, type ModeCtx } from './gameModes';
import type { ZombieVisual } from './characters';

function stubCtx(alive: ZombieVisual[], cap = 40): ModeCtx {
  return {
    scene: new THREE.Scene(),
    map: { anchors: { boss: new THREE.Vector3(40, 0, 40) }, core: { visible: false } } as unknown as ModeCtx['map'],
    player: { root: { position: new THREE.Vector3() } } as unknown as ModeCtx['player'],
    squad: [],
    zombies: alive,
    spawnZombieAt: (kind) => {
      if (alive.length >= cap && kind !== 'boss') return null;
      const parent = {};
      const z = { kind, hp: 10, root: { parent, position: new THREE.Vector3() } } as unknown as ZombieVisual;
      alive.push(z);
      return z;
    },
    recruitAt: () => undefined,
    warn: () => undefined,
    sfx: () => undefined,
  };
}

describe('horde mode', () => {
  it('waits for each horde to die and wins after the last one', () => {
    const alive: ZombieVisual[] = [];
    const rt = new ModeRuntime({ map: 'city', mode: 'horde', difficulty: 'normal' }, stubCtx(alive));
    expect(rt.ownsSpawning).toBe(true);
    let lastWave = 0;
    for (let step = 0; step < 200000 && !rt.outcome; step++) {
      const aliveBefore = alive.filter((z) => z.hp > 0).length;
      const leftBefore = rt.hordeRemaining;
      rt.update(0.1, 0);
      expect(rt.hordeWave).toBeGreaterThanOrEqual(lastWave);
      // the next horde never starts while this one still has zombies left
      if (rt.hordeWave > lastWave && lastWave > 0) {
        expect(aliveBefore).toBe(0);
        expect(leftBefore).toBe(0);
      }
      lastWave = rt.hordeWave;
      // kill everything every ~2 s of sim time
      if (step % 20 === 0) for (const z of alive) z.hp = 0;
      if (step % 20 === 0) alive.length = 0;
    }
    expect(rt.outcome?.won).toBe(true);
    expect(rt.hordeWave).toBe(HORDE_WAVES);
  });

  it('timed survival uses the chosen length', () => {
    const rt = new ModeRuntime({ map: 'city', mode: 'survival', difficulty: 'normal', minutes: 40 }, stubCtx([]));
    expect(rt.total).toBe(2400);
    const def = new ModeRuntime({ map: 'city', mode: 'survival', difficulty: 'normal' }, stubCtx([]));
    expect(def.total).toBe(1200);
  });
});
