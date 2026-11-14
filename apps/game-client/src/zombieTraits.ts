import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import { createAcidSpit, knock, slowOperative, stun, type ZombieCombatCtx } from './zombieCombat';
import { ZOMBIE_TYPE_BY_ID, type ZombieTraits, type ZombieTypeDef } from './zombieTypes';

/**
 * Runtime for zombie type traits (see zombieTypes.ts). Host-side only: the host owns
 * zombie health and positions, guests just draw the replicas.
 *
 * Telegraphed attacks (nova, quake, meteor) are queued here with their impact time
 * so the warning ring always comes first and the hit lands even if the caster dies.
 */

interface TraitState {
  next: Record<string, number>;
  hurtAt: number;
  lastHp: number;
  enraged: boolean;
  phaseUntil: number;
}

interface Pending {
  at: number;
  run: () => void;
}

const queue: Pending[] = [];

export function typeOf(z: ZombieVisual): ZombieTypeDef | undefined {
  const id = z.root.userData.ztype as string | undefined;
  return id ? ZOMBIE_TYPE_BY_ID.get(id) : undefined;
}

function stateOf(z: ZombieVisual, now: number): TraitState {
  const ud = z.root.userData as { trs?: TraitState };
  if (!ud.trs) {
    ud.trs = { next: {}, hurtAt: -99, lastHp: z.hp, enraged: false, phaseUntil: 0 };
    // stagger the first use so a fresh spawn doesn't fire everything at once
    const t = typeOf(z)?.traits ?? {};
    for (const k of Object.keys(t)) ud.trs.next[k] = now + 1.5 + Math.random() * 2.5;
  }
  return ud.trs;
}

/** Every `every` seconds per trait key. */
function due(st: TraitState, key: string, every: number, now: number): boolean {
  if ((st.next[key] ?? 0) > now) return false;
  st.next[key] = now + every * (0.85 + Math.random() * 0.3);
  return true;
}

const nearestOp = (squad: OperativeVisual[], at: THREE.Vector3, range: number): OperativeVisual | null => {
  let best: OperativeVisual | null = null;
  let bd = range * range;
  for (const op of squad) {
    if (!op.alive) continue;
    const d = op.root.position.distanceToSquared(at);
    if (d < bd) {
      bd = d;
      best = op;
    }
  }
  return best;
};

/** Incoming-damage multiplier from armor and phasing. */
export function traitDamageMul(z: ZombieVisual, now: number): number {
  const t = typeOf(z)?.traits;
  if (!t) return 1;
  const st = (z.root.userData as { trs?: TraitState }).trs;
  if (st && st.phaseUntil > now) return 0;
  return 1 - Math.min(0.85, t.armor ?? 0);
}

/** Pending telegraphed hits (call once per frame on the host). */
export function tickTraitQueue(now: number): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i]!.at > now) continue;
    const job = queue[i]!;
    queue.splice(i, 1);
    job.run();
  }
}

export function resetTraitQueue(): void {
  queue.length = 0;
}

