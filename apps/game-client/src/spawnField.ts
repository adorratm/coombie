import { resolveCircleAabbs, type Aabb } from './collision';

/**
 * Where may a zombie appear?
 *
 * Maps are not plain squares: buildings, water, fenced yards and sealed rooms leave
 * pockets a zombie can never walk out of, and a point pushed out of a collider can
 * land beyond the boundary wall. This flood-fills a coarse grid from the player's
 * start, so every spawn is (a) inside the map, (b) not inside a collider and
 * (c) connected to the area the player can actually reach.
 */
export interface SpawnField {
  /** is this point in the walkable area connected to the origin? */
  reachable(x: number, z: number): boolean;
  /** nearest reachable point (the input itself when already fine) */
  snap(x: number, z: number): { x: number; z: number };
  /** random reachable point minD..maxD from the centre; `around` narrows it to an angle ± spread */
  pick(cx: number, cz: number, minD: number, maxD: number, rand?: () => number, around?: { angle: number; spread: number }): { x: number; z: number } | null;
  /** number of reachable cells (0 = field unusable, callers fall back) */
  readonly size: number;
}

export function buildSpawnField(
  bound: number,
  colliders: readonly Aabb[],
  originX: number,
  originZ: number,
  radius = 0.5,
  cell = 2,
): SpawnField {
  const n = Math.max(1, Math.floor((bound * 2) / cell));
  const half = (n * cell) / 2;
  const free = new Uint8Array(n * n);
  const reach = new Uint8Array(n * n);
  const cx = (i: number) => -half + (i + 0.5) * cell;
  const idx = (x: number) => Math.floor((x + half) / cell);
  const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = cx(i);
      const z = cx(j);
      const r = resolveCircleAabbs(x, z, radius, colliders);
      if (Math.abs(r.x - x) + Math.abs(r.z - z) < 0.02) free[j * n + i] = 1;
    }
  }

  // start cell: the origin, or the closest free cell to it
  let si = Math.min(n - 1, Math.max(0, idx(originX)));
  let sj = Math.min(n - 1, Math.max(0, idx(originZ)));
  if (!free[sj * n + si]) {
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < free.length; k++) {
      if (!free[k]) continue;
      const d = (cx(k % n) - originX) ** 2 + (cx(Math.floor(k / n)) - originZ) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      si = best % n;
      sj = Math.floor(best / n);
    }
  }

  const cells: number[] = [];
  if (free[sj * n + si]) {
    const queue = [sj * n + si];
    reach[sj * n + si] = 1;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q]!;
      cells.push(k);
      const i = k % n;
      const j = Math.floor(k / n);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (!inGrid(ni, nj)) continue;
        const nk = nj * n + ni;
        if (free[nk] && !reach[nk]) {
          reach[nk] = 1;
          queue.push(nk);
        }
      }
    }
  }

  const reachable = (x: number, z: number): boolean => {
    const i = idx(x);
    const j = idx(z);
    return inGrid(i, j) && reach[j * n + i] === 1;
  };

  const snap = (x: number, z: number): { x: number; z: number } => {
    if (cells.length === 0 || reachable(x, z)) return { x, z };
    const i0 = Math.min(n - 1, Math.max(0, idx(x)));
    const j0 = Math.min(n - 1, Math.max(0, idx(z)));
    for (let ring = 1; ring < n; ring++) {
      let best = -1;
      let bestD = Infinity;
      for (let j = j0 - ring; j <= j0 + ring; j++) {
        for (let i = i0 - ring; i <= i0 + ring; i++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== ring || !inGrid(i, j)) continue;
          if (!reach[j * n + i]) continue;
          const d = (cx(i) - x) ** 2 + (cx(j) - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = j * n + i;
          }
        }
      }
      if (best >= 0) return { x: cx(best % n), z: cx(Math.floor(best / n)) };
    }
    return { x, z };
  };

  const pick: SpawnField['pick'] = (pcx, pcz, minD, maxD, rand = Math.random, around) => {
    if (cells.length === 0) return null;
    for (let t = 0; t < 14; t++) {
      const a = around ? around.angle + (rand() * 2 - 1) * around.spread : rand() * Math.PI * 2;
      const d = minD + rand() * (maxD - minD);
      const x = pcx + Math.cos(a) * d;
      const z = pcz + Math.sin(a) * d;
      if (reachable(x, z)) return { x, z };
    }
    // crowded / cornered: any reachable cell that is at least minD away
    for (let t = 0; t < 24; t++) {
      const k = cells[Math.floor(rand() * cells.length)]!;
      const x = cx(k % n);
      const z = cx(Math.floor(k / n));
      if ((x - pcx) ** 2 + (z - pcz) ** 2 >= minD * minD) return { x, z };
    }
    return null;
  };

  return { reachable, snap, pick, size: cells.length };
}
