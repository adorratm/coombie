import * as THREE from 'three';
import { preloadWeaponModels } from './weaponAssets';
import { holdGun } from './gunHold';
import { ZOMBIE_ANIM_URL, ZombieAnimator, type ClipSeg } from './zombieAnim';
import { createHookerModel } from './hooker';

const _zs = new THREE.Vector3();
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMHumanBoneName, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { OperativeVisual, ZombieVisual } from './characters';
import { allAvatarUrls } from './roster';
import { HumanoidRig, instantiateRig, isRigUrl, loadRigTemplate } from './humanoidRig';
import { allZombieModelUrls, applyZombieLook, zombieModelUrl } from './zombieLook';
import { applyCosmetics, type Cosmetics } from './costumeLook';
import { sampleZombieGait } from './zombieGait';
import type { ZombieKind } from './zombieKinds';
import type { ZombieVrmLod } from './vrmLod';
import {
  loadAnimLibrary,
  OperativeAnimator,
  OPERATOR_ANIM_URL,
  retargetLibrary,
  type OperativeAnimInput,
} from './animLibrary';

export type AvatarGender = 'male' | 'female';

/** Human operative VRMs — never use zombie_* here. */
export const AVATAR_PATHS: Record<AvatarGender, string> = {
  male: '/avatars/rb/op_ironclad.glb',
  female: '/avatars/rb/op_valkyrie.glb',
};

export interface VrmPoseOpts {
  grip?: string;
  meleeSwing?: number;
  /** Recoil kick 0–1 for arm/shoulder punch */
  fireKick?: number;
  /** Clip-driven operatives: locomotion + one-shot triggers */
  anim?: OperativeAnimInput;
}

export interface ZombiePoseOpts {
  /** ground speed (m/s) for clip-driven zombies */
  speed?: number;
  kind?: ZombieKind;
  attackAnim?: number;
  skill?: string;
}

export interface VrmAvatarHandle {
  vrm: VRM;
  root: THREE.Group;
  gender: AvatarGender;
  rightHand: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  weaponMount: THREE.Object3D | null;
  /** Mixamo clip animator (operatives) — null → procedural pose fallback */
  animator: OperativeAnimator | null;
  /** Mixamo clip animator (zombies) — null → procedural gait */
  zombieAnim: ZombieAnimator | null;
  update: (
    dt: number,
    moving: boolean,
    aiming: boolean,
    animPhase: number,
    breathPhase: number,
    reloading?: boolean,
    reloadProgress?: number,
    poseOpts?: VrmPoseOpts,
    zombieOpts?: ZombiePoseOpts,
  ) => void;
  dispose: () => void;
}

export type VrmStyle = 'operative' | 'zombie';

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

/** Cached raw files so first paint can preload once, then parse per instance. */
const bufferCache = new Map<string, ArrayBuffer>();
const bufferInflight = new Map<string, Promise<ArrayBuffer>>();
const attachInflight = new WeakMap<OperativeVisual, Promise<VrmAvatarHandle | null>>();

async function fetchVrmBuffer(url: string): Promise<ArrayBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;

  const pending = bufferInflight.get(url);
  if (pending) return pending;

  const job = (async () => {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`VRM fetch failed ${url} (${res.status})`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2048) {
      throw new Error(`VRM payload too small for ${url}: ${buf.byteLength} bytes`);
    }
    bufferCache.set(url, buf);
    bufferInflight.delete(url);
    return buf;
  })().catch((err) => {
    bufferInflight.delete(url);
    throw err;
  });

  bufferInflight.set(url, job);
  return job;
}

function prepareVrm(gltf: { scene: THREE.Object3D; userData: Record<string, unknown> }): VRM {
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error('No VRM in glTF userData');

  try {
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
  } catch {
    /* optional optimize */
  }
  try {
    VRMUtils.combineSkeletons(gltf.scene);
  } catch {
    /* optional optimize — some VRM 1.0 files throw here */
  }

  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false;
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        const m = mat as THREE.Material & { map?: THREE.Texture | null; needsUpdate?: boolean };
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        m.needsUpdate = true;
      }
    }
  });

  try {
    VRMUtils.rotateVRM0(vrm);
  } catch {
    /* VRM 1.0 ignores */
  }

  return vrm;
}

function loadVrmFresh(url: string): Promise<VRM> {
  return fetchVrmBuffer(url).then(
    (buf) =>
      new Promise<VRM>((resolve, reject) => {
        // parse() may detach the buffer — always pass a copy
        const copy = buf.slice(0);
        loader.parse(
          copy,
          url.substring(0, url.lastIndexOf('/') + 1),
          (gltf) => {
            try {
              resolve(prepareVrm(gltf));
            } catch (err) {
              reject(err);
            }
          },
          (err) => reject(err),
        );
      }),
  );
}

export async function preloadAvatars(): Promise<void> {
  void preloadWeaponModels();
  const urls = [...allAvatarUrls(), ...allZombieModelUrls()];
  await Promise.all(
    urls.map((url) =>
      (isRigUrl(url) ? loadRigTemplate(url) : fetchVrmBuffer(url)).catch((err) => {
        console.warn('[avatars] preload failed', url, err);
      }),
    ),
  );
}

/** Warm the VRM cache as soon as the module loads (first paint / HMR). */
void preloadAvatars();

function tintVrmScene(scene: THREE.Object3D, accent: number, style: VrmStyle): void {
  const accentC = new THREE.Color(accent);
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of mats) {
      if (!raw) continue;
      const mat = raw as THREE.MeshStandardMaterial & {
        color?: THREE.Color;
        emissive?: THREE.Color;
        emissiveIntensity?: number;
      };
      if (!mat.color) continue;
      if (style === 'zombie') {
        // Infected-human wash: desaturate, sink value, push sick accent
        mat.color.offsetHSL(0.04, -0.45, -0.28);
        mat.color.lerp(accentC, 0.35);
        if ('roughness' in mat && typeof mat.roughness === 'number') {
          mat.roughness = Math.min(1, mat.roughness + 0.25);
        }
        if (mat.emissive) {
          mat.emissive.copy(accentC).multiplyScalar(0.55);
          mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 0.2, 0.55);
        }
      } else {
        // Operatives stay human — light class accent only
        mat.color.lerp(accentC, 0.05);
        if (mat.emissive) {
          mat.emissive.lerp(accentC, 0.1);
          mat.emissiveIntensity = Math.min(0.16, Math.max(mat.emissiveIntensity ?? 0.05, 0.06));
        }
      }
      mat.needsUpdate = true;
    }
  });
}

/**
 * Prefer normalized humanoid bones — vrm.update() copies normalized → raw.
 * Writing only to raw gets overwritten back to T-pose every frame.
 */
function bone(vrm: VRM, name: VRMHumanBoneName): THREE.Object3D | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const normalized = humanoid.getNormalizedBoneNode(name);
  if (normalized) return normalized;
  return (
    (humanoid as { getRawBoneNode?: (n: VRMHumanBoneName) => THREE.Object3D | null }).getRawBoneNode?.(
      name,
    ) ?? null
  );
}

/** Snap (no damp) — used to break T-pose on first attach. */
/** VRM normalized bones expect XYZ (T-pose relative). YXZ flips arms behind the back. */
const VRM_EULER_ORDER: THREE.EulerOrder = 'XYZ';

function snapBone(vrm: VRM, name: VRMHumanBoneName, x: number, y: number, z: number): void {
  const node = bone(vrm, name);
  if (!node) return;
  node.rotation.order = VRM_EULER_ORDER;
  node.rotation.set(x, y, z, VRM_EULER_ORDER);
}

/**
 * Smoothly damp Euler on normalized bones.
 * Arms: Z ≈ ±π/2 drops from T-pose; Y brings hands forward/in; X pitches; elbow bend on LowerArm.x.
 */
