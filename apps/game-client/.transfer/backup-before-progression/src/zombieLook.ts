import * as THREE from 'three';
import type { ZombieKind } from './zombieKinds';
import type { HumanoidRig } from './humanoidRig';

/**
 * "Infected" look for civilian Rocketbox avatars — each kind gets its own skin rot,
 * blood pattern, bile veins, eye glow and silhouette so the horde reads at a glance
 * from the top-down camera.
 *
 * Done in the material (no extra textures): the shader drains colour, turns skin-hued
 * texels into dead flesh, adds grime and blood splatter from 3D noise in bind space
 * (so the stains stick to the body while it animates), and bile veins for acid/screamer/boss.
 * Each instance gets a material clone (same program, shared textures) so hurt flashes and
 * per-zombie variation stay per zombie.
 */

export interface ZombieLookDef {
  skin: [number, number, number];
  desat: number;
  blood: number;
  bile: [number, number, number];
  eye: number;
  /** uniform bone scales for a kind-specific silhouette (raw humanoid bone → scale) */
  bones?: Partial<Record<'upperChest' | 'chest' | 'head' | 'leftUpperArm' | 'rightUpperArm' | 'neck', number>>;
  /** root scale multipliers (x/z for bulk or thinness) */
  girth?: number;
  pool: string[];
}

export const ZOMBIE_LOOKS: Record<ZombieKind, ZombieLookDef> = {
  grunt: {
    skin: [0.56, 0.6, 0.47],
    desat: 0.55,
    blood: 0.45,
    bile: [0, 0, 0],
    eye: 0xffb020,
    pool: ['grunt_a', 'grunt_b', 'grunt_c', 'grunt_d'],
  },
  runner: {
    skin: [0.62, 0.57, 0.52],
    desat: 0.45,
    blood: 0.65,
    bile: [0, 0, 0],
    eye: 0x22d3ee,
    girth: 0.92,
    bones: { head: 0.95 },
    pool: ['runner_a', 'runner_b'],
  },
  tank: {
    skin: [0.5, 0.44, 0.4],
    desat: 0.5,
    blood: 0.5,
    bile: [0.25, 0.08, 0.02],
    eye: 0xff7a1a,
    girth: 1.18,
    bones: { upperChest: 1.16, leftUpperArm: 1.12, rightUpperArm: 1.12, head: 0.86 },
    pool: ['tank'],
  },
  acid: {
    skin: [0.45, 0.6, 0.3],
    desat: 0.6,
    blood: 0.2,
    bile: [0.35, 0.95, 0.1],
    eye: 0x9cff2e,
    girth: 1.06,
    bones: { chest: 1.1 },
    pool: ['acid'],
  },
  screamer: {
    skin: [0.64, 0.6, 0.68],
    desat: 0.62,
    blood: 0.75,
    bile: [0.55, 0.08, 0.75],
    eye: 0xe040fb,
    girth: 0.9,
    bones: { neck: 1.12, head: 1.06 },
    pool: ['screamer'],
  },
  crawler: {
    skin: [0.55, 0.5, 0.45],
    desat: 0.6,
    blood: 0.85,
    bile: [0.2, 0.05, 0.02],
    eye: 0xff5a2a,
    girth: 0.9,
    pool: ['grunt_b', 'grunt_d', 'runner_a'],
  },
  bloater: {
    skin: [0.6, 0.64, 0.4],
    desat: 0.5,
    blood: 0.35,
    bile: [0.55, 0.9, 0.12],
    eye: 0xd9f99d,
    girth: 1.45,
    bones: { chest: 1.28, upperChest: 1.22, head: 0.92 },
    pool: ['grunt_a', 'grunt_c', 'acid'],
  },
  boss: {
    skin: [0.46, 0.3, 0.28],
    desat: 0.4,
    blood: 0.95,
    bile: [0.95, 0.18, 0.05],
    eye: 0xff2020,
    girth: 1.2,
    bones: { upperChest: 1.22, leftUpperArm: 1.18, rightUpperArm: 1.18, head: 0.84 },
    pool: ['boss'],
  },
  stalker: {
    skin: [0.34, 0.35, 0.37],
    desat: 0.8,
    blood: 0.55,
    bile: [0.05, 0.05, 0.08],
    eye: 0xf0f4ff,
    girth: 0.88,
    bones: { head: 0.95, neck: 1.08 },
    pool: ['runner_a', 'runner_b'],
  },
  burner: {
    skin: [0.2, 0.16, 0.14],
    desat: 0.3,
    blood: 0.35,
    bile: [0.95, 0.4, 0.05],
    eye: 0xff8a20,
    pool: ['grunt_a', 'grunt_c'],
  },
  riot: {
    skin: [0.52, 0.54, 0.48],
    desat: 0.6,
    blood: 0.5,
    bile: [0, 0, 0],
    eye: 0xffb020,
    girth: 1.12,
    bones: { upperChest: 1.1, chest: 1.08 },
    pool: ['grunt_b', 'grunt_d'],
  },
  hive: {
    skin: [0.66, 0.58, 0.44],
    desat: 0.45,
    blood: 0.6,
    bile: [0.75, 0.55, 0.1],
    eye: 0xd9c060,
    girth: 1.5,
    bones: { chest: 1.3, upperChest: 1.25, head: 0.9 },
    pool: ['grunt_a', 'acid'],
  },
  volt: {
    skin: [0.5, 0.56, 0.64],
    desat: 0.7,
    blood: 0.3,
    bile: [0.3, 0.6, 1.0],
    eye: 0x9fd8ff,
    pool: ['grunt_c', 'runner_b'],
  },
  hooker: {
    skin: [0.5, 0.2, 0.18],
    desat: 0.3,
    blood: 0.8,
    bile: [0.3, 0.9, 0.1],
    eye: 0x7cff3a,
    pool: [],
  },
};

