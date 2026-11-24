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

/**
 * Wire protocol revision a client speaks. Guests put it in every input, the host in every snapshot.
 *   2 — binary zombie records (with absolute max hp), a guest's own weapon hits are decided on
 *       the guest and reported to the host (`hit` events), statuses ride along in `hit.s`
 * A peer that does not announce a revision is treated as 1 and gets the old behaviour.
 */
export const NET_PROTOCOL = 2;

export const NET_LIMITS = {
  snapshotHz: 15,
  inputHz: 20,
  /** relay drops anything above these */
  maxSnapshotBytes: 96_000,
  maxInputBytes: 1_024,
  maxEventBytes: 4_096,
  /** token-bucket capacity per second, per connection */
  snapshotsPerSec: 30,
  inputsPerSec: 40,
  eventsPerSec: 40,
  /** unused tickets expire */
  ticketTtlMs: 120_000,
  /** a dropped / departed player may come back with the same ticket for this long (while the match runs) */
  rejoinMs: 15 * 60_000,
  /** the host's connection may drop this long before the match is called off */
  hostGraceMs: 45_000,
  maxPlayers: 12,
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
  /** NET_PROTOCOL of the guest (absent = 1) */
  v?: number;
}

export interface NetSnapshot {
  seq: number;
  /** host sim time (s) */
  t: number;
  wave: number;
  kills: number;
  heroes: NetHero[];
  /** protocol 2: the heroes as flat tuples instead (`heroes` is then empty), see packHeroes */
  h?: unknown[];
  /** zombie records: a flat quantised number list (protocol 1) or the binary form (protocol 2), see packZombies / packZombiesBin */
  z: number[] | ArrayBuffer | Uint8Array;
  /** NET_PROTOCOL of the host (absent = 1) */
  v?: number;
  /** what the squad is doing right now; guests draw it instead of running their own objectives */
  obj?: NetObjective;
  /** a vehicle the squad escorts (convoy truck): x, z, yaw */
  veh?: number[];
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
  /** host → all: xp for a kill, shared (older hosts; newer ones send `loot`) */
  | { k: 'xp'; amount: number; x: number; z: number }
  /** host → all: kills since the last flush, flat [x, z, xp, zombieKind, …]; every player gets their own samples / drops there */
  | { k: 'loot'; l: (number | string)[] }
  | { k: 'banner'; text: string; dur: number }
  /** co-op pause: guest → host asks, host → all applies. `on: false` starts the 3-2-1 resume countdown */
  | { k: 'pause'; on: boolean; by: string }
  /**
   * hero ability cast (Q/E/R), so team mates can draw it. Guest → host, the host relays it to everyone
   * with `by` filled in; host casts go straight to the room. `lv` = ability level, `pw`/`ae` = power / area multipliers.
   */
  | { k: 'cast'; slot: string; x: number; z: number; yaw: number; by?: string; hero?: string; lv?: number; pw?: number; ae?: number }
  /** radio fire support (H) called on x/z — same routing as `cast` */
  | { k: 'sup'; x: number; z: number; by?: string }
  /** a hero's run skills, so team mates can draw the passive ones: flat [skillId, level, evolution branch or '', …] */
  | { k: 'kit'; s: (string | number)[]; pw?: number; by?: string }
  /**
   * guest → host: damage the guest dealt — flat [zombieId, amount, …]. Protocol 2 guests report their
   * weapon hits here too; `s` = statuses those hits applied, flat [zombieId, statusIndex, power, …]
   */
  | { k: 'hit'; h: number[]; s?: number[] }
  /** guest → host: melee / point-blank hit request is NOT trusted; the host fires for every hero */
  | { k: 'end'; won: boolean; title: string; subtitle: string };

/* ───────────── hero tuple codec (protocol 2 snapshots) ───────────── */

const H_FIELDS = 8;

/** [id, x, z, yaw, hp, maxHp, bits (1 alive · 2 firing · 4 moving), weapon] per hero — a third of the keyed JSON */
export function packHeroes(list: readonly NetHero[]): unknown[] {
  const out: unknown[] = [];
  for (const h of list) {
    out.push(h.id, Math.round(h.x * 100) / 100, Math.round(h.z * 100) / 100, Math.round(h.yaw * 100) / 100, Math.round(h.hp), Math.round(h.maxHp), (h.alive ? 1 : 0) | (h.firing ? 2 : 0) | (h.moving ? 4 : 0), h.weapon);
  }
  return out;
}

export function unpackHeroes(flat: unknown): NetHero[] {
  const out: NetHero[] = [];
  if (!Array.isArray(flat)) return out;
  for (let o = 0; o + H_FIELDS <= flat.length && out.length < 16; o += H_FIELDS) {
    const bits = Number(flat[o + 6]) | 0;
    out.push({
      id: String(flat[o]),
      x: Number(flat[o + 1]),
      z: Number(flat[o + 2]),
      yaw: Number(flat[o + 3]),
      hp: Number(flat[o + 4]),
      maxHp: Number(flat[o + 5]),
      alive: (bits & 1) !== 0,
      firing: (bits & 2) !== 0,
      moving: (bits & 4) !== 0,
      weapon: String(flat[o + 7]),
      dmg: 1,
    });
  }
  return out;
}

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
  /** absolute max hp (binary records only) — lets a guest predict its own hits */
  maxHp?: number;
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

/* binary record, little endian: id u32 · x i16 · z i16 · yaw u8 · hp u8 · kind u8 · flags u16 · maxHp u16 (5-bit exponent, 11-bit mantissa) */
export const Z_BIN_BYTES = 15;
const TAU = Math.PI * 2;
const clampI16 = (v: number): number => (v > 32767 ? 32767 : v < -32768 ? -32768 : v);

/** max hp in 16 bits: exact up to 2047, within 0.05 % above (bosses run into the hundreds of thousands) */
function packHp16(v: number): number {
  let n = Math.max(0, Math.round(v));
  let e = 0;
  while (n > 2047 && e < 31) {
    n = Math.round(n / 2);
    e++;
  }
  return (e << 11) | Math.min(2047, n);
}
const unpackHp16 = (u: number): number => (u & 2047) * 2 ** (u >> 11);

/** The same records as packZombies in 15 bytes each (a bit over half the JSON list, with max hp added and no parse cost). */
export function packZombiesBin(list: readonly NetZombie[]): ArrayBuffer {
  const buf = new ArrayBuffer(list.length * Z_BIN_BYTES);
  const dv = new DataView(buf);
  let o = 0;
  for (const z of list) {
    dv.setUint32(o, z.id >>> 0, true);
    dv.setInt16(o + 4, clampI16(Math.round(z.x * POS_Q)), true);
    dv.setInt16(o + 6, clampI16(Math.round(z.z * POS_Q)), true);
    dv.setUint8(o + 8, Math.round((((z.yaw % TAU) + TAU) % TAU) * (256 / TAU)) & 255);
    dv.setUint8(o + 9, Math.max(0, Math.min(255, Math.round(z.hp * 255))));
    dv.setUint8(o + 10, z.kind & 255);
    dv.setUint16(o + 11, z.flags & 0xffff, true);
    dv.setUint16(o + 13, packHp16(z.maxHp ?? 0), true);
    o += Z_BIN_BYTES;
  }
  return buf;
}

function binView(raw: unknown): DataView | null {
  if (raw instanceof ArrayBuffer) return new DataView(raw);
  if (ArrayBuffer.isView(raw)) return new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  return null;
}

export function unpackZombies(flat: readonly number[] | ArrayBuffer | ArrayBufferView): NetZombie[] {
  const out: NetZombie[] = [];
  const dv = binView(flat);
  if (dv) {
    for (let o = 0; o + Z_BIN_BYTES <= dv.byteLength; o += Z_BIN_BYTES) {
      const maxHp = unpackHp16(dv.getUint16(o + 13, true));
      out.push({
        id: dv.getUint32(o, true),
        x: dv.getInt16(o + 4, true) / POS_Q,
        z: dv.getInt16(o + 6, true) / POS_Q,
        yaw: dv.getUint8(o + 8) * (TAU / 256),
        hp: dv.getUint8(o + 9) / 255,
        kind: dv.getUint8(o + 10),
        flags: dv.getUint16(o + 11, true),
        ...(maxHp > 0 ? { maxHp } : {}),
      });
    }
    return out;
  }
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
  /** opaque start data (mission) handed again to players who come back */
  meta?: unknown;
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
    meta?: unknown,
  ): Map<string, string> {
    this.dropRoom(roomCode);
    const room: RelayRoom = { roomCode, hostPlayerId, players: new Map(), createdAt: now, started: false, meta };
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
    const roster = this.roster(room);
    // The host's world keeps running only while the host is there: a host blip gets a
    // grace period (expiredHosts), but when nobody at all is connected the match is over.
    const ended = ![...room.players.values()].some((p) => p.connected);
    if (ended) this.dropRoom(room.roomCode);
    return { roomCode: room.roomCode, playerId: player.playerId, ended, roster };
  }

