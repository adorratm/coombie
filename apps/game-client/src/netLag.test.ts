import { describe, expect, it } from 'vitest';
import { parseLag, withLag } from './netLag';
import type { NetTransport } from './netSession';

describe('lag simulator (dev)', () => {
  it('is off unless asked for', () => {
    expect(parseLag('?god=1')).toBeNull();
    expect(parseLag('?lag=abc')).toBeNull();
    expect(parseLag('?lag=80,60,1')).toEqual({ base: 0.08, jitter: 0.06, stallEvery: 1 });
    const io: NetTransport = { emit: () => undefined, on: () => undefined, off: () => undefined };
    expect(withLag(io, null)).toBe(io);
  });

  it('delays both directions and never lets a message overtake an earlier one', () => {
    let now = 0;
    const timers: Array<{ at: number; fn: () => void }> = [];
    const sent: number[] = [];
    const got: number[] = [];
    let handler: ((p: never) => void) | null = null;
    const io: NetTransport = { emit: (_e, p) => void sent.push(p as number), on: (_e, h) => void (handler = h), off: () => void (handler = null) };
    // jitter draws go high, low, high, low …: without ordering the 2nd message would overtake the 1st
    let flip = 0;
    const lag = withLag(io, { base: 0.05, jitter: 0.1, stallEvery: 0 }, () => now, (fn, sec) => void timers.push({ at: now + sec, fn }), () => (flip++ % 2 === 0 ? 1 : 0));
    const onMsg = (p: never) => void got.push(p as number);
    lag.on('x', onMsg);
    for (let i = 0; i < 6; i++) {
      now = i * 0.01;
      lag.emit('x', i);
      handler!(i as never);
    }
    expect(sent).toEqual([]); // nothing leaves at once
    timers.sort((a, b) => a.at - b.at);
    for (const t of timers) {
      now = t.at;
      t.fn();
    }
    expect(sent).toEqual([0, 1, 2, 3, 4, 5]);
    expect(got).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Math.min(...timers.map((t) => t.at))).toBeGreaterThanOrEqual(0.05);
    lag.off('x', onMsg);
    expect(handler).toBeNull();
  });
});
