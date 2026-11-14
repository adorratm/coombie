import { describe, expect, test } from 'vitest';
import { blitzTarget, HUNT_TARGETS, huntTargetKind, pickNextZone, ZONE_DECAY, zoneProgress } from './modeRules';

describe('zoneProgress', () => {
  test('grows while the zone is held', () => {
    expect(zoneProgress(10, 0.5, true)).toBe(10.5);
  });

  test('drains slower than it fills when the zone is empty', () => {
    expect(zoneProgress(10, 1, false)).toBe(10 - ZONE_DECAY);
  });

  test('never drops below zero', () => {
    expect(zoneProgress(0.1, 5, false)).toBe(0);
  });
});

describe('pickNextZone', () => {
  const candidates = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 40, z: 0 }];

  test('picks the farthest unused candidate', () => {
    expect(pickNextZone(candidates, new Set(), { x: 0, z: 0 })).toBe(2);
  });

  test('skips candidates that were already used', () => {
    expect(pickNextZone(candidates, new Set([2]), { x: 0, z: 0 })).toBe(1);
  });

  test('returns -1 when every candidate is used', () => {
    expect(pickNextZone(candidates, new Set([0, 1, 2]), { x: 0, z: 0 })).toBe(-1);
  });
});

describe('blitzTarget', () => {
  test('scales with the difficulty crowd multiplier', () => {
    expect(blitzTarget(1)).toBe(260);
    expect(blitzTarget(1.6)).toBeGreaterThan(blitzTarget(1));
    expect(blitzTarget(0.8)).toBeLessThan(blitzTarget(1));
  });

  test('is a round number', () => {
    for (const mul of [0.8, 1, 1.2, 1.4, 1.6]) expect(blitzTarget(mul) % 10).toBe(0);
  });
});

describe('huntTargetKind', () => {
  test('ends the list with a boss', () => {
    expect(huntTargetKind(HUNT_TARGETS - 1)).toBe('boss');
  });

  test('marks no boss before the last target', () => {
    for (let i = 0; i < HUNT_TARGETS - 1; i++) expect(huntTargetKind(i)).not.toBe('boss');
  });
});
