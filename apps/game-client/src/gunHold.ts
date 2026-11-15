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
const _q2 = new THREE.Quaternion();
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

const _rp = new THREE.Vector3();
const _rM = new THREE.Matrix4();
const _rT = new THREE.Matrix4();
const _rL = new THREE.Matrix4();
const _rPos = new THREE.Vector3();
const _rScl = new THREE.Vector3();

/**
 * Apply a world-space rotation `q` to `obj` about its own origin. Done with matrices:
 * Rocketbox skeletons are mirrored (negative scale), where quaternion maths on
 * decomposed world rotations silently goes wrong and the IK never reached its target.
 */
function applyWorldRotation(obj: THREE.Object3D, q: THREE.Quaternion): void {
  obj.updateWorldMatrix(true, false);
  _rp.setFromMatrixPosition(obj.matrixWorld);
  _rM.makeRotationFromQuaternion(q);
  _rT.makeTranslation(_rp.x, _rp.y, _rp.z).multiply(_rM).multiply(_rL.makeTranslation(-_rp.x, -_rp.y, -_rp.z));
  _rT.multiply(obj.matrixWorld);
  if (obj.parent) _rL.copy(obj.parent.matrixWorld).invert().multiply(_rT);
  else _rL.copy(_rT);
  _rL.decompose(_rPos, _q2, _rScl);
  obj.quaternion.copy(_q2);
  obj.updateWorldMatrix(false, true);
}

/** Rotate `obj` by a world-space delta (slerped from identity by w). */
function rotateWorld(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number): void {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  if (w < 1) _q.slerpQuaternions(_ident, _q, w);
  applyWorldRotation(obj, _q);
}

