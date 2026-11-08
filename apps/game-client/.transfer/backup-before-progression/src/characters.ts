import * as THREE from 'three';
import type { AvatarGender } from './avatars';
import { bindGunToVrmHand, updateOperativeVrm, updateZombieVrm, type VrmAvatarHandle } from './avatars';
import { createHealthBar, type HealthBar } from './fx';
import { fabricMap, fleshMap, metalMap, stdMat } from './materials';
import type { ClassId } from './progression';
import type { OperativeId } from './roster';
import type { ZombieVrmLod } from './vrmLod';
import {
  attachWeaponMesh,
  weaponByIndex,
  WEAPONS,
  type WeaponDef,
  type WeaponId,
} from './weapons';
import type { ActiveStatus } from './statusEffects';
import type { ZombieSkillId } from './zombieCombat';
import { sampleZombieGait } from './zombieGait';
import { rollZombieStats, type ZombieKind } from './zombieKinds';

export type { ZombieKind };

export interface OperativeVisual {
  root: THREE.Group;
  /** Procedural body — hidden when VRM attaches */
  proxy: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  gun: THREE.Group;
  muzzleLight: THREE.PointLight;
  muzzlePoint: THREE.Object3D;
  color: number;
  moveSpeed: number;
  isPlayer: boolean;
  gender: AvatarGender;
  /** Unique VRM path for this operative */
  avatarUrl: string;
  rosterId?: OperativeId;
  classId?: ClassId;
  weaponIndex: number;
  weapon: WeaponDef;
  fireCooldown: number;
  ammo: number;
  reloading: boolean;
  reloadTimer: number;
  recoil: number;
  /** 1 → 0 during a melee swing cycle */
  meleeSwing: number;
  animPhase: number;
  breathPhase: number;
  moveBlend: number;
  hp: number;
  maxHp: number;
  invuln: number;
  alive: boolean;
  healthBar: HealthBar;
  name: string;
}

export interface ZombieVisual {
  root: THREE.Group;
  /** Procedural mesh group — hidden when VRM attaches */
  proxy: THREE.Group;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  speed: number;
  hp: number;
  maxHp: number;
  kind: ZombieKind;
  wobble: number;
  animPhase: number;
  attackDamage: number;
  attackCooldown: number;
  /** 0 = idle; 0→1 attack cycle */
  attackAnim: number;
  attackDuration: number;
  activeSkill: ZombieSkillId;
  skillCooldown: number;
  attackImpactDone: boolean;
  hurtFlash: number;
  healthBar: HealthBar;
  /** Top-down role disc for special kinds (null for grunt). */
  roleMarker: THREE.Mesh | null;
  xpValue: number;
  /** Stable phase for staggered VRM LOD updates */
  lodPhase: number;
  /** Snapshot of spawn speed for chill restore */
  baseSpeed: number;
  statuses: ActiveStatus[];
}

function enableShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function limb(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  radial = 10,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial),
    material,
  );
  mesh.position.y = -height / 2;
  return mesh;
}

/** Two-bone limb for zombie proxy — `userData.lower` is the elbow/knee joint. */
function articulatedLimb(
  upperLen: number,
  lowerLen: number,
  rTop: number,
  rMid: number,
  rBot: number,
  material: THREE.Material,
): THREE.Group {
  const root = new THREE.Group();
  root.add(limb(rTop, rMid, upperLen, material, 8));
  const lower = new THREE.Group();
  lower.position.y = -upperLen;
  lower.add(limb(rMid, rBot, lowerLen, material, 8));
  root.add(lower);
  root.userData.lower = lower;
  return root;
}

function lowerJoint(part: THREE.Object3D): THREE.Object3D | null {
  const lower = part.userData.lower as THREE.Object3D | undefined;
  return lower ?? null;
}

