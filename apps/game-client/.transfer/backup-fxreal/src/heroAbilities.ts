import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { CombatFx } from './fx';
import type { OperativeId } from './roster';
import type { AbilitySlot } from './loadout';
import { applyStatus, type StatusId } from './statusEffects';
import type { SkillFx } from './skillFx';

/**
 * Per-hero Q / E / R abilities (8 heroes × 3 = 24), data-driven on a handful of
 * effect primitives: thrown grenades/flasks, novas, ground zones (fire / toxin /
 * cryo / heal), timed buffs, dashes, turrets, chain lightning, airstrikes and
 * piercing volleys. Each has its own animation cue, VFX colour and scaling.
 *
 * Level = permanent level (1–5, bought in the lobby) + run bonus (0–3, from
 * level-up cards). Every level: +16% power, +8% radius/duration, −6% cooldown.
 */

export type AbilityAnim = 'throw' | 'dash' | 'cast' | 'shout';
type ZoneKind = 'fire' | 'toxin' | 'cryo' | 'heal';

export type AbilityEffect =
  | { type: 'grenade'; radius: number; damage: number; status?: StatusId; statusPower?: number; zone?: ZoneSpec; cluster?: number; mesh?: 'frag' | 'bottle' | 'flask' | 'flash' }
  | { type: 'nova'; radius: number; damage: number; knock: number; status?: StatusId; statusPower?: number }
  | { type: 'zone'; at: 'self' | 'aim'; zone: ZoneSpec; follow?: boolean }
  | { type: 'heal'; radius: number; amount: number; revive?: boolean; zone?: ZoneSpec }
  | { type: 'buff'; dur: number; damage?: number; fireRate?: number; move?: number; armor?: number; crit?: number; squad?: boolean; nova?: number }
  | { type: 'dash'; dist: number; damage: number; invuln: number }
  | { type: 'turret'; dur: number; damage: number; rate: number; range: number; chain?: number }
  | { type: 'chain'; targets: number; damage: number; range: number; status?: StatusId }
  | { type: 'strike'; count: number; radius: number; damage: number; delay: number; spacing: number; status?: StatusId; zone?: ZoneSpec }
  | { type: 'volley'; shots: number };

interface ZoneSpec {
  kind: ZoneKind;
  radius: number;
  dps: number;
  dur: number;
}

export interface HeroAbilityDef {
  id: string;
  slot: AbilitySlot;
  name: string;
  desc: string;
  icon: string;
  color: number;
  cooldown: number;
  anim: AbilityAnim;
  effect: AbilityEffect;
}

const A = (d: HeroAbilityDef) => d;

