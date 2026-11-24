/**
 * Set pieces for the abandoned amusement park map (Lunapark): ferris wheel, carousel,
 * roller coaster, circus tent, ticket booths, bumper-car rink and bulb strings.
 * Everything is plain three.js geometry (no new downloads); spinning parts carry
 * `userData.spin = { axis, speed }` and are turned by gameMap's update loop.
 */
import * as THREE from 'three';
import type { MapBuilder } from './mapBuilder';

const BULB_COLORS = [0xffd36a, 0xff5a7a, 0x5ee0ff, 0x9cff6a, 0xffffff, 0xc084fc];

let stripeCache: THREE.CanvasTexture | null = null;
/** red / cream circus stripes */
function stripeTex(): THREE.Texture | null {
  if (stripeCache) return stripeCache;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? '#e8dcc0' : '#b3262c';
    g.fillRect(i * 16, 0, 16, 32);
  }
  // grime
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(30,20,10,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 32, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  stripeCache = new THREE.CanvasTexture(c);
  stripeCache.wrapS = stripeCache.wrapT = THREE.RepeatWrapping;
  stripeCache.colorSpace = THREE.SRGBColorSpace;
  return stripeCache;
}

const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...o });
const glow = (color: number, k = 2.2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: k, roughness: 0.4 });

/** Instanced bulbs along a list of points (one draw call). */
function bulbs(points: THREE.Vector3[], size = 0.12, colors = BULB_COLORS): THREE.InstancedMesh {
  const geo = new THREE.SphereGeometry(size, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, points.length));
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  points.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    im.setMatrixAt(i, m);
    // a few dead bulbs: the park has been abandoned for a while
    col.setHex(i % 7 === 3 ? 0x2a2620 : colors[i % colors.length]!).multiplyScalar(i % 7 === 3 ? 1 : 1.6);
    im.setColorAt(i, col);
  });
  im.count = points.length;
  im.computeBoundingSphere();
  return im;
}

/** Ferris wheel facing +Z (the wheel turns slowly). */
export function ferrisWheel(b: MapBuilder, x: number, z: number, rot = 0): void {
  const R = 13;
  const hub = R + 2.2;
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rot;
  const steel = std(0xd8d4cc, { metalness: 0.7, roughness: 0.35 });
  const rust = std(0x8a4a2a, { metalness: 0.5, roughness: 0.8 });
  // A-frame legs on both sides
  for (const side of [-1.4, 1.4]) {
    for (const lean of [-1, 1]) {
      const len = Math.hypot(hub, 6);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, len, 8), rust);
      leg.position.set(lean * 3, hub / 2, side);
      leg.rotation.z = lean * Math.atan2(6, hub);
      leg.castShadow = true;
      root.add(leg);
    }
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.6, 12), steel);
  axle.rotation.x = Math.PI / 2;
  axle.position.y = hub;
  root.add(axle);
  // the wheel itself
  const wheel = new THREE.Group();
  wheel.position.y = hub;
  wheel.userData.spin = { axis: 'z', speed: 0.06 };
  for (const zz of [-0.9, 0.9]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 6, 72), steel);
    rim.position.z = zz;
    wheel.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.12, 5, 48), steel);
    inner.position.z = zz;
    wheel.add(inner);
  }
  const N = 16;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    for (const zz of [-0.9, 0.9]) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, R, 4), steel);
      spoke.position.set((Math.cos(a) * R) / 2, (Math.sin(a) * R) / 2, zz);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);
    }
    for (let k = 1; k <= 6; k++) pts.push(new THREE.Vector3(Math.cos(a) * (R * k) / 6, Math.sin(a) * (R * k) / 6, 1.05));
    for (let k = 0; k < 3; k++) {
      const aa = a + (k / 3) * ((Math.PI * 2) / N);
      pts.push(new THREE.Vector3(Math.cos(aa) * R, Math.sin(aa) * R, 1.1));
    }
  }
  wheel.add(bulbs(pts, 0.14));
  root.add(wheel);
  // gondolas hang from the rim and stay upright (counter-spin)
  const colors = [0xd94040, 0x3a7ad9, 0xe8c040, 0x40a860];
  for (let i = 0; i < N / 2; i++) {
    const a = (i / (N / 2)) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    pivot.userData.spin = { axis: 'z', speed: -0.06 };
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 1.6, 8, 1, true), std(colors[i % colors.length]!, { side: THREE.DoubleSide, roughness: 0.7 }));
    cab.position.y = -1.6;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.7, 8), std(0xe8dcc0));
    roof.position.y = -0.5;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 8), rust);
    floor.position.y = -2.4;
    pivot.add(cab, roof, floor);
    wheel.add(pivot);
  }
  // ticket platform
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 6), std(0x5a4a3a, { roughness: 0.9 }));
  deck.position.y = 0.25;
  deck.receiveShadow = true;
  root.add(deck);
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  b.custom(root, [
    [x + 3 * c, z - 3 * s, 1.4, 4, rot],
    [x - 3 * c, z + 3 * s, 1.4, 4, rot],
    [x, z, 10, 6, rot],
  ]);
  b.clear(x, z, 9);
}

