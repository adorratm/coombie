import * as THREE from 'three';
import { spotHash, type InteractSpot } from './interactables';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeAabb, type Aabb } from './collision';

/**
 * Realistic map construction kit.
 *
 * Surfaces use CC0 photo-scanned PBR sets (Poly Haven / ambientCG → public/maps/tex) on
 * world-metre UVs; the ground blends a second set through world-space noise so large
 * areas never look tiled. Props are CC0 Poly Haven scans (public/maps/props), drawn as
 * one InstancedMesh per sub-mesh so a map can hold hundreds of them cheaply. Buildings,
 * walls, containers, sandbags and fences are procedural shells dressed with the same
 * PBR sets.
 */

export type TexId =
  | 'road_damaged'
  | 'asphalt_02'
  | 'cracked_concrete'
  | 'concrete_floor_worn_001'
  | 'forest_ground_04'
  | 'aerial_grass_rock'
  | 'snow006'
  | 'coast_sand_01'
  | 'dry_ground_rocks'
  | 'dirty_tiles'
  | 'floor_tiles_06'
  | 'gravel_road'
  | 'hangar_concrete_floor'
  | 'brown_mud'
  | 'brick_wall_10'
  | 'concrete_wall_008'
  | 'factory_wall'
  | 'container_side'
  | 'corrugated_iron'
  | 'grey_roof_01'
  | 'clay_roof_tiles'
  | 'dark_wooden_planks'
  | 'damaged_plaster'
  | 'rust_coarse_01'
  | 'metal_plate'
  | 'hessian_230'
  | 'asphalt_snow'
  | 'forest_leaves_02';

export type PropId =
  | 'barrier'
  | 'car'
  | 'lamp'
  | 'trashcan'
  | 'trashbag'
  | 'tyre'
  | 'utilitybox'
  | 'aircon'
  | 'seclight'
  | 'hydrant'
  | 'barrel'
  | 'barrel_rust'
  | 'barrel_blue'
  | 'jerrycan'
  | 'propane'
  | 'generator'
  | 'crate'
  | 'crate_long'
  | 'milcrate_old'
  | 'milcrate'
  | 'cardboard'
  | 'plastic_box'
  | 'toolchest'
  | 'shelves'
  | 'cementbag'
  | 'plastic_crate'
  | 'lpg'
  | 'rack'
  | 'toolcart'
  | 'pipes'
  | 'log'
  | 'log2'
  | 'stump'
  | 'rock'
  | 'rock_small'
  | 'shrub'
  | 'shrub_low'
  | 'fern'
  | 'deadtree'
  | 'branches'
  | 'wheelchair'
  | 'medbox'
  | 'desk'
  | 'bed'
  | 'chemistry'
  | 'cabinet'
  | 'wetsign'
  | 'searchlight'
  | 'ammo'
  | 'buoy'
  | 'lifebuoy'
  | 'picnic'
  | 'bench'
  | 'firepit'
  | 'powerbox';

interface PropDef {
  file: string;
  /** extra scale on top of the world scale */
  scale?: number;
  collide?: boolean;
  /** shrink factor for the collider footprint */
  pad?: number;
}

/** World is ~1.15× real scale (characters are 1.95–2.1 m). */
const WORLD = 1.15;

export const PROPS: Record<PropId, PropDef> = {
  barrier: { file: 'concrete_road_barrier_02', collide: true, scale: 1.3 },
  car: { file: 'covered_car', collide: true, pad: 0.92 },
  lamp: { file: 'street_lamp_02', collide: true, pad: 0.25, scale: 1.6 },
  trashcan: { file: 'metal_trash_can', collide: true },
  trashbag: { file: 'trashbag' },
  tyre: { file: 'old_tyre' },
  utilitybox: { file: 'utility_box_02', collide: true },
  aircon: { file: 'exterior_aircon_unit', collide: true },
  seclight: { file: 'security_light' },
  hydrant: { file: 'fire_hydrant', collide: true, pad: 0.6 },
  barrel: { file: 'barrel_03', collide: true },
  barrel_rust: { file: 'Barrel_01', collide: true },
  barrel_blue: { file: 'Barrel_02', collide: true },
  jerrycan: { file: 'metal_jerrycan' },
  propane: { file: 'propane_tank', collide: true },
  generator: { file: 'portable_generator', collide: true, scale: 1.3 },
  crate: { file: 'wooden_crate_01', collide: true, scale: 1.5 },
  crate_long: { file: 'wooden_crate_02', collide: true, scale: 1.5 },
  milcrate_old: { file: 'old_military_crate', collide: true, scale: 1.4 },
  milcrate: { file: 'wooden_military_crate', collide: true, scale: 1.4 },
  cardboard: { file: 'cardboard_box_01', scale: 1.3 },
  plastic_box: { file: 'industrial_pastic_container' },
  toolchest: { file: 'metal_tool_chest', collide: true },
  shelves: { file: 'steel_frame_shelves_02', collide: true },
  cementbag: { file: 'cement_bag' },
  plastic_crate: { file: 'plastic_crate_01' },
  lpg: { file: 'small_lpg_tank', collide: true },
  rack: { file: 'worn_metal_rack', collide: true },
  toolcart: { file: 'tool_cart', collide: true },
  pipes: { file: 'modular_industrial_pipes_01', collide: true, scale: 2.2 },
  log: { file: 'dead_tree_trunk', collide: true, pad: 0.8, scale: 1.6 },
  log2: { file: 'dead_tree_trunk_02', collide: true, pad: 0.7, scale: 1.4 },
  stump: { file: 'tree_stump_01', collide: true, pad: 0.6 },
  rock: { file: 'rock_07', collide: true, pad: 0.75, scale: 9 },
  rock_small: { file: 'rock_09', scale: 8 },
  shrub: { file: 'shrub_02' },
  shrub_low: { file: 'shrub_04', scale: 2 },
  fern: { file: 'fern_02', scale: 1.3 },
  deadtree: { file: 'dead_quiver_trunk', collide: true, pad: 0.5, scale: 2.4 },
  branches: { file: 'dry_branches_medium_01', scale: 2.5 },
  wheelchair: { file: 'wheelchair_01', collide: true },
  medbox: { file: 'medical_box', scale: 1.2 },
  desk: { file: 'metal_office_desk', collide: true },
  bed: { file: 'old_bed_frame', collide: true },
  chemistry: { file: 'chemistry_set', scale: 2 },
  cabinet: { file: 'drawer_cabinet', collide: true },
  wetsign: { file: 'WetFloorSign_01' },
  searchlight: { file: 'portable_searchlight', scale: 3 },
  ammo: { file: 'ammo_box', scale: 1.5 },
  buoy: { file: 'ocean_buoy', collide: true },
  lifebuoy: { file: 'lifebuoy' },
  picnic: { file: 'wooden_picnic_table', collide: true },
  bench: { file: 'painted_wooden_bench', collide: true },
  firepit: { file: 'stone_fire_pit', collide: true, pad: 0.8 },
  powerbox: { file: 'power_box_01' },
};

