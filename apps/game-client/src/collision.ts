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

/** Circle vs AABB: resolve position so radius stays outside boxes. */
export function resolveCircleAabbs(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Aabb[],
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const box of boxes) {
    const nearestX = Math.max(box.minX, Math.min(px, box.maxX));
    const nearestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
    let dx = px - nearestX;
    let dz = pz - nearestZ;
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
