import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { IndicatorSrc } from './powerups';
import type { ModeId } from './mapDefs';
import type { ZombieKind } from './zombieKinds';
import { buildMilitaryTruck, rollTruckWheels } from './vehicleModels';
import { propGroup } from './mapBuilder';
import type { Aabb } from './collision';
import { TRUCK_HALF_WIDTH, TruckDriver, TruckPlanner, pushOutOfTruck, type DrivePt, type P2 } from './truckNav';
import {
  CONVOY_AMBUSH_SECONDS,
  CONVOY_CHECKPOINT_SECONDS,
  CONVOY_CHECKPOINTS,
  CONVOY_HP,
  CONVOY_REPAIR,
  CONVOY_SPEED,
  DARK_SECONDS,
  DELIVERIES,
  INFECTION_DRAIN,
  INFECTION_SAMPLE_HEAL,
  KING_MOVE_SECONDS,
  KING_RADIUS,
  KING_TARGET,
  MUTATIONS,
  MUTATION_EVERY,
  MUTATION_SECONDS,
  NESTS,
  NEST_PLANT_SECONDS,
  ONELIFE_SECONDS,
  SIEGE_SECONDS,
  SUPPLY_CRATES,
  SUPPLY_SECONDS,
  INFECTION_SECONDS,
  mutationAt,
  type MutationId,
} from './modeRules';

/**
 * The ten newer objective modes. ModeRuntime owns the shared plumbing (banner, beacons,
 * win / fail, bosses) and hands the mode-specific part to this class.
 *
 *  convoy     escort an armoured truck to the evac point; it only rolls with a hero near it
 *  supply     grab eight supply crates that drop one at a time before the clock runs out
 *  king       king of the hill: one roaming zone, hold it for a total time
 *  nests      plant charges on five nests (they keep spawning until destroyed)
 *  darkness   survive while the night swallows the map (fog keeps closing in)
 *  siege      three generators; keep at least one standing until the timer ends
 *  mutation   every 90 s the horde mutates (stacking), then the final boss
 *  onelife    no revives at all; survive, then kill the boss
 *  delivery   carry packages from a pick-up to a drop point, four times
 *  infection  you are infected: health drains unless you keep collecting samples
 */
export const EXTRA_MODE_IDS = ['convoy', 'supply', 'king', 'nests', 'darkness', 'siege', 'mutation', 'onelife', 'delivery', 'infection'] as const;
export type ExtraModeId = (typeof EXTRA_MODE_IDS)[number];
export const isExtraMode = (m: ModeId): m is ExtraModeId => (EXTRA_MODE_IDS as readonly string[]).includes(m);

/** What the extra modes need from ModeRuntime. */
export interface ModeHost {
  readonly ctx: {
    scene: THREE.Scene;
    map: { anchors: { core: THREE.Vector3; evac: THREE.Vector3; boss: THREE.Vector3; spawn: THREE.Vector3; pickups: THREE.Vector3[]; rescues: THREE.Vector3[] }; core: THREE.Object3D; bound: number; colliders?: readonly Aabb[] };
    player: OperativeVisual;
    squad: OperativeVisual[];
    zombies: ZombieVisual[];
    spawnZombieAt: (kind: ZombieKind, x: number, z: number) => ZombieVisual | null;
    warn: (pos: THREE.Vector3, r: number, color: number, dur: number) => void;
    sfx: (kind: 'pickup' | 'alarm' | 'win') => void;
    hurtLocal?: (amount: number) => void;
    healLocal?: (amount: number) => void;
  };
  readonly diff: { dmg: number; count: number; hp: number };
  readonly owned: THREE.Material[];
  spawnMul: number;
  revivesLeft: number;
  banner(s: string): void;
  beacon(color: number, r?: number): THREE.Group;
  spawnBoss(): ZombieVisual | null;
  humanWithin(pos: THREE.Vector3, r: number): boolean;
  win(subtitle: string): void;
  fail(reason: string): void;
}

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

interface Gen {
  g: THREE.Group;
  pos: THREE.Vector3;
  hp: number;
}

