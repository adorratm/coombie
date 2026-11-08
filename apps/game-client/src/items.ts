import * as THREE from 'three';

export type ItemId =
  | 'medkit'
  | 'shield_cell'
  | 'rage_stim'
  | 'scrap'
  | 'magnet_chip'
  | 'xp_battery'
  | 'armor_plate';

export type ItemRarity = 'common' | 'rare' | 'epic';

export interface ItemDef {
  id: ItemId;
  name: string;
  description: string;
  rarity: ItemRarity;
  color: number;
  stackMax: number;
  /** Instant use on pickup if true */
  autoUse?: boolean;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  medkit: {
    id: 'medkit',
    name: 'İlk Yardım Çantası',
    description: '35 can yeniler · envantere girer, [Z] ile kullan',
    rarity: 'common',
    color: 0xc8c8c0,
    stackMax: 5,
  },
  shield_cell: {
    id: 'shield_cell',
    name: 'Kalkan Bataryası',
    description: '+40 kalkan · envantere girer, [X] ile kullan',
    rarity: 'common',
    color: 0x5a6a4a,
    stackMax: 5,
  },
  rage_stim: {
    id: 'rage_stim',
    name: 'Adrenalin İğnesi',
    description: 'Kısa süre öfke modu · envantere girer, [C] ile kullan',
    rarity: 'rare',
    color: 0xd08a2a,
    stackMax: 3,
  },
  scrap: {
    id: 'scrap',
    name: 'Hurda Parça',
    description: 'Yetenek ağacı için malzeme · envantere girer',
    rarity: 'common',
    color: 0x8a8a86,
    stackMax: 99,
  },
  magnet_chip: {
    id: 'magnet_chip',
    name: 'Sinyal Vericisi',
    description: '30 sn boyunca toplama menzili +2 m',
    rarity: 'rare',
    color: 0x4a5a3a,
    stackMax: 3,
  },
  xp_battery: {
    id: 'xp_battery',
    name: 'İstihbarat Dosyası',
    description: 'Anında +25 tecrübe',
    rarity: 'rare',
    color: 0xc8a868,
    stackMax: 10,
    autoUse: true,
  },
  armor_plate: {
    id: 'armor_plate',
    name: 'Balistik Plaka',
    description: 'Kalıcı +8 zırh (bu koşu için)',
    rarity: 'epic',
    color: 0x4e5442,
    stackMax: 3,
  },
};

export interface WorldItem {
  id: string;
  defId: ItemId;
  mesh: THREE.Object3D;
  life: number;
  bob: number;
}

let itemSeq = 0;

// ---------------------------------------------------------------------------
// Realistic pickup models (shared geometry/materials — nothing to dispose)
// ---------------------------------------------------------------------------
const std = (color: number, roughness = 0.7, metalness = 0.05) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const M = {
  white: std(0xd8d6cc, 0.6),
  red: std(0xa61b1b, 0.55),
  olive: std(0x4a5236, 0.85),
  darkOlive: std(0x343a28, 0.85),
  steel: std(0x9a9c9e, 0.35, 0.8),
  rust: std(0x6e5640, 0.8, 0.4),
  black: std(0x1c1d1f, 0.6, 0.2),
  orange: std(0xd0761e, 0.5),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fb0a8, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.55 }),
  manila: std(0xc4a46a, 0.9),
  paper: std(0xe6e0d0, 0.9),
  ledGreen: new THREE.MeshBasicMaterial({ color: 0x3cff6a }),
  ledBlue: new THREE.MeshBasicMaterial({ color: 0x5ab8ff }),
  ledRed: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
  marker: new THREE.MeshBasicMaterial({ color: 0xe8d8a0, transparent: true, opacity: 0.22, depthWrite: false }),
  // infected tissue sample: faintly luminous so it reads at night
  sample: new THREE.MeshStandardMaterial({ color: 0x9adf3a, emissive: 0x6fbf1e, emissiveIntensity: 1.1, roughness: 0.3 }),
  sampleMarker: new THREE.MeshBasicMaterial({ color: 0xb8f060, transparent: true, opacity: 0.4, depthWrite: false }),
};
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  ring: new THREE.RingGeometry(0.42, 0.5, 32),
};