export function createOperative(opts: {
  color: number;
  scale?: number;
  isPlayer?: boolean;
  moveSpeed?: number;
  weaponIndex?: number;
  name?: string;
  maxHp?: number;
  gender?: AvatarGender;
  avatarUrl?: string;
  rosterId?: OperativeId;
  classId?: ClassId;
}): OperativeVisual {
  const s = opts.scale ?? 1;
  const root = new THREE.Group();
  root.userData.kind = 'operative';
  const proxy = new THREE.Group();
  proxy.name = 'proxy';
  root.add(proxy);

  const accentHex = opts.color;
  const armor = stdMat(metalMap(), 0x2a323a, {
    metalness: 0.55,
    roughness: 0.42,
    emissive: accentHex,
    emissiveIntensity: 0.08,
  });
  const pants = stdMat(fabricMap([36, 42, 48]), 0xffffff, { metalness: 0.05, roughness: 0.88 });
  const boots = stdMat(null, 0x12161a, { metalness: 0.2, roughness: 0.7 });
  const skin = stdMat(fleshMap([196, 160, 126]), 0xffffff, { metalness: 0.02, roughness: 0.65 });
  const accent = stdMat(null, accentHex, {
    metalness: 0.35,
    roughness: 0.45,
    emissive: accentHex,
    emissiveIntensity: 0.45,
  });
  const dark = stdMat(null, 0x0c1014, { metalness: 0.25, roughness: 0.55 });

  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.16 * s, 0.42 * s), boots);
  bootL.position.set(-0.18 * s, 0.09 * s, 0.04 * s);
  const bootR = bootL.clone();
  bootR.position.x = 0.18 * s;
  proxy.add(bootL, bootR);

  const leftLeg = new THREE.Group();
  leftLeg.add(limb(0.11 * s, 0.13 * s, 0.58 * s, pants));
  leftLeg.position.set(-0.18 * s, 0.74 * s, 0);
  proxy.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.add(limb(0.11 * s, 0.13 * s, 0.58 * s, pants));
  rightLeg.position.set(0.18 * s, 0.74 * s, 0);
  proxy.add(rightLeg);

  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.34 * s, 0.28 * s, 12), dark);
  hips.position.y = 0.9 * s;
  proxy.add(hips);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.34 * s, 0.04 * s, 6, 16), accent);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.02 * s;
  proxy.add(belt);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32 * s, 0.55 * s, 6, 12), armor);
  torso.position.y = 1.42 * s;
  torso.userData.baseY = 1.42 * s;
  proxy.add(torso);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.42 * s, 0.18 * s), accent);
  vest.position.set(0, 1.48 * s, 0.22 * s);
  proxy.add(vest);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.42 * s, 0.18 * s), dark);
  pack.position.set(0, 1.4 * s, -0.26 * s);
  proxy.add(pack);

  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 10, 8), armor);
  shoulderL.position.set(-0.42 * s, 1.72 * s, 0);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 0.42 * s;
  proxy.add(shoulderL, shoulderR);

  const leftArm = new THREE.Group();
  leftArm.add(limb(0.08 * s, 0.09 * s, 0.55 * s, armor));
  leftArm.position.set(-0.46 * s, 1.6 * s, 0);
  proxy.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.add(limb(0.08 * s, 0.09 * s, 0.55 * s, armor));
  rightArm.position.set(0.46 * s, 1.6 * s, 0);
  proxy.add(rightArm);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.09 * s, 0.12 * s, 8), skin);
  neck.position.y = 1.88 * s;
  proxy.add(neck);

  const head = new THREE.Group();
  head.position.y = 2.12 * s;
  head.userData.baseY = 2.12 * s;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 14, 12), dark);
  helmet.scale.set(1, 1.05, 1.05);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.36 * s, 0.1 * s, 0.08 * s),
    stdMat(null, accentHex, { metalness: 0.8, roughness: 0.2, emissive: accentHex, emissiveIntensity: 0.85 }),
  );
  visor.position.set(0, -0.02 * s, 0.2 * s);
  head.add(helmet, visor);
  proxy.add(head);

  const gun = new THREE.Group();
  gun.position.set(0.38 * s, 1.28 * s, 0.42 * s);
  gun.userData.baseY = 1.28 * s;
  gun.userData.baseZ = 0.42 * s;
  root.add(gun);

  const weaponIndex = opts.weaponIndex ?? 0;
  const weapon = weaponByIndex(weaponIndex);
  const muzzlePoint = attachWeaponMesh(gun, weapon, accentHex, s);

  const muzzleLight = new THREE.PointLight(0xffcc66, 0, 8);
  // Only the player's muzzle light lives in the scene. Every PointLight in the scene
  // costs per-pixel work in every lit material, and adding one when an ally /
  // captive spawns mid-run changes the light count → every shader recompiles (big
  // freeze). Allies keep a detached light object so callers can still drive it.
  if (opts.isPlayer) muzzlePoint.add(muzzleLight);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.48 * s, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  root.add(blob);

  if (opts.isPlayer) {
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.52 * s, 0.64 * s, 28),
      new THREE.MeshBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.04;
    root.add(marker);
  }

  const maxHp = opts.maxHp ?? (opts.isPlayer ? 120 : 90);
  const healthBar = createHealthBar({
    width: 1.15 * s,
    y: 2.55 * s,
    fillColor: opts.isPlayer ? 0x6ea8ff : 0x38bdf8,
  });
  healthBar.setRatio(1);
  healthBar.setVisible(false);
  root.add(healthBar.root);

  enableShadows(root);

  leftArm.userData.baseX = leftArm.position.x;
  rightArm.userData.baseX = rightArm.position.x;
  leftLeg.userData.baseY = leftLeg.position.y;
  rightLeg.userData.baseY = rightLeg.position.y;

  const gender: AvatarGender =
    opts.gender ??
    (opts.name === 'VALKYRIE' ||
    opts.name === 'TOX' ||
    opts.name === 'SPARK' ||
    opts.name === 'SHADOW' ||
    opts.name === 'GHOST'
      ? 'female'
      : 'male');

  return {
    root,
    proxy,
    body: torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    gun,
    muzzleLight,
    muzzlePoint,
    color: opts.color,
    moveSpeed: opts.moveSpeed ?? 6.5,
    isPlayer: opts.isPlayer ?? false,
    gender,
    avatarUrl: opts.avatarUrl ?? (gender === 'female' ? '/avatars/rb/op_valkyrie.glb' : '/avatars/rb/op_ironclad.glb'),
    rosterId: opts.rosterId,
    classId: opts.classId,
    weaponIndex,
    weapon,
    fireCooldown: 0,
    ammo: weapon.magSize,
    reloading: false,
    reloadTimer: 0,
    recoil: 0,
    meleeSwing: 0,
    animPhase: Math.random() * Math.PI * 2,
    breathPhase: Math.random() * Math.PI * 2,
    moveBlend: 0,
    hp: maxHp,
    maxHp,
    invuln: 0,
    alive: true,
    healthBar,
    name: opts.name ?? (opts.isPlayer ? 'YOU' : 'ALLY'),
  };
}

