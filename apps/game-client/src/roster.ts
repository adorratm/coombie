import type { AvatarGender } from './avatars';
import type { ClassId } from './progression';
import type { ZombieAvatarKind } from './zombieKinds';
import { weaponIndexOfVariant } from './weapons';

/** Stable operative ids — one unique avatar each (player + 11 rescues). */
export type OperativeId =
  | 'ironclad'
  | 'valkyrie'
  | 'breaker'
  | 'ghost'
  | 'tox'
  | 'spark'
  | 'warden'
  | 'havoc'
  | 'reis'
  | 'sahin'
  | 'kasap'
  | 'cadi';

export type { ZombieAvatarKind };

export interface OperativeRosterDef {
  id: OperativeId;
  name: string;
  classId: ClassId;
  /** Human VRM under /public/avatars — never a zombie_* file */
  avatarUrl: string;
  accent: number;
  scale: number;
  speed: number;
  hp: number;
  weaponIndex: number;
  gender: AvatarGender;
  /** Two-letter HUD diamond label */
  icon: string;
  role: string;
  specialLabel: string;
}

export const OPERATIVE_ROSTER: OperativeRosterDef[] = [
  {
    id: 'ironclad',
    name: 'IRONCLAD',
    classId: 'assaulter',
    avatarUrl: '/avatars/rb/op_ironclad.glb',
    accent: 0x6ea8ff,
    scale: 1.08,
    speed: 7.4,
    hp: 130,
    weaponIndex: 0,
    gender: 'male',
    icon: 'IC',
    role: 'Assault',
    specialLabel: 'Kinetik Nova',
  },
  {
    id: 'valkyrie',
    name: 'VALKYRIE',
    classId: 'medic',
    avatarUrl: '/avatars/rb/op_valkyrie.glb',
    accent: 0x38bdf8,
    scale: 0.98,
    speed: 5.6,
    hp: 95,
    weaponIndex: 1,
    gender: 'female',
    icon: 'VK',
    role: 'Medic',
    specialLabel: 'Biyotik Sis',
  },
  {
    id: 'breaker',
    name: 'BREAKER',
    classId: 'breacher',
    avatarUrl: '/avatars/rb/op_breaker.glb',
    accent: 0xfbbf24,
    scale: 1.12,
    speed: 5.3,
    hp: 110,
    weaponIndex: 2,
    gender: 'male',
    icon: 'BR',
    role: 'Breacher',
    specialLabel: 'Sarsıcı Patlama',
  },
  {
    id: 'ghost',
    name: 'GHOST',
    classId: 'ghost',
    avatarUrl: '/avatars/rb/op_ghost.glb',
    accent: 0x88eeff,
    scale: 0.98,
    speed: 5.9,
    hp: 85,
    weaponIndex: 3,
    gender: 'female',
    icon: 'GH',
    role: 'Recon',
    specialLabel: 'Termal Delici',
  },
  {
    id: 'tox',
    name: 'TOX',
    classId: 'alchemist',
    avatarUrl: '/avatars/rb/op_tox.glb',
    accent: 0x84cc16,
    scale: 0.96,
    speed: 6.1,
    hp: 90,
    weaponIndex: weaponIndexOfVariant('sirt_pompasi'),
    gender: 'female',
    icon: 'TX',
    role: 'Alchemist',
    specialLabel: 'Zehir Bulutu',
  },
  {
    id: 'spark',
    name: 'SPARK',
    classId: 'engineer',
    avatarUrl: '/avatars/rb/op_spark.glb',
    accent: 0xf97316,
    scale: 1.0,
    speed: 5.8,
    hp: 100,
    weaponIndex: weaponIndexOfVariant('civi_tabancasi'),
    gender: 'female',
    icon: 'SP',
    role: 'Engineer',
    specialLabel: 'Nöbetçi Darbe',
  },
  {
    id: 'warden',
    name: 'WARDEN',
    classId: 'gunner',
    avatarUrl: '/avatars/rb/op_warden.glb',
    accent: 0x22d3ee,
    scale: 1.15,
    speed: 5.0,
    hp: 125,
    weaponIndex: 4,
    gender: 'male',
    icon: 'WD',
    role: 'Gunner',
    specialLabel: 'Aşırı Hız',
  },
  {
    id: 'havoc',
    name: 'HAVOC',
    classId: 'demolisher',
    avatarUrl: '/avatars/rb/op_havoc.glb',
    accent: 0xfb7185,
    scale: 1.05,
    speed: 5.5,
    hp: 105,
    weaponIndex: weaponIndexOfVariant('boru_havan'),
    gender: 'male',
    icon: 'HV',
    role: 'Demolisher',
    specialLabel: 'Salkım Bombardıman',
  },
  {
    id: 'reis',
    name: 'REİS',
    classId: 'gunner',
    avatarUrl: '/avatars/rb/op_reis.glb',
    accent: 0xffa040,
    scale: 1.06,
    speed: 5.4,
    hp: 135,
    weaponIndex: weaponIndexOfVariant('kara_tufek'),
    gender: 'male',
    icon: 'RS',
    role: 'Gunner',
    specialLabel: 'Halı Bombardımanı',
  },
  {
    id: 'sahin',
    name: 'ŞAHİN',
    classId: 'engineer',
    avatarUrl: '/avatars/rb/op_sahin.glb',
    accent: 0x5ee0ff,
    scale: 1,
    speed: 6.3,
    hp: 95,
    weaponIndex: weaponIndexOfVariant('sahin_karabina'),
    gender: 'female',
    icon: 'ŞH',
    role: 'Engineer',
    specialLabel: 'Füze Sürüsü',
  },
  {
    id: 'kasap',
    name: 'KASAP',
    classId: 'demolisher',
    avatarUrl: '/avatars/rb/op_kasap.glb',
    accent: 0xff3b3b,
    scale: 1.1,
    speed: 5.7,
    hp: 150,
    weaponIndex: weaponIndexOfVariant('mezbaha'),
    gender: 'male',
    icon: 'KS',
    role: 'Demolisher',
    specialLabel: 'Kıyma Makinesi',
  },
  {
    id: 'cadi',
    name: 'CADI',
    classId: 'alchemist',
    avatarUrl: '/avatars/rb/op_cadi.glb',
    accent: 0xb26bff,
    scale: 0.98,
    speed: 6,
    hp: 100,
    weaponIndex: weaponIndexOfVariant('nazar_puskurtucu'),
    gender: 'female',
    icon: 'CD',
    role: 'Alchemist',
    specialLabel: 'Ruh Hasadı',
  },
];

export const ZOMBIE_AVATAR_URLS: Record<ZombieAvatarKind, string> = {
  grunt: '/avatars/zombie_grunt.vrm',
  acid: '/avatars/zombie_acid.vrm',
  boss: '/avatars/zombie_boss.vrm',
};

export function rosterById(id: OperativeId): OperativeRosterDef {
  return OPERATIVE_ROSTER.find((o) => o.id === id) ?? OPERATIVE_ROSTER[0]!;
}

export function rosterByName(name: string): OperativeRosterDef | undefined {
  return OPERATIVE_ROSTER.find((o) => o.name === name);
}

/** Player always starts as Ironclad; rescues use the remaining 11. */
export function rescueRoster(): OperativeRosterDef[] {
  return OPERATIVE_ROSTER.filter((o) => o.id !== 'ironclad');
}

export function allAvatarUrls(): string[] {
  return [
    // Zombies come from zombieLook.ts pools (Rocketbox GLBs); legacy VRM zombies are not preloaded.
    ...OPERATIVE_ROSTER.map((o) => o.avatarUrl),
  ];
}
