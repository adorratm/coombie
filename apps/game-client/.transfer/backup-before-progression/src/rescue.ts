import * as THREE from 'three';
import { attachVrmToOperative } from './avatars';
import { createOperative, type OperativeVisual } from './characters';
import { resolveCircleAabbs, type Aabb } from './collision';
import type { HealthBar } from './fx';
import { rescueRoster, type OperativeRosterDef } from './roster';

/** Solo rescue cadence — paced for an 8-rifle roster */
export const RESCUE_SLOT_INTERVAL_SEC = 90;
export const RESCUE_WINDOW_SEC = 35;
export const RESCUE_RETRY_SEC = 90;
export const RESCUE_RADIUS = 2.4;
export const MAX_SQUAD_SIZE = 8;

export type RescueStatus = 'locked' | 'active' | 'cooldown' | 'recruited';

export type AllyTemplate = OperativeRosterDef;

export interface RescueSlot {
  template: AllyTemplate;
  /** Sim-time when this recruit opportunity unlocks */
  unlockAt: number;
  status: RescueStatus;
  /** Seconds left in active window or cooldown */
  timer: number;
  captive: OperativeVisual | null;
  beacon: THREE.Group | null;
}

export interface RescueHudInfo {
  name: string;
  status: RescueStatus;
  timer: number;
  unlockAt: number;
}

export const ALLY_TEMPLATES: AllyTemplate[] = rescueRoster();

export function createRescueSlots(): RescueSlot[] {
  return ALLY_TEMPLATES.map((template, i) => ({
    template,
    unlockAt: RESCUE_SLOT_INTERVAL_SEC * (i + 1),
    status: 'locked' as const,
    timer: 0,
    captive: null,
    beacon: null,
  }));
}

function makeBeacon(color: number): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1.05, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.35, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.07;
  pulse.name = 'pulse';
  g.add(ring, pulse);
  return g;
}

function spawnCaptivePose(op: OperativeVisual): void {
  op.leftLeg.rotation.x = 1.1;
  op.rightLeg.rotation.x = -0.2;
  op.leftArm.rotation.x = -0.4;
  op.rightArm.rotation.x = -0.6;
  op.body.rotation.x = 0.25;
  op.root.position.y = 0;
  op.alive = false;
  op.root.visible = true;
  op.healthBar.setVisible(true);
  op.healthBar.setRatio(0.35);
  op.hp = op.maxHp * 0.35;
}

export function spawnRescueCaptive(opts: {
  slot: RescueSlot;
  scene: THREE.Scene;
  playerPos: THREE.Vector3;
  colliders: readonly Aabb[];
  healthBars: HealthBar[];
  bound: number;
}): OperativeVisual {
  const { slot, scene, playerPos, colliders, healthBars, bound } = opts;
  clearRescueVisuals(slot, scene, healthBars);

  const t = slot.template;
  const op = createOperative({
    color: t.accent,
    scale: t.scale,
    isPlayer: false,
    moveSpeed: t.speed,
    weaponIndex: t.weaponIndex,
    name: t.name,
    maxHp: t.hp,
    gender: t.gender,
    avatarUrl: t.avatarUrl,
    rosterId: t.id,
    classId: t.classId,
  });

  const ang = Math.random() * Math.PI * 2;
  const dist = 22 + Math.random() * 18;
  let x = THREE.MathUtils.clamp(playerPos.x + Math.cos(ang) * dist, -bound, bound);
  let z = THREE.MathUtils.clamp(playerPos.z + Math.sin(ang) * dist, -bound, bound);
  const resolved = resolveCircleAabbs(x, z, 0.7, colliders);
  op.root.position.set(resolved.x, 0, resolved.z);
  spawnCaptivePose(op);

  const beacon = makeBeacon(t.accent);
  beacon.position.copy(op.root.position);
  scene.add(op.root, beacon);
  healthBars.push(op.healthBar);

  slot.captive = op;
  slot.beacon = beacon;
  slot.status = 'active';
  slot.timer = RESCUE_WINDOW_SEC;
  void attachVrmToOperative(op, t.gender).then((avatar) => {
    if (!avatar) op.proxy.visible = true;
  });
  return op;
}