export function zombieModelUrl(kind: ZombieKind): string {
  if (kind === 'hooker') return '/zombies/hooker/Zombie_Hooker.glb';
  const pool = ZOMBIE_LOOKS[kind]?.pool.length ? ZOMBIE_LOOKS[kind].pool : ZOMBIE_LOOKS.grunt.pool;
  const id = pool[Math.floor(Math.random() * pool.length)]!;
  return `/avatars/rb/zombie_${id}.glb`;
}

export function allZombieModelUrls(): string[] {
  const ids = new Set<string>();
  for (const def of Object.values(ZOMBIE_LOOKS)) def.pool.forEach((id) => ids.add(id));
  return [...ids].map((id) => `/avatars/rb/zombie_${id}.glb`);
}

const SHADER_HEAD = /* glsl */ `
varying vec3 vZp;
uniform vec3 uZSkin;
uniform vec3 uZBile;
uniform float uZDesat;
uniform float uZBlood;
uniform float uZSeed;
float zh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
float zn(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(zh(i), zh(i+vec3(1,0,0)), f.x), mix(zh(i+vec3(0,1,0)), zh(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(zh(i+vec3(0,0,1)), zh(i+vec3(1,0,1)), f.x), mix(zh(i+vec3(0,1,1)), zh(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float zfbm(vec3 p){ return zn(p)*0.55 + zn(p*2.07)*0.3 + zn(p*4.31)*0.15; }
`;

