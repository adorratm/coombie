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
    name: 'Medkit',
    description: 'Restore 35 HP',
    rarity: 'common',
    color: 0x22c55e,
    stackMax: 5,
  },
  shield_cell: {
    id: 'shield_cell',
    name: 'Shield Cell',
    description: '+40 shield',
    rarity: 'common',
    color: 0x38bdf8,
    stackMax: 5,
  },
  rage_stim: {
    id: 'rage_stim',
    name: 'Rage Stim',
    description: 'Trigger short Rage',
    rarity: 'rare',
    color: 0xef4444,
    stackMax: 3,
  },
  scrap: {
    id: 'scrap',
    name: 'Scrap',
    description: 'Crafting / skill currency',
    rarity: 'common',
    color: 0xd6d3d1,
    stackMax: 99,
  },
  magnet_chip: {
    id: 'magnet_chip',
    name: 'Magnet Chip',
    description: '+2m pickup radius (30s)',
    rarity: 'rare',
    color: 0xa855f7,
    stackMax: 3,
  },
  xp_battery: {
    id: 'xp_battery',
    name: 'XP Battery',
    description: '+25 XP',
    rarity: 'rare',
    color: 0xfbbf24,
    stackMax: 10,
    autoUse: true,
  },
  armor_plate: {
    id: 'armor_plate',
    name: 'Armor Plate',
    description: '+8 permanent armor',
    rarity: 'epic',
    color: 0x94a3b8,
    stackMax: 3,
  },
};

export interface WorldItem {
  id: string;
  defId: ItemId;
  mesh: THREE.Mesh;
  life: number;
  bob: number;
}

let itemSeq = 0;

export function createWorldItem(defId: ItemId, pos: THREE.Vector3): WorldItem {
  const def = ITEM_DEFS[defId];
  const geo =
    defId === 'scrap'
      ? new THREE.OctahedronGeometry(0.22, 0)
      : defId === 'xp_battery'
        ? new THREE.BoxGeometry(0.28, 0.28, 0.28)
        : new THREE.SphereGeometry(0.22, 10, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    emissive: def.color,
    emissiveIntensity: 0.55,
    metalness: 0.35,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.position.y = 0.45;
  mesh.castShadow = true;
  return {
    id: `item-${itemSeq++}`,
    defId,
    mesh,
    life: 45,
    bob: Math.random() * Math.PI * 2,
  };
}

export function rollItemDrop(
  killKind: 'grunt' | 'runner' | 'tank' | 'acid' | 'boss' | 'screamer',
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
  item.life -= dt;
  item.bob += dt * 3;
  item.mesh.position.y = 0.4 + Math.sin(item.bob) * 0.12;
  item.mesh.rotation.y += dt * 2.2;
}
