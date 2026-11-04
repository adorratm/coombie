import * as THREE from 'three';

type NoiseOpts = {
  size?: number;
  base: [number, number, number];
  variance?: number;
  grain?: number;
  speckles?: number;
  speckleColor?: [number, number, number];
  stripes?: boolean;
  stripeColor?: [number, number, number];
};

const textureCache = new Map<string, THREE.CanvasTexture>();

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function makeNoiseTexture(key: string, opts: NoiseOpts): THREE.CanvasTexture {
  const cached = textureCache.get(key);
  if (cached) return cached;

  const size = opts.size ?? 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable');
  }

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const [br, bg, bb] = opts.base;
  const variance = opts.variance ?? 18;
  const grain = opts.grain ?? 1;
  const speckles = opts.speckles ?? 0;
  const [sr, sg, sb] = opts.speckleColor ?? [40, 20, 12];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n1 = hash(x * 0.37 + y * 1.91) * variance * grain;
      const n2 = hash(x * 1.13 + y * 0.47 + 9) * variance * 0.55;
      let r = br + n1 - variance * 0.5 + n2 * 0.3;
      let g = bg + n1 * 0.9 - variance * 0.45;
      let b = bb + n1 * 0.75 - variance * 0.4;

      if (opts.stripes && Math.floor(y / 10) % 2 === 0) {
        const [tr, tg, tb] = opts.stripeColor ?? [210, 160, 40];
        r = r * 0.35 + tr * 0.65;
        g = g * 0.35 + tg * 0.65;
        b = b * 0.35 + tb * 0.65;
      }

      if (speckles > 0 && hash(x * 3.1 + y * 7.7 + 3) > 1 - speckles) {
        r = sr;
        g = sg;
        b = sb;
      }

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  textureCache.set(key, tex);
  return tex;
}

export function asphaltMap(repeat = 8): THREE.CanvasTexture {
  const tex = makeNoiseTexture('asphalt', {
    size: 512,
    base: [22, 24, 28],
    variance: 28,
    grain: 1.4,
    speckles: 0.06,
    speckleColor: [12, 13, 16],
  });
  tex.repeat.set(repeat, repeat);
  return tex;
}

export function concreteMap(repeat = 4): THREE.CanvasTexture {
  const tex = makeNoiseTexture('concrete', {
    size: 256,
    base: [52, 56, 62],
    variance: 20,
    speckles: 0.04,
    speckleColor: [32, 36, 40],
  });
  tex.repeat.set(repeat, repeat);
  return tex;
}

export function dirtMap(repeat = 6): THREE.CanvasTexture {
  const tex = makeNoiseTexture('dirt', {
    base: [62, 48, 34],
    variance: 24,
    speckles: 0.04,
    speckleColor: [40, 28, 18],
  });
  tex.repeat.set(repeat, repeat);
  return tex;
}

export function metalMap(): THREE.CanvasTexture {
  return makeNoiseTexture('metal', {
    size: 128,
    base: [72, 78, 84],
    variance: 14,
    speckles: 0.06,
    speckleColor: [110, 118, 126],
  });
}

export function rustMap(): THREE.CanvasTexture {
  return makeNoiseTexture('rust', {
    size: 128,
    base: [96, 58, 36],
    variance: 28,
    speckles: 0.08,
    speckleColor: [48, 28, 16],
  });
}

export function fabricMap(base: [number, number, number]): THREE.CanvasTexture {
  return makeNoiseTexture(`fabric-${base.join(',')}`, {
    size: 64,
    base,
    variance: 10,
    grain: 0.8,
  });
}

export function fleshMap(base: [number, number, number]): THREE.CanvasTexture {
  return makeNoiseTexture(`flesh-${base.join(',')}`, {
    size: 64,
    base,
    variance: 14,
    speckles: 0.05,
    speckleColor: [90, 40, 40],
  });
}

export function hazardMap(): THREE.CanvasTexture {
  return makeNoiseTexture('hazard', {
    size: 128,
    base: [28, 28, 28],
    variance: 8,
    stripes: true,
    stripeColor: [220, 150, 20],
  });
}

export function bloodMap(): THREE.CanvasTexture {
  return makeNoiseTexture('blood', {
    size: 64,
    base: [90, 12, 14],
    variance: 30,
    speckles: 0.12,
    speckleColor: [40, 4, 6],
  });
}

export function stdMat(
  map: THREE.Texture | null,
  color: number,
  opts: {
    metalness?: number;
    roughness?: number;
    emissive?: number;
    emissiveIntensity?: number;
    flat?: boolean;
  } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: map ?? undefined,
    color,
    metalness: opts.metalness ?? 0.15,
    roughness: opts.roughness ?? 0.72,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: opts.flat ?? false,
  });
}

export function disposeMaterialTextures(): void {
  for (const tex of textureCache.values()) {
    tex.dispose();
  }
  textureCache.clear();
}
