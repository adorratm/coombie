import * as THREE from 'three';
import { MapBuilder, type PropId } from './mapBuilder';

/**
 * Hand-designed (seeded) maps. Each has its own ground, structures, prop palette,
 * lighting, weather and objective anchors used by the game modes.
 */

export type MapId = 'city' | 'hospital' | 'military' | 'harbor' | 'forest' | 'highway' | 'industrial' | 'snow' | 'desert' | 'lab' | 'village' | 'mall' | 'airport' | 'campus';
export type Weather = 'none' | 'rain' | 'snow' | 'dust' | 'ash';
export type ModeId = 'survival' | 'horde' | 'defense' | 'rescue' | 'evac' | 'boss' | 'endless' | 'zones' | 'hunt' | 'blitz';
/** Modes that need no map-specific anchors beyond the common ones, so every map offers them. */
export const UNIVERSAL_MODES: ModeId[] = ['zones', 'hunt', 'blitz'];

export interface MapLighting {
  bg: number;
  fog: number;
  fogDensity: number;
  ambient: [number, number];
  hemi: [number, number, number];
  sun: [number, number];
  sunDir: [number, number, number];
  rim: [number, number];
  exposure: number;
}

export interface MapDef {
  id: MapId;
  name: string;
  tagline: string;
  desc: string;
  half: number;
  seed: number;
  weather: Weather;
  lighting: MapLighting;
  modes: ModeId[];
  /** accent colour for lobby cards */
  accent: number;
  build: (b: MapBuilder) => void;
}

const CAR_TINTS = [0xd9d6cf, 0x6b7a86, 0x3a4048, 0x8a5a4a, 0x50614a, 0xbcb39a, 0x2c2f36];
const URBAN_CLUTTER: PropId[] = ['trashbag', 'trashbag', 'cardboard', 'tyre', 'trashcan', 'plastic_crate'];
const IND_CLUTTER: PropId[] = ['barrel', 'barrel_rust', 'barrel_blue', 'jerrycan', 'plastic_box', 'tyre', 'cementbag'];

/** Common anchor layout: pickups / rescues on a ring, boss in a far corner. */
function ringAnchors(b: MapBuilder, r: number): void {
  const a0 = b.r(0, Math.PI * 2);
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i / 4) * Math.PI * 2;
    b.anchors.pickups.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  for (let i = 0; i < 3; i++) {
    const a = a0 + Math.PI / 4 + (i / 3) * Math.PI * 2;
    b.anchors.rescues.push(new THREE.Vector3(Math.cos(a) * r * 1.15, 0, Math.sin(a) * r * 1.15));
  }
  for (const p of [...b.anchors.pickups, ...b.anchors.rescues, b.anchors.evac, b.anchors.core, b.anchors.spawn]) b.clear(p.x, p.z, 5);
}

function cityBlocks(b: MapBuilder, step: number, road: number, style: Parameters<MapBuilder['building']>[5][], hRange: [number, number]): void {
  const H = b.half;
  for (let gx = -H + step / 2; gx < H; gx += step) {
    for (let gz = -H + step / 2; gz < H; gz += step) {
      const block = step - road - 4;
      if (!b.isClear(gx, gz, block / 2)) {
        // open lot / plaza
        b.patch('cracked_concrete', 4, gx, gz, block + 3, block + 3);
        continue;
      }
      b.patch('cracked_concrete', 4, gx, gz, block + 3, block + 3);
      const split = b.rng() < 0.6;
      if (split) {
        const w = block / 2 - 1;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            if (b.rng() < 0.2) {
              b.scatter(['car', 'barrier', 'trashcan', 'utilitybox'], 2, gx + sx * w * 0.5 - w / 2, gz + sz * w * 0.5 - w / 2, gx + sx * w * 0.5 + w / 2, gz + sz * w * 0.5 + w / 2);
              continue;
            }
            b.building(gx + (sx * (w + 1)) / 2, gz + (sz * (w + 1)) / 2, w - b.r(0, 3), w - b.r(0, 3), b.r(hRange[0], hRange[1]), b.pick(style));
          }
        }
      } else {
        b.building(gx, gz, block - b.r(0, 4), block - b.r(0, 4), b.r(hRange[0], hRange[1]) * 1.4, b.pick(style));
      }
      b.clutter(gx + block / 2 + 1, gz + b.r(-block / 2, block / 2), URBAN_CLUTTER, 3, 1.2);
    }
  }
}

function gridRoads(b: MapBuilder, step: number, width: number, tex: 'road_damaged' | 'asphalt_02' | 'asphalt_snow' = 'road_damaged'): number[] {
  const H = b.half;
  const lines: number[] = [];
  for (let v = -H + step; v < H; v += step) lines.push(v);
  for (const v of lines) {
    b.road(v, -H - 20, v, H + 20, width, { tex });
    b.road(-H - 20, v, H + 20, v, width, { tex, curb: false });
  }
  return lines;
}

function streetLife(b: MapBuilder, lines: number[], width: number, cars: number, realLights = 4): void {
  const H = b.half;
  let lights = 0;
  for (const v of lines) {
    for (let t = -H; t < H; t += 18) {
      const side = b.rng() < 0.5 ? -1 : 1;
      const real = lights < realLights && b.rng() < 0.12;
      if (b.rng() < 0.55) {
        b.lamp(v + side * (width / 2 + 1.2), t, 0xffc98a, real);
        if (real) lights++;
      }
    }
  }
  for (let i = 0; i < cars; i++) {
    const v = b.pick(lines);
    const t = b.r(-H, H);
    const along = b.rng() < 0.5;
    const off = b.r(-width / 3, width / 3);
    const x = along ? v + off : t;
    const z = along ? t : v + off;
    if (!b.isClear(x, z, 2.5)) continue;
    b.prop('car', x, z, { rot: (along ? 0 : Math.PI / 2) + b.r(-0.5, 0.5), tint: b.pick(CAR_TINTS) });
  }
  // roadblocks
  for (let i = 0; i < 6; i++) {
    const v = b.pick(lines);
    const t = b.r(-H * 0.8, H * 0.8);
    const along = b.rng() < 0.5;
    for (let k = -1; k <= 1; k++) {
      const x = along ? v + k * 2.3 : t;
      const z = along ? t : v + k * 2.3;
      if (b.isClear(x, z, 1)) b.prop('barrier', x, z, { rot: along ? b.r(-0.2, 0.2) : Math.PI / 2 + b.r(-0.2, 0.2) });
    }
  }
}

const L = (l: MapLighting) => l;

