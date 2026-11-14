/**
 * Co-op match netcode — protocol + relay rules (pure, unit-tested).
 *
 * Model: the room host's client runs the world (zombies, spawns, damage, objectives).
 * Every client owns its own hero (movement, aim, hp, progression) and reports it to the
 * host. The server never simulates: it authenticates sockets with one-time tickets issued
 * when the lobby starts, and relays messages with size / rate limits.
 *
 *   guest → host   match:input     own hero state, ~20 Hz (volatile)
 *   host  → guests match:snapshot  heroes + zombies, ~12 Hz (volatile)
 *   any   → room   match:event     reliable one-shots (damage, kills, banners, abilities, end)
 */

export const NetEvents = {
  Join: 'match:join',
  Roster: 'match:roster',
  Input: 'match:input',
  Snapshot: 'match:snapshot',
  Event: 'match:event',
  Ended: 'match:ended',
} as const;

export const NET_LIMITS = {
  snapshotHz: 12,
  inputHz: 20,
  /** relay drops anything above these */
  maxSnapshotBytes: 96_000,
  maxInputBytes: 1_024,
  maxEventBytes: 4_096,
  /** token-bucket capacity per second, per connection */
  snapshotsPerSec: 20,
  inputsPerSec: 40,
  eventsPerSec: 40,
  /** unused tickets expire */
  ticketTtlMs: 120_000,
  /** a dropped player may come back with the same ticket for this long */
  rejoinMs: 60_000,
} as const;

export interface NetRosterPlayer {
  playerId: string;
  displayName: string;
  operativeId: string;
  connected: boolean;
}

export interface NetRoster {
  roomCode: string;
  hostPlayerId: string;
  you: string;
  players: NetRosterPlayer[];
}

/** A hero as its owner reports it (guest → host) and as the host rebroadcasts it. */
export interface NetHero {
  id: string;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** weapon variant id */
  weapon: string;
  firing: boolean;
  moving: boolean;
  /** owner's damage multiplier (upgrades), applied by the host when it fires for this hero */
  dmg: number;
}

export interface NetInput extends NetHero {
  seq: number;
}

export interface NetSnapshot {
  seq: number;
  /** host sim time (s) */
  t: number;
  wave: number;
  kills: number;
  heroes: NetHero[];
  /** flat quantised zombie records, see packZombies */
  z: number[];
  /** what the squad is doing right now; guests draw it instead of running their own objectives */
  obj?: NetObjective;
}

/** One objective marker: x, z, colour, ground-ring radius (0 = arrow only), icon, label. */
export type NetMark = [x: number, z: number, color: number, radius: number, icon: string, label: string];

export interface NetObjective {
  label: string;
  prog: number;
  target: number;
  marks: NetMark[];
}

export const NET_MAX_MARKS = 12;

const finite = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Guests never trust the shape of what arrives: clamp it or drop it. */
export function sanitizeObjective(raw: unknown): NetObjective | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<NetObjective>;
  const marks: NetMark[] = [];
  if (Array.isArray(o.marks)) {
    for (const m of o.marks.slice(0, NET_MAX_MARKS)) {
      if (!Array.isArray(m)) continue;
      marks.push([finite(m[0]), finite(m[1]), finite(m[2], 0xffffff) & 0xffffff, Math.max(0, Math.min(20, finite(m[3]))), String(m[4] ?? '').slice(0, 4), String(m[5] ?? '').slice(0, 40)]);
    }
  }
  return { label: String(o.label ?? '').slice(0, 120), prog: finite(o.prog), target: Math.max(1e-6, finite(o.target, 1)), marks };
}

export type NetEvent =
  /** host → one hero: you were hit */
  | { k: 'dmg'; to: string; amount: number; fx: number; fz: number }
  /** host → all: xp for a kill, shared */
  | { k: 'xp'; amount: number; x: number; z: number }
  | { k: 'banner'; text: string; dur: number }
  /** guest → host: hero ability cast */
  | { k: 'cast'; slot: string; x: number; z: number; yaw: number }
  /** guest → host: ability / skill damage the guest dealt — flat [zombieId, amount, …] */
  | { k: 'hit'; h: number[] }
  /** guest → host: melee / point-blank hit request is NOT trusted; the host fires for every hero */
  | { k: 'end'; won: boolean; title: string; subtitle: string };

