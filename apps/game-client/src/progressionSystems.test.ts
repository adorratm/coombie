import { beforeEach, describe, expect, it } from 'vitest';
import {
  HERO_LEVEL_MAX,
  HeroXpLedger,
  TREE_NODES,
  TREE_TOTAL_RANKS,
  addXpTo,
  availablePoints,
  heroXpForLevel,
  loadHeroProgress,
  treeTotals,
  unlockBlock,
  unlockTreeNode,
  type HeroProgress,
} from './heroProgress';
import {
  RUN_LEVEL_MAX,
  WEAPON_LEVEL_MAX,
  applyUpgradeCard,
  createProgressState,
  gainProgressXp,
  rollUpgradeChoices,
  selectUpgrade,
  weaponLevel,
} from './progression';
import { SKILL_MAX, applyRunSkillCard, createRunSkillState, evolutionCards, pendingEvolution } from './runSkills';

// minimal localStorage for the node test env
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
});

describe('hero tree', () => {
  it('holds exactly the points a Lv 75 operative earns', () => {
    expect(TREE_TOTAL_RANKS).toBe(HERO_LEVEL_MAX - 1);
    expect(new Set(TREE_NODES.map((n) => n.id)).size).toBe(TREE_NODES.length);
    for (const n of TREE_NODES) {
      if (n.requires) expect(TREE_NODES.some((x) => x.id === n.requires)).toBe(true);
      expect(n.reqLevel).toBeLessThanOrEqual(HERO_LEVEL_MAX);
    }
  });

  it('gates nodes by level, prerequisite and points', () => {
    const p: HeroProgress = { xp: 0, level: 1, ranks: {} };
    expect(unlockBlock(p, 'a_dmg')).toBe('points');
    p.level = 10;
    expect(unlockBlock(p, 'a_dmg')).toBe(null);
    expect(unlockBlock(p, 'a_rate')).toBe('requires');
    expect(unlockBlock(p, 'a_crit')).toBe('level');
    p.ranks.a_dmg = 5;
    expect(unlockBlock(p, 'a_dmg')).toBe('max');
    expect(availablePoints(p)).toBe(4);
  });

  it('a maxed operative can fill the whole tree', () => {
    localStorage.setItem('protocol-z-heroes-v1', JSON.stringify({ ironclad: { xp: 0, level: 75, ranks: {} } }));
    let guard = 0;
    let progressed = true;
    while (progressed && guard++ < 500) {
      progressed = false;
      for (const n of TREE_NODES) if (unlockTreeNode('ironclad', n.id)) progressed = true;
    }
    const p = loadHeroProgress('ironclad');
    expect(availablePoints(p)).toBe(0);
    for (const n of TREE_NODES) expect(p.ranks[n.id]).toBe(n.maxRank);
    const t = treeTotals(p);
    expect(t.earlySlot && t.evoAny && t.startSupport).toBe(true);
    expect(t.revives).toBe(1);
  });

  it('levels up and caps at 75', () => {
    const p: HeroProgress = { xp: 0, level: 1, ranks: {} };
    expect(addXpTo(p, heroXpForLevel(1) + 1)).toBe(1);
    expect(p.level).toBe(2);
    addXpTo(p, 1e12);
    expect(p.level).toBe(HERO_LEVEL_MAX);
    expect(addXpTo(p, 1000)).toBe(0);
  });

  it('ledger banks XP to storage for the player and squad mates', () => {
    const l = new HeroXpLedger();
    l.add('ironclad', 1000);
    l.add('valkyrie', 600);
    l.tick(1);
    expect(loadHeroProgress('ironclad').xp).toBe(0); // not flushed yet
    l.flush();
    const a = loadHeroProgress('ironclad');
    expect(a.level > 1 || a.xp > 0).toBe(true);
    expect(loadHeroProgress('valkyrie').xp + loadHeroProgress('valkyrie').level).toBeGreaterThan(1);
  });
});

describe('run skill evolution', () => {
  it('caps skills at 4 and offers 2-3 branches', () => {
    const st = createRunSkillState('saws');
    for (let i = 0; i < 6; i++) applyRunSkillCard(st, 'skill', 'saws');
    expect(st.skills.get('saws')).toBe(SKILL_MAX);
    expect(pendingEvolution(st)).toBe('saws');
    const noPassive = evolutionCards(st, 'saws');
    expect(noPassive.length).toBe(2);
    st.passives.set('area', 1);
    const cards = evolutionCards(st, 'saws');
    expect(cards.length).toBe(3);
    applyRunSkillCard(st, 'evo', 'saws:power');
    expect(st.evolved.get('saws')).toBe('power');
    expect(pendingEvolution(st)).toBe(null);
  });

  it('the level-up draft forces the evolution choice', () => {
    const s = createProgressState('assaulter');
    s.runSkills = createRunSkillState('grenade');
    s.runSkills.skills.set('grenade', SKILL_MAX);
    const picks = rollUpgradeChoices(s, 4);
    expect(picks.length).toBeGreaterThanOrEqual(2);
    expect(picks.every((c) => c.runSkill?.kind === 'evo')).toBe(true);
  });
});

describe('run level and weapons', () => {
  it('caps the run at Lv 200 and never freezes on an empty draft', () => {
    const s = createProgressState('assaulter');
    gainProgressXp(s, 1e12);
    expect(s.level).toBe(RUN_LEVEL_MAX);
    expect(s.totalXp).toBeGreaterThan(0);
    // drain every pending pick: must always terminate
    let n = 0;
    while (s.pendingPicks > 0 && n++ < 400) selectUpgrade(s, 0);
    expect(s.pendingPicks).toBe(0);
    const before = s.totalXp;
    expect(gainProgressXp(s, 50)).toBe(0);
    expect(s.totalXp).toBeGreaterThan(before);
  });

  it('weapon track cards level a slot weapon up to the max', () => {
    const s = createProgressState('assaulter');
    s.slotWeapons.set('rifle', 'Tüfek');
    for (let i = 0; i < WEAPON_LEVEL_MAX + 2; i++) {
      const card = rollUpgradeChoices(s, 40).find((c) => c.weaponLevel?.weaponId === 'rifle');
      if (!card) break;
      applyUpgradeCard(s, card);
    }
    expect(weaponLevel(s, 'rifle')).toBe(WEAPON_LEVEL_MAX);
    const m = s.masteries.find((x) => x.weaponId === 'rifle')!;
    expect(m.pierce).toBe(2);
    expect(m.damage).toBeGreaterThan(0.7);
  });
});
