import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { OperativeId } from './roster';
import { applyStatus } from './statusEffects';
import type { SkillFx } from './skillFx';
import { SupportCalls, type SupportKind } from './support';

/**
 * YAZS-style run skills: auto-firing abilities picked on level-up (max 6), each with
 * 5 levels, plus passive items (max 6) that scale every skill. A level-5 skill
 * paired with its passive can EVOLVE into a stronger form (offered as an epic card).
 */

export type RunSkillId =
  | 'lightning'
  | 'saws'
  | 'grenade'
  | 'molotov'
  | 'drone'
  | 'mines'
  | 'boomerang'
  | 'laser'
  | 'turret'
  | 'fireAura'
  | 'frostNova'
  | 'rockets'
  | 'tesla'
  | 'meteor'
  | 'gravity'
  | 'knives'
  | 'airstrike'
  | 'gunship'
  | 'barrage'
  | 'siha'
  | 'supplyDrop';

export type PassiveId = 'core' | 'area' | 'cooldown' | 'amount' | 'duration' | 'velocity' | 'capacitor' | 'fuel';

export const SKILL_MAX = 5;
export const PASSIVE_MAX = 5;
export const MAX_SKILLS = 6;
export const MAX_PASSIVES = 6;

export interface RunSkillDef {
  id: RunSkillId;
  name: string;
  icon: string;
  color: number;
  desc: string;
  /** what each level adds (index 0 = level 1) */
  levels: [string, string, string, string, string];
  evo: { passive: PassiveId; name: string; desc: string };
  /** hero-exclusive (radio fire support) */
  heroes?: OperativeId[];
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  icon: string;
  desc: string;
}

const S = (d: RunSkillDef) => d;
export const RUN_SKILLS: Record<RunSkillId, RunSkillDef> = {
  lightning: S({ id: 'lightning', name: 'Topçu Desteği', icon: '💥', color: 0xd9a066, desc: 'Havan mermileri rastgele zombilerin üstüne düşer.', levels: ['1 havan mermisi', '+%30 hasar', '+1 mermi', '+%30 hasar, daha geniş', '+1 mermi'], evo: { passive: 'capacitor', name: 'Yoğun Topçu Ateşi', desc: 'Her atışta etrafa 4 ek mermi, daha sık.' } }),
  saws: S({ id: 'saws', name: 'Dönen Testere', icon: '⚙', color: 0xb8bec4, desc: 'Etrafında dönen testere bıçakları.', levels: ['2 testere', '+%30 hasar', '+1 testere', '+%25 hız, daha geniş yörünge', '+1 testere'], evo: { passive: 'area', name: 'Kıyma Makinesi', desc: '8 dev testere, ×1.6 hasar.' } }),
  grenade: S({ id: 'grenade', name: 'El Bombası', icon: '💣', color: 0xffa040, desc: 'Kalabalığa otomatik el bombası atar.', levels: ['1 bomba', '+%30 hasar', '+%20 alan', '+1 bomba', '+%35 hasar'], evo: { passive: 'amount', name: 'Misket Bombası', desc: 'Her bomba 4 parçacık bombaya bölünür.' } }),
  molotov: S({ id: 'molotov', name: 'Molotof', icon: '🔥', color: 0xff5a1f, desc: 'Yanan alan bırakan kokteyller.', levels: ['1 molotof', '+%30 yanma', '+%20 alan, +süre', '+1 molotof', '+%35 yanma'], evo: { passive: 'fuel', name: 'Napalm Yağmuru', desc: 'Her atış 4 dev alev alanı.' } }),
  drone: S({ id: 'drone', name: 'Savaş Dronu', icon: '🛸', color: 0xb8c4cc, desc: 'Etrafında uçup en yakın zombiyi vuran dron.', levels: ['1 dron', '+%30 hasar', '+%25 atış hızı', '+1 dron', '+%35 hasar'], evo: { passive: 'velocity', name: 'Avcı Sürüsü', desc: 'Dronlar füze de atar, çok daha hızlı ateş eder.' } }),
  mines: S({ id: 'mines', name: 'Mayın', icon: '◉', color: 0xef4444, desc: 'Geçtiğin yere mayın bırakır.', levels: ['4 mayına kadar', '+%30 hasar', '+2 mayın, daha sık', '+%20 alan', '+%35 hasar'], evo: { passive: 'core', name: 'Claymore Tarlası', desc: 'İki kat hasar, dev patlama, çok sık.' } }),
  boomerang: S({ id: 'boomerang', name: 'Fırlatma Bıçağı', icon: '☾', color: 0xb8bec4, desc: 'Gidip dönen, delip geçen kavisli bıçak.', levels: ['1 bumerang', '+%30 hasar', '+1 bumerang', '+%25 menzil/hız', '+1 bumerang'], evo: { passive: 'velocity', name: 'Kanlı Orak', desc: 'Dev oraklar, ×2 hasar, +2 adet.' } }),
  laser: S({ id: 'laser', name: 'Ağır Makineli', icon: '⁂', color: 0xffb04a, desc: 'Önündeki alanı tarayan ağır makineli ateşi.', levels: ['1.2 sn tarama', '+%30 hasar', '+0.5 sn süre', '+%25 genişlik', '+%35 hasar'], evo: { passive: 'core', name: 'Çift Namlu', desc: 'İki yöne birden, daha uzun ve ağır tarama.' } }),
  turret: S({ id: 'turret', name: 'Taret', icon: '⌖', color: 0xb8c4a0, desc: 'Otomatik nöbetçi taret kurar.', levels: ['8 sn taret', '+%30 hasar', '+3 sn süre', '+%30 atış hızı', '+%35 hasar'], evo: { passive: 'duration', name: 'Kale Tareti', desc: '2 taret, roket de atarlar.' } }),
  fireAura: S({ id: 'fireAura', name: 'Alev Halesi', icon: '◎', color: 0xff7a2a, desc: 'Etrafını sürekli yakan alev halkası.', levels: ['Küçük hale', '+%30 hasar', '+%20 yarıçap', '+%30 hasar', '+%20 yarıçap'], evo: { passive: 'fuel', name: 'Cehennem Halesi', desc: '×2 hasar, %50 daha geniş, güçlü yanma.' } }),
  frostNova: S({ id: 'frostNova', name: 'Sıvı Azot', icon: '❄', color: 0xcfd8e0, desc: 'Etrafa sıvı azot püskürterek zombileri dondurur.', levels: ['Yavaşlatan bulut', '+%30 hasar', '+%20 yarıçap', '+daha güçlü yavaşlatma', '+%35 hasar'], evo: { passive: 'area', name: 'Kriyo Patlama', desc: 'Zombileri tamamen dondurur ve parçalar.' } }),
  rockets: S({ id: 'rockets', name: 'Roket Salvosu', icon: '🚀', color: 0xff8a2a, desc: 'Güdümlü roketler.', levels: ['2 roket', '+%30 hasar', '+1 roket', '+%20 alan', '+1 roket'], evo: { passive: 'amount', name: 'Roket Yağmuru', desc: 'İki kat roket, daha sık.' } }),
  tesla: S({ id: 'tesla', name: 'Tesla Bobini', icon: '⚡', color: 0xcfe0f0, desc: 'Yakındaki zombilere elektrik atlatır.', levels: ['1 hedef', '+%30 hasar', '+1 hedef', '+%20 menzil', '+1 hedef, +zincir'], evo: { passive: 'capacitor', name: 'Tesla Kulesi', desc: '6 hedef, 3 zincir, çok hızlı.' } }),
  meteor: S({ id: 'meteor', name: 'Hava Saldırısı', icon: '✈', color: 0xd9a066, desc: 'Kalabalığa güdümlü füze iner.', levels: ['1 füze', '+%30 hasar', '+%20 alan', '-%20 bekleme', '+%40 hasar'], evo: { passive: 'cooldown', name: 'Halı Bombardımanı', desc: 'Her seferinde 3 füze.' } }),
  gravity: S({ id: 'gravity', name: 'Yem Bombası', icon: '📟', color: 0xc0504a, desc: 'Ses ve feromonla zombileri toplayıp patlayan cihaz.', levels: ['2.5 sn çekim', '+%30 hasar', '+%20 alan', '+süre', '+%40 patlama'], evo: { passive: 'duration', name: 'Feromon Bombası', desc: 'Çok geniş çekim, iki kat patlama.' } }),
  knives: S({ id: 'knives', name: 'Bıçak Fırtınası', icon: '✦', color: 0xe5e7eb, desc: 'Her yöne fırlatılan bıçaklar.', levels: ['5 bıçak', '+%30 hasar', '+2 bıçak', '+1 delme', '+2 bıçak'], evo: { passive: 'cooldown', name: 'Bıçak Kasırgası', desc: 'Sarmal 16 bıçak, 3 delme, çok sık.' } }),
  airstrike: S({ id: 'airstrike', heroes: ['ironclad'], name: 'Hava Desteği (F-16)', icon: '✈', color: 0xd9a066, desc: 'Telsizle F-16 çağırır: işaretli hatta bomba yağdırır.', levels: ['6 bomba', '+%30 hasar, +1 bomba', '+2 m hat', '+%30 hasar, +1 bomba', '−bekleme, +1 bomba'], evo: { passive: 'amount', name: 'Halı Bombardımanı', desc: 'İki jet yan yana geçer.' } }),
  gunship: S({ id: 'gunship', heroes: ['warden', 'breaker'], name: 'Taarruz Helikopteri', icon: '🚁', color: 0xb8c4a0, desc: 'Telsizle helikopter çağırır: işaretli şeridi makineliyle tarar.', levels: ['22 m şerit', '+%30 hasar', '+2 m şerit', '+%30 hasar', '−bekleme'], evo: { passive: 'duration', name: 'Kirve Geliyor', desc: 'Daha uzun tarama, roket atışı da yapar.' } }),
  barrage: S({ id: 'barrage', heroes: ['havoc'], name: 'Topçu Bataryası', icon: '🎯', color: 0xd9a066, desc: 'Telsizle topçu ateşi ister: işaretli alana obüs yağar.', levels: ['11 mermi', '+%30 hasar, +2 mermi', '+alan, +2 mermi', '+%30 hasar', '−bekleme, +2 mermi'], evo: { passive: 'area', name: 'Yoğun Baraj', desc: '+10 mermi.' } }),
  siha: S({ id: 'siha', heroes: ['ghost'], name: 'SİHA Desteği', icon: '🛩', color: 0xcfd8e0, desc: 'Silahlı insansız uçak en güçlü zombileri tek tek vurur.', levels: ['2 hedef', '+%35 hasar', '+1 hedef', '+%35 hasar', '+1 hedef'], evo: { passive: 'velocity', name: 'Sürü Taarruzu', desc: '+3 hedef.' } }),
  supplyDrop: S({ id: 'supplyDrop', heroes: ['valkyrie'], name: 'İkmal Paraşütü', icon: '🪂', color: 0x9ab07a, desc: 'Nakliye uçağı paraşütle ikmal sandığı atar (can + güçlendirme).', levels: ['1 sandık', '−bekleme', '−bekleme', '−bekleme', '−bekleme'], evo: { passive: 'cooldown', name: 'Çift Sandık', desc: 'Her seferinde 2 sandık.' } }),
};