export function setOperativeWeapon(op: OperativeVisual, index: number): void {
  op.weaponIndex = index;
  op.weapon = weaponByIndex(index);
  const scale = op.root.scale.x || 1;
  const oldLight = op.muzzleLight;
  op.muzzlePoint = attachWeaponMesh(op.gun, op.weapon, op.color, scale);
  if (op.isPlayer) op.muzzlePoint.add(oldLight);
  op.muzzleLight = oldLight;
  op.fireCooldown = 0.15;
  op.ammo = op.weapon.melee ? 999 : op.weapon.magSize;
  op.reloading = false;
  op.reloadTimer = 0;
  op.meleeSwing = 0;
  const avatar = (op as OperativeVisual & { vrm?: VrmAvatarHandle }).vrm;
  if (avatar) bindGunToVrmHand(op, avatar);
}

export function setOperativeWeaponById(op: OperativeVisual, id: WeaponId): void {
  const fromList = WEAPONS.findIndex((w) => w.id === id);
  setOperativeWeapon(op, fromList >= 0 ? fromList : 0);
}

export function beginReload(op: OperativeVisual): boolean {
  if (!op.alive || op.reloading || op.weapon.melee) return false;
  if (op.ammo >= op.weapon.magSize) return false;
  op.reloading = true;
  op.reloadTimer = op.weapon.reloadTime;
  return true;
}

