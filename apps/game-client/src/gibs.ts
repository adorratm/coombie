/**
 * Zombie gore on heavy kills: a head and limb chunks fly off, bounce, leave blood where
 * they land and sink away; gear (riot shields, helmets) drops and tumbles. Cheap simple
 * physics, capped so a big explosion can't flood the scene.
 */
import * as THREE from 'three';

interface Gib {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  rest: boolean;
  /** size for the blood mark on first landing (0 = no mark) */
  mark: number;
  owned: boolean;
}

const MAX_GIBS = 70;
const geo = {
  head: new THREE.SphereGeometry(0.15, 10, 8),
  limb: new THREE.CapsuleGeometry(0.06, 0.38, 3, 6),
  chunk: new THREE.DodecahedronGeometry(0.08, 0),
  bone: new THREE.CylinderGeometry(0.025, 0.025, 0.2, 5),
};
const matCache = new Map<number, THREE.MeshStandardMaterial>();
const fleshMat = (c: number) => {
  let m = matCache.get(c);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
    matCache.set(c, m);
  }
  return m;
};
const blood = new THREE.MeshStandardMaterial({ color: 0x5a0808, roughness: 0.35, metalness: 0.1 });
const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.6 });

export class Gibs {
  private readonly list: Gib[] = [];
  constructor(
    private readonly scene: THREE.Scene,
    private readonly onMark: (x: number, z: number, scale: number) => void,
  ) {}

  private push(obj: THREE.Object3D, vel: THREE.Vector3, mark: number, owned: boolean, life = 7): void {
    if (this.list.length >= MAX_GIBS) {
      const old = this.list.shift()!;
      old.obj.removeFromParent();
    }
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.scene.add(obj);
    this.list.push({ obj, vel, spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), life, rest: false, mark, owned });
  }

  /**
   * Burst at a dead zombie. `dir` = the killing blow's direction (chunks fly with it),
   * `head` = the head comes off, `scale` = zombie size.
   */
  burst(at: THREE.Vector3, dir: THREE.Vector3, scale: number, skin: number, head: boolean, power = 1): void {
    const d = dir.lengthSq() > 0.01 ? dir.clone().setY(0).normalize() : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const fling = (up: number, speed: number) =>
      d
        .clone()
        .multiplyScalar(speed * (0.6 + Math.random() * 0.7) * power)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3, up * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 3));
    if (head) {
      const h = new THREE.Group();
      h.add(new THREE.Mesh(geo.head, fleshMat(skin)));
      const stump = new THREE.Mesh(geo.chunk, blood);
      stump.position.y = -0.13;
      h.add(stump);
      h.scale.setScalar(scale);
      h.position.copy(at).setY(1.7 * scale);
      this.push(h, fling(7, 5), 0.8 * scale, false);
    }
    const limbs = 1 + Math.floor(Math.random() * 2 * power);
    for (let i = 0; i < limbs; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo.limb, fleshMat(skin)));
      const b = new THREE.Mesh(geo.bone, boneMat);
      b.position.y = 0.26;
      const end = new THREE.Mesh(geo.chunk, blood);
      end.position.y = 0.24;
      g.add(b, end);
      g.scale.setScalar(scale);
      g.position.copy(at).setY((1 + Math.random() * 0.5) * scale);
      this.push(g, fling(5, 4), 0.6 * scale, false);
    }
    const chunks = 3 + Math.floor(Math.random() * 4 * power);
    for (let i = 0; i < chunks; i++) {
      const m = new THREE.Mesh(geo.chunk, Math.random() < 0.5 ? blood : fleshMat(skin));
      m.scale.setScalar(scale * (0.7 + Math.random() * 0.8));
      m.position.copy(at).setY((0.8 + Math.random() * 0.8) * scale);
      this.push(m, fling(6, 6), Math.random() < 0.4 ? 0.35 : 0, false, 4);
    }
  }

  /** Drop a piece of gear that was on the zombie (detached and tumbled). */
  drop(obj: THREE.Object3D, at: THREE.Vector3, dir: THREE.Vector3): void {
    obj.updateMatrixWorld(true);
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    obj.matrixWorld.decompose(wp, wq, ws);
    obj.removeFromParent();
    obj.position.copy(wp);
    obj.quaternion.copy(wq);
    obj.scale.copy(ws);
    const v = dir.clone().setY(0).normalize().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(0, 3 + Math.random() * 2, 0));
    if (!Number.isFinite(v.x)) v.set(0, 4, 0);
    void at;
    this.push(obj, v, 0, true, 9);
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i]!;
      g.life -= dt;
      if (g.life <= 0) {
        g.obj.removeFromParent();
        this.list.splice(i, 1);
        continue;
      }
      if (g.life < 1.2) g.obj.position.y -= dt * 0.25; // sink away
      if (g.rest) continue;
      g.vel.y -= 18 * dt;
      g.obj.position.addScaledVector(g.vel, dt);
      g.obj.rotation.x += g.spin.x * dt;
      g.obj.rotation.y += g.spin.y * dt;
      g.obj.rotation.z += g.spin.z * dt;
      if (g.obj.position.y <= 0.06) {
        g.obj.position.y = 0.06;
        if (g.mark > 0) {
          this.onMark(g.obj.position.x, g.obj.position.z, g.mark);
          g.mark = 0;
        }
        if (Math.abs(g.vel.y) < 1.5) {
          g.rest = true;
          continue;
        }
        g.vel.y *= -0.28;
        g.vel.x *= 0.55;
        g.vel.z *= 0.55;
        g.spin.multiplyScalar(0.5);
      }
    }
  }

  dispose(): void {
    for (const g of this.list) g.obj.removeFromParent();
    this.list.length = 0;
  }
}
