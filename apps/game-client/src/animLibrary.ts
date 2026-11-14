import { MELEE_STYLES, type MeleeStyle } from './meleeStyles';
import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Mixamo-sourced animation library in VRM *normalized* humanoid space.
 * Built offline by `scripts/build-mixamo-anims.mjs` → `public/anims/*.anim.json`.
 *
 * Because normalized humanoid space has an identity T-pose rest, one library
 * drives every VRM. Retargeting per model only needs the VRM0 axis flip and the
 * hips-height scale, and is cached per model URL.
 */

export interface AnimTrackJson {
  t: number[];
  q: number[];
}

export interface AnimClipJson {
  duration: number;
  loop: boolean;
  /** Natural travel speed in hips-heights / second (0 for in-place clips). */
  speed: number;
  tracks: Record<string, AnimTrackJson>;
  hipsPos: { t: number[]; v: number[] } | null;
}

export interface AnimLibraryJson {
  version: number;
  space: 'vrm-normalized';
  clips: Record<string, AnimClipJson>;
}

export interface RetargetedClip {
  clip: THREE.AnimationClip;
  /** Upper-body only copy (spine and above) for layering over locomotion. */
  upper: THREE.AnimationClip;
  loop: boolean;
  /** Natural travel speed in world units / second for this model. */
  speed: number;
}

export type RetargetedSet = Map<string, RetargetedClip>;

const UPPER_BONES = new Set<string>([
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
]);
const isUpperBone = (b: string) => UPPER_BONES.has(b) || /Thumb|Index|Middle|Ring|Little/.test(b);

const libCache = new Map<string, Promise<AnimLibraryJson | null>>();

export function loadAnimLibrary(url: string): Promise<AnimLibraryJson | null> {
  let job = libCache.get(url);
  if (!job) {
    job = fetch(url, { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`${url} ${r.status}`);
        return r.json() as Promise<AnimLibraryJson>;
      })
      .catch((err) => {
        console.warn('[anim] library load failed — falling back to procedural pose', url, err);
        return null;
      });
    libCache.set(url, job);
  }
  return job;
}

/** Synchronous peek so avatar construction never waits on the network. */
const libResolved = new Map<string, AnimLibraryJson | null>();
export function animLibraryIfReady(url: string): AnimLibraryJson | null | undefined {
  if (libResolved.has(url)) return libResolved.get(url);
  void loadAnimLibrary(url).then((lib) => libResolved.set(url, lib));
  return undefined;
}

const retargetCache = new Map<string, RetargetedSet>();
const _v = new THREE.Vector3();

function hipsHeightOf(vrm: VRM): number {
  const hinted = (vrm as unknown as { hipsHeight?: number }).hipsHeight;
  if (typeof hinted === 'number') return hinted;
  const hips = vrm.humanoid?.getNormalizedBoneNode('hips' as VRMHumanBoneName);
  if (!hips) return 1;
  vrm.scene.updateMatrixWorld(true);
  const hipsY = hips.getWorldPosition(_v).y;
  const rootY = vrm.scene.getWorldPosition(_v).y;
  return Math.max(0.2, Math.abs(hipsY - rootY));
}

/**
 * Build THREE clips bound to this VRM's normalized bone nodes.
 * `cacheKey` should be the model URL + scale so clones share the result.
 */
