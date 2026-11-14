import { describe, expect, test } from 'vitest';
import { canEquip, sanitize, type Profile } from './loadout';
import { OPERATIVE_ROSTER } from './roster';
import { WEAPONS, weaponVariantId } from './weapons';

const signatureOf = (heroId: string): string => {
  const hero = OPERATIVE_ROSTER.find((h) => h.id === heroId)!;
  return weaponVariantId(WEAPONS[hero.weaponIndex]!);
};

describe('signature weapons', () => {
  test('every operative starts with a different weapon', () => {
    const signatures = OPERATIVE_ROSTER.map((h) => signatureOf(h.id));

    expect(new Set(signatures).size).toBe(OPERATIVE_ROSTER.length);
  });

  test('a signature weapon can only be equipped by its operative', () => {
    expect(canEquip('tox', 'sirt_pompasi')).toBe(true);
    expect(canEquip('ironclad', 'sirt_pompasi')).toBe(false);
    expect(canEquip('ironclad', 'smg')).toBe(true);
  });

  test('an older save gets the new signature in slot 1 once and keeps the rest', () => {
    const old = { version: 1, hero: 'tox', owned: [], starterGranted: true, heroes: { tox: { slots: ['smg', 'rifle', 'knife'] } } } as unknown as Profile;

    const migrated = sanitize(old);

    expect(migrated.heroes.tox!.slots).toEqual(['sirt_pompasi', 'rifle', 'knife']);
  });

  test('a migrated save is left alone when the player swaps the signature out', () => {
    const swapped = { version: 1, hero: 'tox', owned: [], starterGranted: true, signatures: 1, heroes: { tox: { slots: ['rifle', 'knife'] } } } as unknown as Profile;

    const loaded = sanitize(swapped);

    expect(loaded.heroes.tox!.slots).toEqual(['rifle', 'knife']);
  });

  test('another operative loses a signature weapon that is not theirs', () => {
    const cheat = { version: 1, hero: 'ironclad', owned: [], starterGranted: true, signatures: 1, heroes: { ironclad: { slots: ['rifle', 'boru_havan'] } } } as unknown as Profile;

    const loaded = sanitize(cheat);

    expect(loaded.heroes.ironclad!.slots).toEqual(['rifle']);
  });
});
