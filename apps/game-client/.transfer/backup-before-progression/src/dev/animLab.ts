/**
 * Dev-only animation inspector: http://localhost:5173/anim-lab.html
 *   ?op=ghost        operative id from roster
 *   &mode=runF       idle | walkF | runF | runB | runL | runR | fire | reload | hit | ability
 *   &steps=40        advance N fixed 1/60 steps then freeze (deterministic screenshots)
 *   &grid=1          show all 8 operatives side by side
 */
import { SEG, type SegId } from '../zombieAnim';
import * as THREE from 'three';
import { createVrmAvatar, type VrmAvatarHandle } from '../avatars';
import { OPERATIVE_ROSTER } from '../roster';
import { zombieModelUrl, ZOMBIE_LOOKS } from '../zombieLook';
import type { ZombieKind } from '../zombieKinds';
import type { OperativeAnimInput } from '../animLibrary';

const qs = new URLSearchParams(location.search);
const MODES = ['idle', 'walkF', 'runF', 'runB', 'runL', 'runR', 'fire', 'reload', 'hit', 'ability'] as const;
type Mode = (typeof MODES)[number];
let mode: Mode = (MODES as readonly string[]).includes(qs.get('mode') ?? '') ? (qs.get('mode') as Mode) : 'runF';
const fixedSteps = qs.has('steps') ? Number(qs.get('steps')) : -1;
const grid = qs.get('grid') === '1';
const zombiesMode = qs.get('zombies') === '1';
const ZKINDS = (Object.keys(ZOMBIE_LOOKS) as ZombieKind[]).filter((k) => !qs.get('only') || qs.get('only')!.split(',').includes(k)).filter((k) => k !== 'hooker');
let opId = qs.get('op') ?? 'ironclad';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101412);
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x202018, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 4);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x1b211d }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
scene.add(new THREE.GridHelper(40, 40, 0x2c3a31, 0x1a221d));

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
const view = qs.get('view') ?? 'side';
function placeCamera(): void {
  const span = grid || (zombiesMode && ZKINDS.length > 2) ? 9 : zombiesMode ? 0.4 : 1;
  if (view === 'top') camera.position.set(0, 9 + span, 6 + span * 0.6);
  else if (view === 'front') camera.position.set(0, 1.6, 6 + span);
  else camera.position.set(4.5 + span * 0.5, 2.2, 4.5 + span * 0.5);
  camera.lookAt(0, 1.05, 0);
}
placeCamera();

interface Actor {
  handle: VrmAvatarHandle;
  zkind?: ZombieKind;
  phase: number;
  serial: { shot: number; hit: number; ability: number };
  reloading: boolean;
  t: number;
}
let actors: Actor[] = [];
const segParam = new URLSearchParams(location.search).get('seg');

function inputFor(a: Actor, dt: number): OperativeAnimInput {
  a.t += dt;
  const sp = mode === 'walkF' ? 1.6 : 6.2;
  let vx = 0;
  let vz = 0;
  if (mode === 'walkF' || mode === 'runF') vz = sp;
  if (mode === 'runB') vz = -sp;
  if (mode === 'runL') vx = sp;
  if (mode === 'runR') vx = -sp;
  if (mode === 'fire' && Math.floor(a.t / 0.12) !== Math.floor((a.t - dt) / 0.12)) a.serial.shot++;
  if (mode === 'hit' && Math.floor(a.t / 1.2) !== Math.floor((a.t - dt) / 1.2)) a.serial.hit++;
  if (mode === 'ability' && Math.floor(a.t / 2.0) !== Math.floor((a.t - dt) / 2.0)) a.serial.ability++;
  a.reloading = mode === 'reload' ? a.t % 3.2 < 2.4 : false;
  return {
    localVelX: vx,
    localVelZ: vz,
    shotSerial: a.serial.shot,
    hitSerial: a.serial.hit,
    abilitySerial: a.serial.ability,
    reloading: a.reloading,
    reloadTime: 2.4,
    alive: true,
  };
}

