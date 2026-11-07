#!/usr/bin/env python3
"""
Fetch CC0 Poly Haven models (1k glTF) and pack each into a compact GLB:
  - textures resized to <=512 px (JPEG q82), ARM kept for occlusion/roughness/metalness
  - TANGENT / COLOR_n attributes dropped (three.js computes what it needs)
  - single binary chunk, no external files
Usage: python3 fetch-polyhaven.py <out_dir> name1 name2 ...   (needs network + Pillow)
"""
import io, json, os, struct, sys, urllib.request, concurrent.futures as cf
from PIL import Image

UA = {"User-Agent": "protocol-z-assets/1.0"}
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()

def pack(name, out_dir, max_tex=512):
    files = json.loads(get(f"https://api.polyhaven.com/files/{name}"))
    g = files["gltf"]["1k"]["gltf"]
    gltf = json.loads(get(g["url"]))
    inc = {k: get(v["url"]) for k, v in g["include"].items()}
    bins = {k: v for k, v in inc.items() if k.endswith(".bin")}
    src_bin = bins[gltf["buffers"][0]["uri"]] if gltf["buffers"][0]["uri"] in bins else list(bins.values())[0]

    out = bytearray()
    views = []
    def add_view(data, target=None):
        while len(out) % 4: out.append(0)
        off = len(out); out.extend(data)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target: v["target"] = target
        views.append(v); return len(views) - 1

    # copy only referenced accessor data (drop tangents / colors)
    new_acc, acc_map = [], {}
    def remap_acc(i):
        if i in acc_map: return acc_map[i]
        a = dict(gltf["accessors"][i]); bv = gltf["bufferViews"][a["bufferView"]]
        comp = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a["componentType"]]
        ncomp = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16}[a["type"]]
        stride = bv.get("byteStride", comp * ncomp)
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        elem = comp * ncomp
        if stride == elem:
            data = src_bin[start:start + elem * a["count"]]
        else:
            data = b"".join(src_bin[start + k * stride:start + k * stride + elem] for k in range(a["count"]))
        a["bufferView"] = add_view(data, bv.get("target")); a.pop("byteOffset", None)
        new_acc.append(a); acc_map[i] = len(new_acc) - 1; return acc_map[i]

    for m in gltf["meshes"]:
        for p in m["primitives"]:
            attrs = {k: v for k, v in p["attributes"].items() if k in ("POSITION", "NORMAL", "TEXCOORD_0")}
            p["attributes"] = {k: remap_acc(v) for k, v in attrs.items()}
            if "indices" in p: p["indices"] = remap_acc(p["indices"])
            p.pop("targets", None)

    # images → resized JPEG in buffer views
    imgs = []
    for im in gltf.get("images", []):
        raw = inc.get(im["uri"]) or inc.get(im["uri"].replace("%20", " "))
        pil = Image.open(io.BytesIO(raw)); pil.load()
        if max(pil.size) > max_tex: pil = pil.resize((max_tex, max_tex) if pil.size[0] == pil.size[1] else (max_tex, int(max_tex * pil.size[1] / pil.size[0])), Image.LANCZOS)
        if pil.mode not in ("RGB", "L"): pil = pil.convert("RGB")
        buf = io.BytesIO(); pil.save(buf, "JPEG", quality=82, optimize=True)
        imgs.append({"bufferView": add_view(buf.getvalue()), "mimeType": "image/jpeg", "name": im.get("name", "")})
    gltf["images"] = imgs
    gltf["accessors"] = new_acc
    gltf["bufferViews"] = views
    while len(out) % 4: out.append(0)
    gltf["buffers"] = [{"byteLength": len(out)}]
    gltf.pop("extensionsUsed", None) if not gltf.get("extensionsUsed") else None
    gltf.setdefault("asset", {})["copyright"] = "Poly Haven (CC0) — polyhaven.com/a/" + name
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
    glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(out), 0x004E4942) + bytes(out)
    path = os.path.join(out_dir, f"{name}.glb")
    open(path, "wb").write(glb)
    return name, len(glb)

if __name__ == "__main__":
    out_dir, names = sys.argv[1], sys.argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    with cf.ThreadPoolExecutor(6) as ex:
        futs = {ex.submit(pack, n, out_dir): n for n in names}
        for f in cf.as_completed(futs):
            try:
                n, sz = f.result(); print(f"ok   {n:32s} {sz/1e6:.2f} MB", flush=True)
            except Exception as e:
                print(f"FAIL {futs[f]}: {e}", flush=True)
