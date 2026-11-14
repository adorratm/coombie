import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import { pickWaveSpawnKind, type ZombieKind } from './zombieKinds';
import type { MissionHudState } from './mission';
import { MAPS, type MapId, type ModeId } from './mapDefs';
import type { GameMap } from './gameMap';
import type { IndicatorSrc } from './powerups';
import { BLITZ_BOSS_BONUS, BLITZ_SECONDS, blitzTarget, HUNT_RESPITE_SECONDS, HUNT_TARGET_HP_MUL, HUNT_TARGETS, huntTargetKind, pickNextZone, ZONE_COUNT, ZONE_HOLD_SECONDS, ZONE_RADIUS, zoneProgress } from './modeRules';

/**
 * Game modes, difficulties and the per-run objective runtime.
 *
 *  survival  survive the timer (20 / 30 / 40 / 60 min), then kill the final boss
 *  horde     20 hordes; the next one only starts once the current one is dead
 *  defense   keep the generator alive until the timer ends (same durations)
 *  rescue    free 3 survivors (they join the squad), then hold the evac zone
 *  evac      collect 4 fuel cans, then hold the evac zone until the chopper lands
 *  boss      three bosses hunt you one after another
 *  endless   no end — the horde keeps scaling; score = time + kills
 *  zones     capture four zones one after another by standing in them
 *  hunt      six marked infected, one at a time; the last one is a boss
 *  blitz     reach the kill quota before the clock runs out
 */

export type DifficultyId = 'easy' | 'normal' | 'hard' | 'nightmare' | 'apocalypse';

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  desc: string;
  hp: number;
  dmg: number;
  count: number;
  speed: number;
  reward: number;
  /** revives per run (Infinity = unlimited) */
  revives: number;
  color: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  easy: { id: 'easy', name: 'Kolay', desc: 'Zayıf zombiler, sınırsız dirilme.', hp: 0.7, dmg: 0.65, count: 0.8, speed: 0.92, reward: 0.7, revives: Infinity, color: 0x4ade80 },
  normal: { id: 'normal', name: 'Normal', desc: 'Dengeli deneyim. 3 dirilme.', hp: 1, dmg: 1, count: 1, speed: 1, reward: 1, revives: 3, color: 0x60a5fa },
  hard: { id: 'hard', name: 'Zor', desc: 'Daha dayanıklı ve kalabalık sürüler. 2 dirilme.', hp: 1.4, dmg: 1.3, count: 1.2, speed: 1.06, reward: 1.5, revives: 2, color: 0xfbbf24 },
  nightmare: { id: 'nightmare', name: 'Kâbus', desc: 'Acımasız. 1 dirilme.', hp: 1.9, dmg: 1.65, count: 1.4, speed: 1.12, reward: 2.2, revives: 1, color: 0xf97316 },
  apocalypse: { id: 'apocalypse', name: 'Kıyamet', desc: 'Tek can. Sadece efsaneler için.', hp: 2.6, dmg: 2.1, count: 1.6, speed: 1.18, reward: 3.2, revives: 0, color: 0xef4444 },
};
export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'nightmare', 'apocalypse'];

export interface ModeDef {
  id: ModeId;
  name: string;
  icon: string;
  desc: string;
}
export const MODES: Record<ModeId, ModeDef> = {
  survival: { id: 'survival', name: 'Hayatta Kal', icon: '⏱', desc: 'Seçtiğin süre boyunca dayan (20-60 dk), her 5 dakikada mutant gelir, sonda son boss.' },
  horde: { id: 'horde', name: 'Horde', icon: '🧟', desc: '20 sürü dalgası. Bir sürü tamamen ölmeden sonraki gelmez; 10. ve 20. dalgada boss.' },
  defense: { id: 'defense', name: 'Savunma', icon: '⛨', desc: 'Jeneratörü seçtiğin süre boyunca (20-60 dk) koru.' },
  rescue: { id: 'rescue', name: 'Kurtarma', icon: '✚', desc: '3 hayatta kalanı kurtar, tahliye noktasını tut.' },
  evac: { id: 'evac', name: 'Tahliye', icon: '⛽', desc: '4 yakıt bidonu topla, helikopter gelene kadar dayan.' },
  boss: { id: 'boss', name: 'Boss Avı', icon: '☠', desc: 'Üç dev mutant sırayla geliyor.' },
  endless: { id: 'endless', name: 'Sonsuz', icon: '∞', desc: 'Bitiş yok. Ne kadar dayanabilirsin?' },
  zones: { id: 'zones', name: 'Bölge Kontrol', icon: '⚑', desc: `${ZONE_COUNT} bölgeyi sırayla ele geçir: halkanın içinde ${ZONE_HOLD_SECONDS} sn dur, çıkarsan ilerleme erir.` },
  hunt: { id: 'hunt', name: 'İnfaz Listesi', icon: '🎯', desc: `${HUNT_TARGETS} işaretli hedefi sırayla avla. Sonuncusu boss.` },
  blitz: { id: 'blitz', name: 'Katliam', icon: '⚡', desc: `${BLITZ_SECONDS / 60} dakikada öldürme kotasını doldur. Her boss +${BLITZ_BOSS_BONUS} sn kazandırır.` },
};