/** Analytic two-bone IK: moves `hand`'s origin onto `target`, elbow kept on its current side (biased down). */
export function twoBoneIK(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, w: number, bendHint?: THREE.Vector3): void {
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
  if (bendHint) {
    // the caller knows where the elbow belongs (e.g. down and out for a hip-carried gun)
    _u.copy(bendHint).addScaledVector(_d, -bendHint.dot(_d));
    if (_u.lengthSq() > 1e-6) _bend.copy(_u.normalize());
  }
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

// ---------------------------------------------------------------------------
// World-anchored hold: the gun sits where a soldier carries that kind of weapon
// (shouldered rifle, compact SMG, hip-carried heavy gun, two-handed pistol) and
// BOTH hands are pulled onto it — the firing hand on the pistol grip, the support
// hand on the handguard — then turned so the fingers wrap the grip.
// ---------------------------------------------------------------------------

export type HoldStyle = 'rifle' | 'smg' | 'heavy' | 'pistol';

const _R = new THREE.Vector3();
const _L = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _gf = new THREE.Vector3();
const _gu = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _w = new THREE.Vector3();
const _k = new THREE.Vector3();
const _i = new THREE.Vector3();
const _l = new THREE.Vector3();
const _cur = new THREE.Vector3();
const _des = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Carry style for a firearm (heavy guns are carried at the hip). */
export function holdStyleOf(weapon: { id: string; variant?: string; grip?: string }): HoldStyle {
  const v = weapon.variant ?? weapon.id;
  // only the belt-fed / rotary machine guns (and the drum launcher on the same frame) ride at the hip;
  // shotguns, the pipe mortar and the .50 are shouldered like a rifle
  if (weapon.id === 'lmg' || v === 'shredder' || v === 'thumper_gl') return 'heavy';
  if (weapon.grip === 'pistol') return 'pistol';
  if (weapon.grip === 'smg') return 'smg';
  return 'rifle';
}

/** Turn a hand (absolute, world space) so wrist→middle knuckle = `finger` and little→index knuckle ≈ `side`. */
function orientHand(rig: BoneSource, side: 'left' | 'right', finger: THREE.Vector3, across: THREE.Vector3): void {
  const hand = rig.bone(`${side}Hand`);
  const mid = rig.bone(`${side}MiddleProximal`);
  const idx = rig.bone(`${side}IndexProximal`);
  const lit = rig.bone(`${side}LittleProximal`) ?? rig.bone(`${side}RingProximal`);
  if (!hand || !mid || !idx || !lit) return;
  hand.updateWorldMatrix(true, true);
  hand.getWorldPosition(_w);
  mid.getWorldPosition(_k);
  idx.getWorldPosition(_i);
  lit.getWorldPosition(_l);
  _cur.subVectors(_k, _w).normalize();
  _des.copy(finger).normalize();
  _q.setFromUnitVectors(_cur, _des);
  // twist about the finger axis so the knuckle line matches
  _cur.subVectors(_i, _l).applyQuaternion(_q);
  _cur.addScaledVector(_des, -_cur.dot(_des));
  _v.copy(across).addScaledVector(_des, -across.dot(_des));
  if (_cur.lengthSq() > 1e-8 && _v.lengthSq() > 1e-8) {
    _q2.setFromUnitVectors(_cur.normalize(), _v.normalize());
    _q.premultiply(_q2);
  }
  applyWorldRotation(hand, _q);
}

/** Wrist IK so the palm centre lands on `target`, then the hand is turned to wrap. */
function placeHand(rig: BoneSource, side: 'left' | 'right', target: THREE.Vector3, finger: THREE.Vector3, across: THREE.Vector3, w: number, bendHint?: THREE.Vector3): void {
  const upper = rig.bone(`${side}UpperArm`);
  const lower = rig.bone(`${side}LowerArm`);
  const hand = rig.bone(`${side}Hand`);
  if (!upper || !lower || !hand || w <= 0.001) return;
  const knuckle = rig.bone(`${side}MiddleProximal`) ?? rig.bone(`${side}IndexProximal`);
  for (let it = 0; it < 2; it++) {
    if (w > 0.5) orientHand(rig, side, finger, across);
    hand.updateWorldMatrix(true, true);
    hand.getWorldPosition(_C);
    if (knuckle) {
      knuckle.getWorldPosition(_knuckle);
      _palm.lerpVectors(_C, _knuckle, 0.5);
    } else _palm.copy(_C);
    _T.copy(target).sub(_palm).add(_C);
    twoBoneIK(upper, lower, hand, _T, w, bendHint);
  }
  if (w > 0.5) orientHand(rig, side, finger, across);
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const _ca = new THREE.Vector3();
const _cf = new THREE.Vector3();
const _cw = new THREE.Vector3();

/**
 * Close the fingers around whatever the hand holds. Axis = knuckle line, measured from
 * bone positions (so it is right on mirrored skeletons too); `index` is the trigger finger.
 */
export function curlHand(rig: BoneSource, side: 'left' | 'right', others: number, index: number, w: number): void {
  if (w <= 0.001) return;
  const hand = rig.bone(`${side}Hand`);
  const idx = rig.bone(`${side}IndexProximal`);
  const lit = rig.bone(`${side}LittleProximal`) ?? rig.bone(`${side}RingProximal`);
  const mid = rig.bone(`${side}MiddleProximal`);
  if (!hand || !idx || !lit || !mid) return;
  hand.updateWorldMatrix(true, true);
  idx.getWorldPosition(_ca);
  lit.getWorldPosition(_cw);
  _ca.sub(_cw); // little → index (knuckle line)
  hand.getWorldPosition(_cw);
  mid.getWorldPosition(_cf);
  _cf.sub(_cw).normalize(); // wrist → knuckles
  _ca.addScaledVector(_cf, -_ca.dot(_cf));
  if (_ca.lengthSq() < 1e-10) return;
  _ca.normalize();
  // right palm = across × finger → curl axis +across; left mirrored
  if (side === 'left') _ca.negate();
  for (const f of FINGERS) {
    const a = (f === 'Index' ? index : others) * w;
    const share = [0.8, 1.0, 0.7];
    [`${side}${f}Proximal`, `${side}${f}Intermediate`, `${side}${f}Distal`].forEach((n, i) => {
      const b = rig.bone(n);
      if (!b) return;
      _q.setFromAxisAngle(_ca, a * share[i]!);
      applyWorldRotation(b, _q);
    });
  }
}

export interface RigHoldOpts {
  style: HoldStyle;
  /** + = muzzle down */
  pitch: number;
  /** 0..1 recoil kick */
  recoil: number;
  /** 0..1: firing hand on the grip */
  rightW: number;
  /** 0..1: support hand on the handguard */
  leftW: number;
  /** gun scale in root space */
  scale: number;
  /** reload 0..1 (the support hand works the magazine), or < 0 */
  reload?: number;
}

const _gm = new THREE.Matrix4();
const _gv = new THREE.Vector3();
const _gs = new THREE.Vector3();

/**
 * Where the butt of the stock is, in the gun's own space (origin = pistol grip,
 * +Z = barrel): the rearmost vertices, their mean height. Cached per model instance
 * (the stand-in is swapped for the real model once it loads, which resets it).
 */
export function gunButt(gun: THREE.Object3D): { z: number; y: number } {
  const key = gun.children[0]?.uuid ?? '';
  const cached = gun.userData.butt as { key: string; z: number; y: number } | undefined;
  if (cached && cached.key === key) return cached;
  gun.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
  let minZ = 0;
  const pts: number[] = [];
  gun.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || o.name === 'gearAttachments' || (o.parent && o.parent.name === 'gearAttachments' && o.position.z > 0.5)) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    _gm.multiplyMatrices(inv, mesh.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      _gv.fromBufferAttribute(pos, i).applyMatrix4(_gm);
      if (_gv.z > 0.2) continue;
      pts.push(_gv.z, _gv.y);
      if (_gv.z < minZ) minZ = _gv.z;
    }
  });
  let ys = 0;
  let n = 0;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i]! < minZ + 0.035) {
      ys += pts[i + 1]!;
      n++;
    }
  }
  const out = { key, z: minZ, y: n ? ys / n : 0.03 };
  gun.userData.butt = out;
  return out;
}