export const HERO_ABILITIES: Record<OperativeId, Record<AbilitySlot, HeroAbilityDef>> = {
  ironclad: {
    q: A({ id: 'frag', slot: 'q', name: 'Parça Bombası', desc: 'Nişan noktasına el bombası; alan hasarı.', icon: '💣', color: 0xffa040, cooldown: 7, anim: 'throw', effect: { type: 'grenade', radius: 3.4, damage: 9, mesh: 'frag' } }),
    e: A({ id: 'bulwark', slot: 'e', name: 'Balistik Kalkan', desc: '5 sn %60 hasar azaltma, etrafı iter.', icon: '🛡', color: 0x6ea8ff, cooldown: 14, anim: 'shout', effect: { type: 'buff', dur: 5, armor: 0.6, nova: 3.5 } }),
    r: A({ id: 'kinetic_nova', slot: 'r', name: 'Kinetik Nova', desc: 'Büyük şok dalgası, ağır geri itme.', icon: '✸', color: 0x3dff9a, cooldown: 22, anim: 'cast', effect: { type: 'nova', radius: 7.5, damage: 14, knock: 3.2 } }),
  },
  breaker: {
    q: A({ id: 'breach_dash', slot: 'q', name: 'Kapı Kırma Hamlesi', desc: 'İleri atıl, yoldakileri ez.', icon: '➤', color: 0xfbbf24, cooldown: 6, anim: 'dash', effect: { type: 'dash', dist: 7, damage: 7, invuln: 0.45 } }),
    e: A({ id: 'flashbang', slot: 'e', name: 'Flaş Bombası', desc: 'Kör eder: zombileri neredeyse durdurur.', icon: '✦', color: 0xfff6c0, cooldown: 12, anim: 'throw', effect: { type: 'grenade', radius: 5, damage: 2, status: 'chill', statusPower: 3.5, mesh: 'flash' } }),
    r: A({ id: 'breach_overdrive', slot: 'r', name: 'Hücum Modu', desc: '6 sn ateş hızı ×1.8, hasar ×1.3.', icon: '⚡', color: 0xff9f1a, cooldown: 24, anim: 'shout', effect: { type: 'buff', dur: 6, fireRate: 1.8, damage: 1.3, move: 1.15 } }),
  },
  warden: {
    q: A({ id: 'sentry', slot: 'q', name: 'Nöbetçi Taret', desc: '12 sn otomatik ateş eden taret.', icon: '⌖', color: 0x22d3ee, cooldown: 16, anim: 'cast', effect: { type: 'turret', dur: 12, damage: 1.3, rate: 0.14, range: 15 } }),
    e: A({ id: 'suppression', slot: 'e', name: 'Baskı Ateşi', desc: 'Nişan alanını dondurucu baskıyla yavaşlat.', icon: '❄', color: 0x9be7ff, cooldown: 13, anim: 'throw', effect: { type: 'zone', at: 'aim', zone: { kind: 'cryo', radius: 5, dps: 1.5, dur: 6 } } }),
    r: A({ id: 'airstrike', slot: 'r', name: 'Hava Saldırısı', desc: 'Nişan hattına 7 patlamalı bombardıman.', icon: '✈', color: 0xff6a2a, cooldown: 28, anim: 'shout', effect: { type: 'strike', count: 7, radius: 3.2, damage: 15, delay: 0.9, spacing: 2.6 } }),
  },
  havoc: {
    q: A({ id: 'molotov', slot: 'q', name: 'Molotof', desc: 'Yanan alan bırakır.', icon: '🔥', color: 0xff5a1f, cooldown: 8, anim: 'throw', effect: { type: 'grenade', radius: 2.6, damage: 3, status: 'burn', statusPower: 2, zone: { kind: 'fire', radius: 3.2, dps: 4.5, dur: 5 }, mesh: 'bottle' } }),
    e: A({ id: 'flame_nova', slot: 'e', name: 'Alev Halkası', desc: 'Etrafı tutuşturan alev patlaması.', icon: '◎', color: 0xff7a2a, cooldown: 11, anim: 'cast', effect: { type: 'nova', radius: 5.2, damage: 6, knock: 1.4, status: 'burn', statusPower: 3 } }),
    r: A({ id: 'napalm', slot: 'r', name: 'Napalm', desc: 'Nişan hattını alev denizine çevir.', icon: '☄', color: 0xff3d1a, cooldown: 26, anim: 'shout', effect: { type: 'strike', count: 6, radius: 2.8, damage: 8, delay: 0.7, spacing: 2.4, status: 'burn', zone: { kind: 'fire', radius: 2.6, dps: 5, dur: 5 } } }),
  },
  valkyrie: {
    q: A({ id: 'med_pulse', slot: 'q', name: 'Tıbbi Darbe', desc: 'Ekibi anında %30 iyileştir.', icon: '✚', color: 0x5ad46a, cooldown: 10, anim: 'cast', effect: { type: 'heal', radius: 12, amount: 0.3 } }),
    e: A({ id: 'adrenaline', slot: 'e', name: 'Adrenalin İğnesi', desc: 'Ekip: hız ×1.3, ateş hızı ×1.3.', icon: '➶', color: 0x38bdf8, cooldown: 16, anim: 'shout', effect: { type: 'buff', dur: 6, move: 1.3, fireRate: 1.3, squad: true } }),
    r: A({ id: 'guardian_field', slot: 'r', name: 'Koruyucu Alan', desc: 'İyileştiren alan, düşenleri kaldırır.', icon: '❖', color: 0x7cffb2, cooldown: 30, anim: 'cast', effect: { type: 'heal', radius: 14, amount: 0.4, revive: true, zone: { kind: 'heal', radius: 6, dps: 6, dur: 8 } } }),
  },
  ghost: {
    q: A({ id: 'shadow_blink', slot: 'q', name: 'Gölge Sıçrayışı', desc: 'Işınlan, kısa süre dokunulmaz ol.', icon: '◌', color: 0x88eeff, cooldown: 5, anim: 'dash', effect: { type: 'dash', dist: 8.5, damage: 0, invuln: 0.8 } }),
    e: A({ id: 'hunters_mark', slot: 'e', name: 'Avcı İşareti', desc: '7 sn kritik +%35, hasar ×1.25.', icon: '◎', color: 0xc4b5fd, cooldown: 15, anim: 'shout', effect: { type: 'buff', dur: 7, crit: 0.35, damage: 1.25 } }),
    r: A({ id: 'piercing_volley', slot: 'r', name: 'Delici Yaylım', desc: '14 mermi her şeyi delip geçer.', icon: '⇶', color: 0x88eeff, cooldown: 20, anim: 'cast', effect: { type: 'volley', shots: 14 } }),
  },
  tox: {
    q: A({ id: 'toxin_flask', slot: 'q', name: 'Zehir Şişesi', desc: 'Zehirli bulut bırakan şişe.', icon: '⚗', color: 0x9cff2e, cooldown: 7, anim: 'throw', effect: { type: 'grenade', radius: 2.2, damage: 2, status: 'toxin', statusPower: 2.5, zone: { kind: 'toxin', radius: 3.6, dps: 3.5, dur: 6 }, mesh: 'flask' } }),
    e: A({ id: 'corrosive_aura', slot: 'e', name: 'Aşındırıcı Aura', desc: 'Seni takip eden zehir halkası.', icon: '☣', color: 0x84cc16, cooldown: 14, anim: 'cast', effect: { type: 'zone', at: 'self', follow: true, zone: { kind: 'toxin', radius: 3.6, dps: 3, dur: 7 } } }),
    r: A({ id: 'plague_burst', slot: 'r', name: 'Veba Patlaması', desc: 'Geniş zehir dalgası.', icon: '✺', color: 0xb6ff5a, cooldown: 24, anim: 'shout', effect: { type: 'nova', radius: 8.5, damage: 7, knock: 1, status: 'toxin', statusPower: 4 } }),
  },
  spark: {
    q: A({ id: 'tesla_coil', slot: 'q', name: 'Tesla Bobini', desc: '3 hedefe sıçrayan elektrik kulesi.', icon: 'ϟ', color: 0x7cd4ff, cooldown: 15, anim: 'cast', effect: { type: 'turret', dur: 10, damage: 2.2, rate: 0.45, range: 9, chain: 3 } }),
    e: A({ id: 'arc_chain', slot: 'e', name: 'Ark Zinciri', desc: '6 zombiye sıçrayan yıldırım.', icon: '⚡', color: 0x9be7ff, cooldown: 9, anim: 'cast', effect: { type: 'chain', targets: 6, damage: 6, range: 11 } }),
    r: A({ id: 'emp', slot: 'r', name: 'EMP Aşırı Yük', desc: 'Dev elektrik patlaması, sersemletir.', icon: '✹', color: 0x5cc8ff, cooldown: 25, anim: 'shout', effect: { type: 'nova', radius: 8.5, damage: 9, knock: 1.6, status: 'chill', statusPower: 4 } }),
  },
};

