import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { CombatFx } from './fx';
import type { OperativeId } from './roster';
import type { AbilitySlot } from './loadout';
import { applyStatus, type StatusId } from './statusEffects';
import type { SkillFx } from './skillFx';
import { operativeAction, type OperativeActionKind } from './avatars';
import { buildSentryTurret, buildTeslaTurret, kickBarrel, settleBarrel, type TurretModel } from './turretModels';

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
  | { type: 'volley'; shots: number }
  /** ultimates (R): each one is its own mechanic */
  | { type: 'beam'; dur: number; radius: number; dps: number; speed: number }
  | { type: 'rampage'; dashes: number; dist: number; damage: number; gap: number }
  | { type: 'bastion'; dur: number; radius: number; armor: number; dps: number }
  | { type: 'nuke'; radius: number; damage: number; delay: number }
  | { type: 'angels'; heal: number; drones: number; dur: number; damage: number }
  | { type: 'reaper'; hits: number; damage: number; range: number; gap: number }
  | { type: 'vortex'; radius: number; dur: number; dps: number; pull: number }
  | { type: 'storm'; dur: number; radius: number; rate: number; damage: number };

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
    r: A({ id: 'orbital_lance', slot: 'r', name: 'Yörünge Topu', desc: 'Uydudan dev lazer: 6 sn boyunca nişanı takip edip altındakini eritir.', icon: '☄', color: 0xff5040, cooldown: 26, anim: 'cast', effect: { type: 'beam', dur: 6, radius: 2.6, dps: 34, speed: 7 } }),
  },
  breaker: {
    q: A({ id: 'breach_dash', slot: 'q', name: 'Kapı Kırma Hamlesi', desc: 'İleri atıl, yoldakileri ez.', icon: '➤', color: 0xfbbf24, cooldown: 6, anim: 'dash', effect: { type: 'dash', dist: 7, damage: 7, invuln: 0.45 } }),
    e: A({ id: 'flashbang', slot: 'e', name: 'Flaş Bombası', desc: 'Kör eder: zombileri neredeyse durdurur.', icon: '✦', color: 0xfff6c0, cooldown: 12, anim: 'throw', effect: { type: 'grenade', radius: 5, damage: 2, status: 'chill', statusPower: 3.5, mesh: 'flash' } }),
    r: A({ id: 'bulldozer', slot: 'r', name: 'Buldozer', desc: 'Art arda 4 hücum: her biri yoldakileri ezer, sonunda yeri yarar. Hücum boyunca dokunulmaz.', icon: '⇉', color: 0xff9f1a, cooldown: 22, anim: 'dash', effect: { type: 'rampage', dashes: 4, dist: 7, damage: 16, gap: 0.32 } }),
  },
  warden: {
    q: A({ id: 'sentry', slot: 'q', name: 'Nöbetçi Taret', desc: '12 sn otomatik ateş eden taret.', icon: '⌖', color: 0x22d3ee, cooldown: 16, anim: 'cast', effect: { type: 'turret', dur: 12, damage: 1.3, rate: 0.14, range: 15 } }),
    e: A({ id: 'suppression', slot: 'e', name: 'Baskı Ateşi', desc: 'Nişan alanını dondurucu baskıyla yavaşlat.', icon: '❄', color: 0x9be7ff, cooldown: 13, anim: 'throw', effect: { type: 'zone', at: 'aim', zone: { kind: 'cryo', radius: 5, dps: 1.5, dur: 6 } } }),
    r: A({ id: 'bastion', slot: 'r', name: 'Kale Kalkanı', desc: '9 sn kubbe: içerideki ekip %65 az hasar alır, giren zombi itilir ve yanar.', icon: '⛨', color: 0x7cc4ff, cooldown: 28, anim: 'cast', effect: { type: 'bastion', dur: 9, radius: 5.5, armor: 0.65, dps: 9 } }),
  },
  havoc: {
    q: A({ id: 'molotov', slot: 'q', name: 'Molotof', desc: 'Yanan alan bırakır.', icon: '🔥', color: 0xff5a1f, cooldown: 8, anim: 'throw', effect: { type: 'grenade', radius: 2.6, damage: 3, status: 'burn', statusPower: 2, zone: { kind: 'fire', radius: 3.2, dps: 4.5, dur: 5 }, mesh: 'bottle' } }),
    e: A({ id: 'flame_nova', slot: 'e', name: 'Alev Halkası', desc: 'Etrafı tutuşturan alev patlaması.', icon: '◎', color: 0xff7a2a, cooldown: 11, anim: 'cast', effect: { type: 'nova', radius: 5.2, damage: 6, knock: 1.4, status: 'burn', statusPower: 3 } }),
    r: A({ id: 'doomsday', slot: 'r', name: 'Kıyamet Füzesi', desc: 'Nişana gökten balistik füze: dev patlama ve yanan krater.', icon: '☢', color: 0xff3d1a, cooldown: 30, anim: 'shout', effect: { type: 'nuke', radius: 9, damage: 75, delay: 1.9 } }),
  },
  valkyrie: {
    q: A({ id: 'med_pulse', slot: 'q', name: 'Tıbbi Darbe', desc: 'Ekibi anında %30 iyileştir.', icon: '✚', color: 0x5ad46a, cooldown: 10, anim: 'cast', effect: { type: 'heal', radius: 12, amount: 0.3 } }),
    e: A({ id: 'adrenaline', slot: 'e', name: 'Adrenalin İğnesi', desc: 'Ekip: hız ×1.3, ateş hızı ×1.3.', icon: '➶', color: 0x38bdf8, cooldown: 16, anim: 'shout', effect: { type: 'buff', dur: 6, move: 1.3, fireRate: 1.3, squad: true } }),
    r: A({ id: 'guardian_wing', slot: 'r', name: 'Koruyucu Filo', desc: 'Ekibi %40 iyileştirir, düşenleri kaldırır; 4 sağlık dronu 10 sn etrafında ateş eder.', icon: '❖', color: 0x7cffb2, cooldown: 30, anim: 'cast', effect: { type: 'angels', heal: 0.4, drones: 4, dur: 10, damage: 2.2 } }),
  },
  ghost: {
    q: A({ id: 'shadow_blink', slot: 'q', name: 'Gölge Sıçrayışı', desc: 'Işınlan, kısa süre dokunulmaz ol.', icon: '◌', color: 0x88eeff, cooldown: 5, anim: 'dash', effect: { type: 'dash', dist: 8.5, damage: 0, invuln: 0.8 } }),
    e: A({ id: 'hunters_mark', slot: 'e', name: 'Avcı İşareti', desc: '7 sn kritik +%35, hasar ×1.25.', icon: '◎', color: 0xc4b5fd, cooldown: 15, anim: 'shout', effect: { type: 'buff', dur: 7, crit: 0.35, damage: 1.25 } }),
    r: A({ id: 'death_dance', slot: 'r', name: 'Ölüm Dansı', desc: 'Gölgeye dönüş: 10 zombi arasında ışınlanıp her birini biçer.', icon: '✕', color: 0x88eeff, cooldown: 22, anim: 'dash', effect: { type: 'reaper', hits: 10, damage: 22, range: 13, gap: 0.11 } }),
  },
  tox: {
    q: A({ id: 'toxin_flask', slot: 'q', name: 'Zehir Şişesi', desc: 'Zehirli bulut bırakan şişe.', icon: '⚗', color: 0x9cff2e, cooldown: 7, anim: 'throw', effect: { type: 'grenade', radius: 2.2, damage: 2, status: 'toxin', statusPower: 2.5, zone: { kind: 'toxin', radius: 3.6, dps: 3.5, dur: 6 }, mesh: 'flask' } }),
    e: A({ id: 'corrosive_aura', slot: 'e', name: 'Aşındırıcı Aura', desc: 'Seni takip eden zehir halkası.', icon: '☣', color: 0x84cc16, cooldown: 14, anim: 'cast', effect: { type: 'zone', at: 'self', follow: true, zone: { kind: 'toxin', radius: 3.6, dps: 3, dur: 7 } } }),
    r: A({ id: 'black_plague', slot: 'r', name: 'Kara Veba', desc: 'Nişana zehirli girdap: 7 sn zombileri merkeze çeker ve çürütür.', icon: '🌀', color: 0x9cff2e, cooldown: 26, anim: 'throw', effect: { type: 'vortex', radius: 7.5, dur: 7, dps: 9, pull: 4.2 } }),
  },
  spark: {
    q: A({ id: 'tesla_coil', slot: 'q', name: 'Tesla Bobini', desc: '3 hedefe sıçrayan elektrik kulesi.', icon: 'ϟ', color: 0x7cd4ff, cooldown: 15, anim: 'cast', effect: { type: 'turret', dur: 10, damage: 2.2, rate: 0.45, range: 9, chain: 3 } }),
    e: A({ id: 'arc_chain', slot: 'e', name: 'Ark Zinciri', desc: '6 zombiye sıçrayan yıldırım.', icon: '⚡', color: 0x9be7ff, cooldown: 9, anim: 'cast', effect: { type: 'chain', targets: 6, damage: 6, range: 11 } }),
    r: A({ id: 'thunderstorm', slot: 'r', name: 'Yıldırım Fırtınası', desc: '8 sn başının üstünde fırtına: çevredeki zombilere sürekli yıldırım düşer.', icon: '⛈', color: 0x5cc8ff, cooldown: 27, anim: 'shout', effect: { type: 'storm', dur: 8, radius: 10, rate: 5, damage: 10 } }),
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
  /** ability chain: a different Q/E/R within the combo window (chain length 2+) */
  onCombo?: (chain: number, mult: number) => void;
}

