import * as THREE from 'three';
import type { OperativeVisual, ZombieVisual } from './characters';
import type { SkillFx } from './skillFx';

/**
 * Called-in fire support (hero-exclusive run skills).
 *
 *  radio call (animation + voice line + subtitles + ground telegraph)
 *   → pilot / battery reply on the radio
 *   → the vehicle arrives (F-16 bomb run, gunship strafe, artillery barrage,
 *     armed UAV precision strikes, cargo plane supply drop)
 */

export type SupportKind = 'jet' | 'heli' | 'artillery' | 'siha' | 'supply';

export interface SupportCtx {
  scene: THREE.Scene;
  fx: SkillFx;
  player: OperativeVisual;
  zombies: ZombieVisual[];
  /** damage with the run-skill multipliers applied */
  hit: (z: ZombieVisual, dmg: number, at: THREE.Vector3, from?: THREE.Vector3) => void;
  shake: (v: number) => void;
  sample: (key: string, opts?: { gain?: number; pan?: number; rate?: number; bus?: 'combat' | 'player' | 'ui' }) => void;
  radio: () => void;
  say: (text: string, who: 'me' | 'radio') => void;
  supplyLanded: (at: THREE.Vector3) => void;
}

export const SUPPORT_LINES: Record<SupportKind, [string, string]> = {
  jet: ['İki gözüm, aydınlat hele şuraları!', 'Anlaşıldı, şahin geliyor. Başınızı eğin!'],
  heli: ['Kirvem, şuraları bir aydınlat hele!', 'Kirve geliyor, tarıyoruz!'],
  artillery: ['Topçu abi, koordinatları attım, yak gitsin!', 'Atış serbest, mermiler yolda!'],
  siha: ['SİHA, hedefler işaretli. Vur hepsini!', 'Hedefler kilitlendi, angajman başladı.'],
  supply: ['Kardeşim bir paket at, mermi bitti burada!', 'Paket yolda, sinyal dumanını yakın!'],
};

interface Ev {
  at: number;
  run: () => void;
}
interface Mover {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  dur: number;
  spin?: THREE.Object3D[];
  onTick?: (k: number, pos: THREE.Vector3) => void;
  bank?: number;
}
interface Decal {
  obj: THREE.Object3D;
  until: number;
  mats: THREE.MeshBasicMaterial[];
  base: number;
  follow?: ZombieVisual;
}
interface Fall {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  dur: number;
  land: () => void;
}
interface Crate {
  obj: THREE.Group;
  chute: THREE.Object3D;
  pos: THREE.Vector3;
  t0: number;
  dur: number;
  landed: boolean;
}

const RED = 0xd23a2a;

export class SupportCalls {
  private t = 0;
  private readonly events: Ev[] = [];
  private readonly movers: Mover[] = [];
  private readonly decals: Decal[] = [];
  private readonly falls: Fall[] = [];
  private readonly crates: Crate[] = [];
  private readonly geo: Record<string, THREE.BufferGeometry> = {};
  private readonly mat: Record<string, THREE.Material> = {};
  private protos: Partial<Record<'jet' | 'heli' | 'uav' | 'cargo' | 'bomb' | 'crate', THREE.Group>> = {};

