#!/usr/bin/env node
/**
 * CC0 "Flat Guns" (OpenGameArt, via github.com/petroulacl/fps-asset-kit) → game weapon GLBs.
 *
 *   node scripts/weapons/convert-guns.mjs <fps-asset-kit/weapons> public/weapons
 *
 * Per model:
 *  - flattens the node tree, groups faces into 4 material classes
 *    (metal / polymer / wood / brass) and keeps the original tone as vertex colour;
 *  - creased smooth normals (35°) so edges catch light like machined parts;
 *  - box-projected UVs (1 tile ≈ 18 cm) for the shared PBR metal/wood textures;
 *  - orients the barrel to +Z (muzzle = the thin end), puts the origin on the pistol
 *    grip (where the hand holds it) and stores the muzzle point in scene extras.
 * Textures are not embedded — the game shares one PBR set across all guns.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('usage: convert-guns.mjs <weapons dir with */*/GLB/*.glb> <out dir>');
  process.exit(1);
}

const classify = (name) => {
  const n = name.replace('M_PCL_Flat_', '');
  if (/Brown|Rosewood|Bole|Chestnut/i.test(n)) return 'wood';
  if (/Brass|Yellow/i.test(n)) return 'brass';
  if (/White|Grey_Light|Lighter$|Red\.Brick|Blue/i.test(n) && !/Black/i.test(n)) return 'polymer';
  return 'metal';
};

function findGlbs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findGlbs(p));
    else if (e.name.toLowerCase().endsWith('.glb')) out.push(p);
  }
  return out;
}

function boxUV(geo, tile) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    // dominant axis of the face normal (use first vertex's creased normal)
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    for (let k = 0; k < 3; k++) {
      const v = i + k;
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      let u, w;
      if (nx >= ny && nx >= nz) [u, w] = [z, y];
      else if (ny >= nz) [u, w] = [x, z];
      else [u, w] = [x, y];
      uv[v * 2] = u / tile;
      uv[v * 2 + 1] = w / tile;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

async function convert(file) {
  const buf = fs.readFileSync(file);
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const parts = { metal: [], polymer: [], wood: [], brass: [] };
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const c = o.material.color ?? new THREE.Color(0.1, 0.1, 0.1);
    const cls = classify(o.material.name ?? '');
    // lift the near-black flat palette into a usable albedo range, keep relative tones
    const lift = (v) => (cls === 'metal' ? 0.07 + Math.sqrt(v) * 0.6 : Math.min(1, 0.1 + Math.sqrt(v) * 0.9));
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) {
      col[i] = lift(c.r);
      col[i + 1] = lift(c.g);
      col[i + 2] = lift(c.b);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts[cls].push(g);
  });

  // ---- orientation: longest axis → Z; thin end → +Z
  const all = mergeGeometries(Object.values(parts).flat().map((g) => g.clone()), false);
  all.computeBoundingBox();
  let bb = all.boundingBox;
  const size = bb.getSize(new THREE.Vector3());
  const xf = new THREE.Matrix4();
  if (size.x > size.z && size.x > size.y) xf.makeRotationY(-Math.PI / 2);
  const slabHeight = (geo, front) => {
    const p = geo.attributes.position;
    const box = new THREE.Box3().setFromBufferAttribute(p);
    const L = box.max.z - box.min.z;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (front ? z > box.max.z - L * 0.08 : z < box.min.z + L * 0.08) {
        lo = Math.min(lo, p.getY(i));
        hi = Math.max(hi, p.getY(i));
      }
    }
    return hi - lo;
  };
  const tmp = all.clone().applyMatrix4(xf);
  // thin end = muzzle; a few models need a manual override (stock thinner than barrel shroud)
  const FLIP = new Set(['Shotgun_Pump_West']);
  const flip = slabHeight(tmp, true) > slabHeight(tmp, false);
  if (flip !== FLIP.has(path.basename(file, '.glb'))) xf.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
  tmp.copy(all).applyMatrix4(xf);
  tmp.computeBoundingBox();
  bb = tmp.boundingBox;
  const L = bb.max.z - bb.min.z;
  const H = bb.max.y - bb.min.y;

  // ---- grip: low vertices in the rear section (pistols: rear 45 %, long guns: 22–52 % from the back)
  const pistol = L < 0.32;
  const z0 = bb.min.z + L * (pistol ? 0.0 : 0.22);
  const z1 = bb.min.z + L * (pistol ? 0.45 : 0.52);
  const yCut = bb.min.y + H * 0.42;
  const p = tmp.attributes.position;
  const grip = new THREE.Vector3();
  let n = 0;
  let gripMinY = Infinity;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    if (z >= z0 && z <= z1 && y <= yCut) {
      grip.x += p.getX(i);
      grip.z += z;
      gripMinY = Math.min(gripMinY, y);
      n++;
    }
  }
  if (n) grip.divideScalar(n);
  else grip.set(0, 0, bb.min.z + L * 0.35);
  // hand sits a little under the receiver: 70 % of the way from grip bottom up to the cut line
  grip.y = Number.isFinite(gripMinY) ? gripMinY + (yCut - gripMinY) * 0.72 : bb.min.y + H * 0.3;
  grip.x = 0;
  xf.premultiply(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z));

  // muzzle: front-most slab centre
  tmp.copy(all).applyMatrix4(xf);
  tmp.computeBoundingBox();
  const tb = tmp.boundingBox;
  let my = 0, mc = 0;
  const tp = tmp.attributes.position;
  for (let i = 0; i < tp.count; i++) if (tp.getZ(i) > tb.max.z - 0.012) (my += tp.getY(i)), mc++;
  const muzzle = [0, mc ? my / mc : 0, tb.max.z];

  // ---- per-class geometry: creased normals, box UVs, weld
  const prims = [];
  for (const [cls, list] of Object.entries(parts)) {
    if (!list.length) continue;
    let g = mergeGeometries(list, false).applyMatrix4(xf);
    g = toCreasedNormals(g, THREE.MathUtils.degToRad(35));
    boxUV(g, 0.18);
    g = mergeVertices(g, 1e-5);
    prims.push({ cls, g });
  }
  return { prims, muzzle, length: L, height: H, tris: prims.reduce((s, x) => s + x.g.index.count / 3, 0) };
}

function writeGlb(file, name, prims, extras) {
  const chunks = [];
  let len = 0;
  const gltf = { asset: { version: '2.0', generator: 'protocol-z convert-guns' }, scene: 0, scenes: [{ name, nodes: [0], extras }], nodes: [{ name, mesh: 0 }], meshes: [{ name, primitives: [] }], materials: [], accessors: [], bufferViews: [], buffers: [] };
  const view = (arr, target) => {
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (len % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad)), (len += pad);
    gltf.bufferViews.push({ buffer: 0, byteOffset: len, byteLength: b.length, target });
    chunks.push(b);
    len += b.length;
    return gltf.bufferViews.length - 1;
  };
  const acc = (arr, type, ct, target, mm) => {
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    const a = { bufferView: view(arr, target), componentType: ct, count: arr.length / comps, type };
    if (mm) {
      a.min = new Array(comps).fill(Infinity);
      a.max = new Array(comps).fill(-Infinity);
      for (let i = 0; i < arr.length; i++) { const c = i % comps; a.min[c] = Math.min(a.min[c], arr[i]); a.max[c] = Math.max(a.max[c], arr[i]); }
    }
    gltf.accessors.push(a);
    return gltf.accessors.length - 1;
  };
  for (const { cls, g } of prims) {
    gltf.materials.push({ name: cls, pbrMetallicRoughness: { metallicFactor: cls === 'metal' || cls === 'brass' ? 0.9 : 0, roughnessFactor: 0.5 } });
    const idx = g.index.array;
    gltf.meshes[0].primitives.push({
      attributes: {
        POSITION: acc(new Float32Array(g.attributes.position.array), 'VEC3', 5126, 34962, true),
        NORMAL: acc(new Float32Array(g.attributes.normal.array), 'VEC3', 5126, 34962),
        TEXCOORD_0: acc(new Float32Array(g.attributes.uv.array), 'VEC2', 5126, 34962),
        COLOR_0: acc(new Float32Array(g.attributes.color.array), 'VEC3', 5126, 34962),
      },
      indices: acc(g.attributes.position.count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 'SCALAR', g.attributes.position.count > 65535 ? 5125 : 5123, 34963),
      material: gltf.materials.length - 1,
    });
  }
  const bin = Buffer.concat(chunks);
  const binPad = Buffer.alloc((4 - (bin.length % 4)) % 4);
  gltf.buffers.push({ byteLength: bin.length + binPad.length });
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const h = Buffer.alloc(12);
  h.writeUInt32LE(0x46546c67, 0);
  h.writeUInt32LE(2, 4);
  h.writeUInt32LE(12 + 8 + json.length + 8 + bin.length + binPad.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([h, jh, json, bh, bin, binPad]));
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of findGlbs(srcDir)) {
  const name = path.basename(f, '.glb');
  const r = await convert(f);
  const out = path.join(outDir, `${name.toLowerCase()}.glb`);
  writeGlb(out, name, r.prims, { protocolZ: { muzzle: r.muzzle.map((v) => +v.toFixed(4)), length: +r.length.toFixed(4), source: 'CC0 Flat Guns (OpenGameArt) via fps-asset-kit' } });
  console.log(`${name.padEnd(24)} ${String(r.tris).padStart(5)} tris  L=${r.length.toFixed(2)}m  muzzle z=${r.muzzle[2].toFixed(3)}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
