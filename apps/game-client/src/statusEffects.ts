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

  if (hasChill) {
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
