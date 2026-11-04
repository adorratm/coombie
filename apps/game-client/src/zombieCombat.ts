import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';

export type ZombieSkillId = 'none' | 'claw' | 'lunge' | 'spit' | 'slam' | 'roar' | 'shriek';

export interface AcidSpit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  ownerKind: ZombieVisual['kind'];
}

export interface ZombieCombatFx {
  spawnHitRing: (pos: THREE.Vector3, color: number, y?: number) => void;
  spawnBloodBurst: (pos: THREE.Vector3, scale?: number, color?: number) => void;
  spawnWarnRing: (pos: THREE.Vector3, radius: number, color?: number, duration?: number) => void;
}

const spitGeo = new THREE.SphereGeometry(0.18, 8, 8);
const spitMat = () =>
  new THREE.MeshBasicMaterial({
    color: 0xa3e635,
    transparent: true,
    opacity: 0.85,
  });

/** Pick next skill when entering attack range. */
export function chooseZombieSkill(z: ZombieVisual): ZombieSkillId {
  if (z.skillCooldown > 0) return 'claw';
  if (z.kind === 'acid') return Math.random() < 0.7 ? 'spit' : 'claw';
  if (z.kind === 'boss') {
    const r = Math.random();
    if (r < 0.35) return 'slam';
    if (r < 0.55) return 'roar';
    if (r < 0.75) return 'lunge';
    return 'claw';
  }
  if (z.kind === 'tank') {
    const r = Math.random();
    if (r < 0.45) return 'slam';
    if (r < 0.65) return 'roar';
    return 'claw';
  }
  if (z.kind === 'screamer') return Math.random() < 0.78 ? 'shriek' : 'claw';
  if (z.kind === 'runner') return Math.random() < 0.55 ? 'lunge' : 'claw';
  return Math.random() < 0.28 ? 'lunge' : 'claw';
}

export function skillAttackDuration(skill: ZombieSkillId): number {
  switch (skill) {
    case 'spit':
      return 0.55;
    case 'slam':
      return 0.85;
    case 'roar':
      return 0.7;
    case 'shriek':
      return 0.78;
    case 'lunge':
      return 0.5;
    default:
      return 0.42;
  }
}

export function skillCooldownAfter(skill: ZombieSkillId, kind: ZombieVisual['kind']): number {
  const base =
    skill === 'slam'
      ? 3.2
      : skill === 'roar'
        ? 4.5
        : skill === 'shriek'
          ? 5.2
          : skill === 'spit'
            ? 1.8
            : skill === 'lunge'
              ? 2.2
              : 0.9;
  if (kind === 'boss') return base * 0.85;
  if (kind === 'tank') return base * 0.9;
  if (kind === 'screamer') return base * 0.92;
  if (kind === 'acid') return base * 0.95;
  if (kind === 'runner') return base * 0.88;
  return base;
}

/**
 * Begin attack: sets anim + active skill. Damage/VFX applied at impact frame via tick.
 */
export function beginZombieAttack(z: ZombieVisual, skill: ZombieSkillId): void {
  z.activeSkill = skill;
  z.attackAnim = 0.01;
  z.attackImpactDone = false;
}

/** Ground / silhouette telegraph at windup — readable counterplay before impact. */
export function telegraphZombieSkill(z: ZombieVisual, fx: ZombieCombatFx): void {
  const origin = z.root.position;
  const dur = Math.max(0.22, skillAttackDuration(z.activeSkill) * 0.55);
  if (z.activeSkill === 'slam') {
    const radius = z.kind === 'boss' ? 3.8 : 3.2;
    fx.spawnWarnRing(origin, radius, 0xef4444, dur);
    return;
  }
  if (z.activeSkill === 'roar') {
    fx.spawnWarnRing(origin, z.kind === 'boss' ? 6.2 : 5.2, 0xf97316, dur * 0.85);
    return;
  }
  if (z.activeSkill === 'shriek') {
    fx.spawnWarnRing(origin, 7.0, 0xd946ef, dur);
    return;
  }
  if (z.activeSkill === 'spit') {
    fx.spawnWarnRing(origin, 1.35, 0x84cc16, 0.32);
    return;
  }
  if (z.activeSkill === 'lunge' && (z.kind === 'runner' || z.kind === 'boss')) {
    fx.spawnWarnRing(origin, 1.9, z.kind === 'runner' ? 0x22d3ee : 0xf87171, 0.28);
  }
}

/** Impact fraction of attackAnim (0–1) when damage should land. */
export function skillImpactAt(skill: ZombieSkillId): number {
  switch (skill) {
    case 'spit':
      return 0.45;
    case 'slam':
      return 0.55;
    case 'roar':
      return 0.4;
    case 'shriek':
      return 0.42;
    case 'lunge':
      return 0.5;
    default:
      return 0.48;
  }
}

export function createAcidSpit(
  scene: THREE.Scene,
  from: THREE.Vector3,
  toward: THREE.Vector3,
  damage: number,
): AcidSpit {
  const mesh = new THREE.Mesh(spitGeo, spitMat());
  mesh.position.copy(from);
  mesh.position.y = 1.35;
  scene.add(mesh);
  const dir = toward.clone().sub(from);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  return {
    mesh,
    vel: dir.multiplyScalar(14),
    life: 1.1,
    damage,
    ownerKind: 'acid',
  };
}