function dampBone(
  vrm: VRM,
  name: VRMHumanBoneName,
  x: number,
  y: number,
  z: number,
  dt: number,
  speed = 14,
): void {
  const node = bone(vrm, name);
  if (!node) return;
  node.rotation.order = VRM_EULER_ORDER;
  node.rotation.x = THREE.MathUtils.damp(node.rotation.x, x, speed, dt);
  node.rotation.y = THREE.MathUtils.damp(node.rotation.y, y, speed, dt);
  node.rotation.z = THREE.MathUtils.damp(node.rotation.z, z, speed, dt);
}

const _gunFwd = new THREE.Vector3();
const _gunAim = new THREE.Vector3();
const _localZ = new THREE.Vector3(0, 0, 1);
const _pitchAxis = new THREE.Vector3(1, 0, 0);
const _gunParentQ = new THREE.Quaternion();
const _gunWorldQ = new THREE.Quaternion();
const _gunLocalQ = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion();
const _pitchQ = new THREE.Quaternion();

/**
 * Parent procedural gun into the RIGHT HAND so the trigger grip reads as held.
 * Barrel (+Z) is re-aligned to character facing every frame in alignGunToAim.
 */
export function bindGunToVrmHand(op: OperativeVisual, avatar: VrmAvatarHandle): void {
  const hand = avatar.rightHand ?? bone(avatar.vrm, VRMHumanBoneName.RightHand);
  if (!hand) return;

  avatar.rightHand = hand;
  avatar.leftHand = avatar.leftHand ?? bone(avatar.vrm, VRMHumanBoneName.LeftHand);
  avatar.weaponMount = hand;

  hand.add(op.gun);
  const grip = op.weapon.grip;
  if ((avatar.vrm as unknown as { isHumanoidRig?: boolean }).isHumanoidRig) {
    // Rocketbox hands are in centimetre bone space: compensate so the gun keeps its world size,
    // and seat the grip in the palm (Biped hand +X runs toward the fingers).
    op.root.updateMatrixWorld(true);
    const hs = hand.getWorldScale(_gunFwd).x / Math.max(1e-6, op.root.getWorldScale(_gunAim).x);
    const base = grip === 'pistol' ? 0.95 : grip === 'melee' ? 1.0 : grip === 'smg' ? 0.95 : 0.92;
    op.gun.scale.setScalar(base / hs);
    op.gun.userData.rigGrip = new THREE.Vector3(0.075 / hs, -0.01 / hs, 0.02 / hs);
    op.gun.userData.rigUnit = 1 / hs;
    op.gun.position.copy(op.gun.userData.rigGrip as THREE.Vector3);
  } else if (grip === 'pistol') {
    op.gun.position.set(0.02, -0.04, 0.05);
    op.gun.scale.setScalar(0.85);
  } else if (grip === 'melee') {
    op.gun.position.set(0.02, -0.02, 0.04);
    op.gun.scale.setScalar(0.9);
  } else if (grip === 'smg') {
    op.gun.position.set(0.03, -0.05, 0.03);
    op.gun.scale.setScalar(0.82);
  } else {
    op.gun.position.set(0.03, -0.05, 0.02);
    op.gun.scale.setScalar(0.8);
  }
  op.gun.rotation.set(0, 0, 0);
  op.gun.userData.vrmBound = true;
  op.gun.visible = true;
}

/**
 * Aim weapon local +Z along character facing (NOT Three lookAt -Z).
 * This keeps muzzle direction and bullet spawn aligned.
 */
export function alignGunToAim(op: OperativeVisual, recoil = 0, reloadProgress = -1): void {
  if (!op.gun.userData.vrmBound) return;
  // rig avatars are posed (gun + support-hand IK) once per frame in updateOperativeVrm
  if (op.gun.userData.rigHeld) return;

  const parent = op.gun.parent;
  if (!parent) return;

  op.root.getWorldQuaternion(_rootQ);
  _gunFwd.set(0, 0, 1).applyQuaternion(_rootQ);
  _gunFwd.y = 0;
  if (_gunFwd.lengthSq() < 1e-6) _gunFwd.set(0, 0, 1);
  _gunFwd.normalize();

  const melee = op.weapon.melee;
  const swing = typeof op.meleeSwing === 'number' ? op.meleeSwing : 0;
  let pitch = 0.08 + recoil * 0.25;
  if (reloadProgress >= 0) pitch = 0.55 + reloadProgress * 0.3;
  if (melee) pitch = -0.15 + swing * 1.1;

  _gunAim.copy(_gunFwd);
  _pitchAxis.set(1, 0, 0).applyQuaternion(_rootQ).normalize();
  _pitchQ.setFromAxisAngle(_pitchAxis, pitch);
  _gunAim.applyQuaternion(_pitchQ).normalize();

  // Map local +Z → world aim
  _gunWorldQ.setFromUnitVectors(_localZ, _gunAim);
  parent.getWorldQuaternion(_gunParentQ);
  _gunLocalQ.copy(_gunParentQ).invert().multiply(_gunWorldQ);
  op.gun.quaternion.copy(_gunLocalQ);

  const rigGrip = op.gun.userData.rigGrip as THREE.Vector3 | undefined;
  if (rigGrip) {
    op.gun.position.copy(rigGrip);
  } else if (melee) {
    op.gun.position.set(0.02, -0.02 + swing * 0.08, 0.04 + swing * 0.12);
  } else if (op.weapon.grip === 'pistol') {
    op.gun.position.set(0.02, -0.04 - recoil * 0.03, 0.05);
  } else {
    op.gun.position.set(0.03, -0.05 - recoil * 0.04, 0.03);
  }
}

/** Finger curl for trigger / grip — no-ops if bones missing. */
function applyTriggerGrip(vrm: VRM, dt: number, curl: number, kick: number): void {
  const c = 0.35 + curl * 0.55 + kick * 0.15;
  dampBone(vrm, VRMHumanBoneName.RightThumbProximal, 0.25, 0.15, 0.35 * c, dt, 12);
  dampBone(vrm, VRMHumanBoneName.RightIndexProximal, 0.15, 0, c * 0.9, dt, 14);
  dampBone(vrm, VRMHumanBoneName.RightMiddleProximal, 0.2, 0, c, dt, 14);
  dampBone(vrm, VRMHumanBoneName.RightRingProximal, 0.22, 0, c * 1.05, dt, 14);
  dampBone(vrm, VRMHumanBoneName.RightLittleProximal, 0.25, 0, c * 1.1, dt, 14);
  // Support hand wraps forend
  dampBone(vrm, VRMHumanBoneName.LeftThumbProximal, 0.2, -0.1, -0.25 * c, dt, 12);
  dampBone(vrm, VRMHumanBoneName.LeftIndexProximal, 0.15, 0, -c * 0.85, dt, 12);
  dampBone(vrm, VRMHumanBoneName.LeftMiddleProximal, 0.18, 0, -c, dt, 12);
}

