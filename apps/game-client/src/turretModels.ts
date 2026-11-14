import * as THREE from 'three';

/**
 * Deployable turret meshes, modelled after real hardware so they read from the
 * top-down camera: a tripod-mounted heavy machine gun (M2 style: perforated barrel
 * jacket, receiver, gun shield, ammo can and belt, spade grips, optic) and a field
 * Tesla coil (transformer box, ceramic insulator stack, copper winding, toroid).
 *
 * Geometry and materials are module-level and shared by every turret; nothing here
 * adds lights (changing the light count recompiles every lit shader).
 */

export interface TurretModel {
  group: THREE.Group;
  /** yaws toward the target */
  head: THREE.Object3D;
  /** barrel assembly: pushed back on each shot for recoil (sentry only) */
  barrel: THREE.Object3D | null;
  /** world-space muzzle tip lives here */
  muzzle: THREE.Object3D;
}

let shared: ReturnType<typeof buildShared> | null = null;

function buildShared() {
  const std = (color: number, roughness: number, metalness: number) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mat = {
    gunmetal: std(0x2a2d31, 0.42, 0.75),
    steel: std(0x50565c, 0.38, 0.8),
    olive: std(0x4a5230, 0.72, 0.15),
    oliveDark: std(0x353b22, 0.8, 0.1),
    brass: std(0xb38b3c, 0.32, 0.85),
    rubber: std(0x141516, 0.92, 0.02),
    ceramic: std(0xcfc6b2, 0.3, 0.05),
    copper: std(0xb06a38, 0.3, 0.9),
    alu: std(0xa9b0b6, 0.28, 0.85),
    lens: new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false }),
    plasma: new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const geo = {
    leg: cyl(0.022, 0.028, 1, 8),
    foot: cyl(0.06, 0.07, 0.03, 10),
    ring: cyl(0.1, 0.12, 0.08, 16),
    post: cyl(0.04, 0.05, 1, 10),
    box: new THREE.BoxGeometry(1, 1, 1),
    jacket: cyl(0.05, 0.05, 1, 14).rotateX(Math.PI / 2),
    bore: cyl(0.028, 0.028, 1, 10).rotateX(Math.PI / 2),
    hider: cyl(0.04, 0.032, 1, 10).rotateX(Math.PI / 2),
    vent: new THREE.TorusGeometry(0.052, 0.008, 6, 14),
    grip: cyl(0.018, 0.018, 1, 8),
    optic: cyl(0.03, 0.03, 1, 12).rotateX(Math.PI / 2),
    lens: new THREE.CircleGeometry(0.026, 12),
    insulator: cyl(0.16, 0.16, 0.035, 18),
    coil: cyl(0.085, 0.085, 1, 18),
    toroid: new THREE.TorusGeometry(0.2, 0.065, 10, 24),
    orb: new THREE.SphereGeometry(0.06, 10, 8),
    pod: cyl(0.075, 0.075, 1, 12).rotateX(Math.PI / 2),
    tube: new THREE.CircleGeometry(0.022, 8),
  };
  return { mat, geo };
}

function S() {
  shared ??= buildShared();
  return shared;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  parent.add(o);
  return o;
}

/** A tripod leg from the hub at `top` down to a foot at (fx, 0, fz). */
function leg(parent: THREE.Object3D, top: THREE.Vector3, fx: number, fz: number): void {
  const { geo, mat } = S();
  const foot = new THREE.Vector3(fx, 0.02, fz);
  const mid = top.clone().add(foot).multiplyScalar(0.5);
  const len = top.distanceTo(foot);
  const l = mesh(geo.leg, mat.gunmetal, parent, mid.x, mid.y, mid.z, 1, len, 1);
  l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
  mesh(geo.foot, mat.rubber, parent, fx, 0.015, fz);
}

