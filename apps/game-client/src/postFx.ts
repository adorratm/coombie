/**
 * Post-processing stack for the arena (high / medium quality tiers):
 *   scene (HDR, MSAA) → bloom (half res) → tone map + sRGB → cinematic grade
 * The grade pass adds contrast / saturation, a soft vignette, a hint of lens
 * chromatic aberration at the edges and fine film grain. Muzzle flashes, explosions,
 * emissive eyes, lava, neon and bulbs now glow instead of clipping flat.
 *
 * Low tiers (and any device where the composer fails to build) render directly.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * HDR guard before bloom. A light right on a surface (muzzle flash, blast) can push a
 * pixel past the half-float range → Inf; bloom smears it over most of the screen and
 * tone mapping turns Inf/Inf into NaN = a black flash over the whole view. Drop NaN,
 * cap the rest at a bright-but-finite value.
 */
export const SANITIZE_MAX = 48;
const SanitizeShader = {
  name: 'CoombieSanitize',
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = mix(c, vec3(0.0), vec3(isnan(c)));
      gl_FragColor = vec4(clamp(c, 0.0, ${SANITIZE_MAX.toFixed(1)}), 1.0);
    }
  `,
};

const GradeShader = {
  name: 'CoombieGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.38 },
    uGrain: { value: 0.028 },
    uSat: { value: 1.1 },
    uContrast: { value: 1.07 },
    uCA: { value: 1.2 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uSat, uContrast, uCA;
    uniform vec2 uRes;
    uniform vec3 uTint;
    uniform float uFlash;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      // chromatic aberration grows toward the edges only
      vec2 ca = d * r2 * uCA * 0.012;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + ca).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - ca).b;
      // grade: contrast around mid grey, saturation, per-map tint
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat) * uTint;
      // impact flash: lift toward white, strongest in the centre
      c = mix(c, vec3(1.0, 0.97, 0.9), uFlash * (1.0 - r2 * 1.4));
      // vignette (smooth, never pitch black)
      c *= 1.0 - uVignette * smoothstep(0.12, 0.62, r2 * 1.6);
      // film grain (luma-weighted so blacks stay clean)
      float g = hash(vUv * uRes + fract(uTime * 7.31) * 113.0) - 0.5;
      c += g * uGrain * (0.35 + l);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export interface PostFx {
  /** draw a frame (composer when enabled, else straight to screen) */
  render: (dt: number) => void;
  setSize: (w: number, h: number) => void;
  /** quality tier 0 high … 3 very low */
  setTier: (q: number) => void;
  /** per-map look: bloom strength and colour tint */
  setLook: (o: { bloom?: number; threshold?: number; tint?: number; vignette?: number }) => void;
  /** brief white impact flash (0..1), fades by itself */
  flash: (amount: number) => void;
  readonly enabled: boolean;
  dispose: () => void;
}

export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, coarse: boolean): PostFx {
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let grade: ShaderPass | null = null;
  let enabled = false;
  let tier = 1;
  let t = 0;
  let flashAmt = 0;
  let baseBloom = 0.6;
  const look = { threshold: 0.9, tint: 0xffffff, vignette: 0.38 };
  const size = new THREE.Vector2();

  const build = () => {
    if (composer) return;
    try {
      renderer.getDrawingBufferSize(size);
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        // composer targets lose the canvas MSAA; phones are tile GPUs (cheap MSAA) but huge DPR
        samples: coarse ? 2 : 4,
      });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new ShaderPass(SanitizeShader));
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), baseBloom, 0.42, 0.82);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      grade = new ShaderPass(GradeShader);
      composer.addPass(grade);
      bloom.threshold = look.threshold;
      (grade.uniforms.uTint!.value as THREE.Color).setHex(look.tint);
      grade.uniforms.uVignette!.value = look.vignette;
    } catch (err) {
      console.warn('[postFx] composer unavailable — direct render', err);
      composer = null;
      enabled = false;
    }
  };

  const apply = () => {
    const want = tier <= 1;
    if (want) build();
    enabled = want && composer !== null;
    if (bloom) bloom.strength = tier === 0 ? baseBloom : baseBloom * 0.85;
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      const s = renderer.getSize(new THREE.Vector2());
      composer.setSize(s.x, s.y);
      if (bloom) bloom.resolution.set(s.x / 2, s.y / 2);
    }
  };

  return {
    get enabled() {
      return enabled;
    },
    render: (dt) => {
      t += dt;
      if (!enabled || !composer) {
        renderer.render(scene, camera);
        return;
      }
      flashAmt = Math.max(0, flashAmt - dt * 3.2);
      if (grade) {
        grade.uniforms.uFlash!.value = flashAmt * 0.45;
        grade.uniforms.uTime!.value = t;
        renderer.getDrawingBufferSize(size);
        (grade.uniforms.uRes!.value as THREE.Vector2).copy(size);
      }
      composer.render(dt);
    },
    setSize: (w, h) => {
      if (!composer) return;
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    flash: (a) => {
      flashAmt = Math.max(flashAmt, Math.min(1, a));
    },
    setTier: (q) => {
      tier = q;
      apply();
    },
    setLook: (o) => {
      if (o.bloom !== undefined) baseBloom = o.bloom;
      if (o.threshold !== undefined) look.threshold = o.threshold;
      if (o.tint !== undefined) look.tint = o.tint;
      if (o.vignette !== undefined) look.vignette = o.vignette;
      if (bloom) {
        bloom.strength = tier === 0 ? baseBloom : baseBloom * 0.85;
        bloom.threshold = look.threshold;
      }
      if (grade) {
        (grade.uniforms.uTint!.value as THREE.Color).setHex(look.tint);
        grade.uniforms.uVignette!.value = look.vignette;
      }
    },
    dispose: () => {
      composer?.dispose();
      bloom?.dispose();
      composer = null;
    },
  };
}
