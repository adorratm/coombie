import * as THREE from 'three';
import { pbr, propGroup } from './mapBuilder';

/**
 * A 6x6 military cargo truck built from shaped (bevelled, extruded) panels with
 * photo-textured PBR materials, plus photoscanned props (crates, jerrycans, tyres)
 * loaded on the bed. Front = +Z, ground = y 0, about 7.4 m long, 2.5 m wide.
 */

const OLIVE = 0x6b7550;
const DARK = 0x1c1e1a;

function mats() {
  // olive drab paint: flat colour, the plate texture only for its dents (normal map)
  const plate = pbr('metal_plate', 1.6);
  const paint = new THREE.MeshStandardMaterial({ color: OLIVE, roughness: 0.68, metalness: 0.3, normalMap: plate.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
  const darkMetal = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6, metalness: 0.7 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, metalness: 0 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x3e4430, roughness: 0.55, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.85 });
  const canvas = pbr('hessian_230', 1.2, { tint: 0x9a9a6a, rough: 1 }).clone();
  canvas.side = THREE.DoubleSide;
  const wood = pbr('dark_wooden_planks', 1.2, { tint: 0x7a6a50 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xfff0c0, emissiveIntensity: 1.6 });
  const redLamp = new THREE.MeshStandardMaterial({ color: 0x7a0a0a, emissive: 0xff2010, emissiveIntensity: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0x8a8e90, roughness: 0.25, metalness: 0.95 });
  return { paint, darkMetal, rubber, rim, glass, canvas, wood, lamp, redLamp, chrome };
}

/** Side profile (z forward, y up) extruded across the width, with bevelled edges. */
function extrudeSide(points: [number, number][], width: number, bevel = 0.05): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i]![0], points[i]![1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  // shape space is (z, y) → rotate so the extrusion runs along x, centred
  g.rotateY(-Math.PI / 2);
  g.translate((width - bevel * 2) / 2, 0, 0);
  return g;
}

function wheel(m: ReturnType<typeof mats>, r: number, w: number): THREE.Group {
  const g = new THREE.Group();
  // tyre: lathe profile with rounded shoulders, plus tread lugs
  const prof: THREE.Vector2[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    prof.push(new THREE.Vector2(r - 0.09 + Math.cos(a) * 0.09, (Math.sin(a) * w) / 2));
  }
  prof.unshift(new THREE.Vector2(r * 0.62, -w / 2));
  prof.push(new THREE.Vector2(r * 0.62, w / 2));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), m.rubber);
  tyre.rotation.z = Math.PI / 2;
  g.add(tyre);
  const lugGeo = new THREE.BoxGeometry(w * 0.42, 0.05, 0.1);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const lug = new THREE.Mesh(lugGeo, m.rubber);
      lug.position.set(side * w * 0.22, Math.cos(a) * (r + 0.005), Math.sin(a) * (r + 0.005));
      lug.rotation.x = a + side * 0.35;
      g.add(lug);
    }
  }
  // rim + hub + bolts
  const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 0.84, 20), m.rim);
  rimMesh.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.26, w * 0.96, 12), m.darkMetal);
  hub.rotation.z = Math.PI / 2;
  g.add(rimMesh, hub);
  const boltGeo = new THREE.CylinderGeometry(0.018, 0.018, w + 0.02, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new THREE.Mesh(boltGeo, m.chrome);
    b.rotation.z = Math.PI / 2;
    b.position.set(0, Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36);
    g.add(b);
  }
  g.traverse((o) => {
    o.castShadow = true;
  });
  return g;
}

