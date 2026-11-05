import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Generic humanoid rig for non-VRM skinned GLBs (Rocketbox avatars converted by
 * scripts/rocketbox/convert-rocketbox.mjs).
 *
 * It exposes the small subset of the three-vrm `VRM` API the game already uses
 * (`scene`, `humanoid.getNormalizedBoneNode`, `humanoid.update`, `update`, `meta`)
 * so Mixamo clips and the procedural zombie poses drive Rocketbox bones unchanged.
 *
 * Normalized proxies have identity rest = T-pose, exactly like VRM normalized bones.
 * Each frame: Nw(b) = Nw(humanParent) * q(b); rawWorld(b) = Nw(b) * T-pose world(b);
 * raw.local = rawParentWorld⁻¹ * rawWorld(b). This tolerates raw hierarchies that differ
 * from the humanoid one (Biped thighs hang off the spine, clavicles off the neck).
 *
 * Templates are parsed once per URL; instances are `SkeletonUtils.clone` copies that
 * share geometry, textures and materials (cheap enough for crowds).
 */

const HUMAN_PARENT: Record<string, string | null> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  upperChest: 'chest',
  neck: 'upperChest',
  head: 'neck',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  leftFoot: 'leftLowerLeg',
  leftToes: 'leftFoot',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
  rightFoot: 'rightLowerLeg',
  rightToes: 'rightFoot',
};
for (const side of ['left', 'right']) {
  HUMAN_PARENT[`${side}Shoulder`] = 'upperChest';
  HUMAN_PARENT[`${side}UpperArm`] = `${side}Shoulder`;
  HUMAN_PARENT[`${side}LowerArm`] = `${side}UpperArm`;
  HUMAN_PARENT[`${side}Hand`] = `${side}LowerArm`;
  HUMAN_PARENT[`${side}ThumbMetacarpal`] = `${side}Hand`;
  HUMAN_PARENT[`${side}ThumbProximal`] = `${side}ThumbMetacarpal`;
  HUMAN_PARENT[`${side}ThumbDistal`] = `${side}ThumbProximal`;
  for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
    HUMAN_PARENT[`${side}${f}Proximal`] = `${side}Hand`;
    HUMAN_PARENT[`${side}${f}Intermediate`] = `${side}${f}Proximal`;
    HUMAN_PARENT[`${side}${f}Distal`] = `${side}${f}Intermediate`;
  }
}

export interface RigMeta {
  rig: string;
  humanoid: Record<string, { node: string; wq: number[] }>;
  hipsHeight: number;
  footY: number;
}

interface RigTemplate {
  scene: THREE.Object3D;
  meta: RigMeta;
}

const loader = new GLTFLoader();
const templates = new Map<string, Promise<RigTemplate>>();

export function isRigUrl(url: string): boolean {
  return /\.glb(\?|$)/i.test(url);
}

export function loadRigTemplate(url: string): Promise<RigTemplate> {
  let job = templates.get(url);
  if (!job) {
    job = loader.loadAsync(url).then((gltf) => {
      const meta = (gltf.scene.userData as { protocolZ?: RigMeta }).protocolZ;
      if (!meta?.humanoid) throw new Error(`${url}: missing protocolZ humanoid metadata`);
      gltf.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat.map) mat.map.anisotropy = 4;
        }
      });
      return { scene: gltf.scene, meta };
    });
    job.catch(() => templates.delete(url));
    templates.set(url, job);
  }
  return job;
}

