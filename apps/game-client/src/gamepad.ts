/**
 * Gamepad (Xbox / PlayStation / generic "standard" mapping) — Gamepad API, no library.
 *
 * Play:    left stick move · right stick aim (auto-aim snaps near where you point)
 *          A/✕ Q · B/○ E · Y/△ R (hero abilities) · X/□ reload
 *          LB/RB previous/next weapon · RT rage · LT special move (H)
 *          D-pad ↑ medkit · → shield · ← rage stim · ↓ fire support
 *          Start pause · Select/Share skill tree · R3 inventory
 * Upgrade: A/B/X/Y pick card 1–4 · RB reroll · LB lock · D-pad ↓ banish · Select skip
 *
 * The mapping is a pure function (`readPad`) so it can be tested without a browser.
 */

export type PadContext = 'play' | 'upgrade';

/** Minimal shape of a Gamepad we use (browser Gamepad fits it). */
export type PadLike = {
  connected: boolean;
  mapping?: string;
  axes: ReadonlyArray<number>;
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
};

export type PadState = {
  move: { x: number; z: number };
  /** null = right stick centred */
  aim: { x: number; z: number } | null;
  /** virtual keyboard codes held this frame */
  keys: Set<string>;
  /** weapon cycle edge: -1 / +1 (LB/RB in play) */
  cycle: -1 | 0 | 1;
  /** Start pressed this frame (edge) */
  pause: boolean;
  /** any input at all (to switch aim from mouse to pad) */
  active: boolean;
};

export const DEADZONE = 0.18;
const AIM_DEADZONE = 0.3;
const TRIGGER = 0.4;

/** Radial deadzone with rescale so small tilts walk slowly and full tilt runs. */
export function stick(x: number, y: number, dz = DEADZONE): { x: number; z: number } {
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len < dz) return { x: 0, z: 0 };
  const k = Math.min(1, (len - dz) / (1 - dz)) / len;
  return { x: x * k, z: y * k };
}

const B = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

const PLAY_KEYS: Array<[number, string]> = [
  [B.A, 'KeyQ'],
  [B.B, 'KeyE'],
  [B.Y, 'KeyR'],
  [B.X, 'KeyG'],
  [B.RT, 'KeyF'],
  [B.LT, 'KeyH'],
  [B.UP, 'KeyZ'],
  [B.RIGHT, 'KeyX'],
  [B.LEFT, 'KeyC'],
  [B.DOWN, 'KeyB'],
  [B.SELECT, 'KeyT'],
  [B.R3, 'KeyI'],
];

const UPGRADE_KEYS: Array<[number, string]> = [
  [B.A, 'Digit1'],
  [B.B, 'Digit2'],
  [B.X, 'Digit3'],
  [B.Y, 'Digit4'],
  [B.RB, 'KeyR'],
  [B.LB, 'KeyL'],
  [B.SELECT, 'KeyV'],
  [B.DOWN, 'KeyB'],
];

const down = (p: PadLike, i: number) => {
  const b = p.buttons[i];
  if (!b) return false;
  return i === B.LT || i === B.RT ? b.pressed || b.value > TRIGGER : b.pressed;
};

/** Pure: pad snapshot (+ previous held set for edges) → game input for this frame. */
export function readPad(p: PadLike | null, ctx: PadContext, prevHeld: ReadonlySet<number>): { state: PadState; held: Set<number> } {
  const empty: PadState = { move: { x: 0, z: 0 }, aim: null, keys: new Set(), cycle: 0, pause: false, active: false };
  if (!p || !p.connected) return { state: empty, held: new Set() };
  const held = new Set<number>();
  for (let i = 0; i < p.buttons.length; i++) if (down(p, i)) held.add(i);
  const edge = (i: number) => held.has(i) && !prevHeld.has(i);

  const move = stick(p.axes[0] ?? 0, p.axes[1] ?? 0);
  const r = stick(p.axes[2] ?? 0, p.axes[3] ?? 0, AIM_DEADZONE);
  const aim = Math.hypot(r.x, r.z) > 0 ? { x: r.x, z: r.z } : null;

  const keys = new Set<string>();
  for (const [btn, code] of ctx === 'upgrade' ? UPGRADE_KEYS : PLAY_KEYS) if (held.has(btn)) keys.add(code);
  const cycle: -1 | 0 | 1 = ctx === 'play' ? (edge(B.RB) ? 1 : edge(B.LB) ? -1 : 0) : 0;

  return {
    state: {
      move,
      aim,
      keys,
      cycle,
      pause: edge(B.START),
      active: held.size > 0 || move.x !== 0 || move.z !== 0 || aim !== null,
    },
    held,
  };
}

/** First connected pad (prefers the "standard" mapping). */
export function firstPad(): PadLike | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  let any: PadLike | null = null;
  for (const g of navigator.getGamepads()) {
    if (!g || !g.connected) continue;
    if (g.mapping === 'standard') return g;
    any ??= g;
  }
  return any;
}

/** Rumble if the pad supports it (Chrome/Edge: dual-rumble). */
export function rumble(strength: number, ms: number): void {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
  for (const g of navigator.getGamepads()) {
    const act = (g as unknown as { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } })?.vibrationActuator;
    if (!g?.connected || !act?.playEffect) continue;
    const s = Math.max(0, Math.min(1, strength));
    void act.playEffect('dual-rumble', { duration: ms, strongMagnitude: s, weakMagnitude: Math.min(1, s * 0.8) }).catch(() => undefined);
  }
}