export function buildMilitaryTruck(): THREE.Group {
  const m = mats();
  const truck = new THREE.Group();
  truck.name = 'convoyTruck';
  const W = 2.45;
  const add = (o: THREE.Object3D) => {
    o.traverse((c) => {
      c.castShadow = true;
      c.receiveShadow = true;
    });
    truck.add(o);
    return o;
  };

  // ── chassis rails, bumpers, fuel tank
  for (const x of [-0.45, 0.45]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 6.6), m.darkMetal);
    rail.position.set(x, 0.86, -0.2);
    add(rail);
  }
  const bumper = new THREE.Mesh(extrudeSide([[0, 0], [0.32, 0], [0.32, 0.34], [0, 0.34]], W + 0.15, 0.03), m.darkMetal);
  bumper.position.set(0, 0.62, 3.15);
  add(bumper);
  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 14), m.darkMetal);
  winch.rotation.z = Math.PI / 2;
  winch.position.set(0, 0.79, 3.42);
  add(winch);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 16), m.paint);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(-1.0, 0.95, 0.65);
  add(tank);

  // ── cab: hood sloping to the windshield, roof, back wall (one bevelled profile)
  const cab = new THREE.Mesh(
    extrudeSide(
      [
        [3.15, 0.86],
        [3.15, 1.68],
        [2.95, 1.86],
        [1.75, 1.92],
        [1.38, 2.86],
        [0.32, 2.9],
        [0.25, 0.86],
      ],
      W,
      0.07,
    ),
    m.paint,
  );
  add(cab);
  // grille + headlights + blackout lamps
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.62, 0.05), m.darkMetal);
  grille.position.set(0, 1.27, 3.2);
  add(grille);
  for (let i = 0; i < 9; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.06), m.paint);
    slat.position.set(-0.64 + i * 0.16, 1.27, 3.23);
    add(slat);
  }
  for (const x of [-0.95, 0.95]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.12, 18), m.darkMetal);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 1.36, 3.2);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), m.lamp);
    lens.position.set(x, 1.36, 3.27);
    add(ring);
    add(lens);
  }
  // windshield (split), side windows
  for (const x of [-0.58, 0.58]) {
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.82), m.glass);
    ws.position.set(x, 2.4, 1.58);
    ws.rotation.x = -0.4;
    add(ws);
  }
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), m.glass);
    win.position.set(side * (W / 2 + 0.005), 2.38, 0.85);
    win.rotation.y = side * Math.PI / 2;
    add(win);
    // door seam + handle
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1.3, 0.03), m.darkMetal);
    seam.position.set(side * (W / 2 + 0.01), 1.75, 1.42);
    add(seam);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.2), m.chrome);
    handle.position.set(side * (W / 2 + 0.03), 1.7, 0.6);
    add(handle);
    // mirror on an arm
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), m.darkMetal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * (W / 2 + 0.22), 2.35, 1.55);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.24), m.darkMetal);
    mirror.position.set(side * (W / 2 + 0.45), 2.35, 1.55);
    add(arm);
    add(mirror);
    // step + fender over the front wheel
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.5), m.darkMetal);
    step.position.set(side * (W / 2 - 0.05), 0.72, 0.95);
    add(step);
    const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.62, 18, 1, true, 0, Math.PI), m.paint);
    fender.rotation.z = Math.PI / 2;
    fender.rotation.y = Math.PI / 2;
    fender.position.set(side * (W / 2 - 0.2), 1.0, 2.45);
    fender.material = m.paint.clone();
    (fender.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    add(fender);
  }
  // exhaust stack + roof hatch + antenna
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 10), m.darkMetal);
  exhaust.position.set(1.32, 2.0, 0.4);
  add(exhaust);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.1, 16), m.paint);
  hatch.position.set(-0.4, 2.95, 0.85);
  add(hatch);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 2.2, 5), m.darkMetal);
  antenna.position.set(-1.1, 3.95, 0.4);
  add(antenna);

  // ── cargo bed: wooden floor, drop sides, canvas over bows
  const bedL = 3.9;
  const bedZ = -2.05;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, bedL), m.wood);
  floor.position.set(0, 1.12, bedZ);
  add(floor);
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, bedL), m.paint);
    board.position.set(side * (W / 2 - 0.035), 1.5, bedZ);
    add(board);
    for (let k = 0; k < 4; k++) {
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.66, 0.07), m.darkMetal);
      stake.position.set(side * (W / 2 + 0.01), 1.5, bedZ - bedL / 2 + 0.3 + k * ((bedL - 0.6) / 3));
      add(stake);
    }
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(W, 0.62, 0.07), m.paint);
  tail.position.set(0, 1.5, bedZ - bedL / 2 + 0.035);
  add(tail);
  // canvas cover: half cylinder with sagging ends, bows underneath
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(W / 2 - 0.02, W / 2 - 0.02, bedL - 0.25, 22, 6, true, -Math.PI / 2, Math.PI), m.canvas);
  // cylinder axis along the truck, open side down
  cover.rotation.x = -Math.PI / 2;
  cover.scale.set(1, 1, 0.72);
  cover.position.set(0, 1.82, bedZ + 0.05);
  add(cover);
  // a little cloth sag between the bows
  const pos = cover.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const along = pos.getY(i) / ((bedL - 0.25) / 2);
    const sag = Math.abs(Math.sin(along * Math.PI * 2)) * 0.035;
    pos.setX(i, pos.getX(i) * (1 - sag));
    pos.setZ(i, pos.getZ(i) * (1 - sag));
  }
  pos.needsUpdate = true;
  cover.geometry.computeVertexNormals();
  // tail flap rolled up
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, W - 0.2, 12), m.canvas);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 2.55, bedZ - bedL / 2 + 0.15);
  add(roll);
  // tail lights + reflectors
  for (const x of [-1.0, 1.0]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), m.redLamp);
    tl.position.set(x, 0.98, bedZ - bedL / 2 - 0.02);
    add(tl);
  }

  // ── wheels: 6x6 (front axle + tandem rear), mud flaps
  const r = 0.58;
  for (const z of [2.45, -1.25, -2.65]) {
    for (const side of [-1, 1]) {
      const wh = wheel(m, r, 0.46);
      wh.position.set(side * (W / 2 - 0.12), r, z);
      wh.name = 'wheel';
      add(wh);
    }
  }
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.02), m.rubber);
    flap.position.set(side * (W / 2 - 0.12), 0.45, -3.45);
    add(flap);
  }
  // spare tyre on the cab back
  const spare = wheel(m, 0.5, 0.36);
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0.7, 1.55, 0.06);
  add(spare);

  // photoscanned cargo on the bed (async; the truck is complete without it)
  void (async () => {
    try {
      const crate = await propGroup('wooden_military_crate', 1.0);
      crate.position.set(-0.55, 1.19, bedZ - 0.9);
      crate.rotation.y = 0.05;
      truck.add(crate);
      const crate2 = await propGroup('old_military_crate', 0.9);
      crate2.position.set(0.5, 1.19, bedZ - 0.6);
      crate2.rotation.y = -0.1;
      truck.add(crate2);
      const ammo = await propGroup('ammo_box', 1.2);
      ammo.position.set(0.55, 1.19, bedZ + 0.6);
      truck.add(ammo);
      for (const [x, z] of [
        [1.32, -0.5],
        [1.32, -0.85],
      ] as const) {
        const can = await propGroup('metal_jerrycan', 1.0);
        can.position.set(x, 1.26, bedZ + z + 1.6);
        can.rotation.y = Math.PI / 2;
        truck.add(can);
      }
    } catch {
      /* props are a bonus */
    }
  })();

  return truck;
}

/** Spin the wheels for `dist` metres travelled. */
export function rollTruckWheels(truck: THREE.Object3D, dist: number): void {
  for (const c of truck.children) if (c.name === 'wheel') c.rotation.x += dist / 0.58;
}
