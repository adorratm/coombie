import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadRigTemplate, type HumanoidRig } from './humanoidRig';
import type { AccessoryId, CostumeDef } from './loadout';

/**
 * Operative cosmetics on Rocketbox rigs:
 *  - costume palette: clothing texels are pulled toward a 2-tone palette in the shader
 *    (skin and everything above the neck keep their texture, so faces/hair stay intact);
 *  - accessories + backpack tiers: small procedural props attached to raw bones in the
 *    bind pose (positions are authored in model centimetres, facing +Z).
 */

export interface Cosmetics {
  costume?: CostumeDef;
  accessories?: AccessoryId[];
  backpack?: number;
  gender?: 'male' | 'female';
}

const HEAD = /* glsl */ `
varying vec3 vCzp;
uniform vec3 uCPrim;
uniform vec3 uCSec;
uniform vec3 uCGlow;
uniform float uCStr;
uniform float uCNeck;
`;

const BODY = /* glsl */ `
{
  vec3 c = diffuseColor.rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float skin = clamp((c.r - c.b) * 3.2, 0.0, 1.0) * clamp((c.r - c.g) * 7.0, 0.0, 1.0) * step(0.12, lum);
  float body = 1.0 - smoothstep(uCNeck - 4.0, uCNeck + 2.0, vCzp.y);
  float cloth = (1.0 - skin) * body;
  vec3 tint = mix(uCSec, uCPrim, smoothstep(0.05, 0.42, lum)) * (0.78 + lum * 0.9);
  diffuseColor.rgb = mix(c, tint, cloth * uCStr);
  vCClothMask = cloth;
}
`;

function costumeMaterial(src: THREE.MeshStandardMaterial, c: CostumeDef, neckY: number): THREE.MeshStandardMaterial {
  const m = src.clone();
  const col = (hex: number | null) => new THREE.Color(hex ?? 0xffffff);
  const prim = col(c.primary);
  const uniforms = {
    uCPrim: { value: new THREE.Vector3(prim.r, prim.g, prim.b) },
    uCSec: { value: new THREE.Vector3().setFromColor(col(c.secondary)) },
    uCGlow: { value: new THREE.Vector3().setFromColor(col(c.glow ?? 0)) },
    uCStr: { value: c.strength },
    uCNeck: { value: neckY },
  };
  if (!c.glow) uniforms.uCGlow.value.set(0, 0, 0);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCzp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCzp = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEAD}\nfloat vCClothMask = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${BODY}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // thin piping: two horizontal seams per ~25cm + a vertical seam on the sides
          float band = smoothstep(0.985, 0.998, sin(vCzp.y * 0.25) * 0.5 + 0.5) + smoothstep(0.99, 0.999, sin(vCzp.x * 0.35 + 1.3) * 0.5 + 0.5) * 0.6;
          totalEmissiveRadiance += uCGlow * band * vCClothMask * 0.9;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'protocolz-costume-v1';
  return m;
}

// ---------------------------------------------------------------- props
/** Procedural nylon/cordura weave: albedo noise + normal map (generated once, 256²). */
let fabricTex: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
function fabricTextures() {
  if (fabricTex) return fabricTex;
  const N = 256;
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // over-under weave: threads every 4px, alternate which direction is on top
      const cx = x % 8, cy = y % 8;
      const warp = Math.sin(((x % 4) / 4) * Math.PI);
      const weft = Math.sin(((y % 4) / 4) * Math.PI);
      const top = (cx < 4) === (cy < 4) ? warp : weft;
      h[y * N + x] = 0.55 * top + 0.3 * Math.random() * 0.4 + 0.15 * Math.sin(x * 0.07 + y * 0.03);
    }
  const mk = () => Object.assign(document.createElement('canvas'), { width: N, height: N });
  const cMap = mk(), cNor = mk();
  const im = cMap.getContext('2d')!.createImageData(N, N);
  const nm = cNor.getContext('2d')!.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const v = 150 + h[i]! * 80 + (Math.random() - 0.5) * 18;
      im.data.set([v, v, v, 255], i * 4);
      const dx = h[y * N + ((x + 1) % N)]! - h[y * N + ((x + N - 1) % N)]!;
      const dy = h[((y + 1) % N) * N + x]! - h[((y + N - 1) % N) * N + x]!;
      const n = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize();
      nm.data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], i * 4);
    }
  cMap.getContext('2d')!.putImageData(im, 0, 0);
  cNor.getContext('2d')!.putImageData(nm, 0, 0);
  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(cNor);
  for (const t of [map, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    t.anisotropy = 4;
  }
  fabricTex = { map, normal };
  return fabricTex;
}

