import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { ZombieKind } from './zombieKinds';
import { SEG, type ClipSeg } from './zombieAnim';

/**
 * Zombie skills. Every attack is telegraphed (wind-up clip + ground marker) and lands
 * on the clip's real hit frame:
 *
 *  grunt     claw (swipe / punch / kick) · grab (neck bite: pins the target, ticks damage)
 *  runner    claw · lunge (leaps 2–3 m)
 *  crawler   pounce (low leap, cripples: slow)
 *  acid      spit (arcing glob → acid puddle) · claw
 *  screamer  shriek (slows + jams fire rate, frenzies nearby zombies, calls runners)
 *  bloater   burst (swells and explodes, toxic cloud) — also bursts on death
 *  tank      charge (straight-line rush, knockback + stun) · slam (shockwave) · claw
 *  boss      slam · leap (jumps onto your position) · roar (summons) · charge · claw
 *            phase 2 (<60 % hp) adds leap/summon, phase 3 (<30 %) enrages.
 */

export type ZombieSkillId =
  | 'none'
  | 'claw'
  | 'lunge'
  | 'spit'
  | 'slam'
  | 'roar'
  | 'shriek'
  | 'grab'
  | 'pounce'
  | 'charge'
  | 'leap'
  | 'burst';

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

/** Per-attack runtime (kept on the zombie, created lazily). */
interface AttackState {
  seg: ClipSeg | null;
  impactAt: number;
  dir: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  grabbed: OperativeVisual | null;
  grabHp: number;
  tick: number;
  hitSet: Set<OperativeVisual>;
  shrieks: number;
}
const stateOf = (z: ZombieVisual): AttackState => {
  const ud = z.root.userData as { atk?: AttackState };
  return (ud.atk ??= {
    seg: null,
    impactAt: 0.5,
    dir: new THREE.Vector3(),
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    grabbed: null,
    grabHp: 0,
    tick: 0,
    hitSet: new Set(),
    shrieks: 0,
  });
};

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const hpRatio = (z: ZombieVisual) => z.hp / Math.max(1, z.maxHp);
export const bossPhase = (z: ZombieVisual): 1 | 2 | 3 => (hpRatio(z) < 0.3 ? 3 : hpRatio(z) < 0.6 ? 2 : 1);

/** Skill used from range (before reaching melee) — null = keep closing in. */
export function rangedSkillFor(z: ZombieVisual, dist: number): ZombieSkillId | null {
  if (z.skillCooldown > 0 || z.attackAnim > 0) return null;
  switch (z.kind) {
    case 'tank':
      return dist > 4.5 && dist < 13 && Math.random() < 0.012 ? 'charge' : null;
    case 'boss': {
      const ph = bossPhase(z);
      if (ph >= 2 && dist > 5 && dist < 15 && Math.random() < 0.012) return 'leap';
      if (dist > 5 && dist < 13 && Math.random() < 0.006 * ph) return 'charge';
      if (ph >= 2 && dist < 16 && Math.random() < 0.004) return 'roar';
      return null;
    }
    case 'runner':
      return dist > 2 && dist < 4.2 && Math.random() < 0.05 ? 'lunge' : null;
    case 'crawler':
      return dist > 1.6 && dist < 3.6 && Math.random() < 0.06 ? 'pounce' : null;
    default:
      return null;
  }
}

/** Pick next skill when entering attack range. */
export function chooseZombieSkill(z: ZombieVisual): ZombieSkillId {
  const ready = z.skillCooldown <= 0;
  switch (z.kind) {
    case 'acid':
      return ready && Math.random() < 0.75 ? 'spit' : 'claw';
    case 'screamer':
      return ready && Math.random() < 0.8 ? 'shriek' : 'claw';
    case 'bloater':
      return 'burst';
    case 'crawler':
      return 'pounce';
    case 'runner':
      return ready && Math.random() < 0.4 ? 'lunge' : 'claw';
    case 'tank':
      if (!ready) return 'claw';
      return Math.random() < 0.5 ? 'slam' : 'claw';
    case 'boss': {
      if (!ready) return 'claw';
      const r = Math.random();
      if (r < 0.4) return 'slam';
      if (r < 0.55) return 'roar';
      return 'claw';
    }
    default:
      return ready && Math.random() < 0.2 ? 'grab' : 'claw';
  }
}

