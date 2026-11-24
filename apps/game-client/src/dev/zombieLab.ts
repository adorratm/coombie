/** Dev-only: named zombie types side by side with their gear. /zombie-lab.html?types=tasci,kubbe&steps=30 */
import * as THREE from 'three';
import { attachVrmToZombie } from '../avatars';
import { createZombie } from '../characters';
import { applyTypeDeco, updateTypeDeco } from '../zombieDeco';
import { ZOMBIE_TYPES } from '../zombieTypes';

const qs = new URLSearchParams(location.search);
const pick = qs.get('types')?.split(',');
const types = ZOMBIE_TYPES.filter((t) => !pick || pick.includes(t.id)).filter((t) => t.base !== 'hooker');
const cols = Number(qs.get('cols') ?? 6);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x201810, 1.4));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.position.set(3, 6, 5);
scene.add(sun);
const rows = Math.ceil(types.length / cols);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
const W = cols * 2.6;
cam.position.set(W / 2 - 1.3, 2 + rows * 1.6, 6 + rows * 3.6);
cam.lookAt(W / 2 - 1.3, 1, -(rows - 1) * 1.6);
const labels = document.getElementById('l')!;
renderer.setAnimationLoop(() => renderer.render(scene, cam));
const zs: ReturnType<typeof createZombie>[] = [];
await Promise.all(
  types.map(async (def, i) => {
    const z = createZombie(def.base);
    z.root.position.set((i % cols) * 2.6, 0, -Math.floor(i / cols) * 3.2);
    z.root.scale.multiplyScalar(Math.min(1.3, def.scaleMul));
    scene.add(z.root);
    const av = await Promise.race([attachVrmToZombie(z), new Promise<null>((r) => setTimeout(() => r(null), 15000))]).catch((e) => (console.error('attach', e), null));
    console.log('attached', def.id, !!av);
    if (av) {
      av.root.visible = true;
      z.proxy.visible = false;
    }
    applyTypeDeco(z, def);
    zs.push(z);
    const d = document.createElement('div');
    d.textContent = `${def.name} (${def.tier})`;
    const v = z.root.position.clone().setY(-0.25).project(cam);
    d.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    d.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    labels.appendChild(d);
  }),
);
let t = 0;
const steps = Number(qs.get('steps') ?? 30);
for (let i = 0; i < steps; i++) {
  t += 1 / 60;
  for (const z of zs) {
    (z as unknown as { vrm?: { update: (...a: unknown[]) => void } }).vrm?.update(1 / 60, false, false, 0, 0, false, -1, undefined, { speed: 0, kind: z.kind });
    updateTypeDeco(z, t);
  }
}
(window as unknown as { __ready: boolean }).__ready = true;