export function applyZombieSkillImpact(opts: {
  z: ZombieVisual;
  target: OperativeVisual;
  squad: OperativeVisual[];
  scene: THREE.Scene;
  spits: AcidSpit[];
  fx: ZombieCombatFx;
  damageOperative: (op: OperativeVisual, amount: number, from: THREE.Vector3) => boolean;
}): void {
  const { z, target, squad, scene, spits, fx, damageOperative } = opts;
  const skill = z.activeSkill;
  const origin = z.root.position;

  if (skill === 'spit') {
    const spit = createAcidSpit(scene, origin, target.root.position, z.attackDamage * 0.85);
    spits.push(spit);
    fx.spawnHitRing(origin, 0x84cc16, 1.2);
    return;
  }

  if (skill === 'slam') {
    const radius = z.kind === 'boss' ? 3.8 : 3.2;
    fx.spawnHitRing(origin, 0xef4444, 0.1);
    fx.spawnHitRing(origin, 0xfca5a5, 0.14);
    fx.spawnBloodBurst(origin, z.kind === 'boss' ? 2.0 : 1.5, 0x7f1d1d);
    for (const op of squad) {
      if (!op.alive) continue;
      if (op.root.position.distanceTo(origin) <= radius) {
        damageOperative(op, z.attackDamage * 1.35, origin);
        const away = op.root.position.clone().sub(origin);
        away.y = 0;
        if (away.lengthSq() > 1e-4) {
          away.normalize().multiplyScalar(z.kind === 'boss' ? 1.15 : 0.85);
          op.root.position.add(away);
        }
      }
    }
    return;
  }

  if (skill === 'roar') {
    const radius = z.kind === 'boss' ? 6.2 : 5.2;
    fx.spawnHitRing(origin, 0xf97316, 0.12);
    fx.spawnHitRing(origin, 0xfdba74, 1.05);
    for (const op of squad) {
      if (!op.alive) continue;
      if (op.root.position.distanceTo(origin) <= radius) {
        damageOperative(op, Math.max(3, z.attackDamage * 0.35), origin);
        const base = (op.root.userData.baseMoveSpeed as number | undefined) ?? op.moveSpeed;
        op.root.userData.baseMoveSpeed = base;
        op.moveSpeed = base * 0.55;
        op.root.userData.slowUntil = performance.now() / 1000 + 2.2;
      }
    }
    return;
  }

  if (skill === 'shriek') {
    const radius = 7.0;
    const now = performance.now() / 1000;
    fx.spawnHitRing(origin, 0xd946ef, 0.1);
    fx.spawnHitRing(origin, 0xe879f9, 1.2);
    fx.spawnBloodBurst(origin, 1.1, 0xa21caf);
    for (const op of squad) {
      if (!op.alive) continue;
      if (op.root.position.distanceTo(origin) > radius) continue;
      damageOperative(op, Math.max(2, z.attackDamage * 0.45), origin);
      const base = (op.root.userData.baseMoveSpeed as number | undefined) ?? op.moveSpeed;
      op.root.userData.baseMoveSpeed = base;
      op.moveSpeed = base * 0.42;
      op.root.userData.slowUntil = now + 2.8;
      // Fire-rate disrupt — counterplay: break LOS / kill screamer
      op.root.userData.fireSlowUntil = now + 2.8;
      op.root.userData.fireSlowMul = 1.85;
    }
    return;
  }

  if (skill === 'lunge') {
    const dir = target.root.position.clone().sub(origin);
    dir.y = 0;
    if (dir.lengthSq() > 1e-4) {
      dir.normalize();
      z.root.position.addScaledVector(dir, 1.15);
    }
    const hit = damageOperative(target, z.attackDamage * 1.15, z.root.position);
    if (hit) fx.spawnBloodBurst(target.root.position, 0.7, 0xaa2222);
    return;
  }

  // claw default
  const hit = damageOperative(target, z.attackDamage, z.root.position);
  if (hit) fx.spawnBloodBurst(target.root.position, 0.55, 0xaa2222);
}

/** Restore moveSpeed / fire-rate after roar or shriek. */
export function tickOperativeSlow(op: OperativeVisual, nowSec: number): void {
  const until = op.root.userData.slowUntil as number | undefined;
  const base = op.root.userData.baseMoveSpeed as number | undefined;
  if (until != null && base != null && nowSec >= until) {
    op.moveSpeed = base;
    delete op.root.userData.slowUntil;
    delete op.root.userData.baseMoveSpeed;
  }
  const fireUntil = op.root.userData.fireSlowUntil as number | undefined;
  if (fireUntil != null && nowSec >= fireUntil) {
    delete op.root.userData.fireSlowUntil;
    delete op.root.userData.fireSlowMul;
  }
}

/** Multiplier applied to fire cooldown while shriek disrupt is active. */
export function fireRateDebuffMul(op: OperativeVisual, nowSec: number): number {
  const until = op.root.userData.fireSlowUntil as number | undefined;
  if (until == null || nowSec >= until) return 1;
  const mul = op.root.userData.fireSlowMul as number | undefined;
  return mul && mul > 1 ? mul : 1;
}
