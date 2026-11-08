import { loadMetaSave, writeMetaSave } from './metaSave';
import { MAP_ORDER, type MapId, type ModeId } from './mapDefs';
import { DIFFICULTY_ORDER, type DifficultyId } from './gameModes';

/**
 * Achievements: lifetime stats (localStorage) + per-run snapshot. Unlocks pay credits
 * once. `checkLive` runs during a run (toasts), `commitRun` at the end.
 */

export interface RunStats {
  map: MapId;
  mode: ModeId;
  difficulty: DifficultyId;
  won: boolean;
  kills: number;
  kindKills: Partial<Record<string, number>>;
  level: number;
  maxCombo: number;
  evolutions: number;
  skills: number;
  timeSec: number;
  downs: number;
  rescued: number;
  fuel: number;
  coreHp: number;
}

interface LifeStats {
  kills: number;
  kindKills: Record<string, number>;
  wins: number;
  winMaps: Partial<Record<MapId, number>>;
  winModes: Partial<Record<ModeId, number>>;
  bestDiffWin: number;
  rescued: number;
  fuel: number;
  creditsEarned: number;
  bestEndless: number;
}

interface AchSave {
  version: 1;
  stats: LifeStats;
  unlocked: Record<string, number>;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: number;
  /** progress 0..target */
  progress: (s: LifeStats, run: RunStats | null) => number;
  target: number;
}

const KEY = 'protocol-z-ach-v1';
const fresh = (): AchSave => ({
  version: 1,
  stats: { kills: 0, kindKills: {}, wins: 0, winMaps: {}, winModes: {}, bestDiffWin: -1, rescued: 0, fuel: 0, creditsEarned: 0, bestEndless: 0 },
  unlocked: {},
});
let cache: AchSave | null = null;
function load(): AchSave {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as AchSave;
      cache = { ...fresh(), ...p, stats: { ...fresh().stats, ...p.stats } };
      return cache;
    }
  } catch {
    /* ignore */
  }
  cache = fresh();
  return cache;
}
function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* ignore */
  }
}

const k = (s: LifeStats, kind: string, run: RunStats | null) => (s.kindKills[kind] ?? 0) + (run?.kindKills[kind] ?? 0);
const A = (d: AchievementDef) => d;