function part(geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, rx = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  m.castShadow = true;
  return m;
}

/** Faint ground ring so loot reads against busy terrain. */
function groundMarker(r: number, mat: THREE.Material = M.marker): THREE.Mesh {
  const m = new THREE.Mesh(G.ring, mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(r);
  m.position.y = -0.27;
  m.name = 'marker';
  return m;
}

export function buildItemModel(defId: ItemId): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  switch (defId) {
    case 'medkit': // white first-aid case with red cross
      body.add(
        part(G.box, M.white, 0.5, 0.2, 0.36),
        part(G.box, M.red, 0.26, 0.012, 0.08, 0, 0.106, 0),
        part(G.box, M.red, 0.08, 0.012, 0.26, 0, 0.106, 0),
        part(G.box, M.black, 0.16, 0.03, 0.03, 0, 0.12, -0.2),
      );
      break;
    case 'shield_cell': // olive military battery pack, blue charge LED
      body.add(part(G.box, M.olive, 0.3, 0.32, 0.22), part(G.box, M.black, 0.08, 0.05, 0.06, -0.07, 0.18, 0), part(G.box, M.black, 0.08, 0.05, 0.06, 0.07, 0.18, 0), part(G.box, M.ledBlue, 0.04, 0.04, 0.01, 0, 0.06, 0.112));
      break;
    case 'rage_stim': // auto-injector
      body.add(part(G.cyl, M.orange, 0.06, 0.34, 0.06, 0, 0, 0, 0, Math.PI / 2), part(G.cyl, M.black, 0.065, 0.06, 0.065, 0.19, 0, 0, 0, Math.PI / 2), part(G.cyl, M.glass, 0.04, 0.1, 0.04, -0.2, 0, 0, 0, Math.PI / 2));
      break;
    case 'scrap': // bent plate + pipe + bolts
      body.add(
        part(G.box, M.rust, 0.34, 0.03, 0.22, 0, 0, 0, 0.2, 0.15),
        part(G.cyl, M.steel, 0.05, 0.3, 0.05, 0.05, 0.06, 0.05, 0, 1.2),
        part(G.box, M.steel, 0.06, 0.06, 0.06, -0.1, 0.06, -0.05),
        part(G.box, M.steel, 0.05, 0.05, 0.05, 0.12, 0.04, -0.08, 0.5, 0.3),
      );
      break;
    case 'magnet_chip': // field radio beacon with antenna
      body.add(part(G.box, M.darkOlive, 0.2, 0.28, 0.12), part(G.cyl, M.black, 0.012, 0.36, 0.012, 0.06, 0.3, 0), part(G.box, M.ledRed, 0.03, 0.03, 0.01, -0.05, 0.1, 0.062), part(G.box, M.black, 0.12, 0.06, 0.01, 0, -0.03, 0.062));
      break;
    case 'xp_battery': // manila intel folder with papers
      body.add(part(G.box, M.manila, 0.36, 0.03, 0.27), part(G.box, M.paper, 0.32, 0.02, 0.25, 0.02, 0.025, 0.01, 0, 0.05), part(G.box, M.red, 0.1, 0.005, 0.04, -0.08, 0.04, -0.08));
      break;
    case 'armor_plate': // curved ballistic plate
      body.add(part(G.box, M.darkOlive, 0.32, 0.05, 0.4, 0, 0, 0, 0, 0), part(G.box, M.black, 0.3, 0.02, 0.06, 0, 0.035, 0.12));
      body.rotation.x = -0.25;
      break;
  }
  body.scale.multiplyScalar(1.7);
  g.add(groundMarker(defId === 'armor_plate' || defId === 'medkit' ? 1.0 : 0.85));
  return g;
}

