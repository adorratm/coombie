import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { CombatFx } from './fx';
import type { OperativeId } from './roster';
import type { AbilitySlot } from './loadout';
import type { SkillFx } from './skillFx';
import { createHeroAbilityRuntime, type HeroAbilityRuntime, type HeroBuffs } from './heroAbilities';
import { createRunSkillState, RunSkillRuntime, RUN_SKILLS, type RunSkillId, type EvoBranch } from './runSkills';

/**
 * Co-op: every team mate's Q/E/R casts, radio fire support (H) and passive run skills, replayed on
 * this screen so the whole squad sees turrets, mines, drones, auras and gunships. Purely visual:
 * damage is dealt by the owner (host sim / guest `hit` events), so the mirror never hurts zombies.
 * Heals and team buffs from a mate's ability do land on the local hero, as they would in person.
 */
export interface CoopMirrorDeps {
  scene: THREE.Scene;
  fx: CombatFx;
  vfx: SkillFx;
  zombies: ZombieVisual[];
  /** the local hero (receives a mate's heals / buffs / revives) */
  me: OperativeVisual;
  allyOf: (playerId: string) => OperativeVisual | null;
  heroOf: (playerId: string) => OperativeId;
  moveWithCollision: (obj: THREE.Object3D, dx: number, dz: number, radius: number) => void;
  revive: (op: OperativeVisual) => void;
  sample: (key: string, o?: { gain?: number; pan?: number; rate?: number; bus?: 'combat' | 'player' | 'ui' }) => void;
  boom: () => void;
}

interface Mate {
  hero: OperativeId;
  op: OperativeVisual;
  aim: THREE.Vector3;
  levels: Record<AbilitySlot, number>;
  power: number;
  aoe: number;
  abilities: HeroAbilityRuntime;
  skills: RunSkillRuntime;
  skillState: ReturnType<typeof createRunSkillState>;
  skillPower: number;
  lastPos: THREE.Vector3;
}

const SLOTS: readonly AbilitySlot[] = ['q', 'e', 'r'];
const BRANCHES = new Set<string>(['signature', 'power', 'rapid']);
const clampNum = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const noop = () => undefined;

export class CoopMirror {
  private readonly mates = new Map<string, Mate>();
  constructor(private readonly d: CoopMirrorDeps) {}

  private mate(id: string): Mate | null {
    const op = this.d.allyOf(id);
    if (!op) return null;
    const hero = this.d.heroOf(id);
    const have = this.mates.get(id);
    if (have && have.op === op && have.hero === hero) return have;
    if (have) this.drop(id);
    const aim = new THREE.Vector3();
    const levels: Record<AbilitySlot, number> = { q: 1, e: 1, r: 1 };
    const m = { hero, op, aim, levels, power: 1, aoe: 1, skillPower: 1, lastPos: op.root.position.clone() } as Mate;
    m.abilities = createHeroAbilityRuntime(hero, levels, {
      scene: this.d.scene,
      fx: this.d.fx,
      player: op,
      squad: [this.d.me],
      zombies: this.d.zombies,
      aim,
      damageZombie: noop,
      moveWithCollision: this.d.moveWithCollision,
      revive: (o) => {
        if (o === this.d.me) this.d.revive(o);
      },
      addPierceShots: noop,
      shake: noop,
      anim: noop,
      sfx: (k) => {
        if (k === 'boom') this.d.boom();
      },
      vfx: this.d.vfx,
      powerMult: () => m.power,
      aoeMult: () => m.aoe,
      cdrMult: () => 1,
    });
    m.skillState = createRunSkillState();
    m.skillState.hero = hero;
    m.skills = new RunSkillRuntime({
      scene: this.d.scene,
      fx: this.d.vfx,
      player: op,
      zombies: this.d.zombies,
      state: m.skillState,
      damageZombie: noop,
      shake: noop,
      sfx: (k) => {
        if (k === 'boom') this.d.boom();
      },
      powerMult: () => m.skillPower,
      sample: (key, o) => this.d.sample(key, { ...o, gain: (o?.gain ?? 1) * 0.45 }),
      radio: noop,
      say: noop,
      supplyLanded: noop,
    });
    this.mates.set(id, m);
    return m;
  }

