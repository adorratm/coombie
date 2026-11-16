import { describe, expect, it } from 'vitest';
import { makeAabb, type Aabb } from './collision';
import { TruckDriver, TruckPlanner, pushOutOfTruck, truckHitsWalls } from './truckNav';

/** a street block: a long wall across the middle with a gap at the east end, and a house in the way */
const level = (): Aabb[] => [
  makeAabb(-16, 0, 32, 1), // wall z∈[-1,1] from the west edge to x=16
  makeAabb(-5, 20, 4, 4), // house on the direct line north of the start
];

const drive = (planner: TruckPlanner, from: { x: number; z: number }, to: { x: number; z: number }, yaw = 0, seconds = 240) => {
  const path = planner.planDrive({ ...from, yaw }, to)!;
  expect(path).not.toBeNull();
  const d = new TruckDriver(from.x, from.z, yaw);
  d.setPath(path);
  let hit = false;
  let arrived = false;
  let dist = 0;
  let replans = 0;
  let reversed = false;
  for (let t = 0; t < seconds && !arrived; t += 1 / 30) {
    const r = d.step(1 / 30, 2.2, planner);
    dist += Math.abs(r.moved);
    if (r.moved < 0) reversed = true;
    if (truckHitsWalls(planner, d.x, d.z, d.yaw)) hit = true;
    if (r.replan) {
      replans++;
      d.setPath(planner.planDrive({ x: d.x, z: d.z, yaw: d.yaw }, to)!);
    }
    arrived = r.arrived;
  }
  return { d, path, hit, arrived, dist, replans, reversed };
};

describe('truck route planning', () => {
  it('goes round the wall through the gap instead of through it', () => {
    const p = new TruckPlanner(48, level());
    const path = p.plan({ x: -20, z: -20 }, { x: -20, z: 30 })!;
    expect(path).not.toBeNull();
    // every leg of the route is drivable with the truck's width
    for (let i = 1; i < path.length; i++) expect(p.lineClear(path[i - 1]!, path[i]!, 1.35)).toBe(true);
    // and it had to use the gap at the east end of the wall (x > 16)
    expect(Math.max(...path.map((q) => q.x))).toBeGreaterThan(16);
  });

  it('keeps to the middle of a corridor rather than scraping a wall', () => {
    const walls = [makeAabb(0, -6, 30, 1), makeAabb(0, 6, 30, 1)]; // 10 m wide street along x
    const p = new TruckPlanner(40, walls);
    const path = p.plan({ x: -25, z: -3 }, { x: 25, z: -3 })!;
    expect(Math.abs(path[Math.floor(path.length / 2)]!.z)).toBeLessThan(2.5);
  });

  it('says so when there is no way through', () => {
    const p = new TruckPlanner(30, [makeAabb(0, 0, 40, 1)]); // wall from edge to edge
    expect(p.plan({ x: 0, z: -15 }, { x: 0, z: 15 })).toBeNull();
  });

  it('a gap narrower than the truck is not a way through', () => {
    const p = new TruckPlanner(30, [makeAabb(-17, 0, 16, 1), makeAabb(17, 0, 16, 1)]); // 2 m gap at x=0
    expect(p.plan({ x: 0, z: -15 }, { x: 0, z: 15 })).toBeNull();
  });
});

describe('truck driving', () => {
  it('drives the route to the end without its body touching a wall', () => {
    const p = new TruckPlanner(48, level());
    const r = drive(p, { x: -20, z: -20 }, { x: -20, z: 30 });
    expect(r.arrived).toBe(true);
    expect(r.hit).toBe(false);
    expect(Math.hypot(r.d.x + 20, r.d.z - 30)).toBeLessThan(1.5);
  });

  it('cannot spin on the spot: turning round takes room, and it still gets there', () => {
    const p = new TruckPlanner(48, []);
    // facing away from the goal
    const r = drive(p, { x: 0, z: 0 }, { x: 0, z: -20 }, 0);
    expect(r.arrived).toBe(true);
    expect(r.dist).toBeGreaterThan(20 + 4); // it had to drive round, not pivot
    // and it never turned faster than its turning circle allows
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!;
      const b = r.path[i]!;
      const dy = Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)));
      expect(dy / Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z))).toBeLessThan(1 / TruckDriver.TURN_RADIUS + 1e-3);
    }
  });

  it('turns round in a street too narrow for a U-turn with a multi-point turn', () => {
    // a dead-end street 11 m wide along x: walls at z = ±5.5, closed at x = 30; the truck faces east, the goal is west
    const walls = [makeAabb(0, 6.5, 40, 1), makeAabb(0, -6.5, 40, 1), makeAabb(31, 0, 1, 8)];
    const p = new TruckPlanner(45, walls);
    const r = drive(p, { x: 0, z: 0 }, { x: -25, z: 0 }, Math.PI / 2);
    expect(r.arrived).toBe(true);
    expect(r.hit).toBe(false);
    expect(r.reversed).toBe(true); // it had to back up at least once
    expect(r.replans).toBe(0);
  });

  it('takes a right-angle corner into a side street', () => {
    // a main road going north (x∈[-5,5]) with a 9 m side street east at z∈[16,25]; everything else is buildings
    const walls = [makeAabb(-15, 0, 10, 45), makeAabb(20, 0, 15, 16), makeAabb(20, 35, 15, 10), makeAabb(0, 46, 45, 1)];
    const p = new TruckPlanner(45, walls);
    const r = drive(p, { x: 0, z: -30 }, { x: 30, z: 20.5 });
    expect(r.arrived).toBe(true);
    expect(r.hit).toBe(false);
    expect(r.replans).toBe(0); // the driver could drive exactly what was planned
  });

  it('plans in a few tens of milliseconds on a big map', () => {
    const walls: ReturnType<typeof makeAabb>[] = [];
    // a city grid of 12 m blocks with 9 m streets
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) if ((i + j) % 3 !== 0) walls.push(makeAabb(i * 21, j * 21, 6, 6));
    const p = new TruckPlanner(120, walls);
    const t0 = performance.now();
    const path = p.planDrive({ x: -105 + 10.5, z: -105 + 10.5, yaw: 0 }, { x: 94.5, z: 94.5 });
    expect(path).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(400);
  });

  it('stands still when told to brake', () => {
    const p = new TruckPlanner(48, []);
    const d = new TruckDriver(0, 0, 0);
    d.setPath([{ x: 0, z: 0 }, { x: 0, z: 30 }]);
    for (let i = 0; i < 60; i++) d.step(1 / 30, 2.2, p);
    for (let i = 0; i < 120; i++) d.step(1 / 30, 0, p);
    const z = d.z;
    d.step(1 / 30, 0, p);
    expect(d.z).toBe(z);
    expect(d.speed).toBe(0);
  });
});

describe('truck body', () => {
  it('pushes a hero standing in it out to its side', () => {
    const out = pushOutOfTruck(0.3, 1, 0.45, 0, 0, 0)!; // truck along z, hero inside, right of centre
    expect(out).not.toBeNull();
    expect(out.x).toBeCloseTo(1.3 + 0.45);
    expect(pushOutOfTruck(5, 0, 0.45, 0, 0, 0)).toBeNull();
    // rotated 90°: the truck now lies along x
    const r = pushOutOfTruck(1, 0.2, 0.45, 0, 0, Math.PI / 2)!;
    expect(Math.abs(r.z)).toBeCloseTo(1.75);
  });
});