/** XP drop: a zombie tissue sample vial (bigger value → a sealed sample case). */
const sampleCache = new Map<number, THREE.Group>();
export function buildSampleModel(value: number): THREE.Group {
  const tier = value >= 12 ? 2 : value >= 5 ? 1 : 0;
  let proto = sampleCache.get(tier);
  if (!proto) {
    proto = new THREE.Group();
    if (tier === 2) {
      // aluminium sample case
      proto.add(part(G.box, M.steel, 0.42, 0.16, 0.3), part(G.box, M.black, 0.14, 0.03, 0.03, 0, 0.09, -0.16), part(G.box, M.ledGreen, 0.03, 0.02, 0.01, 0.15, 0.03, 0.152));
    } else {
      const n = tier === 1 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.09;
        proto.add(part(G.cyl, M.glass, 0.06, 0.2, 0.06, x, 0, 0), part(G.cyl, M.sample, 0.05, 0.13, 0.05, x, -0.03, 0), part(G.cyl, M.red, 0.065, 0.04, 0.065, x, 0.11, 0));
      }
      if (n > 1) proto.add(part(G.box, M.black, 0.32, 0.05, 0.1, 0, -0.1, 0));
    }
    // game-readable size from the top-down camera
    const S = tier === 2 ? 2.2 : 2.8;
    proto.scale.setScalar(S);
    const mk = groundMarker(tier === 2 ? 0.42 : 0.3, M.sampleMarker);
    mk.position.y = -0.27 / S;
    proto.add(mk);
    sampleCache.set(tier, proto);
  }
  return proto.clone();
}

export function createWorldItem(defId: ItemId, pos: THREE.Vector3): WorldItem {
  const mesh = buildItemModel(defId);
  mesh.position.copy(pos);
  mesh.position.y = 0.4;
  return {
    id: `item-${itemSeq++}`,
    defId,
    mesh,
    life: 45,
    bob: Math.random() * Math.PI * 2,
  };
}

export function rollItemDrop(
  killKind: import('./zombieKinds').ZombieKind,
): ItemId | null {
  const roll = Math.random();
  if (killKind === 'boss') {
    if (roll < 0.35) return 'armor_plate';
    if (roll < 0.6) return 'rage_stim';
    if (roll < 0.85) return 'shield_cell';
    return 'scrap';
  }
  if (killKind === 'tank') {
    if (roll < 0.22) return 'armor_plate';
    if (roll < 0.4) return 'shield_cell';
    if (roll < 0.65) return 'scrap';
    return null;
  }
  if (killKind === 'screamer') {
    if (roll < 0.25) return 'magnet_chip';
    if (roll < 0.45) return 'xp_battery';
    if (roll < 0.7) return 'scrap';
    return null;
  }
  if (killKind === 'acid') {
    if (roll < 0.2) return 'magnet_chip';
    if (roll < 0.4) return 'medkit';
    if (roll < 0.7) return 'scrap';
    return null;
  }
  if (killKind === 'runner') {
    if (roll < 0.1) return 'xp_battery';
    if (roll < 0.18) return 'medkit';
    if (roll < 0.38) return 'scrap';
    return null;
  }
  if (roll < 0.08) return 'medkit';
  if (roll < 0.14) return 'shield_cell';
  if (roll < 0.22) return 'xp_battery';
  if (roll < 0.4) return 'scrap';
  return null;
}

export function updateWorldItem(item: WorldItem, dt: number): void {
  // dropped items never expire (nothing collected may be lost); `life` is kept for save/HUD compat
  item.bob += dt * 3;
  // lies on the ground with a slow turn; marker ring stays flat at ground level
  item.mesh.position.y = 0.3 + Math.sin(item.bob) * 0.03;
  item.mesh.rotation.y += dt * 0.8;
}
