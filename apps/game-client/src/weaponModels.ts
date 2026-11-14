import * as THREE from 'three';
import type { WeaponLook } from './weapons';
import { addSupportPoint, weaponMaterial } from './weaponAssets';

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
    case 'shotgun':
    case 'double': {
      const base =
        look.body === 'smg' ? 0.36 : look.body === 'bullpup' ? 0.48 : look.body === 'sniper' ? 0.72 : look.body === 'lmg' ? 0.66 : 0.6;
      const recv = base * 0.55 * L;
      const h = look.body === 'lmg' ? 0.12 : 0.095;
      // receiver sits a bit forward of the grip on rifles, behind it on bullpups
      const rz = look.body === 'bullpup' ? -0.06 : 0.04;
      add(box(0.075, h, recv), metal, 0, 0.03, rz + recv / 2);
      add(box(0.05, 0.13, 0.06), trim, 0, -0.06, 0.0); // pistol grip
      // barrel
      const br = look.body === 'double' ? 0.022 : look.body === 'shotgun' ? 0.026 : 0.018;
      const bl = base * 0.55 * B;
      const bz = rz + recv;
      if (look.body === 'double') {
        add(cyl(br, bl, 8), metal, -0.022, 0.04, bz + bl / 2);
        add(cyl(br, bl, 8), metal, 0.022, 0.04, bz + bl / 2);
      } else add(cyl(br, bl, 10), metal, 0, 0.045, bz + bl / 2);
      // handguard
      if (look.body !== 'double')
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
      // hand-held rotary gun: motor housing, feeder, six clamped barrels, carry handle, ammo box + chute
      const dark = mat(0x16181b, 'poly');
      const ay = 0.045; // barrel-cluster axis height
      add(cyl(0.062, 0.16, 18), metal, 0, ay, 0.05); // motor housing
      add(cyl(0.066, 0.012, 18), dark, 0, ay, -0.03); // rear cap
      add(box(0.112, 0.104, 0.12), metal, 0, ay, 0.19); // feeder / delinker block
      add(cyl(0.07, 0.024, 18), dark, 0, ay, 0.262); // gear ring
      const bz = 0.27;
      const bl = 0.52;
      add(cyl(0.013, bl, 8), dark, 0, ay, bz + bl / 2); // spindle
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(cyl(0.0115, bl, 8), metal, Math.cos(a) * 0.036, ay + Math.sin(a) * 0.036, bz + bl / 2);
      }
      for (const z of [0.37, 0.56, 0.745]) add(cyl(0.053, 0.014, 18), dark, 0, ay, z); // barrel clamps
      add(cyl(0.058, 0.035, 18, 0.05), dark, 0, ay, bz + bl - 0.005); // flash hider collar
      // carry handle
      add(box(0.014, 0.06, 0.014), dark, 0, ay + 0.085, 0.1);
      add(box(0.014, 0.06, 0.014), dark, 0, ay + 0.085, 0.3);
      add(cyl(0.013, 0.24, 8), trim, 0, ay + 0.118, 0.2);
      // firing grip + rear D-handle
      add(box(0.044, 0.125, 0.052), trim, 0, -0.07, 0.0).rotation.x = 0.2;
      add(box(0.012, 0.012, 0.07), dark, 0, -0.045, 0.05); // trigger guard
      add(box(0.03, 0.03, 0.09), dark, 0, ay - 0.02, -0.08);
      add(box(0.036, 0.11, 0.03), trim, 0, ay - 0.045, -0.125);
      // battery pack under the feeder, ammo box and feed chute on the right
      add(box(0.07, 0.05, 0.1), dark, 0, ay - 0.075, 0.19);
      add(box(0.09, 0.12, 0.15), trim, 0.11, -0.035, 0.13);
      add(box(0.094, 0.012, 0.154), dark, 0.11, 0.028, 0.13); // lid
      for (let i = 0; i < 4; i++) {
        const k = i / 3;
        const link = add(box(0.046, 0.016, 0.05), metal, 0.115 - k * 0.05, 0.045 + Math.sin(k * Math.PI) * 0.035 + k * 0.03, 0.14 + k * 0.05);
        link.rotation.z = 0.5 - k * 0.9;
      }
      muzzleZ = bz + bl + 0.012;
      break;
    }
    case 'launcher': {
      // six-shot revolver launcher: open frame, fluted drum, short fat barrel, foregrip, tube stock
      const dark = mat(0x16181b, 'poly');
      const ay = 0.045; // barrel axis
      const cy = ay - 0.05; // drum axis: the top chamber lines up with the barrel
      add(box(0.05, 0.05, 0.1), metal, 0, ay - 0.01, -0.02); // rear frame
      add(box(0.03, 0.02, 0.27), metal, 0, ay + 0.04, 0.14); // top strap / rail
      add(box(0.03, 0.02, 0.2), metal, 0, cy - 0.082, 0.13); // bottom strap
      add(cyl(0.078, 0.14, 20), trim, 0, cy, 0.12); // drum
      add(cyl(0.08, 0.012, 20), dark, 0, cy, 0.045);
      add(cyl(0.08, 0.012, 20), dark, 0, cy, 0.195);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + (i / 6) * Math.PI * 2;
        add(cyl(0.023, 0.146, 10), dark, Math.cos(a) * 0.05, cy + Math.sin(a) * 0.05, 0.12); // chambers
      }
      add(box(0.05, 0.06, 0.05), metal, 0, ay - 0.005, 0.225); // barrel trunnion
      const bz = 0.25;
      const bl = 0.25;
      add(cyl(0.031, bl, 14), metal, 0, ay, bz + bl / 2);
      add(cyl(0.037, 0.03, 14), dark, 0, ay, bz + bl - 0.015); // muzzle ring
      add(box(0.044, 0.03, 0.15), dark, 0, ay - 0.045, bz + 0.1); // handguard
      add(box(0.034, 0.11, 0.04), trim, 0, ay - 0.115, bz + 0.1).rotation.x = -0.15; // foregrip
      add(box(0.044, 0.125, 0.052), trim, 0, -0.07, 0.0).rotation.x = 0.2; // firing grip
      add(box(0.012, 0.012, 0.07), dark, 0, -0.04, 0.045);
      // stock
      add(cyl(0.013, 0.24, 8), metal, 0, ay, -0.19);
      add(cyl(0.013, 0.2, 8), metal, 0, ay - 0.06, -0.19).rotation.x = -0.18;
      add(box(0.034, 0.13, 0.03), trim, 0, ay - 0.03, -0.315);
      // reflex sight
      add(box(0.03, 0.036, 0.05), dark, 0, ay + 0.068, 0.06);
      add(box(0.022, 0.022, 0.004), mat(0xff3030, 'glow'), 0, ay + 0.072, 0.036);
      muzzleZ = bz + bl;
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
  const melee = look.body === 'blade' || look.body === 'machete' || look.body === 'club' || look.body === 'axe';
  if (!melee) addSupportPoint(g, tip.position, look.body === 'pistol' || look.body === 'revolver' ? 0 : look.body === 'minigun' ? 0.3 : 0.5, s);
  return { group: g, tip };
}
