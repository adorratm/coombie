import * as THREE from 'three';
import type { Weather } from './mapDefs';

/** Camera-following precipitation / airborne particles (one Points draw call). */
export class WeatherFx {
  private points: THREE.Points | null = null;
  private pos: Float32Array | null = null;
  private vel: Float32Array | null = null;
  private readonly n: number;
  private readonly kind: Weather;
  private readonly box = 46;
  private readonly height = 26;
  private t = 0;

  constructor(scene: THREE.Scene, kind: Weather, coarse = false) {
    this.kind = kind;
    this.n = kind === 'none' ? 0 : Math.round((kind === 'rain' ? 2600 : kind === 'snow' ? 2200 : 900) * (coarse ? 0.45 : 1));
    if (!this.n) return;
    const pos = new Float32Array(this.n * 3);
    const vel = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.box * 2;
      pos[i * 3 + 1] = Math.random() * this.height;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.box * 2;
      if (kind === 'rain') vel.set([1.5, -26 - Math.random() * 6, 0.8], i * 3);
      else if (kind === 'snow') vel.set([0.6 + Math.random(), -1.4 - Math.random() * 1.2, 0.3], i * 3);
      else if (kind === 'ash') vel.set([0.8, -0.6 - Math.random() * 0.6, 0.4], i * 3);
      else vel.set([5 + Math.random() * 3, -0.2 + Math.random() * 0.4, 1.2], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    if (kind === 'rain') {
      const gr = g.createLinearGradient(16, 0, 16, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(255,255,255,0.9)');
      g.fillStyle = gr;
      g.fillRect(15, 0, 2, 32);
    } else {
      const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 32, 32);
    }
    const tex = new THREE.CanvasTexture(c);
    const color = kind === 'rain' ? 0x9fb4c8 : kind === 'snow' ? 0xffffff : kind === 'ash' ? 0x8a7a70 : 0xc8b08a;
    const size = kind === 'rain' ? 0.5 : kind === 'snow' ? 0.32 : kind === 'ash' ? 0.22 : 0.18;
    const mat = new THREE.PointsMaterial({ map: tex, color, size, sizeAttenuation: true, transparent: true, opacity: kind === 'dust' ? 0.45 : 0.75, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 14;
    scene.add(pts);
    this.points = pts;
    this.pos = pos;
    this.vel = vel;
  }

  update(dt: number, center: THREE.Vector3): void {
    if (!this.points || !this.pos || !this.vel) return;
    this.t += dt;
    const p = this.pos;
    const v = this.vel;
    const B = this.box;
    const sway = this.kind === 'snow' || this.kind === 'ash' ? Math.sin(this.t * 0.8) * 0.8 : 0;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      p[k] += (v[k]! + sway) * dt;
      p[k + 1] += v[k + 1]! * dt;
      p[k + 2] += v[k + 2]! * dt;
      // wrap around the camera target
      const dx = p[k]! - center.x;
      const dz = p[k + 2]! - center.z;
      if (dx > B) p[k] -= B * 2;
      else if (dx < -B) p[k] += B * 2;
      if (dz > B) p[k + 2] -= B * 2;
      else if (dz < -B) p[k + 2] += B * 2;
      if (p[k + 1]! < 0) p[k + 1] += this.height;
      else if (p[k + 1]! > this.height) p[k + 1] -= this.height;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    if (!this.points) return;
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.PointsMaterial).map?.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