/** Tripod heavy machine gun. `rockets` adds a twin rocket pod (evolved sentry). */
export function buildSentryTurret(opts: { rockets?: boolean } = {}): TurretModel {
  const { geo, mat } = S();
  const group = new THREE.Group();
  const hub = new THREE.Vector3(0, 0.58, 0);
  // long front leg, two splayed rear legs (M3 tripod layout)
  leg(group, hub, 0, 0.72);
  leg(group, hub, 0.5, -0.42);
  leg(group, hub, -0.5, -0.42);
  mesh(geo.post, mat.gunmetal, group, 0, 0.64, 0, 1, 0.16, 1);
  mesh(geo.ring, mat.steel, group, 0, 0.74, 0);
  // folded sandbag-ish ammo crate at the foot of the tripod
  mesh(geo.box, mat.oliveDark, group, 0.28, 0.1, 0.05, 0.22, 0.2, 0.34);

  const head = new THREE.Group();
  head.position.y = 0.82;
  group.add(head);
  // cradle + receiver
  mesh(geo.box, mat.gunmetal, head, 0, -0.02, -0.02, 0.12, 0.06, 0.3);
  mesh(geo.box, mat.gunmetal, head, 0, 0.06, -0.05, 0.15, 0.13, 0.44);
  mesh(geo.box, mat.steel, head, 0, 0.13, -0.02, 0.11, 0.02, 0.32); // top cover
  // spade grips + butterfly trigger at the back
  for (const s of [-1, 1]) {
    const g = mesh(geo.grip, mat.rubber, head, 0.06 * s, 0.05, -0.33, 1, 0.12, 1);
    g.rotation.x = 0.3;
  }
  mesh(geo.box, mat.gunmetal, head, 0, 0.06, -0.29, 0.14, 0.03, 0.03);
  // gun shield (two angled plates)
  const shield = mesh(geo.box, mat.olive, head, 0, 0.1, 0.22, 0.42, 0.32, 0.02);
  shield.rotation.x = -0.12;
  for (const s of [-1, 1]) {
    const wing = mesh(geo.box, mat.olive, head, 0.25 * s, 0.1, 0.18, 0.12, 0.28, 0.02);
    wing.rotation.y = 0.55 * s;
  }
  // ammo can on the left feeding a brass belt into the receiver
  mesh(geo.box, mat.olive, head, -0.17, 0.03, -0.04, 0.1, 0.16, 0.24);
  mesh(geo.box, mat.oliveDark, head, -0.17, 0.115, -0.04, 0.105, 0.015, 0.245);
  const belt = mesh(geo.box, mat.brass, head, -0.1, 0.1, -0.04, 0.06, 0.012, 0.12);
  belt.rotation.z = 0.5;
  // optic with a red lens
  mesh(geo.optic, mat.gunmetal, head, 0.05, 0.19, -0.04, 1, 1, 0.16);
  const lens = mesh(geo.lens, mat.lens, head, 0.05, 0.19, 0.041);
  lens.castShadow = false;
  // barrel assembly (recoils)
  const barrel = new THREE.Group();
  barrel.position.set(0, 0.06, 0.17);
  head.add(barrel);
  mesh(geo.jacket, mat.gunmetal, barrel, 0, 0, 0.18, 1, 1, 0.36);
  for (let i = 0; i < 4; i++) mesh(geo.vent, mat.steel, barrel, 0, 0, 0.04 + i * 0.09).castShadow = false;
  mesh(geo.bore, mat.steel, barrel, 0, 0, 0.55, 1, 1, 0.42);
  mesh(geo.hider, mat.gunmetal, barrel, 0, 0, 0.8, 1, 1, 0.1);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 0.86);
  barrel.add(muzzle);
  // carrying handle on the barrel
  mesh(geo.box, mat.gunmetal, barrel, 0, 0.08, 0.12, 0.02, 0.02, 0.14);

  if (opts.rockets) {
    for (const s of [-1, 1]) {
      mesh(geo.pod, mat.olive, head, 0.3 * s, 0.24, 0, 1, 1, 0.42);
      const face = mesh(geo.tube, mat.rubber, head, 0.3 * s, 0.24, 0.212);
      face.castShadow = false;
    }
    mesh(geo.box, mat.gunmetal, head, 0, 0.24, 0, 0.5, 0.03, 0.08);
  }
  return { group, head, barrel, muzzle };
}

/** Field Tesla coil: transformer box, insulator stack, copper winding, toroid. */
export function buildTeslaTurret(): TurretModel {
  const { geo, mat } = S();
  const group = new THREE.Group();
  mesh(geo.box, mat.oliveDark, group, 0, 0.14, 0, 0.62, 0.24, 0.62);
  mesh(geo.box, mat.gunmetal, group, 0, 0.27, 0, 0.66, 0.03, 0.66);
  for (const [x, z] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]] as const) mesh(geo.foot, mat.rubber, group, x, 0.015, z);
  // cooling fins on the box sides
  for (let i = -2; i <= 2; i++) {
    mesh(geo.box, mat.steel, group, 0.33, 0.14, i * 0.1, 0.03, 0.18, 0.02).castShadow = false;
    mesh(geo.box, mat.steel, group, -0.33, 0.14, i * 0.1, 0.03, 0.18, 0.02).castShadow = false;
  }
  // ceramic insulator stack
  for (let i = 0; i < 6; i++) mesh(geo.insulator, mat.ceramic, group, 0, 0.32 + i * 0.07, 0, 1 - i * 0.04, 1, 1 - i * 0.04);
  mesh(geo.post, mat.ceramic, group, 0, 0.5, 0, 1.4, 0.4, 1.4);
  // secondary winding
  mesh(geo.coil, mat.copper, group, 0, 0.92, 0, 1, 0.56, 1);
  for (let i = 0; i < 7; i++) mesh(geo.vent, mat.copper, group, 0, 0.68 + i * 0.075, 0, 1.75, 1.75, 1.75).rotation.x = Math.PI / 2;
  const head = new THREE.Group();
  head.position.y = 1.28;
  group.add(head);
  mesh(geo.toroid, mat.alu, head, 0, 0, 0).rotation.x = Math.PI / 2;
  mesh(geo.post, mat.alu, head, 0, -0.06, 0, 0.8, 0.1, 0.8);
  const orb = mesh(geo.orb, mat.plasma, head, 0, 0.12, 0);
  orb.castShadow = false;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.12, 0);
  head.add(muzzle);
  return { group, head, barrel: null, muzzle };
}

/** Kick the barrel back on a shot; `settle` pulls it home each frame. */
export function kickBarrel(m: TurretModel): void {
  if (m.barrel) m.barrel.position.z = 0.1;
}
export function settleBarrel(m: TurretModel, dt: number): void {
  if (m.barrel) m.barrel.position.z = THREE.MathUtils.lerp(m.barrel.position.z, 0.17, 1 - Math.exp(-18 * dt));
}

/** Every material, for the loading-screen shader warm-up. */
export function turretWarmObjects(): THREE.Object3D[] {
  return [buildSentryTurret({ rockets: true }).group, buildTeslaTurret().group];
}