export function heroAbility(hero: OperativeId, slot: AbilitySlot): HeroAbilityDef {
  return (HERO_ABILITIES[hero] ?? HERO_ABILITIES.ironclad)[slot];
}

export const levelPower = (lvl: number) => 1 + 0.16 * (lvl - 1);
export const levelSize = (lvl: number) => 1 + 0.08 * (lvl - 1);
export const levelCd = (lvl: number) => Math.max(0.55, 1 - 0.06 * (lvl - 1));

// ---------------------------------------------------------------------------

export interface HeroAbilityContext {
  scene: THREE.Scene;
  fx: CombatFx;
  player: OperativeVisual;
  squad: OperativeVisual[];
  zombies: ZombieVisual[];
  aim: THREE.Vector3;
  damageZombie: (z: ZombieVisual, dmg: number, at: THREE.Vector3, dir: THREE.Vector3) => void;
  /** move with collision (dash) */
  moveWithCollision: (obj: THREE.Object3D, dx: number, dz: number, radius: number) => void;
  revive: (op: OperativeVisual) => void;
  addPierceShots: (n: number) => void;
  shake: (amount: number) => void;
  anim: (op: OperativeVisual, kind: 'ability' | 'dash' | 'cast') => void;
  sfx: (kind: 'throw' | 'boom' | 'zap' | 'heal' | 'buff') => void;
  /** global ability power (card mods) */
  powerMult: () => number;
  aoeMult: () => number;
  cdrMult: () => number;
  /** shared particle / explosion FX (optional) */
  vfx?: SkillFx;
}

export interface HeroBuffs {
  damage: number;
  fireRate: number;
  move: number;
  armor: number;
  crit: number;
}

interface Buff extends HeroBuffs {
  until: number;
  targets: Set<OperativeVisual>;
}

interface Zone {
  kind: ZoneKind;
  mesh: THREE.Mesh;
  radius: number;
  dps: number;
  life: number;
  max: number;
  tick: number;
  follow: OperativeVisual | null;
}

interface Thrown {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  onLand: (at: THREE.Vector3) => void;
}

interface Turret {
  group: THREE.Group;
  head: THREE.Object3D;
  life: number;
  cd: number;
  def: Extract<AbilityEffect, { type: 'turret' }>;
  power: number;
  range: number;
  color: number;
}

interface Pending {
  at: number;
  run: () => void;
}

interface Bolt {
  line: THREE.Line;
  life: number;
}

interface Expanding {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  radius: number;
}

const ZONE_COLOR: Record<ZoneKind, number> = { fire: 0xff5a1f, toxin: 0x84cc16, cryo: 0x9be7ff, heal: 0x5ad46a };
const ZONE_STATUS: Partial<Record<ZoneKind, StatusId>> = { fire: 'burn', toxin: 'toxin', cryo: 'chill' };

export interface HeroAbilityRuntime {
  levels: Record<AbilitySlot, number>;
  bonus: Record<AbilitySlot, number>;
  cooldowns: Record<AbilitySlot, number>;
  defs: Record<AbilitySlot, HeroAbilityDef>;
  cast: (slot: AbilitySlot, now: number) => boolean;
  update: (dt: number, now: number) => void;
  buffsFor: (op: OperativeVisual, now: number) => HeroBuffs;
  maxCooldown: (slot: AbilitySlot) => number;
  level: (slot: AbilitySlot) => number;
  dispose: () => void;
}

