export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function makeAabb(x: number, z: number, halfW: number, halfD: number): Aabb {
  return {
    minX: x - halfW,
    maxX: x + halfW,
    minZ: z - halfD,
    maxZ: z + halfD,
  };
}

export function pointInAabb(x: number, z: number, box: Aabb, pad = 0): boolean {
  return x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad;
}

/**
 * Uniform-grid index over a collider list (rebuilt lazily when the list grows, e.g.
 * when map props finish loading). Large maps hold ~1k boxes; a zombie only needs
 * the handful in its cell.
 */
interface GridIndex {
  count: number;
  cell: number;
  cells: Map<number, Aabb[]>;
}
const grids = new WeakMap<readonly Aabb[], GridIndex>();
const GRID_CELL = 8;
const key = (cx: number, cz: number) => ((cx + 4096) << 13) | (cz + 4096);
function gridFor(boxes: readonly Aabb[]): GridIndex | null {
  if (boxes.length < 48) return null;
  let g = grids.get(boxes);
  if (g && g.count === boxes.length) return g;
  g = { count: boxes.length, cell: GRID_CELL, cells: new Map() };
  for (const b of boxes) {
    const x0 = Math.floor(b.minX / GRID_CELL);
    const x1 = Math.floor(b.maxX / GRID_CELL);
    const z0 = Math.floor(b.minZ / GRID_CELL);
    const z1 = Math.floor(b.maxZ / GRID_CELL);
    // giant boxes (water, world bounds) go into every touched cell up to a cap
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) {
      const k = key(-4000, -4000);
      (g.cells.get(k) ?? g.cells.set(k, []).get(k)!).push(b);
      continue;
    }
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        (g.cells.get(k) ?? g.cells.set(k, []).get(k)!).push(b);
      }
  }
  grids.set(boxes, g);
  return g;
}
const _near: Aabb[] = [];
const _seen = new Set<Aabb>();
/** Boxes that may overlap a circle at (x,z) with radius r. */
export function nearbyBoxes(x: number, z: number, r: number, boxes: readonly Aabb[]): readonly Aabb[] {
  const g = gridFor(boxes);
  if (!g) return boxes;
  _near.length = 0;
  _seen.clear();
  const x0 = Math.floor((x - r) / GRID_CELL);
  const x1 = Math.floor((x + r) / GRID_CELL);
  const z0 = Math.floor((z - r) / GRID_CELL);
  const z1 = Math.floor((z + r) / GRID_CELL);
  for (let cx = x0; cx <= x1; cx++)
    for (let cz = z0; cz <= z1; cz++) {
      const list = g.cells.get(key(cx, cz));
      if (!list) continue;
      for (const b of list) {
        if (_seen.has(b)) continue;
        _seen.add(b);
        _near.push(b);
      }
    }
  const giant = g.cells.get(key(-4000, -4000));
  if (giant) for (const b of giant) _near.push(b);
  return _near;
}

/** Circle vs AABB: resolve position so radius stays outside boxes. */
export function resolveCircleAabbs(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Aabb[],
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const box of nearbyBoxes(x, z, radius + 1, boxes)) {
    const nearestX = Math.max(box.minX, Math.min(px, box.maxX));
    const nearestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
    const dx = px - nearestX;
    const dz = pz - nearestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;

    if (distSq < 1e-8) {
      const left = Math.abs(px - box.minX);
      const right = Math.abs(box.maxX - px);
      const top = Math.abs(pz - box.minZ);
      const bottom = Math.abs(box.maxZ - pz);
      const m = Math.min(left, right, top, bottom);
      if (m === left) px = box.minX - radius;
      else if (m === right) px = box.maxX + radius;
      else if (m === top) pz = box.minZ - radius;
      else pz = box.maxZ + radius;
      continue;
    }

    const dist = Math.sqrt(distSq);
    const push = (radius - dist) / dist;
    px += dx * push;
    pz += dz * push;
  }
  return { x: px, z: pz };
}

export function circleHitsAabb(x: number, z: number, radius: number, box: Aabb): boolean {
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}
