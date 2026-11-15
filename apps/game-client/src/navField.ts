import { resolveCircleAabbs, type Aabb } from './collision';

/**
 * Zombie navigation: a coarse walkability grid and a multi-source distance field
 * flooded out from the heroes (Dijkstra-light: 8 neighbours, √2 diagonals). A
 * zombie that can't simply walk at its target follows the field downhill, so rivers,
 * canyons, walled yards and mazes route the horde through bridges, gaps and doors
 * instead of piling it against the wall.
 */
export class NavField {
  readonly n: number;
  readonly cell: number;
  private readonly half: number;
  private readonly free: Uint8Array;
  private readonly dist: Float32Array;
  private readonly queue: Int32Array;
  private readonly inQ: Uint8Array;
  /** something to steer with (false until the first flood) */
  ready = false;

  constructor(bound: number, colliders: readonly Aabb[], cell = 2, radius = 0.55) {
    this.cell = cell;
    this.n = Math.max(2, Math.ceil((bound * 2 + cell * 4) / cell));
    this.half = (this.n * cell) / 2;
    const N = this.n * this.n;
    this.free = new Uint8Array(N);
    this.dist = new Float32Array(N).fill(Infinity);
    this.queue = new Int32Array(N * 4);
    this.inQ = new Uint8Array(N);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = this.cx(i);
        const z = this.cx(j);
        const r = resolveCircleAabbs(x, z, radius, colliders);
        if (Math.abs(r.x - x) + Math.abs(r.z - z) < 0.05) this.free[j * this.n + i] = 1;
      }
    }
  }

  private cx(i: number): number {
    return -this.half + (i + 0.5) * this.cell;
  }
  private ix(x: number): number {
    return Math.floor((x + this.half) / this.cell);
  }
  private ok(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.n && j < this.n;
  }

  isFree(x: number, z: number): boolean {
    const i = this.ix(x);
    const j = this.ix(z);
    return this.ok(i, j) && this.free[j * this.n + i] === 1;
  }

  /** Re-flood from the heroes (call a few times a second). */
  flood(sources: readonly { x: number; z: number }[], maxDist = 140): void {
    const n = this.n;
    this.dist.fill(Infinity);
    this.inQ.fill(0);
    let head = 0;
    let tail = 0;
    for (const s of sources) {
      let i = this.ix(s.x);
      let j = this.ix(s.z);
      if (!this.ok(i, j)) continue;
      // a hero standing in a blocked cell (against a wall): seed the nearest free neighbour
      if (!this.free[j * n + i]) {
        let found = false;
        for (let r = 1; r <= 2 && !found; r++)
          for (let dj = -r; dj <= r && !found; dj++)
            for (let di = -r; di <= r && !found; di++)
              if (this.ok(i + di, j + dj) && this.free[(j + dj) * n + i + di]) {
                i += di;
                j += dj;
                found = true;
              }
        if (!found) continue;
      }
      const k = j * n + i;
      this.dist[k] = 0;
      if (!this.inQ[k]) {
        this.queue[tail++ % this.queue.length] = k;
        this.inQ[k] = 1;
      }
    }
    // SPFA-style relaxation; the grid is small enough for this to settle fast
    let guard = this.queue.length * 2;
    while (head !== tail && guard-- > 0) {
      const k = this.queue[head++ % this.queue.length]!;
      this.inQ[k] = 0;
      const d0 = this.dist[k]!;
      if (d0 > maxDist) continue;
      const i = k % n;
      const j = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (!this.ok(ni, nj)) continue;
          const nk = nj * n + ni;
          if (!this.free[nk]) continue;
          // no corner cutting past a blocked cell
          if (di && dj && (!this.free[j * n + ni] || !this.free[nj * n + i])) continue;
          const nd = d0 + (di && dj ? 1.4142 : 1);
          if (nd < this.dist[nk]!) {
            this.dist[nk] = nd;
            if (!this.inQ[nk]) {
              this.queue[tail++ % this.queue.length] = nk;
              this.inQ[nk] = 1;
            }
          }
        }
      }
    }
    this.ready = true;
  }

  /** Path distance (cells) from (x,z) to the nearest hero; Infinity = cut off. */
  distanceAt(x: number, z: number): number {
    const i = this.ix(x);
    const j = this.ix(z);
    return this.ok(i, j) ? this.dist[j * this.n + i]! : Infinity;
  }

  /**
   * Unit direction downhill from (x,z), written into `out` (x,z). Returns false when the
   * field has nothing better than walking straight (no data, or already at the bottom).
   */
  steer(x: number, z: number, out: { x: number; z: number }): boolean {
    if (!this.ready) return false;
    const n = this.n;
    const i = this.ix(x);
    const j = this.ix(z);
    if (!this.ok(i, j)) return false;
    // a blocked / unreached cell reads Infinity, so any reached neighbour wins
    let best = this.dist[j * n + i]!;
    let bi = -1;
    let bj = -1;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (!this.ok(ni, nj)) continue;
        const d = this.dist[nj * n + ni]!;
        if (d < best) {
          best = d;
          bi = ni;
          bj = nj;
        }
      }
    }
    if (bi < 0) return false;
    const tx = this.cx(bi) - x;
    const tz = this.cx(bj) - z;
    const l = Math.hypot(tx, tz);
    if (l < 1e-4) return false;
    out.x = tx / l;
    out.z = tz / l;
    return true;
  }
}