/** Two-hand long gun — Z drops from T-pose, Y brings hands forward to chest. */
function applyRifleHoldPose(
  vrm: VRM,
  dt: number,
  aim: number,
  m: number,
  swing: number,
  breath: number,
  kick = 0,
): void {
  const k = kick;
  dampBone(
    vrm,
    VRMHumanBoneName.RightUpperArm,
    0.22 * aim + swing * 0.03 * m - k * 0.1,
    -0.68 * aim - k * 0.04,
    -1.24 * aim + breath * 0.02,
    dt,
    18,
  );
  dampBone(vrm, VRMHumanBoneName.RightLowerArm, -1.2 * aim - k * 0.12, 0.1, -0.03, dt, 18);
  dampBone(vrm, VRMHumanBoneName.RightHand, 0.12 + k * 0.08, 0.1, 0.06, dt, 16);

  dampBone(
    vrm,
    VRMHumanBoneName.LeftUpperArm,
    0.2 * aim - swing * 0.02 * m - k * 0.05,
    0.72 * aim,
    1.22 * aim,
    dt,
    18,
  );
  dampBone(vrm, VRMHumanBoneName.LeftLowerArm, -1.25 * aim, -0.08, 0.04, dt, 18);
  dampBone(vrm, VRMHumanBoneName.LeftHand, 0.2, -0.1, -0.1, dt, 16);

  dampBone(vrm, VRMHumanBoneName.RightShoulder, 0.03 + k * 0.04, 0.06 * aim, 0.08 * aim, dt, 12);
  dampBone(vrm, VRMHumanBoneName.LeftShoulder, 0.03, -0.06 * aim, -0.08 * aim, dt, 12);
  dampBone(vrm, VRMHumanBoneName.Spine, 0.03 * m + breath - k * 0.02, 0, k * 0.02, dt, 12);
  dampBone(vrm, VRMHumanBoneName.Chest, breath * 0.3 + k * 0.03, 0, 0, dt, 12);
  dampBone(vrm, VRMHumanBoneName.Head, -0.05 * aim + breath * 0.08, 0, 0, dt, 12);
  applyTriggerGrip(vrm, dt, aim, k);
}

/** Compact SMG — two-hand chest; one-hand while sprinting. */
function applySmgHoldPose(
  vrm: VRM,
  dt: number,
  aim: number,
  m: number,
  swing: number,
  breath: number,
  kick = 0,
): void {
  const oneHand = m > 0.65 ? 1 : 0;
  dampBone(
    vrm,
    VRMHumanBoneName.RightUpperArm,
    0.14 * aim + swing * 0.05 * m - kick * 0.1,
    -0.48 * aim,
    -1.3 * aim,
    dt,
    18,
  );
  dampBone(vrm, VRMHumanBoneName.RightLowerArm, -1.0 * aim - kick * 0.1, 0.1, -0.03, dt, 18);
  dampBone(vrm, VRMHumanBoneName.RightHand, 0.14 + kick * 0.08, 0.1, 0.08, dt, 16);

  dampBone(
    vrm,
    VRMHumanBoneName.LeftUpperArm,
    THREE.MathUtils.lerp(0.12 * aim, 0.05 + swing * 0.15, oneHand),
    THREE.MathUtils.lerp(0.55 * aim, 0.15, oneHand),
    THREE.MathUtils.lerp(1.26 * aim, 1.2, oneHand),
    dt,
    16,
  );
  dampBone(
    vrm,
    VRMHumanBoneName.LeftLowerArm,
    THREE.MathUtils.lerp(-1.05 * aim, -0.5, oneHand),
    -0.08,
    0.04,
    dt,
    16,
  );
  dampBone(vrm, VRMHumanBoneName.LeftHand, 0.14, -0.06, -0.08, dt, 14);
  dampBone(vrm, VRMHumanBoneName.Head, -0.03 * aim + breath * 0.06, 0, 0, dt, 12);
  applyTriggerGrip(vrm, dt, aim * (1 - oneHand * 0.3), kick);
}

/** One-hand pistol — left arm guards at side. */
function applyPistolHoldPose(
  vrm: VRM,
  dt: number,
  aim: number,
  m: number,
  swing: number,
  breath: number,
  kick = 0,
): void {
  dampBone(
    vrm,
    VRMHumanBoneName.RightUpperArm,
    0.22 * aim + swing * 0.04 * m - kick * 0.15,
    -0.35 * aim,
    -1.3 * aim,
    dt,
    18,
  );
  dampBone(vrm, VRMHumanBoneName.RightLowerArm, -0.75 * aim - kick * 0.08, 0.1, 0, dt, 18);
  dampBone(vrm, VRMHumanBoneName.RightHand, 0.12 + kick * 0.12, 0.14, 0.08, dt, 16);

  dampBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.05 + swing * 0.12 * m, 0.12, 1.32, dt, 14);
  dampBone(vrm, VRMHumanBoneName.LeftLowerArm, -0.45, 0.04, 0.03, dt, 14);
  dampBone(vrm, VRMHumanBoneName.LeftHand, 0.06, -0.04, -0.05, dt, 12);
  dampBone(vrm, VRMHumanBoneName.Head, -0.03 * aim + breath * 0.08, 0, 0, dt, 12);
  applyTriggerGrip(vrm, dt, aim, kick);
  dampBone(vrm, VRMHumanBoneName.LeftIndexProximal, 0.05, 0, -0.15, dt, 10);
  dampBone(vrm, VRMHumanBoneName.LeftMiddleProximal, 0.05, 0, -0.12, dt, 10);
}

/** Melee swing — right arm arcs in front, left guards. */
function applyMeleeHoldPose(
  vrm: VRM,
  dt: number,
  swingPhase: number,
  m: number,
  walkSwing: number,
): void {
  const s = THREE.MathUtils.clamp(swingPhase, 0, 1);
  const wind = s < 0.35 ? s / 0.35 : s < 0.55 ? 1 : Math.max(0, 1 - (s - 0.55) / 0.45);
  const strike = s >= 0.35 && s < 0.55 ? (s - 0.35) / 0.2 : s >= 0.55 ? 1 : 0;

  dampBone(
    vrm,
    VRMHumanBoneName.RightUpperArm,
    THREE.MathUtils.lerp(0.15, 0.55, wind) + strike * 0.1,
    THREE.MathUtils.lerp(-0.25, 0.35, strike),
    THREE.MathUtils.lerp(-1.25, -1.15, wind),
    dt,
    20,
  );
  dampBone(vrm, VRMHumanBoneName.RightLowerArm, THREE.MathUtils.lerp(-0.45, -1.05, wind), 0.06, -0.03, dt, 18);
  dampBone(vrm, VRMHumanBoneName.RightHand, 0.1 + strike * 0.15, 0.06, 0.05, dt, 16);

  dampBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.05 + walkSwing * 0.08 * m, 0.1, 1.28, dt, 12);
  dampBone(vrm, VRMHumanBoneName.LeftLowerArm, -0.45, 0.04, 0.03, dt, 12);
  dampBone(vrm, VRMHumanBoneName.Spine, strike * 0.08, 0, strike * -0.04, dt, 14);
  dampBone(vrm, VRMHumanBoneName.Head, 0.02, 0, 0, dt, 10);
}

function applyWeaponPose(
  vrm: VRM,
  dt: number,
  grip: string,
  aim: number,
  m: number,
  swing: number,
  breath: number,
  reloading: boolean,
  reloadProgress: number,
  meleeSwing: number,
  fireKick = 0,
): void {
  if (reloading && grip !== 'melee') {
    applyReloadPose(vrm, reloadProgress, dt);
    return;
  }
  if (grip === 'melee') {
    applyMeleeHoldPose(vrm, dt, meleeSwing, m, swing);
    return;
  }
  if (grip === 'pistol') {
    applyPistolHoldPose(vrm, dt, aim, m, swing, breath, fireKick);
    return;
  }
  if (grip === 'smg') {
    applySmgHoldPose(vrm, dt, aim, m, swing, breath, fireKick);
    return;
  }
  applyRifleHoldPose(vrm, dt, aim, m, swing, breath, fireKick);
}

