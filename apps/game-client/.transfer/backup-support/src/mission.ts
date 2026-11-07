/** Mission chapters, map sectors, and run objectives for PROTOCOL-Z. */

export interface MissionSector {
  id: string;
  name: string;
  code: string;
  x: number;
  z: number;
  radius: number;
  color: number;
}

export type ObjectiveKind = 'survive' | 'kills' | 'hold_core' | 'rescue';

export interface MissionChapter {
  id: string;
  index: number;
  title: string;
  codename: string;
  brief: string;
  /** Inclusive wave range for this chapter */
  startWave: number;
  endWave: number;
  objective: {
    kind: ObjectiveKind;
    target: number;
    label: string;
  };
}

export interface MissionHudState {
  chapterIndex: number;
  chapterTitle: string;
  chapterCodename: string;
  brief: string;
  sectorId: string;
  sectorName: string;
  sectorCode: string;
  objectiveLabel: string;
  objectiveProgress: number;
  objectiveTarget: number;
  objectiveComplete: boolean;
  chapterCount: number;
  /** Short Turkish toast when chapter flips */
  banner: string;
}

/** Named districts matching map layout (ARENA ~560). */
export const MISSION_SECTORS: MissionSector[] = [
  { id: 'core', name: 'Reaktör Merkezi', code: 'Z-0', x: 0, z: 0, radius: 48, color: 0x3dff9a },
  { id: 'foundry', name: 'Döküm Sahası', code: 'A-1', x: -160, z: -160, radius: 90, color: 0xf59e0b },
  { id: 'boneyard', name: 'Enkaz Mahalle', code: 'B-2', x: 160, z: 140, radius: 90, color: 0x94a3b8 },
  { id: 'hangar', name: 'Hangar Hattı', code: 'C-3', x: 140, z: -160, radius: 85, color: 0x38bdf8 },
  { id: 'greenbelt', name: 'Yeşil Kuşak', code: 'D-4', x: -140, z: 140, radius: 85, color: 0x84cc16 },
  { id: 'rampart', name: 'Dış Sur', code: 'E-5', x: 0, z: -220, radius: 70, color: 0xff5722 },
];

export const MISSION_CHAPTERS: MissionChapter[] = [
  {
    id: 'ch01',
    index: 1,
    title: 'Karantina İhlali',
    codename: 'KARARLIK',
    brief: 'Reaktör önünü tut. İlk temas yaklaşıyor.',
    startWave: 1,
    endWave: 2,
    objective: { kind: 'survive', target: 2, label: 'Dalgaları atlat' },
  },
  {
    id: 'ch02',
    index: 2,
    title: 'Döküm Temizliği',
    codename: 'CURUF',
    brief: 'Güneybatı sanayi gridini aç. Kota doldur.',
    startWave: 3,
    endWave: 4,
    objective: { kind: 'kills', target: 25, label: 'Bölge elemeleri' },
  },
  {
    id: 'ch03',
    index: 3,
    title: 'Kurtarma Penceresi',
    codename: 'CANHAT',
    brief: 'Esir operatörler sinyalde. Timini 8’e çıkar.',
    startWave: 5,
    endWave: 6,
    objective: { kind: 'rescue', target: 2, label: 'Operatör kurtar' },
  },
  {
    id: 'ch04',
    index: 4,
    title: 'Hangar Kilidi',
    codename: 'KAPI-7',
    brief: 'Güneydoğu askeri padler. Seçkin dalgayı incel.',
    startWave: 7,
    endWave: 9,
    objective: { kind: 'kills', target: 40, label: 'Hangar elemeleri' },
  },
  {
    id: 'ch05',
    index: 5,
    title: 'Çekirdek Savunması',
    codename: 'NABIZ',
    brief: 'Z-0’a dön. Reaktör düşmesin.',
    startWave: 10,
    endWave: 12,
    objective: { kind: 'hold_core', target: 90, label: 'Merkezi tut (sn)' },
  },
  {
    id: 'ch06',
    index: 6,
    title: 'Tam Kadro',
    codename: 'SEKIZ',
    brief: 'Sekiz tüfek hazır. Kalan grid’i temizle.',
    startWave: 13,
    endWave: 99,
    objective: { kind: 'kills', target: 80, label: 'Bölüm elemeleri' },
  },
];

