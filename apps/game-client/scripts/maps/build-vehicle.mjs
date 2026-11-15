#!/usr/bin/env node
/**
 * Pack a Sketchfab-style glTF vehicle into a compact GLB for the game: wheels split into
 * per-hub nodes named wheel_<axle>_<L|R> (centred so they can spin), meshes decimated with
 * meshoptimizer, textures resized to WebP, positions quantized.
 *   node scripts/maps/build-vehicle.mjs scene.gltf out.glb [ratio=0.2]
 * Needs @gltf-transform/{core,functions,extensions}, meshoptimizer and sharp on NODE_PATH.
 * WHEEL lists the source mesh-node names that hold the (merged) wheels.
 */
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, flatten, join, simplify, weld, dedup, prune, textureCompress, quantize, getBounds, dequantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [src, out, ratioArg] = process.argv.slice(2);
const RATIO = Number(ratioArg ?? 0.2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
await doc.transform(flatten());
// specular extension → drop (saves textures)
for (const ext of root.listExtensionsUsed()) if (/specular|ior/.test(ext.extensionName)) ext.dispose();
const scene = root.listScenes()[0];
// apply world transforms into geometry for every mesh node (flatten keeps node TRS)
const { clearNodeTransform } = await import('@gltf-transform/functions');
for (const n of root.listNodes()) if (n.getMesh()) clearNodeTransform(n);

// ── split merged wheels into 6 per-wheel nodes
const WHEEL = new Set(['Object_125', 'Object_126']);
const wheelNodes = root.listNodes().filter((n) => WHEEL.has(n.getName()));
// collect triangle centroids to find axle z's
const zs = [];
for (const n of wheelNodes) for (const p of n.getMesh().listPrimitives()) {
  const pos = p.getAttribute('POSITION'); const idx = p.getIndices();
  for (let t = 0; t < idx.getCount(); t += 3) { let z = 0; for (let k = 0; k < 3; k++) z += pos.getElement(idx.getScalar(t + k), [])[2]; zs.push(z / 3); }
}
let cz = [Math.min(...zs), 0, Math.max(...zs)];
cz[1] = (cz[0] + cz[2]) / 2;
for (let it = 0; it < 20; it++) { const s = [0, 0, 0], c = [0, 0, 0]; for (const z of zs) { let b = 0; for (let k = 1; k < 3; k++) if (Math.abs(z - cz[k]) < Math.abs(z - cz[b])) b = k; s[b] += z; c[b]++; } cz = s.map((v, i) => v / c[i]); }
console.log('axles', cz);
const groups = new Map(); // key -> {node, prims:[]}
for (const n of wheelNodes) for (const p of n.getMesh().listPrimitives()) {
  const pos = p.getAttribute('POSITION'); const idx = p.getIndices();
  const buckets = new Map();
  for (let t = 0; t < idx.getCount(); t += 3) {
    const a = [0, 0, 0];
    for (let k = 0; k < 3; k++) { const v = pos.getElement(idx.getScalar(t + k), []); a[0] += v[0]; a[2] += v[2]; }
    let b = 0; for (let k = 1; k < 3; k++) if (Math.abs(a[2] / 3 - cz[k]) < Math.abs(a[2] / 3 - cz[b])) b = k;
    const key = `${b}_${a[0] > 0 ? 'R' : 'L'}`;
    if (!buckets.has(key)) buckets.set(key, []);
    const L = buckets.get(key); for (let k = 0; k < 3; k++) L.push(idx.getScalar(t + k));
  }
  for (const [key, list] of buckets) {
    const np = p.clone();
    const ia = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(root.listBuffers()[0]);
    np.setIndices(ia);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(np);
  }
  n.getMesh().dispose(); n.dispose();
}
for (const [key, prims] of groups) {
  const mesh = doc.createMesh('wheel_' + key);
  for (const p of prims) mesh.addPrimitive(p);
  const node = doc.createNode('wheel_' + key).setMesh(mesh);
  scene.addChild(node);
}
await doc.transform(prune(), weld(), dedup());
// re-centre each wheel around its hub so it can spin
for (const n of root.listNodes()) {
  if (!n.getName().startsWith('wheel_')) { if (n.getMesh()) n.setName(''); continue; }
  const b = getBounds(n); const c = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
  for (const p of n.getMesh().listPrimitives()) for (const sem of ['POSITION']) {
    const a = p.getAttribute(sem); const arr = a.getArray().slice();
    for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) arr[i + k] -= c[k];
    a.setArray(arr);
  }
  n.setTranslation(c);
}
// re-parent every node directly under scene
await doc.transform(join({ keepNamed: true }), prune(), weld(), prune(), dedup());
await MeshoptSimplifier.ready;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const pos = p.getAttribute('POSITION').getArray(); const idx = Uint32Array.from(p.getIndices().getArray());
  const tris = idx.length / 3; if (tris < 400) continue;
  const target = Math.max(120, Math.floor(tris * RATIO)) * 3;
  let [r] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.02, []);
  if (r.length > target * 1.6) {
    // seam-split mesh: simplify on a position-welded shadow index
    const map = new Map(); const shadow = new Uint32Array(pos.length / 3);
    for (let i = 0; i < shadow.length; i++) { const k = `${pos[i*3].toFixed(4)},${pos[i*3+1].toFixed(4)},${pos[i*3+2].toFixed(4)}`; let v = map.get(k); if (v === undefined) { v = i; map.set(k, i); } shadow[i] = v; }
    const sidx = idx.map((i) => shadow[i]);
    const [r2] = MeshoptSimplifier.simplify(sidx, pos, 3, target, 0.02, []);
    r = r2.length < r.length ? r2 : r;
  }
  if (r.length > target * 1.6) { const [r3] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, 0.06); if (r3.length >= 36) r = r3; }
    p.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(r)).setBuffer(root.listBuffers()[0]));
}
await doc.transform(prune());
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) compactPrimitive(p);
await doc.transform(prune());
// textures
for (const t of root.listTextures()) {
  const name = t.getURI() || t.getName();
  const size = /Light|Number|Radiator/.test(name) ? 512 : /metallicRoughness/.test(name) ? 512 : 1024;
  t.setExtras({ size });
}
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [1024, 1024] }));
for (const t of root.listTextures()) { const s = t.getExtras().size; if (s < 1024) { const img = await sharp(Buffer.from(t.getImage())).resize(s, s, { fit: 'fill' }).webp({ quality: 80 }).toBuffer(); t.setImage(new Uint8Array(img)); } }
await doc.transform(quantize());
let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
console.log('nodes', root.listNodes().map((n) => n.getName() || '·').join(' '), 'tris', tris, 'mats', root.listMaterials().length);
await io.write(out, doc);
