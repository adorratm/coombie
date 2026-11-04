import { describe, expect, it } from 'vitest';
import { applyStatus, rollStatusOnHit, tickZombieStatuses } from './statusEffects';
import type { ZombieVisual } from './characters';

function stubZombie(): ZombieVisual {
  return {
    speed: 3,
    baseSpeed: 3,
    statuses: [],
  } as unknown as ZombieVisual;
}

describe('statusEffects', () => {
  it('applies chill and restores speed after expiry', () => {
    const z = stubZombie();
    applyStatus(z, 'chill', 1);
    expect(z.speed).toBeLessThan(z.baseSpeed);
    z.statuses[0]!.remaining = 0.01;
    tickZombieStatuses(z, 0.05);
    expect(z.statuses.length).toBe(0);
    expect(z.speed).toBe(z.baseSpeed);
  });

  it('ticks burn damage over time', () => {
    const z = stubZombie();
    applyStatus(z, 'burn', 2);
    const first = tickZombieStatuses(z, 0.5);
    expect(first.damage).toBeGreaterThan(0);
  });

  it('rollStatusOnHit respects chance gates', () => {
    expect(rollStatusOnHit({ burn: 0, toxin: 0, chill: 0 }, 1)).toBeNull();
    let hits = 0;
    for (let i = 0; i < 40; i++) {
      if (rollStatusOnHit({ burn: 1 }, 1)) hits += 1;
    }
    expect(hits).toBeGreaterThan(20);
  });
});