  /** Rooms whose host has been gone longer than the grace period: dropped, codes returned. */
  expiredHosts(now: number): string[] {
    const out: string[] = [];
    for (const room of [...this.rooms.values()]) {
      const host = room.players.get(room.hostPlayerId);
      if (!room.started || !host || host.connected) continue;
      if (now - host.lastSeen > NET_LIMITS.hostGraceMs) {
        this.dropRoom(room.roomCode);
        out.push(room.roomCode);
      }
    }
    return out;
  }

  /** Is a match of this room running (host present or within its grace)? */
  isRunning(roomCode: string, now: number): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || !room.started) return false;
    const host = room.players.get(room.hostPlayerId);
    return !!host && (host.connected || now - host.lastSeen <= NET_LIMITS.hostGraceMs);
  }

  /**
   * A player (back) into a running match: the ticket they had, or a fresh one for someone
   * who was not in it at start (late join, up to maxPlayers). Null when no match runs.
   */
  rejoinTicket(
    roomCode: string,
    player: { playerId: string; displayName: string; operativeId: string },
    now: number,
  ): { ticket: string; meta: unknown; late: boolean } | null {
    if (!this.isRunning(roomCode, now)) return null;
    const room = this.rooms.get(roomCode)!;
    // the host's world lives in the host's tab: a new page cannot take it over
    if (player.playerId === room.hostPlayerId) return null;
    const known = room.players.get(player.playerId);
    if (known) {
      // the window restarts: they are actively coming back
      if (!known.connected) known.lastSeen = now;
      return { ticket: known.token, meta: room.meta, late: false };
    }
    if (room.players.size >= NET_LIMITS.maxPlayers) return null;
    const token = this.tokenFactory();
    room.players.set(player.playerId, { ...player, connected: false, token, connId: null, lastSeen: now });
    this.byToken.set(token, { roomCode, playerId: player.playerId });
    return { ticket: token, meta: room.meta, late: true };
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
