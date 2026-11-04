import { describe, expect, it } from 'vitest';
import {
  applyUpgradeCard,
  createProgressState,
  hasStatusChance,
  rollUpgradeChoices,
} from './progression';

describe('progression smoke', () => {
  it('starts with rifle kit unlocked', () => {
    const state = createProgressState('assaulter');
    expect(state.unlockedWeapons.has('rifle')).toBe(true);
    expect(state.level).toBe(1);
    expect(state.mods.burnChance).toBe(0);
  });

  it('applies status card and unlocks burn synergy gate', () => {
    const state = createProgressState();
    expect(hasStatusChance(state, 'burn')).toBe(false);

    applyUpgradeCard(state, {
      id: 'status_incendiary',
      name: 'Incendiary Tips',
      description: 'burn',
      rarity: 'rare',
      kind: 'status',
      mods: { burnChance: 0.25 },
    });
    expect(hasStatusChance(state, 'burn')).toBe(true);
    expect(state.mods.burnChance).toBeGreaterThanOrEqual(0.25);
    // Pool should be rollable without throw after status unlock
    expect(rollUpgradeChoices(state, 4).length).toBeGreaterThan(0);
  });

  it('evolves rifle once', () => {
    const state = createProgressState();
    applyUpgradeCard(state, {
      id: 'evo_weapon_rifle',
      name: 'Pulse Lance',
      description: 'evo',
      rarity: 'epic',
      kind: 'evolution',
      evolveWeapon: 'rifle',
      evolutionName: 'Pulse Lance',
      masteryWeapon: 'rifle',
      masteryDamage: 0.28,
      weaponStatus: 'burn',
      weaponStatusChance: 0.4,
    });
    expect(state.evolutions.has('rifle')).toBe(true);
    expect(state.evolutions.get('rifle')?.name).toBe('Pulse Lance');
    expect(state.masteries.some((m) => m.weaponId === 'rifle' && m.damage >= 0.28)).toBe(true);
  });
});
