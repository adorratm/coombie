import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ensureWeaponEnvironment, hasGunModel, loadGunTemplate, VARIANT_MODELS } from './weaponAssets';
import { attachWeaponMesh, weaponByVariant } from './weapons';
import { buildBackpack, buildBelt, buildHeadlamp, buildHolster, buildKneepad, gearUrl } from './costumeLook';
import { loadRigTemplate } from './humanoidRig';
import { buildItemModel, buildSampleModel, type ItemId } from './items';
import { createVrmAvatar } from './avatars';
import type { Cosmetics } from './costumeLook';

/**
 * UI thumbnails rendered from the real 3D models (weapons, gear, loot) by one
 * small offscreen renderer. Results are cached as data URLs, so a thumbnail is
 * rendered once per session; <img> elements are filled in asynchronously.
 */

const W = 320;
const H = 180;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let chain: Promise<unknown> = Promise.resolve();
let headlight: THREE.DirectionalLight;

function setup(): void {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.7;
  renderer.setClearColor(0x000000, 0);
  ensureWeaponEnvironment(renderer);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(22, W / H, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a342c, 1.8));
  headlight = new THREE.DirectionalLight(0xffffff, 1.6);
  scene.add(headlight);
  const key = new THREE.DirectionalLight(0xfff2de, 2.6);
  key.position.set(-3, 4, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1.6);
  rim.position.set(2, 2, -4);
  scene.add(rim);
}

/** Frame the object and render. `side` = look from -X so a +Z barrel points right. */
function shoot(obj: THREE.Object3D, view: 'side' | 'front' | 'top3q', aspectW = W, aspectH = H): string {
  setup();
  const r = renderer!;
  r.setSize(aspectW, aspectH, false);
  camera.aspect = aspectW / aspectH;
  const holder = new THREE.Group();
  holder.add(obj);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  holder.updateMatrixWorld(true);
  box.setFromObject(obj, true);
  const size = box.getSize(new THREE.Vector3());
  const dir =
    view === 'side' ? new THREE.Vector3(-1, 0.18, 0.12) : view === 'front' ? new THREE.Vector3(0.35, 0.25, 1) : new THREE.Vector3(0.75, 0.9, 1);
  dir.normalize();
  // fit both width and height in the frustum
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const span = view === 'side' ? Math.max(size.z, 0.001) : Math.max(size.x, size.z);
  const tall = size.y;
  const depth = view === 'side' ? size.x : size.z;
  const dist = Math.max(span / 2 / Math.tan(hFov / 2), tall / 2 / Math.tan(vFov / 2)) * 1.1 + depth * 0.5;
  camera.position.copy(dir.multiplyScalar(dist));
  camera.near = dist / 50;
  camera.far = dist * 4;
  camera.lookAt(0, 0, 0);
  headlight.position.copy(camera.position).add(new THREE.Vector3(0, dist * 0.4, 0));
  camera.updateProjectionMatrix();
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(holder);
  return url;
}

function queue(key: string, make: () => Promise<string>): Promise<string> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    p = (chain = chain.then(make, make)) as Promise<string>;
    p.then((u) => cache.set(key, u)).catch(() => undefined);
    inflight.set(key, p);
  }
  return p;
}

export function weaponThumb(variant: string): Promise<string> {
  return queue(`w:${variant}`, async () => {
    if (hasGunModel(variant)) await loadGunTemplate(VARIANT_MODELS[variant]!.file).catch(() => null);
    const g = new THREE.Group();
    attachWeaponMesh(g, weaponByVariant(variant), 0x8a8f94, 1);
    return shoot(g, 'side');
  });
}

export function backpackThumb(tier: number): Promise<string> {
  return queue(`bp:${tier}`, async () => {
    const g = buildBackpack(tier, 0x2f3528);
    g.rotation.y = Math.PI * 0.82;
    return shoot(g, 'front');
  });
}

export function accessoryThumb(id: string): Promise<string> {
  return queue(`acc:${id}`, async () => {
    const url = gearUrl(id, 'male');
    let obj: THREE.Object3D;
    if (url) {
      const tpl = await loadRigTemplate(url);
      obj = cloneSkinned(tpl.scene);
      obj.traverse((o) => (o.frustumCulled = false));
    } else if (id === 'belt') obj = buildBelt();
    else if (id === 'holster') obj = buildHolster();
    else if (id === 'kneepads') {
      obj = new THREE.Group();
      const a = buildKneepad();
      const b = buildKneepad();
      a.position.x = -7;
      b.position.x = 7;
      obj.add(a, b);
    } else obj = buildHeadlamp();
    return shoot(obj, 'front');
  });
}

