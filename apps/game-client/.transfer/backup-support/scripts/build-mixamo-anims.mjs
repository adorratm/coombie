#!/usr/bin/env node
/**
 * Mixamo FBX → VRM-normalized humanoid animation library (JSON).
 *
 * Usage (from apps/game-client):
 *   node scripts/build-mixamo-anims.mjs assets-src/mixamo/operator public/anims/operator.anim.json
 *
 * - Every FBX in the input folder becomes one clip. The clip id comes from
 *   CLIP_IDS below (file name → id); unknown files fall back to a slug.
 * - Rotations are converted into VRM *normalized* humanoid space (identity
 *   T-pose rest), so the same file drives every VRM / humanoid character.
 * - Only the hips get a position track (in Mixamo units; the runtime scales it
 *   by the target's hips height). Horizontal root motion is removed so
 *   locomotion stays in place — the game moves the character.
 * - Keys are quantized to keep the file small.
 *
 * Retarget math follows the official three-vrm `loadMixamoAnimation` example.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from './vendor/FBXLoader.patched.js';

const CLIP_IDS = {
  'rifle aiming idle': 'idle',
  walking: 'walk',
  'rifle run': 'run',
  'walking backwards': 'walkBack',
  'run backwards': 'runBack',
  'strafe left': 'strafeLeft',
  'strafe right': 'strafeRight',
  // Mixamo "Strafe" variants are the running strafes (measured from root drift: +X = left)
  strafe: 'runStrafeRight',
  'strafe (2)': 'runStrafeLeft',
  'firing rifle': 'fire',
  reloading: 'reload',
  'hit reaction': 'hit',
  'toss grenade': 'ability',
  'rifle jump': 'jump',
  'turn left': 'turnLeft',
  'turning right 45 degrees': 'turnRight',
  // Zombie set (drop these FBX files into assets-src/mixamo/zombie)
  'zombie idle': 'idle',
  'zombie walk': 'walk',
  'zombie running': 'run',
  'zombie attack': 'attack',
  'zombie scream': 'scream',
  'zombie dying': 'death',
  'zombie punching': 'slam',
  dying: 'death',
};

/** Clips the game plays once (no loop, no root strip of vertical motion). */
const ONE_SHOT = new Set(['fire', 'reload', 'hit', 'ability', 'jump', 'turnLeft', 'turnRight', 'attack', 'scream', 'death', 'slam',
  'deathA', 'deathB', 'deathC', 'death2', 'bite', 'neckBite', 'punch', 'headbutt', 'kick', 'hit2', 'stumble', 'standUp', 'mSwipe', 'mJump', 'mRoar', 'mDeath',
  'castThrow', 'castMelee', 'castShove', 'castRoll', 'kneelDown', 'kneelUp', 'impactBig', 'knockdown', 'deathD', 'deathE', 'castKick', 'castShout']);

const MIXAMO_TO_VRM = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};

