import * as THREE from 'three';
import type { WeaponDef } from './weapons';

/**
 * Weapon gear bought in the armory: a base power level per weapon and attachments
 * (one per slot) that each level up. Both change the weapon's numbers in a run and
 * the attachments show on the gun model (lobby preview and in game).
 */

export type AttachmentSlot = 'muzzle' | 'optic' | 'under' | 'rail' | 'mag' | 'stock';
export type AttachmentId = 'suppressor' | 'brake' | 'reddot' | 'scope' | 'foregrip' | 'laser' | 'extmag' | 'stock';

export interface AttachmentDef {
  id: AttachmentId;
  slot: AttachmentSlot;
  name: string;
  icon: string;
  /** what one level does (display) */
  perLevel: string;
  baseCost: number;
  /** per level */
  dmg?: number;
  range?: number;
  spread?: number;
  recoil?: number;
  mag?: number;
  reload?: number;
  fireRate?: number;
}

export const ATTACHMENT_MAX = 5;
export const POWER_MAX = 10;
/** extra damage per weapon power level */
export const POWER_STEP = 0.06;

export const ATTACHMENTS: Record<AttachmentId, AttachmentDef> = {
  suppressor: { id: 'suppressor', slot: 'muzzle', name: 'Susturucu', icon: '🔇', perLevel: '+%5 menzil, +%2 hasar', baseCost: 180, range: 0.05, dmg: 0.02 },
  brake: { id: 'brake', slot: 'muzzle', name: 'Namlu Freni', icon: '💢', perLevel: '+%4 hasar, −%8 geri tepme', baseCost: 200, dmg: 0.04, recoil: 0.08 },
  reddot: { id: 'reddot', slot: 'optic', name: 'Kırmızı Nokta', icon: '🔴', perLevel: '−%6 saçılma, +%2 atış hızı', baseCost: 150, spread: 0.06, fireRate: 0.02 },
  scope: { id: 'scope', slot: 'optic', name: 'Dürbün', icon: '🔭', perLevel: '+%10 menzil, +%3 hasar', baseCost: 220, range: 0.1, dmg: 0.03 },
  foregrip: { id: 'foregrip', slot: 'under', name: 'Ön Tutamak', icon: '✊', perLevel: '−%8 saçılma, −%8 geri tepme', baseCost: 170, spread: 0.08, recoil: 0.08 },
  laser: { id: 'laser', slot: 'rail', name: 'Lazer Nişangah', icon: '📍', perLevel: '−%5 saçılma, +%2 hasar', baseCost: 160, spread: 0.05, dmg: 0.02 },
  extmag: { id: 'extmag', slot: 'mag', name: 'Uzatılmış Şarjör', icon: '🧱', perLevel: '+%14 şarjör', baseCost: 190, mag: 0.14 },
  stock: { id: 'stock', slot: 'stock', name: 'Taktik Dipçik', icon: '🪵', perLevel: '−%8 şarjör değiştirme süresi', baseCost: 150, reload: 0.08 },
};
export const ATTACHMENT_SLOT_LABEL: Record<AttachmentSlot, string> = { muzzle: 'Namlu', optic: 'Nişangah', under: 'Alt ray', rail: 'Yan ray', mag: 'Şarjör', stock: 'Dipçik' };

/** Which attachments a weapon family takes. */
export function attachmentsFor(w: WeaponDef): AttachmentId[] {
  if (w.melee) return [];
  if (w.grip === 'pistol') return ['suppressor', 'reddot', 'laser', 'extmag'];
  if (w.id === 'shotgun') return ['brake', 'reddot', 'foregrip', 'laser', 'extmag', 'stock'];
  if (w.id === 'lmg') return ['brake', 'reddot', 'foregrip', 'laser', 'extmag'];
  if (w.id === 'sniper') return ['suppressor', 'brake', 'scope', 'laser', 'extmag', 'stock'];
  return ['suppressor', 'brake', 'reddot', 'scope', 'foregrip', 'laser', 'extmag', 'stock'];
}

