#!/usr/bin/env python3
"""
Convert CC0 "Flat Shaded Melee Weapons" (Pichuliru, OpenGameArt) GLBs into the
format apps/game-client/src/weaponAssets.ts expects:

  - origin at the grip, business end along +Z, cutting edge down
  - palette texture baked into linear vertex colours (COLOR_0)
  - one primitive per material class, named metal / polymer / wood
  - box-projected UVs for the shared PBR texture set
  - scene.extras.protocolZ = { muzzle (tip of the weapon), length }

Usage: python3 scripts/weapons/convert-melee.py <FlatShadedMelee/GLB dir> <out dir>
Needs numpy and Pillow.
"""
import io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image

# source file -> (output name, grip position along the model's long axis, 0 = butt end, 1 = tip)
MODELS = {
    'KABAR': ('melee_knife', 0.18),
    'Baseball Bat': ('melee_bat', 0.12),
    'Fire Axe': ('melee_axe', 0.16),
    'Machete': ('melee_machete', 0.13),
}
UV_PER_METRE = 5.5
CLASSES = ['metal', 'polymer', 'wood']
PBR = {'metal': (0.9, 0.5), 'polymer': (0.0, 0.5), 'wood': (0.0, 0.5)}


def read_glb(path):
    data = path.read_bytes()
    n = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + n])
    blob = data[20 + n + 8:]

    def accessor(i):
        a = doc['accessors'][i]
        view = doc['bufferViews'][a['bufferView']]
        dtype = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.frombuffer(blob, dtype, a['count'] * width, offset).reshape(a['count'], width)

    prim = doc['meshes'][0]['primitives'][0]
    img = doc['bufferViews'][doc['images'][0]['bufferView']]
    start = img.get('byteOffset', 0)
    palette = np.array(Image.open(io.BytesIO(blob[start:start + img['byteLength']])).convert('RGB'))
    at = prim['attributes']
    return accessor(at['POSITION']), accessor(at['NORMAL']), accessor(at['TEXCOORD_0']), accessor(prim['indices']).reshape(-1, 3), palette


def classify(rgb):
    """Palette colour -> material class. Bright neutral greys are bare steel, browns are wood/leather."""
    r, g, b = (int(v) for v in rgb)
    spread = max(r, g, b) - min(r, g, b)
    if spread < 18 and max(r, g, b) >= 45:
        return 'metal'
    # browns and ochres (leather wrap, varnished haft); pure reds are paint
    if r > g > b and spread > 40 and g >= 0.4 * r:
        return 'wood'
    return 'polymer'


def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def box_uv(pos, nrm):
    axis = np.abs(nrm).argmax(1)
    u = np.where(axis == 0, pos[:, 2], pos[:, 0])
    v = np.where(axis == 1, pos[:, 2], pos[:, 1])
    return np.stack([u, v], 1).astype(np.float32) * UV_PER_METRE


def convert(src, out_dir, name, grip):
    pos, nrm, uv, tris, palette = read_glb(src)
    h, w = palette.shape[:2]
    px = palette[np.clip((uv[:, 1] * h).astype(int), 0, h - 1), np.clip((uv[:, 0] * w).astype(int), 0, w - 1)]

    # source: long axis +Y with the handle at -Y. Rotate so +Y -> +Z and the edge (+Z) points down.
    lo, hi = pos[:, 1].min(), pos[:, 1].max()
    grip_y = lo + (hi - lo) * grip
    new_pos = np.stack([pos[:, 0], -pos[:, 2], pos[:, 1] - grip_y], 1).astype(np.float32)
    new_nrm = np.stack([nrm[:, 0], -nrm[:, 2], nrm[:, 1]], 1).astype(np.float32)
    # the rotation is proper (det +1), so triangle winding is unchanged
    colour = srgb_to_linear(px.astype(np.float64)).astype(np.float32)
    # steel is drawn with the metal texture; keep its vertex colour bright so it reads as steel
    cls = np.array([CLASSES.index(classify(c)) for c in px])
    new_uv = box_uv(new_pos, new_nrm)

    buffers, views, accessors, prims = [], [], [], []

    def push(arr, target, kind, comp):
        raw = arr.tobytes()
        offset = sum(len(b) for b in buffers)
        buffers.append(raw + b'\0' * (-len(raw) % 4))
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(raw), 'target': target})
        acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': kind}
        if kind == 'VEC3' and target == 34962 and arr.dtype == np.float32 and arr is not None:
            acc['min'] = arr.min(0).tolist()
            acc['max'] = arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    materials = []
    for ci, cname in enumerate(CLASSES):
        # a triangle belongs to the class of its first vertex (flat-shaded source: all three agree)
        face = tris[cls[tris[:, 0]] == ci]
        if len(face) == 0:
            continue
        used, inverse = np.unique(face.reshape(-1), return_inverse=True)
        materials.append({'name': cname, 'pbrMetallicRoughness': {'metallicFactor': PBR[cname][0], 'roughnessFactor': PBR[cname][1]}})
        prims.append({
            'attributes': {
                'POSITION': push(new_pos[used], 34962, 'VEC3', 5126),
                'NORMAL': push(new_nrm[used], 34962, 'VEC3', 5126),
                'TEXCOORD_0': push(new_uv[used], 34962, 'VEC2', 5126),
                'COLOR_0': push(colour[used], 34962, 'VEC3', 5126),
            },
            'indices': push(inverse.astype(np.uint16), 34963, 'SCALAR', 5123),
            'material': len(materials) - 1,
        })

    tip_z = float(new_pos[:, 2].max())
    doc = {
        'asset': {'version': '2.0', 'generator': 'protocol-z convert-melee'},
        'scene': 0,
        'scenes': [{'name': name, 'nodes': [0], 'extras': {'protocolZ': {
            'muzzle': [0, 0, round(tip_z, 4)],
            'length': round(float(hi - lo), 4),
            'source': 'CC0 Flat Shaded Melee Weapons by Pichuliru (OpenGameArt)',
        }}}],
        'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': prims}],
        'materials': materials,
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': sum(len(b) for b in buffers)}],
    }
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    body = b''.join(buffers)
    out = out_dir / f'{name}.glb'
    out.write_bytes(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(body)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(body), 0x004E4942) + body)
    counts = {c: int((cls[tris[:, 0]] == i).sum()) for i, c in enumerate(CLASSES)}
    print(f'{out.name}: {len(tris)} tris {counts} length {hi - lo:.3f} m tip z {tip_z:.3f} bytes {out.stat().st_size}')


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    for source, (name, grip) in MODELS.items():
        convert(src_dir / f'{source}.glb', out_dir, name, grip)


if __name__ == '__main__':
    main()