  constructor(private readonly ctx: SupportCtx) {
    const std = (c: number, r = 0.55, m = 0.35) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    this.mat.grey = std(0x7c8389);
    this.mat.darkGrey = std(0x4b5157);
    this.mat.olive = std(0x4d5638, 0.7, 0.2);
    this.mat.glass = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.1, metalness: 0.6 });
    this.mat.black = std(0x15171a, 0.6, 0.3);
    this.mat.white = std(0xd9dcdf, 0.5, 0.2);
    this.mat.chute = new THREE.MeshStandardMaterial({ color: 0x6a7a4a, roughness: 0.9, side: THREE.DoubleSide });
    this.mat.flame = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 });
    this.geo.box = new THREE.BoxGeometry(1, 1, 1);
    this.geo.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14).rotateX(Math.PI / 2);
    this.geo.cone = new THREE.ConeGeometry(0.5, 1, 14).rotateX(Math.PI / 2);
    this.geo.sphere = new THREE.SphereGeometry(0.5, 14, 10);
    this.geo.ring = new THREE.RingGeometry(0.9, 1, 48);
    this.geo.plane = new THREE.PlaneGeometry(1, 1);
    const delta = new THREE.Shape();
    delta.moveTo(0, 1.4);
    delta.lineTo(4.6, -1.6);
    delta.lineTo(4.6, -2.3);
    delta.lineTo(0, -2.1);
    delta.lineTo(-4.6, -2.3);
    delta.lineTo(-4.6, -1.6);
    delta.closePath();
    this.geo.delta = new THREE.ExtrudeGeometry(delta, { depth: 0.12, bevelEnabled: false }).rotateX(Math.PI / 2);
  }

  // ------------------------------------------------------------ meshes
  private part(g: THREE.Group, geo: string, mat: string, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(this.geo[geo]!, this.mat[mat]!);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }

  /** F-16-like fighter, nose +Z, ~15 m long. */
  private jet(): THREE.Group {
    if (!this.protos.jet) {
      const g = new THREE.Group();
      this.part(g, 'cyl', 'grey', 1.2, 1.25, 11);
      this.part(g, 'cone', 'grey', 1.2, 1.2, 3.2, 0, 0, 7.1);
      this.part(g, 'sphere', 'glass', 0.85, 0.75, 3, 0, 0.6, 3.6);
      this.part(g, 'box', 'darkGrey', 1.4, 0.9, 2.8, 0, -0.55, 2.2); // intake
      this.part(g, 'delta', 'grey', 1, 1, 1, 0, 0, -1.2);
      const st = this.part(g, 'delta', 'grey', 0.42, 1, 0.5, 0, 0.1, -5.1);
      st.position.z = -4.6;
      const fin = this.part(g, 'box', 'grey', 0.14, 3.0, 2.4, 0, 1.6, -4.4);
      fin.rotation.x = -0.35;
      this.part(g, 'cyl', 'black', 0.95, 0.95, 1.0, 0, 0, -6);
      const fl = this.part(g, 'cone', 'flame', 0.8, 0.8, 2.2, 0, 0, -7.6);
      fl.rotation.y = Math.PI;
      fl.castShadow = false;
      this.part(g, 'cyl', 'darkGrey', 0.5, 0.5, 2.4, 2.6, -0.45, -0.4); // under-wing stores
      this.part(g, 'cyl', 'darkGrey', 0.5, 0.5, 2.4, -2.6, -0.45, -0.4);
      this.protos.jet = g;
    }
    return this.protos.jet.clone();
  }

  /** Utility/gunship helicopter, nose +Z. */
  private heli(): THREE.Group {
    if (!this.protos.heli) {
      const g = new THREE.Group();
      this.part(g, 'sphere', 'olive', 2.6, 2.4, 5.2);
      this.part(g, 'sphere', 'glass', 2.0, 1.4, 2.0, 0, 0.4, 2.0);
      this.part(g, 'cyl', 'olive', 0.55, 0.6, 6.5, 0, 0.5, -5.2);
      this.part(g, 'box', 'olive', 0.15, 1.8, 1.2, 0, 1.2, -8.2);
      this.part(g, 'box', 'black', 0.12, 0.12, 4.2, 1.1, -1.5, 0);
      this.part(g, 'box', 'black', 0.12, 0.12, 4.2, -1.1, -1.5, 0);
      this.part(g, 'box', 'olive', 3.8, 0.25, 0.9, 0, -0.2, 0.3); // stub wings
      this.part(g, 'cyl', 'darkGrey', 0.45, 0.45, 1.8, 1.9, -0.45, 0.4); // rocket pods
      this.part(g, 'cyl', 'darkGrey', 0.45, 0.45, 1.8, -1.9, -0.45, 0.4);
      this.part(g, 'cyl', 'black', 0.3, 0.3, 0.8, 0, 1.4, 0).rotation.x = 0;
      const rotor = new THREE.Group();
      rotor.name = 'rotor';
      rotor.position.y = 1.7;
      this.part(rotor, 'box', 'black', 13, 0.06, 0.45);
      this.part(rotor, 'box', 'black', 0.45, 0.06, 13);
      g.add(rotor);
      const tail = new THREE.Group();
      tail.name = 'tail';
      tail.position.set(0.25, 1.2, -8.2);
      this.part(tail, 'box', 'black', 0.05, 2.2, 0.25);
      g.add(tail);
      this.protos.heli = g;
    }
    return this.protos.heli.clone();
  }

  /** Armed MALE UAV: long straight wings, V tail, nose +Z. */
  private uav(): THREE.Group {
    if (!this.protos.uav) {
      const g = new THREE.Group();
      this.part(g, 'cyl', 'white', 0.8, 0.8, 6.5);
      this.part(g, 'sphere', 'white', 0.85, 0.85, 1.6, 0, 0, 3.2);
      this.part(g, 'box', 'white', 12, 0.1, 0.9, 0, 0.1, 0.4);
      const v1 = this.part(g, 'box', 'white', 2.2, 0.08, 0.7, 0.8, 0.5, -3.0);
      v1.rotation.z = 0.6;
      const v2 = this.part(g, 'box', 'white', 2.2, 0.08, 0.7, -0.8, 0.5, -3.0);
      v2.rotation.z = -0.6;
      const prop = new THREE.Group();
      prop.name = 'rotor';
      prop.position.z = -3.4;
      this.part(prop, 'box', 'black', 1.6, 0.12, 0.05);
      g.add(prop);
      this.part(g, 'cyl', 'darkGrey', 0.25, 0.25, 1.4, 2.5, -0.3, 0.4);
      this.part(g, 'cyl', 'darkGrey', 0.25, 0.25, 1.4, -2.5, -0.3, 0.4);
      this.protos.uav = g;
    }
    return this.protos.uav.clone();
  }

  /** Four-prop cargo plane, nose +Z. */
  private cargo(): THREE.Group {
    if (!this.protos.cargo) {
      const g = new THREE.Group();
      this.part(g, 'cyl', 'olive', 2.6, 2.8, 17);
      this.part(g, 'sphere', 'olive', 2.6, 2.6, 4, 0, 0, 8.4);
      this.part(g, 'box', 'olive', 30, 0.35, 3.2, 0, 1.2, 1);
      this.part(g, 'box', 'olive', 10, 0.25, 2.2, 0, 1.6, -8);
      this.part(g, 'box', 'olive', 0.3, 4.5, 3.0, 0, 3.2, -8.2);
      for (const x of [-10, -5, 5, 10]) this.part(g, 'cyl', 'darkGrey', 1, 1, 3, x, 0.9, 2);
      this.protos.cargo = g;
    }
    return this.protos.cargo.clone();
  }

  private bomb(): THREE.Group {
    if (!this.protos.bomb) {
      const g = new THREE.Group();
      this.part(g, 'cyl', 'darkGrey', 0.35, 0.35, 1.5);
      this.part(g, 'cone', 'darkGrey', 0.35, 0.35, 0.5, 0, 0, 0.95);
      this.part(g, 'box', 'darkGrey', 0.7, 0.05, 0.3, 0, 0, -0.75);
      this.part(g, 'box', 'darkGrey', 0.05, 0.7, 0.3, 0, 0, -0.75);
      this.protos.bomb = g;
    }
    return this.protos.bomb.clone();
  }

  // ------------------------------------------------------------ telegraphs
  private decal(obj: THREE.Object3D, dur: number, follow?: ZombieVisual): void {
    const mats: THREE.MeshBasicMaterial[] = [];
    obj.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m && !mats.includes(m)) mats.push(m);
    });
    this.ctx.scene.add(obj);
    this.decals.push({ obj, until: this.t + dur, mats, base: mats[0]?.opacity ?? 0.5, follow });
  }
  private redMat(o = 0.55): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
  }
  /** "X" impact mark with a ring. */
  private markX(at: THREE.Vector3, r: number, dur: number): void {
    const g = new THREE.Group();
    const m = this.redMat(0.6);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(this.geo.plane!, m);
      bar.rotation.set(-Math.PI / 2, 0, a);
      bar.scale.set(r * 1.3, 0.18, 1);
      g.add(bar);
    }
    const ring = new THREE.Mesh(this.geo.ring!, this.redMat(0.45));
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(r);
    g.add(ring);
    g.position.set(at.x, 0.06, at.z);
    this.decal(g, dur);
  }
  /** Long strafe strip with chevrons. */
  private markStrip(a: THREE.Vector3, b: THREE.Vector3, w: number, dur: number): void {
    const g = new THREE.Group();
    const len = a.distanceTo(b);
    const fill = new THREE.Mesh(this.geo.plane!, this.redMat(0.16));
    fill.rotation.x = -Math.PI / 2;
    fill.scale.set(w, len, 1);
    g.add(fill);
    const edge = this.redMat(0.6);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(this.geo.plane!, edge);
      e.rotation.x = -Math.PI / 2;
      e.scale.set(0.14, len, 1);
      e.position.x = (s * w) / 2;
      g.add(e);
    }
    for (let i = 0; i < Math.floor(len / 3); i++) {
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(this.geo.plane!, edge);
        c.rotation.set(-Math.PI / 2, 0, s * 0.7);
        c.scale.set(0.12, 1.1, 1);
        c.position.set(s * 0.35, 0, -len / 2 + 1.5 + i * 3);
        g.add(c);
      }
    }
    g.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2);
    g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    this.decal(g, dur);
  }
  /** Crosshair that follows a target. */
  private markTarget(z: ZombieVisual, dur: number): void {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(this.geo.ring!, this.redMat(0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(1.1);
    g.add(ring);
    const m = this.redMat(0.7);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(this.geo.plane!, m);
      t.rotation.set(-Math.PI / 2, 0, (i * Math.PI) / 2);
      t.scale.set(0.12, 0.6, 1);
      const a = (i * Math.PI) / 2;
      t.position.set(Math.sin(a) * 1.35, 0, Math.cos(a) * 1.35);
      g.add(t);
    }
    g.position.set(z.root.position.x, 0.07, z.root.position.z);
    this.decal(g, dur, z);
  }

  // ------------------------------------------------------------ helpers
  private at(dt: number, run: () => void): void {
    this.events.push({ at: this.t + dt, run });
  }
  private blast(p: THREE.Vector3, r: number, dmg: number, big = true): void {
    this.ctx.fx.explosion(p, big ? r * 0.75 : r * 0.55, 0xffa050);
    const r2 = r * r;
    for (const z of this.ctx.zombies) {
      if (z.hp <= 0) continue;
      const dx = z.root.position.x - p.x;
      const dz = z.root.position.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      this.ctx.hit(z, dmg * (1 - Math.sqrt(d2 / r2) * 0.45), z.root.position.clone().setY(1), p);
    }
    this.ctx.sample('s_explosion', { gain: big ? 0.85 : 0.55, rate: 0.85 + Math.random() * 0.3, pan: this.pan(p) });
    this.ctx.shake(big ? 0.45 : 0.22);
  }
  private pan(p: THREE.Vector3): number {
    return THREE.MathUtils.clamp((p.x - this.ctx.player.root.position.x) / 25, -0.8, 0.8);
  }
  private announce(kind: SupportKind): void {
    this.ctx.radio();
    this.ctx.sample(`v_${kind}_call`, { bus: 'player', gain: 1 });
    this.ctx.say(SUPPORT_LINES[kind][0], 'me');
    this.at(3.0, () => {
      this.ctx.sample(`v_${kind}_reply`, { bus: 'player', gain: 0.95 });
      this.ctx.say(SUPPORT_LINES[kind][1], 'radio');
    });
  }
  private fly(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, start: number, dur: number, extra: Partial<Mover> = {}): void {
    obj.visible = false;
    obj.position.copy(from);
    obj.lookAt(to);
    this.ctx.scene.add(obj);
    this.movers.push({ obj, from, to, t0: this.t + start, dur, ...extra });
  }

  // ------------------------------------------------------------ calls
  /** Returns false if there was nothing worth calling in on. */
  call(kind: SupportKind, lv: number, evo: boolean, power: number, target: THREE.Vector3 | null, strongest: ZombieVisual[]): boolean {
    const P = this.ctx.player.root.position;
    if (kind !== 'supply' && !target) return false;
    if (kind === 'siha' && !strongest.length) return false;
    this.announce(kind);
    const T = (target ?? P).clone().setY(0);
    if (kind === 'jet') this.jetRun(T, lv, evo, power);
    else if (kind === 'heli') this.heliRun(T, lv, evo, power);
    else if (kind === 'artillery') this.barrage(T, lv, evo, power);
    else if (kind === 'siha') this.sihaRun(strongest, lv, evo, power);
    else this.supplyRun(T, evo);
    return true;
  }

  /** Mostly top-of-screen → bottom heading (camera looks toward −Z), a little random. */
  private screenDir(): THREE.Vector3 {
    const a = (Math.random() - 0.5) * 0.7;
    return new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  }

  private jetRun(T: THREE.Vector3, lv: number, evo: boolean, power: number): void {
    const ang = Math.atan2(this.screenDir().x, 1);
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const len = 16 + lv * 2;
    const nb = 5 + lv + (evo ? 2 : 0);
    const lanes = evo ? [-3.2, 3.2] : [0];
    const ALT = 9;
    const SPEED = 36;
    const arrive = 5.4; // talk (≈3 s) → reply → ~2 s later the jet is over the target
    const dmg = 26 * (1 + 0.3 * (lv - 1)) * power;
    for (const off of lanes) {
      const c = T.clone().addScaledVector(side, off);
      const a = c.clone().addScaledVector(dir, -len / 2);
      const b = c.clone().addScaledVector(dir, len / 2);
      for (let i = 0; i < nb; i++) this.markX(a.clone().lerp(b, nb === 1 ? 0.5 : i / (nb - 1)), 1.6, arrive + 1.6);
      const from = c.clone().addScaledVector(dir, -SPEED * 1.8).setY(ALT + 3);
      const to = c.clone().addScaledVector(dir, SPEED * 1.8).setY(ALT + 7);
      const plane = this.jet();
      this.fly(plane, from, to, arrive - 1.8, 3.6, { bank: off === 0 ? 0.15 : off * 0.04 });
      for (let i = 0; i < nb; i++) {
        const k = nb === 1 ? 0.5 : i / (nb - 1);
        const p = a.clone().lerp(b, k);
        // the jet passes over point p at: arrive + (k - 0.5) * len / SPEED
        const rel = arrive + ((k - 0.5) * len) / SPEED - 0.05;
        this.at(rel, () => {
          const bomb = this.bomb();
          const start = p.clone().addScaledVector(dir, -6).setY(ALT - 1.2);
          bomb.position.copy(start);
          bomb.lookAt(p);
          this.ctx.scene.add(bomb);
          this.falls.push({ obj: bomb, from: start, to: p.clone(), t0: this.t, dur: 0.55, land: () => this.blast(p, 2.9, dmg) });
        });
      }
    }
    this.at(arrive - 2.0, () => this.ctx.sample('s_jet', { gain: 1, pan: dir.x * 0.6 }));
  }

  private heliRun(T: THREE.Vector3, lv: number, evo: boolean, power: number): void {
    const dir = this.screenDir();
    const len = 22 + lv * 2 + (evo ? 8 : 0);
    const w = 3.6;
    const a = T.clone().addScaledVector(dir, -len / 2);
    const b = T.clone().addScaledVector(dir, len / 2);
    const start = 4.6;
    const SPEED = 13;
    const runDur = len / SPEED;
    this.markStrip(a, b, w, start + runDur + 1.6);
    const ALT = 7;
    const from = a.clone().addScaledVector(dir, -SPEED * 2.2).setY(ALT);
    const to = b.clone().addScaledVector(dir, SPEED * 2.6).setY(ALT + 2);
    const h = this.heli();
    const total = (from.distanceTo(to)) / SPEED;
    const dps = 30 * (1 + 0.3 * (lv - 1)) * power;
    let tick = 0;
    let shots = 0;
    this.fly(h, from, to, start - 2.2, total, {
      spin: [h.getObjectByName('rotor')!, h.getObjectByName('tail')!],
      bank: 0.12,
      onTick: (_k, pos) => {
        // fire while over the strip
        const along = pos.clone().sub(a).dot(dir);
        if (along < -2 || along > len + 2) return;
        tick += 1 / 60;
        shots++;
        const tgt = a.clone().addScaledVector(dir, THREE.MathUtils.clamp(along + 3 + Math.random() * 4, 0, len)).add(new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar((Math.random() - 0.5) * w));
        const muzzle = pos.clone().add(new THREE.Vector3(0, -1.3, 0)).addScaledVector(dir, 2.4);
        this.ctx.fx.tracer(muzzle, tgt.clone().setY(0.2), 0xffc46a);
        if (shots % 3 === 0) this.ctx.fx.debris(tgt, 2, 0.4);
        if (shots % 2 === 0) this.ctx.fx.emit('smoke', tgt.x, 0.3, tgt.z, { vy: 0.6, life: 0.8, s0: 0.3, s1: 0.9, color: 0x6e6250, a: 0.35 });
        if (evo && shots % 20 === 0) this.blast(tgt, 2.2, dps * 0.4, false);
        if (tick >= 0.1) {
          tick = 0;
          const side = new THREE.Vector3(dir.z, 0, -dir.x);
          for (const z of this.ctx.zombies) {
            if (z.hp <= 0) continue;
            const r = z.root.position.clone().sub(a);
            const al = r.dot(dir);
            if (al < along - 1 || al > along + 8) continue;
            if (Math.abs(r.dot(side)) > w / 2 + 0.3) continue;
            this.ctx.hit(z, dps * 0.1, z.root.position.clone().setY(1), pos);
          }
        }
      },
    });
    this.at(start - 2.6, () => this.ctx.sample('s_heli', { gain: 1, pan: -0.4 }));
  }

  private barrage(T: THREE.Vector3, lv: number, evo: boolean, power: number): void {
    const R = 6 + lv * 0.5;
    const ring = new THREE.Group();
    const m = new THREE.Mesh(this.geo.ring!, this.redMat(0.5));
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(R);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(R, 40), this.redMat(0.1));
    fill.rotation.x = -Math.PI / 2;
    ring.add(m, fill);
    ring.position.set(T.x, 0.05, T.z);
    const n = 9 + lv * 2 + (evo ? 10 : 0);
    const dmg = 20 * (1 + 0.3 * (lv - 1)) * power;
    const start = 4.2;
    this.decal(ring, start + n * 0.22 + 1.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * R;
      const p = new THREE.Vector3(T.x + Math.cos(a) * d, 0, T.z + Math.sin(a) * d);
      const tt = start + i * 0.22 + Math.random() * 0.15;
      if (i % 3 === 0) this.at(tt - 1.1, () => this.ctx.sample('s_whistle', { gain: 0.45, rate: 0.9 + Math.random() * 0.2, pan: this.pan(p) }));
      this.at(tt, () => this.blast(p, 2.5, dmg, i % 2 === 0));
    }
  }

  private sihaRun(targets: ZombieVisual[], lv: number, evo: boolean, power: number): void {
    const n = Math.min(targets.length, 2 + Math.floor(lv / 2) + (evo ? 3 : 0));
    const list = targets.slice(0, n);
    const start = 3.8;
    for (const z of list) this.markTarget(z, start + 3);
    const P = this.ctx.player.root.position;
    const u = this.uav();
    const c = P.clone().setY(13);
    const from = c.clone().add(new THREE.Vector3(-60, 0, -20));
    const to = c.clone().add(new THREE.Vector3(60, 0, 20));
    this.fly(u, from, to, start - 2.2, 8, { spin: [u.getObjectByName('rotor')!], bank: 0.08 });
    const dmg = 60 * (1 + 0.35 * (lv - 1)) * power;
    list.forEach((z, i) => {
      this.at(start + 0.2 + i * 0.45, () => {
        const p = z.hp > 0 ? z.root.position.clone().setY(0) : null;
        if (!p) return;
        this.ctx.sample('s_missile', { gain: 0.6, pan: this.pan(p) });
        const mis = this.bomb();
        mis.scale.setScalar(0.7);
        const st = u.position.clone();
        mis.position.copy(st);
        mis.lookAt(p);
        this.ctx.scene.add(mis);
        this.falls.push({
          obj: mis,
          from: st,
          to: p,
          t0: this.t,
          dur: 0.65,
          land: () => {
            const tp = z.hp > 0 ? z.root.position.clone().setY(0) : p;
            this.blast(tp, 2.2, dmg, false);
          },
        });
      });
    });
  }

  private supplyRun(P: THREE.Vector3, evo: boolean): void {
    const n = evo ? 2 : 1;
    const dir = this.screenDir();
    const start = 4.4;
    const SPEED = 40;
    const from = P.clone().addScaledVector(dir, -SPEED * 2).setY(14);
    const to = P.clone().addScaledVector(dir, SPEED * 2.2).setY(16);
    this.fly(this.cargo(), from, to, start - 2, 4.2);
    this.at(start - 1.8, () => this.ctx.sample('s_jet', { gain: 0.8, rate: 0.62, pan: -0.5 }));
    for (let i = 0; i < n; i++) {
      const drop = P.clone().add(new THREE.Vector3((Math.random() - 0.5) * (n > 1 ? 5 : 1), 0, (Math.random() - 0.5) * (n > 1 ? 5 : 1)));
      this.markX(drop, 1.4, start + 4.2);
      this.at(start + i * 0.3, () => this.dropCrate(drop));
    }
  }

  private dropCrate(at: THREE.Vector3): void {
    const g = new THREE.Group();
    this.part(g, 'box', 'olive', 1.1, 0.8, 1.1, 0, 0.4, 0);
    this.part(g, 'box', 'black', 1.12, 0.1, 1.12, 0, 0.5, 0);
    const chute = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), this.mat.chute!);
    canopy.position.y = 5.5;
    canopy.castShadow = true;
    chute.add(canopy);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const line = new THREE.Mesh(this.geo.box!, this.mat.black!);
      line.scale.set(0.03, 4.6, 0.03);
      line.position.set(Math.cos(a) * 1.1, 3.1, Math.sin(a) * 1.1);
      line.rotation.set(Math.sin(a) * -0.25, 0, Math.cos(a) * 0.25);
      chute.add(line);
    }
    g.add(chute);
    g.position.set(at.x, 14, at.z);
    this.ctx.scene.add(g);
    this.crates.push({ obj: g, chute, pos: at.clone(), t0: this.t, dur: 3.2, landed: false });
  }

  // ------------------------------------------------------------ tick
  update(dt: number): void {
    this.t += dt;
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (e.at > this.t) continue;
      this.events.splice(i, 1);
      e.run();
    }
    for (let i = this.movers.length - 1; i >= 0; i--) {
      const m = this.movers[i]!;
      const k = (this.t - m.t0) / m.dur;
      if (k < 0) continue;
      m.obj.visible = true;
      if (k >= 1) {
        m.obj.removeFromParent();
        this.movers.splice(i, 1);
        continue;
      }
      m.obj.position.lerpVectors(m.from, m.to, k);
      m.obj.lookAt(m.to);
      if (m.bank) m.obj.rotateZ(Math.sin(k * Math.PI) * m.bank);
      if (m.spin) for (const s of m.spin) s.rotation.y += dt * 40;
      m.onTick?.(k, m.obj.position);
    }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i]!;
      const k = Math.min(1, (this.t - f.t0) / f.dur);
      f.obj.position.lerpVectors(f.from, f.to, k * k);
      if (Math.random() < 0.5) this.ctx.fx.emit('smoke', f.obj.position.x, f.obj.position.y, f.obj.position.z, { life: 0.6, s0: 0.2, s1: 0.7, color: 0x9a948a, a: 0.35 });
      if (k >= 1) {
        f.obj.removeFromParent();
        this.falls.splice(i, 1);
        f.land();
      }
    }
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i]!;
      const k = Math.min(1, (this.t - c.t0) / c.dur);
      if (!c.landed) {
        c.obj.position.y = THREE.MathUtils.lerp(14, 0, k);
        c.obj.rotation.y += dt * 0.4;
        if (k >= 1) {
          c.landed = true;
          c.chute.removeFromParent();
          this.ctx.fx.dustRing(c.pos, 2);
          this.ctx.supplyLanded(c.pos);
          c.t0 = this.t;
        }
      } else if (this.t - c.t0 > 1.2) {
        c.obj.removeFromParent();
        this.crates.splice(i, 1);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]!;
      const left = d.until - this.t;
      if (d.follow && d.follow.hp > 0) d.obj.position.set(d.follow.root.position.x, 0.07, d.follow.root.position.z);
      const pulse = 0.75 + Math.sin(this.t * 10) * 0.25;
      for (const m of d.mats) m.opacity = Math.min(1, left / 0.6) * (m.userData.base ?? (m.userData.base = m.opacity)) * pulse;
      if (d.follow) d.obj.rotation.y += dt * 1.5;
      if (left <= 0) {
        d.obj.removeFromParent();
        d.mats.forEach((m) => m.dispose());
        this.decals.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const m of this.movers) m.obj.removeFromParent();
    for (const f of this.falls) f.obj.removeFromParent();
    for (const c of this.crates) c.obj.removeFromParent();
    for (const d of this.decals) {
      d.obj.removeFromParent();
      d.mats.forEach((m) => m.dispose());
    }
    Object.values(this.geo).forEach((g) => g.dispose());
    Object.values(this.mat).forEach((m) => m.dispose());
  }
}