/** How far each carry turns the upper body (right shoulder back, left forward), radians. */
const BLADE: Record<HoldStyle, number> = { rifle: 0.34, smg: 0.26, heavy: 0.4, pistol: 0.16 };

/** Turn the torso about the vertical by `angle` (split over the spine), the head turned back to the front. */
function bladeTorso(rig: BoneSource, angle: number): void {
  if (Math.abs(angle) < 1e-3) return;
  const parts: [string, number][] = [
    ['spine', 0.35],
    ['chest', 0.35],
    ['upperChest', 0.3],
  ];
  for (const [name, share] of parts) {
    const b = rig.bone(name);
    if (!b) continue;
    _q.setFromAxisAngle(_up, angle * share);
    applyWorldRotation(b, _q);
  }
  const head = rig.bone('neck') ?? rig.bone('head');
  if (head) {
    _q.setFromAxisAngle(_up, -angle * 0.85);
    applyWorldRotation(head, _q);
  }
}

/**
 * Put the gun at its carry anchor (root space) and both hands on it.
 * The gun group's origin is the pistol grip, +Z the barrel, +Y up.
 *
 * Long guns are placed from the BUTT: the stock sits in the right shoulder pocket,
 * in front of the chest, and the grip follows from the model's own length of pull,
 * so no stock ever ends up inside the body whatever the model or the operative.
 */
