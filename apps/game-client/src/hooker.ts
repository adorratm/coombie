import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { ClipSeg } from './zombieAnim';

/**
 * Çengelci (Hooker) — custom-rigged mutant (own 24-bone rig, 8 clips) with the
 * "Ölümcül Çengel" ability: wind-up with a ground warning, then a real hook
 * projectile on a tether. A hit drags the operative back to the hooker.
 */

const BASE = '/zombies/hooker/';
const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
const load = (file: string) => {
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(BASE + file);
    cache.set(file, p);
  }
  return p;
};
export const preloadHooker = () => Promise.all([load('Zombie_Hooker.glb'), load('HookTip.glb'), load('HookTether_Segment.glb'), load('HookWarning.glb')]).catch(() => null);

/** Seg the zombie combat code uses for the hook throw (wind-up 0.8 + cast 0.7 + recover 0.9). */
export const HOOK_SEG: ClipSeg = { clip: 'hookThrow', from: 0, to: 2.4, impact: 0.97 };
export const HOOK_DUR = 2.4;

/** ZombieAnimator-compatible clip player for the hooker rig. */
export class HookerAnimator {
  readonly mixer: THREE.AnimationMixer;
  private readonly acts = new Map<string, THREE.AnimationAction>();
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private act: THREE.AnimationAction | null = null;
  private actW = 0;
  private queue: Array<{ id: string; dur: number }> = [];
  private actLeft = 0;
  private moveW = 0;
  private dead = false;
  private hold = false;
  /** model hook meshes (hidden while the projectile flies) */
  hookMeshes: THREE.Object3D[] = [];

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) {
      const a = this.mixer.clipAction(c);
      if (c.name !== 'Idle' && c.name !== 'Walk') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.acts.set(c.name, a);
    }
    this.idle = this.acts.get('Idle')!;
    this.walk = this.acts.get('Walk')!;
    this.idle.play();
    this.walk.play();
    this.walk.setEffectiveWeight(0);
  }

  private start(id: string, dur: number): void {
    const a = this.acts.get(id);
    if (!a) return;
    if (this.act && this.act !== a) this.act.setEffectiveWeight(0);
    a.reset();
    a.setEffectiveTimeScale(a.getClip().duration / Math.max(0.05, dur));
    a.play();
    this.act = a;
    this.actLeft = dur;
    this.actW = Math.max(this.actW, 0.6);
  }

  play(seg: ClipSeg, duration: number): boolean {
    if (this.dead) return false;
    if (seg.clip === 'hookThrow') {
      const k = duration / HOOK_DUR;
      this.queue = [
        { id: 'HookCast', dur: 0.7 * k },
        { id: 'HookRecover', dur: 0.9 * k },
      ];
      this.start('HookWindup', 0.8 * k);
    } else if (seg.clip === 'hit' || seg.clip === 'hit2') {
      if (this.act && this.actW > 0.3) return false;
      this.queue = [];
      this.start('Hit', 0.6);
    } else {
      this.queue = [];
      this.start('AttackMelee', duration);
    }
    return true;
  }
  hit(): void {
    this.play({ clip: 'hit', from: 0, to: 1, impact: 0 }, 0.6);
  }
  standUp(duration = 2.2): number {
    return duration * 0;
  }
  die(): number {
    this.queue = [];
    this.start('Death', 1.8);
    this.hold = true;
    this.dead = true;
    for (const m of this.hookMeshes) m.visible = true;
    return 1.8;
  }

  update(dt: number, speed: number): void {
    const moving = speed > 0.15;
    this.moveW = THREE.MathUtils.damp(this.moveW, moving ? 1 : 0, 8, dt);
    this.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 1.6, 0.6, 2));
    if (this.act) {
      this.actLeft -= dt;
      if (this.actLeft <= 0 && !this.hold) {
        const next = this.queue.shift();
        if (next) this.start(next.id, next.dur);
        else {
          this.actW = THREE.MathUtils.damp(this.actW, 0, 10, dt);
          if (this.actW < 0.02) {
            this.act.stop();
            this.act = null;
            this.actW = 0;
          }
        }
      } else this.actW = THREE.MathUtils.damp(this.actW, 1, 14, dt);
    }
    const base = 1 - this.actW;
    this.idle.setEffectiveWeight(base * (1 - this.moveW));
    this.walk.setEffectiveWeight(base * this.moveW);
    this.act?.setEffectiveWeight(this.actW);
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}

