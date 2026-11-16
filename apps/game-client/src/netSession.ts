import {
  NET_LIMITS,
  NET_PROTOCOL,
  NetEvents,
  packHeroes,
  packZombies,
  packZombiesBin,
  unpackHeroes,
  unpackZombies,
  sanitizeObjective,
  type NetObjective,
  type NetEvent,
  type NetHero,
  type NetInput,
  type NetRoster,
  type NetSnapshot,
  type NetZombie,
} from '@protocol-z/shared';
import { SnapshotBuffer, type WorldFrame } from './netInterp';

/** Anything socket.io-shaped. The web app passes its /match socket; tests pass a fake. */
export interface NetTransport {
  emit(event: string, payload?: unknown, ack?: (res: unknown) => void): void;
  on(event: string, handler: (payload: never) => void): void;
  off(event: string, handler: (payload: never) => void): void;
}

export type NetRole = 'host' | 'guest';

export interface NetSessionHandlers {
  /** reliable one-shot from the other side (`from` = sender's player id) */
  onEvent?: (ev: NetEvent, from: string) => void;
  onRoster?: (roster: NetRoster) => void;
  /** the host left / the room is gone */
  onEnded?: (reason: string) => void;
}

/**
 * One client's view of a co-op match.
 *
 *   host  → call `hostPublish()` every frame (throttled to snapshotHz), read `remoteHeroes`
 *   guest → call `guestPublish()` every frame (throttled to inputHz), read `sampleWorld()`
 */
