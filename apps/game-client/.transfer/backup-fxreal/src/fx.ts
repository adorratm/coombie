import * as THREE from 'three';

export interface HealthBar {
  root: THREE.Group;
  fill: THREE.Mesh;
  setRatio: (ratio: number) => void;
  setVisible: (v: boolean) => void;
  dispose: () => void;
}

export function createHealthBar(opts: {
  width?: number;
  y?: number;
  fillColor?: number;
  backColor?: number;
}): HealthBar {
  const width = opts.width ?? 1.1;
  const y = opts.y ?? 2.55;
  const root = new THREE.Group();
  root.position.y = y;

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.12),
    new THREE.MeshBasicMaterial({ color: opts.backColor ?? 0x1a0a0a, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  back.position.z = 0.01;

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.09),
    new THREE.MeshBasicMaterial({ color: opts.fillColor ?? 0xef4444, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  fill.position.z = 0.02;

  const border = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.06, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
  );

  root.add(border, back, fill);
  root.renderOrder = 10;

  const setRatio = (ratio: number) => {
    const r = Math.max(0, Math.min(1, ratio));
    fill.scale.x = Math.max(0.001, r);
    fill.position.x = -((1 - r) * width) / 2;
    const mat = fill.material as THREE.MeshBasicMaterial;
    if (r > 0.55) mat.color.setHex(opts.fillColor ?? 0x22c55e);
    else if (r > 0.28) mat.color.setHex(0xf59e0b);
    else mat.color.setHex(0xef4444);
    root.visible = r < 0.999;
  };

  return {
    root,
    fill,
    setRatio,
    setVisible: (v) => {
      root.visible = v;
    },
    dispose: () => {
      back.geometry.dispose();
      fill.geometry.dispose();
      border.geometry.dispose();
      (back.material as THREE.Material).dispose();
      (fill.material as THREE.Material).dispose();
      (border.material as THREE.Material).dispose();
    },
  };
}

export function billboardHealthBars(bars: HealthBar[], camera: THREE.Camera): void {
  for (const bar of bars) {
    if (!bar.root.visible) continue;
    bar.root.quaternion.copy(camera.quaternion);
  }
}

type Particle = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
};

type Floater = {
  sprite: THREE.Sprite;
  velY: number;
  life: number;
  driftX: number;
};

type WarnRing = {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  endScale: number;
};

export type DamageNumberStyle = 'enemy' | 'crit' | 'player';

export interface CombatFx {
  spawnBloodBurst: (pos: THREE.Vector3, strength?: number, color?: number) => void;
  spawnDamageNumber: (
    pos: THREE.Vector3,
    amount: number,
    critOrOpts?: boolean | { crit?: boolean; style?: DamageNumberStyle },
  ) => void;
  spawnHitRing: (pos: THREE.Vector3, color?: number, y?: number) => void;
  /** Ground telegraph that expands to radius before a heavy attack lands. */
  spawnWarnRing: (pos: THREE.Vector3, radius: number, color?: number, duration?: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

export function createCombatFx(scene: THREE.Scene): CombatFx {
  const particles: Particle[] = [];
  const floaters: Floater[] = [];
  const rings: { mesh: THREE.Mesh; life: number }[] = [];
  const warns: WarnRing[] = [];
  const dropletGeo = new THREE.SphereGeometry(0.07, 5, 4);
  const warnRingGeo = new THREE.RingGeometry(0.82, 1, 32);
  const numberCache = new Map<string, THREE.CanvasTexture>();

  const getNumberTexture = (text: string, style: DamageNumberStyle): THREE.CanvasTexture => {
    const key = `${text}:${style}`;
    const cached = numberCache.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d unavailable');
    ctx.clearRect(0, 0, 128, 64);
    const big = style === 'crit' || style === 'player';
    ctx.font = big ? 'bold 36px sans-serif' : 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0a0a0a';
    ctx.strokeText(text, 64, 32);
    ctx.fillStyle = style === 'crit' ? '#ffef5a' : style === 'player' ? '#fb7185' : '#ffe4e4';
    ctx.fillText(text, 64, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (numberCache.size >= 64) {
      const first = numberCache.keys().next().value;
      if (first !== undefined) {
        numberCache.get(first)?.dispose();
        numberCache.delete(first);
      }
    }
    numberCache.set(key, tex);
    return tex;
  };

  const matPool = new Map<number, THREE.MeshBasicMaterial>();
  const bloodMatFor = (color: number) => {
    let m = matPool.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      matPool.set(color, m);
    }
    return m;
  };

  const spawnBloodBurst = (pos: THREE.Vector3, strength = 1, color = 0x8b1018) => {
    const count = Math.min(8, Math.floor(3 + strength * 4));
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(dropletGeo, bloodMatFor(color));
      mesh.position.copy(pos);
      mesh.position.y += 0.9 + Math.random() * 0.6;
      const baseScale = 0.6 + Math.random() * 1.2 * strength;
      mesh.userData.baseScale = baseScale;
      mesh.scale.setScalar(baseScale);
      scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6 * strength,
        2 + Math.random() * 5 * strength,
        (Math.random() - 0.5) * 6 * strength,
      );
      particles.push({ mesh, vel, life: 0.35 + Math.random() * 0.3, maxLife: 0.7, gravity: 14 });
    }
    if (particles.length > 80) {
      const old = particles.splice(0, particles.length - 80);
      for (const p of old) {
        scene.remove(p.mesh);
      }
    }
  };

