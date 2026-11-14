import { describe, expect, test } from 'vitest';
import { NET_MAX_MARKS, sanitizeObjective } from '@protocol-z/shared';

describe('sanitizeObjective', () => {
  test('passes a well-formed objective through', () => {
    const objective = sanitizeObjective({ label: 'Bölge 1/4', prog: 12, target: 140, marks: [[3.5, -8, 0x38bdf8, 6, '⚑', 'Bölge']] });

    expect(objective).toEqual({ label: 'Bölge 1/4', prog: 12, target: 140, marks: [[3.5, -8, 0x38bdf8, 6, '⚑', 'Bölge']] });
  });

  test('returns null when there is no objective', () => {
    expect(sanitizeObjective(undefined)).toBeNull();
    expect(sanitizeObjective('x')).toBeNull();
  });

  test('caps the number of markers', () => {
    const marks = Array.from({ length: 50 }, () => [0, 0, 0, 1, 'x', 'y']);

    expect(sanitizeObjective({ label: '', prog: 0, target: 1, marks })!.marks).toHaveLength(NET_MAX_MARKS);
  });

  test('replaces non-numeric coordinates and clamps the radius', () => {
    const objective = sanitizeObjective({ label: 'x', prog: NaN, target: 0, marks: [['a', null, 'red', 9999, 5, {}], 'junk'] })!;

    expect(objective.prog).toBe(0);
    expect(objective.target).toBeGreaterThan(0);
    expect(objective.marks).toHaveLength(1);
    expect(objective.marks[0]!.slice(0, 4)).toEqual([0, 0, 0xffffff, 20]);
  });

  test('truncates long text', () => {
    const objective = sanitizeObjective({ label: 'a'.repeat(500), prog: 0, target: 1, marks: [[0, 0, 0, 0, 'icon-too-long', 'b'.repeat(200)]] })!;

    expect(objective.label).toHaveLength(120);
    expect(objective.marks[0]![4]).toHaveLength(4);
    expect(objective.marks[0]![5]).toHaveLength(40);
  });
});
