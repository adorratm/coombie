import * as THREE from 'three';
import type { WeaponSfxKind } from './audio';
import { metalMap, stdMat } from './materials';

export type WeaponId =
  | 'rifle'
  | 'smg'
  | 'shotgun'
  | 'sniper'
  | 'lmg'
  | 'pistol'
  | 'knife'
  | 'bat'
  | 'axe';

/** How the operative grips the weapon for IK / poses. */
export type WeaponGrip = 'rifle' | 'smg' | 'pistol' | 'melee';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  sfx: WeaponSfxKind;
  grip: WeaponGrip;
  fireRate: number;
  damage: number;
  range: number;
  spread: number;
  pellets: number;
  tracerColor: number;
  recoil: number;
  auto: boolean;
  magSize: number;
  reloadTime: number;
  /** Melee weapons ignore ammo / bullets */
  melee?: boolean;
  /** Arc half-angle for melee (radians) */
  meleeArc?: number;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'rifle',
    name: 'Assault Rifle',
    sfx: 'rifle',
    grip: 'rifle',
    fireRate: 0.11,
    damage: 1.2,
    range: 28,
    spread: 0.02,
    pellets: 1,
    tracerColor: 0xffe08a,
    recoil: 0.12,
    auto: true,
    magSize: 30,
    reloadTime: 1.55,
  },
  {
    id: 'smg',
    name: 'SMG',
    sfx: 'smg',
    grip: 'smg',
    fireRate: 0.06,
    damage: 0.7,
    range: 18,
    spread: 0.05,
    pellets: 1,
    tracerColor: 0xffd0a0,
    recoil: 0.06,
    auto: true,
    magSize: 40,
    reloadTime: 1.25,
  },
  {
    id: 'shotgun',
    name: 'Combat Shotgun',
    sfx: 'shotgun',
    grip: 'rifle',
    fireRate: 0.55,
    damage: 1.1,
    range: 12,
    spread: 0.14,
    pellets: 6,
    tracerColor: 0xffaa66,
    recoil: 0.35,
    auto: true,
    magSize: 8,
    reloadTime: 2.1,
  },
  {
    id: 'sniper',
    name: 'Coil Rifle',
    sfx: 'sniper',
    grip: 'rifle',
    fireRate: 0.85,
    damage: 6,
    range: 48,
    spread: 0.004,
    pellets: 1,
    tracerColor: 0x88eeff,
    recoil: 0.4,
    auto: true,
    magSize: 5,
    reloadTime: 2.4,
  },
  {
    id: 'lmg',
    name: 'LMG',
    sfx: 'lmg',
    grip: 'rifle',
    fireRate: 0.09,
    damage: 1.5,
    range: 32,
    spread: 0.035,
    pellets: 1,
    tracerColor: 0xffcc55,
    recoil: 0.16,
    auto: true,
    magSize: 60,
    reloadTime: 2.8,
  },
  {
    id: 'pistol',
    name: 'Sidearm',
    sfx: 'pistol',
    grip: 'pistol',
    fireRate: 0.18,
    damage: 1.05,
    range: 16,
    spread: 0.04,
    pellets: 1,
    tracerColor: 0xffe4b0,
    recoil: 0.1,
    auto: true,
    magSize: 15,
    reloadTime: 1.1,
  },
  {
    id: 'knife',
    name: 'Combat Knife',
    sfx: 'melee',
    grip: 'melee',
    fireRate: 0.38,
    damage: 2.4,
    range: 2.2,
    spread: 0,
    pellets: 1,
    tracerColor: 0xc0c8d0,
    recoil: 0.2,
    auto: true,
    magSize: 1,
    reloadTime: 0.01,
    melee: true,
    meleeArc: 0.95,
  },
  {
    id: 'bat',
    name: 'Riot Bat',
    sfx: 'melee',
    grip: 'melee',
    fireRate: 0.55,
    damage: 3.6,
    range: 2.6,
    spread: 0,
    pellets: 1,
    tracerColor: 0xb45309,
    recoil: 0.35,
    auto: true,
    magSize: 1,
    reloadTime: 0.01,
    melee: true,
    meleeArc: 1.15,
  },
  {
    id: 'axe',
    name: 'Fire Axe',
    sfx: 'melee',
    grip: 'melee',
    fireRate: 0.72,
    damage: 5.2,
    range: 2.8,
    spread: 0,
    pellets: 1,
    tracerColor: 0xef4444,
    recoil: 0.45,
    auto: true,
    magSize: 1,
    reloadTime: 0.01,
    melee: true,
    meleeArc: 1.25,
  },
];

export const FIREARM_IDS: WeaponId[] = ['rifle', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol'];
export const MELEE_IDS: WeaponId[] = ['knife', 'bat', 'axe'];

export function weaponById(id: WeaponId): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0]!;
}