export class NetSession {
  role: NetRole = 'guest';
  playerId = '';
  roster: NetRoster | null = null;
  ended: string | null = null;
  /** false while the socket is down and we are trying to get back in */
  link = true;
  /** host: latest reported state of every guest hero */
  readonly remoteHeroes = new Map<string, NetHero & { at: number; seq: number; v: number }>();
  /** guest: wire protocol the host speaks (1 until its first snapshot says otherwise) */
  hostProtocol = 1;
  /** guest: the host's current objective (latest snapshot, not interpolated) */
  objective: NetObjective | null = null;
  private readonly buffer = new SnapshotBuffer();
  private seq = 0;
  private lastSent = -1;
  private objSig = '';
  private objAt = -10;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly io: NetTransport,
    /** replaceable: the arena installs its own handlers when a run starts */
    public handlers: NetSessionHandlers = {},
    private readonly clock: () => number = () => performance.now() / 1000,
  ) {
    this.listen(NetEvents.Roster, (r: NetRoster) => {
      this.roster = r;
      this.role = r.hostPlayerId === r.you ? 'host' : 'guest';
      // forget heroes of players who dropped
      for (const id of [...this.remoteHeroes.keys()]) {
        if (!r.players.some((p) => p.playerId === id && p.connected)) this.remoteHeroes.delete(id);
      }
      this.handlers.onRoster?.(r);
    });
    this.listen(NetEvents.Input, (m: { from: string; d: NetInput }) => {
      if (this.role !== 'host' || !m || typeof m.from !== 'string' || !validHero(m.d)) return;
      const prev = this.remoteHeroes.get(m.from);
      const seq = typeof m.d.seq === 'number' ? m.d.seq : 0;
      if (prev && seq <= prev.seq) return; // out of order
      const v = typeof m.d.v === 'number' && m.d.v >= 1 ? Math.floor(m.d.v) : 1;
      this.remoteHeroes.set(m.from, { ...m.d, id: m.from, seq, v, at: this.clock() });
    });
    this.listen(NetEvents.Snapshot, (s: NetSnapshot) => {
      if (this.role !== 'guest' || !s || !Number.isFinite(s.t)) return;
      const frame: WorldFrame = {
        t: s.t,
        wave: s.wave | 0,
        kills: s.kills | 0,
        zombies: unpackZombies(s.z),
        heroes: (Array.isArray(s.h) ? unpackHeroes(s.h) : Array.isArray(s.heroes) ? s.heroes : []).filter(validHero),
        veh: Array.isArray(s.veh) && s.veh.length >= 3 && s.veh.slice(0, 3).every((v) => Number.isFinite(v) && Math.abs(v) < 2000) ? s.veh.slice(0, 3) : null,
      };
      this.hostProtocol = typeof s.v === 'number' && s.v >= 1 ? Math.floor(s.v) : 1;
      this.buffer.push(frame, this.clock());
      // a protocol-2 host only repeats the objective when it changed (or once a second)
      if (s.obj !== undefined || this.hostProtocol < 2) this.objective = sanitizeObjective(s.obj);
    });
    this.listen(NetEvents.Event, (m: { from: string; d: NetEvent }) => {
      if (m && m.d && typeof m.d.k === 'string') this.handlers.onEvent?.(m.d, String(m.from));
    });
    this.listen(NetEvents.Ended, (m: { reason?: string }) => {
      this.ended = m?.reason ?? 'ENDED';
      this.handlers.onEnded?.(this.ended);
    });
  }

  /** Socket dropped (`up` false) or came back and re-joined (`up` true). */
  setLink(up: boolean): void {
    this.link = up;
    if (up) this.lastSent = -1;
  }

  /** Present the ticket from `match:start`. Resolves with the role, or rejects. */
  join(ticket: string): Promise<NetRole> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('JOIN_TIMEOUT')), 8000);
      this.io.emit(NetEvents.Join, { ticket }, (res) => {
        clearTimeout(timer);
        const r = res as { ok?: boolean; error?: string; playerId?: string; isHost?: boolean; roster?: NetRoster };
        if (!r?.ok || !r.playerId) return reject(new Error(r?.error ?? 'JOIN_FAILED'));
        this.playerId = r.playerId;
        this.role = r.isHost ? 'host' : 'guest';
        if (r.roster) this.roster = r.roster;
        resolve(this.role);
      });
    });
  }

  private due(hz: number): boolean {
    const now = this.clock();
    const period = 1 / hz;
    // half a millisecond of slack: a frame that lands a hair early still counts
    if (now - this.lastSent < period - 0.0005) return false;
    // keep the average rate at `hz` even though we only get to send on frame boundaries
    this.lastSent = now - this.lastSent > period * 2 ? now : this.lastSent + period;
    return true;
  }

  /** host: protocol a guest speaks (1 = has not said / old client) */
  guestProtocol(playerId: string): number {
    return this.remoteHeroes.get(playerId)?.v ?? 1;
  }

  /** host: every guest in the room understands protocol `v` (false while someone has not reported yet) */
  private allGuestsSpeak(v: number): boolean {
    const r = this.roster;
    if (!r) return false;
    for (const p of r.players) {
      if (p.playerId === this.playerId || !p.connected) continue;
      if (this.guestProtocol(p.playerId) < v) return false;
    }
    return true;
  }

  /** guest: how far behind the host the world is drawn, and how uneven packets arrive (ms) */
  linkStats(): { delayMs: number; jitterMs: number } {
    return { delayMs: Math.round(this.buffer.delay * 1000), jitterMs: Math.round(this.buffer.jitterSec * 1000) };
  }

  /** guest: report own hero (throttled). Returns true when a packet went out. */
  guestPublish(hero: Omit<NetHero, 'id'>): boolean {
    if (this.role !== 'guest' || this.ended || !this.due(NET_LIMITS.inputHz)) return false;
    const msg: NetInput = { ...roundHero({ ...hero, id: this.playerId }), seq: ++this.seq, v: NET_PROTOCOL };
    this.io.emit(NetEvents.Input, msg);
    return true;
  }

  /** host: broadcast the world (throttled). `build` is only called when a packet is due. */
  hostPublish(build: () => { t: number; wave: number; kills: number; heroes: NetHero[]; zombies: NetZombie[]; obj?: NetObjective; veh?: number[] | null }): boolean {
    if (this.role !== 'host' || this.ended || !this.due(NET_LIMITS.snapshotHz)) return false;
    const w = build();
    // binary records once every guest understands them; an old client in the room keeps everyone on the JSON list
    const compact = this.allGuestsSpeak(2);
    const z = compact ? packZombiesBin(w.zombies) : packZombies(w.zombies);
    const snap: NetSnapshot = { seq: ++this.seq, t: Math.round(w.t * 1000) / 1000, wave: w.wave, kills: w.kills, heroes: compact ? [] : w.heroes.map(roundHero), z, v: NET_PROTOCOL };
    if (compact) snap.h = packHeroes(w.heroes);
    if (w.veh) snap.veh = [Math.round(w.veh[0]! * 100) / 100, Math.round(w.veh[1]! * 100) / 100, Math.round(w.veh[2]! * 1000) / 1000];
    if (w.obj) {
      const now = this.clock();
      const sig = JSON.stringify(w.obj);
      // the objective barely changes: send it when it does, and once a second for late joiners / lost packets
      if (!Array.isArray(z) && sig === this.objSig && now - this.objAt < 1) {
        /* unchanged: leave it out */
      } else {
        snap.obj = w.obj;
        this.objSig = sig;
        this.objAt = now;
      }
    }
    this.io.emit(NetEvents.Snapshot, snap);
    return true;
  }

  /** reliable one-shot: host → everyone, guest → host */
  send(ev: NetEvent): void {
    if (!this.ended) this.io.emit(NetEvents.Event, ev);
  }

  /** guest: the world to draw right now (interpolated), or null before the first snapshot */
  sampleWorld(): WorldFrame | null {
    return this.buffer.sample(this.clock());
  }

  /** host: guests whose last report is fresh (a silent guest stops being a target) */
  liveRemoteHeroes(maxAge = 8): NetHero[] {
    const now = this.clock();
    const out: NetHero[] = [];
    for (const h of this.remoteHeroes.values()) if (now - h.at <= maxAge) out.push(h);
    return out;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  private listen<T>(event: string, handler: (payload: T) => void): void {
    const h = handler as (payload: never) => void;
    this.io.on(event, h);
    this.offs.push(() => this.io.off(event, h));
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function roundHero<T extends NetHero>(h: T): T {
  return { ...h, x: r2(h.x), z: r2(h.z), yaw: r2(h.yaw), hp: Math.round(h.hp), maxHp: Math.round(h.maxHp), dmg: r2(h.dmg) };
}

/** Never trust the wire: a hero must be finite numbers within sane ranges. */
function validHero(h: unknown): h is NetHero {
  const v = h as NetHero;
  return (
    !!v &&
    Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.yaw) &&
    Math.abs(v.x) < 2000 && Math.abs(v.z) < 2000 &&
    Number.isFinite(v.hp) && Number.isFinite(v.maxHp) && v.maxHp > 0 && v.maxHp < 100000 &&
    typeof v.weapon === 'string' && v.weapon.length < 48 &&
    Number.isFinite(v.dmg) && v.dmg >= 0 && v.dmg <= 50
  );
}
