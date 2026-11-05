#!/usr/bin/env node
// node scripts/rocketbox/build-all.mjs <Microsoft-Rocketbox checkout> [only-id ...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [rbRoot, ...only] = process.argv.slice(2);
if (!rbRoot) { console.error('usage: build-all.mjs <Microsoft-Rocketbox dir> [ids...]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'roster.json'), 'utf8'));
const out = path.resolve(here, '../../public/avatars/rb');
const jobs = [
  ...Object.entries(cfg.operatives).map(([id, src]) => [`op_${id}`, src, cfg.settings.operative]),
  ...Object.entries(cfg.zombies).map(([id, src]) => [`zombie_${id}`, src, cfg.settings.zombie]),
];
for (const [id, src, s] of jobs) {
  if (only.length && !only.some((o) => id.includes(o))) continue;
  execFileSync('node', [path.join(here, 'convert-rocketbox.mjs'), path.join(rbRoot, 'Assets/Avatars', src), path.join(out, `${id}.glb`),
    '--tris', String(s.tris), '--atlas', String(s.atlas), '--quality', String(s.quality),
    ...Object.entries(cfg.morph?.[id] ?? {}).flatMap(([k, v]) => [`--${k}`, String(v)])], { stdio: 'inherit' });
}