  const spawnDamageNumber = (
    pos: THREE.Vector3,
    amount: number,
    critOrOpts: boolean | { crit?: boolean; style?: DamageNumberStyle } = false,
  ) => {
    if (floaters.length > 28) {
      const old = floaters.shift();
      if (old) {
        scene.remove(old.sprite);
        (old.sprite.material as THREE.Material).dispose();
      }
    }
    const opts =
      typeof critOrOpts === 'boolean' ? { crit: critOrOpts } : (critOrOpts ?? {});
    const style: DamageNumberStyle = opts.style ?? (opts.crit ? 'crit' : 'enemy');
    const rounded = Math.max(1, Math.round(amount));
    const text = style === 'crit' ? `${rounded}!` : `${rounded}`;
    const tex = getNumberTexture(text, style);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.position.y += style === 'player' ? 2.05 : 1.8 + Math.random() * 0.3;
    sprite.position.x += (Math.random() - 0.5) * 0.45;
    const big = style !== 'enemy';
    sprite.scale.set(big ? 1.65 : 1.2, big ? 0.82 : 0.6, 1);
    scene.add(sprite);
    floaters.push({
      sprite,
      velY: big ? 2.5 : 1.65,
      life: big ? 0.95 : 0.72,
      driftX: (Math.random() - 0.5) * 0.55,
    });
  };

  const ringGeo = new THREE.RingGeometry(0.2, 0.45, 16);
  const spawnHitRing = (pos: THREE.Vector3, color = 0xff4444, y = 0.08) => {
    if (rings.length > 16) {
      const old = rings.shift();
      if (old) {
        scene.remove(old.mesh);
        (old.mesh.material as THREE.Material).dispose();
      }
    }
    const mesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, y, pos.z);
    scene.add(mesh);
    rings.push({ mesh, life: 0.35 });
  };

  const spawnWarnRing = (pos: THREE.Vector3, radius: number, color = 0xef4444, duration = 0.55) => {
    if (warns.length > 10) {
      const old = warns.shift();
      if (old) {
        scene.remove(old.mesh);
        (old.mesh.material as THREE.Material).dispose();
      }
    }
    const mesh = new THREE.Mesh(
      warnRingGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.06, pos.z);
    mesh.scale.setScalar(Math.max(0.35, radius * 0.25));
    scene.add(mesh);
    warns.push({
      mesh,
      life: duration,
      maxLife: duration,
      endScale: Math.max(0.6, radius),
    });
  };

  const update = (dt: number) => {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vel.y *= -0.2;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      const fade = Math.max(0, p.life / p.maxLife);
      const base = (p.mesh.userData.baseScale as number) ?? 1;
      p.mesh.scale.setScalar(base * fade);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]!;
      f.life -= dt;
      f.sprite.position.y += f.velY * dt;
      f.sprite.position.x += f.driftX * dt;
      f.velY *= 1 - dt * 1.5;
      const mat = f.sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(0, f.life * 1.4);
      if (f.life <= 0) {
        scene.remove(f.sprite);
        mat.dispose();
        floaters.splice(i, 1);
      }
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]!;
      r.life -= dt;
      const s = 1 + (0.35 - r.life) * 6;
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, r.life / 0.35) * 0.75;
      if (r.life <= 0) {
        scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        rings.splice(i, 1);
      }
    }

    for (let i = warns.length - 1; i >= 0; i--) {
      const w = warns[i]!;
      w.life -= dt;
      const t = 1 - Math.max(0, w.life) / w.maxLife;
      const scale = THREE.MathUtils.lerp(w.endScale * 0.28, w.endScale, t * t);
      w.mesh.scale.setScalar(scale);
      const pulse = 0.35 + Math.sin(t * Math.PI * 4) * 0.12;
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - t) * 0.65 + pulse * (1 - t));
      if (w.life <= 0) {
        scene.remove(w.mesh);
        (w.mesh.material as THREE.Material).dispose();
        warns.splice(i, 1);
      }
    }
  };

  return {
    spawnBloodBurst,
    spawnDamageNumber,
    spawnHitRing,
    spawnWarnRing,
    update,
    dispose: () => {
      for (const p of particles) {
        scene.remove(p.mesh);
      }
      for (const m of matPool.values()) m.dispose();
      matPool.clear();
      for (const f of floaters) {
        scene.remove(f.sprite);
        (f.sprite.material as THREE.Material).dispose();
      }
      for (const r of rings) {
        scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
      }
      for (const w of warns) {
        scene.remove(w.mesh);
        (w.mesh.material as THREE.Material).dispose();
      }
      particles.length = 0;
      floaters.length = 0;
      rings.length = 0;
      warns.length = 0;
      for (const tex of numberCache.values()) tex.dispose();
      numberCache.clear();
      dropletGeo.dispose();
      ringGeo.dispose();
      warnRingGeo.dispose();
    },
  };
}