/** Per-frame trait behaviour for a typed zombie. */
export function tickZombieTraits(z: ZombieVisual, dt: number, ctx: ZombieCombatCtx): void {
  const def = typeOf(z);
  if (!def || z.hp <= 0) return;
  const t: ZombieTraits = def.traits;
  const now = ctx.nowSec;
  const st = stateOf(z, now);
  const p = z.root.position;
  if (z.hp < st.lastHp - 1e-3) st.hurtAt = now;
  st.lastHp = z.hp;
  const target = nearestOp(ctx.squad, p, 40);
  const dist = target ? target.root.position.distanceTo(p) : Infinity;

  if (t.regen && now - st.hurtAt > 2 && z.hp < z.maxHp) {
    z.hp = Math.min(z.maxHp, z.hp + z.maxHp * t.regen * dt);
    st.lastHp = z.hp;
    z.healthBar.setRatio(z.hp / z.maxHp);
    if (ctx.vfx && Math.random() < dt * 4) ctx.vfx.emit('smoke', p.x, 1.2, p.z, { vy: 0.8, life: 0.7, s0: 0.2, s1: 0.5, color: 0x6aff8a, a: 0.35 });
  }

  if (t.enrage && !st.enraged && z.hp / z.maxHp < t.enrage) {
    st.enraged = true;
    z.speed *= 1.4;
    z.baseSpeed *= 1.4;
    z.attackDamage = Math.ceil(z.attackDamage * 1.3);
    ctx.fx.spawnHitRing(p.clone(), 0xff2020, 0.15);
    ctx.vfx?.dustRing(p, 3, 0x6a1a1a);
    ctx.shake(0.15);
  }

  if (t.phase) {
    if (st.phaseUntil <= now && due(st, 'phase', t.phase.every, now)) {
      st.phaseUntil = now + t.phase.dur;
      ctx.vfx?.emit('smoke', p.x, 1, p.z, { vy: 0.5, life: 0.8, s0: 0.8, s1: 1.6, color: 0xc8ccd8, a: 0.35 });
    }
    // phased: see-through flicker (stalkers handle their own cloak)
    if (z.kind !== 'stalker') z.root.visible = st.phaseUntil <= now || Math.random() < 0.35;
  }

  if (t.fireTrail && due(st, 'fireTrail', t.fireTrail, now)) ctx.hazards.fire(p.x, p.z, def.tier === 'boss' ? 1.6 : 1, 4, 3);
  if (t.toxicTrail && due(st, 'toxicTrail', t.toxicTrail, now)) ctx.hazards.puddle(p.x, p.z, def.tier === 'boss' ? 1.8 : 1.2, 5, 3.5);

  if (t.frostAura) {
    if (ctx.vfx && Math.random() < dt * 6) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * t.frostAura;
      ctx.vfx.emit('smoke', p.x + Math.cos(a) * r, 0.15, p.z + Math.sin(a) * r, { vy: 0.1, life: 1.4, s0: 0.5, s1: 1.4, color: 0xd6eef8, a: 0.3 });
    }
    for (const op of ctx.squad) {
      if (op.alive && op.root.position.distanceTo(p) < t.frostAura) slowOperative(op, 0.6, now + 0.4);
    }
  }

  if (t.drain && due(st, 'drain', 0.5, now)) {
    let drained = 0;
    for (const op of ctx.squad) {
      if (!op.alive || op.root.position.distanceTo(p) > t.drain.r) continue;
      const amount = Math.max(1, z.attackDamage * t.drain.dps * 0.5);
      if (ctx.damageOperative(op, amount, p)) drained += amount;
      ctx.vfx?.bolt(p.clone().setY(1.4), op.root.position.clone().setY(1.2), 0xb01030, 0.04, 0.12, 6);
    }
    if (drained > 0) {
      z.hp = Math.min(z.maxHp, z.hp + drained * 3);
      st.lastHp = z.hp;
      z.healthBar.setRatio(z.hp / z.maxHp);
    }
  }

  if (t.blink && target && dist > 5 && z.attackAnim <= 0 && due(st, 'blink', t.blink, now)) {
    const dir = target.root.position.clone().sub(p).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() - 0.5) * 4);
    const to = target.root.position.clone().addScaledVector(dir, -2.6).add(side);
    ctx.vfx?.emit('smoke', p.x, 1, p.z, { vy: 0.5, life: 0.7, s0: 0.8, s1: 1.8, color: def.color, a: 0.35 });
    // hop in short legs so walls still block it
    const delta = to.sub(p).setY(0);
    for (let i = 0; i < 6; i++) ctx.move(z.root, delta.x / 6, delta.z / 6, 0.5);
    ctx.vfx?.emit('smoke', z.root.position.x, 1, z.root.position.z, { vy: 0.5, life: 0.7, s0: 0.8, s1: 1.8, color: def.color, a: 0.35 });
    ctx.vfx?.sparks(z.root.position.clone().setY(1.2), 8, def.color, 4);
  }

  if (t.pull && target && dist < t.pull.r && dist > 2 && due(st, 'pull', t.pull.every, now)) {
    for (const op of ctx.squad) {
      if (!op.alive) continue;
      const d = op.root.position.distanceTo(p);
      if (d > t.pull.r || d < 2) continue;
      const k = Math.min(t.pull.dist, d - 1.5);
      const dir = p.clone().sub(op.root.position).setY(0).normalize();
      ctx.move(op.root, dir.x * k, dir.z * k, 0.55);
      slowOperative(op, 0.7, now + 1);
      ctx.vfx?.bolt(p.clone().setY(1.3), op.root.position.clone().setY(1.1), def.color, 0.06, 0.2, 6);
    }
  }

  if (t.healer && due(st, 'healer', t.healer.every, now)) {
    let healed = 0;
    for (const o of ctx.zombies) {
      if (o === z || o.hp <= 0 || o.hp >= o.maxHp || o.root.position.distanceTo(p) > t.healer.r) continue;
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * t.healer.pct);
      o.healthBar.setRatio(o.hp / o.maxHp);
      if (ctx.vfx && healed < 10) ctx.vfx.emit('smoke', o.root.position.x, 1.4, o.root.position.z, { vy: 1, life: 0.8, s0: 0.3, s1: 0.8, color: 0x7cffb2, a: 0.4 });
      healed++;
    }
    if (healed) ctx.vfx?.dustRing(p, t.healer.r * 0.6, 0x3a6a4a);
  }

  if (t.warcry && due(st, 'warcry', t.warcry.every, now)) {
    for (const o of ctx.zombies) {
      if (o.hp > 0 && o.root.position.distanceTo(p) < t.warcry.r) o.root.userData.frenzyUntil = now + 4;
    }
    ctx.fx.spawnHitRing(p.clone(), 0xd946ef, 0.12);
    ctx.vfx?.dustRing(p, t.warcry.r * 0.7, 0x5a3a5a);
  }

  if (t.summon && target && dist < 30 && due(st, 'summon', t.summon.every, now)) {
    ctx.fx.spawnBloodBurst(p.clone().setY(1), 1.3, 0x3b2a1a);
    for (let i = 0; i < t.summon.n; i++) {
      const a = (i / t.summon.n) * Math.PI * 2 + Math.random();
      ctx.spawnZombieAt(t.summon.kind, p.x + Math.cos(a) * 2.5, p.z + Math.sin(a) * 2.5);
    }
  }

  if (t.volley && target && dist < 16 && z.attackAnim <= 0 && due(st, 'volley', t.volley.every, now)) {
    const dir = target.root.position.clone().sub(p).setY(0);
    const len = dir.length();
    for (let i = 0; i < t.volley.n; i++) {
      const spread = (i - (t.volley.n - 1) / 2) * 0.22;
      const aim = p.clone().add(dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread).setLength(len + (Math.random() - 0.5) * 2));
      ctx.spits.push(createAcidSpit(ctx.scene, p, aim, z.attackDamage * t.volley.mul));
    }
    ctx.playSfx(z, 'attack');
  }

  if (t.nova && target && dist < t.nova.r + 3 && due(st, 'nova', t.nova.every, now)) {
    const at = p.clone();
    const r = t.nova.r;
    const dmg = z.attackDamage * t.nova.mul;
    const color = def.color;
    ctx.fx.spawnWarnRing(at, r, color, 1.1);
    queue.push({
      at: now + 1.1,
      run: () => {
        const c = z.hp > 0 ? z.root.position.clone() : at;
        ctx.vfx?.sparks(c.clone().setY(1.2), 26, 0xd8ecff, 9);
        ctx.vfx?.dustRing(c, r, 0x3a4a5a);
        ctx.shake(0.3);
        for (const op of ctx.squad) {
          if (!op.alive || op.root.position.distanceTo(c) > r) continue;
          ctx.vfx?.bolt(c.clone().setY(1.4), op.root.position.clone().setY(1.1), 0xd8e8ff, 0.05, 0.14, 6);
          if (ctx.damageOperative(op, dmg, c)) stun(op, ctx.nowSec + 0.7);
        }
      },
    });
  }

  if (t.quake && target && dist < t.quake.r + 2 && due(st, 'quake', t.quake.every, now)) {
    const at = p.clone();
    const r = t.quake.r;
    const dmg = z.attackDamage * t.quake.mul;
    ctx.fx.spawnWarnRing(at, r, 0xb4501e, 1.3);
    queue.push({
      at: now + 1.3,
      run: () => {
        const c = z.hp > 0 ? z.root.position.clone() : at;
        ctx.vfx?.dustRing(c, r);
        ctx.vfx?.debris(c, 16, r * 0.4);
        ctx.shake(0.6);
        for (const op of ctx.squad) {
          if (!op.alive || op.root.position.distanceTo(c) > r) continue;
          ctx.damageOperative(op, dmg, c);
          knock(op, c, 2.2, ctx);
          stun(op, ctx.nowSec + 0.5);
        }
      },
    });
  }

  if (t.meteor && target && dist < 24 && due(st, 'meteor', t.meteor.every, now)) {
    const alive = ctx.squad.filter((o) => o.alive && o.root.position.distanceTo(p) < 24);
    const r = t.meteor.r;
    const dmg = z.attackDamage * t.meteor.mul;
    for (let i = 0; i < t.meteor.n; i++) {
      const base = alive[i % Math.max(1, alive.length)]?.root.position ?? target.root.position;
      const at = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7)).setY(0);
      const lead = 1.3 + i * 0.18;
      ctx.fx.spawnWarnRing(at, r, 0xff4a1a, lead);
      queue.push({
        at: now + lead,
        run: () => {
          ctx.vfx?.explosion(at.clone(), r * 0.8, 0xff7a30);
          ctx.hazards.fire(at.x, at.z, r * 0.7, 6, 3);
          ctx.shake(0.25);
          for (const op of ctx.squad) {
            if (op.alive && op.root.position.distanceTo(at) <= r) {
              ctx.damageOperative(op, dmg, at);
              knock(op, at, 1.2, ctx);
            }
          }
        },
      });
    }
  }
}