export function holdGunRig(rig: BoneSource, root: THREE.Object3D, gun: THREE.Object3D, o: RigHoldOpts): void {
  const rUp = rig.bone('rightUpperArm');
  const lUp = rig.bone('leftUpperArm');
  if (!rUp || !lUp) return;
  if (gun.parent !== root) {
    root.add(gun);
    gun.scale.setScalar(o.scale);
  }
  root.updateWorldMatrix(true, true);
  rUp.getWorldPosition(_R);
  lUp.getWorldPosition(_L);
  // body frame from the shoulders (works for any rig scale)
  _right.subVectors(_R, _L);
  _right.y = 0;
  const span = Math.max(0.2, _right.length());
  _right.normalize();
  root.getWorldQuaternion(_rootQ);
  _fwd.set(0, 0, 1).applyQuaternion(_rootQ);
  _fwd.y = 0;
  _fwd.normalize();
  const s = span / 0.34; // ≈ 1 for an adult
  const st = o.style;
  // bladed stance: the right shoulder goes back so the support arm reaches the handguard
  const bladeW = Math.min(o.rightW, Math.max(0.35, o.leftW));
  _w.crossVectors(_up, _right);
  const sign = _w.dot(_fwd) > 0 ? -1 : 1;
  bladeTorso(rig, sign * BLADE[st] * bladeW);
  rUp.getWorldPosition(_R);
  lUp.getWorldPosition(_L);
  // aim: forward, pitched about the body's right axis (heavy guns hang a touch nose-up)
  const pitch = o.pitch + (st === 'heavy' ? -0.05 : 0);
  _q.setFromAxisAngle(_right, -pitch);
  _aim.copy(_fwd).applyQuaternion(_q).normalize();
  _gu.copy(_up).addScaledVector(_aim, -_up.dot(_aim)).normalize();
  root.getWorldScale(_gs);
  const ws = o.scale * _gs.x;
  const butt = st === 'pistol' ? null : gunButt(gun);
  const stocked = !!butt && butt.z * ws < -0.07 * s;
  // grip position in the world
  if (st === 'pistol') {
    // two-handed, a touch right of centre and below the eyes (the arms don't cross the chest)
    _grip.lerpVectors(_R, _L, 0.5).addScaledVector(_fwd, 0.42 * s).addScaledVector(_up, -0.14 * s).addScaledVector(_right, 0.09 * s);
  } else if (st === 'heavy') {
    // hip carry: the butt clear of the hip / belly, gun along the right side
    // (elbow bent ~90°: the hand must stay well inside arm's reach)
    _grip.copy(_R).addScaledVector(_up, -0.24 * s).addScaledVector(_right, 0.07 * s);
    const rear = butt ? -butt.z * ws : 0.2 * s;
    _grip.addScaledVector(_fwd, Math.max(0.17 * s, 0.05 * s + rear * 0.45));
  } else if (stocked && butt) {
    // butt in the shoulder pocket: in front of the chest, just inside the shoulder joint
    _grip.copy(_R).addScaledVector(_fwd, 0.1 * s).addScaledVector(_right, -0.035 * s).addScaledVector(_up, (st === 'smg' ? -0.08 : -0.06) * s);
    // then out along the barrel by the model's own length of pull
    _grip.addScaledVector(_aim, -butt.z * ws).addScaledVector(_gu, -butt.y * ws);
    // keep it humanly reachable whatever the model's proportions
    const ahead = _tgt.subVectors(_grip, _R).dot(_fwd);
    const lo = 0.2 * s;
    const hi = 0.42 * s;
    if (ahead < lo) _grip.addScaledVector(_fwd, lo - ahead);
    else if (ahead > hi) _grip.addScaledVector(_fwd, hi - ahead);
  } else {
    // stockless SMG / machine pistol: held out in front, two hands
    _grip.copy(_R).addScaledVector(_fwd, 0.34 * s).addScaledVector(_up, -0.14 * s).addScaledVector(_right, -0.08 * s);
  }
  _grip.addScaledVector(_aim, -o.recoil * 0.06 * s);
  // gun basis: +Z aim, +Y up-ish, +X = aim × up (right side of the gun)
  _gf.copy(_aim);
  // up perpendicular to the barrel
  _gu.copy(_up).addScaledVector(_gf, -_up.dot(_gf)).normalize();
  // three.js basis must be right-handed: x = y × z
  _cur.crossVectors(_gu, _gf);
  _m.makeBasis(_cur, _gu, _gf);
  _wq.setFromRotationMatrix(_m);
  root.getWorldQuaternion(_pq);
  gun.quaternion.copy(_pq.clone().invert().multiply(_wq));
  _tgt.copy(_grip);
  root.worldToLocal(_tgt);
  gun.position.copy(_tgt);
  gun.updateWorldMatrix(true, true);

  // ---- firing hand on the pistol grip
  const gx = _cur.clone().normalize(); // gun +X in world
  const unit = s;
  _tgt.copy(_grip).addScaledVector(_gu, -0.045 * unit).addScaledVector(_gf, -0.01 * unit);
  // on the grip's right side: wrist→knuckles forward-up, knuckle line up the grip
  const rFinger = new THREE.Vector3().copy(_gf).multiplyScalar(0.75).addScaledVector(_gu, 0.25).addScaledVector(gx, gx.dot(_right) > 0 ? -0.35 : 0.35);
  const rAcross = new THREE.Vector3().copy(_gu).multiplyScalar(0.85).addScaledVector(_gf, 0.3);
  // palm sits on the right flank of the grip
  _tgt.addScaledVector(_right, 0.035 * unit);
  // elbows hang down and a little out (a hip-carried gun pushes them back too), never up
  const rHint = new THREE.Vector3().copy(_up).multiplyScalar(-1).addScaledVector(_right, st === 'heavy' ? 0.7 : 0.45).addScaledVector(_fwd, st === 'heavy' ? -0.5 : -0.1);
  const lHint = new THREE.Vector3().copy(_up).multiplyScalar(-1).addScaledVector(_right, st === 'heavy' ? -0.6 : -0.35);
  placeHand(rig, 'right', _tgt, rFinger, rAcross, o.rightW, rHint);
  // fingers round the grip, index finger along / on the trigger
  curlHand(rig, 'right', 1.05, 0.55, o.rightW);

  // ---- support hand
  const sp = supportPoint(gun);
  const reload = o.reload ?? -1;
  if (reload >= 0) {
    // support hand goes to the magazine well: out, down, back in
    const out = Math.sin(Math.min(1, reload) * Math.PI);
    _tgt.copy(_grip).addScaledVector(_gf, (st === 'pistol' ? 0.0 : 0.09) * unit).addScaledVector(_gu, (-0.08 - out * 0.12) * unit).addScaledVector(_right, -0.03 * unit);
    const lFinger = new THREE.Vector3().copy(_right).multiplyScalar(0.6).addScaledVector(_gu, 0.5).addScaledVector(_gf, 0.3);
    placeHand(rig, 'left', _tgt, lFinger, _gf.clone(), o.leftW, lHint);
    curlHand(rig, 'left', 0.8, 0.8, o.leftW);
  } else if (st === 'pistol' || !sp) {
    // cup the firing hand from the left side
    _tgt.copy(_grip).addScaledVector(_gu, -0.07 * unit).addScaledVector(_right, -0.04 * unit).addScaledVector(_gf, 0.01 * unit);
    const lFinger = new THREE.Vector3().copy(_right).multiplyScalar(0.7).addScaledVector(_gf, 0.55).addScaledVector(_gu, -0.1);
    const lAcross = new THREE.Vector3().copy(_gu).multiplyScalar(0.7).addScaledVector(_gf, 0.4);
    placeHand(rig, 'left', _tgt, lFinger, lAcross, o.leftW, lHint);
    curlHand(rig, 'left', 1.0, 1.0, o.leftW);
  } else {
    sp.getWorldPosition(_tgt);
    _tgt.addScaledVector(_gu, -0.02 * unit);
    // under the handguard, palm up, fingers wrapping round the right side
    const lFinger = new THREE.Vector3().copy(_right).multiplyScalar(0.7).addScaledVector(_gu, 0.35).addScaledVector(_gf, 0.35);
    const lAcross = new THREE.Vector3().copy(_gf);
    placeHand(rig, 'left', _tgt, lFinger, lAcross, o.leftW, lHint);
    curlHand(rig, 'left', 0.95, 0.85, o.leftW);
  }
}

