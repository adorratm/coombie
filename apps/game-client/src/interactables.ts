/**
 * Things in the map you can shoot: explosive barrels / gas tanks (chain reactions) and
 * wooden barricades (cover that breaks). Positions come from the map builder, so every
 * co-op client has the same list; whoever sets one off tells the room by index (`boom`)
 * and the others only play the visuals.
 */
import * as THREE from 'three';
import type { Aabb } from './collision';

export type ExplosiveKind = 'barrel' | 'gas';

export interface InteractSpot {
  x: number;
  z: number;
  rot: number;
  kind: ExplosiveKind | 'barricade';
}

interface Thing {
  i: number;
  spot: InteractSpot;
  hp: number;
  alive: boolean;
  mesh: THREE.Object3D;
  collider: Aabb | null;
  /** fuse: set when it caught fire, blows at this time */
  fuseAt: number;
}

export interface InteractHooks {
  /** an explosive went off at `at`: radius r, `local` = set off on this machine (deal damage) */
  explode: (at: THREE.Vector3, r: number, kind: ExplosiveKind, local: boolean) => void;
  /** a barricade broke */
  splinter: (at: THREE.Vector3) => void;
  /** tell the room (local triggers only) */
  announce: (index: number) => void;
}

const R: Record<ExplosiveKind, number> = { barrel: 4.6, gas: 6.2 };
const HP: Record<InteractSpot['kind'], number> = { barrel: 3, gas: 5, barricade: 26 };

let shared: {
  barrelGeo: THREE.CylinderGeometry;
  bandGeo: THREE.CylinderGeometry;
  gasGeo: THREE.CapsuleGeometry;
  capGeo: THREE.CylinderGeometry;
  plankGeo: THREE.BoxGeometry;
  postGeo: THREE.BoxGeometry;
  red: THREE.Material;
  band: THREE.Material;
  gas: THREE.Material;
  cap: THREE.Material;
  wood: THREE.Material;
} | null = null;
function mats() {
  shared ??= {
    barrelGeo: new THREE.CylinderGeometry(0.42, 0.42, 1.15, 14),
    bandGeo: new THREE.CylinderGeometry(0.435, 0.435, 0.16, 14),
    gasGeo: new THREE.CapsuleGeometry(0.34, 0.9, 4, 12),
    capGeo: new THREE.CylinderGeometry(0.12, 0.14, 0.2, 8),
    plankGeo: new THREE.BoxGeometry(3.2, 0.26, 0.09),
    postGeo: new THREE.BoxGeometry(0.16, 1.5, 0.16),
    red: new THREE.MeshStandardMaterial({ color: 0xb3201a, roughness: 0.45, metalness: 0.35 }),
    band: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xffc020, emissiveIntensity: 0.55, roughness: 0.5 }),
    gas: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.35, metalness: 0.4 }),
    cap: new THREE.MeshStandardMaterial({ color: 0xd02020, roughness: 0.4, metalness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }),
  };
  return shared;
}

function buildMesh(s: InteractSpot): THREE.Object3D {
  const m = mats();
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  g.rotation.y = s.rot;
  if (s.kind === 'barrel') {
    const body = new THREE.Mesh(m.barrelGeo, m.red);
    body.position.y = 0.58;
    const b1 = new THREE.Mesh(m.bandGeo, m.band);
    b1.position.y = 0.82;
    const b2 = new THREE.Mesh(m.bandGeo, m.band);
    b2.position.y = 0.34;
    g.add(body, b1, b2);
  } else if (s.kind === 'gas') {
    const body = new THREE.Mesh(m.gasGeo, m.gas);
    body.position.y = 0.8;
    const cap = new THREE.Mesh(m.capGeo, m.cap);
    cap.position.y = 1.55;
    const band = new THREE.Mesh(m.bandGeo, m.band);
    band.scale.set(0.82, 1, 0.82);
    band.position.y = 0.8;
    g.add(body, cap, band);
  } else {
    for (const sx of [-1.4, 1.4]) {
      const post = new THREE.Mesh(m.postGeo, m.wood);
      post.position.set(sx, 0.75, 0);
      g.add(post);
    }
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(m.plankGeo, m.wood);
      p.position.set(0, 0.3 + k * 0.33, 0.06);
      p.rotation.z = (k % 2 ? 1 : -1) * 0.06;
      g.add(p);
    }
    const brace = new THREE.Mesh(m.plankGeo, m.wood);
    brace.position.set(0, 0.75, 0.12);
    brace.rotation.z = 0.42;
    g.add(brace);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    }
  });
  return g;
}