/** Death traits: blast, split. Called before the corpse is removed. */
export function zombieTraitDeath(z: ZombieVisual, ctx: ZombieCombatCtx): void {
  const def = typeOf(z);
  if (!def) return;
  const t = def.traits;
  const o = z.root.position.clone();
  z.root.visible = true;
  if (t.blast) {
    const r = t.blast.r;
    ctx.vfx?.explosion(o.clone(), r * 0.7, 0xff8a30);
    ctx.fx.spawnWarnRing(o.clone(), r, 0xff5a1a, 0.2);
    ctx.shake(0.4);
    for (const op of ctx.squad) {
      if (!op.alive) continue;
      const d = op.root.position.distanceTo(o);
      if (d > r) continue;
      ctx.damageOperative(op, z.attackDamage * t.blast.mul * (1 - (d / r) * 0.5), o);
      knock(op, o, 1.4, ctx);
    }
    for (const other of ctx.zombies) {
      if (other !== z && other.hp > 0 && other.root.position.distanceTo(o) < r) ctx.damageZombie(other, 6, o);
    }
  }
  if (t.split) {
    for (let i = 0; i < t.split.n; i++) {
      const a = (i / t.split.n) * Math.PI * 2;
      ctx.spawnZombieAt(t.split.kind, o.x + Math.cos(a) * 1.4, o.z + Math.sin(a) * 1.4);
    }
    ctx.fx.spawnBloodBurst(o.clone().setY(1), 1.6, 0x6a1010);
  }
}
