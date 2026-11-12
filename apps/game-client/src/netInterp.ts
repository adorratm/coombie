import type { NetHero, NetZombie } from '@protocol-z/shared';

/**
 * Guest-side smoothing. Snapshots arrive ~12 Hz with jitter; the guest renders the world
 * slightly in the past (INTERP_DELAY) and blends between the two snapshots around that
 * moment, so zombies and team mates glide instead of teleporting.
 */
export const INTERP_DELAY = 0.13;
/** without news for this long, stop extrapolating and just hold the last pose */
const MAX_HOLD = 0.5;

export interface WorldFrame {
  /** host sim time this frame represents */
  t: number;
  wave: number;
  kills: number;
  zombies: NetZombie[];
  heroes: NetHero[];
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class SnapshotBuffer {
  private frames: WorldFrame[] = [];
  /** host time − local time, smoothed */
  private offset: number | null = null;

  /** `now` = local clock in seconds (performance.now() / 1000) */
  push(frame: WorldFrame, now: number): void {
    const last = this.frames[this.frames.length - 1];
    if (last && frame.t <= last.t) return; // late / duplicate
    this.frames.push(frame);
    if (this.frames.length > 12) this.frames.shift();
    const off = frame.t - now;
    // snap on first frame or big jumps (pause, tab switch), otherwise ease
    this.offset = this.offset === null || Math.abs(off - this.offset) > 1 ? off : lerp(this.offset, off, 0.1);
  }

  get ready(): boolean {
    return this.frames.length > 0;
  }

  /** The world as it should be drawn at local time `now`. */
  sample(now: number): WorldFrame | null {
    const n = this.frames.length;
    if (n === 0 || this.offset === null) return null;
    const newest = this.frames[n - 1]!;
    const rt = Math.min(now + this.offset - INTERP_DELAY, newest.t + MAX_HOLD);
    if (n === 1 || rt >= newest.t) return newest;
    let b = n - 1;
    while (b > 1 && this.frames[b - 1]!.t > rt) b--;
    const A = this.frames[b - 1]!;
    const B = this.frames[b]!;
    if (rt <= A.t) return A;
    const k = (rt - A.t) / Math.max(1e-6, B.t - A.t);
    const prevZ = new Map<number, NetZombie>();
    for (const z of A.zombies) prevZ.set(z.id, z);
    const prevH = new Map<string, NetHero>();
    for (const h of A.heroes) prevH.set(h.id, h);
    return {
      t: rt,
      wave: B.wave,
      kills: B.kills,
      // entities follow the newer frame: spawned ones appear, dead ones are gone
      zombies: B.zombies.map((z) => {
        const p = prevZ.get(z.id);
        return p ? { ...z, x: lerp(p.x, z.x, k), z: lerp(p.z, z.z, k), yaw: lerpAngle(p.yaw, z.yaw, k) } : z;
      }),
      heroes: B.heroes.map((h) => {
        const p = prevH.get(h.id);
        return p ? { ...h, x: lerp(p.x, h.x, k), z: lerp(p.z, h.z, k), yaw: lerpAngle(p.yaw, h.yaw, k) } : h;
      }),
    };
  }
}