/** Clip slice + game-time duration per skill / kind. */
function attackClip(kind: ZombieKind, skill: ZombieSkillId): { seg: ClipSeg; dur: number } {
  const mutant = kind === 'tank' || kind === 'boss';
  const fast = kind === 'runner' ? 0.7 : kind === 'boss' ? 0.95 : 1;
  switch (skill) {
    case 'grab':
      return { seg: SEG.neckBite, dur: 2.6 };
    case 'lunge':
      return { seg: SEG.headbutt, dur: 0.85 };
    case 'pounce':
      return { seg: SEG.crawlLunge, dur: 0.75 };
    case 'spit':
      return { seg: SEG.headbutt, dur: 1.05 };
    case 'shriek':
      return { seg: SEG.scream, dur: 1.9 };
    case 'burst':
      return { seg: SEG.scream, dur: 1.25 };
    case 'slam':
      return mutant ? { seg: SEG.mJump, dur: 1.55 * fast } : { seg: SEG.kick, dur: 1.0 };
    case 'leap':
      return { seg: SEG.mJump, dur: 1.75 };
    case 'roar':
      return mutant ? { seg: SEG.mRoar, dur: 1.9 } : { seg: SEG.scream, dur: 1.6 };
    case 'charge':
      return { seg: SEG.mRoar, dur: 2.0 };
    default: {
      if (mutant) return { seg: SEG.mSwipe, dur: 1.05 * fast };
      const seg = kind === 'runner' ? SEG.swipe : pick([SEG.swipe, SEG.swipe, SEG.punch, SEG.kick]);
      const dur = seg === SEG.punch ? 0.7 : seg === SEG.kick ? 0.95 : 1.0;
      return { seg, dur: dur * fast };
    }
  }
}

export function skillAttackDuration(skill: ZombieSkillId, kind: ZombieKind = 'grunt'): number {
  return attackClip(kind, skill).dur;
}

export function skillCooldownAfter(skill: ZombieSkillId, kind: ZombieVisual['kind']): number {
  const base: Record<ZombieSkillId, number> = {
    none: 0,
    claw: 0.5,
    lunge: 2.6,
    spit: 2.2,
    slam: 3.6,
    roar: 7,
    shriek: 6.5,
    grab: 6,
    pounce: 1.8,
    charge: 6,
    leap: 7,
    burst: 99,
  };
  return base[skill] * (kind === 'boss' ? 0.85 : 1);
}

/**
 * Begin attack: sets timeline, anim slice and impact frame. `target` is used for
 * charges / leaps / lunges (direction or landing point).
 */
export function beginZombieAttack(z: ZombieVisual, skill: ZombieSkillId, target?: THREE.Vector3): ClipSeg {
  const st = stateOf(z);
  const { seg, dur } = attackClip(z.kind, skill);
  st.seg = seg;
  st.impactAt = THREE.MathUtils.clamp((seg.impact - seg.from) / Math.max(0.05, seg.to - seg.from), 0.05, 0.95);
  if (skill === 'charge') st.impactAt = 0.3; // wind-up roar, then the rush
  if (skill === 'grab') st.impactAt = 0.22;
  st.hitSet.clear();
  st.grabbed = null;
  st.tick = 0;
  st.from.copy(z.root.position);
  if (target) {
    st.to.copy(target);
    st.dir.copy(target).sub(z.root.position).setY(0);
    if (st.dir.lengthSq() < 1e-6) st.dir.set(Math.sin(z.root.rotation.y), 0, Math.cos(z.root.rotation.y));
    st.dir.normalize();
  }
  z.activeSkill = skill;
  z.attackAnim = 0.01;
  z.attackImpactDone = false;
  z.attackDuration = dur;
  z.attackCooldown = dur + (z.kind === 'runner' ? 0.1 : 0.25);
  z.skillCooldown = skill === 'claw' ? Math.max(0, z.skillCooldown) : skillCooldownAfter(skill, z.kind);
  if (z.kind === 'boss' && bossPhase(z) === 3) z.skillCooldown *= 0.7;
  return seg;
}

