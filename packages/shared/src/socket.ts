import type {
  GameMode,
  MatchConfig,
  OperativeId,
  PlayerState,
  PowerUpChoiceOffer,
  PowerUpId,
  Vec3,
  WaveEvent,
} from './types';

export const SOCKET_NS = {
  lobby: '/lobby',
  match: '/match',
} as const;

export const ClientEvents = {
  LobbyCreate: 'lobby:create',
  LobbyJoin: 'lobby:join',
  LobbyLeave: 'lobby:leave',
  LobbySelectOperative: 'lobby:select_operative',
  LobbySetReady: 'lobby:set_ready',
  LobbyChat: 'lobby:chat',
  LobbyStart: 'lobby:start',
  /** Dracord içinden: launch token ile kimlik + oturuma bağlı ortak oda */
  LobbyDracord: 'lobby:dracord',

  MatchInput: 'match:input',
  MatchAbility: 'match:ability',
  MatchPowerUpSelect: 'match:powerup_select',
} as const;

export const ServerEvents = {
  LobbyState: 'lobby:state',
  LobbyChat: 'lobby:chat',
  LobbyError: 'lobby:error',

  MatchStart: 'match:start',
  MatchSnapshot: 'match:snapshot',
  MatchWave: 'match:wave',
  MatchLevelUp: 'match:level_up',
  MatchPowerUpOffer: 'match:powerup_offer',
  MatchEnded: 'match:ended',
} as const;

export interface LobbyCreatePayload {
  mode: GameMode;
  fillBots?: boolean;
  displayName: string;
}

/** Dracord oturumu → sabit oda kodu (istemci ve sunucu aynı kodu üretir) */
export function dracordRoomCode(sessionId: string): string {
  let h = 2166136261;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `DC-${(h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

/** Dracord launch token (DracordEmbed.ready().token) — sunucu doğrular */
export interface LobbyDracordPayload {
  token: string;
}

export interface LobbyJoinPayload {
  roomCode: string;
  displayName: string;
}

export interface LobbySelectOperativePayload {
  operativeId: OperativeId;
}

export interface MatchInputPayload {
  seq: number;
  dt: number;
  move: Vec3;
  aimYaw: number;
  firing: boolean;
  reload: boolean;
}

export interface MatchPowerUpSelectPayload {
  offerId: string;
  powerUpId: PowerUpId;
  /** Solo: which squad member receives the upgrade */
  targetOperativeId: OperativeId;
}

export interface LobbyStatePayload {
  roomCode: string;
  config: MatchConfig;
  players: PlayerState[];
  hostPlayerId: string;
}

export interface MatchSnapshotPayload {
  tick: number;
  level: number;
  players: PlayerState[];
  /** Compact entity blobs — expanded in game-engine */
  entities: unknown[];
}

export interface MatchLevelUpPayload {
  level: number;
  wave: WaveEvent;
  offers: PowerUpChoiceOffer[];
}