/** Q → E → R within this many seconds of each other chain into an ability combo. */
export const ABILITY_COMBO_WINDOW = 3.5;
/** extra power per link in the chain (2nd cast ×1.25, 3rd ×1.5) */
export const ABILITY_COMBO_STEP = 0.25;

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
  model: TurretModel;
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
  // ultimates
  const beams: { core: THREE.Mesh; glow: THREE.Mesh; scorch: THREE.Mesh; pos: THREE.Vector3; life: number; max: number; radius: number; dps: number; speed: number; tick: number }[] = [];
  const bastions: { dome: THREE.Mesh; edge: THREE.Mesh; at: THREE.Vector3; life: number; max: number; radius: number; armor: number; dps: number; tick: number }[] = [];
  const drones: { mesh: THREE.Group; rotors: THREE.Object3D[]; life: number; cd: number; ang: number; damage: number }[] = [];
  const vortexes: { mesh: THREE.Mesh; at: THREE.Vector3; life: number; max: number; radius: number; dps: number; pull: number; tick: number }[] = [];
  const storms: { cloud: THREE.Mesh; life: number; radius: number; rate: number; damage: number; acc: number }[] = [];

  // shared resources
  const discGeo = new THREE.CircleGeometry(1, 40);
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
  const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  const fragGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const bottleGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.26, 8);
  const flaskGeo = new THREE.SphereGeometry(0.12, 10, 8);
  // muted, lit-scene friendly overlays (no additive neon)
  const DUST = new THREE.Color(0x6a6052);
  const addMat = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(DUST, 0.55), transparent: true, opacity: opacity * 0.45, depthWrite: false, side: THREE.DoubleSide });
  const solid = (color: number, emissive = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4, emissive, emissiveIntensity: emissive ? 0.35 : 0 });
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
    if (ctx.vfx) {
      ctx.vfx.dustRing(at, radius);
      return;
    }
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

  const explode = (at: THREE.Vector3, radius: number, damage: number, color: number, status?: StatusId, statusPower = 2, knock = 0.8, style: 'blast' | 'kinetic' = 'blast') => {
    const v = ctx.vfx;
    if (!v) {
      shockRing(at, radius, color);
      fx.spawnHitRing(at.clone().setY(0.2), color, 0.2);
      fx.spawnBloodBurst(at.clone().setY(0.8), 1.8, color);
    } else if (status === 'toxin') {
      // ruptured canister: thick olive gas, no fireball
      v.dustRing(at, radius * 0.8, 0x5a5a3a);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * radius * 0.6;
        v.gas(at.x + Math.cos(a) * r, at.z + Math.sin(a) * r, 1.3);
      }
    } else if (status === 'chill') {
      if (color === 0xfff6c0) {
        // flashbang: blinding white pop + grey smoke
        v.emit('flash', at.x, 1, at.z, { life: 0.12, s0: radius * 0.9, s1: radius * 1.4, color: 0xffffff, spin: 0, a: 0.9 });
        v.flashLight(at, 0xffffff, 40, 0.15);
        v.sparks(at, 6, 0xfff1d0, 5);
        for (let i = 0; i < 6; i++) v.emit('smoke', at.x + (Math.random() - 0.5), 0.6, at.z + (Math.random() - 0.5), { vy: 0.7, life: 2.2, s0: 0.8, s1: 2.6, color: 0xb4b2ae, a: 0.4 });
      } else v.vapor(at, radius * 0.6);
    } else if (style === 'kinetic') {
      // concussive shove: dust wave + kicked-up debris
      v.dustRing(at, radius);
      v.debris(at, 10, radius * 0.5);
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius * (0.5 + Math.random() * 0.5);
        v.emit('smoke', at.x + Math.cos(a) * r, 0.3, at.z + Math.sin(a) * r, { vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, vy: 0.5, life: 1.1, s0: 0.5, s1: 1.6, color: 0x7a6e5c, a: 0.4, drag: 2 });
      }
    } else v.explosion(at, Math.max(1.2, radius * 0.7), 0xffa050);
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
    if (!ctx.vfx) {
      const edge = new THREE.Mesh(ringGeo, keep(addMat(color, 0.75)));
      edge.position.z = 0.01;
      mesh.add(edge);
    }
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
      ctx.vfx.bolt(from, to, new THREE.Color(color).lerp(new THREE.Color(0xe8f0ff), 0.75).getHex(), 0.06, 0.1, 9);
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
      if (!ctx.vfx) fx.spawnHitRing(to, color, 1.1);
      cur = to;
      range = Math.max(5, range * 0.85);
    }
    if (hit.size) ctx.sfx('zap');
    return hit.size;
  };

  const buildTurret = (tesla: boolean) => {
    const model = tesla ? buildTeslaTurret() : buildSentryTurret();
    return { group: model.group, head: model.head, model };
  };

  // ---- ultimate helpers ---------------------------------------------------
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  const domeGeo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const droneBodyGeo = new THREE.BoxGeometry(0.34, 0.08, 0.34);
  const droneArmGeo = new THREE.BoxGeometry(0.62, 0.03, 0.05);
  const droneRotorGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.01, 12);
  const missileGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.2, 12);
  const noseGeo = new THREE.ConeGeometry(0.22, 0.6, 12);
  const glowMat = (color: number, opacity: number) =>
    keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const hitZ = (z: ZombieVisual, dmg: number, from: THREE.Vector3) => {
    const dir = z.root.position.clone().sub(from).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    ctx.damageZombie(z, dmg, z.root.position.clone().setY(1.1), dir.normalize());
  };
  const nearestZombie = (at: THREE.Vector3, range: number, skip?: Set<ZombieVisual>) => {
    let best: ZombieVisual | null = null;
    let bd = range * range;
    for (const z of ctx.zombies) {
      if (z.hp <= 0 || skip?.has(z)) continue;
      const d = z.root.position.distanceToSquared(at);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  };
  const skyBolt = (to: THREE.Vector3, color: number) => {
    const from = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 13, (Math.random() - 0.5) * 3));
    if (ctx.vfx) {
      ctx.vfx.bolt(from, to, 0xe8f4ff, 0.12, 0.18, 12);
      ctx.vfx.sparks(to, 8, 0xd8ecff, 5);
      ctx.vfx.emit('flash', to.x, 0.4, to.z, { life: 0.1, s0: 1.4, s1: 2.4, color: 0xcfe8ff, spin: 0, a: 0.8 });
    } else zap(from, to, color);
  };

  const castBeam = (eff: Extract<AbilityEffect, { type: 'beam' }>, power: number, size: number, color: number) => {
    const at = aimPoint(18);
    const core = new THREE.Mesh(cylGeo, glowMat(0xffe0c8, 0.85));
    const glow = new THREE.Mesh(cylGeo, glowMat(color, 0.35));
    const scorch = new THREE.Mesh(discGeo, glowMat(color, 0.5));
    scorch.rotation.x = -Math.PI / 2;
    const r = eff.radius * size * ctx.aoeMult();
    scene.add(core, glow, scorch);
    beams.push({ core, glow, scorch, pos: at, life: eff.dur * size, max: eff.dur * size, radius: r, dps: eff.dps * power, speed: eff.speed, tick: 0 });
    ctx.shake(0.3);
    ctx.sfx('zap');
  };

  const castRampage = (eff: Extract<AbilityEffect, { type: 'rampage' }>, power: number, size: number, color: number) => {
    const p = ctx.player;
    p.invuln = Math.max(p.invuln, eff.gap * eff.dashes + 0.5);
    for (let i = 0; i < eff.dashes; i++) {
      pending.push({
        at: clock + i * eff.gap,
        run: () => {
          if (!p.alive) return;
          // each hop re-aims: at the cursor, else at the nearest zombie
          const near = nearestZombie(p.root.position, 12);
          const aimAt = ctx.aim.clone().sub(p.root.position).setY(0).lengthSq() > 1 ? ctx.aim : near?.root.position ?? ctx.aim;
          const dir = aimAt.clone().sub(p.root.position).setY(0);
          if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
          dir.normalize();
          p.root.rotation.y = Math.atan2(dir.x, dir.z);
          const start = p.root.position.clone();
          const dist = eff.dist * size;
          for (let k = 0; k < 10; k++) ctx.moveWithCollision(p.root, (dir.x * dist) / 10, (dir.z * dist) / 10, 0.45);
          const end = p.root.position.clone();
          const seg = end.clone().sub(start);
          const len2 = Math.max(1e-4, seg.lengthSq());
          for (const z of ctx.zombies) {
            if (z.hp <= 0) continue;
            const t = THREE.MathUtils.clamp(z.root.position.clone().sub(start).dot(seg) / len2, 0, 1);
            const closest = start.clone().addScaledVector(seg, t);
            if (closest.distanceTo(z.root.position) > 1.9) continue;
            const side = z.root.position.clone().sub(closest).setY(0);
            if (side.lengthSq() < 1e-4) side.set(-dir.z, 0, dir.x);
            side.normalize();
            ctx.damageZombie(z, eff.damage * power, z.root.position.clone().setY(1.1), side);
            z.root.position.addScaledVector(side, 2.2);
            applyStatus(z, 'chill', 1.5);
          }
          if (ctx.vfx) {
            for (let k = 0; k < 12; k++) {
              const q = start.clone().lerp(end, Math.random());
              ctx.vfx.emit('smoke', q.x, 0.2, q.z, { vx: -dir.x * 2, vz: -dir.z * 2, vy: 0.5, life: 0.9, s0: 0.4, s1: 1.3, color: 0x7a6e5c, a: 0.4, drag: 2 });
            }
          }
          operativeAction(p, 'roll');
          const last = i === eff.dashes - 1;
          explode(end, (last ? 4.5 : 2.6) * size * ctx.aoeMult(), eff.damage * power * (last ? 1.3 : 0.5), color, undefined, 2, last ? 2.6 : 1.2, 'kinetic');
        },
      });
    }
  };

  const castBastion = (eff: Extract<AbilityEffect, { type: 'bastion' }>, power: number, size: number, color: number) => {
    const at = ctx.player.root.position.clone().setY(0);
    const r = eff.radius * size * ctx.aoeMult();
    const dome = new THREE.Mesh(domeGeo, glowMat(color, 0.16));
    dome.position.copy(at);
    dome.scale.set(r, r * 0.75, r);
    const edge = new THREE.Mesh(ringGeo, glowMat(color, 0.7));
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(at.x, 0.08, at.z);
    edge.scale.setScalar(r);
    scene.add(dome, edge);
    bastions.push({ dome, edge, at, life: eff.dur * size, max: eff.dur * size, radius: r, armor: eff.armor, dps: eff.dps * power, tick: 0 });
    shockRing(at, r, color, 0.5);
    explode(at, r, 3 * power, color, undefined, 2, 2.4, 'kinetic');
  };

  const castNuke = (eff: Extract<AbilityEffect, { type: 'nuke' }>, power: number, size: number, color: number) => {
    const at = aimPoint(18);
    const r = eff.radius * size * ctx.aoeMult();
    fx.spawnWarnRing(at, r, 0xff3a1a, eff.delay);
    const m = new THREE.Group();
    const body = new THREE.Mesh(missileGeo, keep(solid(0xd8d6cc)));
    const nose = new THREE.Mesh(noseGeo, keep(solid(0x3a3d40)));
    nose.position.y = -1.4;
    nose.rotation.x = Math.PI;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.06), keep(solid(0x3a3d40)));
    fin.position.y = 1.0;
    const fin2 = fin.clone();
    fin2.rotation.y = Math.PI / 2;
    m.add(body, nose, fin, fin2);
    const from = at.clone().add(new THREE.Vector3(6, 40, -18));
    m.position.copy(from);
    m.lookAt(at);
    m.rotateX(Math.PI / 2);
    scene.add(m);
    thrown.push({
      mesh: m,
      from,
      to: at.clone(),
      t: 0,
      dur: eff.delay,
      onLand: (pos) => {
        explode(pos, r, eff.damage * power, color, 'burn', 4 * power, 3.2);
        if (ctx.vfx) {
          ctx.vfx.explosion(pos.clone(), r * 0.75, 0xff9a40);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const q = pos.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.55, 0, Math.sin(a) * r * 0.55));
            pending.push({ at: clock + 0.12 + i * 0.05, run: () => ctx.vfx?.explosion(q, 1.8, 0xff7a30) });
          }
          // mushroom stem
          for (let i = 0; i < 18; i++) ctx.vfx.emit('smoke', pos.x + (Math.random() - 0.5) * 2, 1 + i * 0.5, pos.z + (Math.random() - 0.5) * 2, { vy: 2.5, life: 3.5, s0: 1.5, s1: 4.5, color: 0x3a3430, a: 0.5, drag: 0.4 });
        }
        addZone(pos, { kind: 'fire', radius: eff.radius * 0.55, dps: 7, dur: 6 }, power, size, null);
        ctx.shake(0.9);
      },
    });
    ctx.sfx('buff');
  };

  const castAngels = (eff: Extract<AbilityEffect, { type: 'angels' }>, power: number, size: number, color: number) => {
    const p = ctx.player;
    for (const op of ctx.squad) {
      if (op.root.position.distanceTo(p.root.position) > 16) continue;
      if (!op.alive) {
        ctx.revive(op);
        continue;
      }
      op.hp = Math.min(op.maxHp, op.hp + op.maxHp * eff.heal * (0.8 + 0.2 * power));
      op.healthBar.setRatio(op.hp / op.maxHp);
      fx.spawnHitRing(op.root.position, color, 0.15);
    }
    shockRing(p.root.position, 8, color, 0.6);
    const bodyMat = keep(solid(0xdfe3e6));
    const armMat = keep(solid(0x2a2e33));
    const lightMat = glowMat(color, 0.9);
    for (let i = 0; i < eff.drones; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(droneBodyGeo, bodyMat));
      const a1 = new THREE.Mesh(droneArmGeo, armMat);
      a1.rotation.y = Math.PI / 4;
      const a2 = new THREE.Mesh(droneArmGeo, armMat);
      a2.rotation.y = -Math.PI / 4;
      g.add(a1, a2);
      const rotors: THREE.Object3D[] = [];
      for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]] as const) {
        const rt = new THREE.Mesh(droneRotorGeo, glowMat(0x9aa4ad, 0.35));
        rt.position.set(x, 0.05, z);
        g.add(rt);
        rotors.push(rt);
      }
      const led = new THREE.Mesh(fragGeo, lightMat);
      led.position.y = -0.06;
      led.scale.setScalar(0.5);
      g.add(led);
      g.traverse((o) => (o.castShadow = true));
      g.position.copy(p.root.position).setY(2.2);
      scene.add(g);
      drones.push({ mesh: g, rotors, life: eff.dur * size, cd: 0.2 + i * 0.1, ang: (i / eff.drones) * Math.PI * 2, damage: eff.damage * power });
    }
    ctx.sfx('heal');
  };

  const castReaper = (eff: Extract<AbilityEffect, { type: 'reaper' }>, power: number, size: number, color: number) => {
    const p = ctx.player;
    const hits = Math.round(eff.hits * size);
    const done = new Set<ZombieVisual>();
    p.invuln = Math.max(p.invuln, hits * eff.gap + 0.6);
    for (let i = 0; i < hits; i++) {
      pending.push({
        at: clock + i * eff.gap,
        run: () => {
          if (!p.alive) return;
          const z = nearestZombie(p.root.position, eff.range * size, done);
          if (!z) return;
          done.add(z);
          const from = p.root.position.clone();
          const to = z.root.position;
          const dir = to.clone().sub(from).setY(0);
          if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
          dir.normalize();
          // land just past the target, facing back at it
          const land = to.clone().addScaledVector(dir, 1.1);
          ctx.moveWithCollision(p.root, land.x - from.x, land.z - from.z, 0.4);
          p.root.rotation.y = Math.atan2(-dir.x, -dir.z);
          hitZ(z, eff.damage * power, from);
          applyStatus(z, 'chill', 2);
          if (ctx.vfx) {
            ctx.vfx.emit('smoke', from.x, 1, from.z, { vy: 0.4, life: 0.7, s0: 0.6, s1: 1.4, color: 0x20242c, a: 0.5 });
            ctx.vfx.tracer(from.clone().setY(1.1), p.root.position.clone().setY(1.1), color);
            ctx.vfx.sparks(to.clone().setY(1.2), 6, 0xcff6ff, 4);
          } else zap(from.clone().setY(1.1), p.root.position.clone().setY(1.1), color);
          fx.spawnBloodBurst(to.clone().setY(1.2), 1.2);
          operativeAction(p, 'roll');
        },
      });
    }
    ctx.sfx('buff');
  };

  const castVortex = (eff: Extract<AbilityEffect, { type: 'vortex' }>, power: number, size: number, color: number) => {
    const at = aimPoint(15);
    const r = eff.radius * size * ctx.aoeMult();
    throwTo(at, 'flask', color, (pos) => {
      const mesh = new THREE.Mesh(ringGeo, glowMat(0x3a5a10, 0.55));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(pos.x, 0.1, pos.z);
      mesh.scale.setScalar(r);
      scene.add(mesh);
      vortexes.push({ mesh, at: pos.clone(), life: eff.dur * size, max: eff.dur * size, radius: r, dps: eff.dps * power, pull: eff.pull, tick: 0 });
      ctx.shake(0.25);
    });
  };

  const castStorm = (eff: Extract<AbilityEffect, { type: 'storm' }>, power: number, size: number) => {
    const cloud = new THREE.Mesh(discGeo, keep(new THREE.MeshBasicMaterial({ color: 0x14181e, transparent: true, opacity: 0.0, depthWrite: false })));
    cloud.rotation.x = -Math.PI / 2;
    scene.add(cloud);
    storms.push({ cloud, life: eff.dur * size, radius: eff.radius * size * ctx.aoeMult(), rate: eff.rate, damage: eff.damage * power, acc: 0 });
    ctx.sfx('zap');
  };

  const tickUltimates = (dt: number) => {
    const p = ctx.player;
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i]!;
      b.life -= dt;
      // drift toward the cursor
      const want = aimPoint(22);
      const d = want.sub(b.pos).setY(0);
      const step = Math.min(d.length(), b.speed * dt);
      if (step > 1e-3) b.pos.addScaledVector(d.normalize(), step);
      const fade = Math.min(1, b.life / 0.4, (b.max - b.life) / 0.25);
      const flick = 0.85 + Math.random() * 0.3;
      b.core.position.set(b.pos.x, 15, b.pos.z);
      b.core.scale.set(b.radius * 0.28 * flick * fade, 30, b.radius * 0.28 * flick * fade);
      b.glow.position.copy(b.core.position);
      b.glow.scale.set(b.radius * 0.75 * fade, 30, b.radius * 0.75 * fade);
      b.scorch.position.set(b.pos.x, 0.09, b.pos.z);
      b.scorch.scale.setScalar(b.radius * (0.9 + Math.random() * 0.15));
      if (ctx.vfx) {
        if (Math.random() < 0.8) ctx.vfx.flame(b.pos.x + (Math.random() - 0.5) * b.radius, b.pos.z + (Math.random() - 0.5) * b.radius, 1);
        if (Math.random() < 0.4) ctx.vfx.sparks(b.pos.clone().setY(0.3), 3, 0xffd0a0, 5);
      }
      b.tick -= dt;
      if (b.tick <= 0) {
        b.tick = 0.15;
        forEachZombieIn(b.pos, b.radius, (z) => {
          hitZ(z, b.dps * 0.15, b.pos);
          applyStatus(z, 'burn', 1.5);
        });
        ctx.shake(0.06);
      }
      if (b.life <= 0) {
        scene.remove(b.core, b.glow, b.scorch);
        beams.splice(i, 1);
      }
    }
    for (let i = bastions.length - 1; i >= 0; i--) {
      const b = bastions[i]!;
      b.life -= dt;
      const fade = Math.min(1, b.life / 0.5);
      (b.dome.material as THREE.MeshBasicMaterial).opacity = (0.12 + Math.sin(clock * 5) * 0.04) * fade;
      (b.edge.material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
      b.tick -= dt;
      for (const z of ctx.zombies) {
        if (z.hp <= 0) continue;
        const dx = z.root.position.x - b.at.x;
        const dz = z.root.position.z - b.at.z;
        const d = Math.hypot(dx, dz);
        if (d >= b.radius || d < 1e-3) continue;
        // shoved back out to the wall
        const push = Math.min(b.radius - d, 10 * dt);
        z.root.position.x += (dx / d) * push;
        z.root.position.z += (dz / d) * push;
        if (b.tick <= 0) {
          hitZ(z, b.dps * 0.3, b.at);
          applyStatus(z, 'burn', 1);
        }
      }
      if (b.tick <= 0) b.tick = 0.3;
      if (b.life <= 0) {
        scene.remove(b.dome, b.edge);
        bastions.splice(i, 1);
      }
    }
    for (let i = drones.length - 1; i >= 0; i--) {
      const d = drones[i]!;
      d.life -= dt;
      d.cd -= dt;
      d.ang += dt * 1.4;
      const tgtPos = p.root.position.clone().add(new THREE.Vector3(Math.cos(d.ang) * 2.4, 2.3 + Math.sin(clock * 3 + d.ang) * 0.2, Math.sin(d.ang) * 2.4));
      d.mesh.position.lerp(tgtPos, 1 - Math.exp(-6 * dt));
      for (const r of d.rotors) r.rotation.y += dt * 40;
      const z = nearestZombie(d.mesh.position, 13);
      if (z) {
        d.mesh.lookAt(z.root.position.x, d.mesh.position.y, z.root.position.z);
        if (d.cd <= 0) {
          d.cd = 0.22;
          const to = z.root.position.clone().setY(1.1);
          if (ctx.vfx) ctx.vfx.tracer(d.mesh.position, to, 0x9affc8);
          else zap(d.mesh.position.clone(), to, 0x9affc8);
          hitZ(z, d.damage, d.mesh.position);
        }
      }
      // field medics: slow regen for the squad near the drones
      for (const op of ctx.squad) {
        if (!op.alive || op.root.position.distanceTo(p.root.position) > 6) continue;
        op.hp = Math.min(op.maxHp, op.hp + op.maxHp * 0.006 * dt);
      }
      if (d.life < 0.6) d.mesh.position.y += dt * 4;
      if (d.life <= 0) {
        scene.remove(d.mesh);
        drones.splice(i, 1);
      }
    }
    for (let i = vortexes.length - 1; i >= 0; i--) {
      const v = vortexes[i]!;
      v.life -= dt;
      v.mesh.rotation.z -= dt * 3;
      v.mesh.scale.setScalar(v.radius * (0.9 + Math.sin(clock * 6) * 0.05));
      (v.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.min(1, v.life / 0.5);
      if (ctx.vfx && Math.random() < 0.9) {
        const a = Math.random() * Math.PI * 2;
        const rr = v.radius * (0.4 + Math.random() * 0.6);
        // gas spiralling inward
        ctx.vfx.emit('smoke', v.at.x + Math.cos(a) * rr, 0.3, v.at.z + Math.sin(a) * rr, { vx: -Math.cos(a) * 3 - Math.sin(a) * 3, vz: -Math.sin(a) * 3 + Math.cos(a) * 3, vy: 0.4, life: 1.1, s0: 0.6, s1: 1.6, color: 0x3c4a18, a: 0.4, drag: 0.8 });
      }
      v.tick -= dt;
      forEachZombieIn(v.at, v.radius, (z, d) => {
        if (d < 0.6) return;
        const k = Math.min(d - 0.5, v.pull * dt * (z.kind === 'boss' ? 0.35 : 1));
        z.root.position.x += ((v.at.x - z.root.position.x) / d) * k;
        z.root.position.z += ((v.at.z - z.root.position.z) / d) * k;
        if (v.tick <= 0) {
          hitZ(z, v.dps * 0.35, v.at);
          applyStatus(z, 'toxin', 1.6);
        }
      });
      if (v.tick <= 0) v.tick = 0.35;
      if (v.life <= 0) {
        if (ctx.vfx) ctx.vfx.dustRing(v.at, v.radius * 0.6, 0x4a5a20);
        explode(v.at, 3.2, v.dps * 1.5, 0x9cff2e, 'toxin', 3, 1.5);
        scene.remove(v.mesh);
        vortexes.splice(i, 1);
      }
    }
    for (let i = storms.length - 1; i >= 0; i--) {
      const st = storms[i]!;
      st.life -= dt;
      st.cloud.position.set(p.root.position.x, 9, p.root.position.z);
      st.cloud.scale.setScalar(st.radius * 0.8);
      (st.cloud.material as THREE.MeshBasicMaterial).opacity = 0.35 * Math.min(1, st.life / 0.6);
      if (ctx.vfx && Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * st.radius * 0.8;
        ctx.vfx.emit('smoke', p.root.position.x + Math.cos(a) * rr, 8.5, p.root.position.z + Math.sin(a) * rr, { vy: 0, life: 1.6, s0: 2, s1: 3.5, color: 0x2a2e36, a: 0.35, drag: 0.5 });
      }
      st.acc += dt * st.rate;
      while (st.acc >= 1) {
        st.acc -= 1;
        const list = ctx.zombies.filter((z) => z.hp > 0 && z.root.position.distanceToSquared(p.root.position) < st.radius * st.radius);
        if (!list.length) break;
        const z = list[Math.floor(Math.random() * list.length)]!;
        const to = z.root.position.clone().setY(0.2);
        skyBolt(to, 0x9be7ff);
        forEachZombieIn(to, 1.8, (o) => {
          hitZ(o, o === z ? st.damage : st.damage * 0.5, to);
          applyStatus(o, 'chill', 1.4);
        });
        ctx.shake(0.08);
      }
      if (st.life <= 0) {
        scene.remove(st.cloud);
        storms.splice(i, 1);
      }
    }
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
    if (eff.nova) explode(ctx.player.root.position, eff.nova * size, 2 * power, color, undefined, 2, 2.2, 'kinetic');
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

  let comboSlots: AbilitySlot[] = [];
  let comboAt = -99;
  const cast = (slot: AbilitySlot, now: number): boolean => {
    const p = ctx.player;
    if (!p.alive || cooldowns[slot] > 0) return false;
    const def = defs[slot];
    const L = lvl(slot);
    // ability combo: a fresh slot inside the window extends the chain
    if (now - comboAt > ABILITY_COMBO_WINDOW || comboSlots.includes(slot)) comboSlots = [];
    comboSlots.push(slot);
    comboAt = now;
    const chain = comboSlots.length;
    const comboMult = 1 + ABILITY_COMBO_STEP * (chain - 1);
    if (chain >= 2) ctx.onCombo?.(chain, comboMult);
    const power = levelPower(L) * ctx.powerMult() * comboMult;
    const size = levelSize(L);
    const eff = def.effect;
    cooldowns[slot] = maxCooldown(slot);

    const e = def.effect.type;
    const act: OperativeActionKind | null =
      def.anim === 'throw' ? 'throw' : def.anim === 'dash' ? 'roll' : e === 'turret' || e === 'heal' ? 'deploy' : e === 'nova' ? 'shove' : e === 'volley' ? null : 'shout';
    if (!act || !operativeAction(p, act)) ctx.anim(p, def.anim === 'throw' ? 'ability' : def.anim === 'dash' ? 'dash' : 'cast');

    switch (eff.type) {
      case 'grenade': {
        const target = aimPoint(16);
        const land = (at: THREE.Vector3) => {
          explode(at, eff.radius * size * ctx.aoeMult(), eff.damage * power, def.color, eff.status, (eff.statusPower ?? 2) * power, eff.mesh === 'flash' ? 0.2 : 1);
          if (eff.zone) addZone(at, eff.zone, power, size, null);
          if (eff.mesh === 'flash') {
            ctx.vfx?.flashLight(at, 0xffffff, 40, 0.15);
          }
        };
        throwTo(target, eff.mesh ?? 'frag', def.color, land);
        break;
      }
      case 'nova': {
        const r = eff.radius * size * ctx.aoeMult();
        explode(p.root.position, r, eff.damage * power, def.color, eff.status, (eff.statusPower ?? 2) * power, eff.knock, 'kinetic');
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
          if (!ctx.vfx) pending.push({ at: clock + i * 0.02, run: () => shockRing(at, 0.9, def.color, 0.3) });
        }
        if (ctx.vfx) {
          // boots kicking up dirt along the path
          for (let i = 0; i < 14; i++) {
            const at = start.clone().lerp(end, Math.random());
            ctx.vfx.emit('smoke', at.x, 0.2, at.z, { vx: -dir.x * 1.5, vz: -dir.z * 1.5, vy: 0.4, life: 0.9, s0: 0.35, s1: 1.1, color: 0x7a6e5c, a: 0.35, drag: 2 });
          }
          ctx.vfx.debris(end, 4, 0.5);
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
        const { group, head, model } = buildTurret(tesla);
        group.rotation.y = Math.atan2(at.x - p.root.position.x, at.z - p.root.position.z);
        group.position.copy(at);
        scene.add(group);
        shockRing(at, 1.6, def.color, 0.4);
        turrets.push({ group, head, model, life: eff.dur * size, cd: 0.3, def: eff, power, range: eff.range * size, color: def.color });
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
      case 'beam':
        castBeam(eff, power, size, def.color);
        break;
      case 'rampage':
        castRampage(eff, power, size, def.color);
        break;
      case 'bastion':
        castBastion(eff, power, size, def.color);
        break;
      case 'nuke':
        castNuke(eff, power, size, def.color);
        break;
      case 'angels':
        castAngels(eff, power, size, def.color);
        break;
      case 'reaper':
        castReaper(eff, power, size, def.color);
        break;
      case 'vortex':
        castVortex(eff, power, size, def.color);
        break;
      case 'storm':
        castStorm(eff, power, size);
        break;
    }
    return true;
  };

  const update = (dt: number, now: number) => {
    clock += dt;
    for (const s of ['q', 'e', 'r'] as AbilitySlot[]) cooldowns[s] = Math.max(0, cooldowns[s] - dt);

    tickUltimates(dt);
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
      (z.mesh.material as THREE.MeshBasicMaterial).opacity = (z.kind === 'fire' ? 0.16 : 0.08) * fade;
      z.mesh.rotation.z += dt * 0.6;
      if (ctx.vfx) {
        const at = z.mesh.position;
        const n = z.kind === 'toxin' ? (Math.random() < dt * z.radius * 2.2 ? 1 : 0) : Math.ceil(z.radius * z.radius * dt * 60 * (z.kind === 'heal' ? 0.03 : 0.1));
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * z.radius;
          const x = at.x + Math.cos(a) * r;
          const zz = at.z + Math.sin(a) * r;
          if (z.kind === 'fire') ctx.vfx.flame(x, zz, 0.9);
          else if (z.kind === 'toxin') ctx.vfx.gas(x, zz, 1);
          else if (z.kind === 'cryo') ctx.vfx.emit('smoke', x, 0.15, zz, { vy: 0.15, life: 1.6, s0: 0.6, s1: 1.8, color: 0xd6dde2, a: 0.28 });
          else ctx.vfx.emit('smoke', x, 0.1, zz, { vy: 0.5, life: 1.2, s0: 0.3, s1: 0.9, color: 0xdfe8dc, a: 0.18 });
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
        if (!ctx.vfx && Math.random() < 0.7) {
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
      settleBarrel(t.model, dt);
      if (t.def.chain) t.head.rotation.y += dt * 1.5;
      if (target) {
        if (!t.def.chain) {
          // head yaw is local to the (rotated) tripod
          const yaw = Math.atan2(target.root.position.x - t.group.position.x, target.root.position.z - t.group.position.z) - t.group.rotation.y;
          const cur = t.head.rotation.y;
          const delta = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
          t.head.rotation.y = cur + delta * (1 - Math.exp(-14 * dt));
        }
        if (t.cd <= 0) {
          t.cd = t.def.rate;
          const muzzle = t.model.muzzle.getWorldPosition(new THREE.Vector3());
          if (t.def.chain) chainFrom(muzzle, t.def.chain, t.def.damage * t.power, t.range, t.color);
          else {
            const to = target.root.position.clone().setY(1.1);
            kickBarrel(t.model);
            if (ctx.vfx) {
              ctx.vfx.tracer(muzzle, to, 0xffc46a);
              ctx.vfx.emit('flash', muzzle.x, muzzle.y, muzzle.z, { life: 0.05, s0: 0.5, s1: 0.8, color: 0xffd27a, spin: 0, a: 0.9 });
            } else zap(muzzle, to, 0xffe08a);
            const dir = to.clone().sub(muzzle).setY(0).normalize();
            ctx.damageZombie(target, t.def.damage * t.power, to, dir);
          }
        }
      }
      if (t.life < 1) t.group.scale.setScalar(Math.max(0.01, t.life));
      if (t.life <= 0) {
        scene.remove(t.group);
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
    for (const b of bastions) {
      if (op.root.position.distanceTo(b.at) <= b.radius) out.armor = Math.max(out.armor, b.armor);
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
      for (const b of beams) scene.remove(b.core, b.glow, b.scorch);
      for (const b of bastions) scene.remove(b.dome, b.edge);
      for (const d of drones) scene.remove(d.mesh);
      for (const v of vortexes) scene.remove(v.mesh);
      for (const st of storms) scene.remove(st.cloud);
      owned.forEach((m) => m.dispose());
      [cylGeo, domeGeo, droneBodyGeo, droneArmGeo, droneRotorGeo, missileGeo, noseGeo].forEach((g) => g.dispose());
      [discGeo, ringGeo, sphereGeo, fragGeo, bottleGeo, flaskGeo].forEach((g) => g.dispose());
    },
  };
}
