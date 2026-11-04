export type Gender = 'male' | 'female';
export type GameMode = 'solo' | 'coop';
export type OperativeRole =
  | 'tank'
  | 'medic'
  | 'gunner'
  | 'bio_alchemist'
  | 'sniper'
  | 'engineer'
  | 'heavy'
  | 'demolisher';

/** Canon: matches `apps/game-client/src/roster.ts`. */
export type OperativeId =
  | 'ironclad'
  | 'valkyrie'
  | 'breaker'
  | 'tox'
  | 'ghost'
  | 'spark'
  | 'warden'
  | 'havoc';

/** Canon playable kinds + `screamer` reserved for a later slice. */
export type ZombieArchetype =
  | 'grunt'
  | 'runner'
  | 'tank'
  | 'acid'
  | 'boss'
  | 'screamer';

export type PowerUpRarity = 'common' | 'rare' | 'epic';
export type PowerUpId = string;

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export interface OperativeDef {
  id: OperativeId;
  codename: string;
  displayName: string;
  gender: Gender;
  role: OperativeRole;
  activeAbility: string;
  passive: string;
  primaryWeapon: string;
  baseStats: {
    hp: number;
    armor: number;
    moveSpeed: number;
    damage: number;
  };
  animationSet: string;
}

export interface ZombieDef {
  id: ZombieArchetype;
  name: string;
  hp: number;
  armor: number;
  moveSpeed: number;
  damage: number;
  special: string;
  specialCooldownMs: number;
}

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  description: string;
  rarity: PowerUpRarity;
  /** Stat key applied by game-engine */
  effectKey: string;
  effectValue: number;
}

export interface PlayerState {
  playerId: string;
  displayName: string;
  operativeId: OperativeId;
  level: number;
  exp: number;
  expToNext: number;
  hp: number;
  maxHp: number;
  armor: number;
  position: Vec3;
  rotationY: number;
  powerUps: PowerUpId[];
  isReady: boolean;
  isBot: boolean;
}

export interface MatchConfig {
  mode: GameMode;
  maxPlayers: 1 | 2 | 3 | 4;
  fillBots: boolean;
  region: string;
}

export interface WaveEvent {
  level: number;
  kind: 'normal' | 'elite_super' | 'horde';
  spawnBudget: number;
}

export interface PowerUpChoiceOffer {
  offerId: string;
  playerId: string;
  /** Solo: remaining picks equal to squad size */
  picksRemaining: number;
  choices: PowerUpDef[];
  assignableOperativeIds: OperativeId[];
}
