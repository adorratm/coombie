import type { Aabb } from './collision';

/**
 * Driving for the convoy truck.
 *
 * TruckPlanner  — a road map of the level: an obstacle grid, how far every cell is from the
 *                 nearest wall (chamfer distance), and A* over it. Cells closer to a wall
 *                 than the truck's half width are off limits and cells near walls cost
 *                 more, so the route keeps to the middle of streets and gaps instead of
 *                 scraping along buildings. The grid route is then pulled taut.
 * planDrive     — the route as a truck can actually drive it (hybrid A*): poses x, z,
 *                 heading, moved in short arcs no tighter than the turning circle,
 *                 forwards or in reverse, with the whole body checked against the walls.
 *                 A dead end or a bend too sharp comes out as a proper multi-point turn.
 *                 The plain grid route above is its distance-to-go estimate.
 * TruckDriver   — follows that route like a driver: steers toward a point a few metres
 *                 ahead (pure pursuit, also when backing up), only turns while rolling,
 *                 slows for bends and before changing direction, and plans again if
 *                 something still stops it.
 *
 * Front of the truck = +Z at yaw 0; forward = (sin yaw, cos yaw).
 */

export interface P2 {
  x: number;
  z: number;
}

/** a point of a drivable route: where, which way the truck faces, and 1 forward / -1 reverse */
export interface DrivePt extends P2 {
  yaw: number;
  dir: 1 | -1;
}

/** half the truck's width plus a little air */
export const TRUCK_HALF_WIDTH = 1.35;
/** body circles: centre offsets along the truck (m) and radius */
const BODY_OFFSETS = [2.7, 0.9, -0.9, -2.7] as const;
const BODY_R = 1.25;

const SQRT2 = Math.SQRT2;

export class TruckPlanner {
  readonly cell: number;
  readonly n: number;
  private readonly half: number;
  /** distance (m) from the cell centre to the nearest blocked cell */
  private readonly clear: Float32Array;
  private readonly colliderCount: number;

