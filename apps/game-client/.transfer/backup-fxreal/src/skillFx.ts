import * as THREE from 'three';

/**
 * GPU-instanced billboard particles + a few one-off effect meshes (bolts, shock
 * rings, beams) shared by the run skills and hero abilities.
 *
 * Each layer is one draw call: an InstancedBufferGeometry quad with per-particle
 * position / size / rotation / colour+alpha attributes, billboarded in the vertex
 * shader. Fire, sparks and flashes are additive; smoke is alpha-blended.
 */

type LayerId = 'fire' | 'smoke' | 'spark' | 'flash' | 'elec' | 'frost' | 'toxic';

function radialTexture(kind: 'soft' | 'smoke' | 'spark' | 'flame'): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  if (kind === 'spark') {
    const grd = g.createLinearGradient(0, s / 2, s, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, s / 2 - 3, s, 6);
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.2, 'rgba(255,255,255,0.25)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  } else {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (kind === 'soft') {
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      r.addColorStop(0, 'rgba(255,255,255,0.95)');
      r.addColorStop(0.6, 'rgba(255,255,255,0.4)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
    }
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
    if (kind === 'smoke' || kind === 'flame') {
      // break the disc into a puffy / licking shape
      const img = g.getImageData(0, 0, s, s);
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          const n =
            Math.sin(x * 0.31 + Math.sin(y * 0.17) * 2.1) * 0.5 +
            Math.sin(y * 0.27 + Math.cos(x * 0.21) * 1.7) * 0.5 +
            Math.sin((x + y) * 0.5) * 0.25;
          const k = THREE.MathUtils.clamp(0.72 + n * 0.32, 0, 1);
          img.data[(y * s + x) * 4 + 3] *= k;
        }
      g.putImageData(img, 0, 0);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec2 aSizeRot;
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = uv;
  vColor = aColor;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(aSizeRot.y), s = sin(aSizeRot.y);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSizeRot.x;
  vec3 world = aPos + right * p.x + up * p.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
}`;

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  rot: number;
  spin: number;
  r: number;
  g: number;
  b: number;
  a: number;
  grav: number;
  drag: number;
}

class Layer {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly pos: Float32Array;
  private readonly sr: Float32Array;
  private readonly col: Float32Array;
  private readonly ps: P[] = [];
  private readonly free: P[] = [];

  constructor(scene: THREE.Scene, tex: THREE.Texture, additive: boolean, private readonly cap: number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.pos = new Float32Array(cap * 3);
    this.sr = new Float32Array(cap * 2);
    this.col = new Float32Array(cap * 4);
    this.geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSizeRot', new THREE.InstancedBufferAttribute(this.sr, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 11;
    scene.add(this.mesh);
  }

  emit(p: Omit<P, 'max'>): void {
    if (this.ps.length >= this.cap) return;
    const q = this.free.pop() ?? ({} as P);
    Object.assign(q, p);
    q.max = p.life;
    this.ps.push(q);
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.ps[i] = this.ps[this.ps.length - 1]!;
        this.ps.pop();
        this.free.push(p);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.25;
      }
      p.rot += p.spin * dt;
    }
    for (const p of this.ps) {
      const t = 1 - p.life / p.max;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.sr[n * 2] = p.s0 + (p.s1 - p.s0) * t;
      this.sr[n * 2 + 1] = p.rot;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.col[n * 4] = p.r;
      this.col[n * 4 + 1] = p.g;
      this.col[n * 4 + 2] = p.b;
      this.col[n * 4 + 3] = p.a * fade;
      n++;
    }
    this.geo.instanceCount = n;
    (this.geo.getAttribute('aPos') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSizeRot') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mesh.material as THREE.ShaderMaterial).dispose();
  }
}

interface Timed {
  obj: THREE.Object3D;
  life: number;
  max: number;
  tick: (k: number, obj: THREE.Object3D) => void;
  dispose?: () => void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const _c = new THREE.Color();

export class SkillFx {
  private readonly layers: Record<LayerId, Layer>;
  private readonly timed: Timed[] = [];
  private readonly lights: Array<{ l: THREE.PointLight; life: number; max: number; i: number }> = [];
  private readonly ringGeo = new THREE.RingGeometry(0.9, 1, 56);
  private readonly discGeo = new THREE.CircleGeometry(1, 40);
  readonly scene: THREE.Scene;
  private camera: THREE.Camera | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const soft = radialTexture('soft');
    const smoke = radialTexture('smoke');
    const flame = radialTexture('flame');
    const spark = radialTexture('spark');
    this.layers = {
      fire: new Layer(scene, flame, true, 900),
      smoke: new Layer(scene, smoke, false, 500),
      spark: new Layer(scene, spark, true, 600),
      flash: new Layer(scene, soft, true, 120),
      elec: new Layer(scene, soft, true, 300),
      frost: new Layer(scene, soft, true, 400),
      toxic: new Layer(scene, smoke, false, 300),
    };
    // a few reusable lights for explosions
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff9a40, 0, 12, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ l, life: 0, max: 1, i: 0 });
    }
  }

  setCamera(cam: THREE.Camera): void {
    this.camera = cam;
  }

  emit(layer: LayerId, x: number, y: number, z: number, o: Partial<Omit<P, 'x' | 'y' | 'z'>> & { color?: number }): void {
    _c.setHex(o.color ?? 0xffffff);
    this.layers[layer].emit({
      x,
      y,
      z,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      vz: o.vz ?? 0,
      life: o.life ?? 0.6,
      s0: o.s0 ?? 0.4,
      s1: o.s1 ?? 1,
      rot: o.rot ?? Math.random() * 6.28,
      spin: o.spin ?? rnd(-2, 2),
      r: o.r ?? _c.r,
      g: o.g ?? _c.g,
      b: o.b ?? _c.b,
      a: o.a ?? 1,
      grav: o.grav ?? 0,
      drag: o.drag ?? 1.5,
    });
  }

  flashLight(pos: THREE.Vector3, color: number, intensity: number, life = 0.25): void {
    const slot = this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    slot.l.color.setHex(color);
    slot.l.position.set(pos.x, 1.6, pos.z);
    slot.l.visible = true;
    slot.life = slot.max = life;
    slot.i = intensity;
  }

  /** Fireball + debris + smoke + scorch ring. */
  explosion(pos: THREE.Vector3, radius: number, color = 0xff8a2a): void {
    const n = Math.round(14 + radius * 6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(1.5, 4.5) * radius;
      this.emit('fire', pos.x, 0.5 + Math.random() * 0.6, pos.z, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(1, 4),
        life: rnd(0.35, 0.7),
        s0: radius * 0.45,
        s1: radius * rnd(0.9, 1.4),
        color: Math.random() < 0.3 ? 0xfff0a0 : color,
        drag: 4,
      });
    }
    for (let i = 0; i < n * 0.7; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.5, 2.2) * radius;
      this.emit('smoke', pos.x, 0.6, pos.z, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(1, 2.6),
        life: rnd(1.1, 2.0),
        s0: radius * 0.4,
        s1: radius * rnd(1.4, 2.2),
        color: 0x2a2622,
        a: 0.55,
        drag: 2.2,
      });
    }
    this.sparks(pos, Math.round(10 + radius * 4), 0xffd27a, radius * 3);
    this.emit('flash', pos.x, 1, pos.z, { life: 0.16, s0: radius * 2.8, s1: radius * 3.4, color: 0xfff2c8, spin: 0 });
    this.shockRing(pos, radius * 1.15, color, 0.35);
    this.scorch(pos, radius * 0.8);
    this.flashLight(pos, color, 18 + radius * 4, 0.3);
  }

  sparks(pos: THREE.Vector3, n: number, color: number, speed = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.4, 1) * speed;
      this.emit('spark', pos.x, (pos.y || 0) + 0.6, pos.z, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(1, 5),
        life: rnd(0.25, 0.55),
        s0: 0.35,
        s1: 0.1,
        rot: -a,
        spin: 0,
        color,
        grav: 9,
        drag: 1,
      });
    }
  }

  /** Continuous flame lick (molotov pools, fire aura). */
  flame(x: number, z: number, size = 1, color = 0xff7a2a): void {
    this.emit('fire', x + rnd(-0.2, 0.2) * size, 0.15, z + rnd(-0.2, 0.2) * size, {
      vy: rnd(1.2, 2.6),
      life: rnd(0.45, 0.8),
      s0: 0.5 * size,
      s1: 0.15 * size,
      color: Math.random() < 0.25 ? 0xffd27a : color,
      drag: 0.5,
    });
    if (Math.random() < 0.18) this.emit('smoke', x, 1.2, z, { vy: 1.2, life: 1.4, s0: 0.5 * size, s1: 1.4 * size, color: 0x1f1b18, a: 0.35 });
  }

  /** Expanding ground ring. */
  shockRing(pos: THREE.Vector3, radius: number, color: number, life = 0.4, y = 0.08): void {
    const m = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, y, pos.z);
    this.scene.add(m);
    this.add(m, life, (k, o) => {
      o.scale.setScalar(0.2 + radius * Math.sqrt(k));
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    });
  }

  /** Dark ground mark that fades out slowly. */
  scorch(pos: THREE.Vector3, radius: number): void {
    const m = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: 0x070605, transparent: true, opacity: 0.55, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.025, pos.z);
    m.scale.setScalar(radius);
    this.scene.add(m);
    this.add(m, 6, (k, o) => (((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k * k)));
  }

  /** Jagged electric bolt between two points (ribbon facing the camera). */
  bolt(from: THREE.Vector3, to: THREE.Vector3, color = 0x9be7ff, width = 0.14, life = 0.16, segments = 10): void {
    const pts: THREE.Vector3[] = [];
    const len = from.distanceTo(to);
    for (let i = 0; i <= segments; i++) {
      const k = i / segments;
      const p = from.clone().lerp(to, k);
      if (i > 0 && i < segments) {
        const j = len * 0.08;
        p.x += rnd(-j, j);
        p.y += rnd(-j, j) * 0.6;
        p.z += rnd(-j, j);
      }
      pts.push(p);
    }
    const camPos = this.camera ? this.camera.position : new THREE.Vector3(0, 30, 10);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const next = pts[Math.min(pts.length - 1, i + 1)]!;
      const prev = pts[Math.max(0, i - 1)]!;
      const dir = next.clone().sub(prev).normalize();
      const toCam = camPos.clone().sub(p).normalize();
      const side = dir.cross(toCam).normalize().multiplyScalar(width * (i === 0 || i === pts.length - 1 ? 0.4 : 1));
      pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mk = (c: number, op: number) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const core = new THREE.Mesh(g, mk(0xffffff, 1));
    const glow = new THREE.Mesh(g, mk(color, 0.6));
    glow.scale.setScalar(1);
    const grp = new THREE.Group();
    grp.add(glow, core);
    this.scene.add(grp);
    this.add(grp, life, (k) => {
      (core.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
    }, () => {
      g.dispose();
      (core.material as THREE.Material).dispose();
      (glow.material as THREE.Material).dispose();
    });
    this.emit('elec', to.x, to.y, to.z, { life: 0.2, s0: 1.4, s1: 0.4, color, spin: 0 });
  }

  /** Straight glowing beam (laser) — returns the group so callers can re-aim it. */
  beam(color: number, width = 0.18): { group: THREE.Group; set: (from: THREE.Vector3, to: THREE.Vector3, k: number) => void; dispose: () => void } {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, 0.5);
    const mk = (c: number, op: number) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const core = new THREE.Mesh(geo, mk(0xffe6fb, 0.7));
    const glow = new THREE.Mesh(geo, mk(color, 0.32));
    const group = new THREE.Group();
    group.add(glow, core);
    this.scene.add(group);
    return {
      group,
      set: (from, to, k) => {
        const len = from.distanceTo(to);
        group.position.copy(from);
        group.lookAt(to);
        core.scale.set(width * 0.35 * k, width * 0.35 * k, len);
        glow.scale.set(width * k, width * k, len);
      },
      dispose: () => {
        group.removeFromParent();
        geo.dispose();
        (core.material as THREE.Material).dispose();
        (glow.material as THREE.Material).dispose();
      },
    };
  }

  /** Register a temporary object driven by `tick(k∈0..1)`; removed + disposed at the end. */
  add(obj: THREE.Object3D, life: number, tick: (k: number, obj: THREE.Object3D) => void, dispose?: () => void): void {
    this.timed.push({ obj, life, max: life, tick, dispose });
    tick(0, obj);
  }

  update(dt: number): void {
    for (const l of Object.values(this.layers)) l.update(dt);
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i]!;
      t.life -= dt;
      if (t.life <= 0) {
        t.obj.removeFromParent();
        if (t.dispose) t.dispose();
        else
          t.obj.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (m) m.dispose();
          });
        this.timed.splice(i, 1);
        continue;
      }
      t.tick(1 - t.life / t.max, t.obj);
    }
    for (const s of this.lights) {
      if (s.life <= 0) {
        if (s.l.visible) s.l.visible = false;
        continue;
      }
      s.life -= dt;
      s.l.intensity = s.i * Math.max(0, s.life / s.max);
    }
  }

  dispose(): void {
    for (const l of Object.values(this.layers)) l.dispose();
    for (const t of this.timed) t.obj.removeFromParent();
    for (const s of this.lights) s.l.removeFromParent();
    this.ringGeo.dispose();
    this.discGeo.dispose();
  }
}
