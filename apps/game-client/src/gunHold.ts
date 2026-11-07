import * as THREE from 'three';

/**
 * Two-handed weapon hold for skinned humanoid rigs (Rocketbox Biped via HumanoidRig).
 *
 * The gun is parented to the right hand (grip seated in the palm) and its barrel is
 * kept on the character's aim direction. The support (left) arm is then pulled onto
 * the gun's `supportPoint` (handguard / pump, or cupping the grip on pistols) with an
 * analytic two-bone IK, so the hand stays on the weapon whatever the clip does.
 * Runs after the rig has written its raw bones for the frame; the rig rewrites them
 * from its proxies every frame, so the correction never accumulates.
 */

export interface BoneSource {
  bone(name: string): THREE.Object3D | null;
}

const _fwd = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _rootQ = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _ident = new THREE.Quaternion();
const _Z = new THREE.Vector3(0, 0, 1);

const _A = new THREE.Vector3();
const _B = new THREE.Vector3();
const _C = new THREE.Vector3();
const _T = new THREE.Vector3();
const _d = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _palm = new THREE.Vector3();
const _knuckle = new THREE.Vector3();
const _support = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);

/** Point the gun's +Z along the root facing, pitched about the root's right axis (positive = muzzle down). */
export function orientGun(root: THREE.Object3D, gun: THREE.Object3D, pitch: number): void {
  const parent = gun.parent;
  if (!parent) return;
  root.getWorldQuaternion(_rootQ);
  _fwd.set(0, 0, 1).applyQuaternion(_rootQ);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
  _fwd.normalize();
  _axis.set(1, 0, 0).applyQuaternion(_rootQ).normalize();
  _q.setFromAxisAngle(_axis, pitch);
  _aim.copy(_fwd).applyQuaternion(_q).normalize();
  _wq.setFromUnitVectors(_Z, _aim);
  parent.getWorldQuaternion(_pq);
  gun.quaternion.copy(_pq.invert().multiply(_wq));
}

function supportPoint(gun: THREE.Object3D): THREE.Object3D | null {
  const cached = gun.userData.supportPoint as THREE.Object3D | undefined;
  if (cached) {
    // the procedural placeholder is swapped for the real model once it loads
    let o: THREE.Object3D | null = cached;
    while (o && o !== gun) o = o.parent;
    if (o === gun) return cached;
  }
  const sp = gun.getObjectByName('supportPoint') ?? null;
  gun.userData.supportPoint = sp ?? undefined;
  return sp;
}

/** Rotate `obj` by a world-space delta (slerped from identity by w). */
function rotateWorld(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number): void {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  if (w < 1) _q.slerpQuaternions(_ident, _q, w);
  obj.getWorldQuaternion(_wq);
  _wq.premultiply(_q);
  if (obj.parent) {
    obj.parent.getWorldQuaternion(_pq);
    obj.quaternion.copy(_pq.invert().multiply(_wq));
  } else obj.quaternion.copy(_wq);
  obj.updateWorldMatrix(false, true);
}

/** Analytic two-bone IK: moves `hand`'s origin onto `target`, elbow kept on its current side (biased down). */
export function twoBoneIK(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, w: number): void {
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(_A);
  lower.getWorldPosition(_B);
  hand.getWorldPosition(_C);
  const a = _B.distanceTo(_A);
  const b = _C.distanceTo(_B);
  if (a < 1e-5 || b < 1e-5) return;
  _d.subVectors(target, _A);
  const dist = _d.length();
  if (dist < 1e-5) return;
  _d.divideScalar(dist);
  const reach = THREE.MathUtils.clamp(dist, Math.abs(a - b) + 1e-4, a + b - 1e-4);

  // bend direction: current elbow side, nudged downward for a natural support arm
  _bend.subVectors(_B, _A);
  _bend.addScaledVector(_d, -_bend.dot(_d));
  const bl = _bend.length();
  if (bl > 1e-5) _bend.divideScalar(bl);
  else _bend.set(0, 0, 0);
  _u.copy(_down).addScaledVector(_d, -_down.dot(_d));
  if (_u.lengthSq() > 1e-6) _bend.addScaledVector(_u.normalize(), 0.6);
  if (_bend.lengthSq() < 1e-6) return;
  _bend.normalize();

  const cosA = THREE.MathUtils.clamp((a * a + reach * reach - b * b) / (2 * a * reach), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // desired elbow
  _v.copy(_A).addScaledVector(_d, a * cosA).addScaledVector(_bend, a * sinA);
  _u.subVectors(_B, _A);
  _v.sub(_A);
  rotateWorld(upper, _u, _v, w);

  lower.getWorldPosition(_B);
  hand.getWorldPosition(_C);
  _T.copy(_A).addScaledVector(_d, reach);
  _u.subVectors(_C, _B);
  _v.subVectors(_T, _B);
  rotateWorld(lower, _u, _v, w);
}

/**
 * Put the left palm on the gun's support point. `w` 0..1 blends the correction
 * (fade out for reloads, ability casts and melee).
 */
export function solveSupportHand(rig: BoneSource, gun: THREE.Object3D, w: number): void {
  if (w <= 0.001) return;
  const upper = rig.bone('leftUpperArm');
  const lower = rig.bone('leftLowerArm');
  const hand = rig.bone('leftHand');
  const sp = supportPoint(gun);
  if (!upper || !lower || !hand || !sp) return;
  const knuckle = rig.bone('leftMiddleProximal') ?? rig.bone('leftIndexProximal');
  gun.updateWorldMatrix(true, true);
  sp.getWorldPosition(_support);
  // two passes: the palm offset depends on the hand orientation the first pass produces
  for (let i = 0; i < 2; i++) {
    hand.updateWorldMatrix(true, true);
    hand.getWorldPosition(_C);
    if (knuckle) {
      knuckle.getWorldPosition(_knuckle);
      _palm.lerpVectors(_C, _knuckle, 0.6);
    } else _palm.copy(_C);
    // wrist target = support − (palm − wrist)
    _T.copy(_support).sub(_palm).add(_C);
    twoBoneIK(upper, lower, hand, _T, w);
  }
}

/** Gun along aim + support hand on it (rig avatars). */
export function holdGun(rig: BoneSource, root: THREE.Object3D, gun: THREE.Object3D, pitch: number, ikWeight: number): void {
  orientGun(root, gun, pitch);
  solveSupportHand(rig, gun, ikWeight);
}
