import { describe, expect, it } from 'vitest';
import { applyGear, attachmentsFor, emptyGear, equippedAttachments, POWER_STEP } from './attachments';
import { weaponByVariant } from './weapons';

describe('armory gear', () => {
  it('power and attachments change a copy of the weapon, never the catalogue', () => {
    const w = weaponByVariant('carbine_m4');
    const g = emptyGear();
    expect(applyGear(w, g)).toBe(w);
    g.power = 5;
    g.levels = { extmag: 2, foregrip: 3, scope: 1 };
    g.on = { mag: 'extmag', under: 'foregrip', optic: 'scope' };
    const x = applyGear(w, g);
    expect(x).not.toBe(w);
    expect(x.damage).toBeCloseTo(w.damage * (1 + 5 * POWER_STEP + 0.03), 5);
    expect(x.magSize).toBeGreaterThan(w.magSize);
    expect(x.spread).toBeLessThan(w.spread);
    expect(x.range).toBeGreaterThan(w.range);
    expect(weaponByVariant('carbine_m4').damage).toBe(w.damage);
    expect(equippedAttachments(g)).toHaveLength(3);
  });

  it('owned but unequipped attachments do nothing; melee takes none', () => {
    const w = weaponByVariant('carbine_m4');
    const g = emptyGear();
    g.levels = { brake: 5 };
    expect(applyGear(w, g)).toBe(w);
    expect(attachmentsFor(weaponByVariant('knife'))).toEqual([]);
    expect(attachmentsFor(weaponByVariant('pistol'))).toContain('suppressor');
  });
});