const propMats = new Map<string, THREE.Material>();
type PropKind = 'fabric' | 'webbing' | 'metal' | 'rubber' | 'glow';
const pm = (color: number, kind: PropKind | { rough?: number; metal?: number; glow?: boolean } = 'fabric') => {
  const k = `${color}|${JSON.stringify(kind)}`;
  let m = propMats.get(k);
  if (m) return m;
  if (typeof kind !== 'string') kind = kind.glow ? 'glow' : (kind.metal ?? 0) > 0.3 ? 'metal' : 'rubber';
  if (kind === 'glow') m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  else if (kind === 'metal') m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.85 });
  else if (kind === 'rubber') m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
  else {
    const t = fabricTextures();
    m = new THREE.MeshStandardMaterial({
      color,
      map: t.map,
      normalMap: t.normal,
      normalScale: new THREE.Vector2(kind === 'webbing' ? 0.9 : 0.6, kind === 'webbing' ? 0.9 : 0.6),
      roughness: 0.92,
      metalness: 0,
    });
  }
  propMats.set(k, m);
  return m;
};
const boxGeo = new Map<string, THREE.BufferGeometry>();
/** rounded box (r = corner radius, cm) — fabric reads as padded instead of a crate */
const bx = (w: number, h: number, d: number, r = 0) => {
  const k = `${w}|${h}|${d}|${r}`;
  let g = boxGeo.get(k);
  if (!g) boxGeo.set(k, (g = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)) : new THREE.BoxGeometry(w, h, d)));
  return g;
};

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Place `prop` at a model-space position, then re-parent to `bone` keeping that transform. */
function mount(rig: HumanoidRig, boneName: string, prop: THREE.Object3D, at: THREE.Vector3): boolean {
  const bone = rig.bone(boneName);
  if (!bone) return false;
  rig.scene.updateMatrixWorld(true);
  prop.position.copy(at);
  rig.scene.add(prop);
  prop.updateMatrixWorld(true);
  bone.attach(prop);
  return true;
}

function bonePos(rig: HumanoidRig, name: string): THREE.Vector3 | null {
  const b = rig.bone(name);
  if (!b) return null;
  rig.scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(rig.scene.matrixWorld).invert();
  return b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
}

