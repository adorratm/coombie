import * as THREE from 'three';

const MIN_LOOK_DIST_SQ = 0.0225; // 0.15m

/** Yaw-only facing — avoids Object3D.lookAt NaN when target ≈ self. */
export function faceToward(
  obj: THREE.Object3D,
  targetX: number,
  targetZ: number,
  minDistSq = MIN_LOOK_DIST_SQ,
): boolean {
  const dx = targetX - obj.position.x;
  const dz = targetZ - obj.position.z;
  const distSq = dx * dx + dz * dz;
  if (distSq < minDistSq || !Number.isFinite(distSq)) return false;
  obj.rotation.x = 0;
  obj.rotation.z = 0;
  obj.rotation.y = Math.atan2(dx, dz);
  return true;
}

export function sanitizeObject3D(obj: THREE.Object3D): void {
  if (!Number.isFinite(obj.position.x) || !Number.isFinite(obj.position.z)) {
    obj.position.x = 0;
    obj.position.z = 0;
  }
  if (!Number.isFinite(obj.position.y)) obj.position.y = 0;
  if (
    !Number.isFinite(obj.quaternion.x) ||
    !Number.isFinite(obj.quaternion.y) ||
    !Number.isFinite(obj.quaternion.z) ||
    !Number.isFinite(obj.quaternion.w)
  ) {
    obj.quaternion.identity();
    obj.rotation.set(0, 0, 0);
  }
}
