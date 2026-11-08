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
  private lastN = 0;

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
    this.mesh.visible = n > 0;
    // nothing alive now or last frame → no GPU upload at all
    if (n === 0 && this.lastN === 0) return;
    this.lastN = n;
    if (n === 0) return;
    // upload only the live part of each buffer instead of the full capacity
    for (const [name, size] of [['aPos', 3], ['aSizeRot', 2], ['aColor', 4]] as const) {
      const a = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * size);
      a.needsUpdate = true;
    }
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
    for (let i = 0; i < 2; i++) {
      // 2 slots is enough (oldest gets reused); each scene light costs per-pixel
      // work in every lit material.
      // always visible (intensity 0 when idle): toggling visibility changes the
      // scene light count and forces every material to recompile → big hitches
      const l = new THREE.PointLight(0xff9a40, 0, 12, 2);
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
    slot.life = slot.max = life;
    slot.i = intensity;
  }

  /**
   * Realistic HE explosion: short white-yellow flash, rolling orange fireball that
   * quickly turns to thick dark smoke, dirt debris thrown out, a low dust ring and a
   * scorch mark. `color` only tints the fireball slightly (napalm vs. frag).
   */
  explosion(pos: THREE.Vector3, radius: number, color = 0xff8a2a): void {
    const R = Math.max(0.8, radius);
    const fireTint = color === 0xff3d1a || color === 0xff5a1f ? 0xff6a24 : 0xff8c34;
    // flash
    this.emit('flash', pos.x, 1.0, pos.z, { life: 0.09, s0: R * 2.2, s1: R * 2.6, color: 0xfff0c8, spin: 0, a: 0.9 });
    // fireball core (short, upward)
    const nf = Math.round(10 + R * 5);
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.6, 2.2) * R;
      this.emit('fire', pos.x + rnd(-0.3, 0.3) * R, 0.4 + Math.random() * 0.5, pos.z + rnd(-0.3, 0.3) * R, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(1.5, 4.5),
        life: rnd(0.22, 0.45),
        s0: R * 0.55,
        s1: R * rnd(0.8, 1.15),
        color: i % 4 === 0 ? 0xffd890 : fireTint,
        drag: 5,
        a: 0.9,
      });
    }
    // heavy smoke column (dark, long-lived)
    const ns = Math.round(10 + R * 5);
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.3, 1.4) * R;
      const g = 0x24 + Math.floor(Math.random() * 0x18);
      this.emit('smoke', pos.x + rnd(-0.4, 0.4) * R, 0.6 + Math.random(), pos.z + rnd(-0.4, 0.4) * R, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(1.2, 3.2),
        life: rnd(1.6, 2.8),
        s0: R * 0.6,
        s1: R * rnd(1.8, 2.6),
        color: (g << 16) | (Math.floor(g * 0.95) << 8) | Math.floor(g * 0.9),
        a: 0.62,
        drag: 1.8,
      });
    }
    this.debris(pos, Math.round(8 + R * 4), R);
    this.dustRing(pos, R * 1.15);
    this.sparks(pos, Math.round(6 + R * 2), 0xffc070, R * 3.2);
    this.scorch(pos, R * 0.75);
    this.flashLight(pos, 0xffa050, 16 + R * 4, 0.22);
  }

  /** Dirt / rubble chunks thrown out and falling back (alpha-blended, dark). */
  debris(pos: THREE.Vector3, n: number, R = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(2, 5.5) * Math.sqrt(R);
      this.emit('smoke', pos.x, 0.4, pos.z, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(3, 7),
        life: rnd(0.6, 1.1),
        s0: rnd(0.12, 0.26),
        s1: 0.1,
        color: i % 3 ? 0x2a2018 : 0x3d342a,
        a: 0.95,
        grav: 14,
        drag: 0.4,
      });
    }
  }

  /** Low ground dust ring spreading outward (shockwaves, landings, stomps). */
  dustRing(pos: THREE.Vector3, radius: number, color = 0x6e6250): void {
    const n = Math.round(14 + radius * 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const sp = radius * rnd(1.6, 2.4);
      this.emit('smoke', pos.x + Math.cos(a) * 0.4, 0.25, pos.z + Math.sin(a) * 0.4, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(0.2, 0.9),
        life: rnd(0.7, 1.2),
        s0: 0.5,
        s1: rnd(1.2, 2.0) * Math.min(2, 0.6 + radius * 0.25),
        color,
        a: 0.45,
        drag: 2.6,
      });
    }
  }

  /** White vapour burst (liquid nitrogen / CO₂ / flashbang smoke). */
  vapor(pos: THREE.Vector3, radius: number, color = 0xdfe6ea): void {
    const n = Math.round(16 + radius * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = radius * rnd(1, 2.2);
      this.emit('smoke', pos.x, 0.4 + Math.random() * 0.6, pos.z, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(0.2, 1.2),
        life: rnd(1.0, 1.8),
        s0: 0.6,
        s1: rnd(1.6, 2.6),
        color,
        a: 0.38,
        drag: 2.2,
      });
    }
  }

  /** Lingering chemical gas (toxin): sickly yellow-olive, alpha-blended. */
  gas(x: number, z: number, size = 1): void {
    this.emit('toxic', x + rnd(-0.3, 0.3) * size, 0.3, z + rnd(-0.3, 0.3) * size, {
      vx: rnd(-0.3, 0.3),
      vz: rnd(-0.3, 0.3),
      vy: rnd(0.2, 0.6),
      life: rnd(1.4, 2.2),
      s0: 0.7 * size,
      s1: 2.0 * size,
      color: Math.random() < 0.5 ? 0x8a8f52 : 0x6f7444,
      a: 0.3,
      drag: 1,
    });
  }

  sparks(pos: THREE.Vector3, n: number, color: number, speed = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.4, 1) * speed;
      this.emit('spark', pos.x, (pos.y || 0) + 0.6, pos.z, {
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: rnd(1, 5),
        life: rnd(0.2, 0.45),
        s0: 0.28,
        s1: 0.06,
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
      vy: rnd(1.2, 2.4),
      life: rnd(0.4, 0.7),
      s0: 0.45 * size,
      s1: 0.12 * size,
      color: Math.random() < 0.25 ? 0xffc870 : color,
      drag: 0.5,
      a: 0.85,
    });
    if (Math.random() < 0.3) this.emit('smoke', x, 1.1, z, { vy: 1.3, life: 1.6, s0: 0.5 * size, s1: 1.6 * size, color: 0x1c1916, a: 0.42 });
  }

  /** Subtle ground ring (realistic: dust-coloured, alpha-blended, faint). */
  shockRing(pos: THREE.Vector3, radius: number, color: number, life = 0.4, y = 0.08): void {
    const c = new THREE.Color(color).lerp(new THREE.Color(0x6a6052), 0.7);
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, y, pos.z);
    this.scene.add(m);
    this.add(m, life, (k, o) => {
      o.scale.setScalar(0.2 + radius * Math.sqrt(k));
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.22 * (1 - k);
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

  /** Tracer round: short bright streak travelling along a line (MG / turret / drone). */
  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffc46a): void {
    const d = to.clone().sub(from);
    const len = d.length();
    if (len < 0.1) return;
    d.divideScalar(len);
    const sp = 140;
    const life = Math.min(0.12, len / sp);
    this.emit('spark', from.x, from.y, from.z, { vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life, s0: 0.9, s1: 0.9, rot: Math.atan2(-d.z, d.x), spin: 0, color, drag: 0, a: 1 });
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
    const core = new THREE.Mesh(g, mk(0xffffff, 0.95));
    const glow = new THREE.Mesh(g, mk(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex(), 0.35));
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
    this.emit('elec', to.x, to.y, to.z, { life: 0.12, s0: 0.7, s1: 0.2, color: 0xdfefff, spin: 0, a: 0.7 });
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
        if (s.l.intensity !== 0) s.l.intensity = 0;
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
