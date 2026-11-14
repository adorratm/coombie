import * as THREE from 'three';
import type { SkillFx } from './skillFx';

/**
 * Timed field power-ups: a military case pops a coloured signal-smoke flare
 * somewhere near the squad. Reach it before the timer runs out.
 */

export type PowerKind = 'speed' | 'damage' | 'firerate' | 'magnet' | 'heal';

export interface PowerDef {
  kind: PowerKind;
  name: string;
  desc: string;
  icon: string;
  color: number;
  /** effect duration (0 = instant) */
  dur: number;
}

export const POWER_DEFS: Record<PowerKind, PowerDef> = {
  speed: { kind: 'speed', name: 'Adrenalin', desc: '15 sn boyunca %45 daha hızlı koşarsın', icon: '🏃', color: 0x4fb4ff, dur: 15 },
  damage: { kind: 'damage', name: 'Ağır Mermi', desc: '15 sn boyunca %60 fazla hasar', icon: '💥', color: 0xff5a3c, dur: 15 },
  firerate: { kind: 'firerate', name: 'Hızlı Ateş', desc: '15 sn boyunca %50 daha hızlı ateş', icon: '🔥', color: 0xffa832, dur: 15 },
  magnet: { kind: 'magnet', name: 'Toplayıcı', desc: 'Haritadaki tüm numuneleri sana çeker', icon: '🧲', color: 0xb07aff, dur: 0 },
  heal: { kind: 'heal', name: 'Sahra Sağlık Çantası', desc: 'Tüm takım tam cana döner', icon: '✚', color: 0xf2f2f2, dur: 0 },
};
const KINDS = Object.keys(POWER_DEFS) as PowerKind[];

interface Drop {
  kind: PowerKind;
  group: THREE.Group;
  life: number;
  max: number;
  smokeT: number;
}

export interface IndicatorSrc {
  pos: THREE.Vector3;
  color: number;
  icon: string;
  label: string;
  /** seconds left (shows a countdown) */
  timer?: number;
  /** bigger, pulsing arrow */
  urgent?: boolean;
  /** ground ring radius for objectives that are a place (co-op guests draw it) */
  radius?: number;
}

const caseGeo = new THREE.BoxGeometry(0.75, 0.32, 0.5);
const lidGeo = new THREE.BoxGeometry(0.77, 0.06, 0.52);
const handleGeo = new THREE.BoxGeometry(0.22, 0.04, 0.04);
const flareGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8);
const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
const caseMat = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.8 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d2019, roughness: 0.7, metalness: 0.3 });

export class PowerUps {
  private readonly drops: Drop[] = [];
  private readonly active = new Map<PowerKind, number>();
  private spawnT = 28;
  private readonly bandMats = new Map<PowerKind, THREE.Material>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly fx: SkillFx,
  ) {}

  private band(kind: PowerKind): THREE.Material {
    let m = this.bandMats.get(kind);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: POWER_DEFS[kind].color, emissive: POWER_DEFS[kind].color, emissiveIntensity: 0.6, roughness: 0.5 });
      this.bandMats.set(kind, m);
    }
    return m;
  }

  spawn(kind: PowerKind, x: number, z: number): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(caseGeo, caseMat);
    body.position.y = 0.16;
    body.castShadow = true;
    const lid = new THREE.Mesh(lidGeo, darkMat);
    lid.position.y = 0.34;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.51), this.band(kind));
    stripe.position.y = 0.2;
    const handle = new THREE.Mesh(handleGeo, darkMat);
    handle.position.y = 0.39;
    const flare = new THREE.Mesh(flareGeo, this.band(kind));
    flare.position.set(0.5, 0.14, 0.25);
    flare.rotation.z = 0.5;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: POWER_DEFS[kind].color, transparent: true, opacity: 0.45, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.scale.setScalar(1.2);
    ring.name = 'ring';
    g.add(body, lid, stripe, handle, flare, ring);
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * Math.PI;
    this.scene.add(g);
    this.drops.push({ kind, group: g, life: 24, max: 24, smokeT: 0 });
  }

  /** Returns the kinds picked up this frame. */
  update(dt: number, now: number, player: THREE.Vector3, findSpot: () => { x: number; z: number } | null): PowerKind[] {
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.drops.length < 2) {
      this.spawnT = 38 + Math.random() * 22;
      const at = findSpot();
      if (at) this.spawn(KINDS[Math.floor(Math.random() * KINDS.length)]!, at.x, at.z);
    }
    const got: PowerKind[] = [];
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.life -= dt;
      const p = d.group.position;
      // coloured signal smoke drifting up
      d.smokeT -= dt;
      if (d.smokeT <= 0) {
        d.smokeT = 0.12;
        this.fx.emit('smoke', p.x + 0.4, 0.5, p.z + 0.2, { vy: 1.6, vx: 0.25, life: 3.2, s0: 0.35, s1: 2.2, color: POWER_DEFS[d.kind].color, a: 0.5 });
      }
      const ring = d.group.getObjectByName('ring') as THREE.Mesh;
      ring.scale.setScalar(1.1 + Math.sin(now * 4) * 0.12);
      if (d.life < 6) d.group.visible = Math.sin(d.life * 14) > -0.4;
      const dx = player.x - p.x;
      const dz = player.z - p.z;
      if (dx * dx + dz * dz < 1.6 * 1.6) {
        got.push(d.kind);
        if (POWER_DEFS[d.kind].dur > 0) this.active.set(d.kind, now + POWER_DEFS[d.kind].dur);
        this.fx.dustRing(p, 1.4, POWER_DEFS[d.kind].color);
        this.remove(i);
        continue;
      }
      if (d.life <= 0) this.remove(i);
    }
    return got;
  }

  private remove(i: number): void {
    const d = this.drops[i]!;
    d.group.removeFromParent();
    d.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.name === 'ring') (m.material as THREE.Material).dispose();
      if (m.isMesh && m.geometry !== caseGeo && m.geometry !== lidGeo && m.geometry !== handleGeo && m.geometry !== flareGeo && m.geometry !== ringGeo) m.geometry.dispose();
    });
    this.drops.splice(i, 1);
  }

  isActive(kind: PowerKind, now: number): boolean {
    return (this.active.get(kind) ?? 0) > now;
  }

  /** Active timed buffs for the HUD. */
  activeList(now: number): Array<{ def: PowerDef; left: number }> {
    const out: Array<{ def: PowerDef; left: number }> = [];
    for (const [k, until] of this.active) if (until > now) out.push({ def: POWER_DEFS[k], left: until - now });
    return out;
  }

  indicators(): IndicatorSrc[] {
    return this.drops.map((d) => ({
      pos: d.group.position,
      color: POWER_DEFS[d.kind].color,
      icon: POWER_DEFS[d.kind].icon,
      label: POWER_DEFS[d.kind].name,
      timer: d.life,
      urgent: d.life < 8,
    }));
  }

  dispose(): void {
    while (this.drops.length) this.remove(0);
    this.bandMats.forEach((m) => m.dispose());
  }
}