  constructor(bound: number, colliders: readonly Aabb[], cell = 1) {
    this.cell = cell;
    this.colliderCount = colliders.length;
    this.n = Math.max(4, Math.ceil((bound * 2 + 4) / cell));
    this.half = (this.n * cell) / 2;
    const n = this.n;
    const blocked = new Uint8Array(n * n);
    // the edge of the map is a wall too
    for (let i = 0; i < n; i++) blocked[i] = blocked[(n - 1) * n + i] = blocked[i * n] = blocked[i * n + n - 1] = 1;
    for (const b of colliders) {
      const i0 = Math.max(0, this.ix(b.minX));
      const i1 = Math.min(n - 1, this.ix(b.maxX));
      const j0 = Math.max(0, this.ix(b.minZ));
      const j1 = Math.min(n - 1, this.ix(b.maxZ));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * n + i] = 1;
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = this.cx(i);
        const z = this.cx(j);
        if (Math.abs(x) > bound || Math.abs(z) > bound) blocked[j * n + i] = 1;
      }
    }
    // two-pass chamfer distance transform (in cells), then to metres
    const d = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) d[k] = blocked[k] ? 0 : 1e9;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (d[k] === 0) continue;
        let v = d[k]!;
        if (i > 0) v = Math.min(v, d[k - 1]! + 1);
        if (j > 0) {
          v = Math.min(v, d[k - n]! + 1);
          if (i > 0) v = Math.min(v, d[k - n - 1]! + SQRT2);
          if (i < n - 1) v = Math.min(v, d[k - n + 1]! + SQRT2);
        }
        d[k] = v;
      }
    }
    for (let j = n - 1; j >= 0; j--) {
      for (let i = n - 1; i >= 0; i--) {
        const k = j * n + i;
        if (d[k] === 0) continue;
        let v = d[k]!;
        if (i < n - 1) v = Math.min(v, d[k + 1]! + 1);
        if (j < n - 1) {
          v = Math.min(v, d[k + n]! + 1);
          if (i < n - 1) v = Math.min(v, d[k + n + 1]! + SQRT2);
          if (i > 0) v = Math.min(v, d[k + n - 1]! + SQRT2);
        }
        d[k] = v;
      }
    }
    // distance from the centre of this cell to the edge of the nearest blocked cell
    this.clear = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) this.clear[k] = Math.max(0, d[k]! - 0.5) * cell;
  }

  /** built from this many colliders (the map adds props as they load) */
  get builtFrom(): number {
    return this.colliderCount;
  }

  private cx(i: number): number {
    return -this.half + (i + 0.5) * this.cell;
  }
  private ix(x: number): number {
    return Math.floor((x + this.half) / this.cell);
  }

  /** metres of free space in a cell (as stored) */
  private cellClear(i: number, j: number): number {
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return 0;
    return this.clear[j * this.n + i]!;
  }

  /**
   * Metres of free space around a point — blended between cell centres, so it changes
   * smoothly as the truck moves (a step value would jump a whole metre at a cell edge and
   * make a body that just fitted suddenly "touch" a wall).
   */
  clearance(x: number, z: number): number {
    const fx = (x + this.half) / this.cell - 0.5;
    const fz = (z + this.half) / this.cell - 0.5;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const a = this.cellClear(i, j);
    const b = this.cellClear(i + 1, j);
    const c = this.cellClear(i, j + 1);
    const d = this.cellClear(i + 1, j + 1);
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /** The nearest point to `p` with at least `need` metres around it (spiral search), or null. */
  snap(p: P2, need: number, maxR = 30): P2 | null {
    if (this.clearance(p.x, p.z) >= need) return { x: p.x, z: p.z };
    const ci = this.ix(p.x);
    const cj = this.ix(p.z);
    const rMax = Math.ceil(maxR / this.cell);
    for (let r = 1; r <= rMax; r++) {
      let best: P2 | null = null;
      let bd = Infinity;
      for (let j = cj - r; j <= cj + r; j++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
          if (this.clear[j * this.n + i]! < need) continue;
          const x = this.cx(i);
          const z = this.cx(j);
          const dd = (x - p.x) ** 2 + (z - p.z) ** 2;
          if (dd < bd) {
            bd = dd;
            best = { x, z };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** straight line a→b keeps `need` metres from every wall */
  lineClear(a: P2, b: P2, need: number): boolean {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (this.clearance(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) < need) return false;
    }
    return true;
  }

  /**
   * A route from `from` to `to` keeping `need` metres from walls (both ends are moved to
   * the nearest such spot first). Null when there is no way through.
   */
  plan(from: P2, to: P2, need = TRUCK_HALF_WIDTH + 0.5): P2[] | null {
    const a = this.snap(from, need);
    const b = this.snap(to, need);
    if (!a || !b) return null;
    const n = this.n;
    const start = this.ix(a.z) * n + this.ix(a.x);
    const goal = this.ix(b.z) * n + this.ix(b.x);
    const g = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    const gx = goal % n;
    const gz = (goal / n) | 0;
    const h = (k: number) => {
      const dx = Math.abs((k % n) - gx);
      const dz = Math.abs(((k / n) | 0) - gz);
      return (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)) * this.cell;
    };
    g[start] = 0;
    heap.push(start, h(start));
    // walls nearer than this make a cell dearer: the route keeps to the middle of the road
    const comfort = need + 3;
    let found = false;
    while (heap.size) {
      const k = heap.pop();
      if (closed[k]) continue;
      if (k === goal) {
        found = true;
        break;
      }
      closed[k] = 1;
      const i = k % n;
      const j = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const kk = jj * n + ii;
          if (closed[kk]) continue;
          const c = this.clear[kk]!;
          if (c < need) continue;
          // no squeezing diagonally between two blocked cells
          if (di && dj && (this.clear[j * n + ii]! < need || this.clear[jj * n + i]! < need)) continue;
          const step = (di && dj ? SQRT2 : 1) * this.cell * (1 + Math.max(0, comfort - c) * 0.6);
          const ng = g[k]! + step;
          if (ng < g[kk]!) {
            g[kk] = ng;
            came[kk] = k;
            heap.push(kk, ng + h(kk));
          }
        }
      }
    }
    if (!found) return null;
    const cells: P2[] = [];
    for (let k = goal; k !== -1; k = came[k]!) cells.push({ x: this.cx(k % n), z: this.cx((k / n) | 0) });
    cells.reverse();
    cells[0] = a;
    cells[cells.length - 1] = b;
    return this.pullTaut(cells, need + 0.4);
  }

  /** metres to `goal` for every cell, around walls (cells with less than `need` room are walls) */
  private distanceField(goal: P2, need: number): Float32Array | null {
    const n = this.n;
    const gi = this.ix(goal.x);
    const gj = this.ix(goal.z);
    if (gi < 0 || gj < 0 || gi >= n || gj >= n) return null;
    const dist = new Float32Array(n * n).fill(Infinity);
    const heap = new MinHeap();
    const g0 = gj * n + gi;
    dist[g0] = 0;
    heap.push(g0, 0);
    while (heap.size) {
      const k = heap.pop();
      const dk = dist[k]!;
      const i = k % n;
      const j = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const kk = jj * n + ii;
          if (this.clear[kk]! < need) continue;
          const nd = dk + (di && dj ? SQRT2 : 1) * this.cell;
          if (nd < dist[kk]!) {
            dist[kk] = nd;
            heap.push(kk, nd);
          }
        }
      }
    }
    return dist;
  }

  /**
   * A route the truck can drive from pose (x, z, yaw) to `to`: short arcs at full lock or
   * straight, forward or in reverse, every pose clear of the walls. Reversing and changing
   * direction cost extra, so it backs up only when it has to (a dead end, a corner too tight
   * to take in one sweep). Null when it finds none within its search budget.
   */
  planDrive(from: { x: number; z: number; yaw: number }, to: P2, opts: { budget?: number; turnRadius?: number } = {}): DrivePt[] | null {
    const R = opts.turnRadius ?? TruckDriver.TURN_RADIUS;
    const goal = this.snap(to, TRUCK_HALF_WIDTH + 0.3);
    if (!goal) return null;
    const field = this.distanceField(goal, TRUCK_HALF_WIDTH);
    if (!field) return null;
    const n = this.n;
    const H = 24; // heading bins (15°)
    const STEP = 1.6; // metres per arc
    const SUB = 4;
    const key = (x: number, z: number, yaw: number) => {
      const i = this.ix(x);
      const j = this.ix(z);
      const h = ((Math.round((yaw / (Math.PI * 2)) * H) % H) + H) % H;
      return (j * n + i) * H + h;
    };
    const hOf = (x: number, z: number) => {
      const i = this.ix(x);
      const j = this.ix(z);
      if (i < 0 || j < 0 || i >= n || j >= n) return Infinity;
      const d = field[j * n + i]!;
      return Number.isFinite(d) ? d : Infinity;
    };
    interface Node {
      x: number;
      z: number;
      yaw: number;
      dir: 1 | -1;
      g: number;
      parent: number;
    }
    const nodes: Node[] = [];
    const best = new Map<number, number>();
    const closed = new Set<number>();
    const heap = new MinHeap();
    if (!Number.isFinite(hOf(from.x, from.z))) return null;
    nodes.push({ x: from.x, z: from.z, yaw: from.yaw, dir: 1, g: 0, parent: -1 });
    heap.push(0, hOf(from.x, from.z));
    const budget = opts.budget ?? 40000;
    let expanded = 0;
    let goalNode = -1;
    // free of the walls with a little air; the start pose itself is allowed to be tight
    const fits = (x: number, z: number, yaw: number) => !truckHitsWalls(this, x, z, yaw, 0.15);
    while (heap.size && expanded < budget) {
      const ni = heap.pop();
      const nd = nodes[ni]!;
      const k = key(nd.x, nd.z, nd.yaw);
      if (closed.has(k)) continue;
      closed.add(k);
      expanded++;
      if (Math.hypot(nd.x - goal.x, nd.z - goal.z) < 1.4) {
        goalNode = ni;
        break;
      }
      for (const dir of [1, -1] as const) {
        for (const steer of [-1, 0, 1]) {
          const curv = steer / R;
          let x = nd.x;
          let z = nd.z;
          let yaw = nd.yaw;
          let ok = true;
          let tight = 0;
          const ds = (dir * STEP) / SUB;
          for (let s2 = 0; s2 < SUB; s2++) {
            const my = yaw + curv * ds * 0.5;
            x += Math.sin(my) * ds;
            z += Math.cos(my) * ds;
            yaw += curv * ds;
            if (!fits(x, z, yaw)) {
              ok = false;
              break;
            }
            // close to a wall costs a little: keep to the middle where it can
            tight = Math.max(tight, Math.max(0, 2.6 - this.clearance(x, z)));
          }
          if (!ok) continue;
          const kk = key(x, z, yaw);
          if (closed.has(kk)) continue;
          const switching = nd.parent >= 0 && dir !== nd.dir;
          const g = nd.g + STEP * (dir < 0 ? 2.2 : 1) + (steer ? 0.15 : 0) + (switching ? 4 : 0) + tight * 0.5;
          const prev = best.get(kk);
          if (prev !== undefined && nodes[prev]!.g <= g) continue;
          const h = hOf(x, z);
          if (!Number.isFinite(h)) continue;
          nodes.push({ x, z, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), dir, g, parent: ni });
          best.set(kk, nodes.length - 1);
          heap.push(nodes.length - 1, g + h * 1.05);
        }
      }
    }
    if (goalNode < 0) return null;
    // walk back, then fill in the arcs at a fine spacing for the driver
    const chain: Node[] = [];
    for (let i = goalNode; i >= 0; i = nodes[i]!.parent) chain.push(nodes[i]!);
    chain.reverse();
    const out: DrivePt[] = [{ x: chain[0]!.x, z: chain[0]!.z, yaw: chain[0]!.yaw, dir: chain[1]?.dir ?? 1 }];
    for (let c = 1; c < chain.length; c++) {
      const a = chain[c - 1]!;
      const b = chain[c]!;
      let dyaw = b.yaw - a.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const curv = dyaw / (b.dir * STEP);
      let x = a.x;
      let z = a.z;
      let yaw = a.yaw;
      const ds = (b.dir * STEP) / SUB;
      for (let s2 = 0; s2 < SUB; s2++) {
        const my = yaw + curv * ds * 0.5;
        x += Math.sin(my) * ds;
        z += Math.cos(my) * ds;
        yaw += curv * ds;
        out.push({ x, z, yaw, dir: b.dir });
      }
    }
    return out;
  }

  /** drop corners that a straight drive can skip (with a margin above the plan's own clearance) */
  private pullTaut(pts: P2[], need: number): P2[] {
    if (pts.length <= 2) return pts;
    const out: P2[] = [pts[0]!];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineClear(pts[i]!, pts[j]!, need)) j--;
      out.push(pts[j]!);
      i = j;
    }
    return out;
  }
}