/** Merry-go-round: striped roof, poles, horses (turns slowly). */
export function carousel(b: MapBuilder, x: number, z: number): void {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const R = 6.5;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.6, 0.6, 32), std(0x6a5a48, { roughness: 0.9 }));
  base.position.y = 0.3;
  base.receiveShadow = true;
  root.add(base);
  const turn = new THREE.Group();
  turn.userData.spin = { axis: 'y', speed: 0.25 };
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.2, 32), std(0x8a3a2a));
  deck.position.y = 0.7;
  turn.add(deck);
  const center = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 4.4, 12), std(0xe8dcc0, { map: stripeTex() ?? undefined }));
  center.position.y = 2.9;
  turn.add(center);
  const tex = stripeTex();
  const roofMat = std(0xffffff, { map: tex ?? undefined, side: THREE.DoubleSide, roughness: 0.8 });
  if (tex) {
    const t2 = tex.clone();
    t2.repeat.set(2, 1);
    t2.needsUpdate = true;
    roofMat.map = t2;
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 0.8, 3, 24, 1, true), roofMat);
  roof.position.y = 6.6;
  turn.add(roof);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), std(0xd9a514, { metalness: 0.8, roughness: 0.3 }));
  top.position.y = 8.3;
  turn.add(top);
  const brass = std(0xd9a514, { metalness: 0.85, roughness: 0.3 });
  const horseCols = [0xf2ede2, 0x2a2420, 0x8a5a3a, 0xd9cfc0];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rr = R - 1.4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 6), brass);
    pole.position.set(Math.cos(a) * rr, 2.9, Math.sin(a) * rr);
    turn.add(pole);
    const horse = new THREE.Group();
    const hm = std(horseCols[i % horseCols.length]!, { roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 4, 8), hm);
    body.rotation.z = Math.PI / 2;
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 6), hm);
    neck.position.set(0.55, 0.38, 0);
    neck.rotation.z = -0.6;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.22), hm);
    head.position.set(0.82, 0.62, 0);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.5), std(0xb3262c));
    saddle.position.y = 0.33;
    horse.add(body, neck, head, saddle);
    for (const [lx, lz] of [[-0.45, 0.15], [-0.45, -0.15], [0.45, 0.15], [0.45, -0.15]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 5), hm);
      leg.position.set(lx, -0.5, lz);
      leg.rotation.z = lx < 0 ? -0.5 : 0.5;
      horse.add(leg);
    }
    horse.position.set(Math.cos(a) * rr, 1.6 + (i % 2) * 0.5, Math.sin(a) * rr);
    horse.rotation.y = -a + Math.PI;
    turn.add(horse);
    pts.push(new THREE.Vector3(Math.cos(a) * (R + 0.75), 5.1, Math.sin(a) * (R + 0.75)));
    pts.push(new THREE.Vector3(Math.cos(a + 0.26) * (R + 0.75), 5.1, Math.sin(a + 0.26) * (R + 0.75)));
  }
  turn.add(bulbs(pts, 0.13, [0xffd36a, 0xffffff]));
  root.add(turn);
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
  b.custom(root, [[x, z, R * 1.5, R * 1.5]]);
  b.clear(x, z, R + 2);
}

