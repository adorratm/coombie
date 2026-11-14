import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { describe, expect, test } from 'vitest';
import { retargetLibrary, type AnimLibraryJson } from './animLibrary';

const fakeVrm = (): VRM => {
  const nodes = new Map<string, THREE.Object3D>();
  const hips = new THREE.Object3D();
  hips.name = 'hips';
  hips.position.y = 1;
  nodes.set('hips', hips);
  const scene = new THREE.Group();
  scene.add(hips);
  return {
    scene,
    meta: { metaVersion: '1' },
    humanoid: {
      getNormalizedBoneNode: (name: string) => {
        if (!nodes.has(name)) {
          const o = new THREE.Object3D();
          o.name = name;
          hips.add(o);
          nodes.set(name, o);
        }
        return nodes.get(name)!;
      },
    },
  } as unknown as VRM;
};

const track = (n: number) => ({ t: Array.from({ length: n }, (_, i) => i * 0.1), q: Array.from({ length: n }, () => [0, 0, 0, 1]).flat() });

describe('retargetLibrary', () => {
  test('one clip with an empty bone track does not drop the whole library', () => {
    const lib = {
      version: 1,
      space: 'vrm-normalized',
      clips: {
        idle: { duration: 1, loop: true, speed: 0, tracks: { spine: track(3) } },
        radioCall: { duration: 1, loop: false, speed: 0, tracks: { spine: track(3), rightThumbMetacarpal: track(0) } },
      },
    } as unknown as AnimLibraryJson;

    const set = retargetLibrary(fakeVrm(), lib, 'test-empty-track');

    expect([...set.keys()]).toEqual(['idle', 'radioCall']);
    expect(set.get('radioCall')!.clip.tracks).toHaveLength(1);
  });

  test('the shipped operator animations retarget without errors', async () => {
    const fs = await import('node:fs');
    const lib = JSON.parse(fs.readFileSync(new URL('../public/anims/operator.anim.json', import.meta.url), 'utf8')) as AnimLibraryJson;

    const set = retargetLibrary(fakeVrm(), lib, 'test-shipped');

    expect(set.size).toBe(Object.keys(lib.clips).length);
    for (const [, c] of set) for (const t of c.clip.tracks) expect(t.times.length).toBeGreaterThan(0);
  });
});
