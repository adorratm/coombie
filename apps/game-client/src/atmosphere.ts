/**
 * Living sky for a run:
 *  - day / dusk maps slide toward night as the run goes on (minute 3 → 16): the sun
 *    cools and dims, ambient turns blue, fog thickens, exposure follows. Never fully
 *    dark: it stays readable from the top-down camera.
 *  - rain maps (and any map once night has fallen) get storm lightning: a hard
 *    blue-white flash, a short after-flicker and rolling thunder a moment later.
 * Purely visual: the same on host and guests, no gameplay effect.
 */
import * as THREE from 'three';
import type { MapLighting, Weather } from './mapDefs';

export interface AtmosphereRefs {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  base: MapLighting;
  weather: Weather;
  /** intensity multipliers the arena already applied at setup */
  mul: { ambient: number; hemi: number; sun: number };
  onFlash: (amount: number) => void;
  onThunder: (delaySec: number, big: boolean) => void;
}

const NIGHT_SUN = new THREE.Color(0x8fa8d8);
const NIGHT_AMB = new THREE.Color(0x1a2440);
const NIGHT_SKY = new THREE.Color(0x04060c);
const NIGHT_FOG = new THREE.Color(0x0a1020);
const _c = new THREE.Color();

export class Atmosphere {
  private nextBolt = 0;
  private flicker: number[] = [];
  private bolt = 0;
  private readonly day: boolean;
  private readonly bg0: THREE.Color;
  private readonly fog0: THREE.Color;
  private readonly sun0: THREE.Color;
  private readonly amb0: THREE.Color;
  constructor(private readonly r: AtmosphereRefs) {
    const l = new THREE.Color(r.base.bg).getHSL({ h: 0, s: 0, l: 0 }).l;
    // already-dark maps (night, interiors) keep their look; lightning still applies in rain
    this.day = l > 0.045;
    this.bg0 = new THREE.Color(r.base.bg);
    this.fog0 = new THREE.Color(r.base.fog);
    this.sun0 = new THREE.Color(r.base.sun[0]);
    this.amb0 = new THREE.Color(r.base.ambient[0]);
    this.nextBolt = 6 + Math.random() * 10;
  }

  /** How far toward night (0..0.7) at this run time. */
  static nightAt(min: number): number {
    const t = Math.min(1, Math.max(0, (min - 3) / 13));
    return t * t * (3 - 2 * t) * 0.7;
  }

  update(dt: number, simTime: number): void {
    const r = this.r;
    const n = this.day ? Atmosphere.nightAt(simTime / 60) : 0;
    if (this.day) {
      (r.scene.background as THREE.Color).copy(this.bg0).lerp(NIGHT_SKY, n);
      const fog = r.scene.fog as THREE.FogExp2;
      fog.color.copy(this.fog0).lerp(NIGHT_FOG, n);
      fog.density = r.base.fogDensity * 0.6 * (1 + n * 0.5);
      r.sun.color.copy(this.sun0).lerp(NIGHT_SUN, n);
      r.ambient.color.copy(this.amb0).lerp(NIGHT_AMB, n);
      r.renderer.toneMappingExposure = r.base.exposure * (1 - n * 0.25);
    }
    // lightning (rain always, other outdoor maps once it is properly dark)
    const storm = r.weather === 'rain' || (this.day && n > 0.55 && r.weather !== 'snow');
    let boost = 0;
    if (storm) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = (r.weather === 'rain' ? 7 : 14) + Math.random() * 14;
        const big = Math.random() < 0.4;
        this.bolt = big ? 1 : 0.6;
        // after-flickers
        this.flicker = [0.09, 0.2 + Math.random() * 0.1, big ? 0.45 : 0.32].map((d) => simTime + d);
        r.onFlash(big ? 0.55 : 0.3);
        r.onThunder(0.4 + Math.random() * 1.6, big);
      }
      for (let i = this.flicker.length - 1; i >= 0; i--) {
        if (simTime >= this.flicker[i]!) {
          this.flicker.splice(i, 1);
          this.bolt = Math.max(this.bolt, 0.45 + Math.random() * 0.3);
        }
      }
      boost = this.bolt;
      this.bolt = Math.max(0, this.bolt - dt * 9);
    }
    const dim = 1 - n * 0.55;
    r.sun.intensity = r.base.sun[1] * r.mul.sun * dim + boost * 2.2;
    r.hemi.intensity = r.base.hemi[2] * r.mul.hemi * (1 - n * 0.4) + boost * 3.5;
    r.ambient.intensity = r.base.ambient[1] * r.mul.ambient * (1 - n * 0.2) + boost * 0.8;
    if (boost > 0) {
      _c.setHex(0xcfe0ff);
      r.hemi.color.lerp(_c, Math.min(1, boost));
    } else r.hemi.color.setHex(r.base.hemi[0]);
  }
}