class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, pri: number): void {
    const k = this.k;
    const p = this.p;
    k.push(key);
    p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up]! <= p[i]!) break;
      [k[up], k[i]] = [k[i]!, k[up]!];
      [p[up], p[i]] = [p[i]!, p[up]!];
      i = up;
    }
  }
  pop(): number {
    const k = this.k;
    const p = this.p;
    const top = k[0]!;
    const lk = k.pop()!;
    const lp = p.pop()!;
    if (k.length) {
      k[0] = lk;
      p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && p[l]! < p[m]!) m = l;
        if (r < k.length && p[r]! < p[m]!) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i]!, k[m]!];
        [p[m], p[i]] = [p[i]!, p[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** does the truck body at (x, z, yaw) touch any wall? */
export function truckHitsWalls(planner: TruckPlanner, x: number, z: number, yaw: number, margin = 0): boolean {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  for (const o of BODY_OFFSETS) if (planner.clearance(x + fx * o, z + fz * o) < BODY_R - 0.35 + margin) return true;
  return false;
}

export interface DriveResult {
  /** signed metres moved this step (negative while reversing) */
  moved: number;
  /** reached the end of the route */
  arrived: boolean;
  /** wants a fresh route from where it is now */
  replan: boolean;
}

export class TruckDriver {
  x: number;
  z: number;
  yaw: number;
  /** signed: negative while backing up */
  speed = 0;
  path: DrivePt[] = [];
  /** the route split where it changes direction: [start, end] indices into path */
  private chunks: Array<[number, number]> = [];
  private chunk = 0;
  /** furthest path index the truck has passed in the current chunk */
  private at = 0;
  private stuckT = 0;

  /** tightest turn (m) — an army truck does not pivot */
  static readonly TURN_RADIUS = 5.5;
  static readonly ACCEL = 1.1;
  static readonly LOOKAHEAD = 4.5;
  /** backing up is slower */
  static readonly REVERSE_SPEED = 0.8;

  constructor(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
  }

  /** a route from planDrive, or plain points (then driven forwards) */
  setPath(path: Array<DrivePt | P2>): void {
    this.path = path.map((p, i, a) => ('dir' in p ? p : { x: p.x, z: p.z, yaw: i > 0 ? Math.atan2(p.x - a[i - 1]!.x, p.z - a[i - 1]!.z) : this.yaw, dir: 1 as const }));
    this.chunks = [];
    let s = 0;
    for (let i = 2; i < this.path.length; i++) {
      if (this.path[i]!.dir !== this.path[i - 1]!.dir) {
        this.chunks.push([s, i - 1]);
        s = i - 1;
      }
    }
    this.chunks.push([s, this.path.length - 1]);
    this.chunk = 0;
    this.at = this.chunks[0]![0];
    this.stuckT = 0;
  }

  /** which way the current part of the route is driven */
  get gear(): 1 | -1 {
    const c = this.chunks[this.chunk];
    return c ? this.path[Math.min(c[0] + 1, c[1])]!.dir : 1;
  }

  /** metres left along the route */
  remaining(): number {
    if (this.path.length < 2) return 0;
    let d = 0;
    const from = Math.max(0, this.at);
    const p0 = this.path[Math.min(from + 1, this.path.length - 1)]!;
    d += Math.hypot(p0.x - this.x, p0.z - this.z);
    for (let i = from + 1; i < this.path.length - 1; i++) d += Math.hypot(this.path[i + 1]!.x - this.path[i]!.x, this.path[i + 1]!.z - this.path[i]!.z);
    return d;
  }

  /** move `at` forward to the path point nearest the truck (within the current chunk) */
  private track(): number {
    const [, e] = this.chunks[this.chunk]!;
    let bestI = this.at;
    let bestD = Infinity;
    for (let i = this.at; i <= Math.min(e, this.at + 30); i++) {
      const p = this.path[i]!;
      const d = (p.x - this.x) ** 2 + (p.z - this.z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    this.at = bestI;
    return Math.sqrt(bestD);
  }

  /**
   * One step. `maxSpeed` 0 = brake (no escort, checkpoint, crowd in front).
   * `walls` may be null (no map yet): then only the route is followed.
   */
  step(dt: number, maxSpeed: number, walls: TruckPlanner | null): DriveResult {
    const res: DriveResult = { moved: 0, arrived: false, replan: false };
    if (this.path.length < 2 || dt <= 0) return res;
    const brake = maxSpeed <= 0;
    const off = this.track();
    const [, e] = this.chunks[this.chunk]!;
    const last = this.path[e]!;
    const toEnd = Math.hypot(last.x - this.x, last.z - this.z);
    const gear = this.gear;
    const finalChunk = this.chunk === this.chunks.length - 1;

    // end of this part of the route: stop, then the next part (other gear) or arrived
    if ((toEnd < 0.5 || this.at >= e) && Math.abs(this.speed) < 0.15) {
      this.speed = 0;
      if (finalChunk) {
        res.arrived = toEnd < 1.5;
        if (!res.arrived) res.replan = true;
        return res;
      }
      this.chunk++;
      this.at = this.chunks[this.chunk]![0];
      return res;
    }

    // carrot: LOOKAHEAD metres further along this part
    let left = TruckDriver.LOOKAHEAD;
    let cx = last.x;
    let cz = last.z;
    for (let i = this.at; i < e; i++) {
      const a = this.path[i]!;
      const b = this.path[i + 1]!;
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= l) {
        cx = a.x + ((b.x - a.x) * left) / Math.max(1e-6, l);
        cz = a.z + ((b.z - a.z) * left) / Math.max(1e-6, l);
        break;
      }
      left -= l;
    }
    // past the end of a short part: aim beyond it along its last heading
    if (left > 0 && toEnd < TruckDriver.LOOKAHEAD) {
      const k = TruckDriver.LOOKAHEAD - toEnd;
      cx = last.x + Math.sin(last.yaw) * gear * k;
      cz = last.z + Math.cos(last.yaw) * gear * k;
    }
    // heading of travel: the nose going forward, the tail backing up
    const travel = this.yaw + (gear < 0 ? Math.PI : 0);
    let err = Math.atan2(cx - this.x, cz - this.z) - travel;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const maxTurn = 1 / TruckDriver.TURN_RADIUS;
    const ld = Math.max(1, Math.hypot(cx - this.x, cz - this.z));
    const k = Math.abs(err) > Math.PI / 2 ? Math.sign(err) * maxTurn : Math.max(-maxTurn, Math.min(maxTurn, (2 * Math.sin(err)) / ld));
    // yaw changes by curvature × signed distance: backing up, the wheels turn the other way
    const curv = gear * k;

    const top = gear < 0 ? Math.min(maxSpeed, TruckDriver.REVERSE_SPEED) : maxSpeed;
    const bend = Math.min(1, Math.abs(err) / 1.2);
    let target = brake ? 0 : top * (1 - 0.55 * bend);
    // ease into the stop at the end of this part (a direction change or the checkpoint)
    target = Math.min(target, Math.sqrt(Math.max(0, 2 * TruckDriver.ACCEL * 0.7 * (toEnd - 0.25))) + 0.12);
    const want = gear * target;
    if (this.speed < want) this.speed = Math.min(want, this.speed + TruckDriver.ACCEL * dt);
    else this.speed = Math.max(want, this.speed - TruckDriver.ACCEL * 2.2 * dt);

    const r = this.move(dt, curv, walls, res);
    if (!brake && Math.abs(this.speed) > 0.05 && r.moved === 0) {
      // something it did not plan for (the map changed under it): stop and plan again
      this.speed = 0;
      this.stuckT += dt;
      if (this.stuckT > 0.5) {
        this.stuckT = 0;
        r.replan = true;
      }
    } else if (r.moved !== 0) this.stuckT = 0;
    if (!brake && off > 3.5) r.replan = true;
    return r;
  }

  private move(dt: number, curvature: number, walls: TruckPlanner | null, res: DriveResult): DriveResult {
    const ds = this.speed * dt;
    if (Math.abs(ds) < 1e-5) return res;
    const ny = this.yaw + curvature * ds;
    const mid = this.yaw + curvature * ds * 0.5;
    const nx = this.x + Math.sin(mid) * ds;
    const nz = this.z + Math.cos(mid) * ds;
    if (walls && truckHitsWalls(walls, nx, nz, ny) && !truckHitsWalls(walls, this.x, this.z, this.yaw)) return res;
    this.x = nx;
    this.z = nz;
    this.yaw = Math.atan2(Math.sin(ny), Math.cos(ny));
    res.moved = ds;
    return res;
  }
}

/**
 * Push a circle (hero / zombie at x, z with radius r) out of the truck's body (an oriented
 * box). Returns the corrected position, or null when it was not touching.
 */
export function pushOutOfTruck(x: number, z: number, r: number, tx: number, tz: number, yaw: number, halfLen = 3.95, halfW = 1.3): P2 | null {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // into the truck's frame: u along, v across
  const dx = x - tx;
  const dz = z - tz;
  const u = dx * fx + dz * fz;
  const v = dx * fz - dz * fx;
  const cu = Math.max(-halfLen, Math.min(halfLen, u));
  const cv = Math.max(-halfW, Math.min(halfW, v));
  let ox = u - cu;
  let ov = v - cv;
  const d2 = ox * ox + ov * ov;
  if (d2 >= r * r) return null;
  let nu: number;
  let nv: number;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    nu = cu + (ox / d) * r;
    nv = cv + (ov / d) * r;
  } else {
    // centre inside the box: out through the nearest side
    const pu = halfLen - Math.abs(u);
    const pv = halfW - Math.abs(v);
    if (pv < pu) {
      nu = u;
      nv = (v >= 0 ? 1 : -1) * (halfW + r);
    } else {
      nu = (u >= 0 ? 1 : -1) * (halfLen + r);
      nv = v;
    }
    ox = 0;
    ov = 0;
  }
  return { x: tx + nu * fx + nv * fz, z: tz + nu * fz - nv * fx };
}