export interface HookerAvatar {
  root: THREE.Group;
  anim: HookerAnimator;
  spawn: THREE.Object3D | null;
}

/** Instantiate the hooker model scaled to `height`, facing +Z like the other zombies. */
export async function createHookerModel(height = 2.75): Promise<HookerAvatar> {
  const gltf = await load('Zombie_Hooker.glb');
  const inner = cloneSkinned(gltf.scene);
  const root = new THREE.Group();
  root.add(inner);
  inner.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(inner, true);
  const s = height / Math.max(0.1, bb.max.y - bb.min.y);
  inner.scale.setScalar(s);
  // glTF forward is −Z, game zombies face +Z
  inner.rotation.y = Math.PI;
  const anim = new HookerAnimator(inner, gltf.animations);
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
      if (o.name === 'HookTip' || o.name === 'HookTether_Animated') anim.hookMeshes.push(o);
    }
  });
  return { root, anim, spawn: inner.getObjectByName('HookSpawn') ?? null };
}

// ---------------------------------------------------------------------------
// Hook projectile
// ---------------------------------------------------------------------------

interface HookShot {
  owner: ZombieVisual;
  tip: THREE.Object3D;
  tether: THREE.Object3D;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  travelled: number;
  range: number;
  state: 'out' | 'pull' | 'back';
  victim: OperativeVisual | null;
  damage: number;
  t: number;
}

export interface HookCtx {
  scene: THREE.Scene;
  squad: OperativeVisual[];
  damageOperative: (op: OperativeVisual, amount: number, from: THREE.Vector3) => boolean;
  move: (obj: THREE.Object3D, dx: number, dz: number, radius: number) => void;
  onHooked: (op: OperativeVisual) => void;
  blood: (pos: THREE.Vector3) => void;
}

const shots: HookShot[] = [];
let tipProto: THREE.Object3D | null = null;
let tetherProto: THREE.Object3D | null = null;
let warnProto: THREE.Object3D | null = null;
if (typeof document !== 'undefined') void preloadHooker().then((r) => {
  if (!r) return;
  tipProto = r[1].scene;
  tetherProto = r[2].scene;
  warnProto = r[3].scene;
});

const handPos = (z: ZombieVisual, out: THREE.Vector3) => {
  const sp = z.root.userData.hookSpawn as THREE.Object3D | undefined;
  if (sp) sp.getWorldPosition(out);
  else out.copy(z.root.position).setY(1.6);
  return out;
};

/** Ground warning during the wind-up: ring at the hooker + a strip toward the aim. */
export function hookWarning(scene: THREE.Scene, z: ZombieVisual, dir: THREE.Vector3, range: number, dur: number): void {
  const g = new THREE.Group();
  if (warnProto) {
    const w = warnProto.clone();
    w.scale.setScalar(1.3);
    g.add(w);
  }
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.9, range), new THREE.MeshBasicMaterial({ color: 0xc8281e, transparent: true, opacity: 0.28, depthWrite: false }));
  strip.rotation.x = -Math.PI / 2;
  strip.position.z = range / 2;
  g.add(strip);
  g.position.set(z.root.position.x, 0.05, z.root.position.z);
  g.rotation.y = Math.atan2(dir.x, dir.z);
  scene.add(g);
  const until = performance.now() + dur * 1000;
  const tick = () => {
    const left = (until - performance.now()) / 1000;
    (strip.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.15 * Math.abs(Math.sin(left * 10));
    if (left <= 0 || z.hp <= 0) {
      g.removeFromParent();
      strip.geometry.dispose();
      (strip.material as THREE.Material).dispose();
      return;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

export function fireHook(z: ZombieVisual, dir: THREE.Vector3, scene: THREE.Scene, damage: number): void {
  const tip = tipProto ? tipProto.clone() : new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xc8b890 }));
  tip.scale.setScalar(1.4);
  const tether = tetherProto ? tetherProto.clone() : new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), new THREE.MeshStandardMaterial({ color: 0x5a1a14 }));
  const pos = handPos(z, new THREE.Vector3());
  tip.position.copy(pos);
  scene.add(tip, tether);
  const anim = z.root.userData.hookerAnim as HookerAnimator | undefined;
  anim?.hookMeshes.forEach((m) => (m.visible = false));
  shots.push({ owner: z, tip, tether, pos, dir: dir.clone().setY(0).normalize(), travelled: 0, range: 14, state: 'out', victim: null, damage, t: 0 });
}