/** Kind-specific zombie attack telegraphs (XYZ: Z hang, Y forward). */
function applyZombieAttackPose(
  vrm: VRM,
  dt: number,
  kind: string,
  skill: string,
  attackAnim: number,
  limp: number,
): void {
  const s = THREE.MathUtils.clamp(attackAnim, 0, 1);
  const wind = s < 0.4 ? s / 0.4 : s < 0.55 ? 1 : Math.max(0, 1 - (s - 0.55) / 0.45);
  const strike = s >= 0.4 && s < 0.6 ? (s - 0.4) / 0.2 : s >= 0.6 ? 1 - (s - 0.6) / 0.4 : 0;

  if (skill === 'spit' || (kind === 'acid' && skill !== 'lunge')) {
    dampBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.25 + wind * 0.7, 0.35, 1.15, dt, 16);
    dampBone(vrm, VRMHumanBoneName.RightUpperArm, 0.25 + wind * 0.7, -0.35, -1.15, dt, 16);
    dampBone(vrm, VRMHumanBoneName.LeftLowerArm, -0.45 - strike * 0.5, 0.05, 0.03, dt, 16);
    dampBone(vrm, VRMHumanBoneName.RightLowerArm, -0.45 - strike * 0.5, -0.05, -0.03, dt, 16);
    dampBone(vrm, VRMHumanBoneName.Head, -0.15 * wind + strike * 0.3, 0, 0, dt, 14);
    dampBone(vrm, VRMHumanBoneName.Spine, 0.1 + strike * 0.12, 0, 0, dt, 14);
    return;
  }

  if (skill === 'slam' || ((kind === 'boss' || kind === 'tank') && skill === 'slam')) {
    dampBone(vrm, VRMHumanBoneName.LeftUpperArm, THREE.MathUtils.lerp(0.2, 1.1, wind), 0.2, 1.1, dt, 18);
    dampBone(vrm, VRMHumanBoneName.RightUpperArm, THREE.MathUtils.lerp(0.2, 1.1, wind), -0.2, -1.1, dt, 18);
    dampBone(vrm, VRMHumanBoneName.LeftLowerArm, THREE.MathUtils.lerp(-0.3, -0.85, strike), 0, 0, dt, 18);
    dampBone(vrm, VRMHumanBoneName.RightLowerArm, THREE.MathUtils.lerp(-0.3, -0.85, strike), 0, 0, dt, 18);
    dampBone(vrm, VRMHumanBoneName.Spine, 0.08 + wind * 0.28 - strike * 0.45, 0, 0, dt, 16);
    dampBone(vrm, VRMHumanBoneName.Head, wind * 0.2 - strike * 0.3, 0, 0, dt, 14);
    return;
  }

  if (skill === 'roar' || skill === 'shriek') {
    const armSpread = skill === 'shriek' ? 0.55 : 0.35;
    dampBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.12 + wind * 0.15, armSpread, 1.22, dt, 14);
    dampBone(vrm, VRMHumanBoneName.RightUpperArm, 0.12 + wind * 0.15, -armSpread, -1.22, dt, 14);
    dampBone(vrm, VRMHumanBoneName.Spine, -0.08 + wind * 0.35, 0, 0, dt, 14);
    dampBone(vrm, VRMHumanBoneName.Chest, wind * 0.28, 0, 0, dt, 14);
    dampBone(vrm, VRMHumanBoneName.Head, -0.4 * wind + strike * 0.12, limp * 0.2, 0, dt, 14);
    return;
  }

  if (skill === 'lunge') {
    dampBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.2 + wind * 0.25, 0.45, 1.22, dt, 18);
    dampBone(vrm, VRMHumanBoneName.RightUpperArm, 0.18 + wind * 0.22, -0.42, -1.24, dt, 18);
    dampBone(vrm, VRMHumanBoneName.Spine, 0.28 * wind, 0, 0, dt, 16);
    dampBone(vrm, VRMHumanBoneName.LeftUpperLeg, -0.3 * wind, 0, 0, dt, 14);
    dampBone(vrm, VRMHumanBoneName.RightUpperLeg, 0.18 * wind, 0, 0, dt, 14);
    return;
  }

  // Default Claw Attack / Frenzied Swipe (with visceral chest crunch & neck snap)
  const clawSwipe = (s >= 0.4 && s < 0.6) ? (s - 0.4) / 0.2 : 0;
  dampBone(
    vrm,
    VRMHumanBoneName.RightUpperArm,
    THREE.MathUtils.lerp(0.18, 0.65, wind),
    THREE.MathUtils.lerp(-0.45, 0.55, strike),
    -1.22,
    dt,
    20,
  );
  dampBone(vrm, VRMHumanBoneName.RightLowerArm, THREE.MathUtils.lerp(-0.65, -1.25, wind) - clawSwipe * 0.25, -0.05, -0.03, dt, 20);
  dampBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.15 + limp * 0.08 + wind * 0.35, 0.42, 1.25, dt, 16);
  dampBone(vrm, VRMHumanBoneName.LeftLowerArm, -0.95 - strike * 0.3, 0.04, 0.03, dt, 16);
  dampBone(vrm, VRMHumanBoneName.Spine, strike * 0.18, strike * -0.12, 0, dt, 16);
  dampBone(vrm, VRMHumanBoneName.Chest, strike * 0.14, 0, 0, dt, 14);
  dampBone(vrm, VRMHumanBoneName.Head, 0.15 + wind * 0.1, strike * 0.2, 0, dt, 14);
}

function applyReloadPose(vrm: VRM, progress: number, dt: number): void {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  // Keep Z hang + Y forward while left hand works the mag.
  dampBone(vrm, VRMHumanBoneName.RightUpperArm, 0.12, -0.45, -1.28, dt, 18);
  dampBone(vrm, VRMHumanBoneName.RightLowerArm, -0.95, 0.1, -0.03, dt, 18);
  dampBone(vrm, VRMHumanBoneName.RightHand, 0.12, 0.08, 0.06, dt, 16);
  if (p < 0.45) {
    const t = p / 0.45;
    dampBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.2 + t * 0.15, 0.55 - t * 0.1, 1.2, dt, 18);
    dampBone(vrm, VRMHumanBoneName.LeftLowerArm, -1.05 - t * 0.15, -0.08, 0.04, dt, 18);
    dampBone(vrm, VRMHumanBoneName.LeftHand, 0.25 + t * 0.1, -0.12, -0.12, dt, 16);
  } else {
    const t = (p - 0.45) / 0.55;
    dampBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.28 - t * 0.1, 0.5, 1.22, dt, 18);
    dampBone(vrm, VRMHumanBoneName.LeftLowerArm, -1.15 + t * 0.15, -0.06, 0.03, dt, 18);
    dampBone(vrm, VRMHumanBoneName.LeftHand, 0.3 - t * 0.1, -0.1, -0.1, dt, 16);
  }
  dampBone(vrm, VRMHumanBoneName.Spine, 0.06, 0, -0.03, dt, 12);
  dampBone(vrm, VRMHumanBoneName.Head, 0.08, 0, 0.03, dt, 12);
  dampBone(vrm, VRMHumanBoneName.RightShoulder, 0.04, 0.05, 0.06, dt, 12);
  dampBone(vrm, VRMHumanBoneName.LeftShoulder, 0.04, -0.05, -0.06, dt, 12);
}

