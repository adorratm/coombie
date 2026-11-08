import type { PlayerMods } from './progression';

export type SkillId =
  | 'speed_1'
  | 'speed_2'
  | 'shield_1'
  | 'shield_2'
  | 'magnet_1'
  | 'magnet_2'
  | 'rage_1'
  | 'rage_2'
  | 'xp_gain'
  | 'armor_mastery'
  | 'lifesteal_1'
  | 'crit_focus';

export interface SkillNodeDef {
  id: SkillId;
  name: string;
  description: string;
  maxRank: number;
  costPerRank: number;
  requires?: SkillId[];
  column: number;
  row: number;
  /** Passive mods applied per rank */
  modsPerRank?: Partial<PlayerMods>;
  /** Special flags */
  flagsPerRank?: Partial<{
    shieldBonus: number;
    pickupRadius: number;
    ragePower: number;
    rageDuration: number;
  }>;
}

export const SKILL_NODES: SkillNodeDef[] = [
  {
    id: 'speed_1',
    name: 'Sprint Weave',
    description: '+6% move speed / rank',
    maxRank: 3,
    costPerRank: 1,
    column: 0,
    row: 0,
    modsPerRank: { moveSpeedMult: 0.06 },
  },
  {
    id: 'speed_2',
    name: 'Afterburner',
    description: '+8% move speed / rank',
    maxRank: 2,
    costPerRank: 2,
    requires: ['speed_1'],
    column: 0,
    row: 1,
    modsPerRank: { moveSpeedMult: 0.08 },
  },
  {
    id: 'shield_1',
    name: 'Barrier Cell',
    description: '+25 max shield / rank',
    maxRank: 3,
    costPerRank: 1,
    column: 1,
    row: 0,
    flagsPerRank: { shieldBonus: 25 },
  },
  {
    id: 'shield_2',
    name: 'Aegis Matrix',
    description: '+40 max shield / rank',
    maxRank: 2,
    costPerRank: 2,
    requires: ['shield_1'],
    column: 1,
    row: 1,
    flagsPerRank: { shieldBonus: 40 },
  },
  {
    id: 'magnet_1',
    name: 'Loot Attractor',
    description: '+1.5m pickup radius / rank',
    maxRank: 3,
    costPerRank: 1,
    column: 2,
    row: 0,
    flagsPerRank: { pickupRadius: 1.5 },
  },
  {
    id: 'magnet_2',
    name: 'Vacuum Field',
    description: '+2.5m pickup radius / rank',
    maxRank: 2,
    costPerRank: 2,
    requires: ['magnet_1'],
    column: 2,
    row: 1,
    flagsPerRank: { pickupRadius: 2.5 },
  },
  {
    id: 'rage_1',
    name: 'Combat Stim',
    description: 'Rage: +25% dmg, longer duration',
    maxRank: 2,
    costPerRank: 1,
    column: 3,
    row: 0,
    flagsPerRank: { ragePower: 0.25, rageDuration: 1 },
  },
  {
    id: 'rage_2',
    name: 'Berserk Protocol',
    description: 'Rage: +35% dmg & fire rate',
    maxRank: 2,
    costPerRank: 2,
    requires: ['rage_1'],
    column: 3,
    row: 1,
    flagsPerRank: { ragePower: 0.35, rageDuration: 1.5 },
  },
  {
    id: 'xp_gain',
    name: 'Neuro Link',
    description: '+12% XP gain / rank',
    maxRank: 3,
    costPerRank: 1,
    column: 0,
    row: 2,
    modsPerRank: { xpMult: 0.12 },
  },
  {
    id: 'armor_mastery',
    name: 'Plating Drill',
    description: '+10 armor / rank',
    maxRank: 3,
    costPerRank: 1,
    column: 1,
    row: 2,
    modsPerRank: { armorFlat: 10 },
  },
  {
    id: 'lifesteal_1',
    name: 'Hemophage',
    description: '+3% lifesteal / rank',
    maxRank: 3,
    costPerRank: 2,
    requires: ['rage_1'],
    column: 3,
    row: 2,
    modsPerRank: { lifesteal: 0.03 },
  },
  {
    id: 'crit_focus',
    name: 'Threat Optics+',
    description: '+5% crit / rank',
    maxRank: 3,
    costPerRank: 1,
    column: 2,
    row: 2,
    modsPerRank: { critChance: 0.05 },
  },
];

