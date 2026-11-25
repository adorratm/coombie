import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { dailyKey, dailyPartsPlausible, dailyScore, weekKey, type DailyRunParts, type LeaderRow } from '@protocol-z/shared';

interface Entry extends LeaderRow {
  device: string;
  day: string;
}

interface Store {
  /** day key → best run per device */
  days: Record<string, Record<string, Entry>>;
}

const KEEP_DAYS = 21;
const TOP = 20;

/**
 * Daily challenge + weekly leaderboard. Needs no database: entries live in memory and are
 * written to a small JSON file (LEADERBOARD_FILE, default ./data/leaderboard.json) a few
 * seconds after a change. A missing or read-only file only means the board resets on restart.
 */
@Injectable()
export class LeaderboardService implements OnModuleDestroy {
  private readonly log = new Logger('Leaderboard');
  private readonly file = resolve(process.env.LEADERBOARD_FILE ?? 'data/leaderboard.json');
  private store: Store = { days: {} };
  private dirty: NodeJS.Timeout | null = null;
  private readonly lastSubmit = new Map<string, number>();

  constructor() {
    try {
      if (existsSync(this.file)) this.store = JSON.parse(readFileSync(this.file, 'utf8')) as Store;
      this.store.days ??= {};
    } catch (err) {
      this.log.warn(`could not read ${this.file}: ${(err as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    this.flush();
  }

  private flush(): void {
    if (this.dirty) clearTimeout(this.dirty);
    this.dirty = null;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.store));
      renameSync(tmp, this.file);
    } catch (err) {
      this.log.warn(`could not write ${this.file}: ${(err as Error).message}`);
    }
  }

  private touch(): void {
    if (!this.dirty) this.dirty = setTimeout(() => this.flush(), 5000);
  }

  private prune(): void {
    const keys = Object.keys(this.store.days).sort();
    while (keys.length > KEEP_DAYS) delete this.store.days[keys.shift()!];
  }

  /** Rate limit: one submit per client every 15 s. */
  allow(client: string, now = Date.now()): boolean {
    const last = this.lastSubmit.get(client) ?? 0;
    if (now - last < 15_000) return false;
    this.lastSubmit.set(client, now);
    if (this.lastSubmit.size > 5000) this.lastSubmit.clear();
    return true;
  }

  submit(input: { device: string; name: string; hero: string; day: string } & DailyRunParts, now = Date.now()): { ok: boolean; error?: string; score?: number; rank?: number; best?: number } {
    const today = dailyKey(now);
    const yesterday = dailyKey(now - 86_400_000);
    // a run that started just before midnight may finish just after it
    if (input.day !== today && input.day !== yesterday) return { ok: false, error: 'DAY_CLOSED' };
    if (!dailyPartsPlausible(input)) return { ok: false, error: 'IMPLAUSIBLE' };
    const score = dailyScore(input);
    const day = (this.store.days[input.day] ??= {});
    const prev = day[input.device];
    if (!prev || score > prev.score) {
      day[input.device] = {
        device: input.device,
        day: input.day,
        name: input.name,
        hero: input.hero,
        score,
        kills: Math.round(input.kills),
        timeSec: Math.round(input.timeSec),
        won: !!input.won,
      };
      this.prune();
      this.touch();
    }
    const rows = Object.values(day).sort((a, b) => b.score - a.score);
    const rank = rows.findIndex((r) => r.device === input.device) + 1;
    return { ok: true, score, rank, best: day[input.device]!.score };
  }

  daily(day = dailyKey()): { day: string; total: number; top: LeaderRow[] } {
    const rows = Object.values(this.store.days[day] ?? {}).sort((a, b) => b.score - a.score);
    return { day, total: rows.length, top: rows.slice(0, TOP).map(strip) };
  }

  /** Week board: the sum of each player's best daily score over the week's days. */
  weekly(week = weekKey()): { week: string; total: number; top: Array<LeaderRow & { days: number }> } {
    const sum = new Map<string, LeaderRow & { days: number }>();
    for (const [day, list] of Object.entries(this.store.days)) {
      if (weekKey(Date.parse(`${day}T12:00:00Z`) - 3 * 3_600_000) !== week) continue;
      for (const e of Object.values(list)) {
        const cur = sum.get(e.device);
        if (cur) {
          cur.score += e.score;
          cur.kills += e.kills;
          cur.timeSec += e.timeSec;
          cur.days += 1;
          cur.name = e.name;
          cur.hero = e.hero;
        } else sum.set(e.device, { ...strip(e), days: 1 });
      }
    }
    const rows = [...sum.values()].sort((a, b) => b.score - a.score);
    return { week, total: rows.length, top: rows.slice(0, TOP) };
  }
}

const strip = (e: Entry): LeaderRow => ({ name: e.name, hero: e.hero, score: e.score, kills: e.kills, timeSec: e.timeSec, won: e.won });