/** Impact fraction of attackAnim (0–1) when damage should land. */
export function skillImpactAt(z: ZombieVisual | ZombieSkillId): number {
  if (typeof z === 'string') return 0.5;
  return stateOf(z).impactAt;
}

/** Ground / silhouette telegraph at windup — readable counterplay before impact. */
export function telegraphZombieSkill(z: ZombieVisual, fx: ZombieCombatFx): void {
  const origin = z.root.position;
  const st = stateOf(z);
  const lead = Math.max(0.3, z.attackDuration * st.impactAt);
  switch (z.activeSkill) {
    case 'slam':
      fx.spawnWarnRing(origin, slamRadius(z), 0xef4444, lead);
      break;
    case 'leap':
      fx.spawnWarnRing(st.to, 3.4, 0xef4444, z.attackDuration * 0.7);
      break;
    case 'roar':
      fx.spawnWarnRing(origin, z.kind === 'boss' ? 6.5 : 5.2, 0xf97316, lead);
      break;
    case 'shriek':
      fx.spawnWarnRing(origin, 7.5, 0xd946ef, lead);
      break;
    case 'burst':
      fx.spawnWarnRing(origin, 3.6, 0xa3e635, lead);
      break;
    case 'spit':
      fx.spawnWarnRing(origin, 1.2, 0x84cc16, lead);
      break;
    case 'charge': {
      const p = origin.clone().addScaledVector(st.dir, 3);
      fx.spawnWarnRing(p, 1.6, 0xf59e0b, lead);
      break;
    }
    case 'grab':
      fx.spawnWarnRing(origin, 1.4, 0xb91c1c, lead);
      break;
    case 'lunge':
    case 'pounce':
      fx.spawnWarnRing(origin, 1.6, z.kind === 'runner' ? 0x22d3ee : 0xf97316, lead);
      break;
    default:
      break;
  }
}

const slamRadius = (z: ZombieVisual) => (z.kind === 'boss' ? (bossPhase(z) === 3 ? 4.8 : 4.0) : 3.2);

// ---------------------------------------------------------------------------
// Hazards: acid puddles + toxic clouds
// ---------------------------------------------------------------------------

interface Hazard {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  r: number;
  dps: number;
  life: number;
  max: number;
  slow: number;
}
const puddleGeo = new THREE.CircleGeometry(1, 28);
const cloudGeo = new THREE.SphereGeometry(1, 14, 10);

export class ZombieHazards {
  private readonly list: Hazard[] = [];
  constructor(private readonly scene: THREE.Scene) {}