export function createHeroAbilityRuntime(
  hero: OperativeId,
  levels: Record<AbilitySlot, number>,
  ctx: HeroAbilityContext,
): HeroAbilityRuntime {
  const { scene, fx } = ctx;
  const defs = HERO_ABILITIES[hero] ?? HERO_ABILITIES.ironclad;
  const bonus: Record<AbilitySlot, number> = { q: 0, e: 0, r: 0 };
  const cooldowns: Record<AbilitySlot, number> = { q: 0, e: 0, r: 0 };
  const buffs: Buff[] = [];
  const zones: Zone[] = [];
  const thrown: Thrown[] = [];
  const turrets: Turret[] = [];
  const pending: Pending[] = [];
  const bolts: Bolt[] = [];
  const rings: Expanding[] = [];
  let shieldBubble: THREE.Mesh | null = null;
  let clock = 0;

  // shared resources
  const discGeo = new THREE.CircleGeometry(1, 40);
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
  const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  const fragGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const bottleGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.26, 8);
  const flaskGeo = new THREE.SphereGeometry(0.12, 10, 8);
  const addMat = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const solid = (color: number, emissive = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4, emissive, emissiveIntensity: emissive ? 1.2 : 0 });
  const owned: THREE.Material[] = [];
  const keep = <T extends THREE.Material>(m: T) => (owned.push(m), m);

  const lvl = (slot: AbilitySlot) => Math.min(8, levels[slot] + bonus[slot]);
  const maxCooldown = (slot: AbilitySlot) => defs[slot].cooldown * levelCd(lvl(slot)) * ctx.cdrMult();

  const forEachZombieIn = (at: THREE.Vector3, r: number, fn: (z: ZombieVisual, d: number) => void) => {
    const r2 = r * r;
    for (const z of ctx.zombies) {
      if (z.hp <= 0) continue;
      const dx = z.root.position.x - at.x;
      const dz = z.root.position.z - at.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) fn(z, Math.sqrt(d2));
    }
  };

  const shockRing = (at: THREE.Vector3, radius: number, color: number, life = 0.45) => {
    const mesh = new THREE.Mesh(ringGeo, keep(addMat(color, 0.9)));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.12, at.z);
    mesh.scale.setScalar(0.2);
    scene.add(mesh);
    rings.push({ mesh, life, max: life, radius });
    const disc = new THREE.Mesh(discGeo, keep(addMat(color, 0.35)));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(at.x, 0.1, at.z);
    disc.scale.setScalar(0.2);
    scene.add(disc);
    rings.push({ mesh: disc, life: life * 0.8, max: life * 0.8, radius: radius * 0.9 });
  };

  const explode = (at: THREE.Vector3, radius: number, damage: number, color: number, status?: StatusId, statusPower = 2, knock = 0.8) => {
    shockRing(at, radius, color);
    fx.spawnHitRing(at.clone().setY(0.2), color, 0.2);
    if (ctx.vfx) {
      const fiery = color === 0xffa040 || color === 0xff5a1f || color === 0xff6a2a || color === 0xff3d1a || color === 0xff7a2a || color === 0xff9f1a;
      if (fiery) ctx.vfx.explosion(at, radius * 0.75, color);
      else {
        ctx.vfx.emit('flash', at.x, 1, at.z, { life: 0.2, s0: radius * 1.6, s1: radius * 2.2, color, spin: 0, a: 0.7 });
        ctx.vfx.sparks(at, 18, color, radius * 2.5);
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = (0.6 + Math.random() * 0.4) * radius * 2.6;
          ctx.vfx.emit('elec', at.x, 0.6, at.z, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: Math.random() * 2, life: 0.45, s0: 0.6, s1: 0.1, color, drag: 3 });
        }
        ctx.vfx.flashLight(at, color, 14, 0.25);
      }
    } else fx.spawnBloodBurst(at.clone().setY(0.8), 1.8, color);
    ctx.sfx('boom');
    ctx.shake(Math.min(0.5, 0.12 + radius * 0.04));
    forEachZombieIn(at, radius, (z, d) => {
      const dir = z.root.position.clone().sub(at).setY(0);
      if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
      dir.normalize();
      const fall = 1 - (d / radius) * 0.45;
      ctx.damageZombie(z, damage * fall, z.root.position.clone().setY(1.1), dir);
      z.root.position.addScaledVector(dir, knock * fall);
      if (status) applyStatus(z, status, statusPower);
    });
  };

  const addZone = (at: THREE.Vector3, spec: ZoneSpec, power: number, size: number, follow: OperativeVisual | null) => {
    const color = ZONE_COLOR[spec.kind];
    const mesh = new THREE.Mesh(discGeo, keep(addMat(color, 0.32)));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.08, at.z);
    const radius = spec.radius * size * ctx.aoeMult();
    mesh.scale.setScalar(radius);
    const edge = new THREE.Mesh(ringGeo, keep(addMat(color, 0.75)));
    edge.position.z = 0.01;
    mesh.add(edge);
    scene.add(mesh);
    const dur = spec.dur * size;
    zones.push({ kind: spec.kind, mesh, radius, dps: spec.dps * power, life: dur, max: dur, tick: 0, follow });
  };

  const throwTo = (target: THREE.Vector3, kind: 'frag' | 'bottle' | 'flask' | 'flash', color: number, onLand: (at: THREE.Vector3) => void) => {
    const from = ctx.player.root.position.clone().setY(1.5);
    const to = target.clone().setY(0.15);
    const geo = kind === 'bottle' ? bottleGeo : kind === 'flask' ? flaskGeo : fragGeo;
    const mesh = new THREE.Mesh(geo, keep(solid(kind === 'frag' ? 0x3a4030 : kind === 'flash' ? 0xd8dde2 : 0x2a3a20, kind === 'frag' ? 0 : color)));
    if (kind === 'bottle') {
      const flame = new THREE.Mesh(fragGeo, keep(addMat(0xff8a2a, 0.9)));
      flame.position.y = 0.16;
      flame.scale.setScalar(0.6);
      mesh.add(flame);
    }
    mesh.position.copy(from);
    scene.add(mesh);
    const dist = from.distanceTo(to);
    thrown.push({ mesh, from, to, t: 0, dur: THREE.MathUtils.clamp(0.25 + dist * 0.035, 0.3, 0.75), onLand });
    ctx.sfx('throw');
  };

  const aimPoint = (maxDist: number) => {
    const p = ctx.player.root.position;
    const d = ctx.aim.clone().sub(p).setY(0);
    if (d.length() > maxDist) d.setLength(maxDist);
    return p.clone().add(d).setY(0);
  };

  const zap = (from: THREE.Vector3, to: THREE.Vector3, color: number) => {
    if (ctx.vfx) {
      ctx.vfx.bolt(from, to, color, 0.12, 0.16, 9);
      return;
    }
    const pts: THREE.Vector3[] = [];
    const seg = 7;
    for (let i = 0; i <= seg; i++) {
      const p = from.clone().lerp(to, i / seg);
      if (i > 0 && i < seg) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5));
      pts.push(p);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false, blending: THREE.AdditiveBlending })));
    scene.add(line);
    bolts.push({ line, life: 0.14 });
  };

  const chainFrom = (origin: THREE.Vector3, targets: number, damage: number, range: number, color: number, status?: StatusId) => {
    const hit = new Set<ZombieVisual>();
    let cur = origin.clone();
    for (let i = 0; i < targets; i++) {
      let best: ZombieVisual | null = null;
      let bestD = range;
      for (const z of ctx.zombies) {
        if (z.hp <= 0 || hit.has(z)) continue;
        const d = z.root.position.distanceTo(cur);
        if (d < bestD) {
          bestD = d;
          best = z;
        }
      }
      if (!best) break;
      hit.add(best);
      const to = best.root.position.clone().setY(1.2);
      zap(cur.clone().setY(Math.max(1, cur.y)), to, color);
      const dir = to.clone().sub(cur).setY(0).normalize();
      ctx.damageZombie(best, damage * (1 - i * 0.08), to, dir);
      applyStatus(best, status ?? 'chill', 1.2);
      fx.spawnHitRing(to, color, 1.1);
      cur = to;
      range = Math.max(5, range * 0.85);
    }
    if (hit.size) ctx.sfx('zap');
    return hit.size;
  };

  const buildTurret = (color: number, tesla: boolean) => {
    const group = new THREE.Group();
    const legMat = keep(solid(0x2a2e33));
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 6), legMat);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.25, 0.4, Math.sin(a) * 0.25);
      leg.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      group.add(leg);
    }
    const head = new THREE.Group();
    head.position.y = 0.95;
    if (tesla) {
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.6, 10), keep(solid(0x3a4250, color)));
      const orb = new THREE.Mesh(sphereGeo, keep(addMat(color, 0.9)));
      orb.scale.setScalar(0.2);
      orb.position.y = 0.45;
      head.add(coil, orb);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.5), keep(solid(0x30363c)));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), keep(solid(0x15181b)));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.45;
      const eye = new THREE.Mesh(sphereGeo, keep(addMat(color, 1)));
      eye.scale.setScalar(0.05);
      eye.position.set(0, 0.08, 0.26);
      head.add(body, barrel, eye);
    }
    group.add(head);
    group.traverse((o) => (o.castShadow = true));
    return { group, head };
  };

  const setBuff = (eff: Extract<AbilityEffect, { type: 'buff' }>, power: number, size: number, now: number, color: number) => {
    const targets = new Set<OperativeVisual>(eff.squad ? ctx.squad.filter((s) => s.alive) : [ctx.player]);
    const scale = (v: number | undefined, base: number) => (v === undefined ? base : base + (v - base) * power);
    buffs.push({
      until: now + eff.dur * size,
      targets,
      damage: scale(eff.damage, 1),
      fireRate: scale(eff.fireRate, 1),
      move: scale(eff.move, 1),
      armor: Math.min(0.85, (eff.armor ?? 0) * (0.85 + 0.15 * power)),
      crit: (eff.crit ?? 0) * power,
    });
    for (const t of targets) fx.spawnHitRing(t.root.position, color, 0.15);
    if (eff.nova) explode(ctx.player.root.position, eff.nova * size, 2 * power, color, undefined, 2, 2.2);
    if (eff.armor) {
      if (!shieldBubble) {
        shieldBubble = new THREE.Mesh(sphereGeo, keep(addMat(color, 0.18)));
        shieldBubble.scale.set(1.1, 1.4, 1.1);
        scene.add(shieldBubble);
      }
      shieldBubble.userData.until = now + eff.dur * size;
    }
    ctx.sfx('buff');
  };

  const cast = (slot: AbilitySlot, now: number): boolean => {
    const p = ctx.player;
    if (!p.alive || cooldowns[slot] > 0) return false;
    const def = defs[slot];
    const L = lvl(slot);
    const power = levelPower(L) * ctx.powerMult();
    const size = levelSize(L);
    const eff = def.effect;
    cooldowns[slot] = maxCooldown(slot);

    ctx.anim(p, def.anim === 'throw' ? 'ability' : def.anim === 'dash' ? 'dash' : 'cast');

    switch (eff.type) {
      case 'grenade': {
        const target = aimPoint(16);
        const land = (at: THREE.Vector3) => {
          explode(at, eff.radius * size * ctx.aoeMult(), eff.damage * power, def.color, eff.status, (eff.statusPower ?? 2) * power, eff.mesh === 'flash' ? 0.2 : 1);
          if (eff.zone) addZone(at, eff.zone, power, size, null);
          if (eff.mesh === 'flash') {
            const flash = new THREE.PointLight(0xffffff, 60, 14, 2);
            flash.position.copy(at).setY(2);
            scene.add(flash);
            pending.push({ at: clock + 0.12, run: () => scene.remove(flash) });
          }
        };
        throwTo(target, eff.mesh ?? 'frag', def.color, land);
        break;
      }
      case 'nova': {
        const r = eff.radius * size * ctx.aoeMult();
        explode(p.root.position, r, eff.damage * power, def.color, eff.status, (eff.statusPower ?? 2) * power, eff.knock);
        pending.push({ at: clock + 0.12, run: () => shockRing(p.root.position, r * 1.08, def.color, 0.55) });
        break;
      }
      case 'zone': {
        const at = eff.at === 'self' ? p.root.position.clone() : aimPoint(14);
        if (eff.at === 'aim') throwTo(at, 'flask', def.color, (pos) => addZone(pos, eff.zone, power, size, null));
        else addZone(at, eff.zone, power, size, eff.follow ? p : null);
        break;
      }
      case 'heal': {
        const r = eff.radius * size;
        for (const op of ctx.squad) {
          const d = op.root.position.distanceTo(p.root.position);
          if (d > r) continue;
          if (!op.alive) {
            if (eff.revive) ctx.revive(op);
            continue;
          }
          op.hp = Math.min(op.maxHp, op.hp + op.maxHp * eff.amount * (0.8 + 0.2 * power));
          op.healthBar.setRatio(op.hp / op.maxHp);
          fx.spawnHitRing(op.root.position, def.color, 0.15);
          fx.spawnBloodBurst(op.root.position.clone().setY(1.2), 0.9, def.color);
        }
        shockRing(p.root.position, r * 0.6, def.color, 0.6);
        if (eff.zone) addZone(p.root.position, eff.zone, power, size, p);
        ctx.sfx('heal');
        break;
      }
      case 'buff':
        setBuff(eff, power, size, now, def.color);
        break;
      case 'dash': {
        const dir = ctx.aim.clone().sub(p.root.position).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1).applyQuaternion(p.root.quaternion);
        dir.normalize();
        const start = p.root.position.clone();
        const steps = 10;
        const dist = eff.dist * size;
        for (let i = 0; i < steps; i++) ctx.moveWithCollision(p.root, (dir.x * dist) / steps, (dir.z * dist) / steps, 0.45);
        const end = p.root.position.clone();
        p.invuln = Math.max(p.invuln, eff.invuln * size);
        // afterimage trail
        for (let i = 0; i < 5; i++) {
          const at = start.clone().lerp(end, i / 5);
          pending.push({ at: clock + i * 0.02, run: () => shockRing(at, 0.9, def.color, 0.3) });
        }
        if (ctx.vfx) {
          for (let i = 0; i < 24; i++) {
            const at = start.clone().lerp(end, Math.random());
            ctx.vfx.emit('elec', at.x, 0.4 + Math.random() * 1.6, at.z, { vx: -dir.x * 3, vz: -dir.z * 3, life: 0.4, s0: 0.5, s1: 0.05, color: def.color });
          }
          ctx.vfx.sparks(end, 10, def.color, 4);
        }
        if (eff.damage > 0) {
          const seg = end.clone().sub(start);
          const len = Math.max(0.01, seg.length());
          for (const z of ctx.zombies) {
            if (z.hp <= 0) continue;
            const rel = z.root.position.clone().sub(start);
            const t = THREE.MathUtils.clamp(rel.dot(seg) / (len * len), 0, 1);
            const closest = start.clone().addScaledVector(seg, t);
            if (closest.distanceTo(z.root.position) < 1.6) {
              const side = z.root.position.clone().sub(closest).setY(0).normalize();
              ctx.damageZombie(z, eff.damage * power, z.root.position.clone().setY(1.1), side);
              z.root.position.addScaledVector(side, 1.4);
            }
          }
          ctx.shake(0.25);
        }
        break;
      }
      case 'turret': {
        const at = aimPoint(6);
        const tesla = !!eff.chain;
        const { group, head } = buildTurret(def.color, tesla);
        group.position.copy(at);
        scene.add(group);
        shockRing(at, 1.6, def.color, 0.4);
        turrets.push({ group, head, life: eff.dur * size, cd: 0.3, def: eff, power, range: eff.range * size, color: def.color });
        break;
      }
      case 'chain':
        chainFrom(p.root.position.clone().setY(1.4), Math.round(eff.targets * size), eff.damage * power, eff.range * size, def.color, eff.status);
        shockRing(p.root.position, 2, def.color, 0.3);
        break;
      case 'strike': {
        const dir = ctx.aim.clone().sub(p.root.position).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
        dir.normalize();
        const startAt = p.root.position.clone().addScaledVector(dir, 3);
        const n = Math.round(eff.count * size);
        for (let i = 0; i < n; i++) {
          const at = startAt.clone().addScaledVector(dir, i * eff.spacing);
          at.x += (Math.random() - 0.5) * 1.2;
          at.z += (Math.random() - 0.5) * 1.2;
          const r = eff.radius * size * ctx.aoeMult();
          fx.spawnWarnRing(at, r, def.color, eff.delay + i * 0.12);
          pending.push({
            at: clock + eff.delay + i * 0.12,
            run: () => {
              explode(at, r, eff.damage * power, def.color, eff.status, 2.5 * power, 1.2);
              if (eff.zone) addZone(at, eff.zone, power, size, null);
            },
          });
        }
        ctx.sfx('buff');
        break;
      }
      case 'volley':
        ctx.addPierceShots(Math.round(eff.shots * size));
        shockRing(p.root.position, 1.8, def.color, 0.35);
        ctx.sfx('buff');
        break;
    }
    return true;
  };

  const update = (dt: number, now: number) => {
    clock += dt;
    for (const s of ['q', 'e', 'r'] as AbilitySlot[]) cooldowns[s] = Math.max(0, cooldowns[s] - dt);

    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i]!.at <= clock) {
        const job = pending[i]!;
        pending.splice(i, 1);
        job.run();
      }
    }

    for (let i = thrown.length - 1; i >= 0; i--) {
      const t = thrown[i]!;
      t.t += dt / t.dur;
      const k = Math.min(1, t.t);
      t.mesh.position.lerpVectors(t.from, t.to, k);
      t.mesh.position.y += Math.sin(k * Math.PI) * (1.2 + t.from.distanceTo(t.to) * 0.12);
      t.mesh.rotation.x += dt * 12;
      t.mesh.rotation.z += dt * 7;
      if (k >= 1) {
        scene.remove(t.mesh);
        thrown.splice(i, 1);
        t.onLand(t.to);
      }
    }

    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i]!;
      z.life -= dt;
      z.tick -= dt;
      if (z.follow) z.mesh.position.set(z.follow.root.position.x, 0.08, z.follow.root.position.z);
      const fade = Math.min(1, z.life / 0.6, (z.max - z.life) / 0.25 + 0.2);
      (z.mesh.material as THREE.MeshBasicMaterial).opacity = 0.3 * fade + Math.sin(clock * 6 + i) * 0.04;
      z.mesh.rotation.z += dt * 0.6;
      if (ctx.vfx) {
        const at = z.mesh.position;
        const n = Math.ceil(z.radius * z.radius * dt * 60 * 0.12);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * z.radius;
          const x = at.x + Math.cos(a) * r;
          const zz = at.z + Math.sin(a) * r;
          if (z.kind === 'fire') ctx.vfx.flame(x, zz, 0.9);
          else if (z.kind === 'toxin') ctx.vfx.emit('toxic', x, 0.3, zz, { vy: 0.6, life: 1.4, s0: 0.6, s1: 1.8, color: 0x7fbf2a, a: 0.35 });
          else if (z.kind === 'cryo') ctx.vfx.emit('frost', x, 0.2, zz, { vy: 0.8, life: 0.9, s0: 0.35, s1: 0.1, color: 0xc4f1ff });
          else ctx.vfx.emit('elec', x, 0.2, zz, { vy: 1.6, life: 0.9, s0: 0.25, s1: 0.05, color: 0x7cffb2 });
        }
      }
      if (z.tick <= 0) {
        z.tick = 0.4;
        const at = z.mesh.position;
        if (z.kind === 'heal') {
          for (const op of ctx.squad) {
            if (!op.alive || op.root.position.distanceTo(at) > z.radius) continue;
            op.hp = Math.min(op.maxHp, op.hp + z.dps * 0.4);
            op.healthBar.setRatio(op.hp / op.maxHp);
          }
        } else {
          const status = ZONE_STATUS[z.kind];
          forEachZombieIn(at, z.radius, (enemy) => {
            const dir = enemy.root.position.clone().sub(at).setY(0).normalize();
            ctx.damageZombie(enemy, z.dps * 0.4, enemy.root.position.clone().setY(1), dir);
            if (status) applyStatus(enemy, status, 1.4);
          });
        }
        if (Math.random() < 0.7) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * z.radius;
          fx.spawnBloodBurst(new THREE.Vector3(at.x + Math.cos(a) * r, 0.5, at.z + Math.sin(a) * r), 0.5, ZONE_COLOR[z.kind]);
        }
      }
      if (z.life <= 0) {
        scene.remove(z.mesh);
        zones.splice(i, 1);
      }
    }

    for (let i = turrets.length - 1; i >= 0; i--) {
      const t = turrets[i]!;
      t.life -= dt;
      t.cd -= dt;
      let target: ZombieVisual | null = null;
      let best = t.range;
      for (const z of ctx.zombies) {
        if (z.hp <= 0) continue;
        const d = z.root.position.distanceTo(t.group.position);
        if (d < best) {
          best = d;
          target = z;
        }
      }
      if (target) {
        const yaw = Math.atan2(target.root.position.x - t.group.position.x, target.root.position.z - t.group.position.z);
        t.head.rotation.y = THREE.MathUtils.lerp(t.head.rotation.y, yaw, 1 - Math.exp(-14 * dt));
        if (t.cd <= 0) {
          t.cd = t.def.rate;
          const muzzle = t.group.position.clone().setY(1.0);
          if (t.def.chain) chainFrom(muzzle.setY(1.4), t.def.chain, t.def.damage * t.power, t.range, t.color);
          else {
            const to = target.root.position.clone().setY(1.1);
            zap(muzzle, to, 0xffe08a);
            const dir = to.clone().sub(muzzle).setY(0).normalize();
            ctx.damageZombie(target, t.def.damage * t.power, to, dir);
          }
        }
      }
      if (t.life < 1) t.group.scale.setScalar(Math.max(0.01, t.life));
      if (t.life <= 0) {
        scene.remove(t.group);
        t.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        turrets.splice(i, 1);
      }
    }

    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]!;
      b.life -= dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.life / 0.14);
      if (b.life <= 0) {
        scene.remove(b.line);
        b.line.geometry.dispose();
        bolts.splice(i, 1);
      }
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]!;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + (r.radius - 0.2) * (1 - (1 - k) * (1 - k)));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.85;
      if (r.life <= 0) {
        scene.remove(r.mesh);
        rings.splice(i, 1);
      }
    }

    for (let i = buffs.length - 1; i >= 0; i--) if (buffs[i]!.until <= now) buffs.splice(i, 1);
    if (shieldBubble) {
      const until = shieldBubble.userData.until as number;
      if (until <= now) {
        scene.remove(shieldBubble);
        shieldBubble = null;
      } else {
        shieldBubble.position.copy(ctx.player.root.position).setY(1.15);
        (shieldBubble.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(clock * 8) * 0.05;
      }
    }

    // trim leaked one-shot materials occasionally
    if (owned.length > 400) {
      const live = new Set<THREE.Material>();
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => live.add(x));
      });
      for (let i = owned.length - 1; i >= 0; i--) {
        if (!live.has(owned[i]!)) {
          owned[i]!.dispose();
          owned.splice(i, 1);
        }
      }
    }
  };

  const buffsFor = (op: OperativeVisual, now: number): HeroBuffs => {
    const out: HeroBuffs = { damage: 1, fireRate: 1, move: 1, armor: 0, crit: 0 };
    for (const b of buffs) {
      if (b.until <= now || !b.targets.has(op)) continue;
      out.damage *= b.damage;
      out.fireRate *= b.fireRate;
      out.move *= b.move;
      out.armor = Math.max(out.armor, b.armor);
      out.crit += b.crit;
    }
    return out;
  };

  return {
    levels,
    bonus,
    cooldowns,
    defs,
    cast,
    update,
    buffsFor,
    maxCooldown,
    level: lvl,
    dispose: () => {
      for (const z of zones) scene.remove(z.mesh);
      for (const t of thrown) scene.remove(t.mesh);
      for (const t of turrets) scene.remove(t.group);
      for (const b of bolts) scene.remove(b.line);
      for (const r of rings) scene.remove(r.mesh);
      if (shieldBubble) scene.remove(shieldBubble);
      owned.forEach((m) => m.dispose());
      [discGeo, ringGeo, sphereGeo, fragGeo, bottleGeo, flaskGeo].forEach((g) => g.dispose());
    },
  };
}