export function itemThumb(id: ItemId | 'sample'): Promise<string> {
  return queue(`it:${id}`, async () => {
    const g = id === 'sample' ? buildSampleModel(6) : buildItemModel(id);
    const marker = g.getObjectByName('marker');
    if (marker) marker.visible = false;
    return shoot(g, 'top3q', 160, 160);
  });
}

/** Head-and-shoulders portrait of an operative (with their current outfit). */
export function heroPortrait(key: string, url: string, gender: 'male' | 'female', cosmetics: Cosmetics): Promise<string> {
  return queue(`hero:${key}`, async () => {
    setup();
    const a = await createVrmAvatar({ url, accentColor: 0x888888, gender, style: 'operative', showRing: false, cosmetics });
    const idle = { localVelX: 0, localVelZ: 0, shotSerial: 0, hitSerial: 0, abilitySerial: 0, reloading: false, reloadTime: 2, alive: true };
    for (let i = 0; i < 6; i++) a.update(0.25, false, false, 0, 0, false, 0, { grip: 'rifle', anim: idle });
    const holder = new THREE.Group();
    holder.add(a.root);
    scene.add(holder);
    holder.updateMatrixWorld(true);
    // head = top of the body bounds (bone nodes of converted rigs are not reliable here)
    const bb = new THREE.Box3().setFromObject(a.root, true);
    const hgt = bb.max.y - bb.min.y;
    const ctr = bb.getCenter(new THREE.Vector3());
    const hp = new THREE.Vector3(ctr.x, bb.max.y - hgt * 0.075, ctr.z);
    const r = renderer!;
    r.setSize(192, 192, false);
    const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 20);
    cam.position.set(hp.x + 0.45, hp.y + 0.05, hp.z + 1.6);
    cam.lookAt(hp.x, hp.y - 0.12, hp.z);
    headlight.position.copy(cam.position).add(new THREE.Vector3(0, 0.6, 0));
    r.render(scene, cam);
    const out = r.domElement.toDataURL('image/png');
    scene.remove(holder);
    a.dispose();
    return out;
  });
}

/** Camouflage fabric swatch (2D canvas) for a costume. */
export function costumeSwatch(primary: number | null, secondary: number | null, glow?: number): string {
  const key = `cs:${primary}:${secondary}:${glow ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 120;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const base = primary ?? 0x55603e;
  const sec = secondary ?? 0x2f3528;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, 240, 120);
  // deterministic pseudo-random camo blobs
  let seed = (base ^ sec) >>> 0 || 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tones = [sec, primary === null ? 0x6e7a52 : new THREE.Color(base).lerp(new THREE.Color(0x000000), 0.35).getHex(), new THREE.Color(base).lerp(new THREE.Color(0xffffff), 0.18).getHex()];
  for (let i = 0; i < 46; i++) {
    g.fillStyle = hex(tones[i % tones.length]!);
    g.beginPath();
    const x = rnd() * 240;
    const y = rnd() * 120;
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = 8 + rnd() * 16;
      const px = x + Math.cos(a) * rr * 1.5;
      const py = y + Math.sin(a) * rr;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }
  if (glow !== undefined) {
    g.strokeStyle = hex(glow);
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, 20 + i * 28);
      g.lineTo(240, 34 + i * 28);
      g.stroke();
    }
  }
  // fabric weave
  g.globalAlpha = 0.08;
  g.fillStyle = '#000';
  for (let y = 0; y < 120; y += 3) g.fillRect(0, y, 240, 1);
  g.globalAlpha = 1;
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** <img> that fills itself in when the thumbnail is ready. */
export function thumbImg(src: Promise<string> | string, cls = 'th'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.decoding = 'async';
  if (typeof src === 'string') img.src = src;
  else {
    img.classList.add('loading');
    void src.then((u) => {
      img.src = u;
      img.classList.remove('loading');
    });
  }
  return img;
}

/** Synchronous cached lookup (HUD redraws). */
export function cachedThumb(key: string): string | undefined {
  return cache.get(key);
}