export class ExtraMode {
  private t = 0;
  private stageT = 0;
  private done = 0;
  private finalBoss: ZombieVisual | null = null;
  private bossCalled = false;
  // convoy
  private truck: THREE.Group | null = null;
  private truckHp = CONVOY_HP;
  /** route: start, checkpoints, evac */
  private route: THREE.Vector3[] = [];
  private leg = 1;
  private routeLen = 1;
  private travelled = 0;
  /** stopped at a checkpoint until this mode time */
  private holdUntil = 0;
  private ambushT = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  /** the road map (rebuilt while the map's props are still streaming in) and the driver */
  private planner: TruckPlanner | null = null;
  private plannerAge = 0;
  private driver: TruckDriver | null = null;
  /** leg the driver currently has a route for (-1 = none) */
  private plannedLeg = -1;
  /** metres of route still ahead after the current leg (straight-line estimate) */
  private laterLegs = 0;
  // supply / delivery / king / nests markers
  private marker: THREE.Group | null = null;
  private marker2: THREE.Group | null = null;
  private hold = 0;
  private carrier: OperativeVisual | null = null;
  private nests: { g: THREE.Group; pos: THREE.Vector3; plant: number; armed: number; dead: boolean; spawnT: number }[] = [];
  private gens: Gen[] = [];
  private mutations: MutationId[] = [];
  private lastSample = 0;
  private baseFog = -1;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    readonly id: ExtraModeId,
    private readonly host: ModeHost,
  ) {
    const a = host.ctx.map.anchors;
    switch (id) {
      case 'convoy': {
        this.from.copy(a.spawn).setY(0);
        this.to.copy(a.evac).setY(0);
        // a long route: start → three checkpoints (nearest-next) → evac
        const pool = [...a.pickups, ...a.rescues, a.boss].map((v) => v.clone().setY(0)).filter((v) => v.distanceTo(this.from) > 15 && v.distanceTo(this.to) > 15);
        this.route = [this.from.clone()];
        let cur = this.from.clone();
        for (let i = 0; i < CONVOY_CHECKPOINTS && pool.length; i++) {
          pool.sort((x, y) => x.distanceTo(cur) - y.distanceTo(cur));
          cur = pool.shift()!;
          this.route.push(cur);
        }
        this.route.push(this.to.clone());
        for (let i = 1; i < this.route.length; i++) this.routeLen += this.route[i]!.distanceTo(this.route[i - 1]!);
        this.truck = buildMilitaryTruck();
        host.ctx.scene.add(this.truck);
        this.truck.position.copy(this.from);
        this.truck.lookAt(this.route[1]!);
        this.driver = new TruckDriver(this.from.x, this.from.z, this.truck.rotation.y);
        this.truckHp = CONVOY_HP * (1 + 0.15 * Math.max(0, 1 - host.diff.dmg));
        break;
      }
      case 'supply':
        this.marker = host.beacon(0xffb020, 1.4);
        this.marker.visible = false;
        break;
      case 'king':
        this.marker = host.beacon(0xfacc15, KING_RADIUS);
        this.moveKing();
        break;
      case 'nests':
        for (const p of [a.boss, ...a.pickups, ...a.rescues].slice(0, NESTS)) {
          const g = host.beacon(0xa855f7, 4);
          g.add(this.buildNest());
          g.position.copy(p).setY(0);
          this.nests.push({ g, pos: p.clone().setY(0), plant: 0, armed: -1, dead: false, spawnT: Math.random() * 6 });
        }
        break;
      case 'siege':
        for (const p of [a.core, a.pickups[0] ?? a.evac, a.pickups[2] ?? a.boss]) {
          const g = host.beacon(0x38bdf8, 3);
          g.add(this.buildGenerator());
          g.position.copy(p).setY(0);
          this.gens.push({ g, pos: p.clone().setY(0), hp: 100 });
        }
        break;
      case 'delivery':
        this.marker = host.beacon(0x22d3ee, 2);
        this.marker2 = host.beacon(0xf472b6, 3);
        this.nextDelivery();
        break;
      case 'onelife':
        host.revivesLeft = 0;
        break;
    }
  }

  /** onelife: never revive, whatever the tree says */
  get noRevives(): boolean {
    return this.id === 'onelife';
  }

  // ---------------------------------------------------------------- models
  private mat(color: number, emissive = 0): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.35, emissive, emissiveIntensity: emissive ? 0.6 : 0 });
    this.host.owned.push(m);
    return m;
  }
  /** a pack of zombies around `at` (convoy ambush) */
  private ambush(n: number, at: THREE.Vector3, spread: number): void {
    const kinds: ZombieKind[] = ['runner', 'grunt', 'grunt', 'crawler', 'tank'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.5 + Math.random() * 0.5);
      this.host.ctx.spawnZombieAt(kinds[Math.floor(Math.random() * kinds.length)]!, at.x + Math.cos(a) * d, at.z + Math.sin(a) * d);
    }
  }

  private buildNest(): THREE.Object3D {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0x3a1f3a, 0x5a1a6a));
    mound.scale.y = 0.7;
    g.add(mound);
    for (let i = 0; i < 6; i++) {
      const sac = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), this.mat(0x7a3a8a, 0xa855f7));
      const a = (i / 6) * Math.PI * 2;
      sac.position.set(Math.cos(a) * 1.2, 0.4, Math.sin(a) * 1.2);
      sac.name = 'sac';
      g.add(sac);
    }
    return g;
  }
  /** photoscanned prop loaded into `into` (the group is usable right away) */
  private prop(into: THREE.Group, file: string, scale: number, y = 0): void {
    void propGroup(file, scale)
      .then((g) => {
        g.position.y = y;
        into.add(g);
      })
      .catch(() => undefined);
  }
  private buildGenerator(): THREE.Object3D {
    const g = new THREE.Group();
    this.prop(g, 'portable_generator', 1.7);
    // a status light the squad can read from afar
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), this.mat(0x0f2a1c, 0x38bdf8));
    core.position.y = 1.9;
    core.name = 'core';
    g.add(core);
    return g;
  }
  private buildCrate(color: number): THREE.Object3D {
    const c = new THREE.Group();
    c.name = 'crate';
    this.prop(c, color === 0x22d3ee ? 'cardboard_box_01' : 'wooden_military_crate', color === 0x22d3ee ? 1.6 : 1.1);
    return c;
  }

  // ---------------------------------------------------------------- helpers
  private randomSpot(minD: number, maxD: number): THREE.Vector3 {
    const pl = this.host.ctx.player.root.position;
    const B = this.host.ctx.map.bound - 6;
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * (maxD - minD);
    return new THREE.Vector3(THREE.MathUtils.clamp(pl.x + Math.cos(a) * d, -B, B), 0, THREE.MathUtils.clamp(pl.z + Math.sin(a) * d, -B, B));
  }
  private moveKing(): void {
    const a = this.host.ctx.map.anchors;
    const pool = [a.core, a.evac, a.boss, ...a.pickups, ...a.rescues];
    const cur = this.marker!.position;
    const cands = pool.filter((p) => p.distanceTo(cur) > 20);
    const next = (cands.length ? cands : pool)[Math.floor(Math.random() * (cands.length || pool.length))]!;
    this.marker!.position.copy(next).setY(0);
    this.stageT = 0;
  }
  private nextDelivery(): void {
    const a = this.host.ctx.map.anchors;
    const pool = [a.core, a.evac, a.boss, ...a.pickups, ...a.rescues];
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    let drop = pool[Math.floor(Math.random() * pool.length)]!;
    for (let i = 0; i < 6 && drop.distanceTo(pick) < 30; i++) drop = pool[Math.floor(Math.random() * pool.length)]!;
    this.marker!.position.copy(pick).setY(0);
    this.marker!.visible = true;
    this.marker2!.position.copy(drop).setY(0);
    this.marker2!.visible = false;
    if (!this.marker!.getObjectByName('crate')) this.marker!.add(this.buildCrate(0x22d3ee));
    this.carrier = null;
  }
  private humans(): OperativeVisual[] {
    return this.host.ctx.squad.filter((op) => op.alive && (op.isPlayer || op.root.userData.netPlayer));
  }
  private finalBossPhase(label: string): void {
    if (this.finalBoss) {
      if (this.finalBoss.hp <= 0) this.host.win(label);
      return;
    }
    this.finalBoss = this.host.spawnBoss();
    this.host.banner('SON DALGA — boss\'u öldür!');
    this.host.spawnMul = 1.6;
  }

  /** Mutation: what new zombies get. */
  onZombieSpawned(z: ZombieVisual): void {
    if (this.id !== 'mutation' || !this.mutations.length) return;
    for (const m of this.mutations) this.mutate(z, m);
  }

  private mutate(z: ZombieVisual, m: MutationId): void {
    {
      if (m === 'fast') {
        z.speed *= 1.18;
        z.baseSpeed = z.speed;
      } else if (m === 'tough') {
        z.maxHp = Math.ceil(z.maxHp * 1.35);
        z.hp = z.maxHp;
      } else if (m === 'brutal') z.attackDamage = Math.ceil(z.attackDamage * 1.3);
      else if (m === 'giant') {
        z.root.scale.multiplyScalar(1.15);
        z.maxHp = Math.ceil(z.maxHp * 1.2);
        z.hp = z.maxHp;
      }
      // 'swarm' works through spawn pressure
    }
    z.root.userData.mutated = this.mutations.length;
  }

  // ---------------------------------------------------------------- per step (host)
  update(dt: number): void {
    this.t += dt;
    this.stageT += dt;
    const h = this.host;
    const c = h.ctx;
    switch (this.id) {
      case 'convoy': {
        const truck = this.truck!;
        const p = truck.position;
        // zombies at the truck chew on it; a crowd in front of the plough blocks it
        let hits = 0;
        let blocking = 0;
        const heading = this.tmp2.set(Math.sin(truck.rotation.y), 0, Math.cos(truck.rotation.y));
        for (const z of c.zombies) {
          if (z.hp <= 0) continue;
          this.tmp.subVectors(z.root.position, p).setY(0);
          const d2 = this.tmp.lengthSq();
          if (d2 < 3.6 * 3.6) {
            hits += z.kind === 'boss' ? 6 : z.kind === 'tank' ? 3 : 1;
            if (this.tmp.dot(heading) > 1.5) blocking++;
          }
        }
        if (hits) this.truckHp -= hits * dt * 0.7 * h.diff.dmg;
        const escorted = h.humanWithin(p, 10);
        // crew patch the truck up when it is quiet around it
        if (hits === 0 && h.humanWithin(p, 4.5)) this.truckHp = Math.min(CONVOY_HP, this.truckHp + CONVOY_REPAIR * dt);
        const stopped = this.holdUntil > this.t;
        const drv = this.driver!;
        this.ensureRoute(dt);
        const go = !stopped && escorted && blocking < 4;
        const res = drv.step(dt, go ? CONVOY_SPEED * (blocking > 0 ? 0.45 : 1) : 0, this.planner);
        p.set(drv.x, 0, drv.z);
        truck.rotation.y = drv.yaw;
        if (res.moved !== 0) {
          rollTruckWheels(truck, res.moved);
          if (res.moved > 0) this.travelled += res.moved;
        }
        if (res.replan) this.plannedLeg = -1;
        // the body is solid: zombies (and the heroes simulated here) are shoved out of it
        for (const z of c.zombies) {
          if (z.hp <= 0) continue;
          const q = pushOutOfTruck(z.root.position.x, z.root.position.z, 0.5, p.x, p.z, drv.yaw);
          if (q) z.root.position.set(q.x, z.root.position.y, q.z);
        }
        if (res.arrived && !stopped) {
          if (this.leg < this.route.length - 1) {
            // checkpoint: the truck has to stop and the squad holds it
            this.leg += 1;
            this.plannedLeg = -1;
            this.holdUntil = this.t + CONVOY_CHECKPOINT_SECONDS;
            h.banner(`Kontrol noktası ${this.leg - 1}/${this.route.length - 2}: yol temizlenene kadar konvoyu koru!`);
            c.sfx('alarm');
            this.ambush(14, p, 22);
            if (this.leg - 1 === Math.ceil((this.route.length - 2) / 2)) h.spawnBoss();
          } else {
            h.win(`Konvoy %${Math.round((this.truckHp / CONVOY_HP) * 100)} sağlamla vardı.`);
            break;
          }
        }
        // ambushes along the road, ahead of the truck
        this.ambushT -= dt;
        if (this.ambushT <= 0) {
          this.ambushT = stopped ? 9 : CONVOY_AMBUSH_SECONDS;
          const ahead = p.clone().addScaledVector(heading, 26);
          this.ambush(stopped ? 6 : 8, ahead, 7);
        }
        const done = this.travelled / this.routeLen;
        h.spawnMul = 1.35 + done * 0.8 + (stopped ? 0.4 : 0);
        if (!this.bossCalled && done > 0.82) {
          this.bossCalled = true;
          h.spawnBoss();
          h.banner('Son düzlükte bir mutant yolu kesiyor!');
        }
        if (this.truckHp <= 0) h.fail('Konvoy yok edildi.');
        break;
      }
      case 'supply': {
        const m = this.marker!;
        if (!m.visible) {
          if (this.stageT > 3) {
            m.position.copy(this.randomSpot(22, 42));
            m.add(this.buildCrate(0xffb020));
            m.visible = true;
            c.warn(m.position.clone(), 2, 0xffb020, 1.5);
            h.banner(`İkmal sandığı düştü (${this.done + 1}/${SUPPLY_CRATES})`);
          }
        } else {
          m.rotation.y += dt;
          if (h.humanWithin(m.position, 2.2)) {
            this.done += 1;
            m.visible = false;
            m.getObjectByName('crate')?.removeFromParent();
            this.stageT = 0;
            c.sfx('pickup');
            h.spawnMul += 0.08;
            if (this.done === Math.ceil(SUPPLY_CRATES / 2)) h.spawnBoss();
          }
        }
        h.spawnMul = Math.max(h.spawnMul, 1.2);
        if (this.done >= SUPPLY_CRATES) h.win(`${SUPPLY_CRATES} sandık ${fmt(this.t)} içinde toplandı.`);
        else if (this.t >= SUPPLY_SECONDS) h.fail(`Süre doldu: ${this.done}/${SUPPLY_CRATES} sandık.`);
        break;
      }
      case 'king': {
        const m = this.marker!;
        const held = h.humanWithin(m.position, KING_RADIUS);
        if (held) this.hold += dt;
        h.spawnMul = held ? 1.7 : 1.15;
        if (this.stageT >= KING_MOVE_SECONDS) {
          this.moveKing();
          h.banner('Tepe yer değiştirdi — yeni bölgeye koş!');
          c.sfx('alarm');
        }
        if (!this.bossCalled && this.hold > KING_TARGET * 0.6) {
          this.bossCalled = true;
          h.spawnBoss();
        }
        if (this.hold >= KING_TARGET) h.win(`Tepeyi toplam ${fmt(KING_TARGET)} tuttun.`);
        break;
      }
      case 'nests': {
        let alive = 0;
        for (const n of this.nests) {
          if (n.dead) continue;
          alive++;
          n.g.rotation.y += dt * 0.2;
          // nests keep birthing until destroyed
          n.spawnT -= dt;
          if (n.spawnT <= 0) {
            n.spawnT = 7 + Math.random() * 4;
            const kinds: ZombieKind[] = ['crawler', 'runner', 'grunt'];
            for (let i = 0; i < 2; i++) {
              const a = Math.random() * Math.PI * 2;
              c.spawnZombieAt(kinds[Math.floor(Math.random() * kinds.length)]!, n.pos.x + Math.cos(a) * 3, n.pos.z + Math.sin(a) * 3);
            }
          }
          if (n.armed >= 0) {
            n.armed -= dt;
            if (n.armed <= 0) {
              n.dead = true;
              n.g.visible = false;
              c.warn(n.pos.clone(), 7, 0xff8a30, 0.3);
              for (const z of c.zombies) if (z.hp > 0 && z.root.position.distanceTo(n.pos) < 7) z.hp = Math.min(z.hp, 1);
              this.done += 1;
              c.sfx('pickup');
              h.banner(`Yuva yok edildi (${this.done}/${this.nests.length})`);
              if (this.done === this.nests.length - 1) h.spawnBoss();
            }
            continue;
          }
          if (h.humanWithin(n.pos, 4)) {
            n.plant += dt;
            if (n.plant >= NEST_PLANT_SECONDS) {
              n.armed = 3;
              c.warn(n.pos.clone(), 7, 0xff5a1a, 3);
              h.banner('Patlayıcı kuruldu — uzaklaş!');
              c.sfx('alarm');
            }
          } else n.plant = Math.max(0, n.plant - dt * 0.5);
        }
        h.spawnMul = 1 + alive * 0.08;
        if (alive === 0) h.win(`${this.nests.length} yuvanın hepsi yok edildi.`);
        break;
      }
      case 'darkness': {
        h.spawnMul = 1.15 + Math.min(0.6, this.t / DARK_SECONDS);
        if (this.t >= DARK_SECONDS) this.finalBossPhase('Sabaha çıktınız.');
        else if (this.stageT > 150) {
          this.stageT = 0;
          h.spawnBoss();
          h.banner('Karanlıktan bir mutant çıktı!');
        }
        break;
      }
      case 'siege': {
        let standing = 0;
        for (const g of this.gens) {
          if (g.hp <= 0) continue;
          let hits = 0;
          for (const z of c.zombies) {
            if (z.hp <= 0) continue;
            const d = (z.root.position.x - g.pos.x) ** 2 + (z.root.position.z - g.pos.z) ** 2;
            if (d < 9) hits += z.kind === 'boss' ? 6 : z.kind === 'tank' ? 3 : 1;
          }
          if (hits) g.hp -= hits * dt * 0.8 * h.diff.dmg;
          if (g.hp <= 0) {
            g.hp = 0;
            g.g.visible = false;
            c.warn(g.pos.clone(), 5, 0xef4444, 0.5);
            h.banner('Bir jeneratör düştü!');
            c.sfx('alarm');
          } else standing++;
          const core = g.g.getObjectByName('core');
          if (core) core.rotation.y += dt * 2;
        }
        h.spawnMul = 1.2 + (this.t / SIEGE_SECONDS) * 0.8;
        if (this.stageT > 180) {
          this.stageT = 0;
          h.spawnBoss();
          h.banner('Kuşatma kulesi gibi bir mutant geliyor!');
        }
        if (standing === 0) h.fail('Bütün jeneratörler düştü.');
        else if (this.t >= SIEGE_SECONDS) h.win(`${standing} jeneratör ayakta kaldı.`);
        break;
      }
      case 'mutation': {
        const want = mutationAt(this.t);
        if (want.length > this.mutations.length) {
          this.mutations = want;
          const last = MUTATIONS[want[want.length - 1]!];
          h.banner(`MUTASYON: ${last.name} — ${last.desc}`);
          c.sfx('alarm');
          // the change also hits the horde already on the map
          const newest = want[want.length - 1]!;
          for (const z of c.zombies) if (z.hp > 0) this.mutate(z, newest);
        }
        h.spawnMul = 1 + this.mutations.filter((m) => m === 'swarm').length * 0.35 + this.t / MUTATION_SECONDS * 0.3;
        if (this.t >= MUTATION_SECONDS) this.finalBossPhase(`${this.mutations.length} mutasyona dayandın.`);
        break;
      }
      case 'onelife': {
        h.revivesLeft = 0;
        h.spawnMul = 1.2 + Math.min(0.5, this.t / ONELIFE_SECONDS * 0.5);
        if (this.t >= ONELIFE_SECONDS) this.finalBossPhase('Tek canla bitirdin.');
        else if (this.stageT > 180) {
          this.stageT = 0;
          h.spawnBoss();
        }
        break;
      }
      case 'delivery': {
        const pick = this.marker!;
        const drop = this.marker2!;
        if (!this.carrier) {
          const who = this.humans().find((op) => op.root.position.distanceTo(pick.position) < 2.2);
          if (who) {
            this.carrier = who;
            pick.visible = false;
            drop.visible = true;
            c.sfx('pickup');
            h.banner(`Paket alındı — teslim noktasına götür (${this.done + 1}/${DELIVERIES})`);
          }
        } else {
          const crate = pick.getObjectByName('crate');
          if (!this.carrier.alive) {
            // dropped where they fell
            pick.position.copy(this.carrier.root.position).setY(0);
            pick.visible = true;
            drop.visible = false;
            this.carrier = null;
            h.banner('Paket düştü — geri al!');
          } else if (this.carrier.root.position.distanceTo(drop.position) < 3) {
            this.done += 1;
            c.sfx('pickup');
            h.spawnMul += 0.12;
            if (this.done >= DELIVERIES) {
              drop.visible = false;
              h.win(`${DELIVERIES} paket teslim edildi.`);
            } else {
              if (this.done === DELIVERIES - 1) h.spawnBoss();
              this.nextDelivery();
            }
          }
          void crate;
        }
        h.spawnMul = Math.max(h.spawnMul, this.carrier ? 1.5 : 1.1);
        break;
      }
      case 'infection': {
        h.spawnMul = 1.2 + Math.min(0.5, this.t / INFECTION_SECONDS * 0.5);
        if (this.t >= INFECTION_SECONDS) this.finalBossPhase('Panzehire ulaştınız.');
        break;
      }
    }
  }

  /** Every client, every frame: effects on the local hero (fog, infection). */
  localTick(dt: number): void {
    const c = this.host.ctx;
    if (this.id === 'darkness') {
      const fog = c.scene.fog as THREE.FogExp2 | null;
      if (fog && 'density' in fog) {
        if (this.baseFog < 0) this.baseFog = fog.density;
        // every client ramps on its own frame clock (the host's mode clock is not sent)
        this.darkT += dt;
        const k = Math.min(1, this.darkT / (DARK_SECONDS * 0.6));
        fog.density = this.baseFog * (1 + k * 2.6);
      }
    }
    if (this.id === 'infection' && c.player.alive) {
      this.darkT += dt;
      if (this.darkT - this.lastSample > 2) c.hurtLocal?.(c.player.maxHp * INFECTION_DRAIN * dt);
    }
  }
  private darkT = 0;

  /** Infection: a sample is antiserum. */
  onSampleCollected(): void {
    if (this.id !== 'infection') return;
    this.lastSample = this.darkT;
    this.host.ctx.healLocal?.(this.host.ctx.player.maxHp * INFECTION_SAMPLE_HEAL);
  }

  onZombieKilled(z: ZombieVisual): void {
    void z;
  }

  /**
   * Keep the driver supplied with a route for the current leg. The road map is rebuilt when
   * the level's props have finished streaming in (they add walls), at most every 2 s.
   */
  private ensureRoute(dt: number): void {
    const c = this.host.ctx;
    const walls = c.map.colliders ?? [];
    this.plannerAge += dt;
    if (!this.planner || (this.planner.builtFrom !== walls.length && this.plannerAge > 2)) {
      this.planner = new TruckPlanner(c.map.bound, walls);
      this.plannerAge = 0;
      this.plannedLeg = -1;
    }
    if (this.plannedLeg === this.leg) return;
    const drv = this.driver!;
    const target = this.route[this.leg] ?? this.to;
    const from: P2 = { x: drv.x, z: drv.z };
    const to: P2 = { x: target.x, z: target.z };
    // a roomy route if there is one, a tight one if not, and straight there as the last resort
    // a route it can really drive (arcs, reversing where it must); failing that the grid route,
    // and straight there as the very last resort
    const path: Array<P2 | DrivePt> = this.planner.planDrive({ x: drv.x, z: drv.z, yaw: drv.yaw }, to) ?? this.planner.plan(from, to) ?? this.planner.plan(from, to, TRUCK_HALF_WIDTH + 0.05) ?? [from, to];
    // the checkpoint marker sits where the truck will actually stop
    const end = path[path.length - 1]!;
    target.set(end.x, 0, end.z);
    drv.setPath(path);
    this.plannedLeg = this.leg;
    // dev probes read this (cheap: a reference)
    if (this.truck) this.truck.userData.nav = { planner: this.planner, driver: drv };
    // progress bar: what is driven + this leg's route + the rest as the crow flies (roads wind)
    let later = 0;
    for (let i = this.leg + 1; i < this.route.length; i++) later += this.route[i]!.distanceTo(this.route[i - 1]!) * 1.2;
    this.laterLegs = later;
    this.routeLen = Math.max(this.travelled + drv.remaining() + later, 1);
  }

  /** where the convoy truck is (co-op: sent to guests so they can draw it) */
  vehiclePose(): [x: number, z: number, yaw: number] | null {
    const t = this.truck;
    return t ? [t.position.x, t.position.z, t.rotation.y] : null;
  }

  indicators(): IndicatorSrc[] {
    const out: IndicatorSrc[] = [];
    if (this.truck) out.push({ pos: this.truck.position, color: 0x84cc16, icon: '🚚', label: `Konvoy %${Math.round((this.truckHp / CONVOY_HP) * 100)}`, urgent: true, radius: 10 });
    if (this.id === 'convoy') {
      const next = this.route[this.leg];
      if (next && this.leg < this.route.length - 1) out.push({ pos: next, color: 0xfacc15, icon: '🚧', label: 'Kontrol noktası', radius: 3 });
      out.push({ pos: this.to, color: 0xffd23c, icon: '🏁', label: 'Varış', radius: 3 });
    }
    if (this.marker?.visible) {
      const icon = this.id === 'king' ? '👑' : this.id === 'delivery' ? '📦' : '🎁';
      out.push({ pos: this.marker.position, color: this.id === 'king' ? 0xfacc15 : 0xffb020, icon, label: this.id === 'king' ? 'Tepe' : this.id === 'delivery' ? 'Paket' : 'İkmal', urgent: true, radius: this.id === 'king' ? KING_RADIUS : 2 });
    }
    if (this.marker2?.visible) out.push({ pos: this.marker2.position, color: 0xf472b6, icon: '📍', label: 'Teslim', urgent: true, radius: 3 });
    for (const n of this.nests) if (!n.dead) out.push({ pos: n.pos, color: 0xa855f7, icon: '🕷', label: n.armed >= 0 ? 'Patlıyor!' : 'Yuva', radius: 4 });
    for (const g of this.gens) if (g.hp > 0) out.push({ pos: g.pos, color: 0x38bdf8, icon: '⚡', label: `Jeneratör %${Math.round(g.hp)}`, radius: 3 });
    return out;
  }

  hud(): { label: string; prog: number; target: number } {
    switch (this.id) {
      case 'convoy': {
        const left = this.driver ? this.driver.remaining() + this.laterLegs : Math.max(0, this.routeLen - this.travelled);
        const hold = this.holdUntil - this.t;
        const state = hold > 0 ? ` · kontrol noktası ${Math.ceil(hold)} sn` : this.truck && !this.host.humanWithin(this.truck.position, 10) ? ' · YANINDA KAL' : '';
        return { label: `Konvoy %${Math.max(0, Math.round((this.truckHp / CONVOY_HP) * 100))} · kalan ${Math.round(left)} m${state}`, prog: this.travelled, target: this.routeLen };
      }
      case 'supply':
        return { label: `İkmal ${this.done}/${SUPPLY_CRATES} · ${fmt(SUPPLY_SECONDS - this.t)}`, prog: this.done, target: SUPPLY_CRATES };
      case 'king':
        return { label: `Tepe ${fmt(this.hold)} / ${fmt(KING_TARGET)} · yer değişimi ${fmt(KING_MOVE_SECONDS - this.stageT)}`, prog: this.hold, target: KING_TARGET };
      case 'nests': {
        const planting = this.nests.find((n) => !n.dead && n.plant > 0 && n.armed < 0);
        return { label: `Yuva ${this.done}/${this.nests.length}${planting ? ` · kuruluyor ${Math.floor(planting.plant)}/${NEST_PLANT_SECONDS}` : ''}`, prog: this.done, target: this.nests.length };
      }
      case 'darkness':
        return this.finalBoss ? { label: 'Son boss\'u öldür', prog: 0, target: 1 } : { label: `Gün doğumuna ${fmt(DARK_SECONDS - this.t)}`, prog: this.t, target: DARK_SECONDS };
      case 'siege': {
        const st = this.gens.filter((g) => g.hp > 0).map((g) => `%${Math.round(g.hp)}`).join(' · ');
        return { label: `Jeneratörler ${st || '—'} · ${fmt(SIEGE_SECONDS - this.t)}`, prog: this.t, target: SIEGE_SECONDS };
      }
      case 'mutation':
        return this.finalBoss ? { label: 'Son boss\'u öldür', prog: 0, target: 1 } : { label: `Mutasyon ${this.mutations.length} · sıradaki ${fmt(MUTATION_EVERY - (this.t % MUTATION_EVERY))}`, prog: this.t, target: MUTATION_SECONDS };
      case 'onelife':
        return this.finalBoss ? { label: 'Son boss\'u öldür — tek canın var', prog: 0, target: 1 } : { label: `Tek can · ${fmt(ONELIFE_SECONDS - this.t)}`, prog: this.t, target: ONELIFE_SECONDS };
      case 'delivery':
        return { label: `Paket ${this.done}/${DELIVERIES}${this.carrier ? ' · teslim et' : ' · paketi al'}`, prog: this.done, target: DELIVERIES };
      case 'infection':
        return this.finalBoss ? { label: 'Son boss\'u öldür', prog: 0, target: 1 } : { label: `Enfekte · numune topla · ${fmt(INFECTION_SECONDS - this.t)}`, prog: this.t, target: INFECTION_SECONDS };
    }
  }

  /** Co-op guest: the host draws the objective (markers come over the net). */
  goRemote(): void {
    for (const o of [this.truck, this.marker, this.marker2, ...this.nests.map((n) => n.g), ...this.gens.map((g) => g.g)]) if (o) o.visible = false;
    this.truck?.removeFromParent();
    this.truck = null;
    this.marker = null;
    this.marker2 = null;
    this.nests = [];
    this.gens = [];
  }

  dispose(): void {
    const c = this.host.ctx;
    if (this.baseFog >= 0 && c.scene.fog && 'density' in c.scene.fog) (c.scene.fog as THREE.FogExp2).density = this.baseFog;
    for (const o of [this.truck, this.marker, this.marker2, ...this.nests.map((n) => n.g), ...this.gens.map((g) => g.g)]) o?.removeFromParent();
  }
}