const SUPPORT_SKILLS: Array<[RunSkillId, SupportKind, number]> = [
  ['airstrike', 'jet', 26],
  ['gunship', 'heli', 24],
  ['barrage', 'artillery', 22],
  ['siha', 'siha', 18],
  ['supplyDrop', 'supply', 45],
];

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  core: { id: 'core', name: 'Güç Çekirdeği', icon: '◆', desc: 'Yetenek hasarı +%12.' },
  area: { id: 'area', name: 'Genişletici', icon: '◯', desc: 'Yetenek alanı +%10.' },
  cooldown: { id: 'cooldown', name: 'Soğutucu', icon: '❆', desc: 'Yetenek bekleme süresi −%8.' },
  amount: { id: 'amount', name: 'Çoğaltıcı', icon: '✚', desc: 'Sv2 ve Sv4: tüm yeteneklere +1 adet.' },
  duration: { id: 'duration', name: 'Kronometre', icon: '⧗', desc: 'Yetenek süresi +%12.' },
  velocity: { id: 'velocity', name: 'Hız Modülü', icon: '➤', desc: 'Mermi / dönüş hızı +%10.' },
  capacitor: { id: 'capacitor', name: 'Kapasitör', icon: 'Ϟ', desc: 'Yetenek kritik şansı +%6.' },
  fuel: { id: 'fuel', name: 'Yakıt Tankı', icon: '⛽', desc: 'Yanma hasarı +%20, alev alanı +%8.' },
};

/** Each hero starts the run with one signature skill. */
export const HERO_START_SKILL: Record<OperativeId, RunSkillId> = {
  ironclad: 'grenade',
  valkyrie: 'drone',
  breaker: 'saws',
  ghost: 'knives',
  tox: 'gravity',
  spark: 'tesla',
  warden: 'turret',
  havoc: 'rockets',
};

export interface RunSkillState {
  /** owning hero (gates hero-exclusive skills) */
  hero?: OperativeId;
  skills: Map<RunSkillId, number>;
  passives: Map<PassiveId, number>;
  evolved: Set<RunSkillId>;
}

export function createRunSkillState(start?: RunSkillId): RunSkillState {
  const s: RunSkillState = { skills: new Map(), passives: new Map(), evolved: new Set() };
  if (start) s.skills.set(start, 1);
  return s;
}

export interface RunSkillCard {
  kind: 'skill' | 'passive' | 'evo';
  id: RunSkillId | PassiveId;
  name: string;
  description: string;
  icon: string;
  level: number;
  rarity: 'common' | 'rare' | 'epic';
}

/** Candidate cards for the next level-up draft. */
export function runSkillCards(st: RunSkillState): RunSkillCard[] {
  const out: RunSkillCard[] = [];
  for (const def of Object.values(RUN_SKILLS)) {
    const lv = st.skills.get(def.id) ?? 0;
    if (st.evolved.has(def.id)) continue;
    if (def.heroes && (!st.hero || !def.heroes.includes(st.hero))) continue;
    if (lv >= SKILL_MAX) {
      if ((st.passives.get(def.evo.passive) ?? 0) > 0) {
        out.push({ kind: 'evo', id: def.id, name: `EVRİM: ${def.evo.name}`, description: def.evo.desc, icon: def.icon, level: 6, rarity: 'epic' });
      }
      continue;
    }
    if (lv === 0 && st.skills.size >= MAX_SKILLS) continue;
    out.push({
      kind: 'skill',
      id: def.id,
      name: lv === 0 ? `${def.name} (Yeni)` : `${def.name} Sv${lv + 1}`,
      description: lv === 0 ? `${def.desc} ${def.levels[0]}.` : `${def.levels[lv]}.`,
      icon: def.icon,
      level: lv + 1,
      rarity: lv === 0 ? (def.heroes ? 'epic' : 'rare') : 'common',
    });
  }
  for (const def of Object.values(PASSIVES)) {
    const lv = st.passives.get(def.id) ?? 0;
    if (lv >= PASSIVE_MAX) continue;
    if (lv === 0 && st.passives.size >= MAX_PASSIVES) continue;
    const evoFor = Object.values(RUN_SKILLS).find((s) => s.evo.passive === def.id && st.skills.has(s.id));
    out.push({
      kind: 'passive',
      id: def.id,
      name: `${def.name} Sv${lv + 1}`,
      description: def.desc + (evoFor && lv === 0 ? ` (${evoFor.name} evrimini açar)` : ''),
      icon: def.icon,
      level: lv + 1,
      rarity: 'common',
    });
  }
  return out;
}

