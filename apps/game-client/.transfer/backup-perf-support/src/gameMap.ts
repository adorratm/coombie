import * as THREE from 'three';
import { MapBuilder, setMapAnisotropy, type MapAnchors } from './mapBuilder';
import { MAPS, type MapDef, type MapId } from './mapDefs';
import type { MapBuildResult } from './map';
import { WeatherFx } from './weather';

export interface GameMap extends MapBuildResult {
  def: MapDef;
  bound: number;
  anchors: MapAnchors;
  /** resolves when every prop model is placed (colliders complete) */
  ready: Promise<void>;
  /** beacon over the evac point (shown by modes) */
  evacMarker: THREE.Group;
  update: (dt: number, t: number, center: THREE.Vector3) => void;
  dispose: () => void;
}

/** Build one of the ten maps into the scene (lighting is applied by the arena). */
export function buildGameMap(scene: THREE.Scene, id: MapId, renderer?: THREE.WebGLRenderer): GameMap {
  const def = MAPS[id] ?? MAPS.city;
  if (renderer) setMapAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const b = new MapBuilder(scene, def.half, def.seed);
  def.build(b);

  // boundary: low concrete wall ring just outside the playable area
  const H = def.half + 6;
  if (id !== 'lab') {
    for (const [x1, z1, x2, z2] of [
      [-H, -H, H, -H],
      [-H, H, H, H],
      [-H, -H, -H, H],
      [H, -H, H, H],
    ] as const)
      b.wall(x1, z1, x2, z2, 1.6, 'concrete_wall_008', 0.8, 0x6a6a6a);
  }

  // objective beacon at the core anchor: a fortified survivor camp
  const c = b.anchors.core;
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2 + 0.3;
    const a1 = a0 + 0.95;
    const r = 7.5;
    b.sandbags(c.x + Math.cos(a0) * r, c.z + Math.sin(a0) * r, c.x + Math.cos(a1) * r, c.z + Math.sin(a1) * r);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 1.1;
    b.clutter(c.x + Math.cos(a) * 4.5, c.z + Math.sin(a) * 4.5, ['milcrate', 'ammo', 'jerrycan', 'crate', 'medbox'], 3, 1.2);
  }
  b.prop('searchlight', c.x + 3, c.z - 3, { rot: -0.8, collide: false });
  b.prop('searchlight', c.x - 3, c.z + 3, { rot: 2.4, collide: false });
  b.lamp(c.x + 5.5, c.z + 5.5, 0xfff1d6, false, false);
  const coreGroup = new THREE.Group();
  coreGroup.position.set(c.x, 0, c.z);
  b.root.add(coreGroup);
  b.prop('generator', c.x, c.z, { rot: 0, scale: 1.4 });
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35, 0),
    new THREE.MeshStandardMaterial({ color: 0x0f2a1c, emissive: def.accent, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.4 }),
  );
  core.position.y = 2.6;
  // painted perimeter line (muted, not neon)
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.accent).lerp(new THREE.Color(0x8a8070), 0.6), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.85, 64), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.75, 64), ringMat.clone());
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.06;
  const coreGlow = new THREE.PointLight(def.accent, 3, 14, 1.8);
  coreGlow.position.y = 2.6;
  const alarm = new THREE.PointLight(0xff3030, 0, 18, 1.8);
  alarm.visible = false;
  alarm.position.y = 4;
  coreGroup.add(core, ring, ring2, coreGlow, alarm);

  // evac marker (flare + smoke column), hidden until a mode needs it
  const e = b.anchors.evac;
  const evacMarker = new THREE.Group();
  evacMarker.position.set(e.x, 0, e.z);
  const evRing = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.6, 64), new THREE.MeshBasicMaterial({ color: 0x5fae6e, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  evRing.rotation.x = -Math.PI / 2;
  evRing.position.y = 0.07;
  const evLight = new THREE.PointLight(0x3dff9a, 0, 18, 1.6);
  evLight.position.y = 3;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  beam.position.y = 20;
  evacMarker.add(evRing, evLight, beam);
  evacMarker.visible = false;
  b.root.add(evacMarker);

  const weather = new WeatherFx(scene, def.weather, typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const ready = b.finishProps();
  const flick = b.lights.filter((l) => l.userData.flicker);

  return {
    def,
    bound: def.half,
    anchors: b.anchors,
    ready,
    colliders: b.colliders,
    core,
    ring,
    ring2,
    alarm,
    coreGlow,
    sectorMarkers: [],
    evacMarker,
    update: (dt, t, center) => {
      weather.update(dt, center);
      for (let i = 0; i < flick.length; i++) flick[i]!.intensity = 8 + Math.sin(t * 13 + i * 3) * 2 + Math.sin(t * 31 + i) * 1.4;
      if (evacMarker.visible) {
        evRing.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
        evLight.intensity = 6 + Math.sin(t * 5) * 2;
      }
    },
    dispose: () => {
      weather.dispose();
      b.dispose();
    },
  };
}
