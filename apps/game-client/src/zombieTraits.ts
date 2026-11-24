import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import { createAcidSpit, knock, slowOperative, stun, type ZombieCombatCtx } from './zombieCombat';
import { ZOMBIE_TYPE_BY_ID, type ZombieTraits, type ZombieTypeDef } from './zombieTypes';
import { queueZombieAnim } from './avatars';
import { SEG } from './zombieAnim';

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
  /** burrowed: hidden & untouchable until then */
  burrowUntil?: number;
  split?: boolean;
  growth?: number;
  /** shield bubble hp left (0 = popped) */
  bubble?: number;
  bubbleMesh?: THREE.Mesh;
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

/** Incoming-damage multiplier from armor, phasing, burrowing, front shields and aegis. */
/**
 * `part` splits the multiplier for co-op, where a guest decides its own hits:
 *   'static'  — what the guest can know from the zombie's type alone (armour, front shield)
 *   'dynamic' — what only the host knows (aegis aura, phasing, burrowing)
 * 'all' (default) is the product of both, as used for hits resolved on this machine.
 */
export function traitDamageMul(z: ZombieVisual, now: number, hitDir?: THREE.Vector3, part: 'all' | 'static' | 'dynamic' = 'all'): number {
  // shielded by an aegis-bearer nearby (set on plain zombies too)
  const aegis = part !== 'static' && ((z.root.userData.aegisUntil as number | undefined) ?? 0) > now ? ((z.root.userData.aegisArmor as number | undefined) ?? 0) : 0;
  const t = typeOf(z)?.traits;
  if (!t) return 1 - aegis;
  const st = (z.root.userData as { trs?: TraitState }).trs;
  if (part !== 'static' && st && (st.phaseUntil > now || (st.burrowUntil ?? 0) > now)) return 0;
  if (part === 'dynamic') return 1 - Math.min(0.85, aegis);
  let m = 1 - Math.min(0.85, (t.armor ?? 0) + aegis);
  if (t.frontShield && hitDir && hitDir.lengthSq() > 0.01) {
    const fy = z.root.rotation.y;
    // knock direction points away from the shooter: facing the shot means a negative dot
    const facing = hitDir.x * Math.sin(fy) + hitDir.z * Math.cos(fy);
    if (facing < -0.3) m *= 1 - t.frontShield;
  }
  return m;
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
  // shield bubble soaks damage before the body takes it
  if (t.bubble) {
    if (st.bubble === undefined) st.bubble = z.maxHp * t.bubble.pct;
    const lost = st.lastHp - z.hp;
    if (lost > 1e-3 && st.bubble > 0 && z.hp > 0) {
      const soak = Math.min(st.bubble, lost);
      st.bubble -= soak;
      z.hp += soak;
      z.healthBar.setRatio(z.hp / z.maxHp);
      if (st.bubble <= 0) {
        st.next.bubble = now + t.bubble.every;
        ctx.vfx?.sparks(p.clone().setY(1.2), 22, def.color, 7);
        ctx.fx.spawnHitRing(p.clone(), def.color, 0.12);
      }
    } else if (st.bubble <= 0 && (st.next.bubble ?? 0) <= now) {
      st.bubble = z.maxHp * t.bubble.pct;
      ctx.vfx?.emit('smoke', p.x, 1.2, p.z, { vy: 0.4, life: 0.6, s0: 0.6, s1: 1.6, color: def.color, a: 0.3 });
    }
    syncBubble(z, st, def.color, t.bubble.pct);
  }
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

  tickNewTraits(z, def, st, target, dist, dt, ctx);
  tickRoundThree(z, def, st, target, dist, ctx);

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

/** The newer traits: leap, burrow, web, charge, aegis, grow, mitosis, screech. */
function tickNewTraits(z: ZombieVisual, def: ZombieTypeDef, st: TraitState, target: OperativeVisual | null, dist: number, dt: number, ctx: ZombieCombatCtx): void {
  const t = def.traits;
  const now = ctx.nowSec;
  const p = z.root.position;

  if (t.burrow) {
    if ((st.burrowUntil ?? 0) > now) {
      z.root.visible = false;
      return;
    }
    if (st.burrowUntil && st.burrowUntil <= now && !z.root.visible) {
      // surface right next to a hero
      z.root.visible = true;
      st.burrowUntil = 0;
      if (target) {
        const a = Math.random() * Math.PI * 2;
        const to = target.root.position.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2));
        const d = to.sub(p).setY(0);
        for (let i = 0; i < 8; i++) ctx.move(z.root, d.x / 8, d.z / 8, 0.5);
      }
      ctx.vfx?.debris(z.root.position.clone(), 12, 1.6);
      ctx.vfx?.dustRing(z.root.position, 2.2, 0x6a5040);
      z.root.userData.spawnUntil = now + 1.2;
      queueZombieAnim(z, { kind: 'spawn', dur: 1.2 });
      ctx.shake(0.12);
    } else if (target && dist > 6 && dist < 40 && due(st, 'burrow', t.burrow.every, now)) {
      st.burrowUntil = now + t.burrow.dur;
      ctx.vfx?.debris(p.clone(), 10, 1.2);
      ctx.vfx?.dustRing(p, 2, 0x6a5040);
      z.root.visible = false;
      return;
    }
  }

  if (t.leap && target && dist > 3.5 && dist < t.leap.range && z.attackAnim <= 0 && due(st, 'leap', t.leap.every, now)) {
    const land = target.root.position.clone().setY(0);
    const r = def.tier === 'boss' ? 3.6 : 2.2;
    const dmg = z.attackDamage * t.leap.mul;
    ctx.fx.spawnWarnRing(land, r, def.color, 0.75);
    queueZombieAnim(z, { kind: 'act', seg: z.kind === 'boss' || z.kind === 'tank' ? SEG.mJump : SEG.headbutt, dur: 0.9, priority: 2 });
    queue.push({
      at: now + 0.75,
      run: () => {
        if (z.hp <= 0) return;
        const d = land.clone().sub(z.root.position).setY(0);
        for (let i = 0; i < 10; i++) ctx.move(z.root, d.x / 10, d.z / 10, 0.5);
        ctx.vfx?.dustRing(z.root.position, r, 0x5a4a3a);
        ctx.shake(def.tier === 'boss' ? 0.4 : 0.15);
        for (const op of ctx.squad) {
          if (!op.alive || op.root.position.distanceTo(z.root.position) > r) continue;
          ctx.damageOperative(op, dmg, z.root.position);
          knock(op, z.root.position, 1.4, ctx);
        }
      },
    });
  }

  if (t.charge && target && dist > 4 && dist < t.charge.dist + 4 && z.attackAnim <= 0 && due(st, 'charge', t.charge.every, now)) {
    const dir = target.root.position.clone().sub(p).setY(0).normalize();
    const len = t.charge.dist;
    const dmg = z.attackDamage * t.charge.mul;
    // telegraph: rings along the line
    for (let k = 1; k <= 4; k++) ctx.fx.spawnWarnRing(p.clone().addScaledVector(dir, (len * k) / 4), 1.4, def.color, 0.8);
    z.root.rotation.y = Math.atan2(dir.x, dir.z);
    queueZombieAnim(z, { kind: 'act', seg: z.kind === 'boss' ? SEG.mRoar : SEG.scream, dur: 0.8, priority: 2 });
    queue.push({
      at: now + 0.85,
      run: () => {
        if (z.hp <= 0) return;
        const hit = new Set<OperativeVisual>();
        const steps = 16;
        for (let i = 0; i < steps; i++) {
          ctx.move(z.root, (dir.x * len) / steps, (dir.z * len) / steps, 0.6);
          for (const op of ctx.squad) {
            if (!op.alive || hit.has(op) || op.root.position.distanceTo(z.root.position) > 1.8) continue;
            hit.add(op);
            ctx.damageOperative(op, dmg, z.root.position);
            knock(op, z.root.position, 2.4, ctx);
            stun(op, ctx.nowSec + 0.4);
          }
        }
        ctx.vfx?.debris(z.root.position.clone(), 10, 1.2);
        ctx.shake(0.25);
      },
    });
  }

  if (t.web && target && dist < 14 && due(st, 'web', t.web.every, now)) {
    const at = target.root.position.clone().setY(0);
    const r = t.web.r;
    ctx.fx.spawnWarnRing(at, r, 0xe8e0d0, 0.7);
    ctx.vfx?.bolt(p.clone().setY(1), at.clone().setY(0.3), 0xe8e0d0, 0.04, 0.5, 4);
    queue.push({
      at: now + 0.7,
      run: () => {
        ctx.vfx?.dustRing(at, r, 0xd8d0c0);
        for (let i = 0; i < 10; i++) ctx.vfx?.emit('smoke', at.x + (Math.random() - 0.5) * r * 1.6, 0.1, at.z + (Math.random() - 0.5) * r * 1.6, { vy: 0.05, life: t.web!.dur, s0: 0.8, s1: 1, color: 0xe8e4d8, a: 0.35, spin: 0 });
        for (const op of ctx.squad) if (op.alive && op.root.position.distanceTo(at) < r) slowOperative(op, 0.35, ctx.nowSec + t.web!.dur);
      },
    });
  }

  if (t.screech && target && dist < t.screech.r && due(st, 'screech', t.screech.every, now)) {
    const r = t.screech.r;
    ctx.fx.spawnWarnRing(p.clone(), r, 0xf0c0ff, 0.6);
    queueZombieAnim(z, { kind: 'act', seg: SEG.scream, dur: 1, priority: 2 });
    ctx.playSfx(z, 'attack');
    queue.push({
      at: now + 0.6,
      run: () => {
        if (z.hp <= 0) return;
        ctx.vfx?.dustRing(z.root.position, r, 0x8a5a9a);
        for (const op of ctx.squad) if (op.alive && op.root.position.distanceTo(z.root.position) < r) stun(op, ctx.nowSec + 0.7);
      },
    });
  }

  if (t.aegis && due(st, 'aegis', 0.8, now)) {
    let n = 0;
    for (const o of ctx.zombies) {
      if (o === z || o.hp <= 0 || o.root.position.distanceTo(p) > t.aegis.r) continue;
      o.root.userData.aegisUntil = now + 1.2;
      o.root.userData.aegisArmor = t.aegis.armor;
      if (ctx.vfx && n++ < 6 && Math.random() < 0.3) ctx.vfx.bolt(p.clone().setY(1.6), o.root.position.clone().setY(1.4), 0xc8d8ff, 0.03, 0.2, 4);
    }
  }

  if (t.grow && (st.growth ?? 1) < t.grow.max && due(st, 'grow', t.grow.every, now)) {
    const g = Math.min(t.grow.max, (st.growth ?? 1) * 1.08);
    const k = g / (st.growth ?? 1);
    st.growth = g;
    z.root.scale.multiplyScalar(k);
    z.maxHp = Math.ceil(z.maxHp * k);
    z.hp = Math.min(z.maxHp, z.hp * k);
    z.attackDamage = Math.ceil(z.attackDamage * (1 + (k - 1) * 0.6));
    ctx.vfx?.emit('smoke', p.x, 1.2, p.z, { vy: 1, life: 0.6, s0: 0.5, s1: 1.2, color: def.color, a: 0.35 });
  }

  if (t.mitosis && !st.split && z.hp < z.maxHp * 0.5) {
    st.split = true;
    ctx.fx.spawnBloodBurst(p.clone().setY(1), 1.4, def.color);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      ctx.spawnZombieAt(def.base, p.x + Math.cos(a) * 1.6, p.z + Math.sin(a) * 1.6);
    }
  }
  void dt;
}