// ---------------------------------------------------------------------------
// textures / materials
// ---------------------------------------------------------------------------

const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
let anisotropy = 8;
export function setMapAnisotropy(a: number): void {
  anisotropy = a;
}
function tex(id: string, kind: 'c' | 'n' | 'r'): THREE.Texture {
  const key = `${id}_${kind}`;
  let t = texCache.get(key);
  if (!t) {
    t = texLoader.load(`/maps/tex/${key}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
    if (kind === 'c') t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}

export interface PbrOpts {
  tint?: number;
  rough?: number;
  metal?: number;
  normal?: number;
  emissive?: number;
  emissiveIntensity?: number;
}
const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** PBR material for world-metre UVs: `tile` = metres per texture repeat. */
export function pbr(id: TexId, tile: number, o: PbrOpts = {}): THREE.MeshStandardMaterial {
  const key = `${id}|${tile}|${JSON.stringify(o)}`;
  let m = matCache.get(key);
  if (m) return m;
  const rep = (t: THREE.Texture) => {
    const c = t.clone();
    c.repeat.set(1 / tile, 1 / tile);
    c.needsUpdate = true;
    return c;
  };
  m = new THREE.MeshStandardMaterial({
    map: rep(tex(id, 'c')),
    normalMap: rep(tex(id, 'n')),
    roughnessMap: rep(tex(id, 'r')),
    color: o.tint ?? 0xffffff,
    roughness: o.rough ?? 1,
    metalness: o.metal ?? 0,
    normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 0,
  });
  matCache.set(key, m);
  return m;
}

/** Ground: base set + second set blended by world-space noise (+ large-scale grime). */
function groundMaterial(base: TexId, tile: number, second: TexId | null, tile2: number, amount: number, tint = 0xffffff): THREE.MeshStandardMaterial {
  const m = pbr(base, tile, { tint }).clone();
  const t2 = tex(second ?? base, 'c');
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMap2 = { value: t2 };
    sh.uniforms.uRep2 = { value: 1 / tile2 };
    sh.uniforms.uAmt = { value: second ? amount : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vWXZ;
uniform sampler2D uMap2; uniform float uRep2; uniform float uAmt;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float n = fbm(vWXZ * 0.045);
  float m2 = smoothstep(0.46, 0.6, n) * uAmt;
  vec3 c2 = texture2D(uMap2, vWXZ * uRep2).rgb;
  diffuseColor.rgb = mix(diffuseColor.rgb, c2, m2);
  float grime = fbm(vWXZ * 0.013 + 7.0);
  diffuseColor.rgb *= 0.78 + 0.38 * grime;
}`,
      );
  };
  m.customProgramCacheKey = () => `ground|${base}|${second}`;
  return m;
}

/** BoxGeometry whose UVs are in metres on every face. */
function boxWorldUV(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f]!;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
}

