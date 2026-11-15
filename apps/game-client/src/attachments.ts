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
    black: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.35, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a3a5a, roughness: 0.05, metalness: 0.2, emissive: 0x0a2a4a, emissiveIntensity: 0.6 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x2a2c26, roughness: 0.8, metalness: 0.1 }),
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
 * Hang attachment models on a gun. `tip` is the muzzle point (gun-local, origin = grip,
 * +Z = barrel); everything is sized off the barrel length so pistols and rifles both fit.
 */
export function decorateGun(tip: THREE.Object3D, list: readonly { id: AttachmentId; level: number }[]): void {
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
  for (const { id, level } of list) {
    const big = 1 + (level - 1) * 0.04;
    switch (id) {
      case 'suppressor': {
        const s = cyl(0.026 * k, 0.2 * k * big, M.black);
        s.position.set(0, y0, L + 0.1 * k);
        g.add(s);
        break;
      }
      case 'brake': {
        const b = cyl(0.024 * k, 0.07 * k, M.metal, 8);
        b.position.set(0, y0, L + 0.035 * k);
        const port = box(0.06 * k, 0.012 * k, 0.03 * k, M.black);
        port.position.set(0, y0 + 0.02 * k, L + 0.04 * k);
        g.add(b, port);
        break;
      }
      case 'reddot': {
        const base = box(0.03 * k, 0.025 * k, 0.05 * k, M.black);
        base.position.set(0, y0 + 0.045 * k, L * 0.3);
        const hood = box(0.035 * k, 0.04 * k, 0.012 * k, M.black);
        hood.position.set(0, y0 + 0.07 * k, L * 0.3 + 0.02 * k);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004 * k, 6, 4), M.red);
        dot.position.set(0, y0 + 0.07 * k, L * 0.3 + 0.012 * k);
        g.add(base, hood, dot);
        break;
      }
      case 'scope': {
        const tube = cyl(0.018 * k, 0.2 * k * big, M.black);
        tube.position.set(0, y0 + 0.065 * k, L * 0.3);
        const front = cyl(0.026 * k, 0.04 * k, M.black);
        front.position.set(0, y0 + 0.065 * k, L * 0.3 + 0.1 * k);
        const lens = cyl(0.022 * k, 0.004 * k, M.glass);
        lens.position.set(0, y0 + 0.065 * k, L * 0.3 + 0.122 * k);
        const mount = box(0.02 * k, 0.04 * k, 0.1 * k, M.metal);
        mount.position.set(0, y0 + 0.035 * k, L * 0.3);
        g.add(tube, front, lens, mount);
        break;
      }
      case 'foregrip': {
        const fg = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * k, 0.016 * k, 0.08 * k, 10), M.polymer);
        fg.position.set(0, y0 - 0.08 * k, L * 0.55);
        g.add(fg);
        break;
      }
      case 'laser': {
        const mod = box(0.022 * k, 0.022 * k, 0.06 * k, M.black);
        mod.position.set(0.03 * k, y0 - 0.015 * k, L * 0.62);
        const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.006 * k, 6, 4), M.red);
        emitter.position.set(0.03 * k, y0 - 0.015 * k, L * 0.62 + 0.032 * k);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0015 * k, 0.0015 * k, 3, 4), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, depthWrite: false }));
        beam.rotation.x = Math.PI / 2;
        beam.position.set(0.03 * k, y0 - 0.015 * k, L * 0.62 + 1.5);
        g.add(mod, emitter, beam);
        break;
      }
      case 'extmag': {
        const mag = box(0.03 * k, (0.13 + 0.02 * level) * k, 0.06 * k, M.polymer);
        mag.position.set(0, -0.11 * k - 0.01 * level * k, L * 0.16);
        mag.rotation.x = 0.18;
        g.add(mag);
        break;
      }
      case 'stock': {
        const st = box(0.03 * k, 0.07 * k, 0.16 * k, M.polymer);
        st.position.set(0, -0.01 * k, -0.17 * k);
        const pad = box(0.034 * k, 0.08 * k, 0.02 * k, M.black);
        pad.position.set(0, -0.01 * k, -0.25 * k);
        g.add(st, pad);
        break;
      }
    }
  }
  for (const o of g.children) o.castShadow = true;
  tip.add(g);
}