/** Stored per weapon variant. */
export interface WeaponGear {
  /** base power 0..POWER_MAX */
  power: number;
  /** owned attachment levels */
  levels: Partial<Record<AttachmentId, number>>;
  /** equipped attachment per slot */
  on: Partial<Record<AttachmentSlot, AttachmentId>>;
}
export const emptyGear = (): WeaponGear => ({ power: 0, levels: {}, on: {} });

const tierMul = (w: WeaponDef) => [1, 1, 1.3, 1.7, 2.2][w.tier ?? 1]!;
export function powerCost(w: WeaponDef, level: number): number {
  return level >= POWER_MAX ? Infinity : Math.round(120 * (level + 1) * tierMul(w));
}
export function attachmentCost(w: WeaponDef, id: AttachmentId, level: number): number {
  return level >= ATTACHMENT_MAX ? Infinity : Math.round(ATTACHMENTS[id].baseCost * (level + 1) * (0.7 + 0.3 * tierMul(w)));
}

export function equippedAttachments(g: WeaponGear | undefined, w?: WeaponDef): { id: AttachmentId; level: number }[] {
  if (!g) return [];
  const allowed = w ? attachmentsFor(w) : null;
  const out: { id: AttachmentId; level: number }[] = [];
  for (const id of Object.values(g.on)) {
    const lv = id ? (g.levels[id] ?? 0) : 0;
    if (id && lv > 0 && (!allowed || allowed.includes(id))) out.push({ id, level: lv });
  }
  return out;
}

/** The weapon as this gear makes it (a copy; the catalogue entry stays as it is). */
export function applyGear(w: WeaponDef, g: WeaponGear | undefined): WeaponDef {
  if (!g || w.melee) return w;
  let dmg = 1 + POWER_STEP * Math.max(0, Math.min(POWER_MAX, g.power));
  let range = 1;
  let spread = 1;
  let recoil = 1;
  let mag = 1;
  let reload = 1;
  let rate = 1;
  for (const { id, level } of equippedAttachments(g, w)) {
    const a = ATTACHMENTS[id];
    dmg += (a.dmg ?? 0) * level;
    range += (a.range ?? 0) * level;
    spread *= 1 - Math.min(0.6, (a.spread ?? 0) * level);
    recoil *= 1 - Math.min(0.6, (a.recoil ?? 0) * level);
    mag += (a.mag ?? 0) * level;
    reload *= 1 - Math.min(0.5, (a.reload ?? 0) * level);
    rate += (a.fireRate ?? 0) * level;
  }
  if (dmg === 1 && range === 1 && spread === 1 && recoil === 1 && mag === 1 && reload === 1 && rate === 1) return w;
  return {
    ...w,
    damage: w.damage * dmg,
    range: w.range * range,
    spread: w.spread * spread,
    recoil: w.recoil * recoil,
    magSize: Math.max(1, Math.round(w.magSize * mag)),
    reloadTime: w.reloadTime * reload,
    fireRate: w.fireRate / rate,
  };
}

// ---------------------------------------------------------------------------
// Visuals: simple, sturdy shapes hung off the muzzle point (it follows model swaps)
// ---------------------------------------------------------------------------

let mats: Record<'black' | 'metal' | 'glass' | 'red' | 'polymer', THREE.Material> | null = null;
function m() {
  mats ??= {
    black: new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.42, metalness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5a616a, roughness: 0.3, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a3a5a, roughness: 0.05, metalness: 0.2, emissive: 0x0a2a4a, emissiveIntensity: 0.6 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x3a3d36, roughness: 0.7, metalness: 0.15 }),
  };
  return mats;
}
const cyl = (r: number, len: number, mat: THREE.Material, seg = 14) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  c.rotation.x = Math.PI / 2;
  return c;
};
const box = (x: number, y: number, z: number, mat: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat);