export function buildBackpack(tier: number, fabric: number): THREE.Group {
  const g = new THREE.Group();
  const w = [0, 28, 32, 36][tier]!, h = [0, 38, 48, 58][tier]!, d = [0, 14, 18, 22][tier]!;
  const cloth = pm(fabric, 'fabric');
  const web = pm(0x1c1e1c, 'webbing');
  const metal = pm(0x2a2c2e, 'metal');
  const plastic = pm(0x121314, 'rubber');
  // main body (padded) + lid
  part(bx(w, h, d, 4.5), cloth, 0, 0, -d / 2, g);
  part(bx(w * 0.96, 7, d * 1.04, 3), cloth, 0, h / 2 - 2.5, -d / 2 - 0.4, g);
  // front admin pouch with zipper + MOLLE rows
  const pouchD = 4 + tier;
  part(bx(w * 0.78, h * 0.42, pouchD, 2.2), cloth, 0, -h * 0.17, -d - pouchD / 2 + 1, g);
  part(bx(w * 0.7, 0.6, 0.6), plastic, 0, -h * 0.17 + h * 0.2, -d - pouchD + 0.9, g); // zipper
  for (let r = 0; r < 2 + tier; r++) part(bx(w * 0.86, 1.4, 0.8), web, 0, h * 0.05 + r * 3.2, -d - 0.1, g);
  // compression straps with side-release buckles
  for (const sy of [-0.28, 0.12]) {
    part(bx(w * 1.03, 2.4, d * 1.05, 0.6), web, 0, h * sy, -d / 2, g);
    for (const sx of [-1, 1]) part(bx(1.2, 3.2, 3), plastic, sx * (w / 2 + 0.4), h * sy, -d * 0.75, g);
  }
  // shoulder straps (padded, against the back) + sternum strap + metal D-rings
  for (const sx of [-1, 1]) {
    const strap = part(bx(5, h * 0.9, 2.2, 1), web, sx * w * 0.28, 0, 1.4, g);
    strap.rotation.z = sx * 0.06;
    part(bx(2, 2.6, 0.8), metal, sx * w * 0.28, h * 0.22, 2.7, g);
    if (tier >= 2) part(bx(7, h * 0.48, d * 0.72, 2.4), cloth, sx * (w / 2 + 3.6), -h * 0.12, -d / 2, g); // side pouches
  }
  part(bx(w * 0.6, 1.6, 0.8), web, 0, h * 0.14, 2.8, g);
  // top grab handle
  const handle = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.7, 6, 12, Math.PI), web);
  handle.position.set(0, h / 2 + 1, -d * 0.35);
  handle.castShadow = true;
  g.add(handle);
  if (tier >= 3) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, w * 1.05, 16), pm(0x3e4a2c, 'fabric'));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, h / 2 + 7.5, -d / 2);
    roll.castShadow = true;
    g.add(roll);
    for (const sx of [-0.3, 0.3]) part(bx(1.6, 14, 14.5, 0.4), web, sx * w, h / 2 + 7.5, -d / 2, g);
  }
  return g;
}

// ---------------------------------------------------------------- small procedural accessories
export function buildBelt(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(17, 2, 8, 32), pm(0x1b1d1f, 'webbing'));
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1.05, 0.78, 1);
  g.add(ring);
  for (const a of [-0.9, -0.35, 0.35, 0.9, 2.6]) part(bx(6, 7.5, 4, 1.4), pm(0x3a3f2e, 'fabric'), Math.sin(a) * 17, -2, Math.cos(a) * 13.5, g);
  part(bx(5, 4, 1, 0.3), pm(0x8a8f94, 'metal'), 0, 0, 13.5, g); // buckle
  return g;
}
export function buildHolster(): THREE.Group {
  const g = new THREE.Group();
  part(bx(5, 20, 11, 1.6), pm(0x15171a, 'rubber'), 0, 0, 0, g);
  part(bx(4, 6, 8, 1), pm(0x2a2d30, 'metal'), 0, 11, 1, g); // pistol butt
  part(bx(7, 2, 13, 0.5), pm(0x1b1d1f, 'webbing'), 0, 6, 0, g);
  return g;
}
export function buildKneepad(): THREE.Mesh {
  const pad = new THREE.Mesh(bx(9, 10, 4, 1.8), pm(0x1b1d1f, 'rubber'));
  pad.castShadow = true;
  return pad;
}
export function buildHeadlamp(): THREE.Group {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(9.5, 1, 6, 20), pm(0x15171a, 'webbing'));
  band.rotation.x = Math.PI / 2;
  g.add(band);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3.5, 12), pm(0x2a2d30, 'metal'));
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, 10);
  g.add(body);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(2.2, 12), pm(0xfff4c8, 'glow'));
  lens.position.set(0, 0, 11.9);
  g.add(lens);
  return g;
}

// ---------------------------------------------------------------- Rocketbox gear (skinned)
/** gear id → GLB per body type (extracted from Rocketbox avatars by convert-rocketbox --part) */
const GEAR_FILES: Record<string, string> = {
  helmet_mil: 'helmet_mil',
  helmet_swat: 'helmet_swat',
  helmet_fire: 'helmet_fire',
  chest_rig: 'vest_mil',
  vest_swat: 'vest_swat',
};
export const gearUrl = (id: string, gender: 'male' | 'female') => (GEAR_FILES[id] ? `/avatars/rb/gear/${GEAR_FILES[id]}_${gender === 'female' ? 'f' : 'm'}.glb` : null);

