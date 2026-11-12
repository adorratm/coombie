import { describe, expect, it } from 'vitest';
import { buildSpawnField } from './spawnField';
import type { Aabb } from './collision';
import { aliveTarget, ambientRate, earlyDamageMul, hordeSpeedMul, initialSpawnCount, isHordeWave, spawnRate, waveBudget, zombieHpMul } from './spawnDirector';

describe('spawn director', () => {
  it('opens quieter than the old director and ends heavier', () => {
    // old formula: 6 at t=0/wave 1, capped at 38 late
    expect(aliveTarget(0, 1, 1)).toBeLessThan(6);
    expect(initialSpawnCount(1)).toBeLessThan(4);
    expect(aliveTarget(1800, 40, 1)).toBeGreaterThan(38);
  });

  it('pressure never drops as the run goes on', () => {
    let prev = 0;
    for (let wave = 1; wave <= 80; wave++) {
      const now = aliveTarget(wave * 45, wave, 1);
      expect(now).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
  });

  it('is gentler at the start and tougher late', () => {
    expect(earlyDamageMul(0)).toBeLessThan(0.7);
    expect(earlyDamageMul(600)).toBe(1);
    // old late game: 28 per wave, linear hp
    expect(waveBudget(30)).toBeGreaterThan(28 * 3);
    expect(ambientRate(1350, 30)).toBeGreaterThan(ambientRate(0, 1) * 5);
    expect(zombieHpMul(40)).toBeGreaterThan(1 + 39 * 0.12);
    expect(zombieHpMul(10)).toBe(1 + 9 * 0.12);
  });

  it('hordes recur, are bigger, denser and faster', () => {
    expect(isHordeWave(1)).toBe(false);
    expect(isHordeWave(4)).toBe(true);
    expect(isHordeWave(8)).toBe(true);
    expect(waveBudget(8)).toBeGreaterThan(waveBudget(9));
    expect(spawnRate(600, 8, true)).toBeGreaterThan(spawnRate(600, 8, false));
    expect(hordeSpeedMul(4)).toBeGreaterThan(1.1);
    expect(hordeSpeedMul(200)).toBeLessThanOrEqual(1.3);
  });
});

describe('spawn field', () => {
  const box = (minX: number, minZ: number, maxX: number, maxZ: number): Aabb => ({ minX, minZ, maxX, maxZ }) as Aabb;
  // a sealed room at (20..30, 20..30): four walls, hollow inside
  const room: Aabb[] = [box(20, 20, 30, 21), box(20, 29, 30, 30), box(20, 20, 21, 30), box(29, 20, 30, 30)];
  const field = buildSpawnField(40, room, 0, 0, 0.5, 1.5);

  it('rejects points outside the map, inside walls and in sealed pockets', () => {
    expect(field.reachable(0, 0)).toBe(true);
    expect(field.reachable(60, 0)).toBe(false);
    expect(field.reachable(20.5, 25)).toBe(false);
    expect(field.reachable(25, 25)).toBe(false);
  });

  it('snaps a bad point to nearby walkable ground', () => {
    const p = field.snap(25, 25);
    expect(field.reachable(p.x, p.z)).toBe(true);
    expect(Math.hypot(p.x - 25, p.z - 25)).toBeLessThan(10);
  });

  it('only ever picks reachable points, also for a directional horde', () => {
    for (let i = 0; i < 300; i++) {
      const p = field.pick(24, 24, 4, 14, Math.random, i % 2 ? { angle: 1, spread: 0.7 } : undefined);
      expect(p).not.toBeNull();
      expect(field.reachable(p!.x, p!.z)).toBe(true);
    }
  });
});