export async function createVrmAvatar(opts: {
  url: string;
  accentColor: number;
  gender?: AvatarGender;
  style?: VrmStyle;
  targetHeight?: number;
  showRing?: boolean;
  zombieKind?: ZombieKind;
  cosmetics?: Cosmetics;
}): Promise<VrmAvatarHandle> {
  const style = opts.style ?? 'operative';
  const gender = opts.gender ?? 'male';
  const rigModel = isRigUrl(opts.url);
  const [vrm, animLib] = await Promise.all([
    rigModel ? (instantiateRig(opts.url) as unknown as Promise<VRM>) : loadVrmFresh(opts.url),
    loadAnimLibrary(style === 'operative' ? OPERATOR_ANIM_URL : ZOMBIE_ANIM_URL),
  ]);
  const rig = rigModel ? (vrm as unknown as HumanoidRig) : null;
  let disposeLook: (() => void) | null = null;
  if (rig) {
    // zombie procedural poses were tuned in the VRM0 normalized frame; clips are VRM1
    rig.flipXZ = style === 'zombie';
    if (style === 'zombie') disposeLook = applyZombieLook(rig, opts.zombieKind ?? 'grunt');
    else if (opts.cosmetics) disposeLook = await applyCosmetics(rig, { gender, ...opts.cosmetics });
  } else {
    tintVrmScene(vrm.scene, opts.accentColor, style);
  }

  // Retarget in unscaled model space (hips track is in the VRM's local units).
  let animator: OperativeAnimator | null = null;
  let zombieAnim: ZombieAnimator | null = null;
  if (animLib && style === 'zombie' && rig) {
    try {
      const clips = retargetLibrary(vrm, animLib, `${opts.url}#zombie`);
      const kind = opts.zombieKind ?? 'grunt';
      if (ZombieAnimator.supports(clips, kind)) {
        zombieAnim = new ZombieAnimator(vrm.scene, clips, kind);
        rig.flipXZ = false; // clips are authored in the VRM1 normalized frame
      }
    } catch (err) {
      console.warn('[avatars] zombie clip retarget failed — procedural gait', opts.url, err);
    }
  } else if (animLib) {
    try {
      const clips = retargetLibrary(vrm, animLib, opts.url);
      if (OperativeAnimator.supports(clips)) animator = new OperativeAnimator(vrm.scene, clips);
    } catch (err) {
      console.warn('[avatars] clip retarget failed — procedural pose', opts.url, err);
    }
  }

  const root = new THREE.Group();
  root.name = `vrm-${style}-${gender}`;

  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const targetH =
    opts.targetHeight ??
    (style === 'zombie' ? (size.y > 2.4 ? 2.6 : 1.85) : gender === 'female' ? 1.95 : 2.1);
  const s = size.y > 0.01 ? targetH / size.y : 1;
  vrm.scene.scale.setScalar(s);
  const girth = (vrm.scene.userData.girth as number | undefined) ?? 1;
  vrm.scene.scale.x *= girth;
  vrm.scene.scale.z *= girth;
  box.setFromObject(vrm.scene);
  vrm.scene.position.y = -box.min.y;
  root.add(vrm.scene);

  if (opts.showRing !== false && style === 'operative') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.48, 24),
      new THREE.MeshBasicMaterial({
        color: opts.accentColor,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    root.add(ring);
  }

  // Rig proxies are flat and hidden — props must ride the real skinned bones.
  const rightHand = rig ? rig.bone('rightHand') : bone(vrm, VRMHumanBoneName.RightHand);
  const leftHand = rig ? rig.bone('leftHand') : bone(vrm, VRMHumanBoneName.LeftHand);
  const weaponMount = rightHand;

  // Break T-pose: Z hangs arms, Y brings them forward (XYZ order)
  if (zombieAnim) {
    zombieAnim.update(0, 0, 1);
  } else if (animator) {
    animator.update(0, {
      localVelX: 0,
      localVelZ: 0,
      shotSerial: 0,
      hitSerial: 0,
      abilitySerial: 0,
      reloading: false,
      reloadTime: 1,
      alive: true,
    });
  } else if (style === 'operative') {
    snapBone(vrm, VRMHumanBoneName.RightUpperArm, 0.2, -0.62, -1.26);
    snapBone(vrm, VRMHumanBoneName.RightLowerArm, -1.15, 0.08, -0.02);
    snapBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.18, 0.68, 1.24);
    snapBone(vrm, VRMHumanBoneName.LeftLowerArm, -1.2, -0.06, 0.03);
    snapBone(vrm, VRMHumanBoneName.RightHand, 0.12, 0.1, 0.08);
    snapBone(vrm, VRMHumanBoneName.LeftHand, 0.16, -0.08, -0.1);
  } else {
    snapBone(vrm, VRMHumanBoneName.LeftUpperArm, 0.16, 0.6, 1.22);
    snapBone(vrm, VRMHumanBoneName.RightUpperArm, 0.14, -0.56, -1.24);
    snapBone(vrm, VRMHumanBoneName.LeftLowerArm, -1.0, 0.03, 0.02);
    snapBone(vrm, VRMHumanBoneName.RightLowerArm, -0.95, -0.02, -0.02);
    snapBone(vrm, VRMHumanBoneName.Spine, 0.12, 0, 0.04);
    snapBone(vrm, VRMHumanBoneName.Chest, 0.06, 0, 0);
    snapBone(vrm, VRMHumanBoneName.Head, 0.14, 0.05, -0.03);
    snapBone(vrm, VRMHumanBoneName.LeftUpperLeg, 0.08, 0, 0.03);
    snapBone(vrm, VRMHumanBoneName.RightUpperLeg, -0.03, 0, -0.03);
  }
  // Disable lookAt auto-aim so it doesn't fight procedural pose
  if (vrm.lookAt) {
    vrm.lookAt.target = undefined;
    (vrm.lookAt as { autoUpdate?: boolean }).autoUpdate = false;
  }
  vrm.humanoid?.update();
  vrm.update(1 / 60);

  const update = (
    dt: number,
    moving: boolean,
    aiming: boolean,
    animPhase: number,
    breathPhase: number,
    reloading = false,
    reloadProgress = 0,
    poseOpts?: VrmPoseOpts,
    zombieOpts?: ZombiePoseOpts,
  ) => {
    if (zombieAnim) {
      vrm.scene.getWorldScale(_zs);
      zombieAnim.update(dt, zombieOpts?.speed ?? 0, _zs.y);
      vrm.update(dt);
      return;
    }
    if (animator && poseOpts?.anim) {
      animator.update(dt, { ...poseOpts.anim, melee: poseOpts.grip === 'melee' });
      // Weapon-specific recoil on top of the clip: chest/head pitch back + right arm kick.
      const kick = THREE.MathUtils.clamp(poseOpts.fireKick ?? 0, 0, 1);
      if (kick > 0.01 && poseOpts.grip !== 'melee') {
        const sign = rig ? 1 : -1; // VRM0 normalized frame is mirrored
        vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.UpperChest)?.rotateX(-0.16 * kick * sign);
        vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head)?.rotateX(0.08 * kick * sign);
        vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm)?.rotateZ(0.1 * kick * sign);
      }
      vrm.update(dt);
      return;
    }
    const m = moving ? 1 : 0;
    const attacking = (zombieOpts?.attackAnim ?? 0) > 0.01;
    const stride = style === 'zombie' ? 0.78 : 0.52;
    const swing = Math.sin(animPhase) * stride * m * (attacking ? 0.25 : 1);
    const swingCos = Math.cos(animPhase) * stride * m * (attacking ? 0.25 : 1);
    const breath = Math.sin(breathPhase) * 0.028 * (1 - m * 0.4);
    const weightShift = Math.sin(animPhase) * 0.04 * m;

    dampBone(vrm, VRMHumanBoneName.Hips, breath * 0.08, weightShift * 0.35, swing * 0.03, dt, 12);
    if (!attacking || style !== 'zombie') {
      dampBone(vrm, VRMHumanBoneName.Spine, 0.09 * m + breath, -weightShift * 0.5, swing * 0.025, dt, 11);
      dampBone(vrm, VRMHumanBoneName.Chest, breath * 0.55 + 0.04 * m, weightShift * 0.25, -swing * 0.02, dt, 11);
      dampBone(vrm, VRMHumanBoneName.Head, -0.06 * m + breath * 0.18, 0, -swing * 0.05, dt, 11);
    }

    dampBone(vrm, VRMHumanBoneName.LeftUpperLeg, swing * 1.05, 0.02 * m, 0.04 * m + weightShift, dt, 15);
    dampBone(vrm, VRMHumanBoneName.RightUpperLeg, -swing * 1.05, -0.02 * m, -0.04 * m - weightShift, dt, 15);
    dampBone(
      vrm,
      VRMHumanBoneName.LeftLowerLeg,
      Math.max(0.05 * m, -swingCos) * 0.85 + 0.08 * m,
      0,
      0,
      dt,
      15,
    );
    dampBone(
      vrm,
      VRMHumanBoneName.RightLowerLeg,
      Math.max(0.05 * m, swingCos) * 0.85 + 0.08 * m,
      0,
      0,
      dt,
      15,
    );
    dampBone(vrm, VRMHumanBoneName.LeftFoot, Math.min(0.2, Math.max(-0.15, -swing * 0.35)), 0, 0, dt, 12);
    dampBone(vrm, VRMHumanBoneName.RightFoot, Math.min(0.2, Math.max(-0.15, swing * 0.35)), 0, 0, dt, 12);

    if (style === 'zombie') {
      const gait = sampleZombieGait({
        animPhase,
        moving,
        attackAnim: zombieOpts?.attackAnim ?? 0,
        skill: zombieOpts?.skill ?? 'claw',
      });
      if (attacking) {
        applyZombieAttackPose(
          vrm,
          dt,
          zombieOpts?.kind ?? 'grunt',
          zombieOpts?.skill ?? 'claw',
          zombieOpts?.attackAnim ?? 0,
          gait.limp,
        );
      } else {
        dampBone(vrm, VRMHumanBoneName.LeftUpperLeg, gait.leftUpperLegX, 0.02 * m, 0.04 * m + weightShift, dt, 15);
        dampBone(vrm, VRMHumanBoneName.RightUpperLeg, gait.rightUpperLegX, -0.02 * m, -0.04 * m - weightShift, dt, 15);
        dampBone(vrm, VRMHumanBoneName.LeftLowerLeg, gait.leftLowerLegX, 0, 0, dt, 15);
        dampBone(vrm, VRMHumanBoneName.RightLowerLeg, gait.rightLowerLegX, 0, 0, dt, 15);
        dampBone(vrm, VRMHumanBoneName.LeftFoot, gait.leftFootX, 0, 0, dt, 12);
        dampBone(vrm, VRMHumanBoneName.RightFoot, gait.rightFootX, 0, 0, dt, 12);
        dampBone(vrm, VRMHumanBoneName.LeftUpperArm, ...gait.vrmLeftUpper, dt, 13);
        dampBone(vrm, VRMHumanBoneName.RightUpperArm, ...gait.vrmRightUpper, dt, 13);
        dampBone(vrm, VRMHumanBoneName.LeftLowerArm, ...gait.vrmLeftLower, dt, 13);
        dampBone(vrm, VRMHumanBoneName.RightLowerArm, ...gait.vrmRightLower, dt, 13);
        dampBone(vrm, VRMHumanBoneName.LeftHand, ...gait.vrmLeftHand, dt, 11);
        dampBone(vrm, VRMHumanBoneName.RightHand, ...gait.vrmRightHand, dt, 11);
        dampBone(vrm, VRMHumanBoneName.Head, ...gait.vrmHead, dt, 11);
        dampBone(vrm, VRMHumanBoneName.Spine, ...gait.vrmSpine, dt, 11);
        dampBone(vrm, VRMHumanBoneName.Chest, ...gait.vrmChest, dt, 11);
        dampBone(vrm, VRMHumanBoneName.LeftShoulder, ...gait.vrmLeftShoulder, dt, 10);
        dampBone(vrm, VRMHumanBoneName.RightShoulder, ...gait.vrmRightShoulder, dt, 10);
      }
    } else {
      const aim = aiming && !reloading ? 1 : reloading ? 0.7 : 0.9;
      applyWeaponPose(
        vrm,
        dt,
        poseOpts?.grip ?? 'rifle',
        aim,
        m,
        swing,
        breath,
        reloading,
        reloadProgress,
        poseOpts?.meleeSwing ?? 0,
        poseOpts?.fireKick ?? 0,
      );
    }

    vrm.update(dt);
  };

  return {
    vrm,
    root,
    gender,
    rightHand,
    leftHand,
    weaponMount,
    animator,
    zombieAnim,
    update,
    dispose: () => {
      animator?.dispose();
      zombieAnim?.dispose();
      root.removeFromParent();
      if (rig) {
        // geometry / textures are shared with the template — only per-instance data goes
        disposeLook?.();
        rig.scene.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
      } else {
        VRMUtils.deepDispose(vrm.scene);
      }
    },
  };
}