export function retargetLibrary(vrm: VRM, lib: AnimLibraryJson, cacheKey: string): RetargetedSet {
  const cached = retargetCache.get(cacheKey);
  if (cached) return cached;

  const isVrm0 = vrm.meta?.metaVersion === '0';
  const hipsH = hipsHeightOf(vrm);
  const set: RetargetedSet = new Map();

  for (const [id, c] of Object.entries(lib.clips)) {
    const full: THREE.KeyframeTrack[] = [];
    const upper: THREE.KeyframeTrack[] = [];
    for (const [boneName, tr] of Object.entries(c.tracks)) {
      // an empty track makes three.js throw, and one throw used to drop every clip for the
      // character (procedural fallback pose: arms and gun up). Skip it instead.
      if (!tr.t?.length || tr.q.length !== tr.t.length * 4) continue;
      const node = vrm.humanoid?.getNormalizedBoneNode(boneName as VRMHumanBoneName);
      if (!node) continue;
      const values = isVrm0 ? tr.q.map((v, i) => (i % 2 === 0 ? -v : v)) : tr.q;
      const track = new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, tr.t, values);
      full.push(track);
      if (isUpperBone(boneName)) upper.push(track);
    }
    if (c.hipsPos) {
      const node = vrm.humanoid?.getNormalizedBoneNode('hips' as VRMHumanBoneName);
      if (node) {
        const values = c.hipsPos.v.map((v, i) => (isVrm0 && i % 3 !== 1 ? -v : v) * hipsH);
        if (c.hipsPos.t.length) full.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, c.hipsPos.t, values));
      }
    }
    set.set(id, {
      clip: new THREE.AnimationClip(id, c.duration, full),
      upper: new THREE.AnimationClip(`${id}#upper`, c.duration, upper),
      loop: c.loop,
      speed: c.speed * hipsH,
    });
  }
  retargetCache.set(cacheKey, set);
  return set;
}

// ---------------------------------------------------------------------------
// Operative animator — directional locomotion + layered upper-body actions
// ---------------------------------------------------------------------------

export interface OperativeAnimInput {
  /** Velocity in the character's local frame (x = left, z = forward), units/s. */
  localVelX: number;
  localVelZ: number;
  /** Fire / hit / ability serials: a change triggers the one-shot. */
  shotSerial: number;
  hitSerial: number;
  abilitySerial: number;
  /** optional: dash (jump clip) / cast (fast toss) one-shots */
  dashSerial?: number;
  castSerial?: number;
  /** melee weapon equipped: "shot" plays an overhead swing instead of the rifle fire clip */
  melee?: boolean;
  /** which swing the equipped melee weapon uses, and how long one swing may take */
  meleeStyle?: MeleeStyle;
  meleeSeconds?: number;
  reloading: boolean;
  /** Seconds the weapon takes to reload (scales the reload clip). */
  reloadTime: number;
  alive: boolean;
}

const LOCO_WALK = ['walk', 'walkBack', 'strafeLeft', 'strafeRight'] as const;
const LOCO_RUN = ['run', 'runBack', 'runStrafeLeft', 'runStrafeRight'] as const;
const LOCO_ALL = ['idle', ...LOCO_WALK, ...LOCO_RUN];

interface Overlay {
  id: string;
  action: THREE.AnimationAction;
  rate: number;
  peak: number;
  active: boolean;
  /** hold at full weight (reload while timer runs) */
  hold: boolean;
}

/**
 * Clips are split into a lower half (hips + legs) and an upper half (spine up).
 * Locomotion drives both halves; upper overlays (aim, fire, reload, hit, ability)
 * take weight away from the locomotion upper half so per-bone weights always sum
 * to 1 — a true override instead of AnimationMixer's normalized average.
 */
export class OperativeAnimator {
  readonly mixer: THREE.AnimationMixer;
  private readonly clips: RetargetedSet;
  private readonly lower = new Map<string, THREE.AnimationAction>();
  private readonly upper = new Map<string, THREE.AnimationAction>();
  private readonly overlays = new Map<string, Overlay>();
  private moveBlend = 0;
  private runBlend = 0;
  private dir = { f: 1, b: 0, l: 0, r: 0 };
  private cyclePhase = 0;
  private aimW = 0;
  private aimHold = 0;
  /** 0..1 how much the upper body is busy with reload / ability / jump (support hand off the gun) */
  freeHand = 0;
  private last = { shot: 0, hit: 0, ability: 0, dash: 0, cast: 0 };
  private death: THREE.AnimationAction | null = null;
  private deathW = 0;