/** Circus big top (closed tent; good boss stage in front of it). */
export function circusTent(b: MapBuilder, x: number, z: number): void {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const R = 12;
  const tex = stripeTex();
  const wallMat = std(0xffffff, { roughness: 0.85, side: THREE.DoubleSide });
  const roofMat = std(0xffffff, { roughness: 0.85, side: THREE.DoubleSide });
  if (tex) {
    const w = tex.clone();
    w.repeat.set(6, 1);
    w.needsUpdate = true;
    wallMat.map = w;
    const r = tex.clone();
    r.repeat.set(5, 1);
    r.needsUpdate = true;
    roofMat.map = r;
  }
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 4.5, 32, 1, true), wallMat);
  wall.position.y = 2.25;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 1.2, 7, 32, 1, true), roofMat);
  roof.position.y = 8;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 15, 6), std(0x6a5a48));
  mast.position.y = 7.5;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), std(0xb3262c, { side: THREE.DoubleSide }));
  flag.position.set(0.8, 14.4, 0);
  // torn entrance flap facing +Z
  const door = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.6), std(0x1a0c08, { side: THREE.DoubleSide }));
  door.position.set(0, 1.8, R + 0.02);
  root.add(wall, roof, mast, flag, door);
  // bulb ring at the eave
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * (R + 0.1), 4.55, Math.sin(a) * (R + 0.1)));
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(Math.cos(a) * (R + 1.1) * (1 - t), 4.5 + t * 10, Math.sin(a) * (R + 1.1) * (1 - t)));
    }
  }
  root.add(bulbs(pts, 0.14, [0xffd36a, 0xff5a7a]));
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
  // collider: ring of slices so the tent reads as solid
  const cols: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    cols.push([x + Math.cos(a) * R * 0.62, z + Math.sin(a) * R * 0.62, R * 0.75, R * 0.75]);
  }
  b.custom(root, cols);
  b.clear(x, z, R + 3);
}

/** Roller coaster: a closed loop of track on steel trestles around a centre point. */
export function coaster(b: MapBuilder, cx: number, cz: number, rx: number, rz: number): void {
  const root = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  const N = 120;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // two humps and a big drop
    const h = 5 + Math.max(0, Math.sin(a * 2)) * 6 + Math.max(0, Math.sin(a - 0.6)) ** 3 * 9;
    pts.push(new THREE.Vector3(cx + Math.cos(a) * rx * (1 + 0.12 * Math.sin(a * 3)), h, cz + Math.sin(a) * rz));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const steel = std(0xc8c4bc, { metalness: 0.75, roughness: 0.35 });
  const red = std(0xb3262c, { metalness: 0.4, roughness: 0.5 });
  for (const off of [-0.55, 0.55]) {
    const rail = curve.getSpacedPoints(N * 2).map((p, i, arr) => {
      const n = arr[(i + 1) % arr.length]!.clone().sub(p).setY(0).normalize();
      return p.clone().add(new THREE.Vector3(-n.z * off, 0, n.x * off));
    });
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail, true), N * 2, 0.11, 5, true), red));
  }
  root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, N * 2, 0.16, 5, true), steel));
  // trestles every few metres; the posts are the only colliders (you can run underneath)
  const cols: Array<[number, number, number, number]> = [];
  const posts = curve.getSpacedPoints(36);
  const postGeo = new THREE.CylinderGeometry(0.18, 0.24, 1, 6);
  posts.slice(0, -1).forEach((p, i) => {
    const post = new THREE.Mesh(postGeo, steel);
    post.scale.y = p.y;
    post.position.set(p.x, p.y / 2, p.z);
    post.castShadow = true;
    root.add(post);
    if (i % 2 === 0) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.14), steel);
      brace.position.set(p.x, p.y * 0.55, p.z);
      brace.rotation.y = Math.atan2(p.z - cz, p.x - cx);
      root.add(brace);
    }
    cols.push([p.x, p.z, 0.6, 0.6]);
  });
  // a stalled train on the top of the drop
  const t0 = 0.12;
  for (let k = 0; k < 4; k++) {
    const p = curve.getPointAt((t0 + k * 0.012) % 1);
    const q = curve.getPointAt((t0 + k * 0.012 + 0.004) % 1);
    const car = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 2), std(k % 2 ? 0xe8c040 : 0x3a7ad9));
    car.position.copy(p).setY(p.y + 0.55);
    car.lookAt(q.x, q.y + 0.55, q.z);
    car.castShadow = true;
    root.add(car);
  }
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
  b.custom(root, cols);
}

/** Striped-awning booth (ticket / game / candy stall). */
export function booth(b: MapBuilder, x: number, z: number, rot: number, color: number): void {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rot;
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 2.6), std(color, { roughness: 0.8 }));
  body.position.y = 1.3;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.15, 0.7), std(0x6a4a2a));
  counter.position.set(0, 1.1, 1.55);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), std(0x0c0a08));
  hole.position.set(0, 1.75, 1.31);
  const tex = stripeTex();
  const awnMat = std(0xffffff, { roughness: 0.85, side: THREE.DoubleSide, map: tex ?? undefined });
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), awnMat);
  awn.position.set(0, 2.75, 1.85);
  awn.rotation.x = -1.05;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 0.12), glow(BULB_COLORS[Math.floor(Math.abs(x * 7 + z * 3)) % BULB_COLORS.length]!, 1.4));
  sign.position.set(0, 3.25, 1.2);
  root.add(body, counter, hole, awn, sign);
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
  b.custom(root, [[x, z, 3.6, 2.6, rot]]);
}

