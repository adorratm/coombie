import {
  NET_LIMITS,
  NetEvents,
  packZombies,
  unpackZombies,
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
  /** host: latest reported state of every guest hero */
  readonly remoteHeroes = new Map<string, NetHero & { at: number; seq: number }>();
  private readonly buffer = new SnapshotBuffer();
  private seq = 0;
  private lastSent = -1;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly io: NetTransport,
    private readonly handlers: NetSessionHandlers = {},
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
      this.remoteHeroes.set(m.from, { ...m.d, id: m.from, seq, at: this.clock() });
    });
    this.listen(NetEvents.Snapshot, (s: NetSnapshot) => {
      if (this.role !== 'guest' || !s || !Number.isFinite(s.t)) return;
      const frame: WorldFrame = {
        t: s.t,
        wave: s.wave | 0,
        kills: s.kills | 0,
        zombies: unpackZombies(s.z),
        heroes: Array.isArray(s.heroes) ? s.heroes.filter(validHero) : [],
      };
      this.buffer.push(frame, this.clock());
    });
    this.listen(NetEvents.Event, (m: { from: string; d: NetEvent }) => {
      if (m && m.d && typeof m.d.k === 'string') this.handlers.onEvent?.(m.d, String(m.from));
    });
    this.listen(NetEvents.Ended, (m: { reason?: string }) => {
      this.ended = m?.reason ?? 'ENDED';
      this.handlers.onEnded?.(this.ended);
    });
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
    if (now - this.lastSent < 1 / hz) return false;
    this.lastSent = now;
    return true;
  }

  /** guest: report own hero (throttled). Returns true when a packet went out. */
  guestPublish(hero: Omit<NetHero, 'id'>): boolean {
    if (this.role !== 'guest' || this.ended || !this.due(NET_LIMITS.inputHz)) return false;
    const msg: NetInput = { ...roundHero({ ...hero, id: this.playerId }), seq: ++this.seq };
    this.io.emit(NetEvents.Input, msg);
    return true;
  }

  /** host: broadcast the world (throttled). `build` is only called when a packet is due. */
  hostPublish(build: () => { t: number; wave: number; kills: number; heroes: NetHero[]; zombies: NetZombie[] }): boolean {
    if (this.role !== 'host' || this.ended || !this.due(NET_LIMITS.snapshotHz)) return false;
    const w = build();
    const snap: NetSnapshot = { seq: ++this.seq, t: Math.round(w.t * 1000) / 1000, wave: w.wave, kills: w.kills, heroes: w.heroes.map(roundHero), z: packZombies(w.zombies) };
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
  liveRemoteHeroes(maxAge = 3): NetHero[] {
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