export class Interactables {
  private readonly things: Thing[] = [];
  private readonly group = new THREE.Group();
  constructor(
    scene: THREE.Scene,
    spots: readonly InteractSpot[],
    colliders: Aabb[],
    private readonly hooks: InteractHooks,
  ) {
    this.group.name = 'interactables';
    scene.add(this.group);
    spots.forEach((spot, i) => {
      const mesh = buildMesh(spot);
      this.group.add(mesh);
      let collider: Aabb | null = null;
      if (spot.kind === 'barricade') {
        const c = Math.abs(Math.cos(spot.rot));
        const hw = c > 0.5 ? 1.6 : 0.2;
        const hd = c > 0.5 ? 0.2 : 1.6;
        collider = { minX: spot.x - hw, maxX: spot.x + hw, minZ: spot.z - hd, maxZ: spot.z + hd } as Aabb;
      } else {
        collider = { minX: spot.x - 0.45, maxX: spot.x + 0.45, minZ: spot.z - 0.45, maxZ: spot.z + 0.45 } as Aabb;
      }
      colliders.push(collider);
      this.things.push({ i, spot, hp: HP[spot.kind], alive: true, mesh, collider, fuseAt: 0 });
    });
  }

  private find(x: number, z: number, y: number): Thing | null {
    for (const t of this.things) {
      if (!t.alive) continue;
      const dx = x - t.spot.x;
      const dz = z - t.spot.z;
      if (t.spot.kind === 'barricade') {
        // rotate into the barricade's frame
        const c = Math.cos(-t.spot.rot);
        const s = Math.sin(-t.spot.rot);
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) < 1.6 && Math.abs(lz) < 0.35 && y < 1.6) return t;
      } else if (dx * dx + dz * dz < 0.5 * 0.5 && y < 1.7) return t;
    }
    return null;
  }

  /** A bullet at this point: true if it struck something (the bullet stops). */
  hitBullet(p: THREE.Vector3, damage: number, now: number): boolean {
    const t = this.find(p.x, p.z, p.y);
    if (!t) return false;
    this.damage(t, Math.max(1, damage * (t.spot.kind === 'barricade' ? 1 : 0.6)), now, true);
    return true;
  }

  /** Blast wave: hurts barricades, sets explosives inside the radius on a short fuse. */
  blast(at: THREE.Vector3, r: number, now: number): void {
    for (const t of this.things) {
      if (!t.alive) continue;
      const d = Math.hypot(t.spot.x - at.x, t.spot.z - at.z);
      if (d > r + 0.5) continue;
      if (t.spot.kind === 'barricade') this.damage(t, 40 * (1 - d / (r + 0.5)) + 8, now, true);
      else if (!t.fuseAt) t.fuseAt = now + 0.12 + d * 0.04;
    }
  }

  private damage(t: Thing, amount: number, now: number, local: boolean): void {
    t.hp -= amount;
    if (t.hp > 0) {
      // shot explosives wobble; under half they catch fire and blow on a fuse
      t.mesh.rotation.z = (Math.random() - 0.5) * 0.08;
      if (t.spot.kind !== 'barricade' && t.hp < HP[t.spot.kind] * 0.5 && !t.fuseAt) t.fuseAt = now + 0.9;
      return;
    }
    this.destroy(t, local, now);
  }

  private destroy(t: Thing, local: boolean, now: number): void {
    if (!t.alive) return;
    t.alive = false;
    t.mesh.removeFromParent();
    if (t.collider) {
      // collapse the box in place (the collider grid index keys on the list length)
      t.collider.minX = t.collider.maxX = 1e6;
      t.collider.minZ = t.collider.maxZ = 1e6;
    }
    const at = new THREE.Vector3(t.spot.x, 0.6, t.spot.z);
    if (local) this.hooks.announce(t.i);
    if (t.spot.kind === 'barricade') {
      this.hooks.splinter(at);
      return;
    }
    const kind = t.spot.kind;
    this.hooks.explode(at, R[kind], kind, local);
    if (local) this.blast(at, R[kind], now);
  }

  /** Remote trigger (co-op): visuals only. */
  remote(index: number, now: number): void {
    const t = this.things[index];
    if (t?.alive) this.destroy(t, false, now);
  }

  /** Fuses. */
  update(now: number): void {
    for (const t of this.things) {
      if (!t.alive || !t.fuseAt) continue;
      if (now >= t.fuseAt) this.destroy(t, true, now);
      else if (Math.random() < 0.3) t.mesh.position.y = Math.random() * 0.03;
    }
  }

  /** Burning explosives (for fire FX) */
  burning(): THREE.Vector3[] {
    return this.things.filter((t) => t.alive && t.fuseAt).map((t) => new THREE.Vector3(t.spot.x, 1.2, t.spot.z));
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}

/** Deterministic pseudo-random from a position (keeps the map builder's rng untouched). */
export function spotHash(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
