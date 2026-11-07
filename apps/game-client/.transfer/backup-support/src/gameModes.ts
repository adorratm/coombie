import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { ZombieKind } from './zombieKinds';
import type { MissionHudState } from './mission';
import { MAPS, type MapId, type ModeId } from './mapDefs';
import type { GameMap } from './gameMap';

/**
 * Game modes, difficulties and the per-run objective runtime.
 *
 *  survival  survive the timer, then kill the final boss
 *  defense   keep the generator alive until the timer ends
 *  rescue    free 3 survivors (they join the squad), then hold the evac zone
 *  evac      collect 4 fuel cans, then hold the evac zone until the chopper lands
 *  boss      three bosses hunt you one after another
 *  endless   no end — the horde keeps scaling; score = time + kills
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
  survival: { id: 'survival', name: 'Hayatta Kal', icon: '⏱', desc: '8 dakika dayan, sonra son boss\'u öldür.' },
  defense: { id: 'defense', name: 'Savunma', icon: '⛨', desc: 'Jeneratörü 7 dakika boyunca koru.' },
  rescue: { id: 'rescue', name: 'Kurtarma', icon: '✚', desc: '3 hayatta kalanı kurtar, tahliye noktasını tut.' },
  evac: { id: 'evac', name: 'Tahliye', icon: '⛽', desc: '4 yakıt bidonu topla, helikopter gelene kadar dayan.' },
  boss: { id: 'boss', name: 'Boss Avı', icon: '☠', desc: 'Üç dev mutant sırayla geliyor.' },
  endless: { id: 'endless', name: 'Sonsuz', icon: '∞', desc: 'Bitiş yok. Ne kadar dayanabilirsin?' },
};

export interface MissionSelection {
  map: MapId;
  mode: ModeId;
  difficulty: DifficultyId;
}

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

  constructor(sel: MissionSelection, ctx: ModeCtx) {
    this.sel = sel;
    this.diff = DIFFICULTIES[sel.difficulty] ?? DIFFICULTIES.normal;
    this.ctx = ctx;
    this.revivesLeft = this.diff.revives;
    this.banner(`${MAPS[sel.map].name} · ${MODES[sel.mode].name}`);
    if (sel.mode === 'evac') this.spawnPickups();
    if (sel.mode === 'rescue') this.spawnSurvivors();
    if (sel.mode === 'defense') ctx.map.core.visible = true;
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

  onZombieKilled(z: ZombieVisual): void {
    if (z.kind === 'boss') this.bossKills++;
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
        const total = 480;
        if (this.stage === 0 && this.t >= 240 && !this.bosses.size) {
          this.spawnBoss();
          this.banner('Bir mutant yaklaşıyor!');
          this.stage = 1;
        }
        if (this.t >= total && !this.finalBoss) {
          this.finalBoss = this.spawnBoss();
          this.banner('SON DALGA — Boss\'u öldür!');
          this.spawnMul = 1.5;
        }
        if (this.finalBoss && this.finalBoss.hp <= 0) this.win(`${fmt(this.t)} dayandın, son boss öldü.`);
        break;
      }
      case 'defense': {
        const total = 420;
        let hits = 0;
        for (const z of this.ctx.zombies) {
          if (z.hp <= 0) continue;
          const dx = z.root.position.x - m.anchors.core.x;
          const dz = z.root.position.z - m.anchors.core.z;
          if (dx * dx + dz * dz < 9) hits += z.kind === 'boss' ? 6 : z.kind === 'tank' ? 3 : 1;
        }
        if (hits) this.coreHp -= hits * dt * 0.9 * this.diff.dmg;
        this.spawnMul = 1 + this.t / total;
        if (this.stage === 0 && this.t > 200) {
          this.spawnBoss();
          this.stage = 1;
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
        label = this.finalBoss ? 'Son boss\'u öldür' : `Hayatta kal ${fmt(this.t)} / 8:00`;
        prog = this.finalBoss ? 0 : this.t;
        target = this.finalBoss ? 1 : 480;
        break;
      case 'defense':
        label = `Jeneratör %${Math.round(this.coreHp)} · ${fmt(420 - this.t)}`;
        prog = this.t;
        target = 420;
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
    this.owned.forEach((m) => m.dispose());
  }
}
