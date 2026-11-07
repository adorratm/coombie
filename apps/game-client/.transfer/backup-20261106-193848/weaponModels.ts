import * as THREE from 'three';
import type { WeaponLook } from './weapons';
import { weaponMaterial } from './weaponAssets';

/**
 * Procedural weapon models from a small `WeaponLook` recipe so 30 guns read as
 * different silhouettes from the top-down camera (length, magazine, optics, stock,
 * muzzle device, finish). Local +Z is the barrel, origin sits at the grip.
 * Geometries and materials are cached — swapping weapons allocates nothing new.
 */

const geoCache = new Map<string, THREE.BufferGeometry>();
const box = (w: number, h: number, d: number) => {
  const k = `b${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
};
const cyl = (r: number, len: number, seg = 10, r2 = r) => {
  const k = `c${r.toFixed(3)}|${r2.toFixed(3)}|${len.toFixed(3)}|${seg}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(r, r2, len, seg);
    g.rotateX(Math.PI / 2); // along Z
    geoCache.set(k, g);
  }
  return g;
};

function mat(color: number, kind: 'metal' | 'poly' | 'glow' | 'glass'): THREE.Material {
  if (kind === 'metal') return weaponMaterial('metal', color, false);
  if (kind === 'poly') return weaponMaterial('polymer', color, false);
  if (kind === 'glass') return weaponMaterial('brass', 0xffffff);
  return weaponMaterial('glow', color);
}