export const ACHIEVEMENTS: AchievementDef[] = [
  A({ id: 'first_blood', name: 'İlk Kan', desc: 'İlk zombini öldür.', icon: '🩸', reward: 50, target: 1, progress: (s, r) => s.kills + (r?.kills ?? 0) }),
  A({ id: 'hunter', name: 'Avcı', desc: 'Toplam 500 zombi öldür.', icon: '🎯', reward: 150, target: 500, progress: (s, r) => s.kills + (r?.kills ?? 0) }),
  A({ id: 'slaughter', name: 'Katliam', desc: 'Toplam 5.000 zombi öldür.', icon: '⚔', reward: 500, target: 5000, progress: (s, r) => s.kills + (r?.kills ?? 0) }),
  A({ id: 'extinction', name: 'Nesil Tükenmesi', desc: 'Toplam 25.000 zombi öldür.', icon: '☢', reward: 1500, target: 25000, progress: (s, r) => s.kills + (r?.kills ?? 0) }),
  A({ id: 'giant_slayer', name: 'Dev Avcısı', desc: 'Bir boss öldür.', icon: '☠', reward: 200, target: 1, progress: (s, r) => k(s, 'boss', r) }),
  A({ id: 'mutant_butcher', name: 'Mutant Kasabı', desc: '25 boss öldür.', icon: '👹', reward: 800, target: 25, progress: (s, r) => k(s, 'boss', r) }),
  A({ id: 'tank_breaker', name: 'Tank Kırıcı', desc: '100 tank öldür.', icon: '🛡', reward: 300, target: 100, progress: (s, r) => k(s, 'tank', r) }),
  A({ id: 'pop_goes', name: 'Patlamaya Hazır', desc: '100 şişko patlat.', icon: '💥', reward: 250, target: 100, progress: (s, r) => k(s, 'bloater', r) }),
  A({ id: 'silence', name: 'Sessizlik', desc: '100 çığlıkçı sustur.', icon: '🔇', reward: 250, target: 100, progress: (s, r) => k(s, 'screamer', r) }),
  A({ id: 'acid_clean', name: 'Asit Temizliği', desc: '150 asitli zombi öldür.', icon: '🧪', reward: 250, target: 150, progress: (s, r) => k(s, 'acid', r) }),
  A({ id: 'low_blow', name: 'Yerdekiler', desc: '200 sürünen öldür.', icon: '🐍', reward: 250, target: 200, progress: (s, r) => k(s, 'crawler', r) }),
  A({ id: 'first_win', name: 'İlk Zafer', desc: 'Bir görevi tamamla.', icon: '🏁', reward: 200, target: 1, progress: (s, r) => s.wins + (r?.won ? 1 : 0) }),
  A({ id: 'city_saviour', name: 'Şehrin Umudu', desc: 'Ölü Şehir\'de bir görevi tamamla.', icon: '🏙', reward: 200, target: 1, progress: (s, r) => (s.winMaps.city ?? 0) + (r?.won && r.map === 'city' ? 1 : 0) }),
  A({ id: 'world_tour', name: 'Dünya Turu', desc: '10 haritanın hepsinde görev tamamla.', icon: '🌍', reward: 2000, target: MAP_ORDER.length, progress: (s, r) => MAP_ORDER.filter((m) => (s.winMaps[m] ?? 0) > 0 || (r?.won && r.map === m)).length }),
  A({ id: 'versatile', name: 'Çok Yönlü', desc: '5 farklı modda kazan.', icon: '🎲', reward: 800, target: 5, progress: (s, r) => (['survival', 'defense', 'rescue', 'evac', 'boss'] as ModeId[]).filter((m) => (s.winModes[m] ?? 0) > 0 || (r?.won && r.mode === m)).length }),
  A({ id: 'hard_way', name: 'Zor Yoldan', desc: 'Zor zorlukta kazan.', icon: '🔥', reward: 400, target: 1, progress: (s, r) => (Math.max(s.bestDiffWin, r?.won ? DIFFICULTY_ORDER.indexOf(r.difficulty) : -1) >= 2 ? 1 : 0) }),
  A({ id: 'nightmare', name: 'Kâbustan Uyanış', desc: 'Kâbus zorlukta kazan.', icon: '😱', reward: 900, target: 1, progress: (s, r) => (Math.max(s.bestDiffWin, r?.won ? DIFFICULTY_ORDER.indexOf(r.difficulty) : -1) >= 3 ? 1 : 0) }),
  A({ id: 'apocalypse', name: 'Kıyamet Sonrası', desc: 'Kıyamet zorlukta kazan.', icon: '👑', reward: 2500, target: 1, progress: (s, r) => (Math.max(s.bestDiffWin, r?.won ? DIFFICULTY_ORDER.indexOf(r.difficulty) : -1) >= 4 ? 1 : 0) }),
  A({ id: 'evolution', name: 'Evrim', desc: 'Bir yeteneği evrimleştir.', icon: '🧬', reward: 200, target: 1, progress: (_s, r) => r?.evolutions ?? 0 }),
  A({ id: 'triple_evo', name: 'Doğal Seçilim', desc: 'Tek koşuda 3 evrim.', icon: '🦾', reward: 600, target: 3, progress: (_s, r) => r?.evolutions ?? 0 }),
  A({ id: 'full_kit', name: 'Tam Donanım', desc: 'Tek koşuda 6 yetenek.', icon: '🎒', reward: 300, target: 6, progress: (_s, r) => r?.skills ?? 0 }),
  A({ id: 'lvl30', name: 'Veteran', desc: 'Bir koşuda 30. seviyeye ulaş.', icon: '⭐', reward: 400, target: 30, progress: (_s, r) => r?.level ?? 0 }),
  A({ id: 'combo50', name: 'Kesintisiz', desc: '50\'lik kombo yap.', icon: '⚡', reward: 300, target: 50, progress: (_s, r) => r?.maxCombo ?? 0 }),
  A({ id: 'marathon', name: 'Maratoncu', desc: 'Sonsuz modda 20 dakika dayan.', icon: '⏳', reward: 1000, target: 1200, progress: (s, r) => Math.max(s.bestEndless, r?.mode === 'endless' ? r.timeSec : 0) }),
  A({ id: 'rescuer', name: 'Kurtarıcı', desc: 'Toplam 10 hayatta kalan kurtar.', icon: '🤝', reward: 400, target: 10, progress: (s, r) => s.rescued + (r?.rescued ?? 0) }),
  A({ id: 'fuel_runner', name: 'Yakıt Kaçakçısı', desc: 'Toplam 20 yakıt bidonu topla.', icon: '⛽', reward: 400, target: 20, progress: (s, r) => s.fuel + (r?.fuel ?? 0) }),
  A({ id: 'guardian', name: 'Muhafız', desc: 'Savunmayı jeneratör %75+ iken kazan.', icon: '⛨', reward: 500, target: 1, progress: (_s, r) => (r?.won && r.mode === 'defense' && r.coreHp >= 75 ? 1 : 0) }),
  A({ id: 'untouchable', name: 'Ölümsüz', desc: 'Hiç yere düşmeden bir görevi kazan.', icon: '😇', reward: 700, target: 1, progress: (_s, r) => (r?.won && r.downs === 0 ? 1 : 0) }),
  A({ id: 'speedrun', name: 'Hızlı ve Öfkeli', desc: 'Bir tahliyeyi 6 dakikadan kısa sürede bitir.', icon: '🏎', reward: 600, target: 1, progress: (_s, r) => (r?.won && r.mode === 'evac' && r.timeSec < 360 ? 1 : 0) }),
  A({ id: 'rich', name: 'Zengin', desc: 'Toplam 10.000 kredi kazan.', icon: '💰', reward: 500, target: 10000, progress: (s) => s.creditsEarned }),
];