  /** a mate pressed Q/E/R */
  cast(id: string, ev: { slot: string; x: number; z: number; lv?: number; pw?: number; ae?: number }, now: number): void {
    const slot = ev.slot as AbilitySlot;
    if (!SLOTS.includes(slot)) return;
    const m = this.mate(id);
    if (!m) return;
    m.levels[slot] = Math.round(clampNum(ev.lv, 1, 8, 1));
    m.power = clampNum(ev.pw, 0.2, 20, 1);
    m.aoe = clampNum(ev.ae, 0.3, 6, 1);
    m.aim.set(clampNum(ev.x, -2000, 2000, m.op.root.position.x), 0, clampNum(ev.z, -2000, 2000, m.op.root.position.z));
    m.abilities.cooldowns[slot] = 0;
    m.abilities.cast(slot, now);
  }

  /** a mate called radio support (H) */
  support(id: string, x: number, z: number): void {
    const m = this.mate(id);
    if (!m) return;
    m.skills.remoteSupport(new THREE.Vector3(clampNum(x, -2000, 2000, 0), 0, clampNum(z, -2000, 2000, 0)));
  }

  /** a mate's run skill list changed */
  kit(id: string, flat: unknown, pw: unknown): void {
    if (!Array.isArray(flat)) return;
    const m = this.mate(id);
    if (!m) return;
    m.skillPower = clampNum(pw, 0.2, 20, 1);
    const st = m.skillState;
    st.skills.clear();
    st.evolved.clear();
    for (let i = 0; i + 1 < flat.length && i < 60; i += 3) {
      const sid = String(flat[i]) as RunSkillId;
      if (!(sid in RUN_SKILLS)) continue;
      st.skills.set(sid, Math.round(clampNum(flat[i + 1], 1, 10, 1)));
      const b = String(flat[i + 2] ?? '');
      if (BRANCHES.has(b)) st.evolved.set(sid, b as EvoBranch);
    }
  }

  /** every run skill the team mates own (team fusion cards) */
  teamSkills(into: Set<RunSkillId>): Set<RunSkillId> {
    into.clear();
    for (const m of this.mates.values()) for (const id of m.skillState.skills.keys()) into.add(id);
    return into;
  }

  /** team buffs a mate's abilities put on the local hero */
  buffsFor(op: OperativeVisual, now: number, into: HeroBuffs): HeroBuffs {
    if (this.mates.size === 0) return into;
    let out = into;
    for (const m of this.mates.values()) {
      const b = m.abilities.buffsFor(op, now);
      if (b.damage === 1 && b.fireRate === 1 && b.move === 1 && b.armor === 0 && b.crit === 0) continue;
      out = {
        damage: out.damage * b.damage,
        fireRate: out.fireRate * b.fireRate,
        move: out.move * b.move,
        armor: Math.min(0.85, out.armor + b.armor),
        crit: out.crit + b.crit,
      };
    }
    return out;
  }

  update(dt: number, now: number): void {
    for (const [id, m] of this.mates) {
      if (this.d.allyOf(id) !== m.op) {
        this.drop(id);
        continue;
      }
      const moved = m.op.root.position.distanceToSquared(m.lastPos) > 1e-4;
      m.lastPos.copy(m.op.root.position);
      try {
        m.abilities.update(dt, now);
        m.skills.update(dt, moved);
      } catch (err) {
        console.warn('[coop] mirror update', err);
        this.drop(id);
      }
    }
  }

  drop(id: string): void {
    const m = this.mates.get(id);
    if (!m) return;
    this.mates.delete(id);
    m.abilities.dispose();
    m.skills.dispose();
  }

  dispose(): void {
    for (const id of [...this.mates.keys()]) this.drop(id);
  }
}

/** flat wire form of a run skill state: [id, level, branch | '', …] */
export function packKit(st: { skills: Map<RunSkillId, number>; evolved: Map<RunSkillId, EvoBranch> }): (string | number)[] {
  const out: (string | number)[] = [];
  for (const [id, lv] of st.skills) out.push(id, lv, st.evolved.get(id) ?? '');
  return out.slice(0, 60);
}