/** Re-skin a gear mesh onto the target rig: same Biped bone names, gear's own inverse binds. */
async function attachGear(rig: HumanoidRig, url: string): Promise<THREE.Object3D[]> {
  const tpl = await loadRigTemplate(url);
  const inst = cloneSkinned(tpl.scene);
  const byName = new Map<string, THREE.Bone>();
  let host: THREE.Object3D | null = null;
  rig.scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone);
    if (!host && (o as THREE.SkinnedMesh).isSkinnedMesh) host = o.parent;
  });
  const out: THREE.Object3D[] = [];
  const meshes: THREE.SkinnedMesh[] = [];
  inst.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  for (const m of meshes) {
    const bones = m.skeleton.bones.map((b) => byName.get(b.name));
    if (bones.some((b) => !b)) continue;
    const sk = new THREE.Skeleton(bones as THREE.Bone[], m.skeleton.boneInverses);
    m.removeFromParent();
    (host ?? rig.scene).add(m);
    m.position.set(0, 0, 0);
    m.quaternion.identity();
    m.scale.set(1, 1, 1);
    m.bind(sk, m.bindMatrix);
    m.frustumCulled = false;
    m.castShadow = true;
    out.push(m);
  }
  return out;
}

/** Apply costume + accessories to a freshly instantiated operative rig. */
export async function applyCosmetics(rig: HumanoidRig, cos: Cosmetics): Promise<() => void> {
  const owned: THREE.Material[] = [];
  const props: THREE.Object3D[] = [];
  // realistic skinned gear first, so the costume palette recolours it with the outfit
  const gender = cos.gender ?? 'male';
  const gearJobs = (cos.accessories ?? []).map((id) => gearUrl(id, gender)).filter((u): u is string => !!u);
  const gearMeshes = (await Promise.all(gearJobs.map((u) => attachGear(rig, u).catch(() => [])))).flat();
  props.push(...gearMeshes);
  const neck = bonePos(rig, 'neck');
  const neckY = neck ? neck.y : 145;

  if (cos.costume && cos.costume.primary !== null) {
    rig.scene.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat?.isMeshStandardMaterial) return;
      const m = costumeMaterial(mat, cos.costume!, neckY);
      mesh.material = m;
      owned.push(m);
    });
  }

  const fabric = cos.costume?.secondary ?? 0x2f3528;
  const chest = bonePos(rig, 'upperChest') ?? bonePos(rig, 'chest');
  const hips = bonePos(rig, 'hips');

  if (cos.backpack && cos.backpack > 0 && chest) {
    const bp = buildBackpack(cos.backpack, fabric);
    if (mount(rig, 'upperChest', bp, new THREE.Vector3(0, chest.y - 8, chest.z - 9))) props.push(bp);
  }
  const acc = new Set(cos.accessories ?? []);
  if (acc.has('belt') && hips) {
    const g = buildBelt();
    if (mount(rig, 'hips', g, new THREE.Vector3(hips.x, hips.y + 4, hips.z))) props.push(g);
  }
  const rThigh = bonePos(rig, 'rightUpperLeg');
  if (acc.has('holster') && rThigh) {
    const g = buildHolster();
    if (mount(rig, 'rightUpperLeg', g, new THREE.Vector3(rThigh.x - 9, rThigh.y - 18, rThigh.z + 1))) props.push(g);
  }
  if (acc.has('kneepads')) {
    for (const side of ['left', 'right'] as const) {
      const knee = bonePos(rig, `${side}LowerLeg`);
      if (!knee) continue;
      const pad = buildKneepad();
      if (mount(rig, `${side}LowerLeg`, pad, new THREE.Vector3(knee.x, knee.y - 3, knee.z + 7))) props.push(pad);
    }
  }
  const head = bonePos(rig, 'head');
  if (acc.has('headlamp') && head) {
    const g = buildHeadlamp();
    if (mount(rig, 'head', g, new THREE.Vector3(head.x, head.y + 9, head.z + 1))) props.push(g);
  }

  return () => {
    owned.forEach((m) => m.dispose());
    props.forEach((p) => p.removeFromParent());
  };
}
