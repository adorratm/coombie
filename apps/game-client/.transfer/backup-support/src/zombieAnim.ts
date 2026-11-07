import * as THREE from 'three';
import type { RetargetedSet } from './animLibrary';
import type { ZombieKind } from './zombieKinds';

/**
 * Clip-driven zombie animation (Mixamo "Scary Zombie", "Not So Scary Zombie" and
 * "Creature" packs, retargeted to the Rocketbox rigs).
 *
 * One base layer (idle ↔ locomotion, played at a rate matched to the zombie's real
 * ground speed) plus one full-body action slot (attack / hit / spawn / death) that
 * takes weight from the base. Weights always sum to 1 so no bone falls back to the
 * T-pose.
 */

export const ZOMBIE_ANIM_URL = '/anims/zombie.anim.json';

/** A slice of a clip played as a one-shot; `impact` is the hit moment (seconds into the clip). */
export interface ClipSeg {
  clip: string;
  from: number;
  to: number;
  impact: number;
}

export const SEG = {
  swipe: { clip: 'attack', from: 0.3, to: 1.75, impact: 1.1 },
  punch: { clip: 'punch', from: 0.15, to: 0.97, impact: 0.6 },
  kick: { clip: 'kick', from: 0.2, to: 1.4, impact: 0.72 },
  headbutt: { clip: 'headbutt', from: 0.5, to: 1.75, impact: 1.2 },
  neckBite: { clip: 'neckBite', from: 0.25, to: 3.4, impact: 0.85 },
  scream: { clip: 'scream', from: 0.2, to: 2.6, impact: 0.95 },
  mSwipe: { clip: 'mSwipe', from: 0.5, to: 1.95, impact: 1.25 },
  mJump: { clip: 'mJump', from: 0.6, to: 2.7, impact: 1.93 },
  mRoar: { clip: 'mRoar', from: 1.0, to: 3.6, impact: 2.1 },
  crawlLunge: { clip: 'crawlRun', from: 0, to: 0.63, impact: 0.4 },
  hit: { clip: 'hit', from: 0, to: 1.2, impact: 0 },
  hit2: { clip: 'hit2', from: 0, to: 1.2, impact: 0 },
} satisfies Record<string, ClipSeg>;
export type SegId = keyof typeof SEG;

interface LocoDef {
  idle: string[];
  move: string[];
  /** used when the zombie moves faster than ~3.2 m/s */
  fast?: string[];
  death: string[];
}
const LOCO: Record<ZombieKind, LocoDef> = {
  grunt: { idle: ['idle', 'idle2'], move: ['walk', 'walk2'], fast: ['run2'], death: ['death', 'death2', 'stumble'] },
  runner: { idle: ['idle'], move: ['run', 'run2'], death: ['death', 'stumble'] },
  crawler: { idle: ['crawl'], move: ['crawl'], fast: ['crawlRun'], death: ['death2'] },
  tank: { idle: ['mIdle'], move: ['mWalk'], fast: ['mRun'], death: ['mDeath'] },
  boss: { idle: ['mIdle'], move: ['mWalk'], fast: ['mRun'], death: ['mDeath'] },
  acid: { idle: ['idle2'], move: ['walk2'], fast: ['run2'], death: ['death2', 'death'] },
  screamer: { idle: ['idle'], move: ['walk2', 'walk'], fast: ['run'], death: ['death', 'death2'] },
  bloater: { idle: ['idle'], move: ['walk'], death: ['death2'] },
};

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

export class ZombieAnimator {
  readonly mixer: THREE.AnimationMixer;
  private readonly clips: RetargetedSet;
  private readonly idle: THREE.AnimationAction;
  private readonly move: THREE.AnimationAction;
  private readonly fast: THREE.AnimationAction | null;
  private readonly moveSpeed: number;
  private readonly fastSpeed: number;
  private readonly deathIds: string[];
  private moveW = 0;
  private fastW = 0;
  private act: THREE.AnimationAction | null = null;
  private actW = 0;
  private actEnd = 0;
  private actHold = false;
  private actPriority = 0;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  dead = false;

  static supports(clips: RetargetedSet, kind: ZombieKind): boolean {
    const d = LOCO[kind] ?? LOCO.grunt;
    return d.idle.every((c) => clips.has(c)) && d.move.every((c) => clips.has(c));
  }