const round = (v, p) => Math.round(v * p) / p;

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function convertFile(file) {
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const asset = new FBXLoader().parse(ab, '');
  const clip = asset.animations.find((c) => c.name === 'mixamo.com') ?? asset.animations[0];
  if (!clip) throw new Error(`no animation in ${file}`);
  // some libraries re-export Mixamo clips without the "mixamorig" prefix
  if (!asset.getObjectByName('mixamorigHips') && asset.getObjectByName('Hips')) {
    asset.traverse((o) => {
      if (MIXAMO_TO_VRM[`mixamorig${o.name}`]) o.name = `mixamorig${o.name}`;
    });
    for (const t of clip.tracks) {
      const [n, p] = t.name.split('.');
      if (MIXAMO_TO_VRM[`mixamorig${n}`]) t.name = `mixamorig${n}.${p}`;
    }
  }
  asset.updateMatrixWorld(true);

  const hipsNode = asset.getObjectByName('mixamorigHips');
  if (!hipsNode) throw new Error(`no mixamorigHips in ${file} (not a Mixamo rig?)`);
  const hipsHeight = hipsNode.position.y;

  const restInv = new THREE.Quaternion();
  const parentRest = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const tracks = {};
  let hipsPos = null;

  for (const track of clip.tracks) {
    const [rigName, prop] = track.name.split('.');
    const vrmBone = MIXAMO_TO_VRM[rigName];
    if (!vrmBone) continue;
    const node = asset.getObjectByName(rigName);
    if (!node) continue;
    if (prop === 'quaternion') {
      node.getWorldQuaternion(restInv).invert();
      node.parent.getWorldQuaternion(parentRest);
      const out = new Array(track.values.length);
      let prev = null;
      for (let i = 0; i < track.values.length; i += 4) {
        q.fromArray(track.values, i).premultiply(parentRest).multiply(restInv).normalize();
        // keep hemisphere continuity so interpolation never flips
        if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        prev = prev ?? new THREE.Quaternion();
        prev.copy(q);
        out[i] = round(q.x, 1e4);
        out[i + 1] = round(q.y, 1e4);
        out[i + 2] = round(q.z, 1e4);
        out[i + 3] = round(q.w, 1e4);
      }
      tracks[vrmBone] = { t: Array.from(track.times, (t) => round(t, 1e3)), q: out };
    } else if (prop === 'position' && vrmBone === 'hips') {
      hipsPos = { t: Array.from(track.times, (t) => round(t, 1e3)), v: Array.from(track.values) };
    }
  }
  return { duration: clip.duration, hipsHeight, tracks, hipsPos };
}

function main() {
  const [inDir, outFile] = process.argv.slice(2);
  if (!inDir || !outFile) {
    console.error('usage: node scripts/build-mixamo-anims.mjs <fbx-folder> <out.json>');
    process.exit(1);
  }
  const files = fs.readdirSync(inDir).filter((f) => f.toLowerCase().endsWith('.fbx'));
  const lib = { version: 1, source: 'mixamo', space: 'vrm-normalized', clips: {} };
  for (const f of files) {
    const base = path.basename(f, path.extname(f));
    const key = base.toLowerCase().trim();
    if (/\bbot\b|character|skin/i.test(key) && !CLIP_IDS[key]) {
      console.log(`skip  ${f} (character mesh, not an animation)`);
      continue;
    }
    const id = CLIP_IDS[key] ?? (/^[A-Za-z0-9]+$/.test(base) ? base : slug(base));
    let c;
    try {
      c = convertFile(path.join(inDir, f));
    } catch (err) {
      console.warn(`fail  ${f}: ${err.message}`);
      continue;
    }
    let speed = 0;
    if (c.hipsPos) {
      const v = c.hipsPos.v;
      const n = v.length;
      // Natural travel speed in hips-heights per second (runtime scales by target hips height)
      speed = Math.hypot(v[n - 3] - v[0], v[n - 1] - v[2]) / Math.max(0.001, c.duration) / c.hipsHeight;
      const loop = !ONE_SHOT.has(id);
      // In-place: lock X/Z to the first key (removes forward drift if "In Place" was off)
      const x0 = v[0];
      const z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        if (loop) {
          v[i] = x0;
          v[i + 2] = z0;
        } else {
          // one-shots: keep small sways, kill travel
          v[i] = x0 + THREE.MathUtils.clamp(v[i] - x0, -8, 8);
          v[i + 2] = z0 + THREE.MathUtils.clamp(v[i + 2] - z0, -8, 8);
        }
      }
      c.hipsPos.v = v.map((n) => round(n / c.hipsHeight, 1e4)); // normalized to hips height
    }
    lib.clips[id] = {
      duration: round(c.duration, 1e3),
      loop: !ONE_SHOT.has(id),
      speed: round(speed, 1e3),
      tracks: c.tracks,
      hipsPos: c.hipsPos,
    };
    console.log(`ok    ${f.padEnd(32)} → ${id.padEnd(16)} ${c.duration.toFixed(2)}s  speed=${speed.toFixed(2)}  bones=${Object.keys(c.tracks).length}`);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(lib));
  console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB, ${Object.keys(lib.clips).length} clips)`);
}

main();