export function tickReload(op: OperativeVisual, dt: number): boolean {
  if (!op.reloading) return false;
  op.reloadTimer -= dt;
  if (op.reloadTimer > 0) return false;
  op.reloading = false;
  op.reloadTimer = 0;
  op.ammo = op.weapon.magSize;
  return true;
}

export function createZombie(kind: ZombieKind = 'grunt'): ZombieVisual {
  const root = new THREE.Group();
  const proxy = new THREE.Group();
  proxy.name = 'zombie-proxy';
  root.add(proxy);
  const stats = rollZombieStats(kind);
  const { scale } = stats;

  const flesh = stdMat(fleshMap(stats.fleshBase), 0xffffff, {
    metalness: 0.04,
    roughness: 0.82,
    emissive: stats.glow,
    emissiveIntensity: stats.emissiveIntensity,
  });
  const rag = stdMat(fabricMap(stats.clothBase), 0xffffff, { metalness: 0.02, roughness: 0.92 });
  const bone = stdMat(null, 0xc4b49a, { metalness: 0.05, roughness: 0.7 });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: stats.eyeColor,
    emissive: stats.eyeColor,
    emissiveIntensity: 1.2,
    roughness: 0.3,
  });

  const torsoW = kind === 'tank' ? 0.36 : kind === 'runner' ? 0.22 : kind === 'screamer' ? 0.24 : 0.28;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(torsoW * scale, 0.42 * scale, 5, 10), flesh);
  torso.position.y = 0.98 * scale;
  torso.rotation.z = (Math.random() - 0.5) * 0.12;
  proxy.add(torso);

  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.32 * scale, 0.38 * scale, 10), rag);
  shirt.position.y = 0.78 * scale;
  proxy.add(shirt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 12, 10), flesh);
  head.position.set(0.02 * scale, 1.52 * scale, 0.04 * scale);
  head.rotation.z = (Math.random() - 0.5) * 0.35;
  head.scale.set(1, 1.05 + Math.random() * 0.1, 0.95);
  proxy.add(head);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.08 * scale, 0.14 * scale), bone);
  jaw.position.set(0, 1.38 * scale, 0.14 * scale);
  proxy.add(jaw);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035 * scale, 6, 6), eyeMat);
  eyeL.position.set(-0.07 * scale, 1.55 * scale, 0.16 * scale);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08 * scale;
  proxy.add(eyeL, eyeR);

  const armR = kind === 'runner' ? 0.055 : 0.07;
  const armLen = kind === 'runner' ? 0.66 : 0.6;
  // Single-bone arms: clearer forward reach from top-down than nested elbows.
  const leftArm = new THREE.Group();
  leftArm.add(limb(armR * scale, (armR + 0.01) * scale, armLen * scale, flesh, 8));
  leftArm.position.set(-0.34 * scale, 1.2 * scale, 0.16 * scale);
  leftArm.rotation.x = -Math.PI / 2;
  leftArm.rotation.z = 0.18;
  proxy.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.add(limb(armR * scale, (armR + 0.01) * scale, armLen * scale, flesh, 8));
  rightArm.position.set(0.34 * scale, 1.2 * scale, 0.16 * scale);
  rightArm.rotation.x = -Math.PI / 2;
  rightArm.rotation.z = -0.18;
  proxy.add(rightArm);

  const legUpper = 0.28 * scale;
  const legLower = 0.26 * scale;
  const leftLeg = articulatedLimb(legUpper, legLower, 0.09 * scale, 0.095 * scale, 0.08 * scale, rag);
  leftLeg.position.set(-0.14 * scale, 0.54 * scale, 0);
  proxy.add(leftLeg);

  const rightLeg = articulatedLimb(legUpper, legLower, 0.09 * scale, 0.095 * scale, 0.08 * scale, rag);
  rightLeg.position.set(0.14 * scale, 0.54 * scale, 0);
  proxy.add(rightLeg);

  if (stats.silhouette === 'boss') {
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.35 * scale, 10, 8), flesh);
    hump.position.set(0, 1.35 * scale, -0.2 * scale);
    proxy.add(hump);
    const spikes = new THREE.Mesh(
      new THREE.ConeGeometry(0.12 * scale, 0.45 * scale, 6),
      stdMat(null, 0x3f0a0a, { metalness: 0.2, roughness: 0.55, emissive: 0xef4444, emissiveIntensity: 0.4 }),
    );
    spikes.position.set(0, 1.85 * scale, 0);
    proxy.add(spikes);
  }

  if (stats.silhouette === 'tank') {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.55 * scale, 0.22 * scale, 0.35 * scale),
      stdMat(null, 0x44403c, { metalness: 0.35, roughness: 0.55, emissive: 0xb45309, emissiveIntensity: 0.25 }),
    );
    pad.position.set(0, 1.25 * scale, 0.05 * scale);
    proxy.add(pad);
  }

  if (stats.silhouette === 'acid') {
    const drip = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 * scale, 8, 6),
      stdMat(null, 0xa3e635, { metalness: 0.1, roughness: 0.35, emissive: 0xa3e635, emissiveIntensity: 0.7 }),
    );
    drip.position.set(0.12 * scale, 1.1 * scale, 0.22 * scale);
    proxy.add(drip);
  }

  if (stats.silhouette === 'screamer') {
    const maw = new THREE.Mesh(
      new THREE.ConeGeometry(0.14 * scale, 0.32 * scale, 8),
      stdMat(null, 0x4a044e, { metalness: 0.1, roughness: 0.45, emissive: 0xd946ef, emissiveIntensity: 0.65 }),
    );
    maw.rotation.x = Math.PI / 2;
    maw.position.set(0, 1.42 * scale, 0.22 * scale);
    proxy.add(maw);
  }

  if (stats.silhouette === 'runner') {
    const streak = new THREE.Mesh(
      new THREE.BoxGeometry(0.07 * scale, 0.42 * scale, 0.07 * scale),
      stdMat(null, 0x164e63, { metalness: 0.25, roughness: 0.4, emissive: 0x22d3ee, emissiveIntensity: 0.8 }),
    );
    streak.position.set(0, 1.32 * scale, -0.16 * scale);
    proxy.add(streak);
    const fin = new THREE.Mesh(
      new THREE.ConeGeometry(0.06 * scale, 0.28 * scale, 5),
      stdMat(null, 0x0e7490, { metalness: 0.2, roughness: 0.45, emissive: 0x67e8f9, emissiveIntensity: 0.55 }),
    );
    fin.rotation.z = Math.PI;
    fin.position.set(0, 1.55 * scale, -0.05 * scale);
    proxy.add(fin);
  }

  // Proxy starts visible; VRM attaches on-demand under LOD/budget (far stay low-poly).
  proxy.visible = true;

  const healthBar = createHealthBar({
    width: stats.barWidth,
    y: stats.barY,
    fillColor: stats.barColor,
  });
  healthBar.setRatio(1);
  root.add(healthBar.root);

  let roleMarker: THREE.Mesh | null = null;
  if (stats.silhouette !== 'none') {
    const radius =
      stats.silhouette === 'boss' ? 0.72 * scale : stats.silhouette === 'tank' ? 0.58 * scale : 0.42 * scale;
    roleMarker = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 20),
      new THREE.MeshBasicMaterial({
        color: stats.barColor,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    roleMarker.rotation.x = -Math.PI / 2;
    roleMarker.position.y = 0.04;
    roleMarker.renderOrder = 1;
    root.add(roleMarker);
  }

  enableShadows(root);

  return {
    root,
    proxy,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    torso,
    head,
    speed: stats.speed,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    kind,
    wobble: kind === 'runner' ? 6 + Math.random() * 3 : 4 + Math.random() * 4,
    animPhase: Math.random() * Math.PI * 2,
    attackDamage: stats.attackDamage,
    attackCooldown: 0,
    attackAnim: 0,
    attackDuration: 0.42,
    activeSkill: 'none',
    skillCooldown: 0,
    attackImpactDone: false,
    hurtFlash: 0,
    healthBar,
    roleMarker,
    xpValue: stats.xpValue,
    lodPhase: Math.floor(Math.random() * 6),
    baseSpeed: stats.speed,
    statuses: [],
  };
}

