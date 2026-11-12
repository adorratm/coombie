import { describe, expect, it } from 'vitest';
import { MatchRelay, NET_LIMITS, packZombies, unpackZombies } from '@protocol-z/shared';

const players = [
  { playerId: 'host', displayName: 'Host', operativeId: 'ironclad' },
  { playerId: 'g1', displayName: 'Guest', operativeId: 'ghost' },
];

function setup() {
  let n = 0;
  const relay = new MatchRelay(() => `tok-${++n}`);
  const tickets = relay.issueTickets('ALPHA-1', 'host', players, 0);
  return { relay, tickets };
}

describe('match relay', () => {
  it('admits ticket holders only and tells who hosts', () => {
    const { relay, tickets } = setup();
    expect(relay.join('nope', 'c0', 1).ok).toBe(false);
    const h = relay.join(tickets.get('host')!, 'c1', 1);
    const g = relay.join(tickets.get('g1')!, 'c2', 1);
    expect(h.ok && h.isHost).toBe(true);
    expect(g.ok && !g.isHost).toBe(true);
    expect(g.ok && g.roster.players.filter((p) => p.connected).length).toBe(2);
  });

  it('expires tickets nobody used', () => {
    const { relay, tickets } = setup();
    const r = relay.join(tickets.get('g1')!, 'c2', NET_LIMITS.ticketTtlMs + 1);
    expect(r.ok).toBe(false);
  });

  it('lets only the host send snapshots and enforces size limits', () => {
    const { relay, tickets } = setup();
    relay.join(tickets.get('host')!, 'c1', 1);
    relay.join(tickets.get('g1')!, 'c2', 1);
    expect(relay.authorize('c2', 'snapshot', 100, 2).ok).toBe(false);
    expect(relay.authorize('c1', 'snapshot', 100, 2).ok).toBe(true);
    expect(relay.authorize('c1', 'snapshot', NET_LIMITS.maxSnapshotBytes + 1, 2).ok).toBe(false);
    expect(relay.authorize('stranger', 'input', 10, 2).ok).toBe(false);
    const g = relay.authorize('c2', 'input', 200, 2);
    expect(g.ok && g.hostConnId).toBe('c1');
  });

  it('rate-limits a flooding connection and recovers', () => {
    const { relay, tickets } = setup();
    relay.join(tickets.get('g1')!, 'c2', 0);
    let passed = 0;
    for (let i = 0; i < 500; i++) if (relay.authorize('c2', 'input', 50, 10).ok) passed++;
    expect(passed).toBeLessThanOrEqual(NET_LIMITS.inputsPerSec);
    expect(relay.authorize('c2', 'input', 50, 1100).ok).toBe(true);
  });

  it('a guest may drop and rejoin; the host leaving ends the match', () => {
    const { relay, tickets } = setup();
    relay.join(tickets.get('host')!, 'c1', 1);
    relay.join(tickets.get('g1')!, 'c2', 1);
    const left = relay.leave('c2', 1000);
    expect(left?.ended).toBe(false);
    expect(relay.join(tickets.get('g1')!, 'c3', 5000).ok).toBe(true);
    expect(relay.join(tickets.get('g1')!, 'c4', 5000 + NET_LIMITS.rejoinMs).ok).toBe(true); // still connected via c3 → replaced
    const end = relay.leave('c1', 6000);
    expect(end?.ended).toBe(true);
    expect(relay.roomCount).toBe(0);
    expect(relay.join(tickets.get('g1')!, 'c5', 6001).ok).toBe(false);
  });

  it('a new start replaces the old match of the room', () => {
    const { relay, tickets } = setup();
    const again = relay.issueTickets('ALPHA-1', 'host', players, 10);
    expect(relay.join(tickets.get('host')!, 'c1', 11).ok).toBe(false);
    expect(relay.join(again.get('host')!, 'c1', 11).ok).toBe(true);
    expect(relay.roomCount).toBe(1);
  });

  it('sweeps rooms nobody joined', () => {
    const { relay } = setup();
    expect(relay.sweep(NET_LIMITS.ticketTtlMs + 5)).toBe(1);
    expect(relay.roomCount).toBe(0);
  });
});

describe('zombie codec', () => {
  it('round-trips within 5 cm / 0.01 rad and survives junk', () => {
    const src = [
      { id: 7, kind: 3, x: -41.37, z: 12.02, yaw: 2.513, hp: 0.5, flags: 5 },
      { id: 8, kind: 0, x: 0, z: 0, yaw: -3.1, hp: 1, flags: 0 },
    ];
    const back = unpackZombies(JSON.parse(JSON.stringify(packZombies(src))));
    expect(back.length).toBe(2);
    expect(Math.abs(back[0]!.x - src[0]!.x)).toBeLessThan(0.05);
    expect(Math.abs(back[0]!.yaw - src[0]!.yaw)).toBeLessThan(0.01);
    expect(Math.abs(back[0]!.hp - 0.5)).toBeLessThan(0.01);
    expect(back[0]!.flags).toBe(5);
    expect(unpackZombies([1, 2, 3]).length).toBe(0);
    expect(unpackZombies('x' as unknown as number[]).length).toBe(0);
  });

  it('a full 64-zombie snapshot stays far below the relay limit', () => {
    const many = Array.from({ length: 64 }, (_, i) => ({ id: 1000 + i, kind: i % 14, x: -100 + i * 3.1, z: 99.95 - i, yaw: 3.14, hp: 0.73, flags: 1 }));
    expect(JSON.stringify(packZombies(many)).length).toBeLessThan(NET_LIMITS.maxSnapshotBytes / 20);
  });
});
