/**
 * Daily challenge + weekly board: shared by the game client and the API so both agree
 * on the day / week keys and on the score of a run.
 * Days roll over at midnight Istanbul time (UTC+3, no DST).
 */

const DAY_MS = 86_400_000;
const TR_OFFSET_MS = 3 * 3_600_000;

/** 'YYYY-MM-DD' in Istanbul time */
export function dailyKey(at: number = Date.now()): string {
  return new Date(at + TR_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO week of the Istanbul date: 'YYYY-Www' */
export function weekKey(at: number = Date.now()): string {
  const d = new Date(at + TR_OFFSET_MS);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((day.getTime() - y0.getTime()) / DAY_MS + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}

/** Stable integer seed for a day key. */
export function dailySeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface DailyRunParts {
  kills: number;
  timeSec: number;
  level: number;
  won: boolean;
}

/** Hard sanity caps (a run can't do better than this; the server rejects anything above). */
export function dailyPartsPlausible(p: DailyRunParts): boolean {
  return (
    Number.isFinite(p.kills) &&
    Number.isFinite(p.timeSec) &&
    Number.isFinite(p.level) &&
    p.kills >= 0 &&
    p.timeSec >= 0 &&
    p.timeSec <= 3 * 3600 &&
    p.level >= 1 &&
    p.level <= 200 &&
    p.kills <= 40 + p.timeSec * 14
  );
}

export function dailyScore(p: DailyRunParts): number {
  return Math.round(p.kills * 10 + p.level * 40 + Math.min(p.timeSec, 3600) * 2 + (p.won ? 3000 : 0));
}

export interface LeaderRow {
  name: string;
  hero: string;
  score: number;
  kills: number;
  timeSec: number;
  won: boolean;
}