export interface SkillTreeState {
  points: number;
  ranks: Partial<Record<SkillId, number>>;
  shieldMax: number;
  shield: number;
  pickupRadius: number;
  ragePower: number;
  rageDuration: number;
  rageUntil: number;
  rageCooldown: number;
  magnetBoostUntil: number;
}

export function createSkillTreeState(): SkillTreeState {
  return {
    points: 1,
    ranks: {},
    shieldMax: 0,
    shield: 0,
    pickupRadius: 1.6,
    ragePower: 0.3,
    rageDuration: 4,
    rageUntil: 0,
    rageCooldown: 0,
    magnetBoostUntil: 0,
  };
}

export function getRank(state: SkillTreeState, id: SkillId): number {
  return state.ranks[id] ?? 0;
}

export function canUnlock(state: SkillTreeState, id: SkillId): boolean {
  const node = SKILL_NODES.find((n) => n.id === id);
  if (!node) return false;
  const rank = getRank(state, id);
  if (rank >= node.maxRank) return false;
  if (state.points < node.costPerRank) return false;
  if (node.requires) {
    for (const req of node.requires) {
      if (getRank(state, req) < 1) return false;
    }
  }
  return true;
}

export function unlockSkill(state: SkillTreeState, id: SkillId): boolean {
  if (!canUnlock(state, id)) return false;
  const node = SKILL_NODES.find((n) => n.id === id)!;
  state.points -= node.costPerRank;
  state.ranks[id] = getRank(state, id) + 1;
  recomputeSkillDerived(state);
  return true;
}

export function recomputeSkillDerived(state: SkillTreeState): void {
  let shieldMax = 0;
  let pickup = 1.6;
  let ragePower = 0.3;
  let rageDuration = 4;
  for (const node of SKILL_NODES) {
    const rank = getRank(state, node.id);
    if (rank <= 0 || !node.flagsPerRank) continue;
    if (node.flagsPerRank.shieldBonus) shieldMax += node.flagsPerRank.shieldBonus * rank;
    if (node.flagsPerRank.pickupRadius) pickup += node.flagsPerRank.pickupRadius * rank;
    if (node.flagsPerRank.ragePower) ragePower += node.flagsPerRank.ragePower * rank;
    if (node.flagsPerRank.rageDuration) rageDuration += node.flagsPerRank.rageDuration * rank;
  }
  state.shieldMax = shieldMax;
  state.shield = Math.min(state.shieldMax, Math.max(state.shield, shieldMax * 0.5));
  state.pickupRadius = pickup;
  state.ragePower = ragePower;
  state.rageDuration = rageDuration;
}

export function applySkillPassiveMods(state: SkillTreeState, mods: PlayerMods): void {
  for (const node of SKILL_NODES) {
    const rank = getRank(state, node.id);
    if (rank <= 0 || !node.modsPerRank) continue;
    for (const [k, v] of Object.entries(node.modsPerRank) as [keyof PlayerMods, number][]) {
      if (v === undefined) continue;
      if (
        k === 'critChance' ||
        k === 'armorFlat' ||
        k === 'lifesteal' ||
        k === 'abilityCdr' ||
        k === 'xpMult' ||
        k === 'burnChance' ||
        k === 'toxinChance' ||
        k === 'chillChance' ||
        k === 'statusPower'
      ) {
        mods[k] += v * rank;
      } else {
        mods[k] *= 1 + v * rank;
      }
    }
  }
}

export function grantSkillPoint(state: SkillTreeState, n = 1): void {
  state.points += n;
}

export function activateRage(state: SkillTreeState, now: number): boolean {
  if (state.rageCooldown > 0 || state.rageUntil > now) return false;
  state.rageUntil = now + state.rageDuration;
  state.rageCooldown = 14;
  return true;
}

export function tickSkillTree(state: SkillTreeState, dt: number, now: number): void {
  state.rageCooldown = Math.max(0, state.rageCooldown - dt);
  if (state.rageUntil > 0 && now >= state.rageUntil) state.rageUntil = 0;
  if (state.magnetBoostUntil > 0 && now >= state.magnetBoostUntil) state.magnetBoostUntil = 0;
  // Slow shield regen
  if (state.shieldMax > 0 && state.shield < state.shieldMax) {
    state.shield = Math.min(state.shieldMax, state.shield + dt * 4);
  }
}

export function effectivePickupRadius(state: SkillTreeState): number {
  const boost = state.magnetBoostUntil > 0 ? 3 : 0;
  return state.pickupRadius + boost;
}

export function isRaging(state: SkillTreeState, now: number): boolean {
  return state.rageUntil > now;
}