const bubbleGeo = new THREE.SphereGeometry(1, 20, 14);
const bubbleMats = new Map<number, THREE.MeshBasicMaterial>();
/** Show / hide / fade the bubble with how much shield is left. */
function syncBubble(z: ZombieVisual, st: TraitState, color: number, pct: number): void {
  const up = (st.bubble ?? 0) > 0;
  if (!up) {
    if (st.bubbleMesh) st.bubbleMesh.visible = false;
    return;
  }
  if (!st.bubbleMesh) {
    let mat = bubbleMats.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
      bubbleMats.set(color, mat);
    }
    st.bubbleMesh = new THREE.Mesh(bubbleGeo, mat);
    st.bubbleMesh.name = 'shieldBubble';
    st.bubbleMesh.position.y = 1.05;
    st.bubbleMesh.scale.set(0.95, 1.2, 0.95);
    z.root.add(st.bubbleMesh);
  }
  st.bubbleMesh.visible = true;
  const k = Math.max(0.35, (st.bubble ?? 0) / Math.max(1, z.maxHp * pct));
  st.bubbleMesh.scale.set(0.9 + 0.1 * k, 1.1 + 0.12 * k, 0.9 + 0.1 * k);
}

const rockGeo = new THREE.DodecahedronGeometry(0.35, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.95 });
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5a2a14, emissive: 0xff5a1a, emissiveIntensity: 0.9, roughness: 0.7 });
const barrelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 10);
const mineGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.14, 12);
const mineMat = new THREE.MeshStandardMaterial({ color: 0x2a2c26, metalness: 0.6, roughness: 0.5 });
const mineLedMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
const mineLedGeo = new THREE.SphereGeometry(0.07, 6, 4);

