/**
 * Weapon finishes (cosmetic only): bought once with credits, then picked per weapon in
 * the armory. Applied by swapping the gun's materials for tinted / re-textured copies
 * (cached per skin + source material), so the shared templates stay untouched.
 */
import * as THREE from 'three';

export type SkinId = 'standart' | 'altin' | 'kamuflaj' | 'karbon' | 'neon' | 'kan' | 'kutup' | 'hayalet';

export interface SkinDef {
  id: SkinId;
  name: string;
  cost: number;
  /** swatch colour for the armory button */
  swatch: string;
}

export const WEAPON_SKINS: Record<SkinId, SkinDef> = {
  standart: { id: 'standart', name: 'Standart', cost: 0, swatch: '#3a3f45' },
  kamuflaj: { id: 'kamuflaj', name: 'Kamuflaj', cost: 600, swatch: 'linear-gradient(135deg,#4a5a32 0 30%,#2a3020 30% 55%,#6a6a44 55%)' },
  karbon: { id: 'karbon', name: 'Karbon', cost: 900, swatch: 'repeating-linear-gradient(45deg,#111 0 4px,#2a2a2a 4px 8px)' },
  kutup: { id: 'kutup', name: 'Kutup', cost: 900, swatch: '#e6eef2' },
  kan: { id: 'kan', name: 'Kan Kırmızısı', cost: 1200, swatch: '#8a1010' },
  neon: { id: 'neon', name: 'Neon', cost: 1800, swatch: 'linear-gradient(135deg,#0ff,#a0f)' },
  altin: { id: 'altin', name: 'Altın', cost: 3000, swatch: 'linear-gradient(135deg,#f6d36a,#a8781a)' },
  hayalet: { id: 'hayalet', name: 'Hayalet', cost: 4000, swatch: 'linear-gradient(135deg,rgba(180,160,255,.6),rgba(120,220,255,.6))' },
};
export const SKIN_ORDER = Object.keys(WEAPON_SKINS) as SkinId[];

let camoTex: THREE.Texture | null = null;
function camo(): THREE.Texture | null {
  if (camoTex) return camoTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#5a6638';
  g.fillRect(0, 0, 256, 256);
  const cols = ['#3a4424', '#7a7448', '#2a2a1c', '#6a7a40'];
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = cols[i % cols.length]!;
    g.beginPath();
    const x = r() * 256;
    const y = r() * 256;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rr = 10 + r() * 22;
      g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr);
    }
    g.fill();
  }
  camoTex = new THREE.CanvasTexture(c);
  camoTex.wrapS = camoTex.wrapT = THREE.RepeatWrapping;
  camoTex.repeat.set(3, 3);
  camoTex.colorSpace = THREE.SRGBColorSpace;
  return camoTex;
}

const cache = new Map<string, THREE.Material>();
let uid = 0;
const idOf = new WeakMap<THREE.Material, number>();

function skinned(src: THREE.Material, skin: SkinId): THREE.Material {
  let id = idOf.get(src);
  if (id === undefined) idOf.set(src, (id = ++uid));
  const key = `${skin}:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = (src as THREE.MeshStandardMaterial).clone();
  m.userData.skinOf = src;
  switch (skin) {
    case 'altin':
      m.color.setHex(0xe8b440);
      m.metalness = 1;
      m.roughness = 0.22;
      break;
    case 'kamuflaj':
      m.map = camo();
      m.color.setHex(0xffffff);
      m.metalness = 0.15;
      m.roughness = 0.75;
      break;
    case 'karbon':
      m.color.setHex(0x26282b);
      m.metalness = 0.35;
      m.roughness = 0.18;
      break;
    case 'neon':
      m.color.setHex(0x20242c);
      m.emissive = new THREE.Color(0x30e0ff);
      m.emissiveMap = m.map;
      m.emissiveIntensity = 0.9;
      break;
    case 'kan':
      m.color.setHex(0xa01818);
      m.metalness = 0.55;
      m.roughness = 0.35;
      break;
    case 'kutup':
      m.color.setHex(0xf2f6fa);
      m.metalness = 0.2;
      m.roughness = 0.6;
      break;
    case 'hayalet':
      m.color.setHex(0xb8a8ff);
      m.transparent = true;
      m.opacity = 0.55;
      m.emissive = new THREE.Color(0x7a5aff);
      m.emissiveIntensity = 0.6;
      m.depthWrite = false;
      break;
    default:
      break;
  }
  m.needsUpdate = true;
  cache.set(key, m);
  return m;
}

/** Re-skin a mounted gun (attachments and glow strips keep their own look). */
export function applyWeaponSkin(gun: THREE.Object3D, skin: SkinId | string | undefined): void {
  const s = (skin && skin in WEAPON_SKINS ? skin : 'standart') as SkinId;
  gun.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let p: THREE.Object3D | null = mesh; p && p !== gun; p = p.parent) if (p.name === 'gearAttachments') return;
    const swap = (mat: THREE.Material): THREE.Material => {
      const base = (mat.userData.skinOf as THREE.Material | undefined) ?? mat;
      if (!(base as THREE.MeshStandardMaterial).isMeshStandardMaterial || base.name === 'glow') return mat;
      return s === 'standart' ? base : skinned(base, s);
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