async function spawn(): Promise<void> {
  for (const a of actors) a.handle.dispose();
  actors = [];
  const heights: Record<ZombieKind, number> = { grunt: 1.9, runner: 1.75, tank: 2.35, acid: 2.05, screamer: 2.2, boss: 2.85, crawler: 1.9, bloater: 2.1, stalker: 1.8, burner: 1.9, riot: 2.0, hive: 2.1, volt: 1.9, hooker: 2.75 };
  const made: Array<{ h: VrmAvatarHandle; zkind?: ZombieKind }> = zombiesMode
    ? await Promise.all(
        ZKINDS.map(async (k) => ({
          zkind: k,
          h: await createVrmAvatar({ url: zombieModelUrl(k), accentColor: 0xffffff, style: 'zombie', zombieKind: k, targetHeight: heights[k], showRing: false }),
        })),
      )
    : await Promise.all(
        (grid ? OPERATIVE_ROSTER : OPERATIVE_ROSTER.filter((o) => o.id === opId)).map(async (d) => ({
          h: await createVrmAvatar({ url: d.avatarUrl, accentColor: d.accent, gender: d.gender, style: 'operative', showRing: false }),
        })),
      );
  const spacing = zombiesMode ? 2.1 : 1.6;
  made.forEach(({ h, zkind }, i) => {
    h.root.position.x = made.length > 1 ? (i - (made.length - 1) / 2) * spacing : 0;
    scene.add(h.root);
    actors.push({ handle: h, zkind, phase: i * 0.7, serial: { shot: 0, hit: 0, ability: 0 }, reloading: false, t: 0 });
  });
  (window as unknown as { __labReady: boolean }).__labReady = true;
  (window as unknown as { __labAnimated: boolean }).__labAnimated = made.every(({ h }) => zombiesMode || !!h.animator);
}

function step(dt: number): void {
  for (const a of actors) {
    if (a.zkind && a.handle.zombieAnim) {
      const za = a.handle.zombieAnim;
      if (a.t === 0 && segParam) {
        if (segParam === 'death') za.die();
        else if (segParam === 'spawn') za.standUp(2.1);
        else if (segParam in SEG) za.play(SEG[segParam as SegId], 1.1, 2);
      }
      a.t += dt;
      const sp = mode === 'walkF' ? 1.2 : mode === 'runF' ? 4.2 : 0;
      a.handle.update(dt, sp > 0, false, 0, 0, false, 0, undefined, { speed: sp, kind: a.zkind });
      continue;
    }
    if (a.zkind) {
      a.t += dt;
      const attacking = mode === 'fire' || mode === 'hit';
      a.phase += dt * (a.zkind === 'runner' ? 9 : a.zkind === 'boss' || a.zkind === 'tank' ? 3.5 : 5);
      const atk = attacking ? (a.t % 1.4) / 1.4 : 0;
      const skill = a.zkind === 'acid' ? 'spit' : a.zkind === 'boss' || a.zkind === 'tank' ? 'slam' : a.zkind === 'screamer' ? 'shriek' : 'claw';
      a.handle.update(dt, mode !== 'idle', false, a.phase, a.phase * 0.35, false, 0, undefined, { kind: a.zkind, attackAnim: atk, skill });
      continue;
    }
    a.handle.update(dt, true, true, 0, 0, a.reloading, 0, { grip: 'rifle', anim: inputFor(a, dt) });
  }
}

// UI
const ui = document.getElementById('ui')!;
const sel = document.createElement('select');
for (const o of OPERATIVE_ROSTER) sel.add(new Option(`${o.name} (${o.gender === 'male' ? 'E' : 'K'})`, o.id, false, o.id === opId));
sel.onchange = () => {
  opId = sel.value;
  void spawn();
};
ui.appendChild(sel);
const btns: HTMLButtonElement[] = [];
for (const m of MODES) {
  const b = document.createElement('button');
  b.textContent = m;
  b.className = m === mode ? 'on' : '';
  b.onclick = () => {
    mode = m;
    btns.forEach((x) => (x.className = x.textContent === m ? 'on' : ''));
  };
  btns.push(b);
  ui.appendChild(b);
}

await spawn();
if (fixedSteps >= 0) {
  for (let i = 0; i < fixedSteps; i++) step(1 / 60);
  renderer.render(scene, camera);
  (window as unknown as { __labFrozen: boolean }).__labFrozen = true;
} else {
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    step(Math.min(0.05, clock.getDelta()));
    renderer.render(scene, camera);
  });
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
