import * as THREE from 'three';

/**
 * Top-down see-through: map geometry (buildings, walls, trees, tall props) that sits between the
 * camera and a hero or a nearby zombie turns dithered-transparent in a soft circle around it, so
 * nobody disappears behind a roof or a tree crown. Done in the fragment shader with screen-door
 * transparency, so it needs no sorting and works for instanced meshes too. Ground, roads and
 * low clutter are left alone (they are never in front of a body).
 */
export const SEE_THROUGH_MAX = 16;

export interface SeeTarget {
  pos: THREE.Vector3;
  /** hole radius in metres */
  radius: number;
}

const PRELUDE = /* glsl */ `
uniform vec4 stHoles[${SEE_THROUGH_MAX}];
uniform int stCount;
float stBayer(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[i]) + 0.5) / 16.0;
}
`;
const CUT = /* glsl */ `
  for (int sti = 0; sti < ${SEE_THROUGH_MAX}; sti++) {
    if (sti >= stCount) break;
    vec4 sh = stHoles[sti];
    vec2 sd = gl_FragCoord.xy - sh.xy;
    float sr = length(sd);
    if (sr < sh.z && gl_FragCoord.z < sh.w) {
      float se = smoothstep(sh.z, sh.z * 0.55, sr);
      if (stBayer(gl_FragCoord.xy) > mix(1.0, 0.3, se)) discard;
    }
  }
`;

export class SeeThrough {
  private readonly holes = Array.from({ length: SEE_THROUGH_MAX }, () => new THREE.Vector4());
  private readonly uniforms = { stHoles: { value: this.holes }, stCount: { value: 0 } };
  private readonly clones = new Map<THREE.Material, THREE.Material>();
  private readonly made: THREE.Material[] = [];
  private readonly _p = new THREE.Vector3();
  private readonly _q = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _size = new THREE.Vector2();
  private readonly _box = new THREE.Box3();

  /** Give every tall map mesh under `root` a see-through-capable material (call once props are placed). */
  patch(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material || mesh.userData.seeThrough !== undefined) return;
      this._box.makeEmpty();
      try {
        this._box.setFromObject(mesh, false);
      } catch {
        return;
      }
      const tall = !this._box.isEmpty() && this._box.max.y >= 1.0 && this._box.max.y - this._box.min.y >= 0.7;
      mesh.userData.seeThrough = tall;
      if (!tall) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => this.patched(m)) : this.patched(mesh.material);
    });
  }

  private patched(m: THREE.Material): THREE.Material {
    const have = this.clones.get(m);
    if (have) return have;
    if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial && !(m as THREE.MeshLambertMaterial).isMeshLambertMaterial && !(m as THREE.MeshPhongMaterial).isMeshPhongMaterial) {
      this.clones.set(m, m);
      return m;
    }
    const c = m.clone();
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey?.bind(m);
    c.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.stHoles = this.uniforms.stHoles;
      sh.uniforms.stCount = this.uniforms.stCount;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${PRELUDE}\nvoid main() {`).replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${CUT}`);
    };
    c.customProgramCacheKey = () => `seethrough|${prevKey ? prevKey() : ''}`;
    this.clones.set(m, c);
    this.made.push(c);
    return c;
  }

  /** Project the targets to drawing-buffer pixels for this frame. */
  update(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, targets: readonly SeeTarget[]): void {
    renderer.getDrawingBufferSize(this._size);
    const w = this._size.x;
    const h = this._size.y;
    this._right.setFromMatrixColumn(camera.matrixWorld, 0);
    let n = 0;
    for (const t of targets) {
      if (n >= SEE_THROUGH_MAX) break;
      this._p.copy(t.pos).project(camera);
      if (this._p.z < -1 || this._p.z > 1 || Math.abs(this._p.x) > 1.15 || Math.abs(this._p.y) > 1.15) continue;
      this._q.copy(t.pos).addScaledVector(this._right, t.radius).project(camera);
      const px = (this._p.x * 0.5 + 0.5) * w;
      const py = (this._p.y * 0.5 + 0.5) * h;
      const rad = Math.hypot((this._q.x - this._p.x) * 0.5 * w, (this._q.y - this._p.y) * 0.5 * h);
      // window depth of a point 1 m in front of the target (toward the camera): only what is
      // really between the eye and the body gets cut, not the wall right behind it
      this._q.copy(camera.position).sub(t.pos).normalize().multiplyScalar(1).add(t.pos).project(camera);
      this.holes[n]!.set(px, py, rad, this._q.z * 0.5 + 0.5);
      n++;
    }
    this.uniforms.stCount.value = n;
  }

  dispose(): void {
    for (const m of this.made) m.dispose();
    this.made.length = 0;
    this.clones.clear();
  }
}
