import * as THREE from 'three';
import { makeAabb, type Aabb } from './collision';
import {
  asphaltMap,
  concreteMap,
  dirtMap,
  hazardMap,
  metalMap,
  rustMap,
  stdMat,
} from './materials';
import { MISSION_SECTORS } from './mission';

/** 10× previous arena (56 → 560). */
export const ARENA_SIZE = 560;
export const ARENA_BOUND = ARENA_SIZE / 2 - 8;

export interface MapBuildResult {
  colliders: Aabb[];
  core: THREE.Mesh;
  ring: THREE.Mesh;
  ring2: THREE.Mesh;
  alarm: THREE.PointLight;
  coreGlow: THREE.PointLight;
  sectorMarkers: THREE.Group[];
}

export function buildWorldMap(scene: THREE.Scene): MapBuildResult {
  const colliders: Aabb[] = [];

  const asphalt = stdMat(asphaltMap(28), 0xffffff, { metalness: 0.08, roughness: 0.92 });
  const curb = stdMat(concreteMap(6), 0xffffff, { metalness: 0.12, roughness: 0.85 });
  const dirt = stdMat(dirtMap(20), 0xffffff, { metalness: 0.05, roughness: 0.95 });
  const metal = stdMat(metalMap(), 0xffffff, { metalness: 0.65, roughness: 0.4 });
  const rust = stdMat(rustMap(), 0xffffff, { metalness: 0.45, roughness: 0.7 });
  const panel = stdMat(concreteMap(4), 0xb8c0c8, { metalness: 0.2, roughness: 0.78 });
  const hazard = stdMat(hazardMap(), 0xffffff, {
    metalness: 0.25,
    roughness: 0.55,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.15,
  });
  const neon = stdMat(null, 0x3dff9a, {
    metalness: 0.3,
    roughness: 0.35,
    emissive: 0x3dff9a,
    emissiveIntensity: 0.95,
  });
  const wood = stdMat(dirtMap(3), 0x8b6914, { metalness: 0.05, roughness: 0.88 });
  const brick = stdMat(concreteMap(3), 0x8a6a5a, { metalness: 0.08, roughness: 0.9 });
  const grass = stdMat(dirtMap(4), 0x3d5a3a, { metalness: 0.02, roughness: 0.95 });
  const barrelGreen = stdMat(metalMap(), 0x2f5d3a, {
    metalness: 0.55,
    roughness: 0.45,
    emissive: 0x14532d,
    emissiveIntensity: 0.08,
  });
  const barrelRed = stdMat(metalMap(), 0x7f1d1d, {
    metalness: 0.55,
    roughness: 0.45,
    emissive: 0x450a0a,
    emissiveIntensity: 0.12,
  });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // District tint patches (visual variety)
  const addPatch = (x: number, z: number, w: number, d: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  addPatch(-140, -120, 160, 140, dirt);
  addPatch(150, 130, 180, 150, grass);
  addPatch(160, -140, 140, 120, curb);
  addPatch(-150, 140, 130, 130, brick);

  const laneMat = new THREE.MeshBasicMaterial({ color: 0xd4c48a, transparent: true, opacity: 0.28 });
  for (let i = -20; i <= 20; i++) {
    if (i === 0) continue;
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3.2), laneMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(i * 12, 0.02, 0);
    scene.add(dash);
    const dash2 = dash.clone();
    dash2.position.set(0, 0.02, i * 12);
    dash2.rotation.z = Math.PI / 2;
    scene.add(dash2);
  }

  const curbRing = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_SIZE / 2 - 2, ARENA_SIZE / 2 + 1.5, 96),
    curb,
  );
  curbRing.rotation.x = -Math.PI / 2;
  curbRing.position.y = 0.03;
  curbRing.receiveShadow = true;
  scene.add(curbRing);

  const apron = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_SIZE / 2 + 1, ARENA_SIZE / 2 + 40, 96),
    dirt,
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  scene.add(apron);

  const mkBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rotY = 0,
    collide = true,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    if (collide) {
      const hw = (Math.abs(Math.cos(rotY)) * w + Math.abs(Math.sin(rotY)) * d) * 0.5;
      const hd = (Math.abs(Math.sin(rotY)) * w + Math.abs(Math.cos(rotY)) * d) * 0.5;
      colliders.push(makeAabb(x, z, hw, hd));
    }
    return m;
  };

  // Perimeter walls
  const wallH = 5;
  const half = ARENA_SIZE / 2;
  for (const [w, h, d, x, z] of [
    [ARENA_SIZE + 4, wallH, 2.2, 0, -half - 1],
    [ARENA_SIZE + 4, wallH, 2.2, 0, half + 1],
    [2.2, wallH, ARENA_SIZE + 4, -half - 1, 0],
    [2.2, wallH, ARENA_SIZE + 4, half + 1, 0],
  ] as const) {
    mkBox(w, h, d, x, h / 2, z, panel);
  }

  const addBuilding = (x: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => {
    mkBox(w, h, d, x, h / 2, z, mat);
    mkBox(w * 0.9, 0.4, d * 0.25, x, h + 0.15, z - d * 0.3, rust, 0, false);
  };

  // Industrial district (SW)
  for (let i = 0; i < 14; i++) {
    const x = -220 + (i % 5) * 28 + (Math.random() - 0.5) * 6;
    const z = -200 + Math.floor(i / 5) * 32 + (Math.random() - 0.5) * 6;
    addBuilding(x, z, 10 + Math.random() * 8, 4 + Math.random() * 5, 8 + Math.random() * 6, panel);
  }

  // Residential rubble (NE)
  for (let i = 0; i < 18; i++) {
    const x = 120 + (i % 6) * 22;
    const z = 100 + Math.floor(i / 6) * 26;
    addBuilding(x, z, 7 + Math.random() * 5, 3.5 + Math.random() * 4, 7 + Math.random() * 4, brick);
  }

  // Military hangars (SE)
  for (let i = 0; i < 8; i++) {
    const x = 100 + (i % 4) * 36;
    const z = -180 + Math.floor(i / 4) * 40;
    addBuilding(x, z, 18, 6, 12, metal);
  }

  // Park / plaza props (NW)
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 40 + (i % 4) * 18;
    const x = -140 + Math.cos(a) * r;
    const z = 140 + Math.sin(a) * r;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, 2.4, 8),
      wood,
    );
    trunk.position.set(x, 1.2, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.6 + Math.random(), 10, 8),
      grass,
    );
    canopy.position.set(x, 3.2, z);
    canopy.castShadow = true;
    scene.add(canopy);
    colliders.push(makeAabb(x, z, 0.7, 0.7));
  }

  // Central fortress + bunkers
  const corners: [number, number][] = [
    [40, 40],
    [-40, 40],
    [40, -40],
    [-40, -40],
    [90, 0],
    [-90, 0],
    [0, 90],
    [0, -90],
  ];
  for (const [cx, cz] of corners) {
    mkBox(5, 6, 5, cx, 3, cz, metal);
    mkBox(3.4, 1.2, 3.4, cx, 6.4, cz, panel);
    mkBox(1.4, 0.35, 1.4, cx, 7.1, cz, neon, 0, false);
    const spot = new THREE.SpotLight(0xffe6c8, 2.4, 55, Math.PI / 4.2, 0.5, 1);
    spot.position.set(cx, 7, cz);
    spot.target.position.set(cx * 0.2, 0, cz * 0.2);
    scene.add(spot, spot.target);
  }

  // Mid warehouses around core
  const hangars: Array<[number, number, number, number, number]> = [
    [14, 5, 8, 0, -28],
    [12, 4.5, 7, -30, -18],
    [12, 4.5, 7, 30, -18],
    [16, 5.5, 8, 0, 30],
    [9, 4, 10, -32, 12],
    [9, 4, 10, 32, -8],
  ];
  for (const [w, h, d, x, z] of hangars) {
    addBuilding(x, z, w, h, d, panel);
  }

  const addCrate = (x: number, z: number) => {
    const h1 = 0.9 + Math.random() * 0.4;
    mkBox(1.1, h1, 1.1, x, h1 / 2, z, wood, Math.random() * 0.5);
  };
  const addBarrel = (x: number, z: number, red = false) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.38, 1.05, 12),
      red ? barrelRed : barrelGreen,
    );
    m.position.set(x, 0.55, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push(makeAabb(x, z, 0.4, 0.4));
  };
  const addBarricade = (x: number, z: number, rot = 0) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.4, 0.6), metal);
    base.position.y = 0.45;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, 0.25), hazard);
    top.position.y = 1.05;
    g.add(base, top);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(g);
    colliders.push(makeAabb(x, z, 1.5, 0.5));
  };
  const addCar = (x: number, z: number, rot: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.1), rust);
    body.position.y = 0.55;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.0), metal);
    cabin.position.set(-0.2, 1.05, 0);
    g.add(body, cabin);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(g);
    colliders.push(makeAabb(x, z, 1.3, 0.7));
  };

  // Scatter cover across map in rings
  for (let ring = 1; ring <= 8; ring++) {
    const count = 6 + ring * 2;
    const radius = 18 + ring * 28;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.2;
      const x = Math.cos(a) * radius + (Math.random() - 0.5) * 8;
      const z = Math.sin(a) * radius + (Math.random() - 0.5) * 8;
      if (Math.hypot(x, z) < 12) continue;
      const roll = Math.random();
      if (roll < 0.35) addCrate(x, z);
      else if (roll < 0.55) addBarrel(x, z, roll < 0.42);
      else if (roll < 0.75) addBarricade(x, z, a);
      else addCar(x, z, a);
    }
  }

  // Inner barricade ring
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    addBarricade(Math.cos(a) * 12, Math.sin(a) * 12, a + Math.PI / 2);
  }

  // Debris
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 20 + Math.random() * 220;
    const s = 0.4 + Math.random() * 1.2;
    mkBox(s, s * 0.5, s * 0.8, Math.cos(a) * d, s * 0.25, Math.sin(a) * d, dirt, Math.random(), false);
  }

  // Reactor
  mkBox(10, 0.5, 10, 0, 0.25, 0, metal);
  mkBox(7, 0.35, 7, 0, 0.55, 0, panel);
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.7, 3.4, 16),
    stdMat(null, 0x3dff9a, {
      metalness: 0.4,
      roughness: 0.3,
      emissive: 0x00aa55,
      emissiveIntensity: 0.75,
    }),
  );
  core.position.y = 2.2;
  core.castShadow = true;
  scene.add(core);
  colliders.push(makeAabb(0, 0, 2.2, 2.2));

  const coreCap = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.1, 0.6, 14), neon);
  coreCap.position.y = 4.1;
  scene.add(coreCap);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.2, 0.1, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.75 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.6;
  scene.add(ring);
  const ring2 = ring.clone();
  ring2.scale.setScalar(1.35);
  ring2.material = new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.22 });
  scene.add(ring2);

  const alarm = new THREE.PointLight(0xff3b2f, 2.2, 50, 1.6);
  alarm.position.set(0, 8, 0);
  scene.add(alarm);
  const coreGlow = new THREE.PointLight(0x3dff9a, 3.8, 36, 1.4);
  coreGlow.position.set(0, 4, 0);
  scene.add(coreGlow);

  // Sector beacons — level geography readable from the camera
  const sectorMarkers: THREE.Group[] = [];

  // YAZS Atmosphere Details: Street lamp posts with localized pools of light, blood splatter decals, and abandoned barricades
  const lampPoleMat = stdMat(metalMap(), 0x1f2937, { metalness: 0.8, roughness: 0.3 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const bloodDecalMat = new THREE.MeshBasicMaterial({
    color: 0x450a0a,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  // Scatter gritty street lamps along major roadway paths
  for (let lx = -180; lx <= 180; lx += 60) {
    for (let lz of [-80, 80]) {
      if (Math.hypot(lx, lz) < 18) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.5, 8), lampPoleMat);
      pole.position.set(lx, 2.75, lz);
      pole.castShadow = true;
      scene.add(pole);

      const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.8), lampPoleMat);
      lampHead.position.set(lx, 5.5, lz);
      scene.add(lampHead);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), lampGlowMat);
      bulb.position.set(lx, 5.35, lz);
      scene.add(bulb);

      const lampLight = new THREE.PointLight(0xfef08a, 1.4, 22, 1.8);
      lampLight.position.set(lx, 5.2, lz);
      scene.add(lampLight);

      colliders.push(makeAabb(lx, lz, 0.25, 0.25));
    }
  }

  // Blood pool decals scattered across battlefield chokepoints
  for (let b = 0; b < 45; b++) {
    const angle = (b / 45) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 14 + Math.random() * 190;
    const bx = Math.cos(angle) * dist;
    const bz = Math.sin(angle) * dist;
    const radius = 1.2 + Math.random() * 2.4;
    const bloodPool = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), bloodDecalMat);
    bloodPool.rotation.x = -Math.PI / 2;
    bloodPool.position.set(bx, 0.025, bz);
    scene.add(bloodPool);
  }
  for (const sector of MISSION_SECTORS) {
    if (sector.id === 'core') continue;
    const g = new THREE.Group();
    g.position.set(sector.x, 0, sector.z);
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(Math.min(14, sector.radius * 0.12), Math.min(18, sector.radius * 0.16), 40),
      new THREE.MeshBasicMaterial({
        color: sector.color,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.05;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 6.5, 8),
      stdMat(null, sector.color, {
        metalness: 0.35,
        roughness: 0.4,
        emissive: sector.color,
        emissiveIntensity: 0.55,
      }),
    );
    pole.position.y = 3.25;
    pole.castShadow = true;
    const beacon = new THREE.PointLight(sector.color, 1.4, 28, 1.8);
    beacon.position.y = 7;
    g.add(pad, pole, beacon);
    scene.add(g);
    sectorMarkers.push(g);
  }

  return { colliders, core, ring, ring2, alarm, coreGlow, sectorMarkers };
}