function radialTex(inner: string, outer: string): THREE.Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, inner);
  r.addColorStop(1, outer);
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let poolTex: THREE.Texture | null = null;
let fenceTex: THREE.Texture | null = null;
function chainlinkTex(): THREE.Texture {
  if (fenceTex) return fenceTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(190,196,200,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(s, s);
  g.moveTo(s, 0);
  g.lineTo(0, s);
  g.stroke();
  fenceTex = new THREE.CanvasTexture(c);
  fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
  return fenceTex;
}

// ---------------------------------------------------------------------------
// prop library (instanced)
// ---------------------------------------------------------------------------

const gltf = new GLTFLoader();
interface PropAsset {
  parts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material; local: THREE.Matrix4 }>;
  size: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
}
const propCache = new Map<string, Promise<PropAsset>>();
function loadProp(file: string): Promise<PropAsset> {
  let p = propCache.get(file);
  if (!p) {
    p = gltf.loadAsync(`/maps/props/${file}.glb`).then((g) => {
      g.scene.updateMatrixWorld(true);
      const parts: PropAsset['parts'] = [];
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.isMeshStandardMaterial) {
          mat.envMapIntensity = 0.6;
          if (mat.metalnessMap === null && mat.metalness > 0.9) mat.metalness = 0.6;
        }
        parts.push({ geo: m.geometry, mat, local: m.matrixWorld.clone() });
      });
      const box = new THREE.Box3().setFromObject(g.scene);
      // merge sub-meshes that share a material (fewer instanced draw calls)
      const byMat = new Map<THREE.Material, PropAsset['parts']>();
      for (const p of parts) byMat.set(p.mat, [...(byMat.get(p.mat) ?? []), p]);
      const merged: PropAsset['parts'] = [];
      for (const [mat, list] of byMat) {
        if (list.length === 1) {
          merged.push(list[0]!);
          continue;
        }
        const keys = Object.keys(list[0]!.geo.attributes).sort().join();
        if (!list.every((p) => Object.keys(p.geo.attributes).sort().join() === keys && !!p.geo.index === !!list[0]!.geo.index)) {
          merged.push(...list);
          continue;
        }
        const geo = mergeGeometries(list.map((p) => p.geo.clone().applyMatrix4(p.local)));
        if (geo) merged.push({ geo, mat, local: new THREE.Matrix4() });
        else merged.push(...list);
      }
      return { parts: merged, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), minY: box.min.y };
    });
    propCache.set(file, p);
  }
  return p;
}

/** A single prop as a plain group (outside the instanced map path), base on y = 0, centred in x/z. */
export async function propGroup(file: string, scale = 1): Promise<THREE.Group> {
  const a = await loadProp(file);
  const g = new THREE.Group();
  const inner = new THREE.Group();
  for (const part of a.parts) {
    const m = new THREE.Mesh(part.geo, part.mat);
    m.applyMatrix4(part.local);
    m.castShadow = true;
    m.receiveShadow = true;
    inner.add(m);
  }
  inner.position.set(-a.center.x, -a.minY, -a.center.z);
  g.add(inner);
  g.scale.setScalar(WORLD * scale);
  return g;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  tint?: number;
  tilt?: number;
}

// ---------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------

export interface MapAnchors {
  core: THREE.Vector3;
  evac: THREE.Vector3;
  spawn: THREE.Vector3;
  pickups: THREE.Vector3[];
  rescues: THREE.Vector3[];
  boss: THREE.Vector3;
}

export type Rng = () => number;
export function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lava: dark cooling crust with glowing cracks (procedural, tiling). */
let lavaTex: THREE.DataTexture | null = null;
function lavaTexture(): THREE.DataTexture {
  if (lavaTex) return lavaTex;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const rnd = mulberry(4242);
  // a few random cell centres (wrapped) → Voronoi edges are the cracks
  const pts = Array.from({ length: 18 }, () => [rnd() * N, rnd() * N] as const);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, py] of pts)
        for (const ox of [-N, 0, N])
          for (const oy of [-N, 0, N]) {
            const d = Math.hypot(x - px - ox, y - py - oy);
            if (d < d1) {
              d2 = d1;
              d1 = d;
            } else if (d < d2) d2 = d;
          }
      const edge = Math.max(0, 1 - (d2 - d1) / 5);
      const glow = Math.min(1, edge * 1.4 + rnd() * 0.08);
      const i = (y * N + x) * 4;
      data[i] = Math.round(40 + glow * 215);
      data[i + 1] = Math.round(12 + glow * glow * 150);
      data[i + 2] = Math.round(6 + glow * glow * 30);
      data[i + 3] = 255;
    }
  lavaTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  lavaTex.colorSpace = THREE.SRGBColorSpace;
  lavaTex.needsUpdate = true;
  return lavaTex;
}

export class MapBuilder {
  readonly scene: THREE.Scene;
  readonly root = new THREE.Group();
  readonly colliders: Aabb[] = [];
  readonly half: number;
  readonly rng: Rng;
  readonly anchors: MapAnchors;
  private readonly placements = new Map<PropId, Placement[]>();
  private readonly owned: THREE.BufferGeometry[] = [];
  private readonly ownedMats: THREE.Material[] = [];
  /** keep-out discs (objectives, roads) for scatter() */
  private readonly keepOut: Array<{ x: number; z: number; r: number }> = [];
  lights: THREE.PointLight[] = [];
  /** shootable things (explosive barrels / gas tanks, barricades) — drawn and simulated by the arena */
  readonly interact: InteractSpot[] = [];
  private readonly winGlass: THREE.Matrix4[] = [];
  private readonly winLit: THREE.Matrix4[] = [];
  private readonly trees: Array<{ x: number; z: number; h: number; rot: number; snow: boolean }> = [];
  private roadY = 0.012;

  constructor(scene: THREE.Scene, half: number, seed: number) {
    this.scene = scene;
    this.half = half;
    this.rng = mulberry(seed);
    this.root.name = 'map';
    scene.add(this.root);
    this.anchors = {
      core: new THREE.Vector3(0, 0, 0),
      evac: new THREE.Vector3(half * 0.7, 0, -half * 0.7),
      spawn: new THREE.Vector3(0, 0, 8),
      pickups: [],
      rescues: [],
      boss: new THREE.Vector3(-half * 0.5, 0, half * 0.5),
    };
  }

