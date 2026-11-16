import type { NetHero, NetZombie } from '@protocol-z/shared';

/**
 * Guest-side smoothing.
 *
 * Snapshots arrive ~15 Hz over a TCP websocket, so they come late and in bursts. The guest
 * draws the world slightly in the past and blends between the two snapshots around that
 * moment. Three things keep that smooth on a real connection:
 *
 *  - the delay adapts to the measured jitter (a clean LAN plays ~90 ms behind, a bad mobile
 *    link a few hundred) instead of a fixed number that is too long for one and too short
 *    for the other;
 *  - the render clock is its own clock: it runs at local speed and is only nudged (± a few
 *    percent) toward where it should be, so a late or early packet never makes the world
 *    jump or stall;
 *  - when the buffer runs dry the world keeps moving on its last velocity for a moment
 *    (dead reckoning) before it holds still.
 *
 * `sample()` reuses its output objects: read them in the same frame, do not keep them.
 */

/** delay on a perfect link (also the value older call sites / tests assume as "typical") */
export const INTERP_DELAY = 0.09;
const MIN_DELAY = 0.07;
const MAX_DELAY = 0.4;
/** keep moving on the last velocity this long after the newest snapshot … */
const MAX_EXTRAPOLATE = 0.14;
/** … and let the render clock run at most this far past it */
const MAX_HOLD = 0.5;
/** the render clock may run this much faster / slower than real time to catch up */
const MAX_WARP = 0.12;
/** a bigger disagreement than this is a pause / tab switch: jump instead of chasing it */
const RESYNC = 0.75;
/** an entity that moved further than this between two snapshots teleported: do not slide it */
const TELEPORT = 12;

export interface WorldFrame {
  /** host sim time this frame represents */
  t: number;
  wave: number;
  kills: number;
  zombies: NetZombie[];
  heroes: NetHero[];
}

