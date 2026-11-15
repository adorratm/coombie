import type { ZombieVisual } from './characters';

export type StatusId = 'burn' | 'toxin' | 'chill';

export interface ActiveStatus {
  id: StatusId;
  remaining: number;
  tickAcc: number;
  power: number;
}

const STATUS_DURATION: Record<StatusId, number> = {
  burn: 3.2,
  toxin: 4.0,
  chill: 2.6,
};

const TICK_INTERVAL = 0.45;

/**
 * Elemental reactions: a second, different status landing on a zombie that still
 * carries another one sets off a combo. Both statuses are consumed; the arena
 * resolves the effect (damage, fx) through the handler. Works across heroes, so a
 * burn from one player and a chill from another combine too.
 */
export type ReactionId = 'thermal' | 'toxicBlast' | 'cryoToxin';
export interface ReactionDef {
  id: ReactionId;
  a: StatusId;
  b: StatusId;
  name: string;
  desc: string;
  color: number;
}
export const REACTIONS: Record<ReactionId, ReactionDef> = {
  thermal: { id: 'thermal', a: 'burn', b: 'chill', name: 'Termal Şok', desc: 'Yanma + donma: tek hedefe ağır patlama hasarı.', color: 0xffe2c0 },
  toxicBlast: { id: 'toxicBlast', a: 'burn', b: 'toxin', name: 'Zehir Patlaması', desc: 'Yanma + zehir: etrafa zehir saçan patlama.', color: 0xb6ff3a },
  cryoToxin: { id: 'cryoToxin', a: 'chill', b: 'toxin', name: 'Kristal Zehir', desc: 'Donma + zehir: hedef buz kesilir, soğuk etrafa yayılır.', color: 0x9be7ff },
};
export function reactionFor(x: StatusId, y: StatusId): ReactionDef | null {
  if (x === y) return null;
  for (const r of Object.values(REACTIONS)) if ((r.a === x && r.b === y) || (r.a === y && r.b === x)) return r;
  return null;
}
/** a zombie reacts at most this often */
export const REACTION_COOLDOWN = 0.8;
type ReactionHandler = (z: ZombieVisual, r: ReactionDef, power: number) => void;
let reactionHandler: ReactionHandler | null = null;
let reactionClock = 0;
/** The arena resolves reactions (damage + fx); null turns them off. */
export function setReactionHandler(fn: ReactionHandler | null): void {
  reactionHandler = fn;
}
/** advanced by the arena every frame (seconds) */
export function advanceReactionClock(dt: number): void {
  reactionClock += dt;
}
type Reactive = ZombieVisual & { reactAt?: number; freezeLeft?: number };

export function ensureStatusState(z: ZombieVisual): void {
  if (!z.statuses) z.statuses = [];
  if (z.baseSpeed == null || z.baseSpeed <= 0) z.baseSpeed = z.speed;
}

/** Refresh or stack power on apply (survivor-like readable DoT). */
export function applyStatus(
  z: ZombieVisual,
  id: StatusId,
  power: number,
  durationMult = 1,
): void {
  ensureStatusState(z);
  const duration = STATUS_DURATION[id] * durationMult;
  if (reactionHandler) {
    const rz = z as Reactive;
    for (let i = 0; i < z.statuses.length; i++) {
      const other = z.statuses[i]!;
      const r = reactionFor(id, other.id);
      if (!r || (rz.reactAt ?? -99) + REACTION_COOLDOWN > reactionClock) continue;
      rz.reactAt = reactionClock;
      z.statuses.splice(i, 1);
      if (other.id === 'chill' && z.baseSpeed > 0) z.speed = z.baseSpeed;
      reactionHandler(z, r, Math.max(power, other.power));
      return;
    }
  }
  const existing = z.statuses.find((s) => s.id === id);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, duration);
    existing.power = Math.max(existing.power, power);
    return;
  }
  z.statuses.push({ id, remaining: duration, tickAcc: 0, power });
  if (id === 'chill') {
    z.speed = z.baseSpeed * 0.55;
  }
}

export function statusTint(id: StatusId): number {
  if (id === 'burn') return 0xf97316;
  if (id === 'toxin') return 0x84cc16;
  return 0x38bdf8;
}

/**
 * Tick DoTs / chill expiry. Returns total damage dealt this frame (for floaters).
 */
export function tickZombieStatuses(
  z: ZombieVisual,
  dt: number,
): { damage: number; tint: number | null } {
  ensureStatusState(z);
  const rz = z as Reactive;
  if (rz.freezeLeft && rz.freezeLeft > 0) {
    rz.freezeLeft -= dt;
    z.speed = rz.freezeLeft > 0 ? 0 : z.baseSpeed;
    if (rz.freezeLeft > 0 && z.statuses.length === 0) return { damage: 0, tint: null };
  }
  if (z.statuses.length === 0) return { damage: 0, tint: null };

  let damage = 0;
  let tint: number | null = null;
  let hasChill = false;

  for (let i = z.statuses.length - 1; i >= 0; i--) {
    const s = z.statuses[i]!;
    s.remaining -= dt;

    if (s.remaining <= 0) {
      z.statuses.splice(i, 1);
      continue;
    }

    if (s.id === 'chill') hasChill = true;

    if (s.id === 'burn' || s.id === 'toxin') {
      s.tickAcc += dt;
      while (s.tickAcc >= TICK_INTERVAL) {
        s.tickAcc -= TICK_INTERVAL;
        const perTick = s.power * (s.id === 'burn' ? 0.55 : 0.4);
        damage += perTick;
        tint = statusTint(s.id);
      }
    }
  }

  if (rz.freezeLeft && rz.freezeLeft > 0) {
    z.speed = 0;
  } else if (hasChill) {
    z.speed = z.baseSpeed * 0.55;
  } else if (z.baseSpeed > 0) {
    z.speed = z.baseSpeed;
  }

  return { damage, tint };
}

export function rollStatusOnHit(
  chances: Partial<Record<StatusId, number>>,
  power: number,
): { id: StatusId; power: number } | null {
  const order: StatusId[] = ['burn', 'toxin', 'chill'];
  for (const id of order) {
    const chance = chances[id] ?? 0;
    if (chance <= 0) continue;
    if (Math.random() < Math.min(0.75, chance)) {
      return { id, power: Math.max(0.6, power) };
    }
  }
  return null;
}

/** Frozen solid for `seconds` (cannot move). */
export function freezeZombie(z: ZombieVisual, seconds: number): void {
  ensureStatusState(z);
  const rz = z as Reactive;
  rz.freezeLeft = Math.max(rz.freezeLeft ?? 0, seconds);
  z.speed = 0;
}