/** Bumper-car rink: low rail, roof grid on poles, scattered cars. */
export function bumperRink(b: MapBuilder, x: number, z: number, w: number, d: number): void {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(0x2a2c30, { metalness: 0.6, roughness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  root.add(floor);
  const poleMat = std(0xb8bec4, { metalness: 0.8 });
  for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), poleMat);
    p.position.set(px, 2.5, pz);
    root.add(p);
  }
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 8, 6), new THREE.MeshBasicMaterial({ color: 0x5a6068, wireframe: true }));
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 5;
  root.add(grid);
  const cols = [0xd94040, 0x3a7ad9, 0xe8c040, 0x40a860, 0xc084fc];
  const carCols: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 7; i++) {
    const cxl = b.r(-w / 2 + 2, w / 2 - 2);
    const czl = b.r(-d / 2 + 2, d / 2 - 2);
    const car = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2.1), std(cols[i % cols.length]!, { metalness: 0.5, roughness: 0.3 }));
    shell.position.y = 0.45;
    const bumper = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 6, 18), std(0x15171a));
    bumper.rotation.x = Math.PI / 2;
    bumper.scale.set(0.85, 1.15, 1);
    bumper.position.y = 0.3;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.3, 4), poleMat);
    rod.position.set(0, 2.85, -0.7);
    car.add(shell, bumper, rod);
    car.position.set(cxl, 0, czl);
    car.rotation.y = b.r(0, Math.PI * 2);
    root.add(car);
    carCols.push([x + cxl, z + czl, 1.4, 1.4]);
  }
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh && o !== floor));
  b.custom(root, carCols);
  // rail with gaps on two sides so the horde can pour in
  for (const [x1, z1, x2, z2] of [
    [x - w / 2, z - d / 2, x - 2, z - d / 2],
    [x + 2, z - d / 2, x + w / 2, z - d / 2],
    [x - w / 2, z + d / 2, x + w / 2, z + d / 2],
    [x - w / 2, z - d / 2, x - w / 2, z + d / 2],
    [x + w / 2, z - d / 2, x + w / 2, z - 2],
    [x + w / 2, z + 2, x + w / 2, z + d / 2],
  ] as const)
    b.wall(x1, z1, x2, z2, 0.9, 'metal_plate', 0.3, 0xd9a514);
}

/** Catenary string of bulbs between two posts. */
export function bulbString(b: MapBuilder, x1: number, z1: number, x2: number, z2: number, h = 4.2): void {
  const root = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(4, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(x1 + (x2 - x1) * t, h - Math.sin(t * Math.PI) * Math.min(1.6, len * 0.06), z1 + (z2 - z1) * t));
  }
  root.add(bulbs(pts, 0.1));
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.02, 3), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
  root.add(wire);
  for (const [px, pz] of [[x1, z1], [x2, z2]] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, h + 0.3, 6), std(0x4a4a4a, { metalness: 0.6 }));
    p.position.set(px, (h + 0.3) / 2, pz);
    root.add(p);
  }
  b.custom(root);
}

/** Entrance arch with a big glowing sign. */
export function entranceArch(b: MapBuilder, x: number, z: number, rot: number): void {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rot;
  const pillarMat = std(0xe8dcc0, { roughness: 0.8 });
  for (const sx of [-6, 6]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8, 1.4), pillarMat);
    p.position.set(sx, 4, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 4), std(0xb3262c));
    cap.position.set(sx, 8.8, 0);
    cap.rotation.y = Math.PI / 4;
    root.add(p, cap);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(6, 0.35, 6, 32, Math.PI), std(0xb3262c));
  arch.position.y = 7;
  root.add(arch);
  // sign board (canvas text)
  let signMat: THREE.Material = glow(0xffd36a, 1.2);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#1a0c08';
      g.fillRect(0, 0, 512, 128);
      g.font = '900 78px Rajdhani, Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffd36a';
      g.fillText('LUNAPARK', 256, 68);
      // flickering dead letters look
      g.fillStyle = 'rgba(26,12,8,0.75)';
      g.fillRect(318, 18, 52, 96);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      signMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.6, map: t });
    }
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 0.3), signMat);
  sign.position.y = 10.8;
  root.add(sign);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * 6, 7 + Math.sin(a) * 6, 0.45));
  }
  root.add(bulbs(pts, 0.16, [0xffd36a, 0xffffff]));
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  b.custom(root, [
    [x + 6 * c, z - 6 * s, 1.4, 1.4],
    [x - 6 * c, z + 6 * s, 1.4, 1.4],
  ]);
}

