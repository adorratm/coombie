import * as THREE from 'three';
import type { HumanoidRig } from './humanoidRig';
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
const propMats = new Map<string, THREE.Material>();
const pm = (color: number, opts: { rough?: number; metal?: number; glow?: boolean } = {}) => {
  const k = `${color}|${opts.rough ?? 0.85}|${opts.metal ?? 0}|${opts.glow ? 1 : 0}`;
  let m = propMats.get(k);
  if (!m) {
    m = opts.glow
      ? new THREE.MeshBasicMaterial({ color, toneMapped: false })
      : new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0 });
    propMats.set(k, m);
  }
  return m;
};
const boxGeo = new Map<string, THREE.BoxGeometry>();
const bx = (w: number, h: number, d: number) => {
  const k = `${w}|${h}|${d}`;
  let g = boxGeo.get(k);
  if (!g) boxGeo.set(k, (g = new THREE.BoxGeometry(w, h, d)));
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

function buildBackpack(tier: number, fabric: number): THREE.Group {
  const g = new THREE.Group();
  const w = [0, 30, 34, 38][tier]!, h = [0, 36, 46, 56][tier]!, d = [0, 13, 17, 21][tier]!;
  const cloth = pm(fabric);
  const dark = pm(0x16181a);
  part(bx(w, h, d), cloth, 0, 0, -d / 2, g);
  part(bx(w * 0.8, h * 0.38, 4), cloth, 0, -h * 0.2, -d - 2, g); // front pouch
  part(bx(w * 1.02, 3, d * 1.02), dark, 0, h * 0.18, -d / 2, g); // compression strap
  for (const sx of [-1, 1]) {
    part(bx(4, h * 0.95, 2), dark, sx * w * 0.3, 2, 1.5, g); // shoulder straps (against the back)
    if (tier >= 2) part(bx(6, h * 0.45, d * 0.7), cloth, sx * (w / 2 + 3), -h * 0.15, -d / 2, g); // side pouches
  }
  if (tier >= 3) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, w * 1.05, 12), pm(0x3a4a2a));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, h / 2 + 6, -d / 2);
    roll.castShadow = true;
    g.add(roll);
  }
  return g;
}

/** Apply costume + accessories to a freshly instantiated operative rig. */
export function applyCosmetics(rig: HumanoidRig, cos: Cosmetics): () => void {
  const owned: THREE.Material[] = [];
  const props: THREE.Object3D[] = [];
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
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(17, 2, 6, 24), pm(0x1b1d1f));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.05, 0.78, 1);
    g.add(ring);
    for (const a of [-0.9, -0.35, 0.35, 0.9, 2.6]) part(bx(6, 7, 4), pm(0x3a3f2e), Math.sin(a) * 17, -2, Math.cos(a) * 13.5, g);
    part(bx(5, 4, 1), pm(0x8a8f94, { metal: 0.8, rough: 0.3 }), 0, 0, 13.5, g); // buckle
    if (mount(rig, 'hips', g, new THREE.Vector3(hips.x, hips.y + 4, hips.z))) props.push(g);
  }
  const rThigh = bonePos(rig, 'rightUpperLeg');
  if (acc.has('holster') && rThigh) {
    const g = new THREE.Group();
    part(bx(5, 20, 11), pm(0x15171a), 0, 0, 0, g);
    part(bx(4, 6, 8), pm(0x2a2d30), 0, 11, 1, g);
    part(bx(7, 2, 13), pm(0x1b1d1f), 0, 6, 0, g);
    if (mount(rig, 'rightUpperLeg', g, new THREE.Vector3(rThigh.x - 9, rThigh.y - 18, rThigh.z + 1))) props.push(g);
  }
  if (acc.has('chest_rig') && chest) {
    const g = new THREE.Group();
    part(bx(30, 30, 5), pm(cos.costume?.primary ?? 0x3a402e), 0, 0, 0, g);
    for (const x of [-8, 0, 8]) part(bx(6.5, 10, 4), pm(0x2a2e22), x, -9, 4, g);
    part(bx(26, 3, 6), pm(0x1b1d1f), 0, 6, 0.5, g);
    if (mount(rig, 'upperChest', g, new THREE.Vector3(0, chest.y - 9, chest.z + 13))) props.push(g);
  }
  if (acc.has('kneepads')) {
    for (const side of ['left', 'right'] as const) {
      const knee = bonePos(rig, `${side}LowerLeg`);
      if (!knee) continue;
      const pad = new THREE.Mesh(bx(9, 10, 4), pm(0x1b1d1f, { rough: 0.6 }));
      pad.castShadow = true;
      if (mount(rig, `${side}LowerLeg`, pad, new THREE.Vector3(knee.x, knee.y - 3, knee.z + 7))) props.push(pad);
    }
  }
  const head = bonePos(rig, 'head');
  if (acc.has('headlamp') && head) {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(9.5, 1, 6, 20), pm(0x15171a));
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3.5, 12), pm(0x2a2d30, { metal: 0.5, rough: 0.4 }));
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0, 10);
    g.add(body);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(2.2, 12), pm(0xfff4c8, { glow: true }));
    lens.position.set(0, 0, 11.9);
    g.add(lens);
    if (mount(rig, 'head', g, new THREE.Vector3(head.x, head.y + 9, head.z + 1))) props.push(g);
  }

  return () => {
    owned.forEach((m) => m.dispose());
    props.forEach((p) => p.removeFromParent());
  };
}