const _h = new THREE.Vector3();
const _q = new THREE.Vector3();
export function tickHooks(dt: number, ctx: HookCtx): void {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]!;
    s.t += dt;
    const hand = handPos(s.owner, _h);
    if (s.state === 'out') {
      const step = 26 * dt;
      s.pos.addScaledVector(s.dir, step);
      s.pos.y = THREE.MathUtils.lerp(s.pos.y, 1.1, 0.2);
      s.travelled += step;
      for (const op of ctx.squad) {
        if (!op.alive) continue;
        const dx = op.root.position.x - s.pos.x;
        const dz = op.root.position.z - s.pos.z;
        if (dx * dx + dz * dz < 0.95 * 0.95) {
          s.state = 'pull';
          s.victim = op;
          ctx.damageOperative(op, s.damage, s.owner.root.position);
          ctx.blood(op.root.position.clone().setY(1.2));
          ctx.onHooked(op);
          op.root.userData.stunUntil = Math.max((op.root.userData.stunUntil as number | undefined) ?? 0, performance.now() / 1000 + 1.0);
          break;
        }
      }
      if (s.state === 'out' && (s.travelled >= s.range || s.owner.hp <= 0)) s.state = 'back';
    } else if (s.state === 'pull' && s.victim) {
      const op = s.victim;
      _q.copy(s.owner.root.position).sub(op.root.position).setY(0);
      const d = _q.length();
      if (d < 1.9 || s.owner.hp <= 0 || !op.alive || s.t > 2.5) s.state = 'back';
      else {
        _q.normalize().multiplyScalar(Math.min(d - 1.8, 15 * dt));
        ctx.move(op.root, _q.x, _q.z, 0.45);
      }
      s.pos.copy(op.root.position).setY(1.1);
    } else {
      _q.copy(hand).sub(s.pos);
      const d = _q.length();
      if (d < 0.6 || s.owner.hp <= 0) {
        s.tip.removeFromParent();
        s.tether.removeFromParent();
        const anim = s.owner.root.userData.hookerAnim as HookerAnimator | undefined;
        anim?.hookMeshes.forEach((m) => (m.visible = true));
        shots.splice(i, 1);
        continue;
      }
      s.pos.addScaledVector(_q.normalize(), Math.min(d, 24 * dt));
    }
    // place tip + stretch the tether from the hand to the tip
    s.tip.position.copy(s.pos);
    s.tip.lookAt(hand); // local −Z (fire axis) points away from the hand
    const len = hand.distanceTo(s.pos);
    s.tether.position.copy(hand);
    s.tether.lookAt(s.pos);
    if (tetherProto) {
      // segment's long axis is −Z after import, 1 m long
      s.tether.rotateY(Math.PI);
      s.tether.scale.set(1.3, 1.3, len);
    } else {
      s.tether.rotateX(Math.PI / 2);
      s.tether.scale.set(1, len, 1);
      s.tether.position.lerpVectors(hand, s.pos, 0.5);
    }
  }
}

export function clearHooks(): void {
  for (const s of shots) {
    s.tip.removeFromParent();
    s.tether.removeFromParent();
  }
  shots.length = 0;
}
