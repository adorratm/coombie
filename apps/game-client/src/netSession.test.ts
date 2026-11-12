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
    expect(built).toBeGreaterThanOrEqual(11);
    expect(built).toBeLessThanOrEqual(13);
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

describe('snapshot interpolation', () => {
  const z = (x: number, yaw = 0) => ({ id: 1, kind: 0, x, z: 0, yaw, hp: 1, flags: 0 });
  const frame = (t: number, x: number, extra: Array<ReturnType<typeof z>> = []) => ({ t, wave: 1, kills: 0, heroes: [], zombies: [z(x), ...extra] });

  it('renders slightly in the past, between two snapshots', () => {
    const b = new SnapshotBuffer();
    b.push(frame(10, 0), 100);
    b.push(frame(10.1, 1), 100.1);
    const w = b.sample(100.1 + INTERP_DELAY - 0.05)!; // host time 10.05
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

  it('holds the last pose when the host goes quiet', () => {
    const b = new SnapshotBuffer();
    b.push(frame(1, 0), 0);
    b.push(frame(1.1, 1), 0.1);
    expect(b.sample(30)!.zombies[0]!.x).toBe(1);
  });

  it('turns the short way round', () => {
    expect(Math.abs(lerpAngle(3.1, -3.1, 0.5))).toBeGreaterThan(3.1);
  });
});