export interface MissionSelection {
  map: MapId;
  mode: ModeId;
  difficulty: DifficultyId;
  /** run length for timed modes (survival / defense) */
  minutes?: RunMinutes;
}

export type RunMinutes = 20 | 30 | 40 | 60;
export const RUN_MINUTES: RunMinutes[] = [20, 30, 40, 60];
export const DEFAULT_RUN_MINUTES: RunMinutes = 20;
/** modes whose length the player picks */
export const TIMED_MODES: ModeId[] = ['survival', 'defense'];
export const HORDE_WAVES = 20;

export interface ModeCtx {
  scene: THREE.Scene;
  map: GameMap;
  player: OperativeVisual;
  squad: OperativeVisual[];
  zombies: ZombieVisual[];
  spawnZombieAt: (kind: ZombieKind, x: number, z: number) => ZombieVisual | null;
  recruitAt: (pos: THREE.Vector3) => void;
  warn: (pos: THREE.Vector3, r: number, color: number, dur: number) => void;
  sfx: (kind: 'pickup' | 'alarm' | 'win') => void;
}

export interface RunOutcome {
  won: boolean;
  title: string;
  subtitle: string;
}

interface Pickup {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  taken: boolean;
}

/** dev: ?pzEnd=win|lose ends the run after 4 s of sim time */
const DEV_END = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('pzEnd') : null;

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export class ModeRuntime {
  readonly sel: MissionSelection;
  readonly diff: DifficultyDef;
  private readonly ctx: ModeCtx;
  private t = 0;
  private stage = 0;
  private stageT = 0;
  private bannerText = '';
  private bannerT = 0;
  outcome: RunOutcome | null = null;
  revivesLeft: number;
  /** extra spawn pressure the arena multiplies into its wave spawner */
  spawnMul = 1;
  /** generator hp (defense) */
  coreHp = 100;
  private readonly bosses = new Set<ZombieVisual>();
  bossKills = 0;
  private pickups: Pickup[] = [];
  private rescued = 0;
  private holdT = 0;
  private freeT = 0;
  private readonly rescueMarkers: THREE.Group[] = [];
  private finalBoss: ZombieVisual | null = null;
  private readonly owned: THREE.Material[] = [];
  /** timed-mode length (s) */
  readonly total: number;
  // horde mode
  hordeWave = 0;
  private hordeLeft = 0;
  private hordeSpawnT = 0;
  private hordeBreak = 0;
  private readonly hordeAlive = new Set<ZombieVisual>();
  // zones mode
  private zoneMarker: THREE.Group | null = null;
  private readonly zonesUsed = new Set<number>();
  private zonesDone = 0;
  private zoneT = 0;
  // hunt mode
  private huntTarget: ZombieVisual | null = null;
  private huntKills = 0;
  // blitz mode
  private blitzKills0 = -1;
  private blitzKills = 0;
  private blitzBonus = 0;

  /** Horde mode spawns every zombie itself; the arena's wave/ambient spawner stays off. */
  get ownsSpawning(): boolean {
    return this.sel.mode === 'horde';
  }
  /** zombies of the current horde still to come or alive */
  get hordeRemaining(): number {
    return this.hordeLeft + this.hordeAlive.size;
  }

  constructor(sel: MissionSelection, ctx: ModeCtx) {
    this.sel = sel;
    this.diff = DIFFICULTIES[sel.difficulty] ?? DIFFICULTIES.normal;
    this.ctx = ctx;
    this.revivesLeft = this.diff.revives;
    const mins = sel.minutes && [20, 30, 40, 60].includes(sel.minutes) ? sel.minutes : DEFAULT_RUN_MINUTES;
    this.total = mins * 60;
    this.banner(`${MAPS[sel.map].name} · ${MODES[sel.mode].name}`);
    if (sel.mode === 'evac') this.spawnPickups();
    if (sel.mode === 'rescue') this.spawnSurvivors();
    if (sel.mode === 'defense') ctx.map.core.visible = true;
    if (sel.mode === 'zones') this.nextZone();
  }

  /** Candidate zone centres: every objective anchor the map has. */
  private zoneCandidates(): THREE.Vector3[] {
    const a = this.ctx.map.anchors;
    return [a.core, a.evac, a.boss, ...a.pickups, ...a.rescues];
  }

  private nextZone(): void {
    const candidates = this.zoneCandidates();
    const from = this.zoneMarker?.position ?? this.ctx.player.root.position;
    let i = pickNextZone(candidates, this.zonesUsed, from);
    if (i < 0) {
      // small map: allow revisits rather than stalling the mission
      this.zonesUsed.clear();
      i = pickNextZone(candidates, this.zonesUsed, from);
    }
    this.zonesUsed.add(i);
    this.zoneMarker ??= this.beacon(0x38bdf8, ZONE_RADIUS);
    this.zoneMarker.position.copy(candidates[i]!).setY(0);
    this.zoneT = 0;
  }

  private banner(s: string): void {
    this.bannerText = s;
    this.bannerT = 3.2;
  }

  private beacon(color: number, r = 1.6): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0x8a8070), 0.4), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending });
    this.owned.push(mat, beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.25, 40), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 26, 10, 1, true), beam);
    col.position.y = 13;
    g.add(ring, col);
    this.ctx.scene.add(g);
    return g;
  }

  private spawnPickups(): void {
    for (const p of this.ctx.map.anchors.pickups) {
      const g = this.beacon(0xffb020, 1.4);
      const can = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.6, 0.22),
        new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5, metalness: 0.5, emissive: 0x7f1d1d, emissiveIntensity: 0.6 }),
      );
      this.owned.push(can.material as THREE.Material);
      can.position.y = 0.7;
      g.add(can);
      g.position.copy(p);
      this.pickups.push({ mesh: g, pos: p.clone(), taken: false });
    }
  }

  private spawnSurvivors(): void {
    for (const p of this.ctx.map.anchors.rescues) {
      const g = this.beacon(0x38bdf8, 2.6);
      g.position.copy(p);
      this.rescueMarkers.push(g);
    }
  }

  /** Objective markers for the off-screen arrow HUD. */
  indicators(): IndicatorSrc[] {
    const out: IndicatorSrc[] = [];
    for (const p of this.pickups) if (!p.taken) out.push({ pos: p.pos, color: 0xffb020, icon: '⛽', label: 'Yakıt bidonu' });
    this.rescueMarkers.forEach((g) => {
      if (g.visible && g.parent) out.push({ pos: g.position, color: 0x3cff6a, icon: '✚', label: 'Hayatta kalan' });
    });
    const ev = this.ctx.map.evacMarker;
    if (ev.visible) out.push({ pos: ev.position, color: 0xffd23c, icon: '🚁', label: 'Tahliye', urgent: true });
    for (const b of this.bosses) if (b.hp > 0) out.push({ pos: b.root.position, color: 0xff3a30, icon: '☠', label: 'Mutant' });
    if (this.zoneMarker && !this.outcome) out.push({ pos: this.zoneMarker.position, color: 0x38bdf8, icon: '⚑', label: 'Bölge', urgent: true });
    if (this.huntTarget && this.huntTarget.hp > 0) out.push({ pos: this.huntTarget.root.position, color: 0xffd23c, icon: '🎯', label: 'Hedef', urgent: true });
    return out;
  }

  onZombieKilled(z: ZombieVisual): void {
    if (z.kind === 'boss') this.bossKills++;
    if (z.kind === 'boss' && this.sel.mode === 'blitz') {
      this.blitzBonus += BLITZ_BOSS_BONUS;
      this.banner(`Boss düştü: +${BLITZ_BOSS_BONUS} sn`);
    }
    if (z === this.huntTarget) {
      this.huntTarget = null;
      this.huntKills += 1;
      this.stageT = 0;
      this.ctx.sfx('pickup');
      if (this.huntKills < HUNT_TARGETS) this.banner(`Hedef indirildi (${this.huntKills}/${HUNT_TARGETS})`);
    }
    if (this.bosses.delete(z) && this.sel.mode === 'boss') this.banner(`Boss düştü! (${this.bossKills}/3)`);
  }

  private spawnBoss(): ZombieVisual | null {
    const p = this.ctx.map.anchors.boss;
    const pl = this.ctx.player.root.position;
    // keep the boss arrival a fair distance away
    const x = Math.abs(p.x - pl.x) + Math.abs(p.z - pl.z) > 30 ? p.x : -p.x;
    const z = Math.abs(p.x - pl.x) + Math.abs(p.z - pl.z) > 30 ? p.z : -p.z;
    const b = this.ctx.spawnZombieAt('boss', x, z);
    if (b) {
      this.bosses.add(b);
      this.ctx.warn(new THREE.Vector3(x, 0, z), 6, 0xef4444, 2);
      this.ctx.sfx('alarm');
    }
    return b;
  }

  private tickHorde(dt: number): void {
    for (const z of this.hordeAlive) if (z.hp <= 0 || !z.root.parent) this.hordeAlive.delete(z);
    if (this.hordeLeft === 0 && this.hordeAlive.size === 0) {
      if (this.hordeWave >= HORDE_WAVES) {
        this.win(`${HORDE_WAVES} sürünün hepsini temizledin.`);
        return;
      }
      this.hordeBreak += dt;
      const wait = this.hordeWave === 0 ? 4 : 8;
      if (this.hordeBreak < wait) return;
      this.hordeBreak = 0;
      this.hordeWave += 1;
      const w = this.hordeWave;
      this.hordeLeft = Math.round((12 + w * 5 + (w % 5 === 0 ? 10 : 0)) * this.diff.count);
      this.banner(w === HORDE_WAVES ? `SON SÜRÜ ${w}/${HORDE_WAVES}` : `SÜRÜ ${w}/${HORDE_WAVES}`);
      this.ctx.sfx('alarm');
      if (w % 10 === 0) {
        const b = this.spawnBoss();
        if (b) this.hordeAlive.add(b);
      }
      return;
    }
    // trickle the horde in from a ring around the player (the arena caps alive count)
    const rate = 1.6 + this.hordeWave * 0.14;
    this.hordeSpawnT += dt * rate;
    const pl = this.ctx.player.root.position;
    while (this.hordeSpawnT >= 1 && this.hordeLeft > 0) {
      const a = Math.random() * Math.PI * 2;
      const d = 22 + Math.random() * 12;
      const kind = pickWaveSpawnKind(this.hordeWave, this.hordeLeft - 1);
      const z = this.ctx.spawnZombieAt(kind, pl.x + Math.cos(a) * d, pl.z + Math.sin(a) * d);
      if (!z) {
        // alive cap reached: wait for kills
        this.hordeSpawnT = 0;
        break;
      }
      this.hordeSpawnT -= 1;
      this.hordeLeft -= 1;
      this.hordeAlive.add(z);
    }
  }

  /** May the player revive after going down? Consumes one revive. */
  tryRevive(): boolean {
    if (this.revivesLeft <= 0) return false;
    this.revivesLeft -= 1;
    return true;
  }

  fail(reason: string): void {
    if (this.outcome) return;
    this.outcome = { won: false, title: 'GÖREV BAŞARISIZ', subtitle: reason };
  }
  private win(subtitle: string): void {
    if (this.outcome) return;
    this.outcome = { won: true, title: 'GÖREV TAMAMLANDI', subtitle };
    this.ctx.sfx('win');
  }

  /** Called every sim step. */
  update(dt: number, kills: number): void {
    if (this.outcome) return;
    this.t += dt;
    if (DEV_END && this.t > 0.5) {
      if (DEV_END === 'win') this.win('Test zaferi.');
      else this.fail('Test yenilgisi.');
      return;
    }
    this.stageT += dt;
    this.bannerT = Math.max(0, this.bannerT - dt);
    const pl = this.ctx.player.root.position;
    const m = this.ctx.map;
    switch (this.sel.mode) {
      case 'survival': {
        const total = this.total;
        // a mutant every 5 minutes before the final boss
        if (this.t < total && this.t >= (this.stage + 1) * 300 && !this.bosses.size) {
          this.spawnBoss();
          this.banner('Bir mutant yaklaşıyor!');
          this.stage += 1;
        }
        // pressure grows over the run so long modes stay tense
        this.spawnMul = Math.max(this.spawnMul, 1 + Math.min(0.6, this.t / total * 0.6));
        if (this.t >= total && !this.finalBoss) {
          this.finalBoss = this.spawnBoss();
          this.banner('SON DALGA — Boss\'u öldür!');
          this.spawnMul = 1.5;
        }
        if (this.finalBoss && this.finalBoss.hp <= 0) this.win(`${fmt(this.t)} dayandın, son boss öldü.`);
        break;
      }
      case 'defense': {
        const total = this.total;
        let hits = 0;
        for (const z of this.ctx.zombies) {
          if (z.hp <= 0) continue;
          const dx = z.root.position.x - m.anchors.core.x;
          const dz = z.root.position.z - m.anchors.core.z;
          if (dx * dx + dz * dz < 9) hits += z.kind === 'boss' ? 6 : z.kind === 'tank' ? 3 : 1;
        }
        if (hits) this.coreHp -= hits * dt * 0.9 * this.diff.dmg;
        this.spawnMul = 1 + (this.t / total) * 0.8;
        if (this.t < total && this.t >= (this.stage + 1) * 300) {
          this.spawnBoss();
          this.stage += 1;
          this.banner('Jeneratöre mutant saldırısı!');
        }
        if (this.coreHp <= 0) {
          this.coreHp = 0;
          this.fail('Jeneratör yok edildi.');
        } else if (this.t >= total) this.win(`Jeneratör %${Math.round(this.coreHp)} ile ayakta kaldı.`);
        break;
      }
      case 'evac':
      case 'rescue': {
        const needed = this.sel.mode === 'evac' ? this.pickups.length : this.rescueMarkers.length;
        const got = this.sel.mode === 'evac' ? this.pickups.filter((p) => p.taken).length : this.rescued;
        if (got < needed) {
          if (this.sel.mode === 'evac') {
            for (const p of this.pickups) {
              if (p.taken) continue;
              p.mesh.rotation.y += dt * 1.5;
              if (p.pos.distanceTo(pl) < 2) {
                p.taken = true;
                p.mesh.visible = false;
                this.ctx.sfx('pickup');
                this.banner(`Yakıt alındı (${got + 1}/${needed})`);
                this.spawnMul += 0.15;
              }
            }
          } else {
            const near = this.ctx.map.anchors.rescues.findIndex((p, i) => this.rescueMarkers[i]!.visible && p.distanceTo(pl) < 3);
            if (near >= 0) {
              this.freeT += dt;
              if (this.freeT >= 3) {
                this.freeT = 0;
                this.rescueMarkers[near]!.visible = false;
                this.rescued++;
                this.ctx.recruitAt(this.ctx.map.anchors.rescues[near]!.clone());
                this.ctx.sfx('pickup');
                this.banner(`Hayatta kalan kurtarıldı (${this.rescued}/${needed})`);
                this.spawnMul += 0.15;
              }
            } else this.freeT = Math.max(0, this.freeT - dt * 2);
          }
          break;
        }
        // hold the evac zone
        if (!m.evacMarker.visible) {
          m.evacMarker.visible = true;
          this.banner('Tahliye noktasına git!');
          this.ctx.sfx('alarm');
        }
        const hold = this.sel.mode === 'evac' ? 50 : 40;
        if (m.anchors.evac.distanceTo(pl) < 6) {
          this.holdT += dt;
          this.spawnMul = 1.9;
          if (this.stage === 0 && this.holdT > hold * 0.4) {
            this.spawnBoss();
            this.stage = 1;
          }
        } else this.holdT = Math.max(0, this.holdT - dt * 0.5);
        if (this.holdT >= hold) this.win(this.sel.mode === 'evac' ? 'Helikopter havalandı. Kurtuldunuz.' : `${this.rescued} kişiyi tahliye ettin.`);
        break;
      }
      case 'boss': {
        if (!this.bosses.size && this.bossKills < 3) {
          if (this.stageT > (this.bossKills === 0 ? 20 : 25)) {
            this.stageT = 0;
            const b = this.spawnBoss();
            if (b) {
              b.maxHp *= 1 + this.bossKills * 0.5;
              b.hp = b.maxHp;
            }
            this.banner(`Boss ${this.bossKills + 1}/3 geliyor!`);
          }
        }
        if (this.bossKills >= 3) this.win('Üç mutant da öldü.');
        break;
      }
      case 'horde':
        this.tickHorde(dt);
        break;
      case 'zones': {
        const zone = this.zoneMarker!.position;
        const held = this.ctx.squad.some((op) => op.alive && op.root.position.distanceTo(zone) < ZONE_RADIUS);
        this.zoneT = zoneProgress(this.zoneT, dt, held);
        this.spawnMul = held ? 1.5 + this.zonesDone * 0.15 : 1 + this.zonesDone * 0.1;
        if (this.zoneT < ZONE_HOLD_SECONDS) break;
        this.zonesDone += 1;
        this.ctx.sfx('pickup');
        if (this.zonesDone >= ZONE_COUNT) {
          this.zoneMarker!.visible = false;
          this.win(`${ZONE_COUNT} bölgenin hepsi sizde.`);
          break;
        }
        this.banner(`Bölge alındı (${this.zonesDone}/${ZONE_COUNT}) — sıradakine git!`);
        if (this.zonesDone === ZONE_COUNT - 1) this.spawnBoss();
        this.nextZone();
        break;
      }
      case 'hunt': {
        if (this.huntKills >= HUNT_TARGETS) {
          this.win('Listedeki herkes indirildi.');
          break;
        }
        this.spawnMul = 1 + this.huntKills * 0.12;
        if (this.huntTarget) {
          // despawned without dying (should not happen): put it back on the list
          if (!this.huntTarget.root.parent && this.huntTarget.hp > 0) this.huntTarget = null;
          break;
        }
        if (this.stageT < HUNT_RESPITE_SECONDS) break;
        const a = Math.random() * Math.PI * 2;
        const kind = huntTargetKind(this.huntKills);
        const target = this.ctx.spawnZombieAt(kind, pl.x + Math.cos(a) * 28, pl.z + Math.sin(a) * 28);
        if (!target) break; // alive cap: try again next step
        target.maxHp = Math.ceil(target.maxHp * (kind === 'boss' ? 1.3 : HUNT_TARGET_HP_MUL));
        target.hp = target.maxHp;
        this.huntTarget = target;
        this.ctx.warn(target.root.position.clone(), 4, 0xffd23c, 2);
        this.ctx.sfx('alarm');
        this.banner(kind === 'boss' ? 'SON HEDEF — listedeki boss!' : `Hedef ${this.huntKills + 1}/${HUNT_TARGETS} işaretlendi`);
        break;
      }
      case 'blitz': {
        if (this.blitzKills0 < 0) this.blitzKills0 = kills;
        this.blitzKills = kills - this.blitzKills0;
        const limit = BLITZ_SECONDS + this.blitzBonus;
        this.spawnMul = 1.5 + Math.min(0.4, this.t / limit * 0.4);
        if (this.stageT > 120) {
          this.stageT = 0;
          this.spawnBoss();
          this.banner('Boss geliyor — öldürürsen süre kazanırsın!');
        }
        const quota = blitzTarget(this.diff.count);
        if (this.blitzKills >= quota) this.win(`${quota} zombi, ${fmt(this.t)} içinde.`);
        else if (this.t >= limit) this.fail(`Süre doldu: ${this.blitzKills}/${quota}.`);
        break;
      }
      case 'endless':
        this.spawnMul = 1 + this.t / 300;
        if (this.stageT > 150) {
          this.stageT = 0;
          this.spawnBoss();
          this.banner('Boss dalgası!');
        }
        break;
    }
    void kills;
  }

  /** Objective HUD in the existing mission-panel shape. */
  hud(base: MissionHudState): MissionHudState {
    const md = MODES[this.sel.mode];
    const mapDef = MAPS[this.sel.map];
    let label = '';
    let prog = 0;
    let target = 1;
    switch (this.sel.mode) {
      case 'survival':
        label = this.finalBoss ? 'Son boss\'u öldür' : `Hayatta kal ${fmt(this.t)} / ${fmt(this.total)}`;
        prog = this.finalBoss ? 0 : this.t;
        target = this.finalBoss ? 1 : this.total;
        break;
      case 'horde':
        label =
          this.hordeWave === 0
            ? 'İlk sürü geliyor…'
            : this.hordeRemaining > 0
              ? `Sürü ${this.hordeWave}/${HORDE_WAVES} · kalan ${this.hordeRemaining}`
              : `Sürü ${this.hordeWave}/${HORDE_WAVES} temizlendi · sıradaki geliyor`;
        prog = Math.max(0, this.hordeWave - (this.hordeRemaining > 0 ? 1 : 0));
        target = HORDE_WAVES;
        break;
      case 'defense':
        label = `Jeneratör %${Math.round(this.coreHp)} · ${fmt(this.total - this.t)}`;
        prog = this.t;
        target = this.total;
        break;
      case 'evac':
      case 'rescue': {
        const needed = this.sel.mode === 'evac' ? this.pickups.length : this.rescueMarkers.length;
        const got = this.sel.mode === 'evac' ? this.pickups.filter((p) => p.taken).length : this.rescued;
        const hold = this.sel.mode === 'evac' ? 50 : 40;
        if (got < needed) {
          label = this.sel.mode === 'evac' ? `Yakıt bidonu ${got}/${needed}` : `Hayatta kalan ${got}/${needed}${this.freeT > 0 ? ' · kurtarılıyor…' : ''}`;
          prog = got;
          target = needed;
        } else {
          label = `Tahliye bölgesini tut ${fmt(this.holdT)} / ${fmt(hold)}`;
          prog = this.holdT;
          target = hold;
        }
        break;
      }
      case 'boss':
        label = `Boss ${this.bossKills}/3`;
        prog = this.bossKills;
        target = 3;
        break;
      case 'zones':
        label = `Bölge ${Math.min(ZONE_COUNT, this.zonesDone + 1)}/${ZONE_COUNT} · ${Math.floor(this.zoneT)}/${ZONE_HOLD_SECONDS} sn`;
        prog = this.zonesDone * ZONE_HOLD_SECONDS + this.zoneT;
        target = ZONE_COUNT * ZONE_HOLD_SECONDS;
        break;
      case 'hunt':
        label = this.huntTarget ? `Hedef ${this.huntKills + 1}/${HUNT_TARGETS} · işareti takip et` : `Hedef ${this.huntKills}/${HUNT_TARGETS} · sıradaki aranıyor…`;
        prog = this.huntKills;
        target = HUNT_TARGETS;
        break;
      case 'blitz': {
        const quota = blitzTarget(this.diff.count);
        label = `Leş ${this.blitzKills}/${quota} · ${fmt(BLITZ_SECONDS + this.blitzBonus - this.t)}`;
        prog = this.blitzKills;
        target = quota;
        break;
      }
      case 'endless':
        label = `Dayanma süresi ${fmt(this.t)}`;
        prog = 0;
        target = 1;
        break;
    }
    return {
      ...base,
      chapterTitle: `${md.icon} ${md.name}`,
      chapterCodename: `${mapDef.name} · ${this.diff.name}`,
      brief: md.desc,
      sectorName: mapDef.name,
      sectorCode: this.diff.name.toUpperCase(),
      objectiveLabel: label,
      objectiveProgress: prog,
      objectiveTarget: target,
      objectiveComplete: !!this.outcome?.won,
      banner: this.bannerT > 0 ? this.bannerText : '',
    };
  }

  get fuelTaken(): number {
    return this.pickups.filter((p) => p.taken).length;
  }

  get time(): number {
    return this.t;
  }

  dispose(): void {
    for (const p of this.pickups) p.mesh.removeFromParent();
    for (const r of this.rescueMarkers) r.removeFromParent();
    this.zoneMarker?.removeFromParent();
    this.owned.forEach((m) => m.dispose());
  }
}
