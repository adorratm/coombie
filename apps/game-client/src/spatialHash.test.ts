import { describe, expect, it } from 'vitest';
import { SpatialHash2D } from './spatialHash';

describe('SpatialHash2D', () => {
  it('returns nearby candidates and skips far cells', () => {
    const hash = new SpatialHash2D<{ id: string }>(4);
    hash.insert(0, 0, { id: 'near' });
    hash.insert(40, 40, { id: 'far' });
    const out: Array<{ id: string }> = [];
    hash.query(1, 1, 3, out);
    expect(out.map((o) => o.id)).toContain('near');
    expect(out.map((o) => o.id)).not.toContain('far');
  });

  it('clear empties cells for rebuild', () => {
    const hash = new SpatialHash2D<number>(4);
    hash.insert(2, 2, 1);
    hash.clear();
    const out: number[] = [];
    hash.query(2, 2, 2, out);
    expect(out).toEqual([]);
  });
});