/* ───────────── zombie record codec ───────────── */

export interface NetZombie {
  id: number;
  /** index into the client's kind table */
  kind: number;
  x: number;
  z: number;
  yaw: number;
  /** 0..1 */
  hp: number;
  /** bit 0 attacking · bit 1 emerging · bit 2 stunned · bits 3-5 boss variant (0 = none, else index + 1) */
  flags: number;
}

const Z_FIELDS = 7;
const POS_Q = 20; // 5 cm
const YAW_Q = 100;

export function packZombies(list: readonly NetZombie[]): number[] {
  const out = new Array<number>(list.length * Z_FIELDS);
  let o = 0;
  for (const z of list) {
    out[o++] = z.id;
    out[o++] = z.kind;
    out[o++] = Math.round(z.x * POS_Q);
    out[o++] = Math.round(z.z * POS_Q);
    out[o++] = Math.round(z.yaw * YAW_Q);
    out[o++] = Math.max(0, Math.min(255, Math.round(z.hp * 255)));
    out[o++] = z.flags | 0;
  }
  return out;
}

export function unpackZombies(flat: readonly number[]): NetZombie[] {
  const out: NetZombie[] = [];
  if (!Array.isArray(flat)) return out;
  for (let o = 0; o + Z_FIELDS <= flat.length; o += Z_FIELDS) {
    const id = flat[o]!;
    if (!Number.isFinite(id)) continue;
    out.push({
      id,
      kind: flat[o + 1]! | 0,
      x: flat[o + 2]! / POS_Q,
      z: flat[o + 3]! / POS_Q,
      yaw: flat[o + 4]! / YAW_Q,
      hp: flat[o + 5]! / 255,
      flags: flat[o + 6]! | 0,
    });
  }
  return out;
}

/* ───────────── relay (server side, no I/O) ───────────── */

export type RelayKind = 'snapshot' | 'input' | 'event';

interface RelayPlayer extends NetRosterPlayer {
  token: string;
  connId: string | null;
  lastSeen: number;
}

interface RelayRoom {
  roomCode: string;
  hostPlayerId: string;
  players: Map<string, RelayPlayer>;
  createdAt: number;
  started: boolean;
}

interface Bucket {
  tokens: number;
  at: number;
}

export type RelayJoinResult =
  | { ok: true; roomCode: string; playerId: string; isHost: boolean; roster: Omit<NetRoster, 'you'> }
  | { ok: false; error: 'BAD_TICKET' | 'EXPIRED' };

export type RelaySendResult =
  | { ok: true; roomCode: string; playerId: string; isHost: boolean; hostConnId: string | null }
  | { ok: false; error: 'NOT_JOINED' | 'NOT_HOST' | 'TOO_LARGE' | 'RATE' };

export interface RelayLeaveResult {
  roomCode: string;
  playerId: string;
  /** the host left → the match is over for everyone */
  ended: boolean;
  roster: Omit<NetRoster, 'you'>;
}

/**
 * Bookkeeping for relayed matches. One instance per server process.
 * `tokenFactory` must return an unguessable string (crypto on the server).
 */
