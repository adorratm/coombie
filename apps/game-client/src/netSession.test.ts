import { describe, expect, it } from 'vitest';
import { NetEvents, type NetHero, type NetRoster } from '@protocol-z/shared';
import { INTERP_DELAY, SnapshotBuffer, lerpAngle } from './netInterp';
import { NetSession, type NetTransport } from './netSession';

/** two fake sockets wired through a tiny in-memory "relay" */
function pair() {
  let now = 0;
  const mk = () => {
    const handlers = new Map<string, Array<(p: never) => void>>();
    const sent: Array<{ event: string; payload: unknown }> = [];
    const io: NetTransport & { fire: (e: string, p: unknown) => void; sent: typeof sent } = {
      emit: (event, payload, ack) => {
        sent.push({ event, payload });
        if (event === NetEvents.Join) ack?.({ ok: true, playerId: (payload as { ticket: string }).ticket, isHost: (payload as { ticket: string }).ticket === 'h' });
      },
      on: (e, h) => void handlers.set(e, [...(handlers.get(e) ?? []), h]),
      off: (e, h) => void handlers.set(e, (handlers.get(e) ?? []).filter((x) => x !== h)),
      fire: (e, p) => (handlers.get(e) ?? []).forEach((h) => h(p as never)),
      sent,
    };
    return io;
  };
  const hio = mk();
  const gio = mk();
  const roster = (you: string): NetRoster => ({ roomCode: 'R', hostPlayerId: 'h', you, players: [{ playerId: 'h', displayName: 'H', operativeId: 'ironclad', connected: true }, { playerId: 'g', displayName: 'G', operativeId: 'ghost', connected: true }] });
  const host = new NetSession(hio, {}, () => now);
  const events: string[] = [];
  const guest = new NetSession(gio, { onEvent: (e, from) => events.push(`${e.k}<${from}`), onEnded: (r) => events.push(`end:${r}`) }, () => now);
  return { host, guest, hio, gio, roster, events, tick: (dt: number) => (now += dt), time: () => now };
}

const hero = (x: number): Omit<NetHero, 'id'> => ({ x, z: 0, yaw: 0, hp: 100, maxHp: 100, alive: true, weapon: 'rifle', firing: false, moving: true, dmg: 1 });

describe('net session', () => {
  it('joins with the ticket and takes the role the server assigns', async () => {
    const { host, guest } = pair();
    expect(await host.join('h')).toBe('host');
    expect(await guest.join('g')).toBe('guest');
  });

  it('throttles guest input and the host keeps only the newest valid report', async () => {
    const { host, guest, hio, gio, roster, tick } = pair();
    await host.join('h');
    await guest.join('g');
    hio.fire(NetEvents.Roster, roster('h'));
    let sent = 0;
    for (let i = 0; i < 100; i++) {
      tick(0.005); // 200 fps for half a second
      if (guest.guestPublish(hero(i))) sent++;
    }
    expect(sent).toBeLessThanOrEqual(11);
    expect(sent).toBeGreaterThanOrEqual(9);
    const inputs = gio.sent.filter((m) => m.event === NetEvents.Input).map((m) => m.payload as { seq: number; x: number });
    // deliver out of order + junk: newest wins, junk is ignored
    hio.fire(NetEvents.Input, { from: 'g', d: inputs[inputs.length - 1] });
    hio.fire(NetEvents.Input, { from: 'g', d: inputs[0] });
    hio.fire(NetEvents.Input, { from: 'g', d: { ...inputs[0], seq: 9999, x: Number.NaN } });
    hio.fire(NetEvents.Input, { from: 'evil', d: { x: 1e9 } });
    expect(host.liveRemoteHeroes().length).toBe(1);
    expect(host.liveRemoteHeroes()[0]!.x).toBe(inputs[inputs.length - 1]!.x);
    tick(10);
    expect(host.liveRemoteHeroes().length).toBe(0); // silent guest is no longer a target
  });

  it('guests cannot publish snapshots; the host builds one only when due', async () => {
    const { host, guest, tick } = pair();
    await host.join('h');
    await guest.join('g');
    let built = 0;
    const world = () => (built++, { t: 1, wave: 1, kills: 0, heroes: [], zombies: [] });
    expect(guest.hostPublish(world)).toBe(false);
    for (let i = 0; i < 60; i++) {
      tick(1 / 60);
      host.hostPublish(world);
    }
    expect(built).toBeGreaterThanOrEqual(14);
    expect(built).toBeLessThanOrEqual(16);
  });

  it('delivers events and the end of the match', async () => {
    const { guest, gio, events } = pair();
    await guest.join('g');
    gio.fire(NetEvents.Event, { from: 'h', d: { k: 'banner', text: 'HORDE', dur: 3 } });
    gio.fire(NetEvents.Event, { from: 'h', d: null });
    gio.fire(NetEvents.Ended, { reason: 'HOST_LEFT' });
    expect(events).toEqual(['banner<h', 'end:HOST_LEFT']);
    expect(guest.guestPublish(hero(1))).toBe(false);
  });
});