/**
 * Melee: the weapon stays in the fist. Handle through the palm along the knuckle
 * line, blade out of the thumb/index side — so it follows every swing clip.
 */
export function seatMeleeInHand(rig: BoneSource, gun: THREE.Object3D, hand: THREE.Object3D): void {
  if (gun.userData.meleeSeated === hand.uuid) return;
  const idx = rig.bone('rightIndexProximal');
  const lit = rig.bone('rightLittleProximal') ?? rig.bone('rightRingProximal');
  const mid = rig.bone('rightMiddleProximal');
  if (!idx || !lit || !mid) return;
  hand.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(hand.matrixWorld).invert();
  const pI = idx.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const pL = lit.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const pM = mid.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const finger = pM.clone().normalize();
  const blade = pI.clone().sub(pL);
  blade.addScaledVector(finger, -blade.dot(finger)).normalize();
  // tilt toward the fingertips: short blades point forward (not up past the face),
  // long two-handers stay upright like a bat at the ready
  const variant = String(gun.userData.weaponVariant ?? '');
  // bat / axe lean back over the shoulder (a ready swing), not straight up past the face
  const tilt = variant === 'knife' ? 1.1 : variant === 'machete' ? 1.0 : TWO_HANDED_MELEE.has(variant) ? -1.05 : 0.25;
  blade.addScaledVector(finger, tilt).normalize();
  // the edge faces away from the palm: gun +Y ≈ finger direction
  const yAxis = finger.clone().addScaledVector(blade, -finger.dot(blade)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, blade).normalize();
  gun.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, blade));
  // palm centre: between wrist and knuckles, slightly toward the palm side
  const palm = pM.clone().multiplyScalar(0.55);
  gun.position.copy(palm);
  gun.userData.meleeSeated = hand.uuid;
}

/** Two-handed melee weapons (bat, axe). */
export const TWO_HANDED_MELEE = new Set(['bat', 'axe']);

/**
 * Left fist on the handle just below the right one (two-handed melee). The weapon is
 * already seated in the right hand, so this follows every swing.
 */
export function supportMelee(rig: BoneSource, gun: THREE.Object3D, w: number): void {
  if (w <= 0.001) return;
  const rh = rig.bone('rightHand');
  const rk = rig.bone('rightMiddleProximal');
  if (!rh || !rk) return;
  gun.updateWorldMatrix(true, false);
  // handle runs along the weapon's +Z; the left fist sits ~11 cm further down it
  const target = new THREE.Vector3(0, 0, -0.11).applyMatrix4(gun.matrixWorld);
  const handleUp = new THREE.Vector3(0, 0, 1).transformDirection(gun.matrixWorld);
  const finger = rk.getWorldPosition(new THREE.Vector3()).sub(rh.getWorldPosition(new THREE.Vector3())).normalize();
  placeHand(rig, 'left', target, finger, handleUp, w);
  curlHand(rig, 'left', 1.3, 1.3, w);
}
