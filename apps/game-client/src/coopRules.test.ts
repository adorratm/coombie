import { describe, expect, it } from 'vitest';
import { PICKUP_SECONDS, TEAM_WIPE_SECONDS, tickDowned, type DownState } from './coopRules';

const run = (seconds: number, mates: Array<{ x: number; z: number; alive: boolean }>, start: DownState = { pickup: 0, teamDown: 0 }) => {
  let s = { ...start, near: false, pickedUp: false, wiped: false };
  for (let t = 0; t < seconds; t += 0.05) {
    s = tickDowned(s, 0.05, 0, 0, mates);
    if (s.pickedUp || s.wiped) break;
  }
  return s;
};

describe('downed hero', () => {
  it('gets up when a living team mate stays close long enough', () => {
    expect(run(PICKUP_SECONDS - 0.5, [{ x: 1, z: 1, alive: true }]).pickedUp).toBe(false);
    expect(run(PICKUP_SECONDS + 0.2, [{ x: 1, z: 1, alive: true }]).pickedUp).toBe(true);
  });

  it('is not helped by dead or distant team mates', () => {
    expect(run(10, [{ x: 1, z: 0, alive: false }, { x: 30, z: 0, alive: true }]).pickedUp).toBe(false);
  });

  it('loses progress slowly when the helper steps away', () => {
    const half = run(1.5, [{ x: 1, z: 0, alive: true }]);
    const after = run(1, [{ x: 30, z: 0, alive: true }], half);
    expect(after.pickup).toBeGreaterThan(0.8);
    expect(after.pickup).toBeLessThan(half.pickup);
  });

  it('the run is lost only after the whole team has been down for a while', () => {
    expect(run(TEAM_WIPE_SECONDS - 1, [{ x: 1, z: 0, alive: false }]).wiped).toBe(false);
    expect(run(TEAM_WIPE_SECONDS + 1, [{ x: 1, z: 0, alive: false }]).wiped).toBe(true);
    expect(run(TEAM_WIPE_SECONDS + 1, []).wiped).toBe(true); // alone in the room
    expect(run(60, [{ x: 30, z: 0, alive: true }]).wiped).toBe(false);
  });
});