export interface AchievementView {
  def: AchievementDef;
  value: number;
  unlocked: boolean;
  at?: number;
}

export function listAchievements(): AchievementView[] {
  const s = load();
  return ACHIEVEMENTS.map((def) => ({
    def,
    value: Math.min(def.target, def.progress(s.stats, null)),
    unlocked: !!s.unlocked[def.id],
    at: s.unlocked[def.id],
  }));
}

function unlock(def: AchievementDef): void {
  const s = load();
  if (s.unlocked[def.id]) return;
  s.unlocked[def.id] = Date.now();
  const meta = loadMetaSave();
  meta.credits += def.reward;
  writeMetaSave(meta);
}

/** During a run: returns newly unlocked achievements (for toasts). */
export function checkLive(run: RunStats): AchievementDef[] {
  const s = load();
  const out: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (s.unlocked[def.id]) continue;
    if (def.progress(s.stats, run) >= def.target) {
      unlock(def);
      out.push(def);
    }
  }
  if (out.length) save();
  return out;
}

/** End of run: fold the run into lifetime stats, unlock what's due. */
export function commitRun(run: RunStats, creditsEarned: number): AchievementDef[] {
  const fresh = checkLive(run);
  const s = load();
  const st = s.stats;
  st.kills += run.kills;
  for (const [kind, n] of Object.entries(run.kindKills)) st.kindKills[kind] = (st.kindKills[kind] ?? 0) + (n ?? 0);
  if (run.won) {
    st.wins++;
    st.winMaps[run.map] = (st.winMaps[run.map] ?? 0) + 1;
    st.winModes[run.mode] = (st.winModes[run.mode] ?? 0) + 1;
    st.bestDiffWin = Math.max(st.bestDiffWin, DIFFICULTY_ORDER.indexOf(run.difficulty));
  }
  st.rescued += run.rescued;
  st.fuel += run.fuel;
  st.creditsEarned += creditsEarned;
  if (run.mode === 'endless') st.bestEndless = Math.max(st.bestEndless, run.timeSec);
  save();
  // lifetime-only achievements (credits) after the fold
  const after: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (s.unlocked[def.id]) continue;
    if (def.progress(st, null) >= def.target) {
      unlock(def);
      after.push(def);
    }
  }
  save();
  return [...fresh, ...after];
}

export function achievementCounts(): { done: number; total: number } {
  const s = load();
  return { done: Object.keys(s.unlocked).length, total: ACHIEVEMENTS.length };
}