export async function attachVrmToOperative(
  op: OperativeVisual,
  gender?: AvatarGender,
): Promise<VrmAvatarHandle | null> {
  const existing = (op as OperativeVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (existing) {
    op.proxy.visible = false;
    return existing;
  }

  const inflight = attachInflight.get(op);
  if (inflight) return inflight;

  const job = (async () => {
    const g = gender ?? op.gender;
    // Hard guard: never attach zombie meshes to squad / player
    const requested = op.avatarUrl || AVATAR_PATHS[g];
    const url = /zombie/i.test(requested) ? AVATAR_PATHS[g] : requested;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const avatar = await createVrmAvatar({
          url,
          accentColor: op.color,
          gender: g,
          style: 'operative',
          showRing: op.isPlayer,
          cosmetics: op.root.userData.cosmetics as Cosmetics | undefined,
        });
        for (const child of [...op.root.children]) {
          if (child.name.startsWith('vrm-')) child.removeFromParent();
        }
        op.proxy.visible = false;
        op.root.add(avatar.root);
        bindGunToVrmHand(op, avatar);
        (op as OperativeVisual & { vrm?: VrmAvatarHandle }).vrm = avatar;
        return avatar;
      } catch (err) {
        lastErr = err;
        if (attempt === 0) bufferCache.delete(url);
      }
    }
    console.warn('[avatars] VRM load failed, keeping procedural', lastErr);
    op.proxy.visible = true;
    return null;
  })().finally(() => {
    attachInflight.delete(op);
  });

  attachInflight.set(op, job);
  return job;
}

const zombieAttachInflight = new WeakMap<ZombieVisual, Promise<VrmAvatarHandle | null>>();

/** Soft cap of live zombie VRM instances (far zombies stay on proxy). */
export const MAX_ZOMBIE_VRM =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 28 : 56;
let liveZombieVrm = 0;
let zombieVrmAttachBudget = 0;

export function beginZombieVrmAttachBudget(perFrame = 2): void {
  zombieVrmAttachBudget = perFrame;
}

export function liveZombieVrmCount(): number {
  return liveZombieVrm;
}

