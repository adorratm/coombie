#!/usr/bin/env node
/**
 * Microsoft Rocketbox (MIT) FBX avatar → game-ready GLB.
 *
 *   node scripts/rocketbox/convert-rocketbox.mjs <avatar-folder> <out.glb> [--tris 9000] [--atlas 2048]
 *
 * <avatar-folder> is a Rocketbox avatar dir containing Export/<Name>.fbx and Textures/*.tga.
 *
 * What it does
 *  1. Parses the FBX (3ds Max Biped rig, A-pose bind).
 *  2. Faces the model +Z, computes a *virtual* T-pose and stores, per humanoid bone,
 *     the T-pose world rotation → runtime `HumanoidRig` maps VRM-normalized rotations
 *     (Mixamo clips + procedural zombie poses) onto the raw Biped bones.
 *  3. Welds + simplifies each material group with meshoptimizer (attribute-aware).
 *  4. Packs every material's color + normal texture into ONE atlas (scripts/rocketbox/atlas.py)
 *     → one material, one draw call per character.
 *  5. Writes a compact GLB (WebP textures via EXT_texture_webp, uint8 joints).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { FBXLoader } from '../vendor/FBXLoader.patched.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- args
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const [srcDir, outFile] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!srcDir || !outFile) {
  console.error('usage: convert-rocketbox.mjs <avatar-folder> <out.glb> [--tris 9000] [--atlas 2048] [--quality 82]');
  process.exit(1);
}
const TARGET_TRIS = Number(opt('tris', 9000));
const ATLAS = Number(opt('atlas', 2048));
const QUALITY = Number(opt('quality', 82));
const NAME = path.basename(srcDir.replace(/\/$/, ''));

// ---------------------------------------------------------------- humanoid map (Biped → VRM)
const BIPED = {
  Bip01_Pelvis: 'hips',
  Bip01_Spine: 'spine',
  Bip01_Spine1: 'chest',
  Bip01_Spine2: 'upperChest',
  Bip01_Neck: 'neck',
  Bip01_Head: 'head',
};
for (const [s, side] of [
  ['L', 'left'],
  ['R', 'right'],
]) {
  Object.assign(BIPED, {
    [`Bip01_${s}_Clavicle`]: `${side}Shoulder`,
    [`Bip01_${s}_UpperArm`]: `${side}UpperArm`,
    [`Bip01_${s}_Forearm`]: `${side}LowerArm`,
    [`Bip01_${s}_Hand`]: `${side}Hand`,
    [`Bip01_${s}_Thigh`]: `${side}UpperLeg`,
    [`Bip01_${s}_Calf`]: `${side}LowerLeg`,
    [`Bip01_${s}_Foot`]: `${side}Foot`,
    [`Bip01_${s}_Toe0`]: `${side}Toes`,
    [`Bip01_${s}_Finger0`]: `${side}ThumbMetacarpal`,
    [`Bip01_${s}_Finger01`]: `${side}ThumbProximal`,
    [`Bip01_${s}_Finger02`]: `${side}ThumbDistal`,
  });
  ['Index', 'Middle', 'Ring', 'Little'].forEach((f, i) => {
    BIPED[`Bip01_${s}_Finger${i + 1}`] = `${side}${f}Proximal`;
    BIPED[`Bip01_${s}_Finger${i + 1}1`] = `${side}${f}Intermediate`;
    BIPED[`Bip01_${s}_Finger${i + 1}2`] = `${side}${f}Distal`;
  });
}

// ---------------------------------------------------------------- load FBX (textures recorded, not decoded)
const fbxPath = path.join(srcDir, 'Export', `${NAME}.fbx`);
const mgr = new THREE.LoadingManager();
mgr.addHandler(/./, {
  setPath() { return this; },
  setCrossOrigin() { return this; },
  load(url) {
    const t = new THREE.Texture();
    t.userData.src = path.basename(url.replace(/\\/g, '/'));
    return t;
  },
});
const buf = fs.readFileSync(fbxPath);
const origWarn = console.warn;
console.warn = (...a) => { if (!String(a[0]).includes('more than 4 skinning weights')) origWarn(...a); };
const fbx = new FBXLoader(mgr).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
console.warn = origWarn;
fbx.updateMatrixWorld(true);

const skinned = [];
fbx.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
if (!skinned.length) throw new Error('no skinned mesh');
// Prefer the highest LOD mesh if several exist; we simplify ourselves.
skinned.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
const mesh = skinned[0];
const skeleton = mesh.skeleton;
const bones = skeleton.bones;
const byName = new Map(bones.map((b) => [b.name, b]));
const boneSet = new Set(bones);
const topBone = bones.find((b) => !boneSet.has(b.parent));

// ---------------------------------------------------------------- optional body morph (--bust 1.3)
// Biped has no breast bones, so volume is sculpted into the bind mesh: the two most
// forward chest points in the bust band become apexes and nearby torso vertices are
// pushed forward with a smooth falloff. Arm-weighted vertices are left alone.
const BUST = Number(opt('bust', 1));
if (BUST !== 1) {
  const bw = (n) => byName.get(n)?.getWorldPosition(new THREE.Vector3());
  const front = bw('Bip01_L_UpperArm').x > bw('Bip01_R_UpperArm').x ? 1 : -1;
  const sp2 = bw('Bip01_Spine2'), neck = bw('Bip01_Neck');
  const y0 = sp2.y - 10, y1 = neck.y - 8;
  // work in bind (world, Y-up) space — Rocketbox meshes are Z-up locally
  const geoPos = mesh.geometry.attributes.position;
  const toW = mesh.bindMatrix, toL = mesh.bindMatrix.clone().invert();
  const wv = new THREE.Vector3();
  const wpos = new Float32Array(geoPos.count * 3);
  for (let v = 0; v < geoPos.count; v++) { wv.fromBufferAttribute(geoPos, v).applyMatrix4(toW); wpos.set([wv.x, wv.y, wv.z], v * 3); }
  const pos = {
    count: geoPos.count,
    getX: (v) => wpos[v * 3], getY: (v) => wpos[v * 3 + 1], getZ: (v) => wpos[v * 3 + 2],
    setX: (v, a) => { wpos[v * 3] = a; }, setY: (v, a) => { wpos[v * 3 + 1] = a; }, setZ: (v, a) => { wpos[v * 3 + 2] = a; },
  };
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const armBones = new Set(bones.map((b, i) => (/UpperArm|Forearm|Clavicle|Hand|Finger/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const armW = (v) => { let w = 0; for (let k = 0; k < 4; k++) if (armBones.has(si.getComponent(v, k))) w += sw.getComponent(v, k); return w; };
  const apex = [null, null];
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v) * front;
    if (y < y0 || y > y1 || Math.abs(x) < 3 || Math.abs(x) > 17 || armW(v) > 0.2) continue;
    const side = (x > 0) === (front > 0) ? 0 : 1;
    if (!apex[side] || z > apex[side].z) apex[side] = { x, y, z };
  }
  if (apex[0] && apex[1]) {
    const R = 12, k = BUST - 1;
    let moved = 0;
    for (let v = 0; v < pos.count; v++) {
      if (armW(v) > 0.35) continue;
      const x = pos.getX(v), y = pos.getY(v), zf = pos.getZ(v) * front;
      for (const a of apex) {
        const r = Math.hypot(x - a.x, (y - a.y) * 0.9);
        if (r >= R || zf < a.z - 10) continue;
        const w = (1 - (r / R) ** 2) ** 2 * THREE.MathUtils.clamp((zf - (a.z - 10)) / 6, 0, 1);
        pos.setZ(v, pos.getZ(v) + front * k * 9 * w);
        pos.setY(v, y - k * 1.6 * w);
        pos.setX(v, x + Math.sign(a.x) * k * 1.4 * w);
        moved++;
        break;
      }
    }
    for (let v = 0; v < geoPos.count; v++) { wv.fromArray(wpos, v * 3).applyMatrix4(toL); geoPos.setXYZ(v, wv.x, wv.y, wv.z); }
    geoPos.needsUpdate = true;
    console.log(`  bust morph ×${BUST}: ${moved} verts, apex y≈${apex[0].y.toFixed(1)}`);
  } else console.warn('  bust morph: chest apex not found, skipped');
}

// ---------------------------------------------------------------- facing (+Z, left = +X)
const wp = (n) => byName.get(n).getWorldPosition(new THREE.Vector3());
const faceFix = new THREE.Quaternion();
if (wp('Bip01_L_UpperArm').x < wp('Bip01_R_UpperArm').x) faceFix.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
// wrapper so everything below is in the corrected model frame
const wrapper = new THREE.Group();
wrapper.name = 'rb_root';
wrapper.quaternion.copy(faceFix);
const fbxRootInv = new THREE.Matrix4().copy(fbx.matrixWorld).invert();
const topLocal = new THREE.Matrix4().multiplyMatrices(fbxRootInv, topBone.matrixWorld);
const bindTop = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
topLocal.decompose(bindTop.p, bindTop.q, bindTop.s);

// Save bind locals so the GLB is written in the original (A-pose) bind.
const bindLocal = new Map(bones.map((b) => [b, { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }]));

// Re-host the skeleton under the wrapper for T-pose computation.
const tposeRoot = new THREE.Group();
tposeRoot.add(wrapper);
const savedParent = topBone.parent;
wrapper.add(topBone);
topBone.position.copy(bindTop.p);
topBone.quaternion.copy(bindTop.q);
topBone.scale.copy(bindTop.s);
tposeRoot.updateMatrixWorld(true);

// ---------------------------------------------------------------- virtual T-pose
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pw = new THREE.Quaternion();
function aim(boneName, childName, dir) {
  const bone = byName.get(boneName);
  const child = byName.get(childName);
  if (!bone || !child) return;
  tposeRoot.updateMatrixWorld(true);
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize();
  if (cur.lengthSq() < 1e-8) return;
  const delta = _q.setFromUnitVectors(cur, dir.clone().normalize());
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const newWorld = delta.multiply(world);
  bone.parent.getWorldQuaternion(_pw);
  bone.quaternion.copy(_pw.invert().multiply(newWorld));
  tposeRoot.updateMatrixWorld(true);
}
const X = new THREE.Vector3(1, 0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
for (const [s, sign] of [
  ['L', 1],
  ['R', -1],
]) {
  const out = X.clone().multiplyScalar(sign);
  aim(`Bip01_${s}_UpperArm`, `Bip01_${s}_Forearm`, out);
  aim(`Bip01_${s}_Forearm`, `Bip01_${s}_Hand`, out);
  aim(`Bip01_${s}_Hand`, `Bip01_${s}_Finger2`, out);
  for (let f = 1; f <= 4; f++) {
    aim(`Bip01_${s}_Finger${f}`, `Bip01_${s}_Finger${f}1`, out);
    aim(`Bip01_${s}_Finger${f}1`, `Bip01_${s}_Finger${f}2`, out);
  }
  aim(`Bip01_${s}_Thigh`, `Bip01_${s}_Calf`, DOWN);
  aim(`Bip01_${s}_Calf`, `Bip01_${s}_Foot`, DOWN);
}
tposeRoot.updateMatrixWorld(true);

const humanoid = {};
for (const [raw, vrmName] of Object.entries(BIPED)) {
  const b = byName.get(raw);
  if (!b) continue;
  const wq = b.getWorldQuaternion(new THREE.Quaternion());
  humanoid[vrmName] = { node: raw, wq: wq.toArray().map((v) => +v.toFixed(6)) };
}
const hipsY = byName.get('Bip01_Pelvis').getWorldPosition(new THREE.Vector3()).y;
const tposeBox = new THREE.Box3();
// feet height reference: toes / foot min y in T-pose
mesh.geometry.computeBoundingBox();
const footY = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.bindMatrix).min.y; // ground under the feet (computed before bake)
void tposeBox;

// restore bind pose
for (const [b, t] of bindLocal) {
  if (b === topBone) continue;
  b.position.copy(t.p);
  b.quaternion.copy(t.q);
  b.scale.copy(t.s);
}
topBone.position.copy(bindTop.p);
topBone.quaternion.copy(bindTop.q);
topBone.scale.copy(bindTop.s);
tposeRoot.updateMatrixWorld(true);
void savedParent;

// ---------------------------------------------------------------- bake bind transform (Rocketbox meshes are Z-up locally)
// After this, mesh space == model space (Y-up, cm), so shaders can use bind position for height.
const bindOrig = mesh.bindMatrix.clone();
mesh.geometry.applyMatrix4(bindOrig);
console.log(`  faceFix=${faceFix.toArray().map((v) => v.toFixed(2)).join(',')}`);

// ---------------------------------------------------------------- geometry per material: weld + simplify
await MeshoptSimplifier.ready;
const g = mesh.geometry;
const P = g.attributes.position.array;
const N = g.attributes.normal.array;
const UV = g.attributes.uv.array;
const SI = g.attributes.skinIndex.array;
const SW = g.attributes.skinWeight.array;
const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
const totalTris = (g.index ? g.index.count : g.attributes.position.count) / 3;
const ratio = Math.min(1, TARGET_TRIS / totalTris);

const parts = []; // { matIndex, pos, nor, uv, si, sw, idx }
const byMat = new Map();
for (const gr of groups) {
  if (!byMat.has(gr.materialIndex)) byMat.set(gr.materialIndex, []);
  byMat.get(gr.materialIndex).push(gr);
}
for (const [mi, grs] of byMat) {
  const map = new Map();
  const pos = [], nor = [], uv = [], si = [], sw = [], idx = [];
  for (const gr of grs) {
    for (let k = gr.start; k < gr.start + gr.count; k++) {
      const v = g.index ? g.index.array[k] : k;
      const w = [SW[v * 4], SW[v * 4 + 1], SW[v * 4 + 2], SW[v * 4 + 3]];
      const ws = w[0] + w[1] + w[2] + w[3] || 1;
      const key = [
        P[v * 3].toFixed(4), P[v * 3 + 1].toFixed(4), P[v * 3 + 2].toFixed(4),
        N[v * 3].toFixed(2), N[v * 3 + 1].toFixed(2), N[v * 3 + 2].toFixed(2),
        UV[v * 2].toFixed(4), UV[v * 2 + 1].toFixed(4),
      ].join(',');
      let id = map.get(key);
      if (id === undefined) {
        id = pos.length / 3;
        map.set(key, id);
        pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        uv.push(UV[v * 2], UV[v * 2 + 1]);
        si.push(SI[v * 4], SI[v * 4 + 1], SI[v * 4 + 2], SI[v * 4 + 3]);
        sw.push(w[0] / ws, w[1] / ws, w[2] / ws, w[3] / ws);
      }
      idx.push(id);
    }
  }
  let indices = new Uint32Array(idx);
  if (ratio < 0.999 && indices.length > 300) {
    const attrs = new Float32Array((pos.length / 3) * 5);
    for (let i = 0; i < pos.length / 3; i++) {
      attrs.set([nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], uv[i * 2], uv[i * 2 + 1]], i * 5);
    }
    const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
    const [out] = MeshoptSimplifier.simplifyWithAttributes(
      indices, new Float32Array(pos), 3, attrs, 5, [0.4, 0.4, 0.4, 1.5, 1.5], null, target, 0.03, [],
    );
    indices = out;
  }
  // compact
  const remap = new Int32Array(pos.length / 3).fill(-1);
  const cp = [], cn = [], cu = [], cs = [], cw = [], ci = [];
  for (const v of indices) {
    if (remap[v] < 0) {
      remap[v] = cp.length / 3;
      cp.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      cn.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
      cu.push(uv[v * 2], uv[v * 2 + 1]);
      cs.push(si[v * 4], si[v * 4 + 1], si[v * 4 + 2], si[v * 4 + 3]);
      cw.push(sw[v * 4], sw[v * 4 + 1], sw[v * 4 + 2], sw[v * 4 + 3]);
    }
    ci.push(remap[v]);
  }
  parts.push({ matIndex: mi, mat: mats[mi], pos: cp, nor: cn, uv: cu, si: cs, sw: cw, idx: ci });
}

// ---------------------------------------------------------------- atlas
const texDir = path.join(srcDir, 'Textures');
const findTex = (name) => {
  if (!name) return null;
  const direct = path.join(texDir, name);
  if (fs.existsSync(direct)) return direct;
  const lower = fs.readdirSync(texDir).find((f) => f.toLowerCase() === name.toLowerCase());
  return lower ? path.join(texDir, lower) : null;
};
const tgaSize = (file) => {
  const h = Buffer.alloc(18);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, h, 0, 18, 0);
  fs.closeSync(fd);
  return { w: h.readUInt16LE(12), h: h.readUInt16LE(14) };
};
const regions = parts.map((p) => {
  const color = findTex(p.mat.map?.userData.src);
  const normal = findTex(p.mat.normalMap?.userData.src);
  const size = color ? tgaSize(color) : { w: 64, h: 64 };
  const tris = p.idx.length / 3;
  return { color, normal, w: size.w, h: size.h, tris, colorHex: '#' + (p.mat.color?.getHexString?.() ?? 'ffffff') };
});
// Scale so everything fits ~90% of the atlas; tiny parts never go below 64px.
const area = regions.reduce((s, r) => s + r.w * r.h, 0);
let scale = Math.min(1, Math.sqrt((ATLAS * ATLAS * 0.88) / area));
function pack(sc) {
  const rs = regions.map((r, i) => ({ i, w: Math.max(64, Math.floor(r.w * sc)), h: Math.max(64, Math.floor(r.h * sc)) }));
  rs.sort((a, b) => b.h - a.h);
  let x = 0, y = 0, rowH = 0;
  for (const r of rs) {
    if (x + r.w > ATLAS) { x = 0; y += rowH; rowH = 0; }
    if (r.w > ATLAS || y + r.h > ATLAS) return null;
    r.x = x; r.y = y; x += r.w; rowH = Math.max(rowH, r.h);
  }
  return rs;
}
let placed = null;
while (!(placed = pack(scale))) scale *= 0.94;
for (const r of placed) Object.assign(regions[r.i], { x: r.x, y: r.y, pw: r.w, ph: r.h });

fs.mkdirSync(path.dirname(outFile), { recursive: true });
const tmp = fs.mkdtempSync(path.join(path.dirname(outFile), '.rbtmp-'));
const job = { atlas: ATLAS, quality: QUALITY, out: tmp, regions: regions.map((r) => ({ color: r.color, normal: r.normal, x: r.x, y: r.y, w: r.pw, h: r.ph, fill: r.colorHex })) };
fs.writeFileSync(path.join(tmp, 'job.json'), JSON.stringify(job));
const atlasInfo = JSON.parse(execFileSync('python3', ['-I', path.join(here, 'atlas.py'), path.join(tmp, 'job.json')]).toString());

// ---------------------------------------------------------------- merge parts with atlas UVs (glTF UV: top-left origin)
const pad = 4;
const M = { pos: [], nor: [], uv: [], si: [], sw: [], idx: [] };
parts.forEach((p, pi) => {
  const r = regions[pi];
  const base = M.pos.length / 3;
  const ix = r.x + pad, iy = r.y + pad, iw = r.pw - pad * 2, ih = r.ph - pad * 2;
  for (let i = 0; i < p.uv.length; i += 2) {
    const u = THREE.MathUtils.clamp(p.uv[i], 0, 1);
    const v = THREE.MathUtils.clamp(p.uv[i + 1], 0, 1);
    M.uv.push((ix + u * iw) / ATLAS, (iy + (1 - v) * ih) / ATLAS);
  }
  M.pos.push(...p.pos);
  M.nor.push(...p.nor);
  M.si.push(...p.si);
  M.sw.push(...p.sw);
  for (const k of p.idx) M.idx.push(base + k);
});

// ---------------------------------------------------------------- GLB writer
const chunks = [];
let byteLen = 0;
const gltf = {
  asset: { version: '2.0', generator: 'protocol-z convert-rocketbox' },
  extensionsUsed: ['EXT_texture_webp'],
  scene: 0,
  scenes: [],
  nodes: [],
  meshes: [],
  skins: [],
  materials: [],
  textures: [],
  images: [],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  accessors: [],
  bufferViews: [],
  buffers: [],
};
function addView(data, target) {
  const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const padLen = (4 - (byteLen % 4)) % 4;
  if (padLen) { chunks.push(Buffer.alloc(padLen)); byteLen += padLen; }
  const view = { buffer: 0, byteOffset: byteLen, byteLength: b.length };
  if (target) view.target = target;
  chunks.push(b);
  byteLen += b.length;
  gltf.bufferViews.push(view);
  return gltf.bufferViews.length - 1;
}
function addAccessor(data, type, componentType, { target, normalized, minmax } = {}) {
  const view = addView(data, target);
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
  const acc = { bufferView: view, componentType, count: data.length / comps, type };
  if (normalized) acc.normalized = true;
  if (minmax) {
    const mn = new Array(comps).fill(Infinity), mx = new Array(comps).fill(-Infinity);
    for (let i = 0; i < data.length; i++) { const c = i % comps; mn[c] = Math.min(mn[c], data[i]); mx[c] = Math.max(mx[c], data[i]); }
    acc.min = mn; acc.max = mx;
  }
  gltf.accessors.push(acc);
  return gltf.accessors.length - 1;
}

// nodes: 0 = rb_root, then bones, then mesh
const boneIndex = new Map();
const nodeOf = (o, isTop) => {
  const t = isTop ? bindTop : bindLocal.get(o);
  const n = { name: o.name };
  const p = t.p.toArray(), q = t.q.toArray(), s = t.s.toArray();
  if (p.some((v) => Math.abs(v) > 1e-7)) n.translation = p;
  if (Math.abs(q[3] - 1) > 1e-7) n.rotation = q;
  if (s.some((v) => Math.abs(v - 1) > 1e-6)) n.scale = s;
  return n;
};
gltf.nodes.push({ name: 'rb_root', rotation: faceFix.toArray(), children: [] });
function addBone(b, isTop) {
  const n = nodeOf(b, isTop);
  gltf.nodes.push(n);
  const id = gltf.nodes.length - 1;
  boneIndex.set(b, id);
  const kids = b.children.filter((c) => boneSet.has(c));
  if (kids.length) n.children = kids.map((k) => addBone(k, false));
  return id;
}
gltf.nodes[0].children.push(addBone(topBone, true));

const imgView = (file) => addView(new Uint8Array(fs.readFileSync(file)));
gltf.images.push({ bufferView: imgView(atlasInfo.color), mimeType: 'image/webp', name: `${NAME}_color` });
gltf.textures.push({ sampler: 0, extensions: { EXT_texture_webp: { source: 0 } } });
const mat = {
  name: `${NAME}_atlas`,
  pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.78 },
  doubleSided: !!atlasInfo.hasAlpha,
};
if (atlasInfo.hasAlpha) { mat.alphaMode = 'MASK'; mat.alphaCutoff = 0.5; }
if (atlasInfo.normal) {
  gltf.images.push({ bufferView: imgView(atlasInfo.normal), mimeType: 'image/webp', name: `${NAME}_normal` });
  gltf.textures.push({ sampler: 0, extensions: { EXT_texture_webp: { source: 1 } } });
  mat.normalTexture = { index: 1, scale: 0.8 };
}
gltf.materials.push(mat);

const vcount = M.pos.length / 3;
const attributes = {
  POSITION: addAccessor(new Float32Array(M.pos), 'VEC3', 5126, { target: 34962, minmax: true }),
  NORMAL: addAccessor(new Float32Array(M.nor), 'VEC3', 5126, { target: 34962 }),
  TEXCOORD_0: addAccessor(new Float32Array(M.uv), 'VEC2', 5126, { target: 34962 }),
  JOINTS_0: addAccessor(new Uint8Array(M.si), 'VEC4', 5121, { target: 34962 }),
  WEIGHTS_0: addAccessor(new Float32Array(M.sw), 'VEC4', 5126, { target: 34962 }),
};
const indices = addAccessor(vcount > 65535 ? new Uint32Array(M.idx) : new Uint16Array(M.idx), 'SCALAR', vcount > 65535 ? 5125 : 5123, { target: 34963 });
gltf.meshes.push({ name: NAME, primitives: [{ attributes, indices, material: 0 }] });

// inverse bind = boneInverse * bindMatrix (three.js convention, same as GLTFExporter)
const ibm = new Float32Array(bones.length * 16);
const m4 = new THREE.Matrix4();
bones.forEach((b, i) => {
  // vertices were pre-multiplied by the bind matrix above → IBM is the plain bone inverse
  m4.copy(skeleton.boneInverses[i]);
  ibm.set(m4.elements, i * 16);
});
gltf.skins.push({ joints: bones.map((b) => boneIndex.get(b)), inverseBindMatrices: addAccessor(ibm, 'MAT4', 5126), skeleton: boneIndex.get(topBone) });
gltf.nodes.push({ name: `${NAME}_mesh`, mesh: 0, skin: 0 });
gltf.nodes[0].children.push(gltf.nodes.length - 1);

gltf.scenes.push({
  name: NAME,
  nodes: [0],
  extras: {
    protocolZ: {
      rig: 'rocketbox-biped',
      source: 'Microsoft Rocketbox Avatar Library (MIT) — github.com/microsoft/Microsoft-Rocketbox',
      // world rotations (model frame, facing +Z) of each raw bone in the virtual T-pose
      humanoid,
      hipsHeight: +(hipsY - footY).toFixed(4),
      footY: +footY.toFixed(4),
      tris: M.idx.length / 3,
    },
  },
});

const bin = Buffer.concat(chunks);
const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4);
gltf.buffers.push({ byteLength: bin.length + binPad.length });
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
const total = 12 + 8 + json.length + 8 + bin.length + binPad.length;
header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.concat([header, jh, json, bh, bin, binPad]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${NAME}: ${totalTris} → ${M.idx.length / 3} tris, ${vcount} verts, atlas ${ATLAS} (scale ${scale.toFixed(2)}), alpha=${!!atlasInfo.hasAlpha}, ${(total / 1024).toFixed(0)} KB → ${outFile}`);