export class MatchRelay {
  private readonly rooms = new Map<string, RelayRoom>();
  private readonly byToken = new Map<string, { roomCode: string; playerId: string }>();
  private readonly byConn = new Map<string, { roomCode: string; playerId: string }>();
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly tokenFactory: () => string) {}

  /** Lobby started: replace any previous match of the room and hand out one ticket per player. */
  issueTickets(
    roomCode: string,
    hostPlayerId: string,
    players: ReadonlyArray<{ playerId: string; displayName: string; operativeId: string }>,
    now: number,
  ): Map<string, string> {
    this.dropRoom(roomCode);
    const room: RelayRoom = { roomCode, hostPlayerId, players: new Map(), createdAt: now, started: false };
    const out = new Map<string, string>();
    for (const p of players) {
      const token = this.tokenFactory();
      room.players.set(p.playerId, { ...p, connected: false, token, connId: null, lastSeen: now });
      this.byToken.set(token, { roomCode, playerId: p.playerId });
      out.set(p.playerId, token);
    }
    this.rooms.set(roomCode, room);
    return out;
  }

  join(token: string, connId: string, now: number): RelayJoinResult {
    const ref = typeof token === 'string' ? this.byToken.get(token) : undefined;
    const room = ref && this.rooms.get(ref.roomCode);
    const player = room?.players.get(ref!.playerId);
    if (!ref || !room || !player) return { ok: false, error: 'BAD_TICKET' };
    const idle = now - player.lastSeen;
    if (!player.connected && idle > (room.started ? NET_LIMITS.rejoinMs : NET_LIMITS.ticketTtlMs)) {
      return { ok: false, error: 'EXPIRED' };
    }
    // a second socket for the same player replaces the first
    if (player.connId && player.connId !== connId) this.byConn.delete(player.connId);
    player.connId = connId;
    player.connected = true;
    player.lastSeen = now;
    room.started = true;
    this.byConn.set(connId, ref);
    return { ok: true, roomCode: room.roomCode, playerId: player.playerId, isHost: player.playerId === room.hostPlayerId, roster: this.roster(room) };
  }

  leave(connId: string, now: number): RelayLeaveResult | null {
    const ref = this.byConn.get(connId);
    if (!ref) return null;
    this.byConn.delete(connId);
    for (const k of ['snapshot', 'input', 'event'] as const) this.buckets.delete(`${connId}:${k}`);
    const room = this.rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    if (!room || !player || player.connId !== connId) return null;
    player.connId = null;
    player.connected = false;
    player.lastSeen = now;
    const ended = player.playerId === room.hostPlayerId;
    const roster = this.roster(room);
    if (ended || ![...room.players.values()].some((p) => p.connected)) this.dropRoom(room.roomCode);
    return { roomCode: room.roomCode, playerId: player.playerId, ended, roster };
  }

  /** May this connection relay a message of this kind and size right now? */
  authorize(connId: string, kind: RelayKind, bytes: number, now: number): RelaySendResult {
    const ref = this.byConn.get(connId);
    const room = ref && this.rooms.get(ref.roomCode);
    if (!ref || !room) return { ok: false, error: 'NOT_JOINED' };
    const isHost = ref.playerId === room.hostPlayerId;
    if (kind === 'snapshot' && !isHost) return { ok: false, error: 'NOT_HOST' };
    const max = kind === 'snapshot' ? NET_LIMITS.maxSnapshotBytes : kind === 'input' ? NET_LIMITS.maxInputBytes : NET_LIMITS.maxEventBytes;
    if (!(bytes >= 0) || bytes > max) return { ok: false, error: 'TOO_LARGE' };
    const rate = kind === 'snapshot' ? NET_LIMITS.snapshotsPerSec : kind === 'input' ? NET_LIMITS.inputsPerSec : NET_LIMITS.eventsPerSec;
    const key = `${connId}:${kind}`;
    const b = this.buckets.get(key) ?? { tokens: rate, at: now };
    b.tokens = Math.min(rate, b.tokens + ((now - b.at) / 1000) * rate);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return { ok: false, error: 'RATE' };
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    const host = room.players.get(room.hostPlayerId);
    return { ok: true, roomCode: room.roomCode, playerId: ref.playerId, isHost, hostConnId: host?.connId ?? null };
  }

  /** Drop rooms nobody ever joined / everyone left long ago. Call periodically. */
  sweep(now: number): number {
    let n = 0;
    for (const room of [...this.rooms.values()]) {
      const anyConnected = [...room.players.values()].some((p) => p.connected);
      const last = Math.max(room.createdAt, ...[...room.players.values()].map((p) => p.lastSeen));
      if (!anyConnected && now - last > NET_LIMITS.ticketTtlMs) {
        this.dropRoom(room.roomCode);
        n++;
      }
    }
    return n;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private roster(room: RelayRoom): Omit<NetRoster, 'you'> {
    return {
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      players: [...room.players.values()].map((p) => ({ playerId: p.playerId, displayName: p.displayName, operativeId: p.operativeId, connected: p.connected })),
    };
  }

  private dropRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    for (const p of room.players.values()) {
      this.byToken.delete(p.token);
      if (p.connId) {
        this.byConn.delete(p.connId);
        for (const k of ['snapshot', 'input', 'event'] as const) this.buckets.delete(`${p.connId}:${k}`);
      }
    }
    this.rooms.delete(roomCode);
  }
}
