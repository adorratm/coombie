import { DEFAULT_EXP_CURVE } from '@protocol-z/shared';

export interface ExpState {
  level: number;
  exp: number;
  expToNext: number;
}

export function createExpState(level = 1): ExpState {
  return { level, exp: 0, expToNext: DEFAULT_EXP_CURVE(level) };
}

/** Returns number of levels gained (may be >1). */
export function grantExp(state: ExpState, amount: number): number {
  let gained = 0;
  state.exp += amount;
  while (state.exp >= state.expToNext) {
    state.exp -= state.expToNext;
    state.level += 1;
    state.expToNext = DEFAULT_EXP_CURVE(state.level);
    gained += 1;
  }
  return gained;
}
