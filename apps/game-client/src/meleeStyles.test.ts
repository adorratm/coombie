import { describe, expect, test } from 'vitest';
import { MELEE_STYLES, meleeClipSeconds, meleeStyleOf } from './meleeStyles';
import { WEAPONS, weaponVariantId } from './weapons';

describe('melee styles', () => {
  test('every melee weapon in the armory has its own style', () => {
    const styles = WEAPONS.filter((w) => w.melee).map((w) => meleeStyleOf(weaponVariantId(w)));

    expect(styles.length).toBeGreaterThanOrEqual(4);
    expect(new Set(styles).size).toBe(styles.length);
  });

  test('an unknown melee weapon falls back to the bat swing', () => {
    expect(meleeStyleOf('rolling_pin')).toBe('swing');
  });

  test('a swing never outlasts the weapon fire interval', () => {
    for (const w of WEAPONS.filter((x) => x.melee)) {
      expect(meleeClipSeconds(meleeStyleOf(weaponVariantId(w)), w.fireRate)).toBeLessThanOrEqual(w.fireRate);
    }
  });

  test('a very fast weapon still gets a visible swing', () => {
    expect(meleeClipSeconds('stab', 0.05)).toBe(0.18);
  });

  test('clip segments are forward in time', () => {
    for (const def of Object.values(MELEE_STYLES)) expect(def.clip.to).toBeGreaterThan(def.clip.from);
  });
});
