/**
 * Dev-only map viewer: /map-lab.html?map=lunapark&x=0&z=20&h=60&tx=0&tz=-10
 * Lit like the arena so lobby thumbnails (public/ui/maps/<id>.jpg) can be shot headless.
 */
import * as THREE from 'three';
import { buildGameMap } from '../gameMap';
import { MAPS, type MapId } from '../mapDefs';

const q = new URLSearchParams(location.search);
const id = (q.get('map') ?? 'lunapark') as MapId;
const num = (k: string, d: number) => Number(q.get(k) ?? d);
const LT = MAPS[id].lighting;
const scene = new THREE.Scene();
scene.background = new THREE.Color(LT.bg);
scene.fog = new THREE.FogExp2(LT.fog, LT.fogDensity * 0.6 * num('fog', 1));
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LT.exposure;
document.body.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(LT.ambient[0], LT.ambient[1] * 1.6));
scene.add(new THREE.HemisphereLight(LT.hemi[0], LT.hemi[1], LT.hemi[2] * 1.5));
const sun = new THREE.DirectionalLight(LT.sun[0], LT.sun[1] * 1.25);
sun.position.set(...LT.sunDir);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 300 });
scene.add(sun);
const rim = new THREE.DirectionalLight(LT.rim[0], LT.rim[1]);
rim.position.set(-25, 20, -18);
scene.add(rim);
const map = buildGameMap(scene, id, renderer);
const cam = new THREE.PerspectiveCamera(num('fov', 45), innerWidth / innerHeight, 0.5, 800);
cam.position.set(num('x', 0), num('h', 70), num('z', 70));
cam.lookAt(num('tx', 0), 0, num('tz', 0));
let t = 0;
await map.ready;
renderer.setAnimationLoop(() => {
  t += 1 / 60;
  map.update(1 / 60, t, cam.position);
  renderer.render(scene, cam);
});
(window as unknown as { __mapReady: boolean }).__mapReady = true;