describe('wire protocol', () => {
  it('speaks JSON records until every guest has announced protocol 2, then binary', async () => {
    const { host, guest, hio, gio, roster, tick } = pair();
    await host.join('h');
    await guest.join('g');
    hio.fire(NetEvents.Roster, roster('h'));
    gio.fire(NetEvents.Roster, roster('g'));
    const world = () => ({ t: 1, wave: 1, kills: 0, heroes: [{ ...hero(4), id: 'h', firing: true }], zombies: [{ id: 7, kind: 1, x: 3.25, z: -4.5, yaw: 1, hp: 0.5, flags: 9, maxHp: 420 }] });
    tick(1);
    host.hostPublish(world);
    const first = hio.sent.filter((m) => m.event === NetEvents.Snapshot).pop()!.payload as { z: unknown; v: number };
    expect(Array.isArray(first.z)).toBe(true);
    expect((first as { heroes?: unknown[] }).heroes!.length).toBe(1);
    expect(first.v).toBe(2);
    // the guest reports in (protocol 2 rides on its input) …
    tick(1);
    guest.guestPublish(hero(1));
    hio.fire(NetEvents.Input, { from: 'g', d: gio.sent.filter((m) => m.event === NetEvents.Input).pop()!.payload });
    expect(host.guestProtocol('g')).toBe(2);
    tick(1);
    host.hostPublish(world);
    const second = hio.sent.filter((m) => m.event === NetEvents.Snapshot).pop()!.payload as { z: unknown };
    expect(second.z instanceof ArrayBuffer).toBe(true);
    // … and reads the binary form back, max hp included
    expect(guest.hostProtocol).toBe(1);
    gio.fire(NetEvents.Snapshot, second);
    expect(guest.hostProtocol).toBe(2);
    tick(1);
    const w = guest.sampleWorld()!;
    expect(w.zombies[0]).toMatchObject({ id: 7, kind: 1, x: 3.25, z: -4.5, flags: 9, maxHp: 420 });
    // heroes travel as flat tuples and come back whole
    expect((second as { h?: unknown[]; heroes?: unknown[] }).heroes).toEqual([]);
    expect(w.heroes[0]).toMatchObject({ id: 'h', x: 4, hp: 100, maxHp: 100, alive: true, firing: true, moving: true, weapon: 'rifle' });
  });

  it('treats a guest that never announced a protocol as an old client', async () => {
    const { host, hio, roster, tick } = pair();
    await host.join('h');
    hio.fire(NetEvents.Roster, roster('h'));
    hio.fire(NetEvents.Input, { from: 'g', d: { ...hero(1), id: 'g', seq: 1 } });
    expect(host.guestProtocol('g')).toBe(1);
    tick(1);
    host.hostPublish(() => ({ t: 1, wave: 1, kills: 0, heroes: [], zombies: [] }));
    expect(Array.isArray((hio.sent.filter((m) => m.event === NetEvents.Snapshot).pop()!.payload as { z: unknown }).z)).toBe(true);
  });
});