  constructor(root: THREE.Object3D, clips: RetargetedSet) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = clips;
    for (const id of LOCO_ALL) {
      const rc = clips.get(id);
      if (!rc) continue;
      const lowerTracks = rc.clip.tracks.filter((t) => !rc.upper.tracks.includes(t));
      const lo = this.mixer.clipAction(new THREE.AnimationClip(`${id}#lower`, rc.clip.duration, lowerTracks));
      const up = this.mixer.clipAction(rc.upper);
      for (const a of [lo, up]) {
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.setEffectiveTimeScale(0); // phase is driven manually (sync group)
        a.setEffectiveWeight(0);
        a.play();
      }
      this.lower.set(id, lo);
      this.upper.set(id, up);
    }
    // aim layer = idle upper half on its own action so it can override run/walk carry
    const idle = clips.get('idle');
    if (idle) this.addOverlay('aim', idle.upper, true);
    for (const id of ['fire', 'reload', 'hit', 'ability', 'jump']) {
      const rc = clips.get(id);
      if (rc) this.addOverlay(id, rc.upper, false);
    }
  }

  private addOverlay(id: string, clip: THREE.AnimationClip, loop: boolean): void {
    // a distinct clip object so it doesn't share an action with the locomotion upper half
    const c = id === 'aim' ? new THREE.AnimationClip('aim#upper', clip.duration, clip.tracks) : clip;
    const action = this.mixer.clipAction(c);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(0);
    if (loop) action.play();
    this.overlays.set(id, { id, action, rate: 1, peak: 1, active: loop, hold: false });
  }

  static supports(clips: RetargetedSet): boolean {
    return clips.has('idle') && clips.has('run');
  }

  private trigger(id: string, rate: number, peak: number, hold = false): void {
    const o = this.overlays.get(id);
    if (!o) return;
    o.rate = rate;
    o.peak = peak;
    o.hold = hold;
    o.active = true;
    o.action.reset();
    o.action.setEffectiveTimeScale(rate);
    o.action.play();
  }

  /** 0→1→0 envelope from the action's own clock: short fade in, fade out near the end. */
  private envelope(o: Overlay, fadeIn: number, fadeOut: number): number {
    if (!o.active) return 0;
    const dur = o.action.getClip().duration;
    const t = o.action.time;
    const tin = Math.min(1, t / Math.max(0.001, fadeIn * o.rate));
    const remain = (dur - t) / Math.max(0.01, o.rate);
    if (o.hold) return tin;
    const tout = Math.min(1, remain / fadeOut);
    if (remain <= 0.001) {
      o.active = false;
      return 0;
    }
    return tin * tout;
  }

  update(dt: number, inp: OperativeAnimInput): void {
    const speed = inp.alive ? Math.hypot(inp.localVelX, inp.localVelZ) : 0;
    const moving = speed > 0.35;
    this.moveBlend = THREE.MathUtils.damp(this.moveBlend, moving ? 1 : 0, moving ? 9 : 6, dt);
    const runTarget = THREE.MathUtils.clamp((speed - 2.2) / 2.0, 0, 1);
    this.runBlend = THREE.MathUtils.damp(this.runBlend, runTarget, 6, dt);

    if (moving) {
      const nx = inp.localVelX / speed;
      const nz = inp.localVelZ / speed;
      const tf = Math.max(0, nz) ** 2;
      const tb = Math.max(0, -nz) ** 2;
      const tl = Math.max(0, nx) ** 2;
      const tr = Math.max(0, -nx) ** 2;
      const k = 10;
      this.dir.f = THREE.MathUtils.damp(this.dir.f, tf, k, dt);
      this.dir.b = THREE.MathUtils.damp(this.dir.b, tb, k, dt);
      this.dir.l = THREE.MathUtils.damp(this.dir.l, tl, k, dt);
      this.dir.r = THREE.MathUtils.damp(this.dir.r, tr, k, dt);
    }
    const dirW = [this.dir.f, this.dir.b, this.dir.l, this.dir.r];
    const dirSum = dirW.reduce((a, b) => a + b, 0) || 1;

    // Sync group: every locomotion loop shares one normalized phase so feet never desync.
    const ref = this.clips.get(this.runBlend > 0.5 ? 'run' : 'walk') ?? this.clips.get('run')!;
    const natural = Math.max(0.3, ref.speed);
    const playRate = THREE.MathUtils.clamp(speed / natural, 0.8, 1.6);
    this.cyclePhase = (this.cyclePhase + (dt * playRate) / Math.max(0.2, ref.clip.duration)) % 1;

    // --- overlay triggers ----------------------------------------------------
    if (inp.shotSerial !== this.last.shot) {
      this.last.shot = inp.shotSerial;
      this.aimHold = 1.1;
      if (inp.melee) {
        const seg = MELEE_STYLES[inp.meleeStyle ?? 'swing'].clip;
        if (!this.playAction(seg.id, seg.from, seg.to, inp.meleeSeconds ?? seg.dur)) this.trigger('ability', 3.2, 1);
      }
      else if (!inp.reloading) this.trigger('fire', 1.6, 0.55);
    }
    const reload = this.overlays.get('reload');
    if (reload) {
      if (inp.reloading && !reload.hold) {
        const dur = reload.action.getClip().duration;
        this.trigger('reload', dur / Math.max(0.3, inp.reloadTime), 1, true);
      } else if (!inp.reloading && reload.hold) {
        reload.hold = false; // envelope fades it out from here
        const rem = reload.action.getClip().duration - reload.action.time;
        if (rem > 0.25) reload.action.time = reload.action.getClip().duration - 0.2 * reload.rate;
      }
    }
    if (inp.hitSerial !== this.last.hit) {
      this.last.hit = inp.hitSerial;
      this.trigger('hit', 1.3, 0.7);
    }
    if (inp.abilitySerial !== this.last.ability) {
      this.last.ability = inp.abilitySerial;
      this.trigger('ability', 2.2, 1);
    }
    if ((inp.castSerial ?? 0) !== this.last.cast) {
      this.last.cast = inp.castSerial ?? 0;
      this.trigger('ability', 3.4, 0.9);
    }
    if ((inp.dashSerial ?? 0) !== this.last.dash) {
      this.last.dash = inp.dashSerial ?? 0;
      if (!this.playAction('castRoll', 0.15, 1.9, 0.62)) this.trigger('jump', 1.8, 1);
    }

    // --- overlay weights (priority: reload > ability > hit > fire > aim) -------
    this.aimHold = Math.max(0, this.aimHold - dt);
    this.aimW = THREE.MathUtils.damp(this.aimW, this.aimHold > 0 && inp.alive ? 1 : 0.35, 8, dt);
    const want: Array<[string, number]> = [
      ['reload', reload ? this.envelope(reload, 0.12, 0.2) * reload.peak : 0],
      ['jump', this.ov('jump', 0.04, 0.15)],
      ['ability', this.ov('ability', 0.08, 0.2)],
      ['hit', this.ov('hit', 0.04, 0.15)],
      ['fire', this.ov('fire', 0.02, 0.08)],
      ['aim', this.overlays.has('aim') ? this.aimW : 0],
    ];
    let budget = 1;
    for (const [id, w] of want) {
      const o = this.overlays.get(id);
      if (!o) continue;
      const take = Math.min(budget, Math.max(0, w));
      o.action.setEffectiveWeight(take);
      budget -= take;
    }
    const locoUpperScale = budget; // what the overlays left for the locomotion upper half
    this.freeHand = Math.min(1, (want[0]![1] ?? 0) + (want[1]![1] ?? 0) + (want[2]![1] ?? 0));

    const setLoco = (ids: readonly string[], layerW: number) => {
      ids.forEach((id, i) => {
        const w = this.moveBlend * layerW * (dirW[i]! / dirSum);
        for (const [map, scale] of [[this.lower, 1], [this.upper, locoUpperScale]] as const) {
          const a = map.get(id);
          if (!a) continue;
          a.time = this.cyclePhase * a.getClip().duration;
          a.setEffectiveWeight(w * scale);
        }
      });
    };
    setLoco(LOCO_WALK, 1 - this.runBlend);
    setLoco(LOCO_RUN, this.runBlend);
    const idleLo = this.lower.get('idle');
    const idleUp = this.upper.get('idle');
    if (idleLo && idleUp) {
      idleLo.setEffectiveTimeScale(1);
      idleUp.time = idleLo.time;
      idleLo.setEffectiveWeight(1 - this.moveBlend);
      idleUp.setEffectiveWeight((1 - this.moveBlend) * locoUpperScale);
    }

    this.applyAction(dt);
    this.applyDeath(dt);
    this.mixer.update(dt);
  }

  private ov(id: string, fi: number, fo: number): number {
    const o = this.overlays.get(id);
    return o ? this.envelope(o, fi, fo) * o.peak : 0;
  }

  /** Full-body death (random variant); holds the last frame until revive(). */
  die(): void {
    if (this.death) return;
    const ids = ['deathA', 'deathC', 'deathD', 'deathE'].filter((id) => this.clips.has(id));
    if (!ids.length) return;
    const rc = this.clips.get(ids[Math.floor(Math.random() * ids.length)]!)!;
    const a = this.mixer.clipAction(rc.clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.reset();
    a.setEffectiveTimeScale(1.1);
    a.setEffectiveWeight(0);
    a.play();
    this.death = a;
    this.deathW = 0;
  }

  get dying(): boolean {
    return !!this.death;
  }

  revive(): void {
    if (!this.death) return;
    this.death.stop();
    this.death.setEffectiveWeight(0);
    this.death = null;
    this.deathW = 0;
  }

  // ---- full-body actions (ability casts, rolls, knock-downs) -------------
  private act: THREE.AnimationAction | null = null;
  private actW = 0;
  private actEnd = 0;
  private actQueue: Array<{ id: string; from: number; to: number; dur: number }> = [];

  /** Full-body one-shot: clip slice [from,to] played over `dur` game seconds; `then` chains more. */
  playAction(id: string, from: number, to: number, dur: number, then: Array<{ id: string; from: number; to: number; dur: number }> = []): boolean {
    if (this.death) return false;
    const rc = this.clips.get(id);
    if (!rc) return false;
    let a = this.actionCache.get(id);
    if (!a) {
      a = this.mixer.clipAction(rc.clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      this.actionCache.set(id, a);
    }
    if (this.act && this.act !== a) {
      // hand the weight over to the new clip
      this.act.stop();
      this.act.setEffectiveWeight(0);
    }
    const end = Math.min(to, rc.clip.duration);
    a.reset();
    a.time = Math.max(0, from);
    a.setEffectiveTimeScale(Math.max(0.05, end - from) / Math.max(0.05, dur));
    a.setEffectiveWeight(this.actW);
    a.play();
    this.act = a;
    this.actEnd = end;
    this.actQueue = then;
    return true;
  }

  get acting(): number {
    return this.actW;
  }

  private readonly actionCache = new Map<string, THREE.AnimationAction>();

  private applyAction(dt: number): void {
    if (!this.act && this.actW <= 0) return;
    if (this.act) {
      const ending = this.act.time >= this.actEnd - 0.12 * this.act.getEffectiveTimeScale();
      if (ending && this.actQueue.length) {
        const n = this.actQueue.shift()!;
        const rest = this.actQueue;
        this.playAction(n.id, n.from, n.to, n.dur, rest);
      } else if (this.act.time >= this.actEnd) {
        this.act.paused = true;
      }
      const target = ending && !this.actQueue.length ? 0 : 1;
      this.actW = THREE.MathUtils.damp(this.actW, target, target ? 16 : 9, dt);
      if (target === 0 && this.actW < 0.02) {
        this.act.stop();
        this.act.setEffectiveWeight(0);
        this.act = null;
        this.actW = 0;
        return;
      }
    }
    const keep = 1 - this.actW;
    for (const a of [...this.lower.values(), ...this.upper.values(), ...[...this.overlays.values()].map((o) => o.action)]) {
      a.setEffectiveWeight(a.getEffectiveWeight() * keep);
    }
    this.act?.setEffectiveWeight(this.actW);
    this.freeHand = Math.max(this.freeHand, this.actW);
  }

  /** Scale every other action down while the death clip fades in (weights keep summing to 1). */
  private applyDeath(dt: number): void {
    if (!this.death) return;
    if (this.act) {
      this.act.stop();
      this.act = null;
      this.actW = 0;
    }
    this.deathW = THREE.MathUtils.damp(this.deathW, 1, 12, dt);
    const keep = 1 - this.deathW;
    for (const a of [...this.lower.values(), ...this.upper.values(), ...[...this.overlays.values()].map((o) => o.action)]) {
      a.setEffectiveWeight(a.getEffectiveWeight() * keep);
    }
    this.death.setEffectiveWeight(this.deathW);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}

/** Operator animation library shipped in public/anims. */
export const OPERATOR_ANIM_URL = '/anims/operator.anim.json';
// warm the cache in the browser only: on a server render there is no origin to fetch from
if (typeof document !== 'undefined') void loadAnimLibrary(OPERATOR_ANIM_URL);
