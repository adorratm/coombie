import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { CombatFx } from './fx';
import type { AbilityDef, ProgressState } from './progression';
import { getActiveClass } from './progression';

export interface AbilityRuntime {
  zones: AbilityZone[];
  update: (dt: number, zombies: ZombieVisual[], damageZombie: DamageZombieFn) => void;
  dispose: () => void;
}

export type DamageZombieFn = (
  z: ZombieVisual,
  damage: number,
  hitPos: THREE.Vector3,
  knockDir: THREE.Vector3,
) => void;

type AbilityZone = {
  mesh: THREE.Mesh;
  life: number;
  radius: number;
  dps: number;
  tick: number;
  kind: 'toxin' | 'mist';
};

export function createAbilityRuntime(scene: THREE.Scene): AbilityRuntime {
  const zones: AbilityZone[] = [];

  return {
    zones,
    update: (dt, zombies, damageZombie) => {
      for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i]!;
        z.life -= dt;
        z.tick -= dt;
        const mat = z.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0.15, Math.min(0.55, z.life * 0.25));
        z.mesh.rotation.z += dt * 0.8;

        if (z.tick <= 0) {
          z.tick = 0.35;
          for (const enemy of zombies) {
            if (enemy.hp <= 0) continue;
            const d = enemy.root.position.distanceTo(z.mesh.position);
            if (d <= z.radius) {
              const dir = enemy.root.position.clone().sub(z.mesh.position).normalize();
              damageZombie(enemy, z.dps * 0.35, enemy.root.position.clone().setY(1.2), dir);
            }
          }
        }

        if (z.life <= 0) {
          scene.remove(z.mesh);
          (z.mesh.material as THREE.Material).dispose();
          z.mesh.geometry.dispose();
          zones.splice(i, 1);
        }
      }
    },
    dispose: () => {
      for (const z of zones) {
        scene.remove(z.mesh);
        (z.mesh.material as THREE.Material).dispose();
        z.mesh.geometry.dispose();
      }
      zones.length = 0;
    },
  };
}

export function castAbility(opts: {
  scene: THREE.Scene;
  fx: CombatFx;
  runtime: AbilityRuntime;
  progress: ProgressState;
  ability: AbilityDef;
  caster: OperativeVisual;
  squad: OperativeVisual[];
  zombies: ZombieVisual[];
  damageZombie: DamageZombieFn;
  now: number;
}): void {
  const { scene, fx, runtime, progress, ability, caster, squad, zombies, damageZombie } = opts;
  const power = ability.power * progress.abilityPowerMult;
  const aoe = progress.mods.aoeRadiusMult;
  const origin = caster.root.position;

  if (ability.kind === 'kinetic_nova') {
    const radius = 6.5 * aoe;
    fx.spawnHitRing(origin, 0x3dff9a);
    fx.spawnBloodBurst(origin.clone().setY(1), 1.4, 0x3dff9a);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, radius, 32),
      new THREE.MeshBasicMaterial({
        color: 0x3dff9a,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(origin.x, 0.1, origin.z);
    scene.add(ring);
    runtime.zones.push({
      mesh: ring,
      life: 0.35,
      radius,
      dps: 0,
      tick: 99,
      kind: 'mist',
    });
    for (const z of zombies) {
      if (z.hp <= 0) continue;
      const d = z.root.position.distanceTo(origin);
      if (d <= radius) {
        const dir = z.root.position.clone().sub(origin).normalize();
        damageZombie(z, power * (1.2 - d / radius), z.root.position.clone().setY(1.2), dir);
        z.root.position.add(dir.multiplyScalar(1.8));
      }
    }
    return;
  }

  if (ability.kind === 'biotic_mist') {
    const radius = 7 * aoe;
    const heal = power;
    for (const op of squad) {
      if (!op.alive) continue;
      if (op.root.position.distanceTo(origin) > radius) continue;
      op.hp = Math.min(op.maxHp, op.hp + heal);
      op.healthBar.setRatio(op.hp / op.maxHp);
      fx.spawnHitRing(op.root.position, 0x38bdf8);
    }
    const mist = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 28),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mist.rotation.x = -Math.PI / 2;
    mist.position.set(origin.x, 0.12, origin.z);
    scene.add(mist);
    runtime.zones.push({ mesh: mist, life: 1.2, radius, dps: 0, tick: 99, kind: 'mist' });
    return;
  }

  if (ability.kind === 'concussive_blast') {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(caster.root.quaternion);
    forward.y = 0;
    forward.normalize();
    const range = 10 * aoe;
    fx.spawnHitRing(origin.clone().add(forward.clone().multiplyScalar(2)), 0xfbbf24);
    for (const z of zombies) {
      if (z.hp <= 0) continue;
      const toZ = z.root.position.clone().sub(origin);
      toZ.y = 0;
      const dist = toZ.length();
      if (dist > range || dist < 0.01) continue;
      toZ.normalize();
      if (toZ.dot(forward) < 0.45) continue;
      damageZombie(z, power * 2.4, z.root.position.clone().setY(1.1), toZ);
      z.root.position.add(toZ.multiplyScalar(2.4));
    }
    return;
  }

  if (ability.kind === 'thermal_pierce') {
    fx.spawnHitRing(origin, 0x88eeff);
    progress.pierceShots = Math.max(progress.pierceShots, Math.floor(4 * progress.abilityPowerMult));
    return;
  }

  if (ability.kind === 'overdrive') {
    fx.spawnHitRing(origin, 0xffcc55);
    const cls = getActiveClass(progress);
    progress.overdriveUntil = opts.now + (cls.ability.duration ?? 5);
    return;
  }

  if (ability.kind === 'toxin_cloud') {
    const radius = 5.5 * aoe;
    const cloud = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 28),
      new THREE.MeshBasicMaterial({
        color: 0x84cc16,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.set(origin.x, 0.1, origin.z);
    scene.add(cloud);
    runtime.zones.push({
      mesh: cloud,
      life: ability.duration ?? 4,
      radius,
      dps: power,
      tick: 0,
      kind: 'toxin',
    });
    fx.spawnHitRing(origin, 0x84cc16);
    return;
  }

  if (ability.kind === 'sentry_pulse') {
    const radius = 4.8 * aoe;
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(0.5, radius, 36),
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(origin.x, 0.08, origin.z);
    scene.add(pad);
    runtime.zones.push({
      mesh: pad,
      life: ability.duration ?? 5,
      radius,
      dps: power * 1.4,
      tick: 0,
      kind: 'toxin',
    });
    fx.spawnHitRing(origin, 0xf97316);
    return;
  }

  if (ability.kind === 'cluster_barrage') {
    const count = 6;
    const spread = 5.5 * aoe;
    fx.spawnHitRing(origin, 0xfb7185);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const dist = 1.6 + Math.random() * spread;
      const pos = origin.clone().add(new THREE.Vector3(Math.cos(ang) * dist, 0, Math.sin(ang) * dist));
      fx.spawnBloodBurst(pos.clone().setY(1), 1.1, 0xfb7185);
      fx.spawnHitRing(pos, 0xfb7185);
      const blastR = 2.4 * aoe;
      for (const z of zombies) {
        if (z.hp <= 0) continue;
        const d = z.root.position.distanceTo(pos);
        if (d > blastR) continue;
        const dir = z.root.position.clone().sub(pos).normalize();
        damageZombie(z, power * (1.1 - d / blastR), z.root.position.clone().setY(1.1), dir);
        z.root.position.add(dir.multiplyScalar(1.2));
      }
    }
  }
}