export function flashZombieHurt(z: ZombieVisual): void {
  z.hurtFlash = 0.18;
  z.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat?.emissive && mat.isMeshStandardMaterial) {
      mat.emissive.setHex(0xff2222);
      mat.emissiveIntensity = 0.85;
    }
  });
}

export function updateZombieHurtFlash(z: ZombieVisual, dt: number): void {
  if (z.hurtFlash <= 0) return;
  z.hurtFlash -= dt;
  if (z.hurtFlash > 0) return;
  z.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat?.emissive && mat.isMeshStandardMaterial) {
      const glow =
        z.kind === 'boss'
          ? 0xb91c1c
          : z.kind === 'tank'
            ? 0xb45309
            : z.kind === 'acid'
              ? 0x84cc16
              : z.kind === 'screamer'
                ? 0xa21caf
                : z.kind === 'runner'
                  ? 0x0e7490
                  : 0x7f1d1d;
      mat.emissive.setHex(glow);
      mat.emissiveIntensity = z.kind === 'grunt' ? 0.12 : 0.35;
    }
  });
}

export function animateOperative(
  op: OperativeVisual,
  _t: number,
  dt: number,
  moving: boolean,
  aiming: boolean,
): void {
  // Smooth move blend so walk starts/stops naturally
  const targetBlend = moving ? 1 : 0;
  op.moveBlend = THREE.MathUtils.damp(op.moveBlend, targetBlend, moving ? 10 : 7, dt);

  const walkSpeed = 9.5 + op.moveBlend * 2.5;
  op.animPhase += dt * (2.2 + walkSpeed * op.moveBlend);
  op.breathPhase += dt * (1.35 + (1 - op.moveBlend) * 0.45);

  const m = op.moveBlend;
  const swing = Math.sin(op.animPhase) * 0.78 * m;
  const swingCos = Math.cos(op.animPhase) * m;
  const stepBob = Math.abs(Math.sin(op.animPhase)) * 0.055 * m;

  // Idle breathe — chest rise + slight shoulder sway
  const breath = Math.sin(op.breathPhase);
  const breathDeep = Math.sin(op.breathPhase * 0.5);
  const breathAmp = 0.022 * (1 - m * 0.65);
  const bodyBaseY = (op.body.userData.baseY as number) ?? 1.42;
  const headBaseY = (op.head.userData.baseY as number) ?? 2.12;

  op.body.position.y = bodyBaseY + breath * breathAmp + stepBob * 0.35;
  op.body.scale.set(
    1 + breath * 0.012 * (1 - m * 0.5),
    1 + breath * 0.02 * (1 - m * 0.5),
    1 + breath * 0.01 * (1 - m * 0.5),
  );
  op.body.rotation.x = THREE.MathUtils.damp(op.body.rotation.x, 0.1 * m + breathDeep * 0.015 * (1 - m), 8, dt);
  op.body.rotation.z = THREE.MathUtils.damp(op.body.rotation.z, swing * 0.06 + breath * 0.012 * (1 - m), 8, dt);

  op.head.position.y = headBaseY + breath * breathAmp * 0.7 + stepBob * 0.5;
  op.head.rotation.x = THREE.MathUtils.damp(op.head.rotation.x, -0.05 * m + breath * 0.02 * (1 - m), 8, dt);
  op.head.rotation.z = THREE.MathUtils.damp(op.head.rotation.z, -swing * 0.05, 8, dt);

  // Legs — walk cycle with lift
  op.leftLeg.rotation.x = THREE.MathUtils.damp(op.leftLeg.rotation.x, swing, 14, dt);
  op.rightLeg.rotation.x = THREE.MathUtils.damp(op.rightLeg.rotation.x, -swing, 14, dt);
  op.leftLeg.rotation.z = swing * 0.07;
  op.rightLeg.rotation.z = -swing * 0.07;
  const legBaseY = (op.leftLeg.userData.baseY as number) ?? 0.74;
  op.leftLeg.position.y = legBaseY + Math.max(0, swingCos) * 0.04 * m;
  op.rightLeg.position.y = legBaseY + Math.max(0, -swingCos) * 0.04 * m;

  // Root bob only from steps (breath is on torso)
  op.root.position.y = stepBob;

  // Procedural arms by grip (hidden when VRM is attached)
  const aimBlend = aiming ? 1 : 0.85;
  const armSwing = swing * 0.12 * m;
  const rp = op.reloading ? 1 - op.reloadTimer / Math.max(0.05, op.weapon.reloadTime) : 0;
  const grip = op.weapon.grip;
  let rightArmX = -1.25 * aimBlend + armSwing;
  let rightArmZ = 0.28 * aimBlend;
  let leftArmX = -1.1 * aimBlend - armSwing * 0.6;
  let leftArmZ = -0.55 * aimBlend;
  if (grip === 'pistol') {
    rightArmX = -0.95 * aimBlend + armSwing;
    rightArmZ = 0.45 * aimBlend;
    leftArmX = -0.35 + armSwing * 0.8;
    leftArmZ = -0.25;
  } else if (grip === 'smg') {
    const oneHand = m > 0.65 ? 1 : 0;
    rightArmX = -1.05 * aimBlend + armSwing;
    rightArmZ = 0.35 * aimBlend;
    leftArmX = THREE.MathUtils.lerp(-1.0 * aimBlend - armSwing * 0.5, -0.4 + armSwing, oneHand);
    leftArmZ = THREE.MathUtils.lerp(-0.45 * aimBlend, -0.2, oneHand);
  } else if (grip === 'melee') {
    const s = op.meleeSwing;
    rightArmX = THREE.MathUtils.lerp(-0.7, -1.6, Math.min(1, s * 1.4)) + armSwing;
    rightArmZ = THREE.MathUtils.lerp(0.55, -0.15, Math.min(1, s * 1.6));
    leftArmX = -0.45 + armSwing * 0.5;
    leftArmZ = -0.3;
  }
  if (op.reloading && grip !== 'melee') {
    if (rp < 0.2) {
      rightArmX = -0.95;
      rightArmZ = 0.35;
      leftArmX = -1.2;
      leftArmZ = -0.45;
    } else if (rp < 0.45) {
      rightArmX = -0.85;
      rightArmZ = 0.4;
      leftArmX = -1.45;
      leftArmZ = -0.65;
    } else if (rp < 0.7) {
      rightArmX = -0.95;
      leftArmX = -1.25;
      leftArmZ = -0.5;
    } else {
      rightArmX = -1.35;
      rightArmZ = 0.25;
      leftArmX = -1.15;
      leftArmZ = -0.55;
    }
  }
  op.rightArm.rotation.x = THREE.MathUtils.damp(op.rightArm.rotation.x, rightArmX, 14, dt);
  op.rightArm.rotation.z = THREE.MathUtils.damp(op.rightArm.rotation.z, rightArmZ, 12, dt);
  op.leftArm.rotation.x = THREE.MathUtils.damp(op.leftArm.rotation.x, leftArmX, 14, dt);
  op.leftArm.rotation.z = THREE.MathUtils.damp(op.leftArm.rotation.z, leftArmZ, 12, dt);

  const hasVrm = !!(op as OperativeVisual & { vrm?: unknown }).vrm;

  // Recoil / gun pose — procedural body only; VRM aligns gun after bones
  op.recoil = THREE.MathUtils.damp(op.recoil, 0, 8, dt);
  if (!hasVrm) {
    op.gun.rotation.x = -op.recoil;
    const baseZ = (op.gun.userData.baseZ as number) ?? 0.42;
    op.gun.position.z = baseZ - op.recoil * 0.35;
    const gunBaseY = (op.gun.userData.baseY as number) ?? 1.28;
    op.gun.position.y = gunBaseY + breath * breathAmp * 0.5;
  }

  updateOperativeVrm(op, dt, moving, aiming, op.reloading);
}