  puddle(x: number, z: number, r: number, dps: number, life = 4.5): void {
    const m = new THREE.Mesh(
      puddleGeo,
      new THREE.MeshStandardMaterial({ color: 0x4d7c0f, emissive: 0x84cc16, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    m.scale.setScalar(0.2);
    this.scene.add(m);
    this.add({ mesh: m, x, z, r, dps, life, max: life, slow: 0.35 });
  }

  cloud(x: number, z: number, r: number, dps: number, life = 5): void {
    const m = new THREE.Mesh(
      cloudGeo,
      new THREE.MeshBasicMaterial({ color: 0x9acd32, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    m.position.set(x, 0.6, z);
    m.scale.set(r * 0.3, r * 0.15, r * 0.3);
    this.scene.add(m);
    this.add({ mesh: m, x, z, r, dps, life, max: life, slow: 0.15 });
  }

  private add(h: Hazard): void {
    if (this.list.length > 24) this.remove(0);
    this.list.push(h);
  }

  private remove(i: number): void {
    const h = this.list[i]!;
    h.mesh.removeFromParent();
    (h.mesh.material as THREE.Material).dispose();
    this.list.splice(i, 1);
  }

  /** Damage + slow operatives standing in hazards. */
  tick(dt: number, squad: OperativeVisual[], damage: (op: OperativeVisual, amount: number) => void, nowSec: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]!;
      h.life -= dt;
      const age = h.max - h.life;
      const grow = Math.min(1, age / 0.35);
      const fade = Math.min(1, h.life / 0.8);
      const mat = h.mesh.material as THREE.MeshBasicMaterial;
      if (h.mesh.geometry === puddleGeo) {
        h.mesh.scale.setScalar(h.r * grow);
        mat.opacity = 0.75 * fade;
      } else {
        const s = h.r * (0.6 + 0.4 * grow) * (1 + Math.sin(age * 2.2) * 0.05);
        h.mesh.scale.set(s, s * 0.45, s);
        mat.opacity = 0.3 * fade;
        h.mesh.rotation.y += dt * 0.3;
      }
      if (h.life <= 0) {
        this.remove(i);
        continue;
      }
      for (const op of squad) {
        if (!op.alive) continue;
        const dx = op.root.position.x - h.x;
        const dz = op.root.position.z - h.z;
        if (dx * dx + dz * dz > h.r * h.r) continue;
        const acc = ((op.root.userData.hazardAcc as number | undefined) ?? 0) + h.dps * dt;
        if (acc >= 2) {
          damage(op, acc);
          op.root.userData.hazardAcc = 0;
        } else op.root.userData.hazardAcc = acc;
        slowOperative(op, 1 - h.slow, nowSec + 0.3);
      }
    }
  }

  dispose(): void {
    while (this.list.length) this.remove(0);
  }
}

function slowOperative(op: OperativeVisual, mul: number, until: number): void {
  const base = (op.root.userData.baseMoveSpeed as number | undefined) ?? op.moveSpeed;
  op.root.userData.baseMoveSpeed = base;
  op.moveSpeed = Math.min(op.moveSpeed, base * mul);
  op.root.userData.slowUntil = Math.max((op.root.userData.slowUntil as number | undefined) ?? 0, until);
}

// ---------------------------------------------------------------------------
// Spit projectile (arcing)
// ---------------------------------------------------------------------------

const spitGeo = new THREE.SphereGeometry(0.16, 8, 8);
const spitMat = new THREE.MeshBasicMaterial({ color: 0xa3e635 });

export function createAcidSpit(scene: THREE.Scene, from: THREE.Vector3, toward: THREE.Vector3, damage: number): AcidSpit {
  const mesh = new THREE.Mesh(spitGeo, spitMat);
  mesh.position.copy(from);
  mesh.position.y = 1.55;
  scene.add(mesh);
  const d = toward.clone().sub(from).setY(0);
  const dist = Math.max(1, d.length());
  const flight = THREE.MathUtils.clamp(dist / 11, 0.35, 0.9);
  const vel = d.normalize().multiplyScalar(dist / flight);
  // ballistic: y(t) = 1.55 + vy t - 0.5 g t², lands at t = flight
  const g = 14;
  vel.y = (0.5 * g * flight * flight - 1.55) / flight;
  return { mesh, vel, life: flight + 0.4, damage, ownerKind: 'acid' };
}

/** Advance spits; on landing / hit they leave an acid puddle. */
export function tickAcidSpits(
  spits: AcidSpit[],
  dt: number,
  squad: OperativeVisual[],
  hazards: ZombieHazards,
  damage: (op: OperativeVisual, amount: number, from: THREE.Vector3) => void,
  fx: ZombieCombatFx,
): void {
  for (let i = spits.length - 1; i >= 0; i--) {
    const s = spits[i]!;
    s.life -= dt;
    s.vel.y -= 14 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    let hit = false;
    for (const op of squad) {
      if (!op.alive) continue;
      const p = op.root.position;
      const dx = s.mesh.position.x - p.x;
      const dz = s.mesh.position.z - p.z;
      if (dx * dx + dz * dz < 0.5 && s.mesh.position.y < 2) {
        damage(op, s.damage, s.mesh.position);
        hit = true;
        break;
      }
    }
    if (hit || s.mesh.position.y <= 0.05 || s.life <= 0) {
      fx.spawnHitRing(s.mesh.position, 0x84cc16, 0.06);
      hazards.puddle(s.mesh.position.x, s.mesh.position.z, 1.7, 7);
      s.mesh.removeFromParent();
      spits.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-frame skill motion + impact
// ---------------------------------------------------------------------------

export interface ZombieCombatCtx {
  scene: THREE.Scene;
  squad: OperativeVisual[];
  zombies: ZombieVisual[];
  spits: AcidSpit[];
  hazards: ZombieHazards;
  fx: ZombieCombatFx;
  nowSec: number;
  damageOperative: (op: OperativeVisual, amount: number, from: THREE.Vector3) => boolean;
  /** damage other zombies (bloater blast) */
  damageZombie: (z: ZombieVisual, amount: number, from: THREE.Vector3) => void;
  spawnZombieAt: (kind: ZombieKind, x: number, z: number) => void;
  move: (obj: THREE.Object3D, dx: number, dz: number, radius: number) => void;
  shake: (amount: number) => void;
  playSfx: (z: ZombieVisual, ev: 'attack' | 'death') => void;
}

const _v = new THREE.Vector3();

function knock(op: OperativeVisual, from: THREE.Vector3, dist: number, ctx: ZombieCombatCtx): void {
  _v.copy(op.root.position).sub(from).setY(0);
  if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0);
  _v.normalize().multiplyScalar(dist);
  ctx.move(op.root, _v.x, _v.z, 0.55);
}

function stun(op: OperativeVisual, until: number): void {
  op.root.userData.stunUntil = Math.max((op.root.userData.stunUntil as number | undefined) ?? 0, until);
}

/** Is this operative pinned (grabbed / stunned)? Movement code should respect it. */
export function operativePinned(op: OperativeVisual, nowSec: number): boolean {
  const g = op.root.userData.grabbedBy as ZombieVisual | undefined;
  if (g && g.hp > 0 && g.attackAnim > 0 && g.activeSkill === 'grab') return true;
  if (g) delete op.root.userData.grabbedBy;
  return ((op.root.userData.stunUntil as number | undefined) ?? 0) > nowSec;
}

/** Break a grab (dash / ability). */
export function breakGrab(op: OperativeVisual): void {
  const g = op.root.userData.grabbedBy as ZombieVisual | undefined;
  if (g) {
    g.attackAnim = Math.max(g.attackAnim, 0.97);
    const st = stateOf(g);
    st.grabbed = null;
  }
  delete op.root.userData.grabbedBy;
}

/** Zombie frenzy (screamer buff): speed / damage multiplier. */
export function frenzyMul(z: ZombieVisual, nowSec: number): number {
  const u = (z.root.userData.frenzyUntil as number | undefined) ?? 0;
  const enraged = z.kind === 'boss' && bossPhase(z) === 3 ? 1.3 : 1;
  return (u > nowSec ? 1.35 : 1) * enraged;
}

/**
 * Called every frame while `z.attackAnim > 0`: moves the zombie for charge / leap /
 * lunge / pounce, keeps grabs going, and lands the impact at the right frame.
 */
export function tickZombieAttack(z: ZombieVisual, target: OperativeVisual, dt: number, ctx: ZombieCombatCtx): void {
  const st = stateOf(z);
  const a = z.attackAnim;
  const skill = z.activeSkill;

  // --- motion ------------------------------------------------------------
  if (skill === 'charge' && a > st.impactAt && a < 0.92) {
    const speed = z.kind === 'boss' ? 15 : 13;
    const before = _v.copy(z.root.position);
    const bx = before.x;
    const bz = before.z;
    ctx.move(z.root, st.dir.x * speed * dt, st.dir.z * speed * dt, 0.6);
    const moved = Math.hypot(z.root.position.x - bx, z.root.position.z - bz);
    if (moved < speed * dt * 0.3) z.attackAnim = Math.max(z.attackAnim, 0.92); // hit a wall
    for (const op of ctx.squad) {
      if (!op.alive || st.hitSet.has(op)) continue;
      if (op.root.position.distanceTo(z.root.position) < 1.5) {
        st.hitSet.add(op);
        ctx.damageOperative(op, z.attackDamage * 1.6, z.root.position);
        knock(op, z.root.position, 2.6, ctx);
        stun(op, ctx.nowSec + 0.7);
        ctx.fx.spawnBloodBurst(op.root.position, 1, 0xaa2222);
        ctx.shake(0.4);
      }
    }
  } else if (skill === 'leap') {
    // airborne between 25 % and the landing frame
    const t0 = 0.25;
    const t1 = st.impactAt;
    if (a > t0 && a <= t1) {
      const k = (a - t0) / (t1 - t0);
      z.root.position.x = THREE.MathUtils.lerp(st.from.x, st.to.x, k);
      z.root.position.z = THREE.MathUtils.lerp(st.from.z, st.to.z, k);
      z.root.position.y = Math.sin(k * Math.PI) * 3.2;
    }
  } else if ((skill === 'lunge' || skill === 'pounce') && a < st.impactAt) {
    const reach = skill === 'pounce' ? 3.2 : 2.6;
    const step = (reach / Math.max(0.1, z.attackDuration * st.impactAt)) * dt;
    const d = target.root.position.distanceTo(z.root.position);
    if (d > 0.9) ctx.move(z.root, st.dir.x * step, st.dir.z * step, 0.5);
  }

  // grab: hold the target in front of the zombie, damage over time
  if (skill === 'grab' && st.grabbed) {
    const op = st.grabbed;
    if (!op.alive || z.hp <= 0 || z.hp < st.grabHp - z.maxHp * 0.3) {
      // shot loose
      z.attackAnim = Math.max(z.attackAnim, 0.95);
      delete op.root.userData.grabbedBy;
      st.grabbed = null;
    } else {
      st.tick += dt;
      if (st.tick > 0.5) {
        st.tick = 0;
        ctx.damageOperative(op, Math.max(2, z.attackDamage * 0.55), z.root.position);
        ctx.fx.spawnBloodBurst(op.root.position.clone().setY(1.5), 0.6, 0x991111);
      }
    }
  }

  // --- impact --------------------------------------------------------------
  if (z.attackImpactDone || a < st.impactAt) return;
  z.attackImpactDone = true;
  applyImpact(z, target, ctx);
}

function applyImpact(z: ZombieVisual, target: OperativeVisual, ctx: ZombieCombatCtx): void {
  const st = stateOf(z);
  const skill = z.activeSkill;
  const origin = z.root.position;
  const { fx } = ctx;
  const inReach = (op: OperativeVisual, r: number) => op.alive && op.root.position.distanceTo(origin) <= r;

  switch (skill) {
    case 'spit': {
      ctx.spits.push(createAcidSpit(ctx.scene, origin, target.root.position, z.attackDamage * 0.9));
      return;
    }
    case 'slam':
    case 'leap': {
      if (skill === 'leap') z.root.position.y = 0;
      const r = skill === 'leap' ? 3.4 : slamRadius(z);
      fx.spawnHitRing(origin, 0xef4444, 0.1);
      fx.spawnHitRing(origin, 0xfca5a5, 0.14);
      fx.spawnBloodBurst(origin, z.kind === 'boss' ? 2 : 1.5, 0x3f2a1a);
      ctx.shake(z.kind === 'boss' ? 0.6 : 0.4);
      for (const op of ctx.squad) {
        if (!inReach(op, r)) continue;
        ctx.damageOperative(op, z.attackDamage * (skill === 'leap' ? 1.8 : 1.4), origin);
        knock(op, origin, z.kind === 'boss' ? 2.2 : 1.4, ctx);
        stun(op, ctx.nowSec + 0.45);
      }
      return;
    }
    case 'roar': {
      fx.spawnHitRing(origin, 0xf97316, 0.12);
      fx.spawnHitRing(origin, 0xfdba74, 1.05);
      ctx.shake(0.3);
      for (const op of ctx.squad) {
        if (!inReach(op, z.kind === 'boss' ? 6.5 : 5.2)) continue;
        ctx.damageOperative(op, Math.max(3, z.attackDamage * 0.3), origin);
        slowOperative(op, 0.55, ctx.nowSec + 2.2);
      }
      // boss calls the horde
      if (z.kind === 'boss') {
        const n = 3 + bossPhase(z);
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          ctx.spawnZombieAt(i % 3 === 0 ? 'runner' : 'grunt', origin.x + Math.cos(ang) * 6, origin.z + Math.sin(ang) * 6);
        }
      }
      return;
    }
    case 'shriek': {
      fx.spawnHitRing(origin, 0xd946ef, 0.1);
      fx.spawnHitRing(origin, 0xe879f9, 1.2);
      ctx.shake(0.34);
      for (const op of ctx.squad) {
        if (!inReach(op, 7.5)) continue;
        ctx.damageOperative(op, Math.max(2, z.attackDamage * 0.4), origin);
        slowOperative(op, 0.5, ctx.nowSec + 2.8);
        op.root.userData.fireSlowUntil = ctx.nowSec + 2.8;
        op.root.userData.fireSlowMul = 1.7;
      }
      // frenzy nearby zombies
      for (const other of ctx.zombies) {
        if (other === z || other.hp <= 0) continue;
        if (other.root.position.distanceToSquared(origin) < 81) other.root.userData.frenzyUntil = ctx.nowSec + 5;
      }
      st.shrieks += 1;
      if (st.shrieks % 2 === 1) {
        for (let i = 0; i < 2; i++) {
          const ang = Math.random() * Math.PI * 2;
          ctx.spawnZombieAt('runner', origin.x + Math.cos(ang) * 9, origin.z + Math.sin(ang) * 9);
        }
      }
      return;
    }
    case 'burst': {
      bloaterExplode(z, ctx, 1);
      z.hp = 0; // dies in the blast (caller removes it)
      return;
    }
    case 'grab': {
      if (!inReach(target, 1.7) || target.root.userData.grabbedBy) {
        z.attackAnim = Math.max(z.attackAnim, 0.9); // missed the grab
        return;
      }
      st.grabbed = target;
      st.grabHp = z.hp;
      target.root.userData.grabbedBy = z;
      ctx.damageOperative(target, z.attackDamage * 0.8, origin);
      fx.spawnBloodBurst(target.root.position.clone().setY(1.5), 0.9, 0xaa1111);
      return;
    }
    case 'pounce': {
      if (inReach(target, 1.8)) {
        ctx.damageOperative(target, z.attackDamage * 1.1, origin);
        slowOperative(target, 0.6, ctx.nowSec + 1.6);
        fx.spawnBloodBurst(target.root.position, 0.7, 0xaa2222);
      }
      return;
    }
    case 'charge':
      return; // damage handled during the rush
    case 'lunge': {
      if (inReach(target, 2)) {
        ctx.damageOperative(target, z.attackDamage * 1.25, origin);
        fx.spawnBloodBurst(target.root.position, 0.75, 0xaa2222);
      }
      return;
    }
    default: {
      // claw: needs the target within reach at the hit frame (dodgeable)
      const reach = z.kind === 'boss' ? 3.0 : z.kind === 'tank' ? 2.4 : 1.75;
      if (inReach(target, reach)) {
        const mul = (z.kind === 'tank' || z.kind === 'boss' ? 1.25 : 1) * frenzyDamage(z, ctx.nowSec);
        if (ctx.damageOperative(target, z.attackDamage * mul, origin)) fx.spawnBloodBurst(target.root.position, 0.55, 0xaa2222);
        if (z.kind === 'tank' || z.kind === 'boss') knock(target, origin, 1.1, ctx);
      }
    }
  }
}

const frenzyDamage = (z: ZombieVisual, now: number) => (((z.root.userData.frenzyUntil as number | undefined) ?? 0) > now ? 1.2 : 1);

/** Bloater explosion (attack or death). Hurts operatives and nearby zombies, leaves a toxic cloud. */
export function bloaterExplode(z: ZombieVisual, ctx: ZombieCombatCtx, power: number): void {
  if (z.root.userData.exploded) return;
  z.root.userData.exploded = true;
  const o = z.root.position.clone();
  const r = 3.6;
  ctx.fx.spawnBloodBurst(o, 2.4, 0x4d7c0f);
  ctx.fx.spawnBloodBurst(o, 1.6, 0x7f1d1d);
  ctx.fx.spawnHitRing(o, 0xa3e635, 0.12);
  ctx.fx.spawnHitRing(o, 0xd9f99d, 0.9);
  ctx.shake(0.45);
  for (const op of ctx.squad) {
    if (!op.alive) continue;
    const d = op.root.position.distanceTo(o);
    if (d > r) continue;
    ctx.damageOperative(op, z.attackDamage * 2.6 * power * (1 - (d / r) * 0.5), o);
    knock(op, o, 1.6, ctx);
  }
  for (const other of ctx.zombies) {
    if (other === z || other.hp <= 0) continue;
    if (other.root.position.distanceTo(o) < r) ctx.damageZombie(other, 8 * power, o);
  }
  ctx.hazards.cloud(o.x, o.z, 3.2, 6, 5.5);
  ctx.playSfx(z, 'death');
}

/** Restore moveSpeed / fire-rate after slows. */
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