/** Thrower, mines. */
function tickRoundThree(z: ZombieVisual, def: ZombieTypeDef, st: TraitState, target: OperativeVisual | null, dist: number, ctx: ZombieCombatCtx): void {
  const t = def.traits;
  const now = ctx.nowSec;
  const p = z.root.position;

  if (t.thrower && target && dist > 4 && dist < t.thrower.range && z.attackAnim <= 0 && due(st, 'thrower', t.thrower.every, now)) {
    const th = t.thrower;
    // lead the target a little so standing still is punished, moving sideways is safe
    const land = target.root.position.clone().setY(0).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5));
    const from = p.clone().setY(2.2 * z.root.scale.y);
    const flight = 0.55 + dist * 0.035;
    const r = th.r;
    const dmg = z.attackDamage * th.mul;
    ctx.fx.spawnWarnRing(land, r, th.fire ? 0xff5a1a : 0xc8b8a0, flight + 0.25);
    queueZombieAnim(z, { kind: 'act', seg: SEG.headbutt, dur: 0.6, priority: 2 });
    const rock = new THREE.Mesh(th.fire ? barrelGeo : rockGeo, th.fire ? barrelMat : rockMat);
    rock.castShadow = true;
    rock.position.copy(from);
    rock.visible = false;
    ctx.scene.add(rock);
    const t0 = now + 0.25;
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      queue.push({
        at: t0 + flight * k,
        run: () => {
          rock.visible = true;
          rock.position.lerpVectors(from, land, k);
          rock.position.y = from.y * (1 - k) + Math.sin(k * Math.PI) * (3 + dist * 0.18);
          rock.rotation.set(k * 7, k * 5, 0);
          if (i < steps) return;
          ctx.scene.remove(rock);
          ctx.vfx?.debris(land.clone(), th.fire ? 8 : 12, r * 0.6);
          ctx.vfx?.dustRing(land, r, th.fire ? 0x6a2a10 : 0x6a5a4a);
          if (th.fire) {
            ctx.vfx?.explosion(land.clone(), r * 0.7, 0xff7a30);
            ctx.hazards.fire(land.x, land.z, r * 0.8, 5, 3);
          }
          ctx.shake(th.fire ? 0.25 : 0.12);
          for (const op of ctx.squad) {
            if (!op.alive || op.root.position.distanceTo(land) > r) continue;
            ctx.damageOperative(op, dmg, land);
            knock(op, land, 1.1, ctx);
          }
        },
      });
    }
  }

  if (t.mines && target && dist < 26 && due(st, 'mines', t.mines.every, now)) {
    for (let n = 0; n < t.mines.n; n++) {
      const a = Math.random() * Math.PI * 2;
      const off = n === 0 ? 0.8 : 2 + Math.random() * 3;
      const at = p.clone().add(new THREE.Vector3(Math.cos(a) * off, 0, Math.sin(a) * off)).setY(0);
      const g = new THREE.Group();
      const body = new THREE.Mesh(mineGeo, mineMat);
      body.position.y = 0.07;
      const led = new THREE.Mesh(mineLedGeo, mineLedMat);
      led.position.y = 0.17;
      g.add(body, led);
      g.position.copy(at);
      ctx.scene.add(g);
      const arm = now + 1.2;
      const life = arm + 7;
      const r = 2.6;
      const dmg = z.attackDamage * t.mines.mul;
      // poll: blink the LED, explode when a hero steps close (or when the fuse runs out)
      const poll = (tick: number) => {
        queue.push({
          at: tick,
          run: () => {
            led.visible = !led.visible || tick < arm;
            const near = tick >= arm && ctx.squad.some((op) => op.alive && op.root.position.distanceTo(at) < 1.6);
            if (!near && tick < life) {
              poll(tick + 0.2);
              return;
            }
            ctx.fx.spawnWarnRing(at, r, 0xff2020, 0.45);
            queue.push({
              at: tick + 0.45,
              run: () => {
                ctx.scene.remove(g);
                ctx.vfx?.explosion(at.clone(), r * 0.65, 0xff6a2a);
                ctx.shake(0.2);
                for (const op of ctx.squad) {
                  if (!op.alive || op.root.position.distanceTo(at) > r) continue;
                  ctx.damageOperative(op, dmg, at);
                  knock(op, at, 1.3, ctx);
                }
                for (const o of ctx.zombies) if (o.hp > 0 && o.root.position.distanceTo(at) < r) ctx.damageZombie(o, 5, at);
              },
            });
          },
        });
      };
      poll(now + 0.2);
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
