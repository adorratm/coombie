import { describe, expect, it } from 'vitest';
import { readPad, stick, type PadLike } from './gamepad';

const pad = (axes: number[] = [0, 0, 0, 0], pressed: number[] = [], values: Record<number, number> = {}): PadLike => ({
  connected: true,
  mapping: 'standard',
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? (pressed.includes(i) ? 1 : 0) })),
});

describe('gamepad', () => {
  it('ignores stick drift and rescales so full tilt is 1', () => {
    expect(stick(0.1, 0.05)).toEqual({ x: 0, z: 0 });
    const full = stick(1, 0);
    expect(full.x).toBeCloseTo(1);
    const half = stick(0.59, 0);
    expect(half.x).toBeGreaterThan(0.4);
    expect(half.x).toBeLessThan(0.6);
  });

  it('maps play buttons, triggers and weapon cycle edges', () => {
    const { state, held } = readPad(pad([0, -1, 0.9, 0], [0, 2, 5], { 7: 0.8 }), 'play', new Set());
    expect([...state.keys].sort()).toEqual(['KeyF', 'KeyG', 'KeyQ']);
    expect(state.move.z).toBeCloseTo(-1);
    expect(state.aim?.x).toBeGreaterThan(0.8);
    expect(state.cycle).toBe(1);
    // holding RB does not keep cycling
    expect(readPad(pad([0, 0, 0, 0], [5]), 'play', held).state.cycle).toBe(0);
  });

  it('uses card keys on the upgrade screen, not abilities or slots', () => {
    const { state } = readPad(pad([0, 0, 0, 0], [0, 3, 5, 13]), 'upgrade', new Set());
    expect([...state.keys].sort()).toEqual(['Digit1', 'Digit4', 'KeyB', 'KeyR']);
    expect(state.cycle).toBe(0);
  });

  it('start is an edge (one pause per press) and a missing pad is inert', () => {
    const first = readPad(pad([0, 0, 0, 0], [9]), 'play', new Set());
    expect(first.state.pause).toBe(true);
    expect(readPad(pad([0, 0, 0, 0], [9]), 'play', first.held).state.pause).toBe(false);
    expect(readPad(null, 'play', new Set()).state.active).toBe(false);
  });
});
