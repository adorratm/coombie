/** Dev-only: all 30 weapons side by side. Red = grip origin (hand), green = muzzle. */
import * as THREE from 'three';
import { WEAPONS, attachWeaponMesh } from '../weapons';
import { ensureWeaponEnvironment, instantiateRawGun, preloadWeaponModels } from '../weaponAssets';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
ensureWeaponEnvironment(renderer);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14181a);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x222018, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(2, 4, 3);
scene.add(sun);
const raw0 = new URLSearchParams(location.search).get("raw") === "1";
const cols = raw0 ? 4 : 6;
const cam = new THREE.OrthographicCamera(-0.1, cols * 1.05, 0.6, -5 * 0.62, 0.1, 50);
cam.position.set(0, 0, 10);
const view = new URLSearchParams(location.search).get('view') ?? 'side';
await preloadWeaponModels();
const labels = document.getElementById('l')!;
const marker = (c: number) => new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: c, depthTest: false }));
const raw = new URLSearchParams(location.search).get('raw') === '1';
const FILES = ['pistol_full_west','pistol_compact_west','pistol_full_east','pistol_compact_east','smg_full_west','smg_compact_west','smg_full_east','smg_compact_east','rifle_assault_west','rifle_battle_west','rifle_assault_east','rifle_battle_east','shotgun_pump_west','shotgun_auto_west','shotgun_pump_east','shotgun_auto_east','sniper_rifle_west','sniper_material_west','sniper_rifle_east','sniper_material_east'];
const items: Array<{ name: string; build: (g: THREE.Group) => THREE.Object3D }> = raw
  ? FILES.map((f) => ({ name: f, build: (g) => { const r = instantiateRawGun(f); g.add(r.group); return r.tip; } }))
  : WEAPONS.map((w) => ({ name: w.name, build: (g) => attachWeaponMesh(g, w, 0x00ff87, 1) }));
items.forEach((w, i) => {
  const g = new THREE.Group();
  const tip = w.build(g);
  g.add(marker(0xff3030));
  const m = marker(0x30ff60);
  tip.add(m);
  const sp = g.getObjectByName('supportPoint');
  if (sp) sp.add(marker(0x3080ff));
  // barrel (+Z) points to screen right
  const holder = new THREE.Group();
  holder.add(g);
  holder.rotation.y = Math.PI / 2;
  if (view === 'top') holder.rotation.x = Math.PI / 2;
  const x = (i % cols) * 1.05 + 0.4;
  const y = -Math.floor(i / cols) * 0.62;
  holder.position.set(x, y, 0);
  scene.add(holder);
  const d = document.createElement('div');
  d.textContent = `${i + 1}. ${w.name}`;
  labels.appendChild(d);
  const place = () => {
    const v = new THREE.Vector3(x, y - 0.2, 0).project(cam);
    d.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    d.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  };
  place();
});
const aspect = innerWidth / innerHeight;
const w = cols * 1.05 + 0.1;
cam.left = -0.15;
cam.right = w;
const h = w / aspect;
cam.top = 0.35;
cam.bottom = 0.35 - h;
cam.updateProjectionMatrix();
labels.querySelectorAll('div').forEach((d, i) => {
  const x = (i % cols) * 1.05 + 0.4;
  const y = -Math.floor(i / cols) * 0.62;
  const v = new THREE.Vector3(x, y - 0.2, 0).project(cam);
  (d as HTMLElement).style.left = `${((v.x + 1) / 2) * innerWidth}px`;
  (d as HTMLElement).style.top = `${((1 - v.y) / 2) * innerHeight}px`;
});
setTimeout(() => {
  renderer.render(scene, cam);
  (window as unknown as { __gunsReady: boolean }).__gunsReady = true;
}, 800);
renderer.setAnimationLoop(() => renderer.render(scene, cam));