export function weaponByIndex(index: number): WeaponDef {
  const i = ((index % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
  return WEAPONS[i]!;
}

export function isMeleeWeapon(weapon: WeaponDef | WeaponId): boolean {
  const id = typeof weapon === 'string' ? weapon : weapon.id;
  return weaponById(id).melee === true;
}

/** Build weapon mesh + muzzle/tip anchor (local +Z tip). Clears mount first. */
export function attachWeaponMesh(
  mount: THREE.Group,
  weapon: WeaponDef,
  accentColor: number,
  scale = 1,
): THREE.Object3D {
  while (mount.children.length > 0) {
    const child = mount.children[0]!;
    mount.remove(child);
  }

  const s = scale;
  const gunMat = stdMat(metalMap(), 0x1c2228, { metalness: 0.72, roughness: 0.32 });
  const dark = stdMat(null, 0x0c1014, { metalness: 0.25, roughness: 0.55 });
  const accent = stdMat(null, accentColor, {
    metalness: 0.35,
    roughness: 0.45,
    emissive: accentColor,
    emissiveIntensity: 0.4,
  });
  const wood = stdMat(null, 0x6b3f2a, { metalness: 0.05, roughness: 0.75 });
  const tip = new THREE.Object3D();
  tip.name = 'muzzlePoint';

  const g = new THREE.Group();

  if (weapon.id === 'pistol') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * s, 0.025 * s, 0.28 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.16 * s;
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.1 * s, 0.22 * s), dark);
    slide.position.z = 0.06 * s;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.2 * s, 0.1 * s), dark);
    grip.position.set(0, -0.12 * s, -0.02 * s);
    g.add(barrel, slide, grip);
    tip.position.set(0, 0, 0.32 * s);
  } else if (weapon.id === 'knife') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.02 * s, 0.32 * s), gunMat);
    blade.position.z = 0.18 * s;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 0.14 * s, 8), dark);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -0.02 * s;
    g.add(blade, handle);
    tip.position.set(0, 0, 0.36 * s);
  } else if (weapon.id === 'bat') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.045 * s, 0.85 * s, 8), wood);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.35 * s;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.18 * s, 8), dark);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = -0.05 * s;
    g.add(shaft, grip);
    tip.position.set(0, 0, 0.8 * s);
  } else if (weapon.id === 'axe') {
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 0.7 * s, 8), wood);
    haft.rotation.x = Math.PI / 2;
    haft.position.z = 0.28 * s;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28 * s, 0.08 * s, 0.16 * s), gunMat);
    head.position.set(0.06 * s, 0, 0.58 * s);
    g.add(haft, head);
    tip.position.set(0.08 * s, 0, 0.7 * s);
  } else if (weapon.id === 'smg') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * s, 0.032 * s, 0.55 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.28 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.14 * s, 0.28 * s), dark);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.1 * s, 0.16 * s), dark);
    stock.position.z = -0.18 * s;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.28 * s, 0.08 * s), accent);
    mag.position.set(0, -0.18 * s, 0.05 * s);
    g.add(barrel, receiver, stock, mag);
    tip.position.set(0, 0, 0.58 * s);
  } else if (weapon.id === 'shotgun') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.85 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.4 * s;
    const barrel2 = barrel.clone();
    barrel2.position.x = 0.06 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.16 * s, 0.3 * s), dark);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.14 * s, 0.32 * s), dark);
    stock.position.set(0, -0.02 * s, -0.28 * s);
    g.add(barrel, barrel2, receiver, stock);
    tip.position.set(0.03 * s, 0, 0.85 * s);
  } else if (weapon.id === 'sniper') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.035 * s, 1.35 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.55 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.14 * s, 0.4 * s), dark);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.28 * s, 10), accent);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1 * s, 0.05 * s);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.12 * s, 0.36 * s), dark);
    stock.position.z = -0.32 * s;
    g.add(barrel, receiver, scope, stock);
    tip.position.set(0, 0, 1.25 * s);
  } else if (weapon.id === 'lmg') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.045 * s, 1.1 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.48 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.2 * s, 0.42 * s), dark);
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.28 * s, 0.04 * s, 0.04 * s), gunMat);
    bipod.position.set(0, -0.12 * s, 0.35 * s);
    const boxMag = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.22 * s, 0.18 * s), accent);
    boxMag.position.set(0, -0.2 * s, 0.05 * s);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.14 * s, 0.28 * s), dark);
    stock.position.z = -0.3 * s;
    g.add(barrel, receiver, bipod, boxMag, stock);
    tip.position.set(0, 0, 1.05 * s);
  } else {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.04 * s, 0.95 * s, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.42 * s;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.16 * s, 0.32 * s), dark);
    receiver.position.set(0, -0.02 * s, 0.05 * s);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.12 * s, 0.26 * s), dark);
    stock.position.set(0, -0.02 * s, -0.26 * s);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.18 * s, 0.1 * s), dark);
    grip.position.set(0, -0.14 * s, -0.02 * s);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.2 * s, 0.1 * s), accent);
    mag.position.set(0, -0.16 * s, 0.12 * s);
    g.add(barrel, receiver, stock, grip, mag);
    tip.position.set(0, 0, 0.95 * s);
  }

  g.add(tip);
  mount.add(g);
  return tip;
}
