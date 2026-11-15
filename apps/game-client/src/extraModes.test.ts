import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// the truck model needs textures (browser only)
vi.mock('./vehicleModels', async () => {
  const T = await import('three');
  return { buildMilitaryTruck: () => new T.Group(), rollTruckWheels: () => undefined };
});
import { ModeRuntime, MODES } from './gameModes';
import { EXTRA_MODE_IDS } from './extraModes';
import { MAPS, MAP_ORDER } from './mapDefs';
import { mutationAt, MUTATION_EVERY } from './modeRules';
import type { OperativeVisual, ZombieVisual } from './characters';

const hero = (): OperativeVisual => {
  const root = new THREE.Group();
  return { root, alive: true, isPlayer: true, hp: 100, maxHp: 100, healthBar: { setRatio: () => undefined } } as unknown as OperativeVisual;
};

function runtime(mode: (typeof EXTRA_MODE_IDS)[number]) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.02);
  const me = hero();
  const zombies: ZombieVisual[] = [];
  const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const map = {
    anchors: { core: v(0, 0), evac: v(60, -60), boss: v(-50, 50), spawn: v(0, 8), pickups: [v(40, 0), v(0, 40), v(-40, 0), v(0, -40)], rescues: [v(30, 30), v(-30, 30), v(30, -30)] },
    core: new THREE.Object3D(),
    evacMarker: new THREE.Object3D(),
    bound: 100,
  };
  let hurt = 0;
  const rt = new ModeRuntime(
    { map: 'city', mode, difficulty: 'normal' },
    {
      scene,
      map: map as never,
      player: me,
      squad: [me],
      zombies,
      spawnZombieAt: (kind, x, z) => {
        const r = new THREE.Group();
        r.position.set(x, 0, z);
        const zz = { kind, root: r, hp: 10, maxHp: 10, speed: 2, baseSpeed: 2, attackDamage: 5, statuses: [] } as unknown as ZombieVisual;
        zombies.push(zz);
        return zz;
      },
      recruitAt: () => undefined,
      warn: () => undefined,
      sfx: () => undefined,
      hurtLocal: (a) => (hurt += a),
      healLocal: () => undefined,
    },
  );
  return { rt, me, zombies, scene, hurt: () => hurt };
}

describe('the ten newer modes', () => {
  it('are on every map and described', () => {
    for (const id of EXTRA_MODE_IDS) {
      expect(MODES[id].name.length).toBeGreaterThan(2);
      for (const m of MAP_ORDER) expect(MAPS[m].modes).toContain(id);
    }
  });

  it.each(EXTRA_MODE_IDS)('%s ticks, draws a HUD and never throws', (id) => {
    const { rt, me } = runtime(id);
    for (let i = 0; i < 400; i++) {
      // wander so the escort / capture / pickup paths all run
      me.root.position.set(Math.sin(i / 20) * 40, 0, Math.cos(i / 25) * 40);
      rt.update(0.5, i);
      rt.localTick(0.5);
      const hud = rt.hud({} as never);
      expect(typeof hud.objectiveLabel).toBe('string');
      rt.indicators();
      if (rt.outcome) break;
    }
    rt.dispose();
  });

  it('convoy rolls only with an escort and arrives', () => {
    const { rt, me, zombies } = runtime('convoy');
    me.root.position.set(-80, 0, 80);
    for (let i = 0; i < 20; i++) rt.update(0.5, 0);
    const before = rt.hud({} as never).objectiveProgress;
    expect(before).toBe(0);
    for (let i = 0; i < 4000 && !rt.outcome; i++) {
      const truck = rt.indicators().find((x) => x.icon === '🚚')!;
      me.root.position.copy(truck.pos);
      zombies.length = 0; // the squad clears every ambush
      rt.update(0.5, 0);
    }
    expect(rt.outcome?.won).toBe(true);
  });

  it('one life means no revive, whatever the tree adds', () => {
    const { rt } = runtime('onelife');
    rt.revivesLeft += 3;
    expect(rt.tryRevive()).toBe(false);
  });

  it('infection drains until a sample is collected', () => {
    const r = runtime('infection');
    for (let i = 0; i < 10; i++) r.rt.localTick(0.5);
    expect(r.hurt()).toBeGreaterThan(0);
  });

  it('mutations stack every interval', () => {
    expect(mutationAt(MUTATION_EVERY * 0.5)).toEqual([]);
    expect(mutationAt(MUTATION_EVERY * 3.1).length).toBe(3);
  });
});
