import type { NetTransport } from './netSession';

/**
 * Dev tool: a bad connection on demand. `?lag=80,60,1` wraps the match socket so every
 * message in either direction is held for 80 ms plus up to 60 ms of random extra, and once
 * every `1` second(s) the line stalls for a quarter of a second. Messages never overtake
 * each other (it is TCP underneath), so late ones arrive in bursts — exactly what a phone
 * on mobile data does. Without the parameter the transport is returned untouched.
 */
export function parseLag(search: string): { base: number; jitter: number; stallEvery: number } | null {
  const raw = new URLSearchParams(search).get('lag');
  if (!raw) return null;
  const [base, jitter, stallEvery] = raw.split(',').map((v) => Number(v));
  if (!Number.isFinite(base) || base! < 0) return null;
  return { base: Math.min(2000, base!) / 1000, jitter: Math.min(2000, Math.max(0, jitter || 0)) / 1000, stallEvery: Math.max(0, stallEvery || 0) };
}

export function withLag(
  io: NetTransport,
  lag: { base: number; jitter: number; stallEvery: number } | null,
  clock: () => number = () => performance.now() / 1000,
  later: (fn: () => void, sec: number) => void = (fn, sec) => void setTimeout(fn, sec * 1000),
  rnd: () => number = Math.random,
): NetTransport {
  if (!lag) return io;
  const lane = () => {
    let last = 0;
    return (fn: () => void) => {
      const now = clock();
      let at = now + lag.base + rnd() * lag.jitter;
      // a stall: everything due inside the hole comes out together at its end
      if (lag.stallEvery > 0) {
        const phase = at % lag.stallEvery;
        if (phase < 0.25) at += 0.25 - phase;
      }
      last = Math.max(last, at);
      later(fn, last - now);
    };
  };
  const out = lane();
  const inbound = lane();
  const wrapped = new Map<unknown, (payload: never) => void>();
  return {
    emit: (event, payload, ack) => out(() => io.emit(event, payload, ack)),
    on: (event, handler) => {
      const w = (payload: never) => inbound(() => handler(payload));
      wrapped.set(handler, w);
      io.on(event, w);
    },
    off: (event, handler) => {
      const w = wrapped.get(handler);
      if (w) io.off(event, w);
      wrapped.delete(handler);
    },
  };
}
