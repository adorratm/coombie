/**
 * Günlük görev: one seeded mission per day (same for everyone), with two twists, and a
 * daily + weekly leaderboard on the COOMBIE server. The day key, week key and score come
 * from @protocol-z/shared so the server scores runs the same way.
 */
import { dailyKey, dailyScore, dailySeed, weekKey, type LeaderRow } from '@protocol-z/shared';
import { coopServerUrl } from './coop';
import type { DifficultyId, MissionSelection } from './gameModes';
import { MAP_ORDER, type ModeId } from './mapDefs';

export type DailyModId = 'glass' | 'swarm' | 'elites' | 'speed' | 'tanky' | 'vampire' | 'brute' | 'scarce';

export interface DailyModDef {
  id: DailyModId;
  name: string;
  icon: string;
  desc: string;
}

export const DAILY_MODS: Record<DailyModId, DailyModDef> = {
  glass: { id: 'glass', name: 'Cam Top', icon: '🥃', desc: 'Canın %40 az, hasarın %40 fazla.' },
  swarm: { id: 'swarm', name: 'İstila', icon: '🐜', desc: 'Sürü %35 kalabalık ama zombiler %20 zayıf.' },
  elites: { id: 'elites', name: 'Seçkinler', icon: '◆', desc: 'Özel ve elit zombiler çok daha erken ve sık.' },
  speed: { id: 'speed', name: 'Adrenalin', icon: '⚡', desc: 'Zombiler %20 hızlı.' },
  tanky: { id: 'tanky', name: 'Zırhlı Sürü', icon: '🛡', desc: 'Zombilerin canı %50 fazla.' },
  vampire: { id: 'vampire', name: 'Vampir', icon: '🩸', desc: 'Verdiğin hasarın %4\'ü can olarak döner.' },
  brute: { id: 'brute', name: 'Sert Darbe', icon: '👊', desc: 'Zombiler %35 sert vuruyor.' },
  scarce: { id: 'scarce', name: 'Kıtlık', icon: '🥫', desc: 'Dirilme hakkı yok.' },
};

/** short, decisive modes suit a daily run */
const DAILY_MODES: ModeId[] = ['blitz', 'onelife', 'mutation', 'darkness', 'king', 'supply', 'zones', 'hunt', 'horde', 'survival'];

export interface DailyChallenge {
  key: string;
  week: string;
  mission: MissionSelection;
  mods: DailyModId[];
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function dailyChallenge(at: number = Date.now()): DailyChallenge {
  const key = dailyKey(at);
  const r = rng(dailySeed(key));
  const map = MAP_ORDER[Math.floor(r() * MAP_ORDER.length)]!;
  const mode = DAILY_MODES[Math.floor(r() * DAILY_MODES.length)]!;
  const difficulty: DifficultyId = r() < 0.5 ? 'hard' : 'normal';
  const ids = Object.keys(DAILY_MODS) as DailyModId[];
  const a = ids[Math.floor(r() * ids.length)]!;
  let b = ids[Math.floor(r() * ids.length)]!;
  if (b === a) b = ids[(ids.indexOf(a) + 3) % ids.length]!;
  const mission: MissionSelection = { map, mode, difficulty, minutes: 20, daily: key, mods: [a, b] };
  return { key, week: weekKey(at), mission, mods: [a, b] };
}

export interface DailyModEffects {
  zHp: number;
  zSpeed: number;
  zDmg: number;
  pHp: number;
  pDmg: number;
  capMul: number;
  /** minutes added when rolling special / elite types */
  typeBoost: number;
  lifesteal: number;
  noRevives: boolean;
}

export function dailyEffects(mods: readonly string[] | undefined): DailyModEffects {
  const e: DailyModEffects = { zHp: 1, zSpeed: 1, zDmg: 1, pHp: 1, pDmg: 1, capMul: 1, typeBoost: 0, lifesteal: 0, noRevives: false };
  for (const m of mods ?? []) {
    if (m === 'glass') {
      e.pHp *= 0.6;
      e.pDmg *= 1.4;
    } else if (m === 'swarm') {
      e.capMul *= 1.35;
      e.zHp *= 0.8;
    } else if (m === 'elites') e.typeBoost += 8;
    else if (m === 'speed') e.zSpeed *= 1.2;
    else if (m === 'tanky') e.zHp *= 1.5;
    else if (m === 'vampire') e.lifesteal += 0.04;
    else if (m === 'brute') e.zDmg *= 1.35;
    else if (m === 'scarce') e.noRevives = true;
  }
  return e;
}

// ---------------------------------------------------------------- server

const DEVICE_KEY = 'coombie:device';
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
      const a = new Uint8Array(12);
      crypto.getRandomValues(a);
      id = Array.from(a, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 24);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'anon-device-0';
  }
}

export interface Board<T extends LeaderRow = LeaderRow> {
  total: number;
  top: T[];
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${coopServerUrl()}${path}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { ok: boolean; data: T };
    return j.ok ? j.data : null;
  } catch {
    return null;
  }
}

export const fetchDaily = () => getJson<Board & { day: string }>('/leaderboard/daily');
export const fetchWeekly = () => getJson<Board<LeaderRow & { days: number }> & { week: string }>('/leaderboard/weekly');

export async function submitDaily(run: { day: string; name: string; hero: string; kills: number; timeSec: number; level: number; won: boolean }): Promise<{ score: number; rank: number; best: number } | { error: string }> {
  try {
    const r = await fetch(`${coopServerUrl()}/leaderboard/daily`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...run, device: deviceId() }),
    });
    const j = (await r.json()) as { ok: boolean; data: { score: number; rank: number; best: number } | null; error: string | null };
    return j.ok && j.data ? j.data : { error: j.error ?? `HTTP ${r.status}` };
  } catch {
    return { error: 'OFFLINE' };
  }
}

export { dailyScore };
