/**
 * Lightweight 2D uniform grid for XZ queries (bullets vs zombies, nearest enemy).
 * Rebuild once per frame; no per-query allocations beyond the caller-owned `out` array.
 */
export class SpatialHash2D<T> {
  readonly cellSize: number;
  private readonly cells = new Map<number, T[]>();
  private readonly listPool: T[][] = [];

  constructor(cellSize = 4) {
    this.cellSize = cellSize;
  }

  clear(): void {
    for (const list of this.cells.values()) {
      list.length = 0;
      this.listPool.push(list);
    }
    this.cells.clear();
  }

  private key(ix: number, iz: number): number {
    return ((ix + 1024) << 16) | ((iz + 1024) & 0xffff);
  }

  insert(x: number, z: number, item: T): void {
    const ix = Math.floor(x / this.cellSize);
    const iz = Math.floor(z / this.cellSize);
    const k = this.key(ix, iz);
    let list = this.cells.get(k);
    if (!list) {
      list = this.listPool.pop() ?? [];
      this.cells.set(k, list);
    }
    list.push(item);
  }

  /** Fills `out` with candidates in cells overlapping the circle (not distance-filtered). */
  query(x: number, z: number, radius: number, out: T[]): void {
    out.length = 0;
    const inv = 1 / this.cellSize;
    const minX = Math.floor((x - radius) * inv);
    const maxX = Math.floor((x + radius) * inv);
    const minZ = Math.floor((z - radius) * inv);
    const maxZ = Math.floor((z + radius) * inv);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const list = this.cells.get(this.key(ix, iz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) out.push(list[i]!);
      }
    }
  }
}