interface RigBone {
  name: string;
  raw: THREE.Object3D;
  proxy: THREE.Object3D;
  tposeWorld: THREE.Quaternion;
  humanParent: RigBone | null;
  /** raw parent, if it is itself a rig bone */
  rawParent: RigBone | null;
  /** model-frame world rotation of a non-rig raw parent (static) */
  staticParentWorld: THREE.Quaternion;
  world: THREE.Quaternion;
  nWorld: THREE.Quaternion;
}

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class HumanoidRig {
  /** Mimics VRM.scene */
  readonly scene: THREE.Object3D;
  readonly meta = { metaVersion: '1' as const };
  readonly lookAt = undefined;
  readonly isHumanoidRig = true;
  /** Retarget hint for animLibrary (model units). */
  readonly hipsHeight: number;
  readonly humanoid: {
    getNormalizedBoneNode: (name: string) => THREE.Object3D | null;
    getRawBoneNode: (name: string) => THREE.Object3D | null;
    update: () => void;
  };
  /**
   * Procedural poses in this codebase were tuned on VRM0 avatars (normalized frame faces -Z).
   * Set true when the proxies are driven by that code; false for Mixamo clips (VRM1 frame).
   */
  flipXZ = false;

  private readonly order: RigBone[] = [];
  private readonly byName = new Map<string, RigBone>();
  private readonly proxyRoot: THREE.Object3D;
  private readonly hipsParentInv = new THREE.Matrix4();
  private readonly footY: number;

  constructor(scene: THREE.Object3D, meta: RigMeta) {
    this.scene = scene;
    this.hipsHeight = meta.hipsHeight;
    this.footY = meta.footY;
    scene.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const modelWorldQ = (o: THREE.Object3D) => {
      _m.multiplyMatrices(rootInv, o.matrixWorld);
      return new THREE.Quaternion().setFromRotationMatrix(_m.extractRotation(_m));
    };

    this.proxyRoot = new THREE.Group();
    this.proxyRoot.name = 'humanoid-proxies';
    this.proxyRoot.visible = false;
    scene.add(this.proxyRoot);

    const rawToRig = new Map<THREE.Object3D, RigBone>();
    for (const [name, h] of Object.entries(meta.humanoid)) {
      const raw = scene.getObjectByName(h.node);
      if (!raw) continue;
      const proxy = new THREE.Object3D();
      proxy.name = `N_${name}`;
      this.proxyRoot.add(proxy);
      const rb: RigBone = {
        name,
        raw,
        proxy,
        tposeWorld: new THREE.Quaternion().fromArray(h.wq),
        humanParent: null,
        rawParent: null,
        staticParentWorld: new THREE.Quaternion(),
        world: new THREE.Quaternion(),
        nWorld: new THREE.Quaternion(),
      };
      this.byName.set(name, rb);
      rawToRig.set(raw, rb);
    }
    for (const rb of this.byName.values()) {
      let hp = HUMAN_PARENT[rb.name] ?? null;
      while (hp && !this.byName.has(hp)) hp = HUMAN_PARENT[hp] ?? null;
      rb.humanParent = hp ? this.byName.get(hp)! : null;
      const parent = rb.raw.parent;
      rb.rawParent = parent ? (rawToRig.get(parent) ?? null) : null;
      if (!rb.rawParent && parent) rb.staticParentWorld.copy(modelWorldQ(parent));
    }
    // raw hierarchy order (parents first)
    scene.traverse((o) => {
      const rb = rawToRig.get(o);
      if (rb) this.order.push(rb);
    });

    const hips = this.byName.get('hips');
    if (hips?.raw.parent) {
      _m.multiplyMatrices(rootInv, hips.raw.parent.matrixWorld);
      this.hipsParentInv.copy(_m).invert();
      // proxy hips rest position = raw rest position in model frame, relative to the ground
      hips.raw.getWorldPosition(_v).applyMatrix4(rootInv);
      hips.proxy.position.set(_v.x, _v.y - this.footY, _v.z);
    }

    this.humanoid = {
      getNormalizedBoneNode: (n) => this.byName.get(n)?.proxy ?? null,
      getRawBoneNode: (n) => this.byName.get(n)?.raw ?? null,
      update: () => this.apply(),
    };
  }

  /** proxies → raw bones */
  apply(): void {
    for (const rb of this.order) {
      _q.copy(rb.proxy.quaternion);
      if (this.flipXZ) {
        _q.x = -_q.x;
        _q.z = -_q.z;
      }
      if (rb.humanParent) rb.nWorld.multiplyQuaternions(rb.humanParent.nWorld, _q);
      else rb.nWorld.copy(_q);
      rb.world.multiplyQuaternions(rb.nWorld, rb.tposeWorld);
      const pw = rb.rawParent ? rb.rawParent.world : rb.staticParentWorld;
      rb.raw.quaternion.copy(pw).invert().multiply(rb.world);
    }
    const hips = this.byName.get('hips');
    if (hips) {
      const p = hips.proxy.position;
      _v.set(p.x, p.y + this.footY, p.z).applyMatrix4(this.hipsParentInv);
      hips.raw.position.copy(_v);
    }
  }

  /** Mimics VRM.update(dt) */
  update(_dt: number): void {
    this.apply();
  }

  bone(name: string): THREE.Object3D | null {
    return this.byName.get(name)?.raw ?? null;
  }
}

/** Fresh instance sharing geometry/material/texture with the template. */
export async function instantiateRig(url: string): Promise<HumanoidRig> {
  const t = await loadRigTemplate(url);
  const scene = cloneSkinned(t.scene);
  return new HumanoidRig(scene, t.meta);
}