/**
 * Gun silhouette in gun space (origin = grip, +Z = barrel), sliced along the barrel:
 * per slice the highest / lowest / right-most vertex. Attachments sit ON the real mesh
 * instead of guessed offsets (which left scopes, grips and mags floating on some models).
 */
interface GunProfile {
  minZ: number;
  maxZ: number;
  top: (z: number) => number | null;
  bottom: (z: number) => number | null;
  right: (z: number) => number | null;
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
function gunProfile(root: THREE.Object3D, skip: THREE.Object3D | null): GunProfile | null {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const pts: number[] = [];
  root.traverse((o) => {
    if (skip && (o === skip || skip.children.includes(o))) return;
    if (o.name === 'gearAttachments') return;
    let p: THREE.Object3D | null = o;
    while (p && p !== root) {
      if (p.name === 'gearAttachments') return;
      p = p.parent;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    // ince parlama şeritleri / ışık çubukları profil sayılmaz
    if ((mesh.material as THREE.Material & { emissive?: THREE.Color })?.name === 'glow') return;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      pts.push(_v.x, _v.y, _v.z);
    }
  });
  if (pts.length < 9) return null;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 2; i < pts.length; i += 3) {
    minZ = Math.min(minZ, pts[i]!);
    maxZ = Math.max(maxZ, pts[i]!);
  }
  const N = 40;
  const span = Math.max(1e-4, maxZ - minZ);
  const top = new Array<number>(N).fill(-Infinity);
  const bot = new Array<number>(N).fill(Infinity);
  const rgt = new Array<number>(N).fill(-Infinity);
  for (let i = 0; i < pts.length; i += 3) {
    const k = Math.min(N - 1, Math.max(0, Math.floor(((pts[i + 2]! - minZ) / span) * N)));
    top[k] = Math.max(top[k]!, pts[i + 1]!);
    bot[k] = Math.min(bot[k]!, pts[i + 1]!);
    rgt[k] = Math.max(rgt[k]!, pts[i]!);
  }
  const look = (arr: number[], z: number, empty: number) => {
    const k = Math.min(N - 1, Math.max(0, Math.floor(((z - minZ) / span) * N)));
    for (let d = 0; d < N; d++) {
      for (const j of [k - d, k + d]) {
        if (j >= 0 && j < N && arr[j] !== empty) return arr[j]!;
      }
    }
    return null;
  };
  return {
    minZ,
    maxZ,
    top: (z) => look(top, z, -Infinity),
    bottom: (z) => look(bot, z, Infinity),
    right: (z) => look(rgt, z, -Infinity),
  };
}

/**
 * Hang attachment models on a gun. `tip` is the muzzle point (gun-local, origin = grip,
 * +Z = barrel); sizes follow the barrel length, positions follow the gun's real silhouette.
 */
