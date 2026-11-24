/**
 * Visual identity for named zombie types (zombieTypes.ts). Before this, a type was a
 * plain zombie with a tinted ground ring; now every type wears what it does:
 *   - glowing eyes in the type colour (reads at once in the dark maps)
 *   - trait gear: armour plates, ice shards, ember pustules, toxic sacs, horns,
 *     back spikes, egg sacs, halo (healers), orbiting wisps / sparks (blink, nova)…
 * Head / chest / back parts follow the rig's bones when the skinned model is shown
 * (the avatars are pooled, so nothing is parented into them); otherwise they sit at
 * a fixed body height on the zombie root.
 */
import * as THREE from 'three';
import type { ZombieVisual } from './characters';
import type { ZombieTypeDef } from './zombieTypes';

interface Deco {
  root: THREE.Group;
  head: THREE.Group;
  chest: THREE.Group;
  back: THREE.Group;
  orbit: THREE.Group | null;
  halo: THREE.Object3D | null;
}

const geo = {
  eye: new THREE.SphereGeometry(0.045, 8, 6),
  plate: new THREE.BoxGeometry(0.34, 0.08, 0.3),
  chestPlate: new THREE.BoxGeometry(0.44, 0.36, 0.08),
  helmet: new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  shard: new THREE.ConeGeometry(0.07, 0.42, 5),
  spike: new THREE.ConeGeometry(0.045, 0.28, 5),
  horn: new THREE.ConeGeometry(0.05, 0.34, 6),
  pustule: new THREE.SphereGeometry(0.07, 8, 6),
  sac: new THREE.SphereGeometry(0.16, 10, 8),
  halo: new THREE.TorusGeometry(0.24, 0.025, 6, 28),
  wisp: new THREE.SphereGeometry(0.06, 6, 4),
  crown: new THREE.ConeGeometry(0.05, 0.22, 4),
};

const matCache = new Map<string, THREE.Material>();
const mat = (key: string, make: () => THREE.Material): THREE.Material => {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
};
const glowMat = (color: number) => mat(`g${color}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
const emissive = (color: number, k = 1.6) => mat(`e${color}${k}`, () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: color, emissiveIntensity: k, roughness: 0.5 }));
const metal = (tint: number) => mat(`m${tint}`, () => new THREE.MeshStandardMaterial({ color: tint, metalness: 0.8, roughness: 0.35 }));
const ice = () => mat('ice', () => new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x4ab8ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.1 }));
const bone = () => mat('bone', () => new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.6 }));
const flesh = (color: number) => mat(`f${color}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.45, transparent: true, opacity: 0.92 }));

const add = (g: THREE.Group, g2: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g2, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  g.add(o);
  return o;
};