  r(a: number, b: number): number {
    return a + this.rng() * (b - a);
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.rng() * a.length)]!;
  }

  clear(x: number, z: number, r: number): void {
    this.keepOut.push({ x, z, r });
  }
  isClear(x: number, z: number, pad = 0): boolean {
    for (const k of this.keepOut) if ((x - k.x) ** 2 + (z - k.z) ** 2 < (k.r + pad) ** 2) return false;
    for (const c of this.colliders) if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return false;
    return true;
  }

  private add(m: THREE.Object3D): THREE.Object3D {
    this.root.add(m);
    return m;
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.owned.push(g);
    return g;
  }

  /** Box collider for a rotated rectangle (split into AABB slices when rotated). */
  collideRect(x: number, z: number, w: number, d: number, rot = 0): void {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const axisAligned = Math.abs(s) < 0.02 || Math.abs(c) < 0.02;
    if (axisAligned) {
      const hw = Math.abs(c) > 0.5 ? w / 2 : d / 2;
      const hd = Math.abs(c) > 0.5 ? d / 2 : w / 2;
      this.colliders.push(makeAabb(x, z, hw, hd));
      return;
    }
    // slice along the long axis
    const long = Math.max(w, d);
    const short = Math.min(w, d);
    const n = Math.max(1, Math.ceil(long / Math.max(0.6, short)));
    const ax = w >= d ? [c, -s] : [s, c];
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n - 0.5;
      const cx = x + ax[0]! * k * long;
      const cz = z + ax[1]! * k * long;
      this.colliders.push(makeAabb(cx, cz, short / 2, short / 2));
    }
  }

  // ---------------------------------------------------------------- surfaces
  ground(base: TexId, tile: number, second: TexId | null = null, tile2 = tile, amount = 0.8, tint = 0xffffff): void {
    const size = this.half * 2 + 120;
    const g = this.geo(new THREE.PlaneGeometry(size, size, 1, 1));
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size, uv.getY(i) * size);
    const m = new THREE.Mesh(g, groundMaterial(base, tile, second, tile2, amount, tint));
    this.ownedMats.push(m.material as THREE.Material);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    this.add(m);
  }

  /** Flat surface patch (plaza, parking lot, floor). */
  patch(tex: TexId, tile: number, x: number, z: number, w: number, d: number, rot = 0, tint?: number): void {
    const g = this.geo(new THREE.PlaneGeometry(w, d));
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
    const m = new THREE.Mesh(g, pbr(tex, tile, { tint }));
    m.rotation.set(-Math.PI / 2, 0, rot);
    this.roadY += 0.0004;
    m.position.set(x, this.roadY, z);
    m.receiveShadow = true;
    this.add(m);
  }

  /** Road strip with curbs and lane dashes. */
  road(x1: number, z1: number, x2: number, z2: number, width: number, opts: { tex?: TexId; curb?: boolean; lanes?: boolean; tint?: number } = {}): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    this.patch(opts.tex ?? 'road_damaged', 6, cx, cz, width, len, rot, opts.tint);
    const dirX = dx / len;
    const dirZ = dz / len;
    if (opts.lanes !== false) {
      const dash = this.geo(new THREE.PlaneGeometry(0.22, 2.8));
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.9, transparent: true, opacity: 0.55 });
      this.ownedMats.push(mat);
      const n = Math.floor(len / 7);
      const inst = new THREE.InstancedMesh(dash, mat, n);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot, 'YXZ'));
      for (let i = 0; i < n; i++) {
        if (this.rng() < 0.18) {
          m4.makeScale(0, 0, 0);
        } else {
          const k = (i + 0.5) / n - 0.5;
          m4.compose(new THREE.Vector3(cx + dirX * k * len, this.roadY + 0.003, cz + dirZ * k * len), q, new THREE.Vector3(1, 1, 1));
        }
        inst.setMatrixAt(i, m4);
      }
      inst.receiveShadow = true;
      this.add(inst);
    }
    if (opts.curb !== false) {
      const curb = pbr('cracked_concrete', 2, { tint: 0xb0b0b0 });
      for (const side of [-1, 1]) {
        const g = this.geo(boxWorldUV(0.35, 0.16, len));
        const m = new THREE.Mesh(g, curb);
        m.position.set(cx + dirZ * side * (width / 2 + 0.17), 0.08, cz - dirX * side * (width / 2 + 0.17));
        m.rotation.y = rot;
        m.receiveShadow = true;
        this.add(m);
      }
    }
  }

  // ---------------------------------------------------------------- structures
  building(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    style: { wall: TexId; roof: TexId; wallTile?: number; roofTile?: number; tint?: number; roofTint?: number; windows?: boolean; rooftop?: boolean },
    rot = 0,
  ): void {
    const wall = pbr(style.wall, style.wallTile ?? 3, { tint: style.tint });
    const roof = pbr(style.roof, style.roofTile ?? 4, { tint: style.roofTint });
    const g = this.geo(boxWorldUV(w, h, d));
    const m = new THREE.Mesh(g, [wall, wall, roof, wall, wall, wall]);
    m.position.set(x, h / 2, z);
    m.rotation.y = rot;
    m.castShadow = true;
    m.receiveShadow = true;
    this.add(m);
    this.collideRect(x, z, w, d, rot);
    // parapet
    const par = pbr(style.wall, style.wallTile ?? 3, { tint: (style.tint ?? 0xffffff) & 0xdddddd });
    const t = 0.25;
    const ph = 0.7;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const local = (lx: number, lz: number) => new THREE.Vector3(x + lx * c + lz * s, 0, z - lx * s + lz * c);
    const parts: THREE.BufferGeometry[] = [];
    for (const [lx, lz, pw, pd] of [
      [0, d / 2 - t / 2, w, t],
      [0, -d / 2 + t / 2, w, t],
      [w / 2 - t / 2, 0, t, d],
      [-w / 2 + t / 2, 0, t, d],
    ] as const) {
      const p = local(lx, lz);
      const g = boxWorldUV(pw, ph, pd);
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, h + ph / 2, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1)));
      parts.push(g);
    }
    const pm = new THREE.Mesh(this.geo(mergeGeometries(parts)), par);
    parts.forEach((g) => g.dispose());
    pm.castShadow = true;
    this.add(pm);
    // windows: dark glass panes, a few faintly lit (instanced in finishProps)
    if (style.windows !== false && h > 3.5) {
      const floors = Math.floor((h - 1) / 3.2);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      for (const face of [0, 1, 2, 3]) {
        const along = face < 2 ? w : d;
        const n = Math.floor(along / 3.2);
        for (let f = 0; f < floors; f++)
          for (let i = 0; i < n; i++) {
            if (this.rng() < 0.15) continue;
            const k = (i + 0.5) / n - 0.5;
            const off = 0.02;
            let lx = 0;
            let lz = 0;
            let ry = 0;
            if (face === 0) [lx, lz, ry] = [k * w, d / 2 + off, 0];
            else if (face === 1) [lx, lz, ry] = [k * w, -d / 2 - off, Math.PI];
            else if (face === 2) [lx, lz, ry] = [w / 2 + off, k * d, Math.PI / 2];
            else [lx, lz, ry] = [-w / 2 - off, k * d, -Math.PI / 2];
            const p = local(lx, lz);
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot + ry);
            m4.compose(new THREE.Vector3(p.x, 1.6 + f * 3.2 + 0.9, p.z), q, one);
            (this.rng() < 0.07 ? this.winLit : this.winGlass).push(m4.clone());
          }
      }
    }
    if (style.rooftop !== false && w > 6 && d > 6) {
      const n = 1 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        const p = local(this.r(-w / 2 + 2, w / 2 - 2), this.r(-d / 2 + 2, d / 2 - 2));
        this.prop(this.rng() < 0.6 ? 'aircon' : 'utilitybox', p.x, p.z, { y: h, rot: rot + this.pick([0, Math.PI / 2, Math.PI]), collide: false, scale: 1.6 });
      }
    }
  }

  /** Straight wall (concrete / brick / sheet metal). */
  wall(x1: number, z1: number, x2: number, z2: number, h: number, tex: TexId, thick = 0.4, tint?: number): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(this.geo(boxWorldUV(thick, h, len)), pbr(tex, 3, { tint }));
    m.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
    m.rotation.y = rot;
    m.castShadow = true;
    m.receiveShadow = true;
    this.add(m);
    this.collideRect((x1 + x2) / 2, (z1 + z2) / 2, thick, len, rot);
  }

  /**
   * Water channel along a line, impassable except where `bridges` (0..1 along the
   * line) cross it. Banks get a muddy rim; a bridge is a plank deck with rails.
   */
  water(x1: number, z1: number, x2: number, z2: number, width: number, bridges: number[] = [], bridgeW = 6): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    const dx = (x2 - x1) / len;
    const dz = (z2 - z1) / len;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    // muddy banks
    this.patch('brown_mud', 4, cx, cz, width + 4, len, rot, 0x8a7a62);
    // the water: dark, glossy, slightly bluish-green
    const g = this.geo(new THREE.PlaneGeometry(width, len, 1, 1));
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d3a44, roughness: 0.08, metalness: 0.55, emissive: 0x06141a, emissiveIntensity: 0.4, transparent: true, opacity: 0.92 });
    this.ownedMats.push(mat);
    const w = new THREE.Mesh(g, mat);
    w.rotation.set(-Math.PI / 2, 0, rot);
    w.position.set(cx, 0.06, cz);
    w.receiveShadow = true;
    w.name = 'water';
    this.add(w);
    // colliders in pieces between the bridges
    const spans = [...bridges].sort((a, b) => a - b);
    const half = bridgeW / 2 / len;
    let t0 = 0;
    const segment = (a: number, b: number) => {
      if (b - a <= 0.002) return;
      const sx = x1 + dx * len * a;
      const sz = z1 + dz * len * a;
      const ex = x1 + dx * len * b;
      const ez = z1 + dz * len * b;
      this.collideRect((sx + ex) / 2, (sz + ez) / 2, width - 0.6, Math.hypot(ex - sx, ez - sz), rot);
    };
    for (const t of spans) {
      segment(t0, t - half);
      t0 = t + half;
      const bx = x1 + dx * len * t;
      const bz = z1 + dz * len * t;
      this.bridge(bx, bz, width + 3, bridgeW, rot + Math.PI / 2);
      this.clear(bx, bz, bridgeW);
    }
    segment(t0, 1);
    // keep scatter / buildings off the water
    for (let t = 0; t <= len; t += Math.max(3, width / 2)) this.clear(x1 + dx * t, z1 + dz * t, width / 2 + 1.5);
  }

  /** Plank bridge with rails (walkable). `rot` = travel direction. */
  bridge(x: number, z: number, len: number, width: number, rot: number): void {
    const deck = new THREE.Mesh(this.geo(boxWorldUV(width, 0.22, len)), pbr('dark_wooden_planks', 1.5, { tint: 0xa08060 }));
    deck.position.set(x, 0.14, z);
    deck.rotation.y = rot;
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.add(deck);
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    for (const side of [-1, 1]) {
      const rx = x + c * side * (width / 2 - 0.1);
      const rz = z - sn * side * (width / 2 - 0.1);
      const rail = new THREE.Mesh(this.geo(boxWorldUV(0.12, 0.9, len)), pbr('dark_wooden_planks', 1, { tint: 0x7a6048 }));
      rail.position.set(rx, 0.6, rz);
      rail.rotation.y = rot;
      rail.castShadow = true;
      this.add(rail);
    }
  }

  /** Rock cliff wall: jagged stacked blocks, impassable. */
  cliff(x1: number, z1: number, x2: number, z2: number, h: number, thick = 3, tint = 0x9a6a4a): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / 4));
    const mat = pbr('dry_ground_rocks', 3, { tint });
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const px = x1 + (x2 - x1) * k;
      const pz = z1 + (z2 - z1) * k;
      const bh = h * this.r(0.75, 1.2);
      const bw = thick * this.r(0.9, 1.4);
      const m = new THREE.Mesh(this.geo(boxWorldUV(bw, bh, (len / n) * 1.25)), mat);
      m.position.set(px + this.r(-0.4, 0.4), bh / 2 - 0.2, pz + this.r(-0.4, 0.4));
      m.rotation.set(this.r(-0.06, 0.06), rot + this.r(-0.12, 0.12), this.r(-0.06, 0.06));
      m.castShadow = true;
      m.receiveShadow = true;
      this.add(m);
    }
    this.collideRect((x1 + x2) / 2, (z1 + z2) / 2, thick, len, rot);
  }

  /** Lava pool / channel: glowing, impassable. */
  lava(x1: number, z1: number, x2: number, z2: number, width: number): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    this.patch('dry_ground_rocks', 3, cx, cz, width + 3, len + 2, rot, 0x3a2a24);
    const tex = lavaTexture();
    const t2 = tex.clone();
    t2.needsUpdate = true;
    t2.repeat.set(Math.max(1, width / 8), Math.max(1, len / 8));
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a0c06, map: t2, emissive: 0xff4a12, emissiveMap: t2, emissiveIntensity: 2.2, roughness: 0.85 });
    this.ownedMats.push(mat);
    const m = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(width, len)), mat);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.position.set(cx, 0.07, cz);
    m.name = 'lava';
    this.add(m);
    this.collideRect(cx, cz, width - 0.4, len, rot);
    for (let t = -len / 2; t <= len / 2; t += Math.max(3, width / 2)) this.clear(cx + Math.sin(rot) * t, cz + Math.cos(rot) * t, width / 2 + 1);
    if (this.lights.length < 4 && this.rng() < 0.6) {
      const l = new THREE.PointLight(0xff6a20, 8, 16, 1.8);
      l.position.set(cx, 1.5, cz);
      l.userData.flicker = true;
      this.add(l);
      this.lights.push(l);
    }
  }

  /** Hedge wall (maze). */
  hedge(x1: number, z1: number, x2: number, z2: number, h = 2.6): void {
    this.wall(x1, z1, x2, z2, h, 'forest_leaves_02', 1.1, 0x4a6a32);
  }

  /** ISO shipping container (optionally stacked). */
  container(x: number, z: number, rot: number, tint: number, stack = 1, open = false): void {
    const w = 2.8;
    const h = 2.95;
    const d = 7.0;
    const side = pbr('container_side', 2.6, { tint, rough: 0.8, metal: 0.4 });
    const top = pbr('corrugated_iron', 2.5, { tint, metal: 0.4 });
    for (let k = 0; k < stack; k++) {
      const m = new THREE.Mesh(this.geo(boxWorldUV(w, h, d)), [side, side, top, side, side, open && k === 0 ? pbr('rust_coarse_01', 2) : side]);
      m.position.set(x, h / 2 + k * h, z);
      m.rotation.y = rot + (k ? this.r(-0.06, 0.06) : 0);
      m.castShadow = true;
      m.receiveShadow = true;
      this.add(m);
    }
    this.collideRect(x, z, w, d, rot);
  }

  /** Two-high sandbag wall. */
  sandbags(x1: number, z1: number, x2: number, z2: number): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    const bag = this.geo(new RoundedBoxGeometry(0.52, 0.24, 0.82, 4, 0.1));
    const mat = pbr('hessian_230', 0.5, { tint: 0xa99c7c, normal: 1.8 });
    const n = Math.max(1, Math.round(len / 0.9));
    const rows = 3;
    const inst = new THREE.InstancedMesh(bag, mat, n * rows * 2);
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < n; c++)
        for (const lane of [-0.33, 0.33]) {
          if (r === rows - 1 && lane > 0) {
            m4.makeScale(0, 0, 0);
            inst.setMatrixAt(i++, m4);
            continue;
          }
          const k = (c + 0.5 + (r % 2) * 0.5) / n - 0.5;
          if (k > 0.5) {
            m4.makeScale(0, 0, 0);
            inst.setMatrixAt(i++, m4);
            continue;
          }
          const px = (x1 + x2) / 2 + Math.sin(rot) * k * len + Math.cos(rot) * lane;
          const pz = (z1 + z2) / 2 + Math.cos(rot) * k * len - Math.sin(rot) * lane;
          const sc = this.r(0.9, 1.05);
          m4.compose(
            new THREE.Vector3(px, 0.12 + r * 0.22, pz),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(this.r(-0.08, 0.08), rot + this.r(-0.14, 0.14), this.r(-0.08, 0.08))),
            new THREE.Vector3(sc, this.r(0.85, 1.1), sc),
          );
          inst.setMatrixAt(i++, m4);
        }
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.add(inst);
    this.collideRect((x1 + x2) / 2, (z1 + z2) / 2, 1.3, len, rot);
  }

  /** Chain-link fence with posts. */
  fence(x1: number, z1: number, x2: number, z2: number, h = 2.6): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const rot = Math.atan2(x2 - x1, z2 - z1);
    const t = chainlinkTex().clone();
    t.repeat.set(len / 0.45, h / 0.45);
    t.needsUpdate = true;
    const mesh = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.5, color: 0x9aa0a4 });
    this.ownedMats.push(mesh);
    const p = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(len, h)), mesh);
    p.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
    p.rotation.y = rot + Math.PI / 2;
    p.castShadow = true;
    this.add(p);
    const post = this.geo(new THREE.CylinderGeometry(0.05, 0.05, h + 0.1, 6));
    const pm = new THREE.MeshStandardMaterial({ color: 0x6b7075, metalness: 0.8, roughness: 0.45 });
    this.ownedMats.push(pm);
    const n = Math.ceil(len / 3);
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const m = new THREE.Mesh(post, pm);
      m.position.set(x1 + (x2 - x1) * k, (h + 0.1) / 2, z1 + (z2 - z1) * k);
      m.castShadow = true;
      this.add(m);
    }
    this.collideRect((x1 + x2) / 2, (z1 + z2) / 2, 0.3, len, rot);
  }

  /** Conifer tree (instanced in finishProps). */
  tree(x: number, z: number, h = 9, snow = false): void {
    this.trees.push({ x, z, h: h * this.r(0.85, 1.15), rot: this.r(0, 6.28), snow });
    this.colliders.push(makeAabb(x, z, 0.4, 0.4));
  }

  private buildTrees(): void {
    if (!this.trees.length) return;
    const bark = pbr('dark_wooden_planks', 1.2, { tint: 0x6b5a4a });
    const trunkGeo = this.geo(new THREE.CylinderGeometry(0.12, 0.24, 1, 7).translate(0, 0.5, 0));
    const coneGeo = this.geo(new THREE.ConeGeometry(1, 1, 10, 1, true).translate(0, 0.5, 0));
    const green = pbr('forest_leaves_02', 1.4, { tint: 0x3a5230, normal: 1.4 });
    const snowy = pbr('forest_leaves_02', 1.4, { tint: 0xc5cdc8, normal: 1.2 });
    for (const snow of [false, true]) {
      const list = this.trees.filter((t) => t.snow === snow);
      if (!list.length) continue;
      const trunk = new THREE.InstancedMesh(trunkGeo, bark, list.length);
      const tiers = new THREE.InstancedMesh(coneGeo, snow ? snowy : green, list.length * 4);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
        m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(1 + t.h * 0.04, t.h * 0.55, 1 + t.h * 0.04));
        trunk.setMatrixAt(i, m4);
        for (let k = 0; k < 4; k++) {
          const r0 = t.h * (0.34 - k * 0.065);
          const ch = t.h * 0.34;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot + k * 1.3);
          m4.compose(new THREE.Vector3(t.x, t.h * 0.3 + k * t.h * 0.17, t.z), q, new THREE.Vector3(r0, ch, r0));
          tiers.setMatrixAt(i * 4 + k, m4);
        }
      });
      for (const im of [trunk, tiers]) {
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.add(im);
      }
    }
  }

  // ---------------------------------------------------------------- props
  prop(id: PropId, x: number, z: number, o: { rot?: number; scale?: number; y?: number; tint?: number; collide?: boolean; tilt?: number } = {}): void {
    // about half the free-standing fuel barrels / gas tanks can be shot (same pick on every co-op client)
    if ((id === 'barrel' || id === 'propane' || id === 'lpg') && o.collide !== false && !o.y && (o.scale ?? 1) < 1.6 && spotHash(x, z) < 0.55) {
      this.interact.push({ x, z, rot: o.rot ?? 0, kind: id === 'barrel' ? 'barrel' : 'gas' });
      return;
    }
    const list = this.placements.get(id) ?? [];
    list.push({ x, y: o.y ?? 0, z, rot: o.rot ?? this.r(0, Math.PI * 2), scale: (o.scale ?? 1) * this.r(0.92, 1.08), tint: o.tint, tilt: o.tilt });
    this.placements.set(id, list);
    if (o.collide === false) (list[list.length - 1] as Placement & { nocol?: boolean }).nocol = true;
  }

  /** Random props inside a rectangle, avoiding keep-out zones and colliders. */
  scatter(ids: readonly PropId[], count: number, x0: number, z0: number, x1: number, z1: number, pad = 1.2): void {
    let tries = 0;
    let n = 0;
    while (n < count && tries++ < count * 12) {
      const x = this.r(x0, x1);
      const z = this.r(z0, z1);
      if (!this.isClear(x, z, pad)) continue;
      this.prop(this.pick(ids), x, z);
      n++;
    }
  }

  /** Small clutter cluster (trash, tyres, boxes) around a point. */
  clutter(x: number, z: number, ids: readonly PropId[], n = 4, r = 2): void {
    for (let i = 0; i < n; i++) this.prop(this.pick(ids), x + this.r(-r, r), z + this.r(-r, r), { collide: false });
  }

  /** Point light + fake light pool (only `real` ones cost per-pixel lighting). */
  lamp(x: number, z: number, color = 0xffc98a, real = false, withPole = true): void {
    if (withPole) this.prop('lamp', x, z, { rot: this.r(0, 6.28) });
    poolTex ??= radialTex('rgba(255,255,255,0.32)', 'rgba(255,255,255,0)');
    const m = new THREE.Mesh(this.geo(new THREE.CircleGeometry(4.5, 24)), new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.ownedMats.push(m.material as THREE.Material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.04, z);
    this.add(m);
    if (real && this.lights.length < 3) {
      const l = new THREE.PointLight(color, 14, 16, 1.8);
      l.position.set(x, 4.5, z);
      this.add(l);
      this.lights.push(l);
    }
  }

  /** Burning barrel / campfire flicker light. */
  fire(x: number, z: number): THREE.PointLight | null {
    this.prop('barrel_rust', x, z);
    if (this.lights.length >= 4) return null;
    const l = new THREE.PointLight(0xff7a2a, 10, 12, 1.6);
    l.position.set(x, 1.8, z);
    l.userData.flicker = true;
    this.add(l);
    this.lights.push(l);
    return l;
  }

  /** Instantiate all prop placements (async, per-map prop set). */
  async finishProps(): Promise<void> {
    const jobs = [...this.placements.entries()].map(async ([id, list]) => {
      const def = PROPS[id];
      let asset: PropAsset;
      try {
        asset = await loadProp(def.file);
      } catch (err) {
        console.warn('[map] prop failed', def.file, err);
        return;
      }
      const s0 = WORLD * (def.scale ?? 1);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3();
      const placementMats = list.map((p) => {
        const s = s0 * p.scale;
        e.set(p.tilt ?? 0, p.rot, 0, 'YXZ');
        q.setFromEuler(e);
        v.set(p.x, p.y - asset.minY * s, p.z);
        sc.set(s, s, s);
        return new THREE.Matrix4().compose(v, q, sc);
      });
      // chunk placements on a 56 m grid so frustum culling works per chunk
      const chunks = new Map<string, number[]>();
      list.forEach((p, i) => {
        const key = `${Math.floor(p.x / 56)},${Math.floor(p.z / 56)}`;
        const c = chunks.get(key) ?? [];
        c.push(i);
        chunks.set(key, c);
      });
      const tall = asset.size.y * s0 > 1.1;
      for (const part of asset.parts) {
        for (const idxs of chunks.values()) {
          const inst = new THREE.InstancedMesh(part.geo, part.mat, idxs.length);
          let tinted = false;
          idxs.forEach((pi, k) => {
            m4.multiplyMatrices(placementMats[pi]!, part.local);
            inst.setMatrixAt(k, m4);
            if (list[pi]!.tint != null) tinted = true;
          });
          if (tinted) {
            idxs.forEach((pi, k) => inst.setColorAt(k, new THREE.Color(list[pi]!.tint ?? 0xffffff)));
            inst.instanceColor!.needsUpdate = true;
          }
          inst.castShadow = tall;
          inst.receiveShadow = true;
          inst.computeBoundingSphere();
          this.add(inst);
        }
      }
      if (def.collide) {
        const pad = def.pad ?? 0.9;
        list.forEach((p) => {
          if ((p as Placement & { nocol?: boolean }).nocol) return;
          const s = s0 * p.scale;
          const w = asset.size.x * s * pad;
          const d = asset.size.z * s * pad;
          if (Math.max(w, d) < 0.35) return;
          // footprint centre in world space
          const cx = asset.center.x * s;
          const cz = asset.center.z * s;
          const c = Math.cos(p.rot);
          const sn = Math.sin(p.rot);
          this.collideRect(p.x + cx * c + cz * sn, p.z - cx * sn + cz * c, w, d, p.rot);
        });
      }
    });
    this.buildTrees();
    const win = this.geo(new THREE.PlaneGeometry(1.3, 1.5));
    const glass = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.15, metalness: 0.6 });
    const lit = new THREE.MeshStandardMaterial({ color: 0x1a140c, emissive: 0xffb45e, emissiveIntensity: 0.55, roughness: 0.4 });
    this.ownedMats.push(glass, lit);
    for (const [list, mat] of [[this.winGlass, glass], [this.winLit, lit]] as const) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(win, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere();
      this.add(im);
    }
    await Promise.all(jobs);
  }

  /**
   * Hand-built set piece (ferris wheel, tent…): added to the map, its geometries and
   * materials are freed with the map. Optional box colliders in world space.
   */
  custom(o: THREE.Object3D, colliders: ReadonlyArray<readonly [x: number, z: number, w: number, d: number, rot?: number]> = []): THREE.Object3D {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry) this.owned.push(m.geometry);
      if (m.material) for (const mm of Array.isArray(m.material) ? m.material : [m.material]) this.ownedMats.push(mm);
    });
    this.add(o);
    for (const [x, z, w, d, rot] of colliders) this.collideRect(x, z, w, d, rot ?? 0);
    return o;
  }

  /** Real point light, respecting the per-map light budget. */
  pointLight(x: number, y: number, z: number, color: number, intensity: number, range: number, flicker = false): THREE.PointLight | null {
    if (this.lights.length >= 4) return null;
    const l = new THREE.PointLight(color, intensity, range, 1.8);
    l.position.set(x, y, z);
    if (flicker) l.userData.flicker = true;
    this.add(l);
    this.lights.push(l);
    return l;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.owned.forEach((g) => g.dispose());
    this.ownedMats.forEach((m) => m.dispose());
  }
}
