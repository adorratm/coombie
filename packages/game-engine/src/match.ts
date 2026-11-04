import {
  OPERATIVE_BY_ID,
  powerUpPickCount,
  rollPowerUpChoices,
  spawnBudgetForLevel,
  waveKindForLevel,
  type GameMode,
  type OperativeId,
  type PlayerState,
  type PowerUpChoiceOffer,
  type WaveEvent,
} from '@protocol-z/shared';
import { createExpState, grantExp, type ExpState } from './exp';

export interface MatchRuntimePlayer {
  state: PlayerState;
  exp: ExpState;
}

export interface MatchRuntime {
  mode: GameMode;
  level: number;
  tick: number;
  players: Map<string, MatchRuntimePlayer>;
  pendingOffers: PowerUpChoiceOffer[];
}

export function createPlayerState(
  playerId: string,
  displayName: string,
  operativeId: OperativeId,
  isBot = false,
): PlayerState {
  const def = OPERATIVE_BY_ID[operativeId];
  return {
    playerId,
    displayName,
    operativeId,
    level: 1,
    exp: 0,
    expToNext: createExpState().expToNext,
    hp: def.baseStats.hp,
    maxHp: def.baseStats.hp,
    armor: def.baseStats.armor,
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    powerUps: [],
    isReady: false,
    isBot,
  };
}

export function createMatch(mode: GameMode, players: PlayerState[]): MatchRuntime {
  const map = new Map<string, MatchRuntimePlayer>();
  for (const p of players) {
    map.set(p.playerId, { state: p, exp: createExpState(p.level) });
  }
  return { mode, level: 1, tick: 0, players: map, pendingOffers: [] };
}

export function currentWave(level: number): WaveEvent {
  return {
    level,
    kind: waveKindForLevel(level),
    spawnBudget: spawnBudgetForLevel(level),
  };
}

export function applyKillExp(
  match: MatchRuntime,
  killerPlayerId: string,
  expAmount: number,
  offerIdFactory: () => string,
): PowerUpChoiceOffer[] {
  const offers: PowerUpChoiceOffer[] = [];

  if (match.mode === 'coop') {
    const entry = match.players.get(killerPlayerId);
    if (!entry) return offers;
    const levels = grantExp(entry.exp, expAmount);
    syncPlayerExp(entry);
    for (let i = 0; i < levels; i++) {
      match.level = Math.max(match.level, entry.exp.level);
      offers.push(buildOffer(match, entry.state, offerIdFactory, 1));
    }
    return offers;
  }

  // Solo: shared squad progression — all characters level together
  const first = match.players.values().next().value as MatchRuntimePlayer | undefined;
  if (!first) return offers;
  const levels = grantExp(first.exp, expAmount);
  for (const entry of match.players.values()) {
    entry.exp.level = first.exp.level;
    entry.exp.exp = first.exp.exp;
    entry.exp.expToNext = first.exp.expToNext;
    syncPlayerExp(entry);
  }
  match.level = first.exp.level;
  const squadSize = match.players.size;
  const picks = powerUpPickCount('solo', squadSize);
  for (let i = 0; i < levels; i++) {
    offers.push(buildOffer(match, first.state, offerIdFactory, picks));
  }
  return offers;
}

function syncPlayerExp(entry: MatchRuntimePlayer): void {
  entry.state.level = entry.exp.level;
  entry.state.exp = entry.exp.exp;
  entry.state.expToNext = entry.exp.expToNext;
}

function buildOffer(
  match: MatchRuntime,
  player: PlayerState,
  offerIdFactory: () => string,
  picksRemaining: number,
): PowerUpChoiceOffer {
  return {
    offerId: offerIdFactory(),
    playerId: player.playerId,
    picksRemaining,
    choices: rollPowerUpChoices(3),
    assignableOperativeIds: [...match.players.values()].map(
      (p) => p.state.operativeId,
    ),
  };
}