  constructor(root: THREE.Object3D, clips: RetargetedSet, kind: ZombieKind) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = clips;
    const d = LOCO[kind] ?? LOCO.grunt;
    const loop = (id: string) => {
      const a = this.mixer.clipAction(clips.get(id)!.clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
      a.time = Math.random() * a.getClip().duration;
      a.setEffectiveWeight(0);
      return a;
    };
    const idleId = pick(d.idle);
    const moveId = pick(d.move);
    this.idle = loop(idleId);
    this.idle.setEffectiveWeight(1);
    this.move = idleId === moveId ? this.mixer.clipAction(clips.get(moveId)!.clip.clone()) : loop(moveId);
    if (idleId === moveId) {
      this.move.setLoop(THREE.LoopRepeat, Infinity);
      this.move.play();
      this.move.setEffectiveWeight(0);
    }
    const fastId = d.fast?.find((c) => clips.has(c));
    this.fast = fastId ? loop(fastId) : null;
    this.moveSpeed = Math.max(0.3, clips.get(moveId)!.speed);
    this.fastSpeed = fastId ? Math.max(0.5, clips.get(fastId)!.speed) : this.moveSpeed;
    this.deathIds = d.death.filter((c) => clips.has(c));
  }

  private oneShot(id: string): THREE.AnimationAction | null {
    let a = this.actions.get(id);
    if (a) return a;
    const rc = this.clips.get(id);
    if (!rc) return null;
    a = this.mixer.clipAction(rc.clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.actions.set(id, a);
    return a;
  }

  /** Full-body one-shot over `duration` seconds of game time. Returns false if the clip is missing. */
  play(seg: ClipSeg, duration: number, priority = 1, hold = false): boolean {
    if (this.dead) return false;
    if (this.act && this.actW > 0.05 && priority < this.actPriority) return false;
    const a = this.oneShot(seg.clip);
    if (!a) return false;
    if (this.act && this.act !== a) this.act.setEffectiveWeight(0);
    const len = Math.max(0.05, seg.to - seg.from);
    const rate = len / Math.max(0.05, duration);
    a.reset();
    a.time = seg.from;
    a.setEffectiveTimeScale(rate);
    a.setEffectiveWeight(this.act === a ? this.actW : 0);
    a.play();
    if (this.act !== a) this.actW = Math.min(this.actW, 0.35);
    this.act = a;
    this.actEnd = seg.to;
    this.actHold = hold;
    this.actPriority = priority;
    return true;
  }

  hit(): void {
    if (this.act && this.actW > 0.2 && this.actPriority >= 1) return; // don't cancel an attack
    this.play(Math.random() < 0.5 ? SEG.hit : SEG.hit2, 0.55, 0);
  }

  /** Spawn emergence (lying on the ground → standing). Seconds. */
  standUp(duration = 2.2): number {
    const a = this.oneShot('standUp');
    if (!a) return 0;
    this.play({ clip: 'standUp', from: 0.15, to: 3.1, impact: 0 }, duration, 3);
    this.actW = 1;
    return duration;
  }

  /** Death: plays and holds the final frame. Returns the clip's game-time length. */
  die(): number {
    const id = this.deathIds.length ? pick(this.deathIds) : null;
    const rc = id ? this.clips.get(id) : null;
    if (!id || !rc) {
      this.dead = true;
      return 0;
    }
    const dur = rc.clip.duration / 1.15;
    this.play({ clip: id, from: 0, to: rc.clip.duration, impact: 0 }, dur, 9, true);
    this.dead = true;
    return dur;
  }

  /** speed: current ground speed (m/s, model scale applied by caller). */
  update(dt: number, speed: number, worldScale: number): void {
    const moving = speed > 0.15;
    const s = speed / Math.max(0.2, worldScale);
    const useFast = !!this.fast && s > this.moveSpeed * 1.9;
    this.moveW = THREE.MathUtils.damp(this.moveW, moving ? 1 : 0, 8, dt);
    this.fastW = THREE.MathUtils.damp(this.fastW, useFast ? 1 : 0, 6, dt);
    this.move.setEffectiveTimeScale(THREE.MathUtils.clamp(s / this.moveSpeed, 0.6, 2.2));
    this.fast?.setEffectiveTimeScale(THREE.MathUtils.clamp(s / this.fastSpeed, 0.7, 1.8));

    // action envelope
    if (this.act) {
      const ending = !this.actHold && this.act.time >= this.actEnd - 0.08 * this.act.getEffectiveTimeScale();
      const target = ending ? 0 : 1;
      this.actW = THREE.MathUtils.damp(this.actW, target, ending ? 10 : 14, dt);
      if (ending && this.actW < 0.02) {
        this.act.setEffectiveWeight(0);
        this.act.stop();
        this.act = null;
        this.actW = 0;
        this.actPriority = 0;
      } else if (!this.actHold && this.act.time >= this.actEnd) {
        this.act.paused = true;
      }
    }
    const base = 1 - this.actW;
    const fastW = this.fast ? this.fastW * this.moveW : 0;
    this.idle.setEffectiveWeight(base * (1 - this.moveW));
    this.move.setEffectiveWeight(base * (this.moveW - fastW));
    this.fast?.setEffectiveWeight(base * fastW);
    this.act?.setEffectiveWeight(this.actW);
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