export function buildWeaponModel(look: WeaponLook, s: number): { group: THREE.Group; tip: THREE.Object3D } {
  const g = new THREE.Group();
  const L = look.length ?? 1;
  const B = look.barrel ?? 1;
  const metal = mat(look.finish, 'metal');
  const trim = mat(look.trim, 'poly');
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x * s, y * s, z * s);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const tip = new THREE.Object3D();
  tip.name = 'muzzlePoint';
  let muzzleZ = 0.5;

  switch (look.body) {
    case 'pistol':
    case 'revolver': {
      const len = 0.24 * L;
      add(box(0.07, 0.085, len), metal, 0, 0.02, len / 2 - 0.03);
      add(box(0.06, 0.17, 0.085), trim, 0, -0.08, -0.02);
      if (look.body === 'revolver') add(cyl(0.05, 0.08, 8), metal, 0, 0.01, 0.04);
      const bl = 0.1 * B;
      add(cyl(0.018, bl, 8), metal, 0, 0.03, len - 0.03 + bl / 2);
      muzzleZ = len - 0.03 + bl;
      break;
    }
    case 'smg':
    case 'rifle':
    case 'bullpup':
    case 'sniper':
    case 'lmg':
    case 'launcher':
    case 'shotgun':
    case 'double': {
      const base =
        look.body === 'smg' ? 0.36 : look.body === 'bullpup' ? 0.48 : look.body === 'sniper' ? 0.72 : look.body === 'lmg' ? 0.66 : look.body === 'launcher' ? 0.5 : 0.6;
      const recv = base * 0.55 * L;
      const h = look.body === 'lmg' || look.body === 'launcher' ? 0.12 : 0.095;
      // receiver sits a bit forward of the grip on rifles, behind it on bullpups
      const rz = look.body === 'bullpup' ? -0.06 : 0.04;
      add(box(0.075, h, recv), metal, 0, 0.03, rz + recv / 2);
      add(box(0.05, 0.13, 0.06), trim, 0, -0.06, 0.0); // pistol grip
      // barrel
      const br = look.body === 'launcher' ? 0.05 : look.body === 'double' ? 0.022 : look.body === 'shotgun' ? 0.026 : 0.018;
      const bl = base * 0.55 * B;
      const bz = rz + recv;
      if (look.body === 'double') {
        add(cyl(br, bl, 8), metal, -0.022, 0.04, bz + bl / 2);
        add(cyl(br, bl, 8), metal, 0.022, 0.04, bz + bl / 2);
      } else add(cyl(br, bl, 10), metal, 0, 0.045, bz + bl / 2);
      // handguard
      if (look.body !== 'double' && look.body !== 'launcher')
        add(box(0.07, 0.07, bl * 0.55), trim, 0, 0.035, bz + bl * 0.28);
      if (look.body === 'shotgun' && look.mag === 'tube') add(cyl(0.02, bl * 0.8, 8), metal, 0, 0.0, bz + bl * 0.4);
      muzzleZ = bz + bl;
      // stock
      const st = look.stock ?? 'fixed';
      if (st !== 'none' && look.body !== 'bullpup') {
        const sm = st === 'wood' ? mat(look.trim, 'poly') : trim;
        if (st === 'folding') add(box(0.02, 0.06, 0.22), metal, 0, 0.02, -0.14);
        else add(box(0.06, 0.1, 0.24), sm, 0, 0.0, -0.15);
      }
      // magazine
      const magZ = look.body === 'bullpup' ? -0.1 : rz + 0.1;
      switch (look.mag) {
        case 'curved': {
          const m1 = add(box(0.04, 0.16, 0.06), trim, 0, -0.08, magZ);
          m1.rotation.x = -0.35;
          break;
        }
        case 'straight':
          add(box(0.035, 0.15, 0.05), trim, 0, -0.08, magZ);
          break;
        case 'drum':
          add(cyl(0.07, 0.06, 14), trim, 0, -0.07, magZ).rotation.set(0, Math.PI / 2, 0);
          break;
        case 'box':
          add(box(0.09, 0.1, 0.12), trim, 0.03, -0.05, magZ);
          break;
        default:
          break;
      }
      // bipod for long guns
      if (look.body === 'lmg' || (look.body === 'sniper' && L > 1.2)) {
        const leg = add(box(0.012, 0.16, 0.012), metal, 0.03, -0.05, muzzleZ - 0.12);
        leg.rotation.x = 0.5;
        const leg2 = add(box(0.012, 0.16, 0.012), metal, -0.03, -0.05, muzzleZ - 0.12);
        leg2.rotation.x = 0.5;
      }
      break;
    }
    case 'minigun': {
      add(box(0.12, 0.12, 0.3), metal, 0, 0.03, 0.12);
      add(box(0.05, 0.13, 0.06), trim, 0, -0.07, 0);
      const bl = 0.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(cyl(0.012, bl, 6), metal, Math.cos(a) * 0.035, 0.04 + Math.sin(a) * 0.035, 0.27 + bl / 2);
      }
      add(cyl(0.05, 0.03, 12), trim, 0, 0.04, 0.3);
      add(box(0.1, 0.12, 0.14), trim, 0.1, -0.02, 0.06); // ammo box
      muzzleZ = 0.27 + bl;
      break;
    }
    case 'blade':
    case 'machete': {
      const bl = look.body === 'machete' ? 0.5 : 0.28;
      add(cyl(0.022, 0.13, 8, 0.026), trim, 0, 0, -0.02);
      add(box(0.05, 0.012, 0.04), metal, 0, 0, 0.055);
      add(box(look.body === 'machete' ? 0.055 : 0.035, 0.012, bl), metal, 0, 0, 0.075 + bl / 2);
      muzzleZ = 0.075 + bl;
      break;
    }
    case 'club': {
      add(cyl(0.03, 0.2, 8), trim, 0, 0, 0.0);
      add(cyl(0.035, 0.7, 10, 0.05), metal, 0, 0, 0.44);
      muzzleZ = 0.8;
      break;
    }
    case 'axe': {
      add(cyl(0.025, 0.85, 8), trim, 0, 0, 0.32);
      const head = add(box(0.02, 0.2, 0.12), metal, 0, 0.07, 0.68);
      head.rotation.x = 0.1;
      muzzleZ = 0.75;
      break;
    }
  }

  // optics
  const recvTop = 0.1;
  if (look.scope === 'dot' || look.scope === 'holo') {
    add(box(0.045, 0.045, 0.06), mat(0x15171a, 'poly'), 0, recvTop, 0.14);
    add(box(0.03, 0.03, 0.005), mat(0xff3030, 'glow'), 0, recvTop + 0.005, 0.112);
  } else if (look.scope === 'long') {
    add(cyl(0.028, 0.28, 10), mat(0x111316, 'poly'), 0, recvTop + 0.02, 0.18);
    add(cyl(0.024, 0.01, 10), mat(0, 'glass'), 0, recvTop + 0.02, 0.325);
  }
  // muzzle device
  if (look.muzzle === 'suppressor') {
    add(cyl(0.03, 0.16, 10), mat(0x111214, 'poly'), 0, 0.045, muzzleZ + 0.08);
    muzzleZ += 0.16;
  } else if (look.muzzle === 'brake') {
    add(box(0.05, 0.04, 0.05), metal, 0, 0.045, muzzleZ + 0.025);
    muzzleZ += 0.05;
  } else if (look.muzzle === 'flash') {
    add(cyl(0.026, 0.07, 6, 0.02), metal, 0, 0.045, muzzleZ + 0.035);
    muzzleZ += 0.07;
  }
  // emissive accent strip
  if (look.glow) {
    add(box(0.078, 0.012, Math.max(0.08, muzzleZ * 0.45)), mat(look.glow, 'glow'), 0, 0.055, muzzleZ * 0.35);
  }

  tip.position.set(0, 0.045 * s, muzzleZ * s);
  g.add(tip);
  return { group: g, tip };
}