export function animateZombieWalk(
  z: ZombieVisual,
  t: number,
  dt: number,
  moving: boolean,
  lod: ZombieVrmLod = 'full',
): void {
  z.animPhase += dt * (moving ? z.wobble * 1.55 : 1.35);
  const gait = sampleZombieGait({
    animPhase: z.animPhase,
    moving,
    attackAnim: z.attackAnim,
    skill: z.activeSkill,
  });

  if (z.proxy.visible) {
    z.leftLeg.rotation.x = gait.leftUpperLegX;
    z.rightLeg.rotation.x = gait.rightUpperLegX;
    const leftShin = lowerJoint(z.leftLeg);
    const rightShin = lowerJoint(z.rightLeg);
    if (leftShin) leftShin.rotation.x = gait.leftLowerLegX;
    if (rightShin) rightShin.rotation.x = gait.rightLowerLegX;

    // Arms stay near -90° (point +Z); add swing + slight raise — never fold behind.
    z.leftArm.rotation.x = -Math.PI / 2 + gait.swing * 0.22 + (gait.leftUpperArmX + 1.4) * 0.15;
    z.rightArm.rotation.x = -Math.PI / 2 - gait.swing * 0.2 + (gait.rightUpperArmX + 1.4) * 0.15;
    z.leftArm.rotation.z = 0.22 + gait.limp * 0.12;
    z.rightArm.rotation.z = -0.22 - gait.limp * 0.1;
    z.leftArm.rotation.y = 0.08;
    z.rightArm.rotation.y = -0.08;

    z.torso.rotation.x = gait.torsoX * 0.6;
    z.torso.rotation.y = gait.torsoY;
    z.torso.rotation.z = gait.torsoZ * 0.7;
    z.head.rotation.x = gait.headX * 0.5;
    z.head.rotation.y = gait.headY + Math.sin(t * 1.4 + z.wobble) * (moving ? 0.04 : 0.12);
  }
  z.root.position.y = gait.bobY;
  updateZombieVrm(z, dt, moving, lod);
}

/** Legacy walk helper */
export function animateWalk(
  leftLeg: THREE.Object3D,
  rightLeg: THREE.Object3D,
  leftArm: THREE.Object3D,
  rightArm: THREE.Object3D,
  t: number,
  intensity: number,
): void {
  const swing = Math.sin(t * 10) * 0.55 * intensity;
  leftLeg.rotation.x = swing;
  rightLeg.rotation.x = -swing;
  leftArm.rotation.x = -swing * 0.7;
  rightArm.rotation.x = swing * 0.7;
}

export const createLowPolyOperative = createOperative;
export const createLowPolyZombie = createZombie;

export type { WeaponId };
