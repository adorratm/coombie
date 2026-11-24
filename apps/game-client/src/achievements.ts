import { loadMetaSave, writeMetaSave } from './metaSave';
import { MAP_ORDER, type MapId, type ModeId } from './mapDefs';
import { DIFFICULTY_ORDER, type DifficultyId } from './gameModes';
import { HERO_SAVE_KEY } from './heroProgress';

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
  /** elemental reactions set off */
  reactions?: number;
  reactionKinds?: Partial<Record<string, number>>;
  /** skill fusions made */
  fusions?: number;
  /** longest Q/E/R ability chain */
  abilityCombo?: number;
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
  reactions: number;
  reactionKinds: Record<string, number>;
  fusions: number;
  bestAbilityCombo: number;
  runs: number;
  /** wins per difficulty index with no downs */
  flawlessDiff: number;
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
  /** secret: name / description stay hidden until it unlocks */
  hidden?: boolean;
  category?: AchievementCategory;
}

export type AchievementCategory = 'combat' | 'missions' | 'world' | 'skills' | 'hero' | 'secret';
export const ACHIEVEMENT_CATEGORY_LABEL: Record<AchievementCategory, string> = {
  combat: 'Savaş',
  missions: 'Görevler',
  world: 'Haritalar',
  skills: 'Yetenek & Kombo',
  hero: 'Operatör',
  secret: 'Gizli',
};

