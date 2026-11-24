/**
 * End-of-run MVP cards. Every client counts its own hero's numbers (damage it dealt,
 * kills, damage taken, team mates it picked up, abilities cast) and, in co-op, shares
 * them with the room every few seconds (`st` event), so the result screen can show a
 * card per player with a title for what they were best at.
 */

export interface PlayerRunStats {
  id: string;
  name: string;
  hero: string;
  dmg: number;
  kills: number;
  bossKills: number;
  taken: number;
  revives: number;
  casts: number;
  downs: number;
}

export const emptyRunStats = (id: string, name: string, hero: string): PlayerRunStats => ({ id, name, hero, dmg: 0, kills: 0, bossKills: 0, taken: 0, revives: 0, casts: 0, downs: 0 });

/** flat wire form: [dmg, kills, bossKills, taken, revives, casts, downs] */
export function packStats(s: PlayerRunStats): number[] {
  return [Math.round(s.dmg), s.kills, s.bossKills, Math.round(s.taken), s.revives, s.casts, s.downs];
}

export function unpackStats(id: string, name: string, hero: string, d: unknown): PlayerRunStats | null {
  if (!Array.isArray(d) || d.length < 7) return null;
  const n = (i: number) => {
    const v = Number(d[i]);
    return Number.isFinite(v) && v >= 0 ? Math.min(v, 1e9) : 0;
  };
  return { id, name: name.slice(0, 24), hero, dmg: n(0), kills: n(1), bossKills: n(2), taken: n(3), revives: n(4), casts: n(5), downs: n(6) };
}

/** One number to rank players: damage first, kills, team play, minus dying a lot. */
export function mvpScore(s: PlayerRunStats): number {
  return s.dmg * 0.01 + s.kills * 1 + s.bossKills * 25 + s.revives * 30 + s.casts * 0.5 + s.taken * 0.004 - s.downs * 10;
}

export interface MvpCard {
  stats: PlayerRunStats;
  mvp: boolean;
  title: string;
  icon: string;
}

const TITLES: Array<{ key: keyof PlayerRunStats; title: string; icon: string; min: number }> = [
  { key: 'kills', title: 'Kasap', icon: '🔪', min: 1 },
  { key: 'dmg', title: 'Yıkım Makinesi', icon: '💥', min: 1 },
  { key: 'revives', title: 'Melek', icon: '🪽', min: 1 },
  { key: 'bossKills', title: 'Dev Avcısı', icon: '☠', min: 1 },
  { key: 'taken', title: 'Duvar', icon: '🛡', min: 1 },
  { key: 'casts', title: 'Yetenek Ustası', icon: '✨', min: 3 },
];

/** Rank players and hand out titles (each title to the best at it; one title per player). */
export function mvpCards(all: PlayerRunStats[]): MvpCard[] {
  const ranked = [...all].sort((a, b) => mvpScore(b) - mvpScore(a));
  const given = new Map<string, { title: string; icon: string }>();
  for (const t of TITLES) {
    let best: PlayerRunStats | null = null;
    for (const s of ranked) {
      if (given.has(s.id)) continue;
      if ((s[t.key] as number) < t.min) continue;
      if (!best || (s[t.key] as number) > (best[t.key] as number)) best = s;
    }
    if (best) given.set(best.id, { title: t.title, icon: t.icon });
  }
  return ranked.map((s, i) => ({
    stats: s,
    mvp: i === 0 && ranked.length > 0,
    title: given.get(s.id)?.title ?? (s.downs === 0 ? 'Hiç düşmedi' : 'Hayatta kalan'),
    icon: given.get(s.id)?.icon ?? '🎖',
  }));
}

const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

export function mvpHtml(cards: MvpCard[], me: string, esc: (s: string) => string): string {
  if (!cards.length) return '';
  return `<div class="mvpRow">${cards
    .map(
      (c) => `<div class="mvpCard${c.mvp ? ' mvp' : ''}${c.stats.id === me ? ' me' : ''}">
        ${c.mvp ? '<div class="crown">MVP</div>' : ''}
        <div class="t">${c.icon} ${esc(c.title)}</div>
        <b>${esc(c.stats.name)}</b><small>${esc(c.stats.hero)}</small>
        <ul><li><span>Hasar</span>${fmt(c.stats.dmg)}</li><li><span>Leş</span>${fmt(c.stats.kills)}</li><li><span>Kaldırma</span>${c.stats.revives}</li><li><span>Alınan</span>${fmt(c.stats.taken)}</li></ul>
      </div>`,
    )
    .join('')}</div>`;
}
