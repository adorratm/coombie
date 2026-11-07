#!/usr/bin/env python3
"""
Fetch CC0 ground / wall PBR sets (Poly Haven 1k JPG; ambientCG for snow) → WebP:
  <name>_c.webp (colour, 1024), <name>_n.webp (normal GL, 512), <name>_r.webp (roughness, 512)
Usage: python3 fetch-textures.py <out_dir> name1 name2 ...   (prefix acg: for ambientCG ids)
"""
import io, json, os, sys, zipfile, urllib.request, concurrent.futures as cf
from PIL import Image
UA = {"User-Agent": "protocol-z-assets/1.0"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=180).read()

def save(img, path, size, q):
    img = Image.open(io.BytesIO(img)) if isinstance(img, bytes) else img
    img = img.convert("RGB") if img.mode not in ("RGB", "L") else img
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, "WEBP", quality=q, method=6)

def one(name, out):
    if name.startswith("acg:"):
        aid = name[4:]
        z = zipfile.ZipFile(io.BytesIO(get(f"https://ambientcg.com/get?file={aid}_1K-JPG.zip")))
        pick = lambda key: next(z.read(n) for n in z.namelist() if n.endswith(f"_{key}.jpg"))
        c, n, r = pick("Color"), pick("NormalGL"), pick("Roughness")
        base = aid.lower()
    else:
        f = json.loads(get(f"https://api.polyhaven.com/files/{name}"))
        c = get(f["Diffuse"]["1k"]["jpg"]["url"]); n = get(f["nor_gl"]["1k"]["jpg"]["url"])
        r = get(f["Rough"]["1k"]["jpg"]["url"]) if "Rough" in f else get(f["arm"]["1k"]["jpg"]["url"])
        base = name
    save(c, os.path.join(out, f"{base}_c.webp"), 1024, 80)
    save(n, os.path.join(out, f"{base}_n.webp"), 512, 85)
    save(r, os.path.join(out, f"{base}_r.webp"), 512, 78)
    return base

if __name__ == "__main__":
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    with cf.ThreadPoolExecutor(6) as ex:
        futs = {ex.submit(one, n, out): n for n in sys.argv[2:]}
        for f in cf.as_completed(futs):
            try: print("ok  ", f.result(), flush=True)
            except Exception as e: print("FAIL", futs[f], e, flush=True)
