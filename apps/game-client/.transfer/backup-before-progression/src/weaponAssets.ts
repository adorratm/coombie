import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Realistic weapon models: CC0 "Flat Guns" meshes (converted by
 * scripts/weapons/convert-guns.mjs) dressed with one shared PBR set
 * (ambientCG Metal055A + Wood092, CC0) and a small reflection probe so metal reads
 * as metal under the arena lights. Models are loaded once and cloned per gun.
 */

export interface GunModelDef {
  file: string;
  /** multiplies the metal albedo (finish), e.g. arctic white, OD green, black */
  tint?: number;
  /** emissive accent line along the receiver (energy / elemental variants) */
  glow?: number;
  /** extra scale on top of real-world size */
  scale?: number;
  /** model-unit shift along the barrel so the pistol grip lands on the origin */
  gripZ?: number;
}

/** Support-hand (handguard / pump) position as a fraction of grip→muzzle, per model family. */
function supportFraction(file: string): number {
  if (file.startsWith('pistol')) return 0;
  if (file.startsWith('smg')) return 0.5;
  if (file.startsWith('shotgun_pump')) return 0.5;
  if (file.startsWith('shotgun')) return 0.5;
  if (file.startsWith('sniper_material')) return 0.33;
  if (file.startsWith('sniper')) return 0.36;
  return 0.5;
}

/**
 * Where the support (left) palm goes, in gun-group units. Pistols: cupping the
 * firing hand under the grip; long guns: under the handguard.
 */
export function addSupportPoint(group: THREE.Group, muzzle: THREE.Vector3, frac: number, s: number): THREE.Object3D {
  const p = new THREE.Object3D();
  p.name = 'supportPoint';
  if (frac <= 0) p.position.set(0, -0.075 * s, 0.0);
  else p.position.set(0, muzzle.y - 0.065 * s, muzzle.z * frac);
  group.add(p);
  return p;
}

/** 26 of the 30 catalogue variants use a real model; heavy/melee stay procedural (PBR-textured). */
export const VARIANT_MODELS: Record<string, GunModelDef> = {
  // pistols
  pistol: { file: 'pistol_full_west' },
  viper9: { file: 'pistol_compact_west', tint: 0x9a9488 },
  magnum44: { file: 'pistol_full_east', tint: 0xc8ccd0, scale: 1.15 },
  flare: { file: 'pistol_compact_east', tint: 0x8a6a58, glow: 0xff6a1a },
  arc_pistol: { file: 'pistol_full_west', tint: 0x6f7c8c, glow: 0x5cc8ff },
  // SMGs
  smg: { file: 'smg_full_west' },
  vector: { file: 'smg_compact_west', tint: 0x8a8a6a },
  compact_mp: { file: 'smg_compact_east', gripZ: 0.14 },
  cryo_smg: { file: 'smg_full_east', tint: 0xe4edf2, glow: 0x7fe0ff },
  bulldog_pdw: { file: 'smg_full_east', tint: 0x8c8466 },
  toxin_smg: { file: 'smg_compact_west', tint: 0x6f8a4a, glow: 0x9cff2e },
  // rifles
  rifle: { file: 'rifle_assault_west' },
  carbine_m4: { file: 'rifle_battle_west', tint: 0x8f8a7c },
  ak_ravager: { file: 'rifle_assault_east', tint: 0x5c5e60 },
  bullpup_f2: { file: 'rifle_battle_east', tint: 0x7a8060 },
  dmr_burst: { file: 'sniper_rifle_east', tint: 0x9aa0a6 },
  inferno_ar: { file: 'rifle_assault_west', tint: 0x6a4a3a, glow: 0xff6a1a },
  // shotguns
  shotgun: { file: 'shotgun_pump_east' },
  double_barrel: { file: 'shotgun_pump_west', tint: 0xa8a49a },
  saiga_auto: { file: 'shotgun_auto_east', tint: 0x55585c },
  dragons_breath: { file: 'shotgun_auto_west', tint: 0x7a5040, glow: 0xff5a1f },
  // snipers
  sniper: { file: 'sniper_rifle_west', tint: 0x7c8894, glow: 0x88eeff },
  hunter_bolt: { file: 'sniper_material_east', tint: 0x6e6c64 },
  anti_materiel: { file: 'sniper_material_west', tint: 0x8a8f78 },
  // heavy: RPK-style long AK
  lmg: { file: 'rifle_assault_east', tint: 0x8a8f70, scale: 1.2 },
};

const RAW_FILES = ['pistol_full_west', 'pistol_compact_west', 'pistol_full_east', 'pistol_compact_east', 'smg_full_west', 'smg_compact_west', 'smg_full_east', 'smg_compact_east', 'rifle_assault_west', 'rifle_battle_west', 'rifle_assault_east', 'rifle_battle_east', 'shotgun_pump_west', 'shotgun_auto_west', 'shotgun_pump_east', 'shotgun_auto_east', 'sniper_rifle_west', 'sniper_material_west', 'sniper_rifle_east', 'sniper_material_east'];
const loader = new GLTFLoader();
const templates = new Map<string, THREE.Object3D>();
const pending = new Map<string, Promise<THREE.Object3D>>();

const texLoader = new THREE.TextureLoader();
let texSet: Record<string, THREE.Texture> | null = null;
function textures() {
  if (texSet) return texSet;
  const t = (name: string, srgb = false) => {
    const tex = texLoader.load(`/weapons/tex/${name}.webp`);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  texSet = {
    metalColor: t('metal_color', true),
    metalRough: t('metal_rough'),
    metalNormal: t('metal_normal'),
    woodColor: t('wood_color', true),
    woodRough: t('wood_rough'),
    woodNormal: t('wood_normal'),
  };
  return texSet;
}

let envTex: THREE.Texture | null = null;
/** Call once per renderer (arena / lobby); gives gun metals something to reflect. */
export function ensureWeaponEnvironment(renderer: THREE.WebGLRenderer): void {
  if (envTex) return;
  const pmrem = new THREE.PMREMGenerator(renderer);
  envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  for (const m of matCache.values()) {
    if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      (m as THREE.MeshStandardMaterial).envMap = envTex;
      m.needsUpdate = true;
    }
  }
}