export interface MissionRuntime {
  chapterKills: number;
  rescuesThisChapter: number;
  coreHoldSec: number;
  lastChapterId: string;
  banner: string;
  bannerUntil: number;
}

export function createMissionRuntime(): MissionRuntime {
  const first = MISSION_CHAPTERS[0]!;
  return {
    chapterKills: 0,
    rescuesThisChapter: 0,
    coreHoldSec: 0,
    lastChapterId: first.id,
    banner: `Bölüm ${first.index}: ${first.title}`,
    bannerUntil: 5,
  };
}

export function chapterForWave(wave: number): MissionChapter {
  const w = Math.max(1, wave);
  for (const ch of MISSION_CHAPTERS) {
    if (w >= ch.startWave && w <= ch.endWave) return ch;
  }
  return MISSION_CHAPTERS[MISSION_CHAPTERS.length - 1]!;
}

export function sectorAt(x: number, z: number): MissionSector {
  let best = MISSION_SECTORS[0]!;
  let bestD = Infinity;
  for (const s of MISSION_SECTORS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.radius && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  // Fallback: nearest sector center if outside all radii
  if (bestD === Infinity || bestD > best.radius) {
    for (const s of MISSION_SECTORS) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
  }
  return best;
}

export function tickMission(opts: {
  runtime: MissionRuntime;
  wave: number;
  dt: number;
  simTime: number;
  playerX: number;
  playerZ: number;
  squadSize: number;
  justKilled: boolean;
  justRescued: boolean;
}): MissionHudState {
  const { runtime, wave, dt, simTime, playerX, playerZ, justKilled, justRescued } = opts;
  const chapter = chapterForWave(wave);
  if (chapter.id !== runtime.lastChapterId) {
    runtime.lastChapterId = chapter.id;
    runtime.chapterKills = 0;
    runtime.rescuesThisChapter = 0;
    runtime.coreHoldSec = 0;
    runtime.banner = `Bölüm ${chapter.index}: ${chapter.title} — ${chapter.codename}`;
    runtime.bannerUntil = simTime + 4.5;
  }

  if (justKilled) runtime.chapterKills += 1;
  if (justRescued) {
    runtime.rescuesThisChapter += 1;
    runtime.banner = 'Operatör kurtarıldı — tim güçlendi';
    runtime.bannerUntil = simTime + 3;
  }

  const sector = sectorAt(playerX, playerZ);
  if (chapter.objective.kind === 'hold_core' && sector.id === 'core') {
    runtime.coreHoldSec += dt;
  }

  let progress = 0;
  switch (chapter.objective.kind) {
    case 'survive':
      progress = Math.min(chapter.objective.target, Math.max(0, wave - chapter.startWave + 1));
      break;
    case 'kills':
      progress = runtime.chapterKills;
      break;
    case 'rescue':
      progress = runtime.rescuesThisChapter;
      break;
    case 'hold_core':
      progress = Math.floor(runtime.coreHoldSec);
      break;
    default:
      progress = 0;
  }

  const target = chapter.objective.target;
  const complete = progress >= target;
  if (complete && runtime.bannerUntil < simTime && runtime.banner === '') {
    // no-op; banner already handled on transitions
  }

  return {
    chapterIndex: chapter.index,
    chapterTitle: chapter.title,
    chapterCodename: chapter.codename,
    brief: chapter.brief,
    sectorId: sector.id,
    sectorName: sector.name,
    sectorCode: sector.code,
    objectiveLabel: chapter.objective.label,
    objectiveProgress: Math.min(progress, target),
    objectiveTarget: target,
    objectiveComplete: complete,
    chapterCount: MISSION_CHAPTERS.length,
    banner: simTime < runtime.bannerUntil ? runtime.banner : '',
  };
}