const KEY = 'protocol-z-ach-v1';
const fresh = (): AchSave => ({
  version: 1,
  stats: { kills: 0, kindKills: {}, wins: 0, winMaps: {}, winModes: {}, bestDiffWin: -1, rescued: 0, fuel: 0, creditsEarned: 0, bestEndless: 0, reactions: 0, reactionKinds: {}, fusions: 0, bestAbilityCombo: 0, runs: 0, flawlessDiff: -1 },
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
const wonMode = (s: LifeStats, r: RunStats | null, m: ModeId) => (s.winModes[m] ?? 0) + (r?.won && r.mode === m ? 1 : 0);
const wonMap = (s: LifeStats, r: RunStats | null, m: MapId) => (s.winMaps[m] ?? 0) + (r?.won && r.map === m ? 1 : 0);
const diffIx = (d: DifficultyId) => DIFFICULTY_ORDER.indexOf(d);
const reactKind = (s: LifeStats, r: RunStats | null, id: string) => (s.reactionKinds[id] ?? 0) + (r?.reactionKinds?.[id] ?? 0);
/** highest operator level across every hero (stored by heroProgress) */
function bestOperatorLevel(): number {
  try {
    const raw = localStorage.getItem(HERO_SAVE_KEY);
    if (!raw) return 1;
    let best = 1;
    for (const v of Object.values(JSON.parse(raw) as Record<string, { level?: number }>)) best = Math.max(best, Number(v?.level) || 1);
    return best;
  } catch {
    return 1;
  }
}
function operatorsAt(level: number): number {
  try {
    const raw = localStorage.getItem(HERO_SAVE_KEY);
    if (!raw) return 0;
    return Object.values(JSON.parse(raw) as Record<string, { level?: number }>).filter((v) => (Number(v?.level) || 1) >= level).length;
  } catch {
    return 0;
  }
}
const hourNow = () => new Date().getHours();
const ALL_MODES: ModeId[] = ['survival', 'horde', 'defense', 'rescue', 'evac', 'boss', 'endless', 'zones', 'hunt', 'blitz', 'convoy', 'supply', 'king', 'nests', 'darkness', 'siege', 'mutation', 'onelife', 'delivery', 'infection'];
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
  A({ id: 'world_tour', name: 'Dünya Turu', desc: 'Tüm haritalarda görev tamamla.', icon: '🌍', reward: 2000, target: MAP_ORDER.length, progress: (s, r) => MAP_ORDER.filter((m) => (s.winMaps[m] ?? 0) > 0 || (r?.won && r.map === m)).length }),
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

  // ───────── combat ─────────
  A({ id: 'kills_100k', category: 'combat', name: 'Son İnsan', desc: 'Toplam 100.000 zombi öldür.', icon: '🌋', reward: 4000, target: 100000, progress: (s, r) => s.kills + (r?.kills ?? 0) }),
  A({ id: 'run_1000', category: 'combat', name: 'Tek Kişilik Ordu', desc: 'Tek koşuda 1.000 zombi öldür.', icon: '🪖', reward: 600, target: 1000, progress: (_s, r) => r?.kills ?? 0 }),
  A({ id: 'run_3000', category: 'combat', name: 'Sürü Öğütücü', desc: 'Tek koşuda 3.000 zombi öldür.', icon: '⚙', reward: 1500, target: 3000, progress: (_s, r) => r?.kills ?? 0 }),
  A({ id: 'combo150', category: 'combat', name: 'Durdurulamaz', desc: '150\'lik kombo yap.', icon: '🌪', reward: 900, target: 150, progress: (_s, r) => r?.maxCombo ?? 0 }),
  A({ id: 'boss_100', category: 'combat', name: 'Dev Mezarlığı', desc: '100 boss öldür.', icon: '🗿', reward: 2500, target: 100, progress: (s, r) => k(s, 'boss', r) }),
  A({ id: 'runner_500', category: 'combat', name: 'Kaçamazsın', desc: '500 koşucu öldür.', icon: '🏃', reward: 400, target: 500, progress: (s, r) => k(s, 'runner', r) }),
  A({ id: 'stalker_100', category: 'combat', name: 'Gölge Avcısı', desc: '100 sinsi zombi öldür.', icon: '🥷', reward: 450, target: 100, progress: (s, r) => k(s, 'stalker', r) }),
  A({ id: 'volt_100', category: 'combat', name: 'Topraklama', desc: '100 elektrikli zombi öldür.', icon: '🔌', reward: 450, target: 100, progress: (s, r) => k(s, 'volt', r) }),
  A({ id: 'riot_100', category: 'combat', name: 'Kalkan Kırıcı', desc: '100 çevik kuvvet zombisi öldür.', icon: '🛡', reward: 450, target: 100, progress: (s, r) => k(s, 'riot', r) }),

  // ───────── missions ─────────
  A({ id: 'wins_25', category: 'missions', name: 'Kıdemli', desc: '25 görev kazan.', icon: '🎖', reward: 800, target: 25, progress: (s, r) => s.wins + (r?.won ? 1 : 0) }),
  A({ id: 'wins_100', category: 'missions', name: 'Efsane', desc: '100 görev kazan.', icon: '🏆', reward: 3000, target: 100, progress: (s, r) => s.wins + (r?.won ? 1 : 0) }),
  A({ id: 'modes_10', category: 'missions', name: 'Her Telden', desc: '10 farklı modda kazan.', icon: '🎲', reward: 1500, target: 10, progress: (s, r) => ALL_MODES.filter((m) => wonMode(s, r, m) > 0).length }),
  A({ id: 'modes_all', category: 'missions', name: 'Tam Kadro', desc: 'Bütün modlarda kazan.', icon: '🧭', reward: 5000, target: ALL_MODES.length, progress: (s, r) => ALL_MODES.filter((m) => wonMode(s, r, m) > 0).length }),
  A({ id: 'win_convoy', category: 'missions', name: 'Kervan Yolda Düzülür', desc: 'Konvoy modunu kazan.', icon: '🚚', reward: 400, target: 1, progress: (s, r) => wonMode(s, r, 'convoy') }),
  A({ id: 'win_king', category: 'missions', name: 'Taht Benim', desc: 'Tepenin Kralı modunu kazan.', icon: '👑', reward: 400, target: 1, progress: (s, r) => wonMode(s, r, 'king') }),
  A({ id: 'win_nests', category: 'missions', name: 'Haşere Kontrol', desc: 'Yuva Avı modunu kazan.', icon: '🕷', reward: 450, target: 1, progress: (s, r) => wonMode(s, r, 'nests') }),
  A({ id: 'win_siege', category: 'missions', name: 'Surlar Ayakta', desc: 'Kuşatma modunu kazan.', icon: '🏰', reward: 450, target: 1, progress: (s, r) => wonMode(s, r, 'siege') }),
  A({ id: 'win_delivery', category: 'missions', name: 'Kapıya Teslim', desc: 'Kurye modunu kazan.', icon: '📦', reward: 400, target: 1, progress: (s, r) => wonMode(s, r, 'delivery') }),
  A({ id: 'win_supply', category: 'missions', name: 'Lojistik', desc: 'İkmal Avı modunu kazan.', icon: '🎁', reward: 400, target: 1, progress: (s, r) => wonMode(s, r, 'supply') }),
  A({ id: 'win_mutation', category: 'missions', name: 'Uyum Sağla', desc: 'Mutasyon modunu kazan.', icon: '🧬', reward: 600, target: 1, progress: (s, r) => wonMode(s, r, 'mutation') }),
  A({ id: 'win_darkness', category: 'missions', name: 'Şafak Söktü', desc: 'Karanlık Çöküyor modunu kazan.', icon: '🌅', reward: 600, target: 1, progress: (s, r) => wonMode(s, r, 'darkness') }),
  A({ id: 'win_infection', category: 'missions', name: 'Panzehir', desc: 'Salgın modunu kazan.', icon: '💉', reward: 600, target: 1, progress: (s, r) => wonMode(s, r, 'infection') }),
  A({ id: 'win_onelife', category: 'missions', name: 'Bir Kere Yaşarsın', desc: 'Tek Can modunu kazan.', icon: '💀', reward: 900, target: 1, progress: (s, r) => wonMode(s, r, 'onelife') }),
  A({ id: 'horde_win', category: 'missions', name: 'Sürü Sonu', desc: 'Horde modunu kazan.', icon: '🧟', reward: 700, target: 1, progress: (s, r) => wonMode(s, r, 'horde') }),
  A({ id: 'endless_40', category: 'missions', name: 'Sonsuzluğa Doğru', desc: 'Sonsuz modda 40 dakika dayan.', icon: '♾', reward: 2000, target: 2400, progress: (s, r) => Math.max(s.bestEndless, r?.mode === 'endless' ? r.timeSec : 0) }),

  // ───────── world ─────────
  A({ id: 'map_village', category: 'world', name: 'Köy Ağası', desc: 'Terk Edilmiş Köy\'de kazan.', icon: '🏡', reward: 250, target: 1, progress: (s, r) => wonMap(s, r, 'village') }),
  A({ id: 'map_mall', category: 'world', name: 'Kara Cuma', desc: 'Alışveriş Merkezi\'nde kazan.', icon: '🛒', reward: 250, target: 1, progress: (s, r) => wonMap(s, r, 'mall') }),
  A({ id: 'map_airport', category: 'world', name: 'Son Uçuş', desc: 'Kapalı Havalimanı\'nda kazan.', icon: '🛫', reward: 250, target: 1, progress: (s, r) => wonMap(s, r, 'airport') }),
  A({ id: 'map_campus', category: 'world', name: 'Mezuniyet', desc: 'Üniversite Kampüsü\'nde kazan.', icon: '🎓', reward: 250, target: 1, progress: (s, r) => wonMap(s, r, 'campus') }),
  A({ id: 'map_lab', category: 'world', name: 'Sıfır Noktası', desc: 'Yeraltı Laboratuvarı\'nda kazan.', icon: '🧪', reward: 300, target: 1, progress: (s, r) => wonMap(s, r, 'lab') }),
  A({ id: 'map_snow', category: 'world', name: 'Kutup Kurdu', desc: 'Kar Köyü\'nde kazan.', icon: '❄', reward: 250, target: 1, progress: (s, r) => wonMap(s, r, 'snow') }),
  A({ id: 'map_river', category: 'world', name: 'Köprü Bekçisi', desc: 'Nehir Kasabası\'nda kazan.', icon: '🌉', reward: 300, target: 1, progress: (s, r) => wonMap(s, r, 'river') }),
  A({ id: 'map_canyon', category: 'world', name: 'Kanyon Kurdu', desc: 'Kızıl Kanyon\'da kazan.', icon: '🏜', reward: 300, target: 1, progress: (s, r) => wonMap(s, r, 'canyon') }),
  A({ id: 'map_fortress', category: 'world', name: 'Kale Komutanı', desc: 'Kale Kuşatması\'nda kazan.', icon: '🏯', reward: 300, target: 1, progress: (s, r) => wonMap(s, r, 'fortress') }),
  A({ id: 'map_volcano', category: 'world', name: 'Ateşten Geçen', desc: 'Kül Dağı\'nda kazan.', icon: '🌋', reward: 350, target: 1, progress: (s, r) => wonMap(s, r, 'volcano') }),
  A({ id: 'map_maze', category: 'world', name: 'Labirent Çözücü', desc: 'Çit Labirenti\'nde kazan.', icon: '🌿', reward: 350, target: 1, progress: (s, r) => wonMap(s, r, 'maze') }),
  A({ id: 'map_lunapark', category: 'world', name: 'Bilet Kesildi', desc: 'Terk Edilmiş Lunapark\'ta kazan.', icon: '🎡', reward: 350, target: 1, progress: (s, r) => wonMap(s, r, 'lunapark') }),

  // ───────── skills & combos ─────────
  A({ id: 'react_first', category: 'skills', name: 'Kimya Dersi', desc: 'İlk element kombonu patlat (yanma+donma, yanma+zehir, donma+zehir).', icon: '⚗', reward: 150, target: 1, progress: (s, r) => s.reactions + (r?.reactions ?? 0) }),
  A({ id: 'react_1000', category: 'skills', name: 'Laboratuvar Faresi', desc: 'Toplam 1.000 element kombosu.', icon: '🧫', reward: 1200, target: 1000, progress: (s, r) => s.reactions + (r?.reactions ?? 0) }),
  A({ id: 'react_thermal', category: 'skills', name: 'Termal Şok Uzmanı', desc: '100 Termal Şok.', icon: '♨', reward: 500, target: 100, progress: (s, r) => reactKind(s, r, 'thermal') }),
  A({ id: 'react_toxic', category: 'skills', name: 'Zehirli Patlayıcı', desc: '100 Zehir Patlaması.', icon: '☣', reward: 500, target: 100, progress: (s, r) => reactKind(s, r, 'toxicBlast') }),
  A({ id: 'react_cryo', category: 'skills', name: 'Kristal Ustası', desc: '100 Kristal Zehir.', icon: '💎', reward: 500, target: 100, progress: (s, r) => reactKind(s, r, 'cryoToxin') }),
  A({ id: 'fusion_first', category: 'skills', name: 'Birleşim', desc: 'İki yeteneği birleştir (füzyon).', icon: '🧪', reward: 250, target: 1, progress: (s, r) => s.fusions + (r?.fusions ?? 0) }),
  A({ id: 'fusion_3run', category: 'skills', name: 'Üçlü Füzyon', desc: 'Tek koşuda 3 füzyon.', icon: '🔱', reward: 800, target: 3, progress: (_s, r) => r?.fusions ?? 0 }),
  A({ id: 'fusion_50', category: 'skills', name: 'Füzyon Reaktörü', desc: 'Toplam 50 füzyon.', icon: '☢', reward: 1500, target: 50, progress: (s, r) => s.fusions + (r?.fusions ?? 0) }),
  A({ id: 'chain_2', category: 'skills', name: 'Zincirleme', desc: 'İki yeteneği arka arkaya kullanıp kombo yap.', icon: '🔗', reward: 150, target: 2, progress: (s, r) => Math.max(s.bestAbilityCombo, r?.abilityCombo ?? 0) }),
  A({ id: 'chain_3', category: 'skills', name: 'Q-E-R', desc: 'Üç yeteneği 3.5 saniye içinde zincirle.', icon: '⛓', reward: 500, target: 3, progress: (s, r) => Math.max(s.bestAbilityCombo, r?.abilityCombo ?? 0) }),
  A({ id: 'evo_5', category: 'skills', name: 'Evrim Teorisi', desc: 'Tek koşuda 5 evrim.', icon: '🦕', reward: 1200, target: 5, progress: (_s, r) => r?.evolutions ?? 0 }),
  A({ id: 'lvl60', category: 'skills', name: 'Usta', desc: 'Bir koşuda 60. seviyeye ulaş.', icon: '🌟', reward: 900, target: 60, progress: (_s, r) => r?.level ?? 0 }),
  A({ id: 'lvl100run', category: 'skills', name: 'Yüzbaşı', desc: 'Bir koşuda 100. seviyeye ulaş.', icon: '💯', reward: 2500, target: 100, progress: (_s, r) => r?.level ?? 0 }),

  // ───────── operator ─────────
  A({ id: 'op_25', category: 'hero', name: 'Çaylak Değil', desc: 'Bir operatörü 25. seviyeye çıkar.', icon: '🪪', reward: 400, target: 25, progress: () => bestOperatorLevel() }),
  A({ id: 'op_50', category: 'hero', name: 'Yarı Yol', desc: 'Bir operatörü 50. seviyeye çıkar.', icon: '🎗', reward: 1000, target: 50, progress: () => bestOperatorLevel() }),
  A({ id: 'op_75', category: 'hero', name: 'Eski Sınır', desc: 'Bir operatörü 75. seviyeye çıkar.', icon: '🏅', reward: 2000, target: 75, progress: () => bestOperatorLevel() }),
  A({ id: 'op_100', category: 'hero', name: 'Zirve', desc: 'Bir operatörü 100. seviyeye çıkar.', icon: '👑', reward: 5000, target: 100, progress: () => bestOperatorLevel() }),
  A({ id: 'op_team', category: 'hero', name: 'Ekip Başı', desc: '4 operatörü 25. seviyeye çıkar.', icon: '👥', reward: 1500, target: 4, progress: () => operatorsAt(25) }),
  A({ id: 'runs_50', category: 'hero', name: 'Sadık Asker', desc: '50 koşu oyna.', icon: '📅', reward: 700, target: 50, progress: (s) => s.runs }),

  // ───────── secret ─────────
  A({ id: 's_night_owl', category: 'secret', hidden: true, name: 'Gece Kuşu', desc: 'Gece 00:00 ile 04:00 arasında bir görevi kazan.', icon: '🦉', reward: 500, target: 1, progress: (_s, r) => (r?.won && hourNow() < 4 ? 1 : 0) }),
  A({ id: 's_flawless_apoc', category: 'secret', hidden: true, name: 'Dokunulmaz', desc: 'Kıyamet zorlukta hiç yere düşmeden kazan.', icon: '🛸', reward: 4000, target: 1, progress: (s, r) => (s.flawlessDiff >= 4 || (r?.won && r.downs === 0 && r.difficulty === 'apocalypse') ? 1 : 0) }),
  A({ id: 's_one_apoc', category: 'secret', hidden: true, name: 'Kıyamette Tek Can', desc: 'Tek Can modunu Kıyamet zorlukta kazan.', icon: '☠', reward: 5000, target: 1, progress: (_s, r) => (r?.won && r.mode === 'onelife' && r.difficulty === 'apocalypse' ? 1 : 0) }),
  A({ id: 's_purist', category: 'secret', hidden: true, name: 'Saf Nişancı', desc: 'Hiç evrim ve füzyon yapmadan 20 dakikalık Hayatta Kal\'ı kazan.', icon: '🎯', reward: 1500, target: 1, progress: (_s, r) => (r?.won && r.mode === 'survival' && r.timeSec >= 1200 && (r.evolutions ?? 0) === 0 && (r.fusions ?? 0) === 0 ? 1 : 0) }),
  A({ id: 's_mad_chemist', category: 'secret', hidden: true, name: 'Çılgın Kimyager', desc: 'Tek koşuda 250 element kombosu.', icon: '🧑‍🔬', reward: 1500, target: 250, progress: (_s, r) => r?.reactions ?? 0 }),
  A({ id: 's_express', category: 'secret', hidden: true, name: 'Ekspres Kargo', desc: 'Kurye modunu 6 dakikadan kısa sürede kazan.', icon: '⚡', reward: 1000, target: 1, progress: (_s, r) => (r?.won && r.mode === 'delivery' && r.timeSec < 360 ? 1 : 0) }),
  A({ id: 's_dark_nightmare', category: 'secret', hidden: true, name: 'Karanlığın Efendisi', desc: 'Karanlık Çöküyor\'u Kâbus veya üstünde kazan.', icon: '🌑', reward: 2000, target: 1, progress: (_s, r) => (r?.won && r.mode === 'darkness' && diffIx(r.difficulty) >= 3 ? 1 : 0) }),
  A({ id: 's_hour', category: 'secret', hidden: true, name: 'Bir Saat', desc: '60 dakikalık Hayatta Kal görevini kazan.', icon: '⌛', reward: 3000, target: 1, progress: (_s, r) => (r?.won && r.mode === 'survival' && r.timeSec >= 3600 ? 1 : 0) }),
  A({ id: 's_lone_wolf', category: 'secret', hidden: true, name: 'Yalnız Kurt', desc: 'Hiç kombo yapmadan (maks. kombo 5) bir görevi kazan.', icon: '🐺', reward: 1200, target: 1, progress: (_s, r) => (r?.won && r.maxCombo <= 5 && r.kills > 50 ? 1 : 0) }),
  A({ id: 's_all_reactions', category: 'secret', hidden: true, name: 'Periyodik Tablo', desc: 'Tek koşuda üç kombo türünün hepsini patlat.', icon: '🧮', reward: 800, target: 3, progress: (_s, r) => Object.values(r?.reactionKinds ?? {}).filter((n) => (n ?? 0) > 0).length }),
  A({ id: 's_comeback', category: 'secret', hidden: true, name: 'Küllerinden Doğan', desc: 'Üç kez yere düşüp yine de kazan.', icon: '🔥', reward: 1000, target: 1, progress: (_s, r) => (r?.won && r.downs >= 3 ? 1 : 0) }),
  A({ id: 's_fast_blitz', category: 'secret', hidden: true, name: 'Kasırga', desc: 'Katliam modunu 4 dakikadan kısa sürede kazan.', icon: '🌪', reward: 1500, target: 1, progress: (_s, r) => (r?.won && r.mode === 'blitz' && r.timeSec < 240 ? 1 : 0) }),
];
for (const a of ACHIEVEMENTS) a.category ??= /win|mode|marathon|guardian|speedrun|rescuer|fuel|hard_way|nightmare|apocalypse|untouchable|versatile/.test(a.id) ? 'missions' : /world|city/.test(a.id) ? 'world' : /evo|kit|lvl|combo50/.test(a.id) ? 'skills' : /rich/.test(a.id) ? 'hero' : 'combat';

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
  st.runs += 1;
  st.reactions += run.reactions ?? 0;
  for (const [rk, n] of Object.entries(run.reactionKinds ?? {})) st.reactionKinds[rk] = (st.reactionKinds[rk] ?? 0) + (n ?? 0);
  st.fusions += run.fusions ?? 0;
  st.bestAbilityCombo = Math.max(st.bestAbilityCombo, run.abilityCombo ?? 0);
  if (run.won && run.downs === 0) st.flawlessDiff = Math.max(st.flawlessDiff, DIFFICULTY_ORDER.indexOf(run.difficulty));
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
