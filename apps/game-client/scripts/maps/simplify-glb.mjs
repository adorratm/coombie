#!/usr/bin/env node
/**
 * Reduce triangle counts of prop GLBs (meshoptimizer simplifier, UV-aware) so they can be
 * instanced by the hundred under a top-down camera.
 *   node scripts/maps/simplify-glb.mjs <budgetTris> file.glb [...]
 * Files are rewritten in place. Only indexed triangle primitives with POSITION/NORMAL/TEXCOORD_0.
 * Needs `meshoptimizer` resolvable from node_modules (set NODE_PATH if it lives elsewhere).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { MeshoptSimplifier } = require('meshoptimizer');

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readGlb(path) {
  const b = fs.readFileSync(path);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bl = b.readUInt32LE(20 + jl);
  const bin = b.subarray(28 + jl, 28 + jl + bl);
  return { json, bin };
}
function accessorArray(json, bin, i) {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const T = COMP[a.componentType];
  const n = NC[a.type] * a.count;
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const copy = Buffer.from(bin.subarray(off, off + n * T.BYTES_PER_ELEMENT));
  return new T(copy.buffer, copy.byteOffset, n);
}

await MeshoptSimplifier.ready;
const [budgetArg, ...files] = process.argv.slice(2);
const budget = Number(budgetArg);
for (const f of files) {
  const { json, bin } = readGlb(f);
  let total = 0;
  for (const m of json.meshes) for (const p of m.primitives) if (p.indices != null) total += json.accessors[p.indices].count / 3;
  const ratio = Math.min(1, budget / Math.max(1, total));
  const out = [];
  const views = [];
  const addView = (arr, target) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    while (out.reduce((s, x) => s + x.length, 0) % 4) out.push(Buffer.alloc(1));
    const off = out.reduce((s, x) => s + x.length, 0);
    out.push(buf);
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) });
    return views.length - 1;
  };
  const accessors = [];
  const addAcc = (arr, type, componentType, target, extra = {}) => {
    accessors.push({ bufferView: addView(arr, target), componentType, count: arr.length / NC[type], type, ...extra });
    return accessors.length - 1;
  };
  let after = 0;
  // images first (keep)
  const imgViews = (json.images ?? []).map((im) => {
    const bv = json.bufferViews[im.bufferView];
    return addView(new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), bv.byteLength));
  });
  for (const m of json.meshes) {
    for (const p of m.primitives) {
      const pos = new Float32Array(accessorArray(json, bin, p.attributes.POSITION));
      const nor = p.attributes.NORMAL != null ? new Float32Array(accessorArray(json, bin, p.attributes.NORMAL)) : null;
      const uv = p.attributes.TEXCOORD_0 != null ? new Float32Array(accessorArray(json, bin, p.attributes.TEXCOORD_0)) : null;
      let idx = p.indices != null ? Uint32Array.from(accessorArray(json, bin, p.indices)) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
      if (ratio < 1 && idx.length > 300) {
        const target = Math.max(36, Math.floor((idx.length * ratio) / 3) * 3);
        const attrs = uv ?? new Float32Array((pos.length / 3) * 2);
        const [ni] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attrs, 2, [0.6, 0.6], null, target, 0.05, ['Prune']);
        if (ni.length >= 3) idx = ni;
      }
      // compact
      const remap = new Int32Array(pos.length / 3).fill(-1);
      let nv = 0;
      for (let i = 0; i < idx.length; i++) if (remap[idx[i]] < 0) remap[idx[i]] = nv++;
      const P = new Float32Array(nv * 3), N = nor ? new Float32Array(nv * 3) : null, U = uv ? new Float32Array(nv * 2) : null;
      for (let v = 0; v < remap.length; v++) {
        const r = remap[v];
        if (r < 0) continue;
        P.set(pos.subarray(v * 3, v * 3 + 3), r * 3);
        if (N) N.set(nor.subarray(v * 3, v * 3 + 3), r * 3);
        if (U) U.set(uv.subarray(v * 2, v * 2 + 2), r * 2);
      }
      const I = nv < 65536 ? Uint16Array.from(idx, (i) => remap[i]) : Uint32Array.from(idx, (i) => remap[i]);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[i + k]); max[k] = Math.max(max[k], P[i + k]); }
      p.attributes = { POSITION: addAcc(P, 'VEC3', 5126, 34962, { min, max }) };
      if (N) p.attributes.NORMAL = addAcc(N, 'VEC3', 5126, 34962);
      if (U) p.attributes.TEXCOORD_0 = addAcc(U, 'VEC2', 5126, 34962);
      p.indices = addAcc(I, 'SCALAR', I instanceof Uint16Array ? 5123 : 5125, 34963);
      after += I.length / 3;
    }
  }
  (json.images ?? []).forEach((im, i) => (im.bufferView = imgViews[i]));
  json.accessors = accessors;
  json.bufferViews = views;
  let binOut = Buffer.concat(out);
  while (binOut.length % 4) binOut = Buffer.concat([binOut, Buffer.alloc(1)]);
  json.buffers = [{ byteLength: binOut.length }];
  let js = Buffer.from(JSON.stringify(json));
  while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binOut.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(binOut.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(f, Buffer.concat([head, c1, js, c2, binOut]));
  console.log(`${f.split('/').pop().padEnd(34)} ${Math.round(total)} → ${Math.round(after)} tris, ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
}
