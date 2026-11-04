export const GAME_NAME = 'PROTOCOL-Z';
export const GAME_TAGLINE = 'OUTBREAK DEFENSE // TAC-OS';

export const MAX_SQUAD_SIZE = 8;
export const MIN_COOP_PLAYERS = 2;
export const MAX_COOP_PLAYERS = 8;

export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;

export const DEFAULT_EXP_CURVE = (level: number): number =>
  Math.floor(100 * Math.pow(1.35, level - 1));

export const DESIGN_COLORS = {
  phosphor: '#00FF87',
  urgent: '#FF5722',
  warning: '#F59E0B',
  void: '#090D10',
  panel: '#111822',
  panelHigh: '#182230',
  text: '#F2F5F8',
  muted: '#64748B',
} as const;