export const MAPS: Record<MapId, MapDef> = {
  city: {
    id: 'city',
    name: 'Ölü Şehir',
    tagline: 'Gece · Yağmur',
    desc: 'Terk edilmiş şehir merkezi: arabalarla tıkanmış caddeler, barikatlar ve karanlık bloklar.',
    half: 100,
    seed: 1101,
    weather: 'rain',
    accent: 0x38bdf8,
    modes: ['survival', 'horde', 'defense', 'rescue', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x05070a, fog: 0x070a0f, fogDensity: 0.02, ambient: [0x1e2733, 0.5], hemi: [0x52627a, 0x0f141a, 0.75], sun: [0xaec4ff, 1.25], sunDir: [-20, 42, 18], rim: [0x38bdf8, 0.6], exposure: 1.3 }),
    build: (b) => {
      b.ground('asphalt_02', 6, 'cracked_concrete', 5, 0.6, 0xb8bcc2);
      b.anchors.spawn.set(0, 0, 6);
      b.anchors.evac.set(80, 0, -80);
      b.anchors.boss.set(-60, 0, 60);
      ringAnchors(b, 55);
      b.clear(0, 0, 10);
      const lines = gridRoads(b, 40, 11);
      cityBlocks(b, 40, 11, [
        { wall: 'brick_wall_10', roof: 'grey_roof_01', wallTile: 3 },
        { wall: 'concrete_wall_008', roof: 'grey_roof_01', tint: 0xc8c8c8 },
        { wall: 'brick_wall_10', roof: 'concrete_floor_worn_001', tint: 0xb59a8a },
      ], [6, 14]);
      // central plaza: police roadblock around the generator
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        if (k % 5 === 2) continue;
        b.prop('barrier', Math.cos(a) * 11, Math.sin(a) * 11, { rot: -a - Math.PI / 2 });
      }
      b.prop('car', -7, 9, { rot: 0.4, tint: 0x1c2a44 });
      b.prop('car', 8, -8, { rot: 2.1, tint: 0xe8e8e8 });
      b.sandbags(-4, -12, 4, -12);
      b.clutter(-9, -3, ['milcrate', 'ammo', 'jerrycan'], 3, 1.5);
      b.clutter(6, 6, ['cardboard', 'trashbag', 'tyre'], 4, 2);
      for (const [x, z] of [[-12, -12], [12, 12]] as const) b.lamp(x, z, 0xe8f0ff, true);
      streetLife(b, lines, 11, 55, 2);
      b.scatter(['hydrant', 'trashcan', 'utilitybox', 'bench'], 30, -95, -95, 95, 95, 2);
      b.scatter(URBAN_CLUTTER, 90, -98, -98, 98, 98, 0.6);
    },
  },
  hospital: {
    id: 'hospital',
    name: 'Karantina Hastanesi',
    tagline: 'Sis · Hafif yağmur',
    desc: 'Salgının başladığı hastane. Avlu, otopark ve sahra çadırları zombilerle dolu.',
    half: 90,
    seed: 2203,
    weather: 'rain',
    accent: 0x86efac,
    modes: ['survival', 'horde', 'defense', 'rescue', 'evac', 'endless'],
    lighting: L({ bg: 0x070a08, fog: 0x0b100d, fogDensity: 0.024, ambient: [0x24302a, 0.55], hemi: [0x6b7f72, 0x101410, 0.7], sun: [0xd7f0e0, 1.1], sunDir: [22, 44, 10], rim: [0x86efac, 0.45], exposure: 1.3 }),
    build: (b) => {
      b.ground('aerial_grass_rock', 8, 'brown_mud', 6, 0.7, 0x9aa894);
      b.anchors.core.set(0, 0, -6);
      b.anchors.spawn.set(0, 0, 4);
      b.anchors.evac.set(-70, 0, -70);
      b.anchors.boss.set(62, 0, 60);
      ringAnchors(b, 52);
      b.clear(0, 0, 10);
      // courtyard
      b.patch('cracked_concrete', 3, 0, -2, 34, 30, 0, 0xc8ccc4);
      const wing = { wall: 'concrete_wall_008' as const, roof: 'concrete_floor_worn_001' as const, tint: 0xd8dcd6, wallTile: 3 };
      b.building(0, -28, 54, 16, 13, wing);
      b.building(-30, -2, 14, 40, 11, wing);
      b.building(30, -2, 14, 40, 11, wing);
      b.building(0, 36, 20, 10, 6, { ...wing, tint: 0xb9c2bb });
      // parking lot
      b.patch('asphalt_02', 6, 0, 58, 70, 26, 0, 0x9a9a9a);
      for (let i = 0; i < 14; i++) {
        const x = -30 + (i % 7) * 9;
        const z = 52 + Math.floor(i / 7) * 12;
        if (b.rng() < 0.8) b.prop('car', x, z, { rot: b.r(-0.15, 0.15), tint: i % 4 === 0 ? 0xf2f2f0 : b.pick(CAR_TINTS) });
      }
      b.road(-90, 75, 90, 75, 10, { tex: 'road_damaged' });
      // field tents
      for (let i = 0; i < 5; i++) {
        const x = -55 + i * 9;
        b.building(x, 28, 6, 8, 2.8, { wall: 'hessian_230', roof: 'hessian_230', wallTile: 1.2, roofTile: 1.2, tint: 0xa9b39a, windows: false, rooftop: false });
        b.clutter(x + 4, 28, ['medbox', 'bed', 'wheelchair', 'cardboard'], 3, 2);
      }
      b.scatter(['wheelchair', 'bed', 'medbox', 'wetsign', 'trashcan', 'bench'], 40, -20, -18, 20, 14, 1.2);
      b.scatter(['shrub', 'shrub_low', 'rock_small', 'fern'], 60, -88, -88, 88, 88, 1);
      b.fence(-88, -88, 88, -88);
      b.fence(-88, -88, -88, 70);
      b.fence(88, -88, 88, 70);
      for (const [x, z] of [[-14, 8], [14, 8], [0, 18], [-24, 50], [24, 50]] as const) b.lamp(x, z, 0xd8f5e6, b.lights.length < 4);
    },
  },
  military: {
    id: 'military',
    name: 'Askeri Üs Kartal',
    tagline: 'Gün batımı · Kül',
    desc: 'Düşmüş bir askeri karargâh: kum torbası mevzileri, konteyner deposu ve kışlalar.',
    half: 100,
    seed: 3307,
    weather: 'ash',
    accent: 0xf59e0b,
    modes: ['survival', 'horde', 'defense', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x0d0a07, fog: 0x17110c, fogDensity: 0.012, ambient: [0x2a2420, 0.6], hemi: [0x8f8270, 0x14100c, 0.8], sun: [0xffd4ae, 1.75], sunDir: [40, 30, -10], rim: [0xff9a5a, 0.4], exposure: 1.2 }),
    build: (b) => {
      b.ground('gravel_road', 5, 'brown_mud', 6, 0.6, 0xa8a69c);
      b.anchors.evac.set(-78, 0, -78);
      b.anchors.boss.set(70, 0, 70);
      ringAnchors(b, 55);
      b.clear(0, 0, 10);
      b.patch('hangar_concrete_floor', 6, 0, 0, 36, 36);
      // helipad marks at evac
      b.patch('concrete_floor_worn_001', 5, -78, -78, 22, 22);
      // barracks rows
      for (let i = 0; i < 5; i++) {
        b.building(-60, -50 + i * 22, 26, 10, 4.2, { wall: 'corrugated_iron', roof: 'corrugated_iron', wallTile: 2.5, roofTile: 2.5, tint: 0x6d7558, roofTint: 0x5a6048, windows: false });
        b.building(60, -50 + i * 22, 26, 10, 4.2, { wall: 'concrete_wall_008', roof: 'corrugated_iron', tint: 0xa8a48e, roofTint: 0x4a5040 });
      }
      // container depot
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 5; c++) {
          if (b.rng() < 0.2) continue;
          b.container(-20 + c * 10, 50 + r * 9, 0, b.pick([0x5c6b4a, 0x6b5a3a, 0x4a5a6a, 0x7a4030]), b.rng() < 0.3 ? 2 : 1);
        }
      // sandbag positions around HQ
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = 24;
        b.sandbags(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + 0.28) * r, Math.sin(a + 0.28) * r);
        b.prop('searchlight', Math.cos(a + 0.14) * (r + 1.8), Math.sin(a + 0.14) * (r + 1.8), { rot: a + Math.PI / 2 });
      }
      b.scatter(['milcrate', 'milcrate_old', 'ammo', 'jerrycan', 'generator', 'barrel', 'crate'], 70, -95, -95, 95, 95, 1.2);
      // perimeter
      b.fence(-98, -98, 98, -98);
      b.fence(-98, 98, 98, 98);
      b.fence(-98, -98, -98, 98);
      b.fence(98, -98, 98, 98);
      for (const [x, z] of [[-12, -12], [12, 12], [-12, 12], [12, -12]] as const) b.fire(x, z);
    },
  },
  harbor: {
    id: 'harbor',
    name: 'Kuzey Limanı',
    tagline: 'Gece · Yoğun sis',
    desc: 'Konteyner labirentleri, depolar ve karanlık rıhtım. Son tahliye gemisi burada.',
    half: 100,
    seed: 4409,
    weather: 'rain',
    accent: 0x60a5fa,
    modes: ['survival', 'horde', 'evac', 'rescue', 'boss', 'endless'],
    lighting: L({ bg: 0x05070a, fog: 0x0c1016, fogDensity: 0.018, ambient: [0x2a3038, 0.75], hemi: [0x6a7a90, 0x0e1014, 0.9], sun: [0xc8d4f0, 1.55], sunDir: [-30, 40, -20], rim: [0x60a5fa, 0.5], exposure: 1.4 }),
    build: (b) => {
      b.ground('hangar_concrete_floor', 7, 'asphalt_02', 6, 0.55, 0x9ea3a8);
      // water along +z
      const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), new THREE.MeshStandardMaterial({ color: 0x0a1016, roughness: 0.08, metalness: 0.5 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.06, 112);
      b.root.add(water);
      b.colliders.push({ minX: -400, maxX: 400, minZ: 86, maxZ: 200 });
      b.wall(-100, 86, 100, 86, 0.6, 'concrete_wall_008', 1.2, 0x8a8a8a);
      for (let x = -90; x <= 90; x += 22) b.prop('buoy', x + b.r(-4, 4), 98 + b.r(0, 8), { collide: false });
      b.anchors.evac.set(0, 0, 78);
      b.anchors.boss.set(-70, 0, -70);
      b.anchors.core.set(0, 0, 0);
      ringAnchors(b, 50);
      b.clear(0, 0, 10);
      b.clear(0, 78, 12);
      // container rows (maze)
      const tints = [0x8a2f24, 0x2f5a8a, 0x3f6a3a, 0x9a7a2a, 0x6a6a6a, 0x5a3a6a];
      for (let r = -4; r <= 4; r++) {
        for (let c = -5; c <= 5; c++) {
          const x = c * 15 + (r % 2) * 4;
          const z = r * 16 - 6;
          if (!b.isClear(x, z, 5) || b.rng() < 0.25) continue;
          b.container(x, z, Math.PI / 2 + (b.rng() < 0.1 ? b.r(-0.3, 0.3) : 0), b.pick(tints), b.rng() < 0.45 ? 2 : b.rng() < 0.2 ? 3 : 1);
          if (b.rng() < 0.3) b.clutter(x, z + 3.5, IND_CLUTTER, 3, 2);
        }
      }
      // warehouses
      for (const x of [-70, 70]) b.building(x, -78, 34, 18, 9, { wall: 'factory_wall', roof: 'corrugated_iron', roofTint: 0x7a7f84, wallTile: 4 });
      for (let x = -90; x <= 90; x += 20) b.lamp(x, 82, 0xffd9a0, b.lights.length < 5 && b.rng() < 0.4);
      b.scatter(['lifebuoy', 'barrel_blue', 'barrel', 'pipes', 'plastic_box', 'tyre'], 40, -95, 60, 95, 84, 0.8);
    },
  },
  forest: {
    id: 'forest',
    name: 'Kara Orman',
    tagline: 'Ay ışığı · Sis',
    desc: 'Sık çam ormanında terk edilmiş kamp. Ağaçların arasından sürüler geliyor.',
    half: 95,
    seed: 5501,
    weather: 'none',
    accent: 0x4ade80,
    modes: ['survival', 'horde', 'rescue', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x040607, fog: 0x080c0c, fogDensity: 0.024, ambient: [0x223030, 0.7], hemi: [0x5a7272, 0x0a0c0a, 0.8], sun: [0xb8ccff, 1.35], sunDir: [-18, 46, 26], rim: [0x7dd3fc, 0.45], exposure: 1.5 }),
    build: (b) => {
      b.ground('forest_ground_04', 5, 'brown_mud', 5, 0.65, 0xa4a092);
      b.anchors.evac.set(70, 0, 70);
      b.anchors.boss.set(-65, 0, -65);
      ringAnchors(b, 50);
      b.clear(0, 0, 10);
      // dirt trails
      b.road(-95, 10, 95, -12, 6, { tex: 'brown_mud', curb: false, lanes: false, tint: 0x9a8a72 });
      b.road(8, -95, -10, 95, 5, { tex: 'brown_mud', curb: false, lanes: false, tint: 0x9a8a72 });
      // cabins
      for (const [x, z] of [[12, 16], [-16, -14], [-60, 30], [55, -40]] as const) {
        b.building(x, z, 8, 7, 3.6, { wall: 'dark_wooden_planks', roof: 'grey_roof_01', wallTile: 1.6, roofTint: 0x6a5a4a, windows: false, rooftop: false }, b.r(-0.4, 0.4));
        b.clutter(x + 5, z, ['crate', 'jerrycan', 'branches'], 2, 1.5);
      }
      b.prop('firepit', 0, 0);
      b.fire(3, -4);
      for (let i = 0; i < 230; i++) {
        const x = b.r(-95, 95);
        const z = b.r(-95, 95);
        if (b.isClear(x, z, 3)) b.tree(x, z, b.r(8, 14));
      }
      b.scatter(['log', 'log2', 'stump', 'rock', 'deadtree'], 60, -95, -95, 95, 95, 2);
      b.scatter(['shrub', 'shrub_low', 'fern', 'fern', 'rock_small', 'branches'], 160, -95, -95, 95, 95, 0.4);
    },
  },
  highway: {
    id: 'highway',
    name: 'Otoyol 9',
    tagline: 'Bulutlu · Toz',
    desc: 'Kaçış yolunda kilitlenen trafik. Yüzlerce terk edilmiş araç ve bir benzin istasyonu.',
    half: 110,
    seed: 6607,
    weather: 'dust',
    accent: 0xfbbf24,
    modes: ['survival', 'horde', 'evac', 'rescue', 'boss', 'endless'],
    lighting: L({ bg: 0x0c0c0b, fog: 0x1a1915, fogDensity: 0.014, ambient: [0x2a2a26, 0.7], hemi: [0x9a9688, 0x1a1814, 0.75], sun: [0xfff1d6, 1.9], sunDir: [30, 46, 20], rim: [0xfcd34d, 0.3], exposure: 1.15 }),
    build: (b) => {
      b.ground('dry_ground_rocks', 7, 'aerial_grass_rock', 9, 0.5, 0xb0a890);
      b.anchors.evac.set(95, 0, 0);
      b.anchors.boss.set(-80, 0, 50);
      b.anchors.core.set(-10, 0, -42);
      ringAnchors(b, 60);
      // highway along x
      b.road(-140, -9, 140, -9, 14, { tex: 'asphalt_02' });
      b.road(-140, 9, 140, 9, 14, { tex: 'asphalt_02' });
      for (let x = -108; x < 108; x += 2.3) b.prop('barrier', x, 0, { rot: b.r(-0.06, 0.06), collide: true });
      // traffic jam
      for (let i = 0; i < 90; i++) {
        const x = b.r(-108, 108);
        const lane = b.pick([-13, -6, 6, 13]);
        if (!b.isClear(x, lane, 2.4)) continue;
        b.prop('car', x, lane + b.r(-1, 1), { rot: Math.PI / 2 + b.r(-0.35, 0.35), tint: b.pick(CAR_TINTS) });
      }
      // gas station
      b.patch('concrete_floor_worn_001', 5, -10, -42, 40, 26);
      b.building(-22, -48, 14, 10, 4.5, { wall: 'concrete_wall_008', roof: 'corrugated_iron', tint: 0xd0cfc8 });
      for (const x of [-4, 6]) b.prop('utilitybox', x, -38, { rot: 0 });
      b.lamp(-4, -36, 0xfff0d0, true, false);
      b.lamp(6, -36, 0xfff0d0, true, false);
      b.road(-10, -24, -10, -30, 8, { tex: 'asphalt_02', lanes: false });
      b.scatter(['tyre', 'trashbag', 'cardboard', 'jerrycan', 'utilitybox'], 70, -108, -30, 108, 30, 0.6);
      b.scatter(['rock', 'shrub', 'deadtree', 'rock_small', 'shrub_low'], 90, -108, -108, 108, 108, 2);
      for (let x = -100; x <= 100; x += 25) b.lamp(x, -19, 0xffc98a, false);
    },
  },
  industrial: {
    id: 'industrial',
    name: 'Sanayi Bölgesi',
    tagline: 'Duman · Turuncu gök',
    desc: 'Patlamış fabrikalar, boru hatları ve yanan variller. Kimyasal sızıntı her yerde.',
    half: 100,
    seed: 7703,
    weather: 'ash',
    accent: 0xfb923c,
    modes: ['survival', 'horde', 'defense', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x0d0704, fog: 0x1c0f06, fogDensity: 0.02, ambient: [0x2a1a10, 0.6], hemi: [0x8a5a3a, 0x120c08, 0.7], sun: [0xff9a50, 1.7], sunDir: [-34, 34, -16], rim: [0xff6a1a, 0.55], exposure: 1.25 }),
    build: (b) => {
      b.ground('concrete_floor_worn_001', 6, 'brown_mud', 6, 0.55, 0xa8a094);
      b.anchors.evac.set(80, 0, 80);
      b.anchors.boss.set(-70, 0, -60);
      ringAnchors(b, 55);
      b.clear(0, 0, 10);
      const lines = gridRoads(b, 50, 12, 'asphalt_02');
      for (let gx = -75; gx <= 75; gx += 50)
        for (let gz = -75; gz <= 75; gz += 50) {
          if (!b.isClear(gx, gz, 14)) continue;
          b.building(gx + b.r(-3, 3), gz + b.r(-3, 3), b.r(24, 32), b.r(18, 28), b.r(8, 14), { wall: 'factory_wall', roof: 'corrugated_iron', wallTile: 4, roofTint: 0x7a6a5a });
          // pipe racks + tanks beside the factory
          for (let k = 0; k < 4; k++) b.prop('pipes', gx + 17, gz - 10 + k * 6, { rot: 0, scale: 1 });
          b.clutter(gx - 17, gz, ['lpg', 'propane', 'barrel_rust', 'rack', 'toolcart'], 6, 4);
        }
      for (let i = 0; i < 10; i++) b.container(b.r(-90, 90), b.r(-90, 90), b.pick([0, Math.PI / 2]), b.pick([0x7a3a24, 0x5a5a5a, 0x3a4a5a]), 1, true);
      streetLife(b, lines, 12, 18, 2);
      b.scatter(IND_CLUTTER, 110, -98, -98, 98, 98, 0.8);
      for (const [x, z] of [[-8, 6], [9, -7], [30, 30], [-30, -30]] as const) b.fire(x, z);
    },
  },
  snow: {
    id: 'snow',
    name: 'Kar Köyü',
    tagline: 'Kar fırtınası',
    desc: 'Dağ köyü karla örtülü. Görüş kısa, zombiler sisin içinden çıkıyor.',
    half: 95,
    seed: 8801,
    weather: 'snow',
    accent: 0xe0f2fe,
    modes: ['survival', 'horde', 'rescue', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x0a0d12, fog: 0x8a96a4, fogDensity: 0.022, ambient: [0x3a4450, 0.75], hemi: [0xb8c8d8, 0x3a4048, 0.8], sun: [0xdce8ff, 1.4], sunDir: [20, 40, 30], rim: [0x9ab8ff, 0.4], exposure: 1.05 }),
    build: (b) => {
      b.ground('snow006', 6, 'asphalt_snow', 6, 0.25, 0xf2f4f8);
      b.anchors.evac.set(-72, 0, 72);
      b.anchors.boss.set(70, 0, -70);
      ringAnchors(b, 50);
      b.clear(0, 0, 10);
      b.road(-120, 0, 120, 0, 8, { tex: 'asphalt_snow', lanes: false });
      b.road(0, -120, 0, 120, 8, { tex: 'asphalt_snow', lanes: false });
      for (let i = 0; i < 22; i++) {
        const x = b.r(-70, 70);
        const z = b.r(-70, 70);
        if (!b.isClear(x, z, 8)) continue;
        b.building(x, z, b.r(8, 12), b.r(7, 10), b.r(3.5, 6), { wall: 'dark_wooden_planks', roof: 'snow006', wallTile: 1.6, roofTile: 4, windows: true, rooftop: false }, b.pick([0, Math.PI / 2]) + b.r(-0.1, 0.1));
        b.clutter(x + 6, z, ['log', 'crate', 'jerrycan'], 2, 1.5);
      }
      for (let i = 0; i < 170; i++) {
        const x = b.r(-95, 95);
        const z = b.r(-95, 95);
        if (b.isClear(x, z, 3) && (Math.abs(x) > 30 || Math.abs(z) > 30 || b.rng() < 0.2)) b.tree(x, z, b.r(7, 12), true);
      }
      b.scatter(['rock', 'stump', 'log2', 'barrel_rust'], 40, -95, -95, 95, 95, 2);
      for (const [x, z] of [[6, 6], [-6, -6], [20, -18]] as const) b.fire(x, z);
    },
  },
  desert: {
    id: 'desert',
    name: 'Çöl Kasabası',
    tagline: 'Yakıcı güneş · Kum',
    desc: 'Kerpiç evler, kumla kaplı yollar ve kavrulmuş araç enkazları.',
    half: 105,
    seed: 9907,
    weather: 'dust',
    accent: 0xfacc15,
    modes: ['survival', 'horde', 'defense', 'rescue', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x15100a, fog: 0x3a2c1c, fogDensity: 0.011, ambient: [0x4a3a28, 0.7], hemi: [0xffe0b0, 0x3a2a18, 0.8], sun: [0xffe2b0, 2.6], sunDir: [26, 50, -12], rim: [0xffb060, 0.3], exposure: 1.05 }),
    build: (b) => {
      b.ground('coast_sand_01', 7, 'dry_ground_rocks', 7, 0.7, 0xd8c4a0);
      b.anchors.evac.set(85, 0, -85);
      b.anchors.boss.set(-75, 0, 70);
      ringAnchors(b, 55);
      b.clear(0, 0, 10);
      b.road(-130, 6, 130, -6, 10, { tex: 'road_damaged', tint: 0xc8b89a });
      b.road(-6, -130, 6, 130, 9, { tex: 'road_damaged', tint: 0xc8b89a, lanes: false });
      for (let i = 0; i < 34; i++) {
        const x = b.r(-80, 80);
        const z = b.r(-80, 80);
        if (!b.isClear(x, z, 8)) continue;
        b.building(x, z, b.r(7, 13), b.r(7, 12), b.r(3.2, 6.5), { wall: 'damaged_plaster', roof: 'clay_roof_tiles', wallTile: 3, tint: 0xd8c2a0, roofTint: 0xc8a890 }, b.pick([0, Math.PI / 2]));
        b.clutter(x, z + 6, ['barrel_rust', 'tyre', 'cardboard', 'jerrycan'], 2, 2);
      }
      for (let i = 0; i < 22; i++) b.prop('car', b.r(-100, 100), b.r(-100, 100), { tint: b.pick([0x6a4a30, 0x3a2a20, 0x8a7a60, 0x2a2420]) });
      b.scatter(['rock', 'rock', 'deadtree', 'shrub_low', 'branches', 'tyre'], 120, -104, -104, 104, 104, 1.5);
      for (const [x, z] of [[-9, 4], [9, -4]] as const) b.fire(x, z);
    },
  },
  lab: {
    id: 'lab',
    name: 'Yeraltı Laboratuvarı',
    tagline: 'Acil durum ışıkları',
    desc: 'Virüsün üretildiği tesis. Koridorlar, laboratuvarlar ve kırmızı alarm ışıkları.',
    half: 80,
    seed: 1013,
    weather: 'none',
    accent: 0xef4444,
    modes: ['survival', 'horde', 'defense', 'rescue', 'boss', 'endless'],
    lighting: L({ bg: 0x050404, fog: 0x0c0808, fogDensity: 0.022, ambient: [0x302830, 0.8], hemi: [0x908890, 0x141010, 0.85], sun: [0xf0e8ff, 1.2], sunDir: [10, 50, 6], rim: [0xef4444, 0.45], exposure: 1.4 }),
    build: (b) => {
      b.ground('dirty_tiles', 2.5, 'concrete_floor_worn_001', 4, 0.5, 0xd0d4d8);
      b.anchors.evac.set(-66, 0, -66);
      b.anchors.boss.set(64, 0, 64);
      ringAnchors(b, 44);
      b.clear(0, 0, 13);
      // outer walls
      b.wall(-80, -80, 80, -80, 4, 'metal_plate', 0.8, 0x9aa0a6);
      b.wall(-80, 80, 80, 80, 4, 'metal_plate', 0.8, 0x9aa0a6);
      b.wall(-80, -80, -80, 80, 4, 'metal_plate', 0.8, 0x9aa0a6);
      b.wall(80, -80, 80, 80, 4, 'metal_plate', 0.8, 0x9aa0a6);
      // room grid with doorways
      for (let gx = -60; gx <= 60; gx += 30) {
        for (let gz = -60; gz <= 60; gz += 30) {
          if (!b.isClear(gx, gz, 10)) continue;
          const hw = 11;
          const door = 3.2;
          const tex = b.rng() < 0.5 ? 'concrete_wall_008' : 'metal_plate';
          b.wall(gx - hw, gz - hw, gx - door, gz - hw, 3.6, tex, 0.35, 0xb8bcc0);
          b.wall(gx + door, gz - hw, gx + hw, gz - hw, 3.6, tex, 0.35, 0xb8bcc0);
          b.wall(gx - hw, gz + hw, gx + hw, gz + hw, 3.6, tex, 0.35, 0xb8bcc0);
          b.wall(gx - hw, gz - hw, gx - hw, gz - door, 3.6, tex, 0.35, 0xb8bcc0);
          b.wall(gx - hw, gz + door, gx - hw, gz + hw, 3.6, tex, 0.35, 0xb8bcc0);
          b.scatter(['desk', 'cabinet', 'chemistry', 'bed', 'shelves', 'medbox', 'toolchest', 'wetsign'], 7, gx - hw + 2, gz - hw + 2, gx + hw - 2, gz + hw - 2, 1);
          b.lamp(gx, gz, b.rng() < 0.5 ? 0xff3030 : 0xe8f0ff, b.lights.length < 5 && b.rng() < 0.5, false);
        }
      }
      b.scatter(['cardboard', 'plastic_crate', 'wetsign', 'trashbag', 'medbox'], 60, -78, -78, 78, 78, 0.6);
    },
  },

  village: {
    id: 'village',
    name: 'Terk Edilmiş Köy',
    tagline: 'İkindi · Toz',
    desc: 'Dağ eteğinde bir Anadolu köyü: taş duvarlı avlular, kerpiç evler, meyve bahçeleri ve köy meydanındaki çeşme.',
    half: 95,
    seed: 1409,
    weather: 'dust',
    accent: 0xe8a35a,
    modes: ['survival', 'horde', 'defense', 'rescue', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x0f0b07, fog: 0x231a10, fogDensity: 0.013, ambient: [0x30281e, 0.65], hemi: [0xb09a78, 0x18120c, 0.8], sun: [0xffd09a, 1.85], sunDir: [-36, 30, 22], rim: [0xffa65a, 0.4], exposure: 1.2 }),
    build: (b) => {
      b.ground('brown_mud', 6, 'aerial_grass_rock', 7, 0.65, 0xb8a888);
      b.anchors.evac.set(76, 0, 70);
      b.anchors.boss.set(-66, 0, -64);
      ringAnchors(b, 50);
      b.clear(0, 0, 12);
      // village square with the fountain (generator core) and plane trees
      b.patch('cracked_concrete', 3, 0, 0, 26, 26, 0, 0xc8b8a0);
      for (const [x, z] of [[-17, -16], [17, -16], [-24, 4], [24, 4]] as const) b.tree(x, z, b.r(8, 10));
      // dirt lanes
      b.road(-120, 0, 120, 0, 7, { tex: 'dry_ground_rocks', curb: false, lanes: false, tint: 0xd8c8a8 });
      b.road(0, -120, 0, 120, 7, { tex: 'dry_ground_rocks', curb: false, lanes: false, tint: 0xd8c8a8 });
      b.road(-90, -50, 90, -50, 5, { tex: 'dry_ground_rocks', curb: false, lanes: false, tint: 0xd0c0a0 });
      b.road(-90, 48, 90, 48, 5, { tex: 'dry_ground_rocks', curb: false, lanes: false, tint: 0xd0c0a0 });
      for (let t = -100; t <= 100; t += 5) {
        b.clear(t, 0, 5);
        b.clear(0, t, 5);
        b.clear(t, -50, 4);
        b.clear(t, 48, 4);
      }
      // houses in walled yards
      const house = { wall: 'damaged_plaster' as const, roof: 'clay_roof_tiles' as const, wallTile: 2.5, tint: 0xe2d2b6, roofTint: 0xb87a5a, rooftop: false };
      const adobe = { wall: 'damaged_plaster' as const, roof: 'grey_roof_01' as const, wallTile: 2.5, tint: 0xc9a77e, roofTint: 0x8a7462, rooftop: false };
      for (let i = 0; i < 40; i++) {
        const x = b.r(-82, 82);
        const z = b.r(-82, 82);
        if (!b.isClear(x, z, 9)) continue;
        const w = b.r(7, 11);
        const d = b.r(6, 9);
        const rot = b.pick([0, Math.PI / 2]) + b.r(-0.08, 0.08);
        b.building(x, z, w, d, b.r(3.4, 6.2), b.rng() < 0.6 ? house : adobe, rot);
        // low stone yard wall on one or two sides
        const yard = 3.5;
        if (b.rng() < 0.7) b.wall(x - w / 2 - yard, z + d / 2 + yard, x + w / 2 + yard, z + d / 2 + yard, 1.2, 'concrete_wall_008', 0.45, 0xa89a84);
        if (b.rng() < 0.5) b.wall(x - w / 2 - yard, z - d / 2, x - w / 2 - yard, z + d / 2 + yard, 1.2, 'concrete_wall_008', 0.45, 0xa89a84);
        b.clutter(x + w / 2 + 2, z, ['crate', 'jerrycan', 'tyre', 'barrel_rust', 'log2'], 3, 1.6);
      }
      // orchards
      for (const [ox, oz] of [[-60, 70], [62, -70], [-74, -12], [70, 18]] as const) {
        for (let i = 0; i < 4; i++)
          for (let k = 0; k < 4; k++) {
            const x = ox + i * 6 + b.r(-0.8, 0.8);
            const z = oz + k * 6 + b.r(-0.8, 0.8);
            if (b.isClear(x, z, 2.5)) b.tree(x, z, b.r(6, 8));
          }
      }
      // threshing floor + hay
      b.patch('dry_ground_rocks', 4, 40, -28, 16, 16, 0, 0xd8c08a);
      b.scatter(['crate_long', 'crate', 'log', 'log2'], 10, 32, -36, 48, -20, 1.5);
      for (let i = 0; i < 9; i++) b.prop('car', b.r(-90, 90), b.r(-90, 90), { rot: b.r(0, 6.28), tint: b.pick([0xc8c0b0, 0x6a3a2a, 0x3a4a5a, 0x8a8a6a]) });
      b.scatter(['shrub', 'shrub_low', 'rock', 'rock_small', 'branches', 'stump'], 140, -92, -92, 92, 92, 1);
      for (const [x, z] of [[-6, 0], [6, 0], [0, 40], [0, -40]] as const) b.lamp(x, z, 0xffd6a0, b.lights.length < 3);
      b.fire(-30, 18);
    },
  },
  mall: {
    id: 'mall',
    name: 'Alışveriş Merkezi',
    tagline: 'Gece · Neon',
    desc: 'Son sığınak olacaktı: dev AVM, katlı otopark, yükleme rampaları ve barikatlı girişler.',
    half: 100,
    seed: 1511,
    weather: 'none',
    accent: 0xe879f9,
    modes: ['survival', 'horde', 'defense', 'rescue', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x07060a, fog: 0x0e0c14, fogDensity: 0.016, ambient: [0x2a2834, 0.75], hemi: [0x8a86a0, 0x12101a, 0.85], sun: [0xe8e2ff, 1.45], sunDir: [24, 44, -18], rim: [0xe879f9, 0.5], exposure: 1.4 }),
    build: (b) => {
      b.ground('asphalt_02', 6, 'cracked_concrete', 5, 0.45, 0xa8a8b0);
      b.anchors.core.set(0, 0, 24);
      b.anchors.spawn.set(0, 0, 30);
      b.anchors.evac.set(-82, 0, 82);
      b.anchors.boss.set(70, 0, -78);
      ringAnchors(b, 58);
      b.clear(0, 24, 11);
      // the mall: two big halls joined by a glass atrium, entrance plaza to the south
      const hall = { wall: 'concrete_wall_008' as const, roof: 'metal_plate' as const, wallTile: 4, tint: 0xd8d4dc, roofTint: 0x7a7a82 };
      b.building(-30, -26, 42, 34, 14, hall);
      b.building(32, -26, 40, 34, 12, { ...hall, tint: 0xc8c4d0 });
      b.building(0, -34, 20, 18, 17, { wall: 'metal_plate', roof: 'metal_plate', wallTile: 2, tint: 0x8aa0b8, roofTint: 0x5a6a7a });
      b.patch('floor_tiles_06', 4, 0, 14, 62, 20, 0, 0xa8a4a0);
      // barricaded entrance
      b.sandbags(-14, 6, -4, 6);
      b.sandbags(4, 6, 14, 6);
      for (let x = -24; x <= 24; x += 2.4) if (Math.abs(x) > 15) b.prop('barrier', x, 6.5);
      b.clutter(-8, 10, ['plastic_crate', 'cardboard', 'shelves', 'trashcan'], 5, 2.5);
      // parking lot in rows
      b.patch('asphalt_02', 6, 0, 62, 170, 44, 0, 0x8a8a92);
      for (let row = 0; row < 4; row++)
        for (let i = 0; i < 18; i++) {
          if (b.rng() < 0.35) continue;
          const x = -76 + i * 9;
          const z = 46 + row * 11;
          if (b.isClear(x, z, 2.2)) b.prop('car', x, z, { rot: (row % 2 ? Math.PI : 0) + b.r(-0.2, 0.2), tint: b.pick(CAR_TINTS) });
        }
      // loading docks + trucks' containers on the north side
      for (let i = 0; i < 6; i++) b.container(-50 + i * 20, -62, 0, b.pick([0x8a3a2a, 0x2a4a6a, 0x5a5a5a, 0xc8b04a]), 1, b.rng() < 0.3);
      b.scatter(IND_CLUTTER, 26, -80, -78, 80, -50, 1);
      // ring road and side buildings
      b.road(-120, 92, 120, 92, 12, { tex: 'road_damaged' });
      b.road(92, -120, 92, 120, 11, { tex: 'road_damaged' });
      b.road(-92, -120, -92, 120, 11, { tex: 'road_damaged' });
      for (const z of [-78, -30, 18]) {
        b.building(-74, z, 18, 22, b.r(6, 10), { wall: 'brick_wall_10', roof: 'grey_roof_01', tint: 0xb8a8a0 });
        b.building(74, z, 18, 22, b.r(6, 10), { wall: 'concrete_wall_008', roof: 'grey_roof_01', tint: 0xb0b8c0 });
      }
      for (let x = -80; x <= 80; x += 20) b.lamp(x, 40, 0xf0d0ff, b.lights.length < 4 && b.rng() < 0.4);
      for (let x = -70; x <= 70; x += 28) b.lamp(x, 84, 0xffc98a, false);
      b.scatter(['trashcan', 'bench', 'hydrant', 'utilitybox'], 26, -90, -10, 90, 90, 2);
      b.scatter(URBAN_CLUTTER, 80, -96, -96, 96, 96, 0.6);
    },
  },
  airport: {
    id: 'airport',
    name: 'Kapalı Havalimanı',
    tagline: 'Şafak · Sis',
    desc: 'Son uçuşlar hiç kalkmadı. Pist, hangarlar, terminal ve yakıt deposu arasında açık arazi.',
    half: 120,
    seed: 1613,
    weather: 'none',
    accent: 0x7dd3fc,
    modes: ['survival', 'horde', 'defense', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x0a0c10, fog: 0x161c24, fogDensity: 0.011, ambient: [0x262c34, 0.7], hemi: [0x8a9aae, 0x12161c, 0.85], sun: [0xffe2c4, 1.7], sunDir: [44, 26, 30], rim: [0x7dd3fc, 0.4], exposure: 1.2 }),
    build: (b) => {
      b.ground('aerial_grass_rock', 9, 'dry_ground_rocks', 7, 0.55, 0xa0a890);
      b.anchors.core.set(0, 0, -30);
      b.anchors.spawn.set(0, 0, -24);
      b.anchors.evac.set(96, 0, 40);
      b.anchors.boss.set(-90, 0, 40);
      ringAnchors(b, 62);
      b.clear(0, -30, 11);
      // runway + taxiway
      b.road(-170, 40, 170, 40, 26, { tex: 'asphalt_02', curb: false, tint: 0x9a9aa0 });
      b.road(-170, 8, 170, 8, 10, { tex: 'asphalt_02', curb: false, lanes: false, tint: 0x8a8a90 });
      for (const x of [-60, 0, 60]) b.road(x, 8, x, 40, 9, { tex: 'asphalt_02', curb: false, lanes: false, tint: 0x8a8a90 });
      // apron + terminal
      b.patch('cracked_concrete', 4, 0, -20, 150, 30, 0, 0xd0d0d0);
      b.building(0, -58, 90, 26, 12, { wall: 'metal_plate', roof: 'metal_plate', wallTile: 3, tint: 0xb8c8d8, roofTint: 0x6a7a8a });
      b.building(0, -76, 30, 10, 22, { wall: 'concrete_wall_008', roof: 'metal_plate', tint: 0xd0d0d0 }); // tower base
      // hangars
      for (const x of [-95, -65, 70, 100]) b.building(x, -24, 24, 26, 11, { wall: 'corrugated_iron', roof: 'corrugated_iron', wallTile: 3, roofTile: 3, tint: 0x8a9488, roofTint: 0x6a7068, windows: false });
      // fuel farm
      for (let i = 0; i < 6; i++) b.prop('lpg', -40 + (i % 3) * 6, -86 + Math.floor(i / 3) * 6, { scale: 2.4 });
      b.fence(-52, -96, -16, -96);
      b.fence(-52, -96, -52, -74);
      // abandoned ground vehicles, baggage, barriers on the apron
      for (let i = 0; i < 16; i++) b.prop('car', b.r(-100, 100), b.r(-34, -6), { rot: b.r(0, 6.28), tint: b.pick([0xe8e8e0, 0xf0c040, 0x3a4a5a]) });
      b.scatter(['plastic_box', 'cardboard', 'crate', 'barrier', 'toolcart', 'generator'], 50, -110, -40, 110, 0, 1.4);
      for (let x = -150; x < 150; x += 30) b.prop('barrier', x + b.r(-8, 8), 40 + b.r(-9, 9), { rot: b.r(0, 6.28) });
      // perimeter fences and grass
      b.fence(-118, 64, 118, 64);
      b.fence(-118, -110, 118, -110);
      b.scatter(['shrub', 'shrub_low', 'rock_small', 'branches'], 160, -118, 56, 118, 118, 0.8);
      b.scatter(['shrub_low', 'rock', 'stump'], 50, -118, -108, 118, -70, 1.2);
      for (let x = -100; x <= 100; x += 25) b.lamp(x, -2, 0xfff1d6, b.lights.length < 4 && b.rng() < 0.4);
      for (const [x, z] of [[-30, 40], [44, 36]] as const) b.fire(x, z);
    },
  },
  campus: {
    id: 'campus',
    name: 'Üniversite Kampüsü',
    tagline: 'Sonbahar · Yağmur',
    desc: 'Final haftası hiç bitmedi. Fakülte binaları, yurtlar, ağaçlı yürüyüş yolları ve merkez kütüphane.',
    half: 100,
    seed: 1717,
    weather: 'rain',
    accent: 0xfb923c,
    modes: ['survival', 'horde', 'defense', 'rescue', 'evac', 'boss', 'endless'],
    lighting: L({ bg: 0x080807, fog: 0x12110d, fogDensity: 0.018, ambient: [0x2a2620, 0.6], hemi: [0x8a7e68, 0x14110c, 0.8], sun: [0xffe0b8, 1.4], sunDir: [-28, 40, -20], rim: [0xfb923c, 0.4], exposure: 1.25 }),
    build: (b) => {
      b.ground('forest_leaves_02', 6, 'aerial_grass_rock', 8, 0.55, 0xa89878);
      b.anchors.evac.set(-80, 0, -80);
      b.anchors.boss.set(76, 0, 74);
      ringAnchors(b, 54);
      b.clear(0, 0, 12);
      // central quad: paved cross paths
      b.patch('cracked_concrete', 3, 0, 0, 30, 30, 0, 0xc8c0b4);
      b.road(-110, 0, 110, 0, 6, { tex: 'cracked_concrete', curb: false, lanes: false, tint: 0xc8c0b4 });
      b.road(0, -110, 0, 110, 6, { tex: 'cracked_concrete', curb: false, lanes: false, tint: 0xc8c0b4 });
      b.road(-110, 70, 110, 70, 10, { tex: 'road_damaged' });
      // faculties around the quad
      const fac = { wall: 'brick_wall_10' as const, roof: 'grey_roof_01' as const, wallTile: 3, tint: 0xc09a84 };
      const modern = { wall: 'concrete_wall_008' as const, roof: 'concrete_floor_worn_001' as const, tint: 0xd8d8d0 };
      b.building(0, -40, 46, 18, 15, modern); // library
      b.building(-40, -6, 18, 36, 11, fac);
      b.building(40, -6, 18, 36, 11, fac);
      b.building(-40, 36, 30, 14, 9, { ...fac, tint: 0xa88a74 });
      b.building(40, 36, 30, 14, 9, modern);
      // dorm blocks
      for (let i = 0; i < 4; i++) {
        b.building(-80 + i * 18, -78, 12, 22, b.r(14, 18), { wall: 'concrete_wall_008', roof: 'grey_roof_01', tint: 0xc8c0b0 });
        b.building(26 + i * 18, -78, 12, 22, b.r(14, 18), { wall: 'concrete_wall_008', roof: 'grey_roof_01', tint: 0xb8b8c0 });
      }
      // tree-lined paths
      for (let t = -100; t <= 100; t += 10) {
        for (const off of [-5.5, 5.5]) {
          if (b.isClear(t, off, 2.5) && Math.abs(t) > 18) b.tree(t, off, b.r(8, 11));
          if (b.isClear(off, t, 2.5) && Math.abs(t) > 18) b.tree(off, t, b.r(8, 11));
        }
      }
      for (let i = 0; i < 60; i++) {
        const x = b.r(-95, 95);
        const z = b.r(-95, 95);
        if (b.isClear(x, z, 4)) b.tree(x, z, b.r(7, 12));
      }
      // parked cars along the road, student clutter
      for (let x = -96; x < 96; x += 7) if (b.rng() < 0.45) b.prop('car', x, 78, { rot: Math.PI / 2 + b.r(-0.1, 0.1), tint: b.pick(CAR_TINTS) });
      b.scatter(['bench', 'picnic', 'trashcan', 'bench'], 36, -60, -60, 60, 60, 2);
      b.scatter(['cardboard', 'trashbag', 'plastic_crate', 'desk', 'shelves'], 50, -96, -96, 96, 96, 0.8);
      b.scatter(['shrub', 'shrub_low', 'fern', 'branches'], 110, -96, -96, 96, 96, 0.5);
      for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14], [0, 60]] as const) b.lamp(x, z, 0xffe6c0, b.lights.length < 4);
    },
  },
};

export const MAP_ORDER: MapId[] = ['city', 'hospital', 'military', 'harbor', 'forest', 'highway', 'industrial', 'snow', 'desert', 'lab', 'village', 'mall', 'airport', 'campus'];

for (const id of MAP_ORDER) MAPS[id].modes.push(...UNIVERSAL_MODES);