const matCache = new Map<string, THREE.Material>();
/** Shared PBR material per class + finish (also used by the procedural heavy/melee models). */
export function weaponMaterial(cls: 'metal' | 'polymer' | 'wood' | 'brass' | 'glow', tint = 0xffffff, vertexColors = true): THREE.Material {
  const key = `${cls}|${tint}|${vertexColors ? 1 : 0}`;
  let m = matCache.get(key);
  if (m) return m;
  const tx = textures();
  switch (cls) {
    case 'metal':
      m = new THREE.MeshStandardMaterial({
        color: tint,
        map: tx.metalColor,
        roughnessMap: tx.metalRough,
        normalMap: tx.metalNormal,
        normalScale: new THREE.Vector2(0.6, 0.6),
        metalness: 0.7,
        roughness: 0.9,
        vertexColors,
        envMapIntensity: 0.55,
      });
      break;
    case 'polymer':
      m = new THREE.MeshStandardMaterial({
        color: tint,
        roughnessMap: tx.metalRough,
        normalMap: tx.metalNormal,
        normalScale: new THREE.Vector2(0.25, 0.25),
        metalness: 0.05,
        roughness: 0.75,
        vertexColors,
        envMapIntensity: 0.4,
      });
      break;
    case 'wood':
      m = new THREE.MeshStandardMaterial({
        color: tint,
        map: tx.woodColor,
        roughnessMap: tx.woodRough,
        normalMap: tx.woodNormal,
        metalness: 0,
        roughness: 0.8,
        vertexColors,
        envMapIntensity: 0.35,
      });
      break;
    case 'brass':
      m = new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.32, roughnessMap: tx.metalRough, envMapIntensity: 1.1 });
      break;
    default:
      m = new THREE.MeshBasicMaterial({ color: tint, toneMapped: false });
  }
  if (envTex && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) (m as THREE.MeshStandardMaterial).envMap = envTex;
  matCache.set(key, m);
  return m;
}

export function loadGunTemplate(file: string): Promise<THREE.Object3D> {
  const ready = templates.get(file);
  if (ready) return Promise.resolve(ready);
  let job = pending.get(file);
  if (!job) {
    job = loader.loadAsync(`/weapons/${file}.glb`).then((g) => {
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = false;
        }
      });
      templates.set(file, g.scene);
      return g.scene;
    });
    job.catch(() => pending.delete(file));
    pending.set(file, job);
  }
  return job;
}

export function preloadWeaponModels(): Promise<unknown> {
  textures();
  const files = [...new Set([...Object.values(VARIANT_MODELS).map((d) => d.file), ...RAW_FILES])];
  return Promise.all(files.map((f) => loadGunTemplate(f).catch(() => null)));
}

const glowGeo = new THREE.BoxGeometry(1, 1, 1);

/**
 * Build a model instance if the template is loaded (sync), else null.
 * Returns the group (origin = grip, +Z = barrel) and the muzzle point.
 */
export function instantiateGun(variant: string, s: number): { group: THREE.Group; tip: THREE.Object3D } | null {
  const def = VARIANT_MODELS[variant];
  if (!def) return null;
  const tpl = templates.get(def.file);
  if (!tpl) return null;
  const group = new THREE.Group();
  const model = tpl.clone(true);
  const scale = s * 1.1 * (def.scale ?? 1);
  model.scale.setScalar(scale);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (mesh.material as THREE.Material).name as 'metal' | 'polymer' | 'wood' | 'brass';
    mesh.material = weaponMaterial(name, name === 'metal' || name === 'polymer' ? (def.tint ?? 0xffffff) : 0xffffff);
  });
  group.add(model);
  const meta = (tpl.userData as { protocolZ?: { muzzle: number[]; length: number } }).protocolZ;
  const muzzle = meta?.muzzle ?? [0, 0, 0.4];
  const gz = def.gripZ ?? 0;
  model.position.z = -gz * scale;
  const tip = new THREE.Object3D();
  tip.name = 'muzzlePoint';
  tip.position.set(muzzle[0]! * scale, muzzle[1]! * scale, (muzzle[2]! - gz) * scale + 0.02 * s);
  group.add(tip);
  addSupportPoint(group, tip.position, supportFraction(def.file), s);
  if (def.glow) {
    const len = (meta?.length ?? 0.5) * scale * 0.42;
    const strip = new THREE.Mesh(glowGeo, weaponMaterial('glow', def.glow));
    strip.scale.set(0.006 * s, 0.006 * s, len);
    strip.position.set(0.024 * scale, muzzle[1]! * scale - 0.012 * s, len * 0.55 - gz * scale);
    const strip2 = strip.clone();
    strip2.position.x = -strip.position.x;
    group.add(strip, strip2);
  }
  return { group, tip };
}

export function hasGunModel(variant: string): boolean {
  return !!VARIANT_MODELS[variant];
}

/** Dev: instantiate a model file directly (gun-lab ?raw=1). */
export function instantiateRawGun(file: string): { group: THREE.Group; tip: THREE.Object3D } {
  VARIANT_MODELS[`__raw_${file}`] = { file };
  return instantiateGun(`__raw_${file}`, 1) ?? { group: new THREE.Group(), tip: new THREE.Object3D() };
}