export function clearRescueVisuals(
  slot: RescueSlot,
  scene: THREE.Scene,
  healthBars: HealthBar[],
): void {
  if (slot.captive) {
    const idx = healthBars.indexOf(slot.captive.healthBar);
    if (idx >= 0) healthBars.splice(idx, 1);
    slot.captive.healthBar.dispose();
    scene.remove(slot.captive.root);
    slot.captive = null;
  }
  if (slot.beacon) {
    scene.remove(slot.beacon);
    slot.beacon.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    slot.beacon = null;
  }
}

export function recruitCaptive(
  slot: RescueSlot,
  squad: OperativeVisual[],
  scene: THREE.Scene,
  _healthBars: HealthBar[],
): OperativeVisual | null {
  const captive = slot.captive;
  if (!captive) return null;
  if (squad.length >= MAX_SQUAD_SIZE) return null;

  captive.alive = true;
  captive.hp = captive.maxHp;
  captive.healthBar.setRatio(1);
  captive.healthBar.setVisible(false);
  captive.leftLeg.rotation.set(0, 0, 0);
  captive.rightLeg.rotation.set(0, 0, 0);
  captive.leftArm.rotation.set(0, 0, 0);
  captive.rightArm.rotation.set(0, 0, 0);
  captive.body.rotation.set(0, 0, 0);
  captive.root.position.y = 0;

  if (slot.beacon) {
    scene.remove(slot.beacon);
    slot.beacon = null;
  }
  slot.captive = null;
  slot.status = 'recruited';
  slot.timer = 0;
  squad.push(captive);
  return captive;
}

export function getRescueHud(slots: RescueSlot[], simTime: number): RescueHudInfo[] {
  return slots.map((s) => ({
    name: s.template.name,
    status: s.status,
    timer: s.timer,
    unlockAt: Math.max(0, s.unlockAt - simTime),
  }));
}

export function tickRescueSystem(opts: {
  slots: RescueSlot[];
  simTime: number;
  dt: number;
  scene: THREE.Scene;
  player: OperativeVisual;
  squad: OperativeVisual[];
  colliders: readonly Aabb[];
  healthBars: HealthBar[];
  bound: number;
}): { spawned: boolean; rescued: boolean; retrying: boolean; failed: boolean } {
  const { slots, simTime, dt, scene, player, squad, colliders, healthBars, bound } = opts;
  let spawned = false;
  let rescued = false;
  let retrying = false;
  let failed = false;

  for (const slot of slots) {
    if (slot.status === 'recruited') continue;

    if (slot.status === 'locked' && simTime >= slot.unlockAt && squad.length < MAX_SQUAD_SIZE) {
      spawnRescueCaptive({ slot, scene, playerPos: player.root.position, colliders, healthBars, bound });
      spawned = true;
      continue;
    }

    if (slot.status === 'cooldown') {
      slot.timer -= dt;
      if (slot.timer <= 0 && squad.length < MAX_SQUAD_SIZE) {
        spawnRescueCaptive({ slot, scene, playerPos: player.root.position, colliders, healthBars, bound });
        retrying = true;
      }
      continue;
    }

    if (slot.status === 'active' && slot.captive && slot.beacon) {
      slot.timer -= dt;
      const pulse = slot.beacon.getObjectByName('pulse') as THREE.Mesh | undefined;
      if (pulse) {
        const s = 1 + Math.sin(simTime * 4) * 0.12;
        pulse.scale.set(s, s, s);
      }

      const dist = player.root.position.distanceTo(slot.captive.root.position);
      if (dist <= RESCUE_RADIUS) {
        const joined = recruitCaptive(slot, squad, scene, healthBars);
        if (joined) rescued = true;
        continue;
      }

      if (slot.timer <= 0) {
        clearRescueVisuals(slot, scene, healthBars);
        slot.status = 'cooldown';
        slot.timer = RESCUE_RETRY_SEC;
        failed = true;
      }
    }
  }

  return { spawned, rescued, retrying, failed };
}