export function applyRunSkillCard(st: RunSkillState, kind: RunSkillCard['kind'], id: string): void {
  if (kind === 'skill') st.skills.set(id as RunSkillId, Math.min(SKILL_MAX, (st.skills.get(id as RunSkillId) ?? 0) + 1));
  else if (kind === 'passive') st.passives.set(id as PassiveId, Math.min(PASSIVE_MAX, (st.passives.get(id as PassiveId) ?? 0) + 1));
  else st.evolved.add(id as RunSkillId);
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export interface RunSkillCtx {
  scene: THREE.Scene;
  fx: SkillFx;
  player: OperativeVisual;
  zombies: ZombieVisual[];
  state: RunSkillState;
  damageZombie: (z: ZombieVisual, dmg: number, at: THREE.Vector3, dir: THREE.Vector3) => void;
  shake: (v: number) => void;
  sfx: (kind: 'throw' | 'boom' | 'zap' | 'shot' | 'saw') => void;
  /** global multiplier from stat cards (ability power) */
  powerMult: () => number;
  /** fire-support hooks */
  sample: (key: string, opts?: { gain?: number; pan?: number; rate?: number; bus?: 'combat' | 'player' | 'ui' }) => void;
  radio: () => void;
  say: (text: string, who: 'me' | 'radio') => void;
  supplyLanded: (at: THREE.Vector3) => void;
}

interface Proj {
  kind: 'grenade' | 'bomblet' | 'molotov' | 'rocket' | 'knife' | 'boomerang' | 'meteor' | 'missile';
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  dur: number;
  dmg: number;
  radius: number;
  target?: ZombieVisual | null;
  pierce: number;
  hit?: Set<ZombieVisual>;
  hitCd?: Map<ZombieVisual, number>;
  out?: number;
}
interface Pool {
  x: number;
  z: number;
  r: number;
  dps: number;
  life: number;
  max: number;
  tick: number;
  glow: THREE.Mesh;
}
interface Mine {
  mesh: THREE.Group;
  light: THREE.Mesh;
  t: number;
  armed: number;
}
interface Drone {
  mesh: THREE.Group;
  rotors: THREE.Object3D[];
  ang: number;
  cd: number;
  mcd: number;
}
interface Turret {
  mesh: THREE.Group;
  head: THREE.Object3D;
  life: number;
  cd: number;
  rcd: number;
}
interface Vortex {
  x: number;
  z: number;
  r: number;
  life: number;
  max: number;
  dps: number;
  burst: number;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  tick: number;
}
interface Beam {
  life: number;
  fire: number;
  max: number;
  base: number;
  sweep: number;
  dps: number;
  width: number;
  len: number;
  tick: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class RunSkillRuntime {
  private readonly ctx: RunSkillCtx;
  private readonly cd = new Map<RunSkillId, number>();
  private readonly projs: Proj[] = [];
  private readonly pools: Pool[] = [];
  private readonly mines: Mine[] = [];
  private readonly drones: Drone[] = [];
  private readonly turrets: Turret[] = [];
  private readonly vortexes: Vortex[] = [];
  private readonly beams: Beam[] = [];
  private readonly saws: THREE.Group[] = [];
  private readonly sawHit = new Map<ZombieVisual, number>();
  private sawAng = 0;
  private auraTick = 0;
  private auraGlow: THREE.Mesh | null = null;
  private teslaTick = 0;
  private mineDrop = 0;
  private time = 0;
  private readonly mats: THREE.Material[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly g: Record<string, THREE.BufferGeometry>;
  private readonly m: Record<string, THREE.Material>;

  private readonly support: SupportCalls;
  private supportLock = 0;

  constructor(ctx: RunSkillCtx) {
    this.ctx = ctx;
    this.support = new SupportCalls({
      scene: ctx.scene,
      fx: ctx.fx,
      player: ctx.player,
      zombies: ctx.zombies,
      hit: (z, dmg, at, from) => this.hit(z, dmg, at, from),
      shake: ctx.shake,
      sample: ctx.sample,
      radio: ctx.radio,
      say: ctx.say,
      supplyLanded: ctx.supplyLanded,
    });
    const keepG = <T extends THREE.BufferGeometry>(x: T) => (this.geos.push(x), x);
    const keepM = <T extends THREE.Material>(x: T) => (this.mats.push(x), x);
    const metal = (c: number, r = 0.35, e = 0) => keepM(new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: r, emissive: e, emissiveIntensity: e ? 1.4 : 0 }));
    const glow = (c: number, o = 0.8) => keepM(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    // saw blade: toothed disc
    const shape = new THREE.Shape();
    const teeth = 14;
    for (let i = 0; i <= teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.42 : 0.33;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.07, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const saw = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
    saw.rotateX(-Math.PI / 2);
    // boomerang
    const bs = new THREE.Shape();
    bs.moveTo(-0.5, 0);
    bs.quadraticCurveTo(0, 0.55, 0.5, 0);
    bs.quadraticCurveTo(0, 0.28, -0.5, 0);
    const boom = new THREE.ExtrudeGeometry(bs, { depth: 0.035, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
    boom.rotateX(-Math.PI / 2);
    boom.translate(0, 0, -0.14);
    // knife
    const ks = new THREE.Shape();
    ks.moveTo(0, 0.32);
    ks.lineTo(0.05, 0.05);
    ks.lineTo(0.03, -0.12);
    ks.lineTo(-0.03, -0.12);
    ks.lineTo(-0.05, 0.05);
    ks.closePath();
    const knife = new THREE.ExtrudeGeometry(ks, { depth: 0.015, bevelEnabled: false });
    knife.rotateX(-Math.PI / 2);
    this.g = {
      saw: keepG(saw),
      boom: keepG(boom),
      knife: keepG(knife),
      frag: keepG(new THREE.SphereGeometry(0.13, 12, 10)),
      bottle: keepG(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 10)),
      rocket: keepG(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8).rotateX(Math.PI / 2)),
      cone: keepG(new THREE.ConeGeometry(0.05, 0.12, 8).rotateX(Math.PI / 2)),
      disc: keepG(new THREE.CircleGeometry(1, 40)),
      ring: keepG(new THREE.RingGeometry(0.82, 1, 64)),
      thinRing: keepG(new THREE.RingGeometry(0.95, 1, 72)),
      sphere: keepG(new THREE.SphereGeometry(1, 24, 16)),
      box: keepG(new THREE.BoxGeometry(1, 1, 1)),
      cyl: keepG(new THREE.CylinderGeometry(1, 1, 1, 12)),
      puck: keepG(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 16)),
      rotor: keepG(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 16)),
    };
    this.m = {
      steel: metal(0xd4d8dc, 0.25),
      dark: metal(0x2a2e33, 0.5),
      gold: metal(0xd9a520, 0.3),
      olive: keepM(new THREE.MeshStandardMaterial({ color: 0x3e4a2c, roughness: 0.7, metalness: 0.3 })),
      glass: keepM(new THREE.MeshStandardMaterial({ color: 0x5c8a3a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0xff5a1f, emissiveIntensity: 0.4 })),
      red: keepM(new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false })),
      cyan: keepM(new THREE.MeshBasicMaterial({ color: 0xb02018 })),
      fireGlow: glow(0xff5a1a, 0.2),
      auraGlow: glow(0xff6a1a, 0.08),
      frostGlow: glow(0x9be7ff, 0.6),
      purple: glow(0xa78bfa, 0.7),
      voidM: keepM(new THREE.MeshBasicMaterial({ color: 0x050208 })),
      rock: keepM(new THREE.MeshStandardMaterial({ color: 0x2b1a10, emissive: 0xff5a1a, emissiveIntensity: 1.6, roughness: 0.9 })),
      rotorM: keepM(new THREE.MeshBasicMaterial({ color: 0x9aa4ad, transparent: true, opacity: 0.35, depthWrite: false })),
    };
  }

  // ------------------------------------------------------------ scaling
  private lv(id: RunSkillId): number {
    return this.ctx.state.skills.get(id) ?? 0;
  }
  private evo(id: RunSkillId): boolean {
    return this.ctx.state.evolved.has(id);
  }
  private pv(id: PassiveId): number {
    return this.ctx.state.passives.get(id) ?? 0;
  }
  private dmgMul(): number {
    return (1 + 0.12 * this.pv('core')) * this.ctx.powerMult();
  }
  private area(): number {
    return 1 + 0.1 * this.pv('area');
  }
  private cdMul(): number {
    return 1 - 0.08 * this.pv('cooldown');
  }
  private amount(): number {
    const a = this.pv('amount');
    return a >= 4 ? 2 : a >= 2 ? 1 : 0;
  }
  private durMul(): number {
    return 1 + 0.12 * this.pv('duration');
  }
  private velMul(): number {
    return 1 + 0.1 * this.pv('velocity');
  }
  private fuel(): number {
    return 1 + 0.2 * this.pv('fuel');
  }
  /** level damage curve: +30 % per level after 1 */
  private lvMul(id: RunSkillId): number {
    return 1 + 0.3 * (this.lv(id) - 1);
  }
  private hit(z: ZombieVisual, dmg: number, at: THREE.Vector3, from?: THREE.Vector3): void {
    if (z.hp <= 0) return;
    const crit = Math.random() < 0.06 * this.pv('capacitor');
    _d.copy(at).sub(from ?? this.ctx.player.root.position).setY(0);
    if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1);
    _d.normalize();
    this.ctx.damageZombie(z, dmg * this.dmgMul() * (crit ? 2 : 1), at, _d);
  }
  private inRadius(x: number, z: number, r: number, fn: (zz: ZombieVisual, d: number) => void): void {
    const r2 = r * r;
    for (const zz of this.ctx.zombies) {
      if (zz.hp <= 0) continue;
      const dx = zz.root.position.x - x;
      const dz = zz.root.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) fn(zz, Math.sqrt(d2));
    }
  }
  private nearest(from: THREE.Vector3, range: number, exclude?: Set<ZombieVisual>): ZombieVisual | null {
    let best: ZombieVisual | null = null;
    let bd = range * range;
    for (const z of this.ctx.zombies) {
      if (z.hp <= 0 || exclude?.has(z)) continue;
      const d = z.root.position.distanceToSquared(from);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }
  private randomTarget(range: number): ZombieVisual | null {
    const p = this.ctx.player.root.position;
    const list = this.ctx.zombies.filter((z) => z.hp > 0 && z.root.position.distanceToSquared(p) < range * range);
    return list.length ? list[Math.floor(Math.random() * list.length)]! : null;
  }
  /** Toughest zombies in range (bosses / tanks first). */
  private strongest(range: number): ZombieVisual[] {
    const p = this.ctx.player.root.position;
    return this.ctx.zombies
      .filter((z) => z.hp > 0 && z.root.position.distanceToSquared(p) < range * range)
      .sort((a, b) => b.hp - a.hp)
      .slice(0, 8);
  }
  /** Zombie with the most neighbours (cluster) within range. */
  private clusterTarget(range: number): THREE.Vector3 | null {
    const p = this.ctx.player.root.position;
    let best: ZombieVisual | null = null;
    let bs = -1;
    const cand = this.ctx.zombies.filter((z) => z.hp > 0 && z.root.position.distanceToSquared(p) < range * range);
    for (let i = 0; i < Math.min(cand.length, 18); i++) {
      const z = cand[Math.floor(Math.random() * cand.length)]!;
      let n = 0;
      for (const o of cand) if (o.root.position.distanceToSquared(z.root.position) < 9) n++;
      if (n > bs) {
        bs = n;
        best = z;
      }
    }
    return best ? best.root.position.clone() : null;
  }
  private ready(id: RunSkillId, dt: number, base: number): boolean {
    const c = (this.cd.get(id) ?? rnd(0.3, 1.2)) - dt;
    if (c > 0) {
      this.cd.set(id, c);
      return false;
    }
    this.cd.set(id, base * this.cdMul());
    return true;
  }

  // ------------------------------------------------------------ main loop
  update(dt: number, moving: boolean): void {
    this.time += dt;
    const p = this.ctx.player;
    const alive = p.alive;
    const st = this.ctx.state;
    if (alive) {
      if (st.skills.has('lightning') && this.ready('lightning', dt, this.evo('lightning') ? 1.5 : 2.4)) this.castLightning();
      if (st.skills.has('grenade') && this.ready('grenade', dt, 3.0)) this.castGrenade();
      if (st.skills.has('molotov') && this.ready('molotov', dt, 4.6)) this.castMolotov();
      if (st.skills.has('boomerang') && this.ready('boomerang', dt, 2.3)) this.castBoomerang();
      if (st.skills.has('laser') && this.ready('laser', dt, 3.6)) this.castLaser();
      if (st.skills.has('turret') && this.ready('turret', dt, 15)) this.castTurret();
      if (st.skills.has('frostNova') && this.ready('frostNova', dt, 5.5)) this.castFrost();
      if (st.skills.has('rockets') && this.ready('rockets', dt, this.evo('rockets') ? 2.1 : 3.2)) this.castRockets();
      if (st.skills.has('meteor') && this.ready('meteor', dt, 8.5 - (this.lv('meteor') >= 4 ? 1.7 : 0))) this.castMeteor();
      if (st.skills.has('gravity') && this.ready('gravity', dt, 9)) this.castGravity();
      if (st.skills.has('knives') && this.ready('knives', dt, this.evo('knives') ? 1.0 : 1.8)) this.castKnives();
      if (st.skills.has('mines')) this.tickMines(dt, moving);
      if (st.skills.has('tesla')) this.tickTesla(dt);
      if (this.time >= this.supportLock) {
        for (const [id, kind, base] of SUPPORT_SKILLS) {
          if (!st.skills.has(id)) continue;
          const lvl = this.lv(id);
          if (!this.ready(id, dt, base * (lvl >= 5 ? 0.8 : 1) * (id === 'supplyDrop' ? 1 - 0.08 * (lvl - 1) : 1))) continue;
          if (this.support.call(kind, lvl, this.evo(id), 1, this.clusterTarget(18), this.strongest(18))) {
            this.supportLock = this.time + 7;
            break;
          }
          this.cd.set(id, 2);
        }
      }
    }
    this.support.update(dt);
    this.tickSaws(dt, alive && st.skills.has('saws'));
    this.tickAura(dt, alive && st.skills.has('fireAura'));
    this.tickDrones(dt, alive && st.skills.has('drone'));
    this.tickTurrets(dt);
    this.tickProjs(dt);
    this.tickPools(dt);
    this.tickVortex(dt);
    this.tickBeams(dt);
    this.tickMineTriggers(dt);
  }

  // ------------------------------------------------------------ skills
  private castLightning(): void {
    const L = this.lv('lightning');
    const n = 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) + this.amount();
    const dmg = 7 * this.lvMul('lightning');
    const r = 1.9 * this.area() * (L >= 4 ? 1.25 : 1);
    for (let i = 0; i < n; i++) {
      const z = this.randomTarget(17);
      if (!z) return;
      const at = z.root.position.clone().setY(0);
      const extra = this.evo('lightning') ? 4 : 0;
      for (let k = 0; k <= extra; k++) {
        const p = k === 0 ? at : at.clone().add(new THREE.Vector3(rnd(-3.5, 3.5), 0, rnd(-3.5, 3.5)));
        this.shell(p, k === 0 ? dmg : dmg * 0.6, k === 0 ? r : r * 0.8, i * 0.18 + k * 0.12);
      }
    }
  }

  /** Mortar shell: falls in steeply, then a real HE blast. */
  private shell(at: THREE.Vector3, dmg: number, r: number, delay: number): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.g.rocket!, this.m.dark!);
    body.scale.set(1.2, 1.2, 0.8);
    g.add(body);
    const from = at.clone().add(new THREE.Vector3(rnd(-3, 3), 22, rnd(-3, 3)));
    g.position.copy(from);
    g.visible = false;
    this.ctx.scene.add(g);
    this.projs.push({ kind: 'meteor', mesh: g, from, to: at.clone(), vel: new THREE.Vector3(), t: -delay, dur: 0.5, dmg, radius: r, pierce: -1 });
  }

  private chain(from: ZombieVisual, jumps: number, dmg: number, range: number, color: number): void {
    const seen = new Set<ZombieVisual>([from]);
    let cur = from;
    for (let j = 0; j < jumps; j++) {
      const nx = this.nearest(cur.root.position, range, seen);
      if (!nx) break;
      seen.add(nx);
      this.ctx.fx.bolt(cur.root.position.clone().setY(1.2), nx.root.position.clone().setY(1.2), color, 0.1, 0.14, 8);
      this.hit(nx, dmg, nx.root.position.clone().setY(1.2), cur.root.position);
      cur = nx;
    }
  }

  private throwArc(kind: Proj['kind'], mesh: THREE.Object3D, to: THREE.Vector3, dmg: number, radius: number, dur = 0.7): void {
    const from = this.ctx.player.root.position.clone().setY(1.4);
    mesh.position.copy(from);
    this.ctx.scene.add(mesh);
    this.projs.push({ kind, mesh, from, to: to.clone().setY(0.1), vel: new THREE.Vector3(), t: 0, dur, dmg, radius, pierce: 0 });
  }

  private castGrenade(): void {
    const L = this.lv('grenade');
    const n = 1 + (L >= 4 ? 1 : 0) + this.amount();
    for (let i = 0; i < n; i++) {
      const at = this.clusterTarget(15) ?? this.randomTarget(15)?.root.position.clone();
      if (!at) return;
      at.x += rnd(-1, 1) * i;
      at.z += rnd(-1, 1) * i;
      const g = new THREE.Mesh(this.g.frag!, this.m.olive!);
      this.throwArc('grenade', g, at, 10 * this.lvMul('grenade') * (L >= 5 ? 1.08 : 1), 2.6 * this.area() * (L >= 3 ? 1.2 : 1));
    }
    this.ctx.sfx('throw');
  }

  private castMolotov(): void {
    const L = this.lv('molotov');
    const evo = this.evo('molotov');
    const n = (evo ? 4 : 1 + (L >= 4 ? 1 : 0)) + this.amount();
    for (let i = 0; i < n; i++) {
      const at = (i === 0 ? this.clusterTarget(14) : null) ?? this.randomTarget(14)?.root.position.clone();
      if (!at) return;
      const b = new THREE.Mesh(this.g.bottle!, this.m.glass!);
      this.throwArc('molotov', b, at, 4.2 * this.lvMul('molotov') * this.fuel() * (evo ? 1.4 : 1), 2.2 * this.area() * (L >= 3 ? 1.2 : 1) * (1 + 0.08 * this.pv('fuel')) * (evo ? 1.35 : 1), 0.65);
    }
    this.ctx.sfx('throw');
  }

  private castBoomerang(): void {
    const L = this.lv('boomerang');
    const evo = this.evo('boomerang');
    const n = 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) + this.amount() + (evo ? 2 : 0);
    const t = this.nearest(this.ctx.player.root.position, 16);
    const base = t ? Math.atan2(t.root.position.x - this.ctx.player.root.position.x, t.root.position.z - this.ctx.player.root.position.z) : Math.random() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.45;
      const mesh = new THREE.Mesh(this.g.boom!, this.m.gold!);
      mesh.scale.setScalar(evo ? 2.2 : 1.2);
      const from = this.ctx.player.root.position.clone().setY(1.1);
      mesh.position.copy(from);
      this.ctx.scene.add(mesh);
      const range = 9 * this.velMul() * (L >= 4 ? 1.25 : 1);
      this.projs.push({
        kind: 'boomerang',
        mesh,
        from,
        to: from.clone().add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(range)),
        vel: new THREE.Vector3(),
        t: 0,
        dur: 1.5 / this.velMul(),
        dmg: 5.5 * this.lvMul('boomerang') * (evo ? 2 : 1),
        radius: evo ? 1.3 : 0.85,
        pierce: 999,
        hitCd: new Map(),
      });
    }
    this.ctx.sfx('throw');
  }

  private castLaser(): void {
    const L = this.lv('laser');
    const evo = this.evo('laser');
    const t = this.nearest(this.ctx.player.root.position, 16);
    const p = this.ctx.player.root.position;
    const base = t ? Math.atan2(t.root.position.x - p.x, t.root.position.z - p.z) : this.ctx.player.root.rotation.y;
    const dirs = evo ? [base, base + Math.PI] : [base];
    for (const a of dirs) {
      this.beams.push({
        life: (1.2 + (L >= 3 ? 0.5 : 0)) * this.durMul() * (evo ? 1.5 : 1),
        max: (1.2 + (L >= 3 ? 0.5 : 0)) * this.durMul() * (evo ? 1.5 : 1),
        base: a - 0.6,
        sweep: 1.2,
        dps: 16 * this.lvMul('laser') * (evo ? 1.6 : 1),
        width: 0.75 * this.area() * (L >= 4 ? 1.25 : 1) * (evo ? 1.6 : 1),
        len: 15 * (evo ? 1.3 : 1),
        tick: 0,
        fire: 0,
      });
    }
  }

  private castTurret(): void {
    const evo = this.evo('turret');
    const n = evo ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const leg = new THREE.Mesh(this.g.cyl!, this.m.dark!);
        leg.scale.set(0.03, 0.75, 0.03);
        const a = (k / 3) * Math.PI * 2;
        leg.position.set(Math.cos(a) * 0.22, 0.32, Math.sin(a) * 0.22);
        leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
        g.add(leg);
      }
      const head = new THREE.Group();
      head.position.y = 0.78;
      const body = new THREE.Mesh(this.g.box!, this.m.olive!);
      body.scale.set(0.34, 0.24, 0.46);
      const barrel = new THREE.Mesh(this.g.cyl!, this.m.dark!);
      barrel.scale.set(0.04, 0.55, 0.04);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, 0.45);
      const eye = new THREE.Mesh(this.g.box!, this.m.cyan!);
      eye.scale.set(0.14, 0.04, 0.02);
      eye.position.set(0, 0.06, 0.235);
      head.add(body, barrel, eye);
      g.add(head);
      const p = this.ctx.player.root.position;
      g.position.set(p.x + (i === 0 ? 1.2 : -1.2), 0, p.z + 0.6);
      g.scale.setScalar(1.3);
      this.ctx.scene.add(g);
      this.ctx.fx.shockRing(g.position, 1.4, 0x22d3ee, 0.4);
      const L = this.lv('turret');
      this.turrets.push({ mesh: g, head, life: (8 + (L >= 3 ? 3 : 0)) * this.durMul() * (evo ? 1.5 : 1), cd: 0, rcd: 1.5 });
    }
  }

  private castFrost(): void {
    const L = this.lv('frostNova');
    const evo = this.evo('frostNova');
    const p = this.ctx.player.root.position.clone();
    const r = (4 + (L >= 3 ? 0.9 : 0)) * this.area() * (evo ? 1.4 : 1);
    const dmg = 5 * this.lvMul('frostNova') * (evo ? 1.5 : 1);
    const slow = 1.5 + (L >= 4 ? 1 : 0) + (evo ? 3 : 0);
    this.inRadius(p.x, p.z, r, (z) => {
      this.hit(z, dmg, z.root.position.clone().setY(1), p);
      applyStatus(z, 'chill', slow, evo ? 1.8 : 1.2);
    });
    this.ctx.fx.vapor(p, r * 0.6);
    this.ctx.fx.shockRing(p, r, 0xdfe6ea, 0.5);
    // frost rime left on the ground
    const rime = new THREE.Mesh(this.g.disc!, new THREE.MeshBasicMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0.22, depthWrite: false }));
    rime.rotation.x = -Math.PI / 2;
    rime.position.set(p.x, 0.03, p.z);
    rime.scale.setScalar(r * 0.85);
    this.ctx.scene.add(rime);
    this.ctx.fx.add(rime, 2.5, (k, o) => (((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.22 * (1 - k)));
    this.ctx.sfx('throw');
  }

  private castRockets(): void {
    const L = this.lv('rockets');
    const evo = this.evo('rockets');
    let n = 2 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) + this.amount();
    if (evo) n *= 2;
    for (let i = 0; i < n; i++) {
      const tgt = this.randomTarget(18);
      if (!tgt) return;
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.g.rocket!, this.m.steel!);
      const nose = new THREE.Mesh(this.g.cone!, this.m.red!);
      nose.position.z = 0.26;
      g.add(body, nose);
      const from = this.ctx.player.root.position.clone().setY(2.0);
      g.position.copy(from);
      this.ctx.scene.add(g);
      const a = Math.random() * Math.PI * 2;
      this.projs.push({
        kind: 'rocket',
        mesh: g,
        from,
        to: tgt.root.position.clone(),
        vel: new THREE.Vector3(Math.cos(a) * 4, 7 + Math.random() * 2, Math.sin(a) * 4),
        t: 0,
        dur: 3,
        dmg: 7 * this.lvMul('rockets'),
        radius: 1.9 * this.area() * (L >= 4 ? 1.2 : 1),
        target: tgt,
        pierce: 0,
      });
    }
    this.ctx.sfx('throw');
  }

  private castMeteor(): void {
    const L = this.lv('meteor');
    const n = this.evo('meteor') ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const at = (i === 0 ? this.clusterTarget(18) : null) ?? this.randomTarget(18)?.root.position.clone();
      if (!at) return;
      const r = (3.4 + (L >= 3 ? 0.8 : 0)) * this.area();
      const rock = new THREE.Group();
      const body = new THREE.Mesh(this.g.rocket!, this.m.steel!);
      body.scale.set(2.4, 2.4, 2.6);
      const nose = new THREE.Mesh(this.g.cone!, this.m.dark!);
      nose.scale.setScalar(2.4);
      nose.position.z = 0.65;
      rock.add(body, nose);
      const from = at.clone().add(new THREE.Vector3(rnd(-6, 6), 26, rnd(-6, 6)));
      rock.position.copy(from);
      this.ctx.scene.add(rock);
      // telegraph
      const mark = new THREE.Mesh(this.g.thinRing!, new THREE.MeshBasicMaterial({ color: 0x8a2a1a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(at.x, 0.06, at.z);
      mark.scale.setScalar(r);
      this.ctx.scene.add(mark);
      this.ctx.fx.add(mark, 1.0 + i * 0.25, (k, o) => (((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.3 * k));
      this.projs.push({ kind: 'meteor', mesh: rock, from, to: at.setY(0), vel: new THREE.Vector3(), t: -i * 0.25, dur: 1.0, dmg: 24 * this.lvMul('meteor') * (L >= 5 ? 1.1 : 1), radius: r, pierce: 0 });
    }
  }

  private castGravity(): void {
    const at = this.clusterTarget(15);
    if (!at) return;
    const L = this.lv('gravity');
    const evo = this.evo('gravity');
    const r = 5 * this.area() * (L >= 3 ? 1.2 : 1) * (evo ? 1.5 : 1);
    const life = (2.5 + (L >= 4 ? 0.8 : 0)) * this.durMul() * (evo ? 1.3 : 1);
    // lure device: a small olive canister with a blinking red LED
    const core = new THREE.Mesh(this.g.sphere!, this.m.dark!);
    core.scale.set(0.22, 0.14, 0.22);
    core.position.set(at.x, 0.14, at.z);
    core.castShadow = true;
    const ring = new THREE.Mesh(this.g.sphere!, this.m.cyan!);
    ring.scale.setScalar(0.045);
    ring.position.set(at.x, 0.29, at.z);
    this.ctx.scene.add(core, ring);
    this.ctx.fx.dustRing(new THREE.Vector3(at.x, 0, at.z), 0.8);
    this.vortexes.push({ x: at.x, z: at.z, r, life, max: life, dps: 3.5 * this.lvMul('gravity') * (evo ? 2 : 1), burst: 12 * this.lvMul('gravity') * (L >= 5 ? 1.15 : 1) * (evo ? 2 : 1), core, ring, tick: 0 });
    this.ctx.sfx('zap');
  }

  private castKnives(): void {
    const L = this.lv('knives');
    const evo = this.evo('knives');
    const n = evo ? 16 : 5 + (L >= 3 ? 2 : 0) + (L >= 5 ? 2 : 0) + this.amount() * 2;
    const p = this.ctx.player.root.position;
    const off = this.time * 1.7;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const mesh = new THREE.Mesh(this.g.knife!, this.m.steel!);
      mesh.scale.setScalar(1.6);
      mesh.position.set(p.x, 1.1, p.z);
      mesh.lookAt(mesh.position.clone().add(dir));
      mesh.rotateX(Math.PI / 2);
      this.ctx.scene.add(mesh);
      const sp = 15 * this.velMul();
      this.projs.push({
        kind: 'knife',
        mesh,
        from: mesh.position.clone(),
        to: new THREE.Vector3(),
        vel: dir.multiplyScalar(sp),
        t: 0,
        dur: 0.75,
        dmg: 3.6 * this.lvMul('knives'),
        radius: 0.7,
        pierce: evo ? 3 : L >= 4 ? 2 : 1,
        hit: new Set(),
      });
    }
    this.ctx.sfx('throw');
  }

  // ------------------------------------------------------------ persistent
  private tickSaws(dt: number, on: boolean): void {
    const L = this.lv('saws');
    const evo = this.evo('saws');
    const want = on ? (evo ? 8 : 2 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) + this.amount()) : 0;
    while (this.saws.length < want) {
      const g = new THREE.Group();
      const blade = new THREE.Mesh(this.g.saw!, this.m.steel!);
      blade.castShadow = true;
      g.add(blade);
      this.ctx.scene.add(g);
      this.saws.push(g);
    }
    while (this.saws.length > want) this.saws.pop()!.removeFromParent();
    if (!want) return;
    const p = this.ctx.player.root.position;
    const radius = (2.3 + (L >= 4 ? 0.5 : 0)) * this.area() * (evo ? 1.4 : 1);
    const scale = (evo ? 1.55 : 1.1) * Math.sqrt(this.area());
    this.sawAng += dt * 3.3 * this.velMul() * (L >= 4 ? 1.25 : 1);
    const dmg = 3.2 * this.lvMul('saws') * (evo ? 1.6 : 1);
    for (const [z, t] of this.sawHit) {
      if (t - dt <= 0) this.sawHit.delete(z);
      else this.sawHit.set(z, t - dt);
    }
    this.saws.forEach((g, i) => {
      const a = this.sawAng + (i / want) * Math.PI * 2;
      g.position.set(p.x + Math.cos(a) * radius, 1.0, p.z + Math.sin(a) * radius);
      g.scale.setScalar(scale);
      g.rotation.y += dt * 26;
      if (Math.random() < 0.06) this.ctx.fx.emit('spark', g.position.x, 1, g.position.z, { life: 0.15, s0: 0.25, s1: 0.05, color: 0xfff1c0, vy: 2 });
      this.inRadius(g.position.x, g.position.z, 0.45 * scale + 0.35, (z) => {
        if (this.sawHit.has(z)) return;
        this.sawHit.set(z, 0.32);
        this.hit(z, dmg, z.root.position.clone().setY(1.1), g.position);
        this.ctx.fx.sparks(g.position, 4, 0xffe6a0, 4);
      });
    });
  }

  private tickAura(dt: number, on: boolean): void {
    if (!on) {
      if (this.auraGlow) {
        this.auraGlow.removeFromParent();
        this.auraGlow = null;
      }
      return;
    }
    const L = this.lv('fireAura');
    const evo = this.evo('fireAura');
    const r = (2.3 + (L >= 3 ? 0.5 : 0) + (L >= 5 ? 0.5 : 0)) * this.area() * (evo ? 1.5 : 1) * (1 + 0.08 * this.pv('fuel'));
    if (!this.auraGlow) {
      this.auraGlow = new THREE.Mesh(this.g.thinRing!, this.m.auraGlow!);
      this.auraGlow.rotation.x = -Math.PI / 2;
      this.ctx.scene.add(this.auraGlow);
    }
    const p = this.ctx.player.root.position;
    this.auraGlow.position.set(p.x, 0.07, p.z);
    this.auraGlow.scale.setScalar(r * (1 + Math.sin(this.time * 6) * 0.03));
    const flames = Math.ceil(r * 3 * dt * 60 * 0.2);
    for (let i = 0; i < flames; i++) {
      const a = Math.random() * Math.PI * 2;
      this.ctx.fx.flame(p.x + Math.cos(a) * r * rnd(0.85, 1), p.z + Math.sin(a) * r * rnd(0.85, 1), evo ? 1.1 : 0.8, evo ? 0xff3d1a : 0xff7a2a);
    }
    this.auraTick -= dt;
    if (this.auraTick > 0) return;
    this.auraTick = 0.3;
    const dmg = 2.2 * this.lvMul('fireAura') * (evo ? 2 : 1) * this.fuel();
    this.inRadius(p.x, p.z, r, (z) => {
      this.hit(z, dmg, z.root.position.clone().setY(1), p);
      applyStatus(z, 'burn', (evo ? 2.4 : 1.2) * this.fuel());
    });
  }

  private tickTesla(dt: number): void {
    const L = this.lv('tesla');
    const evo = this.evo('tesla');
    this.teslaTick -= dt;
    if (this.teslaTick > 0) return;
    this.teslaTick = (evo ? 0.45 : 0.75) * this.cdMul();
    const p = this.ctx.player.root.position;
    const range = 6.5 * this.area() * (L >= 4 ? 1.2 : 1);
    const n = evo ? 6 : 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) + this.amount();
    const jumps = evo ? 3 : L >= 5 ? 1 : 0;
    const dmg = 3.4 * this.lvMul('tesla');
    const seen = new Set<ZombieVisual>();
    const src = p.clone().setY(2.1);
    let any = false;
    for (let i = 0; i < n; i++) {
      const z = this.nearest(p, range, seen);
      if (!z) break;
      seen.add(z);
      any = true;
      this.ctx.fx.bolt(src, z.root.position.clone().setY(1.2), 0xd8e6ff, 0.06, 0.1, 9);
      this.hit(z, dmg, z.root.position.clone().setY(1.2), p);
      if (jumps) this.chain(z, jumps, dmg * 0.6, 4.5, 0xd8e6ff);
    }
    if (any) {
      this.ctx.fx.emit('elec', src.x, src.y, src.z, { life: 0.1, s0: 0.5, s1: 0.2, color: 0xe8f0ff });
      this.ctx.sfx('zap');
    }
  }

  private tickMines(dt: number, moving: boolean): void {
    const L = this.lv('mines');
    const evo = this.evo('mines');
    const max = 4 + (L >= 3 ? 2 : 0) + this.amount() * 2 + (evo ? 4 : 0);
    this.mineDrop -= dt * (moving ? 1 : 0.4);
    if (this.mineDrop > 0) return;
    this.mineDrop = (evo ? 0.9 : L >= 3 ? 1.3 : 1.7) * this.cdMul();
    if (this.mines.length >= max) {
      const old = this.mines.shift()!;
      old.mesh.removeFromParent();
    }
    const g = new THREE.Group();
    const puck = new THREE.Mesh(this.g.puck!, this.m.dark!);
    puck.position.y = 0.04;
    const light = new THREE.Mesh(this.g.sphere!, this.m.red!);
    light.scale.setScalar(0.05);
    light.position.y = 0.1;
    g.add(puck, light);
    const p = this.ctx.player.root.position;
    g.position.set(p.x, 0, p.z);
    this.ctx.scene.add(g);
    this.mines.push({ mesh: g, light, t: 0, armed: 0.5 });
  }

  private tickMineTriggers(dt: number): void {
    if (!this.mines.length) return;
    const L = this.lv('mines');
    const evo = this.evo('mines');
    const r = 2.5 * this.area() * (L >= 4 ? 1.2 : 1) * (evo ? 1.6 : 1);
    const dmg = 12 * this.lvMul('mines') * (evo ? 2 : 1);
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i]!;
      m.t += dt;
      m.light.visible = Math.floor(m.t * 4) % 2 === 0;
      if (m.t < m.armed) continue;
      const pos = m.mesh.position;
      let trig = false;
      this.inRadius(pos.x, pos.z, 1.2, () => (trig = true));
      if (!trig) continue;
      this.boom(pos, r, dmg, 0xff8a2a);
      m.mesh.removeFromParent();
      this.mines.splice(i, 1);
    }
  }

  private buildDrone(): Drone {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.g.box!, this.m.dark!);
    body.scale.set(0.3, 0.1, 0.3);
    g.add(body);
    const rotors: THREE.Object3D[] = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const arm = new THREE.Mesh(this.g.box!, this.m.dark!);
      arm.scale.set(0.04, 0.03, 0.34);
      arm.position.set(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
      arm.rotation.y = -a + Math.PI / 2;
      const rot = new THREE.Mesh(this.g.rotor!, this.m.rotorM!);
      rot.position.set(Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32);
      g.add(arm, rot);
      rotors.push(rot);
    }
    const eye = new THREE.Mesh(this.g.sphere!, this.m.cyan!);
    eye.scale.setScalar(0.05);
    eye.position.set(0, -0.04, 0.16);
    g.add(eye);
    g.scale.setScalar(1.5);
    this.ctx.scene.add(g);
    return { mesh: g, rotors, ang: Math.random() * 6.28, cd: 0, mcd: 1 };
  }

  private tickDrones(dt: number, on: boolean): void {
    const L = this.lv('drone');
    const evo = this.evo('drone');
    const want = on ? 1 + (L >= 4 ? 1 : 0) + this.amount() + (evo ? 1 : 0) : 0;
    while (this.drones.length < want) this.drones.push(this.buildDrone());
    while (this.drones.length > want) this.drones.pop()!.mesh.removeFromParent();
    const p = this.ctx.player.root.position;
    const rate = (0.55 - (L >= 3 ? 0.12 : 0)) * (evo ? 0.5 : 1) / this.velMul();
    const dmg = 2.6 * this.lvMul('drone') * (L >= 5 ? 1.05 : 1);
    this.drones.forEach((d, i) => {
      d.ang += dt * 0.9;
      const a = d.ang + (i / Math.max(1, want)) * Math.PI * 2;
      _a.set(p.x + Math.cos(a) * 1.9, 2.7 + Math.sin(this.time * 2 + i) * 0.15, p.z + Math.sin(a) * 1.9);
      d.mesh.position.lerp(_a, 1 - Math.exp(-6 * dt));
      for (const r of d.rotors) r.rotation.y += dt * 40;
      d.cd -= dt;
      d.mcd -= dt;
      const t = this.nearest(d.mesh.position, 14);
      if (t) {
        d.mesh.lookAt(t.root.position.x, d.mesh.position.y, t.root.position.z);
        if (d.cd <= 0) {
          d.cd = rate;
          const to = t.root.position.clone().setY(1.2);
          this.ctx.fx.tracer(d.mesh.position, to);
          this.ctx.fx.sparks(to, 2, 0x7a1010, 2);
          this.hit(t, dmg, to, d.mesh.position);
        }
        if (evo && d.mcd <= 0) {
          d.mcd = 1.8;
          const g = new THREE.Group();
          g.add(new THREE.Mesh(this.g.rocket!, this.m.steel!));
          g.position.copy(d.mesh.position);
          this.ctx.scene.add(g);
          this.projs.push({ kind: 'missile', mesh: g, from: g.position.clone(), to: t.root.position.clone(), vel: new THREE.Vector3(0, 2, 0), t: 0, dur: 2.5, dmg: dmg * 2.5, radius: 1.8 * this.area(), target: t, pierce: 0 });
        }
      }
    });
  }

  private tickTurrets(dt: number): void {
    const L = this.lv('turret');
    const evo = this.evo('turret');
    const rate = (0.24 - (L >= 4 ? 0.07 : 0)) / this.velMul();
    const dmg = 2.3 * this.lvMul('turret');
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i]!;
      t.life -= dt;
      if (t.life <= 0) {
        this.ctx.fx.sparks(t.mesh.position, 10, 0x22d3ee, 4);
        t.mesh.removeFromParent();
        this.turrets.splice(i, 1);
        continue;
      }
      t.cd -= dt;
      t.rcd -= dt;
      const tgt = this.nearest(t.mesh.position, 15);
      if (!tgt) continue;
      const want = Math.atan2(tgt.root.position.x - t.mesh.position.x, tgt.root.position.z - t.mesh.position.z);
      t.head.rotation.y = want;
      if (t.cd <= 0) {
        t.cd = rate;
        _a.set(Math.sin(want) * 0.9, 1.05, Math.cos(want) * 0.9).add(t.mesh.position);
        const to = tgt.root.position.clone().setY(1.1);
        this.ctx.fx.tracer(_a, to);
        this.ctx.fx.emit('flash', _a.x, _a.y, _a.z, { life: 0.06, s0: 0.6, s1: 0.9, color: 0xffd27a });
        this.hit(tgt, dmg, to, t.mesh.position);
        this.ctx.sfx('shot');
      }
      if (evo && t.rcd <= 0) {
        t.rcd = 2.2;
        const g = new THREE.Group();
        g.add(new THREE.Mesh(this.g.rocket!, this.m.steel!));
        g.position.copy(t.mesh.position).setY(1.3);
        this.ctx.scene.add(g);
        this.projs.push({ kind: 'missile', mesh: g, from: g.position.clone(), to: tgt.root.position.clone(), vel: new THREE.Vector3(0, 4, 0), t: 0, dur: 2.5, dmg: dmg * 3, radius: 2 * this.area(), target: tgt, pierce: 0 });
      }
    }
  }

  private boom(at: THREE.Vector3, r: number, dmg: number, color: number): void {
    this.ctx.fx.explosion(at, r, color);
    this.inRadius(at.x, at.z, r, (z, d) => this.hit(z, dmg * (1 - (d / r) * 0.4), z.root.position.clone().setY(1), at));
    this.ctx.shake(Math.min(0.35, 0.08 + r * 0.04));
    this.ctx.sfx('boom');
  }

  private tickProjs(dt: number): void {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i]!;
      pr.t += dt;
      let done = false;
      switch (pr.kind) {
        case 'grenade':
        case 'bomblet':
        case 'molotov': {
          const k = Math.min(1, pr.t / pr.dur);
          pr.mesh.position.lerpVectors(pr.from, pr.to, k);
          pr.mesh.position.y = THREE.MathUtils.lerp(pr.from.y, pr.to.y, k) + Math.sin(k * Math.PI) * (pr.kind === 'bomblet' ? 1.4 : 3.2);
          pr.mesh.rotation.x += dt * 12;
          pr.mesh.rotation.z += dt * 7;
          if (pr.kind === 'molotov' && Math.random() < 0.5) this.ctx.fx.flame(pr.mesh.position.x, pr.mesh.position.z, 0.3);
          if (k >= 1) {
            done = true;
            if (pr.kind === 'molotov') this.spawnPool(pr.to, pr.radius, pr.dmg);
            else {
              this.boom(pr.to, pr.radius, pr.dmg, 0xff8a2a);
              if (pr.kind === 'grenade' && this.evo('grenade')) {
                for (let b = 0; b < 4; b++) {
                  const a = (b / 4) * Math.PI * 2 + Math.random();
                  const to = pr.to.clone().add(new THREE.Vector3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
                  const m = new THREE.Mesh(this.g.frag!, this.m.olive!);
                  m.scale.setScalar(0.7);
                  m.position.copy(pr.to);
                  this.ctx.scene.add(m);
                  this.projs.push({ kind: 'bomblet', mesh: m, from: pr.to.clone().setY(0.4), to, vel: new THREE.Vector3(), t: 0, dur: 0.45, dmg: pr.dmg * 0.5, radius: pr.radius * 0.7, pierce: 0 });
                }
              }
            }
          }
          break;
        }
        case 'rocket':
        case 'missile': {
          if (pr.target && pr.target.hp > 0) pr.to.copy(pr.target.root.position);
          _a.copy(pr.to).setY(0.6).sub(pr.mesh.position);
          const dist = _a.length();
          const sp = pr.kind === 'missile' ? 16 : 14 * this.velMul();
          _a.normalize().multiplyScalar(sp);
          pr.vel.lerp(_a, 1 - Math.exp(-(pr.t < 0.3 ? 1.5 : 5) * dt));
          pr.mesh.position.addScaledVector(pr.vel, dt);
          pr.mesh.lookAt(_b.copy(pr.mesh.position).add(pr.vel));
          this.ctx.fx.emit('fire', pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, { life: 0.12, s0: 0.35, s1: 0.1, color: 0xffb04a });
          if (Math.random() < 0.6) this.ctx.fx.emit('smoke', pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, { life: 0.8, s0: 0.2, s1: 0.7, color: 0x6b6560, a: 0.4, vy: 0.3 });
          if (dist < 0.7 || pr.mesh.position.y < 0.2 || pr.t > pr.dur) {
            done = true;
            this.boom(pr.mesh.position.clone().setY(0.1), pr.radius, pr.dmg, 0xff8a2a);
          }
          break;
        }
        case 'meteor': {
          if (pr.t < 0) break;
          const shell = pr.pierce < 0;
          pr.mesh.visible = true;
          const k = Math.min(1, pr.t / pr.dur);
          pr.mesh.position.lerpVectors(pr.from, pr.to, shell ? k : k * k);
          _a.lerpVectors(pr.from, pr.to, Math.min(1, k + 0.05));
          if (_a.distanceToSquared(pr.mesh.position) > 1e-6) pr.mesh.lookAt(_a);
          const mp = pr.mesh.position;
          if (shell) {
            if (Math.random() < 0.5) this.ctx.fx.emit('smoke', mp.x, mp.y, mp.z, { life: 0.5, s0: 0.15, s1: 0.4, color: 0x8a8478, a: 0.3 });
          } else {
            // rocket motor: small hot exhaust + long grey smoke trail
            this.ctx.fx.emit('fire', mp.x, mp.y + 0.3, mp.z, { life: 0.08, s0: 0.5, s1: 0.2, color: 0xffb060 });
            this.ctx.fx.emit('smoke', mp.x + rnd(-0.1, 0.1), mp.y + 0.5, mp.z + rnd(-0.1, 0.1), { life: 1.6, s0: 0.35, s1: 1.4, color: 0x9a948a, a: 0.45 });
          }
          if (k >= 1) {
            done = true;
            this.boom(pr.to, pr.radius, pr.dmg, 0xffa050);
            if (!shell) {
              this.spawnPool(pr.to, pr.radius * 0.45, pr.dmg * 0.1, 1.8);
              this.ctx.shake(0.5);
            }
          }
          break;
        }
        case 'knife': {
          pr.mesh.position.addScaledVector(pr.vel, dt);
          this.inRadius(pr.mesh.position.x, pr.mesh.position.z, pr.radius, (z) => {
            if (pr.hit!.has(z) || pr.pierce <= 0) return;
            pr.hit!.add(z);
            pr.pierce--;
            this.hit(z, pr.dmg, z.root.position.clone().setY(1.1), pr.mesh.position);
            this.ctx.fx.sparks(pr.mesh.position, 3, 0xffffff, 3);
          });
          if (pr.pierce <= 0 || pr.t > pr.dur) done = true;
          break;
        }
        case 'boomerang': {
          const k = pr.t / pr.dur;
          const out = k < 0.5 ? Math.sin(k * Math.PI) : Math.sin(k * Math.PI);
          const home = this.ctx.player.root.position;
          _a.copy(pr.from).lerp(pr.to, out);
          if (k > 0.5) _a.lerp(_b.copy(home).setY(1.1), (k - 0.5) * 2);
          pr.mesh.position.copy(_a);
          pr.mesh.rotation.y += dt * 22;
          for (const [z, t] of pr.hitCd!) pr.hitCd!.set(z, t - dt);
          this.inRadius(_a.x, _a.z, pr.radius, (z) => {
            if ((pr.hitCd!.get(z) ?? 0) > 0) return;
            pr.hitCd!.set(z, 0.4);
            this.hit(z, pr.dmg, z.root.position.clone().setY(1.1), _a);
            this.ctx.fx.sparks(_a, 3, 0xffe680, 3);
          });
          if (k >= 1) done = true;
          break;
        }
      }
      if (done) {
        pr.mesh.removeFromParent();
        this.projs.splice(i, 1);
      }
    }
  }

  private spawnPool(at: THREE.Vector3, r: number, dps: number, lifeOverride?: number): void {
    const glow = new THREE.Mesh(this.g.disc!, this.m.fireGlow!);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(at.x, 0.05, at.z);
    glow.scale.setScalar(r);
    this.ctx.scene.add(glow);
    const L = this.lv('molotov');
    const life = lifeOverride ?? (3.5 + (L >= 3 ? 1 : 0)) * this.durMul();
    this.pools.push({ x: at.x, z: at.z, r, dps, life, max: life, tick: 0, glow });
    this.ctx.fx.sparks(at, 8, 0xd9f99d, 3); // glass
    this.ctx.fx.flashLight(at, 0xff6a1a, 10, 0.4);
  }

  private tickPools(dt: number): void {
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pl = this.pools[i]!;
      pl.life -= dt;
      if (pl.life <= 0) {
        pl.glow.removeFromParent();
        this.pools.splice(i, 1);
        continue;
      }
      pl.glow.scale.setScalar(pl.r * (0.92 + Math.sin(this.time * 9 + i) * 0.04));
      const n = Math.ceil(pl.r * pl.r * 0.9 * dt * 60 * 0.25);
      for (let f = 0; f < n; f++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * pl.r;
        this.ctx.fx.flame(pl.x + Math.cos(a) * d, pl.z + Math.sin(a) * d, 0.9);
      }
      pl.tick -= dt;
      if (pl.tick > 0) continue;
      pl.tick = 0.35;
      _a.set(pl.x, 0.5, pl.z);
      this.inRadius(pl.x, pl.z, pl.r, (z) => {
        this.hit(z, pl.dps * 0.35, z.root.position.clone().setY(0.8), _a);
        applyStatus(z, 'burn', 1.4 * this.fuel());
      });
    }
  }

  private tickVortex(dt: number): void {
    for (let i = this.vortexes.length - 1; i >= 0; i--) {
      const v = this.vortexes[i]!;
      v.life -= dt;
      const k = 1 - v.life / v.max;
      // LED blinks faster as the fuse runs down
      v.ring.visible = Math.sin(this.time * (8 + k * 30)) > 0;
      if (Math.random() < dt * 6) {
        const a = Math.random() * Math.PI * 2;
        const d = v.r * rnd(0.3, 0.9);
        this.ctx.fx.emit('smoke', v.x + Math.cos(a) * d, 0.2, v.z + Math.sin(a) * d, { vy: 0.4, life: 0.9, s0: 0.3, s1: 1, color: 0x6e6250, a: 0.3 });
      }
      // pull
      this.inRadius(v.x, v.z, v.r, (z, d) => {
        if (z.kind === 'boss') return;
        const pull = Math.min(d, (5 + (v.r - d)) * dt);
        z.root.position.x += ((v.x - z.root.position.x) / Math.max(0.01, d)) * pull;
        z.root.position.z += ((v.z - z.root.position.z) / Math.max(0.01, d)) * pull;
      });
      v.tick -= dt;
      if (v.tick <= 0) {
        v.tick = 0.4;
        _a.set(v.x, 1, v.z);
        this.inRadius(v.x, v.z, v.r, (z) => this.hit(z, v.dps * 0.4, z.root.position.clone().setY(1), _a));
      }
      if (v.life <= 0) {
        _a.set(v.x, 0, v.z);
        this.ctx.fx.explosion(_a, Math.max(1.6, v.r * 0.55), 0xffa050);
        this.inRadius(v.x, v.z, v.r * 0.8, (z) => this.hit(z, v.burst, z.root.position.clone().setY(1), _a));
        this.ctx.shake(0.3);
        this.ctx.sfx('boom');
        v.core.removeFromParent();
        v.ring.removeFromParent();
        this.vortexes.splice(i, 1);
      }
    }
  }

  private tickBeams(dt: number): void {
    const p = this.ctx.player.root.position;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i]!;
      bm.life -= dt;
      if (bm.life <= 0) {
        this.beams.splice(i, 1);
        continue;
      }
      const k = 1 - bm.life / bm.max;
      const a = bm.base + bm.sweep * k;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      // tracer rounds + muzzle flash
      bm.fire -= dt;
      while (bm.fire <= 0) {
        bm.fire += 0.055;
        const spread = rnd(-0.05, 0.05);
        _a.set(p.x + dx * 0.9, 1.35, p.z + dz * 0.9);
        _b.set(p.x + Math.sin(a + spread) * bm.len, 0.9, p.z + Math.cos(a + spread) * bm.len);
        this.ctx.fx.tracer(_a, _b);
        this.ctx.fx.emit('flash', _a.x, _a.y, _a.z, { life: 0.045, s0: 0.55, s1: 0.75, color: 0xffd08a, a: 0.85 });
        if (Math.random() < 0.35) this.ctx.fx.emit('smoke', _a.x, _a.y, _a.z, { vy: 0.6, life: 0.7, s0: 0.25, s1: 0.8, color: 0x4a4640, a: 0.35 });
        this.ctx.sfx('shot');
      }
      bm.tick -= dt;
      if (bm.tick > 0) continue;
      bm.tick = 0.1;
      for (const z of this.ctx.zombies) {
        if (z.hp <= 0) continue;
        const rx = z.root.position.x - p.x;
        const rz = z.root.position.z - p.z;
        const along = rx * dx + rz * dz;
        if (along < 0 || along > bm.len) continue;
        const perp = Math.abs(rx * dz - rz * dx);
        if (perp > bm.width) continue;
        this.hit(z, bm.dps * 0.1, z.root.position.clone().setY(1.1), p);
        if (Math.random() < 0.3) this.ctx.fx.sparks(z.root.position, 2, 0x7a1010, 2);
      }
    }
  }

  /** Materials used by skill meshes (arena warm-up compiles them up front). */
  warmMaterials(): THREE.Material[] {
    return Object.values(this.m);
  }

  /** HUD summary */
  hud(): Array<{ id: string; icon: string; name: string; level: number; evo: boolean; passive: boolean }> {
    const out: Array<{ id: string; icon: string; name: string; level: number; evo: boolean; passive: boolean }> = [];
    for (const [id, lv] of this.ctx.state.skills) {
      const d = RUN_SKILLS[id];
      const evo = this.ctx.state.evolved.has(id);
      out.push({ id, icon: d.icon, name: evo ? d.evo.name : d.name, level: lv, evo, passive: false });
    }
    for (const [id, lv] of this.ctx.state.passives) {
      const d = PASSIVES[id];
      out.push({ id, icon: d.icon, name: d.name, level: lv, evo: false, passive: true });
    }
    return out;
  }

  dispose(): void {
    this.support.dispose();
    for (const pr of this.projs) pr.mesh.removeFromParent();
    for (const pl of this.pools) pl.glow.removeFromParent();
    for (const m of this.mines) m.mesh.removeFromParent();
    for (const d of this.drones) d.mesh.removeFromParent();
    for (const t of this.turrets) t.mesh.removeFromParent();
    for (const v of this.vortexes) {
      v.core.removeFromParent();
      v.ring.removeFromParent();
    }
    this.beams.length = 0;
    for (const s of this.saws) s.removeFromParent();
    this.auraGlow?.removeFromParent();
    this.mats.forEach((m) => m.dispose());
    this.geos.forEach((g) => g.dispose());
  }
}