export function disposeZombieVrm(z: ZombieVisual): void {
  const avatar = (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (!avatar) return;
  avatar.dispose();
  delete (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm;
  liveZombieVrm = Math.max(0, liveZombieVrm - 1);
  z.proxy.visible = true;
}

/** Queue-limited attach — call after LOD says the zombie should show VRM. */
export function requestZombieVrm(z: ZombieVisual): void {
  const existing = (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (existing || zombieAttachInflight.has(z)) return;
  if (liveZombieVrm >= MAX_ZOMBIE_VRM) return;
  if (zombieVrmAttachBudget <= 0) return;
  zombieVrmAttachBudget -= 1;
  void attachVrmToZombie(z);
}

export async function attachVrmToZombie(z: ZombieVisual): Promise<VrmAvatarHandle | null> {
  const existing = (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (existing) return existing;
  const inflight = zombieAttachInflight.get(z);
  if (inflight) return inflight;
  if (liveZombieVrm >= MAX_ZOMBIE_VRM) return null;

  const url = zombieModelUrl(z.kind);
  const accent =
    z.kind === 'acid'
      ? 0x84cc16
      : z.kind === 'boss'
        ? 0xef4444
        : z.kind === 'tank'
          ? 0xf59e0b
          : z.kind === 'screamer'
            ? 0xd946ef
            : z.kind === 'runner'
              ? 0x22d3ee
              : 0x6b3f2a;
  const targetHeight =
    z.kind === 'boss'
      ? 2.85
      : z.kind === 'tank'
        ? 2.35
        : z.kind === 'screamer'
          ? 2.25
          : z.kind === 'acid'
            ? 2.05
            : z.kind === 'runner'
              ? 1.65 + Math.random() * 0.12
              : 1.8 + Math.random() * 0.25;

  const job = (async () => {
    try {
      if (liveZombieVrm >= MAX_ZOMBIE_VRM) return null;
      if (z.kind === 'hooker') {
        const hk = await createHookerModel(2.75);
        if ((z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm) return (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm!;
        hk.root.visible = false;
        z.root.add(hk.root);
        z.root.userData.hookerAnim = hk.anim;
        z.root.userData.hookSpawn = hk.spawn;
        const handle = {
          vrm: { scene: hk.root, update: () => undefined, humanoid: null } as unknown as VRM,
          root: hk.root,
          gender: 'male' as AvatarGender,
          rightHand: hk.spawn,
          leftHand: null,
          weaponMount: null,
          animator: null,
          zombieAnim: hk.anim as unknown as ZombieAnimator,
          update: (dt: number, _m: boolean, _a: boolean, _p: number, _b: number, _r?: boolean, _rp?: number, _po?: VrmPoseOpts, zo?: ZombiePoseOpts) =>
            hk.anim.update(dt, zo?.speed ?? 0),
          dispose: () => {
            hk.anim.dispose();
            hk.root.removeFromParent();
          },
        } satisfies VrmAvatarHandle;
        (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm = handle;
        liveZombieVrm += 1;
        return handle;
      }
      const avatar = await createVrmAvatar({
        url,
        accentColor: accent,
        gender: 'male',
        style: 'zombie',
        targetHeight,
        showRing: false,
        zombieKind: z.kind,
      });
      if ((z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm) {
        avatar.dispose();
        return (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm!;
      }
      // Start hidden until presentation LOD chooses VRM (avoids pop on far attach).
      avatar.root.visible = false;
      avatar.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = false;
      });
      z.root.add(avatar.root);
      (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm = avatar;
      liveZombieVrm += 1;
      return avatar;
    } catch (err) {
      console.warn('[avatars] zombie VRM failed', err);
      z.proxy.visible = true;
      return null;
    } finally {
      zombieAttachInflight.delete(z);
    }
  })();

  zombieAttachInflight.set(z, job);
  return job;
}

function setZombieVrmPresentation(z: ZombieVisual, showVrm: boolean): void {
  const avatar = (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (!avatar) {
    z.proxy.visible = true;
    return;
  }
  avatar.root.visible = showVrm;
  z.proxy.visible = !showVrm;
  avatar.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = showVrm;
  });
}

export function updateZombieVrm(
  z: ZombieVisual,
  dt: number,
  moving: boolean,
  lod: ZombieVrmLod = 'full',
): void {
  // Attack timeline must advance even when VRM pose updates are skipped (gameplay correctness).
  if (z.attackAnim > 0) {
    z.attackAnim += dt / Math.max(0.2, z.attackDuration);
    if (z.attackAnim >= 1) {
      z.attackAnim = 0;
      z.activeSkill = 'none';
      z.attackImpactDone = false;
    }
  }

  const avatar = (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (!avatar) {
    z.proxy.visible = true;
    return;
  }

  if (lod === 'proxy') {
    setZombieVrmPresentation(z, false);
    return;
  }
  if (lod === 'skip') {
    // Freeze current presentation (avoid T-pose flash before first full pose);
    // clip zombies bank the time so animation speed stays correct.
    if (avatar.zombieAnim) {
      const u = z.root.userData as { animAcc?: number };
      u.animAcc = Math.min(0.25, (u.animAcc ?? 0) + dt);
    }
    return;
  }

  setZombieVrmPresentation(z, true);

  const ud = z.root.userData as ZombieAnimState;
  if (avatar.zombieAnim) {
    const za = avatar.zombieAnim;
    // ground speed from the actual displacement (includes lunges / charges / knockback)
    const step = Math.min(0.25, (ud.animAcc ?? 0) + dt);
    ud.animAcc = 0;
    const p = z.root.position;
    if (!ud.lastPos) ud.lastPos = p.clone();
    const sp = step > 1e-4 ? Math.hypot(p.x - ud.lastPos.x, p.z - ud.lastPos.z) / step : 0;
    ud.lastPos.copy(p);
    ud.speedEma = THREE.MathUtils.damp(ud.speedEma ?? 0, Math.min(sp, 16), 10, step);
    const q = ud.animQueue;
    if (q && q.length) {
      for (const ev of q) {
        if (ev.kind === 'hit') za.hit();
        else if (ev.kind === 'spawn') za.standUp(ev.dur);
        else if (ev.seg) za.play(ev.seg, ev.dur, ev.priority ?? 1);
      }
      q.length = 0;
    }
    avatar.update(step, moving, false, z.animPhase, 0, false, 0, undefined, { speed: ud.speedEma, kind: z.kind });
    return;
  }

  if (lod === 'reduced') {
    avatar.vrm.update(dt);
    return;
  }

  avatar.update(dt, moving && z.attackAnim <= 0, false, z.animPhase, z.animPhase * 0.35, false, 0, undefined, {
    kind: z.kind,
    attackAnim: z.attackAnim,
    skill: z.activeSkill,
  });
  // Ensure normalized arm pose lands on the raw skinned mesh this frame.
  avatar.vrm.humanoid?.update();
}

interface ZombieAnimEvent {
  kind: 'act' | 'hit' | 'spawn';
  seg?: ClipSeg;
  dur: number;
  priority?: number;
}
interface ZombieAnimState {
  lastPos?: THREE.Vector3;
  speedEma?: number;
  animQueue?: ZombieAnimEvent[];
  animAcc?: number;
  animTick?: number;
}

/** Queue a clip one-shot for a zombie (applied on its next animation update). */
export function queueZombieAnim(z: ZombieVisual, ev: ZombieAnimEvent): void {
  const ud = z.root.userData as ZombieAnimState;
  (ud.animQueue ??= []).push(ev);
}

/**
 * Detach the zombie's skinned avatar as a corpse that plays its death clip, then
 * sinks into the ground. Returns false when the zombie has no clip avatar (caller
 * removes it as before).
 */
export function spawnZombieCorpse(z: ZombieVisual, scene: THREE.Scene, corpses: ZombieCorpse[], max = 8): boolean {
  const avatar = (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (!avatar?.zombieAnim || !avatar.root.visible || corpses.length >= max) return false;
  z.root.updateMatrixWorld(true);
  const holder = new THREE.Group();
  z.root.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale);
  holder.position.y = 0;
  holder.add(avatar.root);
  scene.add(holder);
  const dur = avatar.zombieAnim.die();
  delete (z as ZombieVisual & { vrm?: VrmAvatarHandle }).vrm;
  liveZombieVrm = Math.max(0, liveZombieVrm - 1);
  corpses.push({ holder, avatar, t: 0, hold: Math.max(1.2, dur) + 2.2 });
  return true;
}

export interface ZombieCorpse {
  holder: THREE.Group;
  avatar: VrmAvatarHandle;
  t: number;
  hold: number;
}

export function tickZombieCorpses(corpses: ZombieCorpse[], dt: number): void {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i]!;
    c.t += dt;
    if (c.t < c.hold + 1.4) {
      if (c.t < c.hold - 2.0) c.avatar.update(dt, false, false, 0, 0, false, 0, undefined, { speed: 0 });
      if (c.t > c.hold) c.holder.position.y = -((c.t - c.hold) / 1.4) * 0.9;
      continue;
    }
    c.avatar.dispose();
    c.holder.removeFromParent();
    corpses.splice(i, 1);
  }
}

/** Death / revive presentation: clip death when the avatar has an animator, else hide. */
export function setOperativeDead(op: OperativeVisual, dead: boolean): void {
  const avatar = (op as OperativeVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (avatar?.animator) {
    if (dead) avatar.animator.die();
    else avatar.animator.revive();
    op.root.visible = true;
    op.gun.visible = !dead;
    return;
  }
  op.root.visible = !dead;
}

export type OperativeActionKind = 'throw' | 'shout' | 'shove' | 'deploy' | 'kick' | 'impact' | 'knockdown' | 'roll' | 'radio' | 'shock';

let radioMesh: THREE.Group | null = null;
function radioProp(): THREE.Group {
  if (!radioMesh) {
    radioMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.15, 0.032), new THREE.MeshStandardMaterial({ color: 0x23261f, roughness: 0.6, metalness: 0.2 }));
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.11, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    ant.position.set(0.016, 0.125, 0);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.004), new THREE.MeshBasicMaterial({ color: 0x40ff60 }));
    led.position.set(-0.012, 0.06, 0.017);
    radioMesh.add(body, ant, led);
  }
  return radioMesh.clone();
}

/** Take the radio out, call in support, put it away (hides the gun meanwhile). */
function radioCall(op: OperativeVisual, an: OperativeAnimator): boolean {
  const av = (op as OperativeVisual & { vrm?: VrmAvatarHandle }).vrm;
  const ok = an.playAction('pointFwd', 0.25, 1.5, 0.7, [{ id: 'radioCall', from: 2.0, to: 4.4, dur: 2.2 }]);
  if (!ok || !av?.rightHand) return ok;
  const hand = av.rightHand;
  const radio = radioProp();
  av.root.updateMatrixWorld(true);
  const hs = hand.getWorldScale(new THREE.Vector3()).x / Math.max(1e-6, av.root.getWorldScale(new THREE.Vector3()).x);
  radio.scale.setScalar(1 / hs);
  radio.position.set(0.02 / hs, 0.06 / hs, 0.03 / hs);
  const showRadio = () => {
    hand.add(radio);
    op.gun.visible = false;
  };
  const done = () => {
    radio.removeFromParent();
    op.gun.visible = true;
  };
  setTimeout(showRadio, 600);
  setTimeout(done, 2850);
  return ok;
}
/** Full-body Mixamo action for ability casts and heavy hits (no-op on avatars without clips). */
export function operativeAction(op: OperativeVisual, kind: OperativeActionKind): boolean {
  const an = (op as OperativeVisual & { vrm?: VrmAvatarHandle }).vrm?.animator;
  if (!an || !op.alive) return false;
  switch (kind) {
    case 'throw':
      return an.playAction('castThrow', 0.85, 2.45, 0.78);
    case 'shout':
      return an.playAction('castShout', 0.05, 1.8, 1.05);
    case 'shove':
      return an.playAction('castShove', 0.95, 2.3, 0.7);
    case 'kick':
      return an.playAction('castKick', 0.6, 2.35, 0.85);
    case 'deploy':
      return an.playAction('kneelDown', 0, 0.93, 0.38, [{ id: 'kneelUp', from: 0, to: 1.23, dur: 0.55 }]);
    case 'impact':
      if (an.acting > 0.3) return false;
      return an.playAction('impactBig', 0.05, 1.5, 0.75);
    case 'knockdown':
      return an.playAction('knockdown', 0.25, 2.5, 1.4);
    case 'roll':
      return an.playAction('castRoll', 0.15, 1.9, 0.62);
    case 'radio':
      return radioCall(op, an);
    case 'shock':
      if (an.acting > 0.3) return false;
      return an.playAction('electrocuted', 0.1, 1.6, 1.0);
  }
}

export type OperativeAnimEvent = 'shot' | 'hit' | 'ability' | 'dash' | 'cast';

/** Gameplay → animation one-shot trigger (fire, take damage, cast ability). */
export function bumpOperativeAnim(op: OperativeVisual, kind: OperativeAnimEvent): void {
  const key = `anim_${kind}`;
  op.root.userData[key] = ((op.root.userData[key] as number) ?? 0) + 1;
}

const _velW = new THREE.Vector3();
const _axisX = new THREE.Vector3();
const _axisZ = new THREE.Vector3();

function operativeAnimInput(op: OperativeVisual, dt: number): OperativeAnimInput {
  const ud = op.root.userData as {
    animPrev?: THREE.Vector3;
    animVel?: THREE.Vector3;
    anim_shot?: number;
    anim_hit?: number;
    anim_ability?: number;
    anim_dash?: number;
    anim_cast?: number;
  };
  const pos = op.root.position;
  if (!ud.animPrev) ud.animPrev = pos.clone();
  if (!ud.animVel) ud.animVel = new THREE.Vector3();
  _velW.copy(pos).sub(ud.animPrev).divideScalar(Math.max(1 / 240, dt));
  _velW.y = 0;
  ud.animPrev.copy(pos);
  // Knockback / teleports produce huge one-frame spikes — clamp, then smooth.
  if (_velW.lengthSq() > 14 * 14) _velW.setLength(op.moveSpeed);
  ud.animVel.lerp(_velW, 1 - Math.exp(-14 * dt));

  _axisZ.set(0, 0, 1).applyQuaternion(op.root.quaternion);
  _axisX.set(1, 0, 0).applyQuaternion(op.root.quaternion);
  return {
    // Three/Mixamo: facing +Z, the character's left is local +X
    localVelX: ud.animVel.dot(_axisX),
    localVelZ: ud.animVel.dot(_axisZ),
    shotSerial: ud.anim_shot ?? 0,
    hitSerial: ud.anim_hit ?? 0,
    abilitySerial: ud.anim_ability ?? 0,
    dashSerial: ud.anim_dash ?? 0,
    castSerial: ud.anim_cast ?? 0,
    reloading: op.reloading,
    reloadTime: op.weapon.reloadTime,
    alive: op.alive,
  };
}

export function updateOperativeVrm(
  op: OperativeVisual,
  dt: number,
  moving: boolean,
  aiming: boolean,
  reloading = false,
): void {
  const avatar = (op as OperativeVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (!avatar) return;
  if (op.proxy.visible) op.proxy.visible = false;
  const reloadProgress = op.reloading
    ? 1 - op.reloadTimer / Math.max(0.05, op.weapon.reloadTime)
    : 0;
  if (op.meleeSwing > 0) {
    op.meleeSwing += dt / Math.max(0.22, op.weapon.fireRate * 0.9);
    if (op.meleeSwing >= 1) op.meleeSwing = 0;
  }
  avatar.update(dt, moving, aiming, op.animPhase, op.breathPhase, reloading, reloadProgress, {
    grip: op.weapon.grip,
    meleeSwing: op.meleeSwing,
    fireKick: Math.min(1, op.recoil * 2.2),
    anim: avatar.animator ? operativeAnimInput(op, dt) : undefined,
  });
  const isRig = (avatar.vrm as unknown as { isHumanoidRig?: boolean }).isHumanoidRig === true;
  if (isRig && op.gun.userData.vrmBound && !op.weapon.melee) {
    // proxies → raw bones, then seat the gun and pull the support hand onto it
    avatar.vrm.update(0);
    op.gun.userData.rigHeld = true;
    const ud = op.gun.userData as { ikW?: number };
    const free = avatar.animator?.freeHand ?? 0;
    const want = reloading || !op.alive ? 0 : 1 - free;
    ud.ikW = THREE.MathUtils.damp(ud.ikW ?? want, want, 12, dt);
    const pitch = reloading ? 0.55 + reloadProgress * 0.3 : 0.06 + op.recoil * 0.25;
    const rg = op.gun.userData.rigGrip as THREE.Vector3 | undefined;
    if (rg) op.gun.position.copy(rg);
    holdGun(avatar.vrm as unknown as HumanoidRig, op.root, op.gun, pitch, ud.ikW);
    return;
  }
  op.gun.userData.rigHeld = false;
  alignGunToAim(op, op.recoil, reloading ? reloadProgress : -1);
  // Second pass lets VRM humanoid push normalized pose → raw skeleton after gun align
  avatar.vrm.update(0);
}