/** Chair-swing ride: tall mast, spinning crown, chairs flung out on chains. */
export function swingRide(b: MapBuilder, x: number, z: number): void {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const steel = std(0xc8c4bc, { metalness: 0.75, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.8, 16), std(0x5a4a3a));
  base.position.y = 0.4;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 12, 10), steel);
  mast.position.y = 6;
  root.add(base, mast);
  const crown = new THREE.Group();
  crown.position.y = 11.5;
  crown.userData.spin = { axis: 'y', speed: 0.7 };
  const tex = stripeTex();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.2, 20, 1, true), std(0xffffff, { map: tex ?? undefined, side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.position.y = 1;
  crown.add(canopy);
  const pts: THREE.Vector3[] = [];
  const chairMat = std(0x3a7ad9, { metalness: 0.4 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.position.set(Math.cos(a) * 4.6, -0.1, Math.sin(a) * 4.6);
    arm.rotation.y = -a;
    // flung outward: chain tilted ~35°
    const swing = new THREE.Group();
    swing.rotation.z = -0.62;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 5.5, 3), steel);
    chain.position.y = -2.75;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.6), chairMat);
    seat.position.y = -5.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.6), chairMat);
    back.position.set(-0.32, -5.2, 0);
    swing.add(chain, seat, back);
    arm.add(swing);
    crown.add(arm);
    pts.push(new THREE.Vector3(Math.cos(a) * 5.15, 0, Math.sin(a) * 5.15));
  }
  crown.add(bulbs(pts, 0.15, [0xffd36a, 0x5ee0ff]));
  root.add(crown);
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
  b.custom(root, [[x, z, 4.4, 4.4]]);
  b.clear(x, z, 9);
}

/** Food court: umbrellas over picnic tables around a kiosk. */
export function foodCourt(b: MapBuilder, x: number, z: number): void {
  booth(b, x, z, 0, 0xe87a30);
  const cols = [0xd94040, 0x3a7ad9, 0xe8c040, 0x40a860];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const px = x + Math.cos(a) * 7;
    const pz = z + Math.sin(a) * 6 + 3;
    if (!b.isClear(px, pz, 1.5)) continue;
    b.prop('picnic', px, pz, { rot: a });
    const um = new THREE.Group();
    um.position.set(px, 0, pz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 5), std(0xdddddd, { metalness: 0.6 }));
    pole.position.y = 1.4;
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 8, 1, true), std(cols[i % cols.length]!, { side: THREE.DoubleSide, roughness: 0.85 }));
    top.position.y = 2.9;
    top.rotation.z = b.r(-0.12, 0.12);
    um.add(pole, top);
    um.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
    b.custom(um);
  }
}

/** Circus trailer (wagon): coloured box on wheels, a few in a camp. */
export function trailer(b: MapBuilder, x: number, z: number, rot: number, color: number): void {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rot;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 6.5), std(color, { roughness: 0.75 }));
  body.position.y = 1.9;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6.6, 12, 1, false, 0, Math.PI), std(0xe8dcc0));
  roof.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  roof.scale.set(1, 1, 0.35);
  roof.position.y = 3.2;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.18, 6.6), std(0xd9a514, { metalness: 0.7, roughness: 0.3 }));
  trim.position.y = 2.6;
  root.add(body, roof, trim);
  for (const wz of [-2.2, 2.2])
    for (const wx of [-1.35, 1.35]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 12), std(0x2a1a10));
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.55, wz);
      root.add(w);
    }
  root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh));
  b.custom(root, [[x, z, 2.8, 6.6, rot]]);
}

/** Objects that the map's update loop keeps spinning. */
export function collectSpinners(root: THREE.Object3D): Array<{ o: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }> {
  const out: Array<{ o: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }> = [];
  root.traverse((o) => {
    const sp = o.userData.spin as { axis: 'x' | 'y' | 'z'; speed: number } | undefined;
    if (sp) out.push({ o, axis: sp.axis, speed: sp.speed });
  });
  return out;
}