export function decorateGun(tip: THREE.Object3D, list: readonly { id: AttachmentId; level: number }[], family?: string): void {
  const old = tip.getObjectByName('gearAttachments');
  if (old) {
    old.removeFromParent();
    old.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
  if (!list.length) return;
  const L = Math.max(0.15, Math.abs(tip.position.z));
  const y0 = tip.position.y;
  const g = new THREE.Group();
  g.name = 'gearAttachments';
  // children are placed in gun space, then shifted into the tip's frame
  g.position.set(-tip.position.x, -y0, -tip.position.z);
  const k = L / 0.45;
  const M = m();
  // gerçek gövde profili (model yüklüyse); yoksa eski tahmini konumlar
  const prof = tip.parent ? gunProfile(tip.parent, tip) : null;
  const botAt = (z: number, fb: number) => prof?.bottom(z) ?? fb;
  /** en yüksek nokta: nişangah ray üstü (z ± pencere) */
  const railTop = (z: number, fb: number) => {
    if (!prof) return fb;
    let best = -Infinity;
    for (let d = -0.05 * k; d <= 0.05 * k; d += 0.01 * k) best = Math.max(best, prof.top(z + d) ?? -Infinity);
    return Number.isFinite(best) ? best : fb;
  };
  // namlu yarıçapı (ağız ucundaki kesitten) → susturucu / fren namluya oturur, dev blok olmaz
  const muzzleR = (() => {
    if (!prof) return 0.012 * k;
    const t = prof.top(L * 0.96);
    const b = prof.bottom(L * 0.96);
    return t !== null && b !== null ? THREE.MathUtils.clamp((t - b) / 2, 0.006 * k, 0.02 * k) : 0.012 * k;
  })();
  const tubeMag = family === 'shotgun';
  for (const { id, level } of list) {
    const big = 1 + (level - 1) * 0.04;
    switch (id) {
      case 'suppressor': {
        const r = Math.max(0.014 * k, muzzleR * 1.7);
        const len = 0.18 * k * big;
        const s = cyl(r, len, M.black);
        s.position.set(0, y0, L + len / 2 - 0.01 * k);
        const ring = cyl(r * 1.06, 0.012 * k, M.metal);
        ring.position.set(0, y0, L + 0.004 * k);
        g.add(s, ring);
        break;
      }
      case 'brake': {
        const r = Math.max(0.011 * k, muzzleR * 1.35);
        const b = cyl(r, 0.065 * k, M.metal, 8);
        b.position.set(0, y0, L + 0.028 * k);
        // yan delikler: gövdeye gömülü ince yarıklar
        for (const dz of [-0.014, 0.004, 0.022]) {
          const port = box(r * 2.15, r * 0.5, 0.007 * k, M.black);
          port.position.set(0, y0 + r * 0.25, L + (0.028 + dz) * k);
          g.add(port);
        }
        g.add(b);
        break;
      }
      case 'reddot': {
        const zR = L * 0.3;
        const yb = railTop(zR, y0 + 0.033 * k);
        const base = box(0.03 * k, 0.025 * k, 0.05 * k, M.black);
        base.position.set(0, yb + 0.0125 * k, zR);
        const hood = box(0.035 * k, 0.04 * k, 0.012 * k, M.black);
        hood.position.set(0, yb + 0.037 * k, zR + 0.02 * k);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004 * k, 6, 4), M.red);
        dot.position.set(0, yb + 0.037 * k, zR + 0.012 * k);
        g.add(base, hood, dot);
        break;
      }
      case 'scope': {
        const zS = L * 0.3;
        const ys = railTop(zS, y0 + 0.015 * k);
        const mount = box(0.02 * k, 0.03 * k, 0.1 * k, M.metal);
        mount.position.set(0, ys + 0.015 * k, zS);
        const yc = ys + 0.03 * k + 0.02 * k;
        const tube = cyl(0.018 * k, 0.2 * k * big, M.black);
        tube.position.set(0, yc, zS);
        const front = cyl(0.026 * k, 0.04 * k, M.black);
        front.position.set(0, yc, zS + 0.1 * k);
        const lens = cyl(0.022 * k, 0.004 * k, M.glass);
        lens.position.set(0, yc, zS + 0.122 * k);
        g.add(tube, front, lens, mount);
        break;
      }
      case 'foregrip': {
        const zF = L * 0.55;
        const yF = botAt(zF, y0 - 0.04 * k);
        const fg = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * k, 0.016 * k, 0.08 * k, 10), M.polymer);
        fg.position.set(0, yF - 0.04 * k + 0.004 * k, zF);
        g.add(fg);
        break;
      }
      case 'laser': {
        const zL = L * 0.62;
        const xL = (prof?.right(zL) ?? 0.019 * k) + 0.011 * k - 0.002 * k;
        const yL = prof ? ((prof.top(zL) ?? y0) + (prof.bottom(zL) ?? y0)) / 2 : y0 - 0.015 * k;
        const mod = box(0.022 * k, 0.022 * k, 0.06 * k, M.black);
        mod.position.set(xL, yL, zL);
        const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.006 * k, 6, 4), M.red);
        emitter.position.set(xL, yL, zL + 0.032 * k);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0015 * k, 0.0015 * k, 3, 4), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, depthWrite: false }));
        beam.rotation.x = Math.PI / 2;
        beam.position.set(xL, yL, zL + 1.5);
        g.add(mod, emitter, beam);
        break;
      }
      case 'extmag': {
        if (tubeMag) {
          // pompalı: namlu altındaki şarjör tüpüne uzatma + kelepçe
          const yT = botAt(L * 0.8, y0 - 0.03 * k) + 0.014 * k;
          const len = (0.1 + 0.015 * level) * k;
          const t = cyl(0.014 * k, len, M.black);
          t.position.set(0, yT, L * 0.86 + len / 2 - 0.05 * k);
          const clamp = box(0.032 * k, 0.05 * k, 0.012 * k, M.metal);
          clamp.position.set(0, (yT + y0) / 2, L * 0.86 + len - 0.06 * k);
          g.add(t, clamp);
          break;
        }
        // mevcut şarjörün altına uzatma: tabanca → kabzanın altı, diğerleri → gövdenin en derin noktası
        let zM = L * 0.16;
        if (prof) {
          let deep = Infinity;
          for (let z = L * 0.08; z <= L * 0.45; z += L * 0.02) {
            const b = prof.bottom(z);
            if (b !== null && b < deep) {
              deep = b;
              zM = z;
            }
          }
          if (L < 0.3) zM = 0;
          // en derin nokta şarjörün ön ucu olabilir: biraz geriye, şarjör tabanının ortasına
          else zM -= L * 0.02;
        }
        const hM = (0.04 + 0.01 * level) * k;
        const yM = botAt(zM, -0.05 * k);
        const mag = box(0.03 * k, hM, 0.058 * k, M.polymer);
        mag.position.set(0, yM - hM / 2 + 0.018 * k, zM);
        const plate = box(0.034 * k, 0.01 * k, 0.064 * k, M.metal);
        plate.position.set(0, yM - hM + 0.016 * k, zM);
        g.add(mag, plate);
        break;
      }
      case 'stock': {
        // gövdenin arka ucuna bitişik: kendi dipçiği olan silahta yalnız dipçik pedi
        const rear = prof?.minZ ?? -0.09 * k;
        const yRear = prof ? ((prof.top(rear + 0.01 * k) ?? 0) + (prof.bottom(rear + 0.01 * k) ?? 0)) / 2 : -0.01 * k;
        const hasStock = rear < -0.14 * k;
        if (hasStock) {
          // kendi dipçiği var: dipçik ucuna gömülü kauçuk ped (boşluk yok)
          const t = prof?.top(rear + 0.005 * k) ?? yRear + 0.04 * k;
          const b = prof?.bottom(rear + 0.005 * k) ?? yRear - 0.04 * k;
          const h = Math.max(0.05 * k, t - b);
          const pad = box(0.036 * k, h * 1.04, 0.022 * k, M.black);
          pad.position.set(0, (t + b) / 2, rear - 0.007 * k);
          g.add(pad);
        } else {
          const stLen = 0.16 * k;
          const st = box(0.03 * k, 0.07 * k, stLen, M.polymer);
          st.position.set(0, yRear, rear - stLen / 2 + 0.012 * k);
          const pad = box(0.034 * k, 0.08 * k, 0.02 * k, M.black);
          pad.position.set(0, yRear, rear - stLen + 0.004 * k);
          g.add(st, pad);
        }
        break;
      }
    }
  }
  for (const o of g.children) o.castShadow = true;
  tip.add(g);
}