interface Stored extends WorldFrame {
  /** for every zombie of this frame: the same zombie in the frame before (or null) */
  prevZ: Array<NetZombie | null>;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class SnapshotBuffer {
  private frames: Stored[] = [];
  /** host time − local time of the packets that travelled fastest */
  private offset: number | null = null;
  /** how late packets run behind the fastest ones (s), fast attack / slow release */
  private jitter = 0;
  /** host-time spacing of snapshots (s) */
  private interval = 1 / 15;
  private renderT: number | null = null;
  private lastNow = 0;
  private readonly out: WorldFrame = { t: 0, wave: 1, kills: 0, zombies: [], heroes: [] };
  private readonly zPool: NetZombie[] = [];
  private readonly hPool: NetHero[] = [];
  private readonly byId = new Map<number, NetZombie>();

  /** `now` = local clock in seconds (performance.now() / 1000) */
  push(frame: WorldFrame, now: number): void {
    const last = this.frames[this.frames.length - 1];
    if (last && frame.t <= last.t) return; // late / duplicate
    // pair every zombie with itself one snapshot ago (done once here, not every drawn frame)
    const prevZ: Array<NetZombie | null> = new Array(frame.zombies.length);
    if (last) {
      this.byId.clear();
      for (const z of last.zombies) this.byId.set(z.id, z);
      for (let i = 0; i < frame.zombies.length; i++) prevZ[i] = this.byId.get(frame.zombies[i]!.id) ?? null;
      this.byId.clear();
      const gap = frame.t - last.t;
      if (gap > 0.01 && gap < 0.5) this.interval = lerp(this.interval, gap, 0.15);
    } else prevZ.fill(null);
    this.frames.push({ ...frame, prevZ });
    if (this.frames.length > 24) this.frames.shift();

    const off = frame.t - now;
    if (this.offset === null || Math.abs(off - this.offset) > RESYNC) {
      // first packet, or the host paused / we were in the background
      this.offset = off;
      this.jitter = 0;
      this.renderT = null;
      return;
    }
    const late = this.offset - off; // > 0: this packet took longer than the fastest ones
    if (late < 0) this.offset = lerp(this.offset, off, 0.35); // a faster path: believe it quickly
    else this.offset = lerp(this.offset, off, 0.01); // clocks drift: follow slowly
    const dev = Math.max(0, late);
    this.jitter = dev > this.jitter ? lerp(this.jitter, dev, 0.3) : lerp(this.jitter, dev, 0.02);
  }

  get ready(): boolean {
    return this.frames.length > 0;
  }

  /** how far behind the host the world is drawn right now (s) */
  get delay(): number {
    return clamp(this.interval * 1.15 + this.jitter * 1.6 + 0.012, MIN_DELAY, MAX_DELAY);
  }

  /** measured lateness of packets (s) — for a connection indicator */
  get jitterSec(): number {
    return this.jitter;
  }

  /** The world as it should be drawn at local time `now`. The result is reused between calls. */
  sample(now: number): WorldFrame | null {
    const n = this.frames.length;
    if (n === 0 || this.offset === null) return null;
    const newest = this.frames[n - 1]!;
    const want = now + this.offset - this.delay;
    if (this.renderT === null) this.renderT = want;
    else {
      const step = clamp(now - this.lastNow, 0, 0.25);
      const err = want - (this.renderT + step);
      if (Math.abs(err) > RESYNC) this.renderT = want;
      else this.renderT += step + clamp(err, -step * MAX_WARP, step * MAX_WARP);
    }
    this.lastNow = now;
    if (this.renderT > newest.t + MAX_HOLD) this.renderT = newest.t + MAX_HOLD;
    const rt = this.renderT;

    // the pair of snapshots around rt (B is the newer one)
    let b = n - 1;
    while (b > 1 && this.frames[b - 1]!.t > rt) b--;
    const B = this.frames[b]!;
    const A = b > 0 ? this.frames[b - 1]! : null;
    let k = 1;
    if (A) {
      const span = Math.max(1e-6, B.t - A.t);
      // past the newest snapshot: carry on along the last velocity for a moment, then hold
      k = rt >= B.t ? 1 + Math.min(rt - B.t, MAX_EXTRAPOLATE) / span : clamp((rt - A.t) / span, 0, 1);
    }

    const out = this.out;
    out.t = rt;
    out.wave = B.wave;
    out.kills = B.kills;
    // entities follow the newer frame: spawned ones appear, dead ones are gone
    const zs = out.zombies;
    zs.length = B.zombies.length;
    for (let i = 0; i < B.zombies.length; i++) {
      const z = B.zombies[i]!;
      const p = k === 1 ? null : B.prevZ[i]!;
      const o = (this.zPool[i] ??= { id: 0, kind: 0, x: 0, z: 0, yaw: 0, hp: 0, flags: 0 });
      o.id = z.id;
      o.kind = z.kind;
      o.hp = z.hp;
      o.flags = z.flags;
      o.maxHp = z.maxHp;
      if (p && Math.abs(z.x - p.x) + Math.abs(z.z - p.z) < TELEPORT) {
        o.x = lerp(p.x, z.x, k);
        o.z = lerp(p.z, z.z, k);
        o.yaw = lerpAngle(p.yaw, z.yaw, Math.min(k, 1));
      } else {
        o.x = z.x;
        o.z = z.z;
        o.yaw = z.yaw;
      }
      zs[i] = o;
    }
    const hs = out.heroes;
    hs.length = B.heroes.length;
    for (let i = 0; i < B.heroes.length; i++) {
      const h = B.heroes[i]!;
      const o = (this.hPool[i] ??= { ...h });
      Object.assign(o, h);
      const p = k === 1 || !A ? undefined : A.heroes.find((q) => q.id === h.id);
      if (p && Math.abs(h.x - p.x) + Math.abs(h.z - p.z) < TELEPORT) {
        o.x = lerp(p.x, h.x, k);
        o.z = lerp(p.z, h.z, k);
        o.yaw = lerpAngle(p.yaw, h.yaw, Math.min(k, 1));
      }
      hs[i] = o;
    }
    return out;
  }
}
