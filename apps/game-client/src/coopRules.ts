/**
 * Co-op rules that do not need the scene (unit-tested).
 */

/** a living team mate this close is picking a downed hero up */
export const PICKUP_RADIUS = 3.2;
/** seconds of standing close until the hero is back on their feet */
export const PICKUP_SECONDS = 3;
/** the run is lost once nobody has been standing for this long */
export const TEAM_WIPE_SECONDS = 6;

export interface TeamMate {
  x: number;
  z: number;
  alive: boolean;
}

export interface DownState {
  /** 0 … PICKUP_SECONDS */
  pickup: number;
  /** seconds without any living team mate */
  teamDown: number;
}

export interface DownTick extends DownState {
  /** a living team mate is in range right now */
  near: boolean;
  /** the pickup just completed */
  pickedUp: boolean;
  /** everyone has been down long enough to lose */
  wiped: boolean;
}

/** One step for a hero who is down. Progress decays (at half speed) when the helper walks off. */
export function tickDowned(prev: DownState, dt: number, x: number, z: number, mates: Iterable<TeamMate>): DownTick {
  let near = false;
  let anyAlive = false;
  for (const m of mates) {
    if (!m.alive) continue;
    anyAlive = true;
    if (Math.hypot(m.x - x, m.z - z) < PICKUP_RADIUS) near = true;
  }
  const pickup = near ? prev.pickup + dt : Math.max(0, prev.pickup - dt * 0.5);
  const teamDown = anyAlive ? 0 : prev.teamDown + dt;
  const pickedUp = pickup >= PICKUP_SECONDS;
  return { pickup: pickedUp ? 0 : pickup, teamDown, near, pickedUp, wiped: teamDown > TEAM_WIPE_SECONDS };
}