/** Build the gear for a type and hang it on the zombie. */
export function applyTypeDeco(z: ZombieVisual, def: ZombieTypeDef): void {
  const old = z.root.getObjectByName('typeDeco');
  if (old) old.removeFromParent();
  const t = def.traits;
  const root = new THREE.Group();
  root.name = 'typeDeco';
  const head = new THREE.Group();
  const chest = new THREE.Group();
  const back = new THREE.Group();
  root.add(head, chest, back);
  // default heights (procedural proxy / before the rig attaches); bones override them
  head.position.set(0, 1.72, 0.02);
  chest.position.set(0, 1.35, 0.05);
  back.position.set(0, 1.35, -0.12);
  const c = def.color;

  // eyes: every named type
  for (const sx of [-0.06, 0.06]) add(head, geo.eye, glowMat(c), sx, 0.09, 0.12);

  if ((t.armor ?? 0) >= 0.15 || t.frontShield || t.aegis) {
    const m = metal(t.aegis ? 0x9aa8c0 : 0x6a7078);
    add(chest, geo.plate, m, -0.24, 0.18, 0, 0, 0, 0.35);
    add(chest, geo.plate, m, 0.24, 0.18, 0, 0, 0, -0.35);
    add(chest, geo.chestPlate, m, 0, -0.02, 0.1);
    add(head, geo.helmet, m, 0, 0.04, 0);
  }
  if (t.frostAura) {
    for (let i = 0; i < 6; i++) add(back, geo.shard, ice(), (i - 2.5) * 0.08, 0.1 + (i % 2) * 0.12, -0.02, -0.5, 0, (i - 2.5) * 0.22);
    add(chest, geo.shard, ice(), -0.26, 0.24, 0, 0, 0, 0.6);
    add(chest, geo.shard, ice(), 0.26, 0.24, 0, 0, 0, -0.6);
  }
  if (t.fireTrail || t.blast || t.meteor || t.thrower?.fire) {
    for (let i = 0; i < 7; i++) add(i < 4 ? back : chest, geo.pustule, emissive(0xff6a1a, 2.4), (Math.random() - 0.5) * 0.36, (Math.random() - 0.5) * 0.4, i < 4 ? -0.04 : 0.1);
  }
  if (t.toxicTrail || t.volley || t.drain) {
    const m = flesh(t.drain ? 0x9a1030 : 0x84cc16);
    add(back, geo.sac, m, -0.1, 0.05, -0.08);
    add(back, geo.sac, m, 0.12, -0.08, -0.06).scale.setScalar(0.75);
    for (let i = 0; i < 4; i++) add(chest, geo.pustule, emissive(t.drain ? 0xff2a4a : 0x9cff2e, 1.8), (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.1);
  }
  if (t.summon || t.split || t.mitosis) {
    const m = flesh(t.mitosis ? 0x70d0a0 : 0xd9b040);
    for (let i = 0; i < 5; i++) add(back, geo.sac, m, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.36, -0.1).scale.setScalar(0.45 + Math.random() * 0.4);
  }
  if (t.charge || t.quake) {
    add(head, geo.horn, bone(), -0.13, 0.12, 0.04, -0.4, 0, 0.7);
    add(head, geo.horn, bone(), 0.13, 0.12, 0.04, -0.4, 0, -0.7);
  }
  if (t.leap || t.enrage || t.grow) {
    const m = t.grow ? flesh(0x9a6aaa) : bone();
    for (let i = 0; i < 5; i++) add(back, geo.spike, m, 0, 0.25 - i * 0.12, -0.04, -1.1, 0, 0);
  }
  if (t.web) {
    for (let i = 0; i < 4; i++) add(back, geo.spike, bone(), (i < 2 ? -1 : 1) * 0.18, 0.05 - (i % 2) * 0.12, -0.02, -0.6, 0, (i < 2 ? 1 : -1) * 1.1).scale.set(1, 2, 1);
  }
  if (t.screech || t.warcry) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(head, geo.crown, emissive(c, 1.2), Math.cos(a) * 0.15, 0.2, Math.sin(a) * 0.15);
    }
  }
  if (t.burrow) {
    const m = mat('dirt', () => new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }));
    for (let i = 0; i < 5; i++) add(back, geo.pustule, m, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, -0.05).scale.setScalar(1.6);
  }
  if (t.mines) {
    for (const sx of [-0.14, 0.14]) {
      const mm = add(back, new THREE.CylinderGeometry(0.1, 0.12, 0.06, 10), metal(0x2a2c26), sx, -0.12, -0.08, Math.PI / 2, 0, 0);
      add(back, geo.wisp, glowMat(0xff2020), sx, -0.12, -0.13).scale.setScalar(0.6);
      mm.userData.ownGeo = true;
    }
  }
  if (t.thrower && !t.thrower.fire) {
    const rock = mat('rock', () => new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.95 }));
    add(back, new THREE.DodecahedronGeometry(0.2, 0), rock, 0.05, 0.05, -0.12).userData.ownGeo = true;
  }

  let halo: THREE.Object3D | null = null;
  if (t.healer || t.regen) {
    halo = add(head, geo.halo, glowMat(t.healer ? 0x7cffb2 : 0x5ad46a), 0, 0.34, 0, Math.PI / 2, 0, 0);
  }
  if (t.pull) {
    halo = add(head, geo.halo, glowMat(0x5a7aff), 0, 0.36, 0, Math.PI / 2, 0, 0);
    halo.scale.setScalar(1.3);
  }

  let orbit: THREE.Group | null = null;
  if (t.blink || t.phase || t.nova || t.bubble) {
    orbit = new THREE.Group();
    orbit.position.y = 1.2;
    const n = t.nova ? 5 : 3;
    const col = t.nova ? 0xd8ecff : c;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      add(orbit, geo.wisp, glowMat(col), Math.cos(a) * 0.65, Math.sin(a * 2) * 0.25, Math.sin(a) * 0.65);
    }
    root.add(orbit);
  }

  // bosses: a crown of the type colour, always
  if (def.tier === 'boss') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add(head, geo.crown, emissive(c, 1.8), Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.17).scale.setScalar(1.5);
    }
  }

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
  });
  z.root.add(root);
  z.root.userData.typeDeco = { root, head, chest, back, orbit, halo } satisfies Deco;
}

const _p = new THREE.Vector3();

type RigLike = { humanoid?: { getRawBoneNode?: (n: string) => THREE.Object3D | null } };

/** Per frame: follow the bones (when the skinned model is visible) and animate wisps / halo. */
export function updateTypeDeco(z: ZombieVisual, t: number): void {
  const d = z.root.userData.typeDeco as Deco | undefined;
  if (!d) return;
  if (d.orbit) d.orbit.rotation.y = t * 2.2 + z.animPhase;
  if (d.halo) d.halo.rotation.z = t * 1.5;
  const vrm = (z as ZombieVisual & { vrm?: { root: THREE.Object3D; vrm: RigLike } }).vrm;
  if (!vrm || !vrm.root.visible) return;
  const hum = vrm.vrm.humanoid;
  if (!hum?.getRawBoneNode) return;
  z.root.updateMatrixWorld();
  // positions only: the Biped bones have arbitrary local axes, the gear keeps the zombie's facing
  const follow = (g: THREE.Group, bone: string, alt: string) => {
    const b = hum.getRawBoneNode!(bone) ?? hum.getRawBoneNode!(alt);
    if (!b) return;
    b.getWorldPosition(_p);
    z.root.worldToLocal(_p);
    g.position.copy(_p);
  };
  follow(d.head, 'head', 'neck');
  follow(d.chest, 'upperChest', 'chest');
  // back gear rides the chest bone, pushed behind it
  d.back.position.copy(d.chest.position);
  d.back.position.z -= 0.16;
}
