import { afterEach, describe, expect, it } from 'vitest';
import { advanceReactionClock, applyStatus, freezeZombie, REACTION_COOLDOWN, setReactionHandler, tickZombieStatuses, type ReactionId } from './statusEffects';
import { applyRunSkillCard, createRunSkillState, FUSIONS, fusionCards, fusionFactor, runSkillCards } from './runSkills';
import type { ZombieVisual } from './characters';

const stub = (): ZombieVisual => ({ speed: 3, baseSpeed: 3, statuses: [] }) as unknown as ZombieVisual;

describe('elemental reactions', () => {
  afterEach(() => setReactionHandler(null));

  it('burn on a chilled zombie sets off a thermal shock and consumes both', () => {
    const seen: ReactionId[] = [];
    setReactionHandler((_z, r) => seen.push(r.id));
    advanceReactionClock(10);
    const z = stub();
    applyStatus(z, 'chill', 1);
    applyStatus(z, 'burn', 1);
    expect(seen).toEqual(['thermal']);
    expect(z.statuses.length).toBe(0);
    expect(z.speed).toBe(3);
  });

  it('respects the per-zombie cooldown', () => {
    const seen: ReactionId[] = [];
    setReactionHandler((_z, r) => seen.push(r.id));
    advanceReactionClock(10);
    const z = stub();
    applyStatus(z, 'toxin', 1);
    applyStatus(z, 'burn', 1);
    applyStatus(z, 'toxin', 1);
    applyStatus(z, 'burn', 1);
    expect(seen).toEqual(['toxicBlast']);
    advanceReactionClock(REACTION_COOLDOWN + 0.01);
    applyStatus(z, 'chill', 1);
    expect(seen).toEqual(['toxicBlast', 'cryoToxin']);
  });

  it('no handler = plain stacking (solo tests, menus)', () => {
    const z = stub();
    applyStatus(z, 'chill', 1);
    applyStatus(z, 'burn', 1);
    expect(z.statuses.length).toBe(2);
  });

  it('freeze stops a zombie, then lets it go', () => {
    const z = stub();
    freezeZombie(z, 0.5);
    tickZombieStatuses(z, 0.2);
    expect(z.speed).toBe(0);
    tickZombieStatuses(z, 0.4);
    expect(z.speed).toBe(3);
  });
});

describe('skill fusions', () => {
  it('offers a fusion once both skills reach the fusion level and boosts both', () => {
    const st = createRunSkillState('saws');
    st.skills.set('saws', 3);
    st.skills.set('fireAura', 2);
    expect(fusionCards(st).some((c) => c.id === 'flameSaw')).toBe(false);
    st.skills.set('fireAura', 3);
    const card = runSkillCards(st).find((c) => c.id === 'flameSaw');
    expect(card?.kind).toBe('fuse');
    applyRunSkillCard(st, 'fuse', 'flameSaw');
    expect(fusionFactor(st, 'saws').dmg).toBeGreaterThan(1.3);
    expect(fusionFactor(st, 'fireAura').cd).toBeLessThan(1);
    expect(fusionFactor(st, 'drone').dmg).toBe(1);
    expect(fusionCards(st).some((c) => c.id === 'flameSaw')).toBe(false);
  });

  it('team fusion pairs my skill with a mate\'s at reduced strength', () => {
    const st = createRunSkillState('molotov');
    st.skills.set('molotov', 3);
    st.team = new Set(['cropDuster']);
    const card = fusionCards(st).find((c) => c.id === 'toxicNapalm@team');
    expect(card).toBeTruthy();
    applyRunSkillCard(st, 'fuse', card!.id);
    const solo = 1 + FUSIONS.find((f) => f.id === 'toxicNapalm')!.dmg;
    expect(fusionFactor(st, 'molotov').dmg).toBeLessThan(solo);
    expect(fusionFactor(st, 'molotov').dmg).toBeGreaterThan(1);
  });

  it('every fusion names two real, different skills', () => {
    for (const f of FUSIONS) expect(f.a).not.toBe(f.b);
    expect(new Set(FUSIONS.map((f) => f.id)).size).toBe(FUSIONS.length);
  });
});
