#!/usr/bin/env python3
"""Compose a color + normal texture atlas for convert-rocketbox.mjs.

Input: job.json {atlas, quality, out, regions:[{color, normal, x, y, w, h, fill}]}
Output (stdout JSON): {color: path.webp, normal: path.webp|null, hasAlpha: bool}
Each region is resized to (w-2p, h-2p) and edge-extended by p pixels to avoid mip bleeding.
"""
import json, os, sys
from PIL import Image

PAD = 4

def load(path, mode, fill):
    if path and os.path.exists(path):
        im = Image.open(path)
        im.load()
        return im.convert(mode)
    return Image.new(mode, (64, 64), fill)

def paste_padded(atlas, im, x, y, w, h):
    iw, ih = max(1, w - PAD * 2), max(1, h - PAD * 2)
    im = im.resize((iw, ih), Image.LANCZOS)
    atlas.paste(im, (x + PAD, y + PAD))
    # edge extend
    atlas.paste(im.crop((0, 0, iw, 1)).resize((iw, PAD)), (x + PAD, y))
    atlas.paste(im.crop((0, ih - 1, iw, ih)).resize((iw, PAD)), (x + PAD, y + PAD + ih))
    col_l = atlas.crop((x + PAD, y, x + PAD + 1, y + h)).resize((PAD, h))
    col_r = atlas.crop((x + PAD + iw - 1, y, x + PAD + iw, y + h)).resize((PAD, h))
    atlas.paste(col_l, (x, y))
    atlas.paste(col_r, (x + PAD + iw, y))

def main():
    job = json.load(open(sys.argv[1]))
    A, q, out = job['atlas'], job['quality'], job['out']
    color = Image.new('RGBA', (A, A), (128, 128, 128, 255))
    normal = Image.new('RGB', (A, A), (128, 128, 255))
    has_alpha = False
    has_normal = False
    for r in job['regions']:
        c = load(r['color'], 'RGBA', r.get('fill', '#808080'))
        if c.getextrema()[3][0] < 200:
            has_alpha = True
        paste_padded(color, c, r['x'], r['y'], r['w'], r['h'])
        if r.get('normal') and os.path.exists(r['normal']):
            has_normal = True
            paste_padded(normal, load(r['normal'], 'RGB', (128, 128, 255)), r['x'], r['y'], r['w'], r['h'])
    cpath = os.path.join(out, 'color.webp')
    if has_alpha:
        color.save(cpath, 'WEBP', quality=q, method=6)
    else:
        color.convert('RGB').save(cpath, 'WEBP', quality=q, method=6)
    npath = None
    if has_normal:
        npath = os.path.join(out, 'normal.webp')
        nq = max(60, q - 10)
        normal.resize((A // 2, A // 2), Image.LANCZOS).save(npath, 'WEBP', quality=nq, method=6)
    print(json.dumps({'color': cpath, 'normal': npath, 'hasAlpha': has_alpha}))

main()
