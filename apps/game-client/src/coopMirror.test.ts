import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CoopMirror, packKit } from './coopMirror';
import { createRunSkillState } from './runSkills';
import type { OperativeVisual } from './characters';

const noopProxy = (): never =>
  new Proxy(() => undefined, { get: (_t, k) => (k === 'then' ? undefined : noopProxy()), apply: () => undefined }) as never;

const op = (x: number): OperativeVisual => {
  const root = new THREE.Group();
  root.position.set(x, 0, 0);
  return { root, alive: true, hp: 50, maxHp: 100, healthBar: { setRatio: () => undefined, setVisible: () => undefined }, userData: {} } as unknown as OperativeVisual;
};

describe('co-op ability mirror', () => {
  it.each(['ironclad', 'valkyrie', 'breaker', 'ghost', 'tox', 'spark', 'warden', 'havoc'])('replays every %s ability, skill kit and support call', (hero) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scene = new THREE.Scene();
    const me = op(0);
    const mate = op(3);
    const m = new CoopMirror({
      scene,
      fx: noopProxy(),
      vfx: noopProxy(),
      zombies: [],
      me,
      allyOf: (id) => (id === 'b' ? mate : null),
      heroOf: () => hero as never,
      moveWithCollision: () => undefined,
      revive: () => undefined,
      sample: () => undefined,
      boom: () => undefined,
    });
    for (const slot of ['q', 'e', 'r']) m.cast('b', { slot, x: 5, z: 2, lv: 3, pw: 1.2, ae: 1 }, 1);
    m.kit('b', ['saws', 2, '', 'drone', 1, 'power', 'gunship', 3, '', 'fireAura', 2, ''], 1);
    m.support('b', 4, 4);
    for (let i = 0; i < 30; i++) m.update(0.05, 1 + i * 0.05);
    m.cast('nobody', { slot: 'q', x: 0, z: 0 }, 2);
    m.dispose();
    expect(warn.mock.calls.map((c) => String(c[1]))).toEqual([]);
    warn.mockRestore();
  });

  it('packs a kit as [id, level, branch]', () => {
    const st = createRunSkillState('saws');
    st.evolved.set('saws', 'power');
    expect(packKit(st)).toEqual(['saws', 1, 'power']);
  });
});