const SHADER_BODY = /* glsl */ `
{
  vec3 c = diffuseColor.rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float skin = clamp((c.r - c.b) * 3.2, 0.0, 1.0) * clamp((c.r - c.g) * 7.0, 0.0, 1.0) * step(0.12, lum);
  vec3 dead = uZSkin * (0.32 + lum * 1.25);
  c = mix(c, vec3(lum), uZDesat);
  c = mix(c, dead, skin * 0.92);
  vec3 p = vZp + uZSeed;
  float grime = zfbm(p * 0.045);
  c *= mix(0.42, 1.0, smoothstep(0.2, 0.78, grime));
  float h = vZp.y;
  float zone = smoothstep(100.0, 140.0, h) * (1.0 - smoothstep(162.0, 176.0, h));
  float b = zfbm(p * 0.085 + 7.3);
  // big soaked patches (chest / mouth zone) + small spatter everywhere
  float th = 0.74 - zone * 0.2 - uZBlood * 0.1;
  float soak = smoothstep(th, th + 0.04, b);
  float sp = zn(p * 0.6 + 3.1);
  float spatter = smoothstep(0.86 - uZBlood * 0.06, 0.9, sp) * (0.4 + zone);
  float blood = max(soak, spatter * 0.85);
  vec3 bloodCol = mix(vec3(0.09, 0.006, 0.004), vec3(0.26, 0.02, 0.012), b);
  c = mix(c, bloodCol, blood * 0.95);
  float vn = zn(p * 0.22);
  float vein = (smoothstep(0.47, 0.5, vn) - smoothstep(0.5, 0.53, vn));
  c += uZBile * vein * (0.35 + skin) * 0.7;
  diffuseColor.rgb = c;
}
`;

function zombifyMaterial(src: THREE.MeshStandardMaterial, def: ZombieLookDef, kind: ZombieKind): THREE.MeshStandardMaterial {
  const m = src.clone();
  m.roughness = 0.86;
  m.metalness = 0;
  m.emissive = new THREE.Color(0x000000);
  m.emissiveIntensity = 0;
  const uniforms = {
    uZSkin: { value: new THREE.Vector3(...def.skin) },
    uZBile: { value: new THREE.Vector3(...def.bile) },
    uZDesat: { value: def.desat },
    uZBlood: { value: def.blood },
    uZSeed: { value: Math.random() * 100 },
  };
  m.userData.zombieUniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vZp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZp = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SHADER_HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${SHADER_BODY}`);
  };
  // All kinds share one program; uniforms carry the differences.
  m.customProgramCacheKey = () => 'protocolz-zombie-v1';
  void kind;
  return m;
}

const eyeGeo = new THREE.SphereGeometry(1.5, 8, 6);
const haloGeo = new THREE.SphereGeometry(4.2, 8, 6);
const eyeMats = new Map<number, { core: THREE.MeshBasicMaterial; halo: THREE.MeshBasicMaterial }>();
function eyeMaterials(color: number) {
  let e = eyeMats.get(color);
  if (!e) {
    e = {
      core: new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      halo: new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    };
    eyeMats.set(color, e);
  }
  return e;
}

/** Apply kind look to a freshly cloned rig instance. Returns a disposer for per-instance materials. */
export function applyZombieLook(rig: HumanoidRig, kind: ZombieKind): () => void {
  const def = ZOMBIE_LOOKS[kind] ?? ZOMBIE_LOOKS.grunt;
  const owned: THREE.Material[] = [];
  rig.scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat?.isMeshStandardMaterial) return;
    const z = zombifyMaterial(mat, def, kind);
    mesh.material = z;
    owned.push(z);
  });
  for (const [bone, s] of Object.entries(def.bones ?? {})) {
    rig.bone(bone)?.scale.setScalar(s);
  }
  // createVrmAvatar applies this after it normalizes height
  rig.scene.userData.girth = def.girth ?? 1;
  // glowing eyes on the Biped eye bones (fallback: head)
  const em = eyeMaterials(def.eye);
  const eyes: THREE.Object3D[] = [];
  for (const n of ['Bip01_LEye', 'Bip01_REye']) {
    const b = rig.scene.getObjectByName(n);
    if (!b) continue;
    const core = new THREE.Mesh(eyeGeo, em.core);
    const halo = new THREE.Mesh(haloGeo, em.halo);
    core.castShadow = halo.castShadow = false;
    b.add(core, halo);
    eyes.push(core, halo);
  }
  return () => {
    for (const m of owned) m.dispose();
    for (const e of eyes) e.removeFromParent();
  };
}