describe('snapshot interpolation', () => {
  const z = (x: number, yaw = 0) => ({ id: 1, kind: 0, x, z: 0, yaw, hp: 1, flags: 0 });
  const frame = (t: number, x: number, extra: Array<ReturnType<typeof z>> = []) => ({ t, wave: 1, kills: 0, heroes: [], zombies: [z(x), ...extra] });
  /** a zombie walking at 2 m/s, snapshots at 15 Hz; `late(i)` = extra travel time of packet i */
  const run = (late: (i: number) => number, seconds = 6) => {
    const b = new SnapshotBuffer();
    const packets: Array<{ at: number; f: ReturnType<typeof frame> }> = [];
    for (let i = 0; i * (1 / 15) < seconds; i++) {
      const t = i / 15;
      packets.push({ at: 100 + t + 0.04 + late(i), f: frame(t, t * 2) });
    }
    // TCP: packets never overtake each other
    for (let i = 1; i < packets.length; i++) packets[i]!.at = Math.max(packets[i]!.at, packets[i - 1]!.at);
    const xs: number[] = [];
    let p = 0;
    for (let now = 100; now < 100 + seconds; now += 1 / 60) {
      while (p < packets.length && packets[p]!.at <= now) b.push(packets[p]!.f, packets[p++]!.at);
      const w = b.sample(now);
      if (w) xs.push(w.zombies[0]!.x);
    }
    return { xs, b };
  };
  /** per-frame steps of the second half (after the buffer has settled) */
  const steps = (xs: number[]) => xs.slice(Math.floor(xs.length / 2)).map((x, i, a) => (i ? x - a[i - 1]! : 0)).slice(1);

  it('renders slightly in the past, between two snapshots', () => {
    const b = new SnapshotBuffer();
    b.push(frame(10, 0), 100);
    b.push(frame(10.1, 1), 100.1);
    const w = b.sample(100.1 + b.delay - 0.05)!; // host time 10.05
    expect(w.zombies[0]!.x).toBeGreaterThan(0.3);
    expect(w.zombies[0]!.x).toBeLessThan(0.7);
  });

  it('new zombies appear, dead ones vanish, stale packets are ignored', () => {
    const b = new SnapshotBuffer();
    b.push(frame(1, 0), 0);
    b.push({ t: 1.1, wave: 2, kills: 3, heroes: [], zombies: [{ ...z(5), id: 2 }] }, 0.1);
    b.push(frame(0.5, 99), 0.2); // late
    const w = b.sample(0.1 + INTERP_DELAY - 0.05)!;
    expect(w.zombies.map((q) => q.id)).toEqual([2]);
    expect(w.wave).toBe(2);
  });

  it('holds the last pose when the host goes quiet (after a short coast)', () => {
    const b = new SnapshotBuffer();
    b.push(frame(1, 0), 0);
    b.push(frame(1.1, 1), 0.1);
    const x = b.sample(30)!.zombies[0]!.x;
    expect(x).toBeGreaterThanOrEqual(1);
    expect(x).toBeLessThan(3); // never runs away
    expect(b.sample(60)!.zombies[0]!.x).toBe(x);
  });

  it('on a clean link the world moves at an even pace and stays close behind the host', () => {
    const { xs, b } = run(() => 0);
    const st = steps(xs);
    const want = 2 / 60;
    for (const d of st) expect(Math.abs(d - want)).toBeLessThan(want * 0.2);
    expect(b.delay).toBeLessThan(0.11);
  });

  it('on a jittery link it backs off instead of stuttering: no freezes, no jumps, never backwards', () => {
    // every packet up to 70 ms late, and a 180 ms stall every second
    const { xs, b } = run((i) => ((i * 7919) % 71) / 1000 + (i % 15 === 0 ? 0.18 : 0));
    const st = steps(xs);
    const want = 2 / 60;
    expect(Math.min(...st)).toBeGreaterThan(0); // never stops or runs backwards
    expect(Math.max(...st)).toBeLessThan(want * 1.6); // never leaps
    expect(b.delay).toBeGreaterThan(0.15); // it bought itself a bigger cushion
    expect(b.delay).toBeLessThanOrEqual(0.4);
  });

  it('a teleporting zombie snaps instead of sliding across the map', () => {
    const b = new SnapshotBuffer();
    b.push(frame(1, 0), 0);
    b.push(frame(1.1, 40), 0.1);
    const x = b.sample(0.1 + b.delay - 0.05)!.zombies[0]!.x;
    expect(x === 0 || x === 40).toBe(true);
  });

  it('turns the short way round', () => {
    expect(Math.abs(lerpAngle(3.1, -3.1, 0.5))).toBeGreaterThan(3.1);
  });
});
