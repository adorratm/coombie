/**
 * Sample-based SFX (CC0 / public domain).
 * Assets in /public/sfx — see public/sfx/CREDITS.md
 * Falls back to soft procedural tones only if a buffer fails to load.
 */

import { toZombieSfxKind, type ZombieKind, type ZombieSfxKind } from './zombieKinds';

export type WeaponSfxKind =
  | 'rifle'
  | 'smg'
  | 'shotgun'
  | 'sniper'
  | 'lmg'
  | 'pistol'
  | 'melee';

export type AudioBusId = 'master' | 'weapons' | 'combat' | 'zombie' | 'player' | 'ui';

export type { ZombieSfxKind };

export interface AudioBusLevels {
  master: number;
  weapons: number;
  combat: number;
  zombie: number;
  player: number;
  ui: number;
}

export interface GameAudio {
  resume: () => void;
  playGunshot: (kind: WeaponSfxKind, pan?: number) => void;
  playHit: (kind?: 'flesh' | 'crit' | 'melee') => void;
  playKill: () => void;
  playPlayerHurt: () => void;
  playZombie: (kind: ZombieKind | ZombieSfxKind, event: 'idle' | 'hurt' | 'attack' | 'death', pan?: number) => void;
  playLevelUp: () => void;
  playAbility: () => void;
  playWeaponSwitch: () => void;
  playReload: () => void;
  playEmptyClick: () => void;
  playFootstep: () => void;
  playGem: () => void;
  getBusLevels: () => AudioBusLevels;
  setBusLevel: (bus: AudioBusId, value: number) => void;
  dispose: () => void;
}

type Buf = AudioBuffer | null;

const MANIFEST: Record<string, string[]> = {
  rifle: ['/sfx/weapons/rifle.ogg'],
  smg: ['/sfx/weapons/smg.ogg'],
  shotgun: ['/sfx/weapons/shotgun.ogg'],
  sniper: ['/sfx/weapons/sniper.ogg'],
  lmg: ['/sfx/weapons/lmg.ogg'],
  pistol: ['/sfx/weapons/pistol.ogg'],
  melee: ['/sfx/weapons/melee.ogg', '/sfx/weapons/melee2.ogg'],
  reload: ['/sfx/weapons/reload.ogg'],
  empty: ['/sfx/weapons/empty.ogg'],
  switch: ['/sfx/weapons/switch.ogg'],
  hit_flesh: ['/sfx/combat/hit_flesh.ogg', '/sfx/combat/hit_flesh2.ogg'],
  hit_crit: ['/sfx/combat/hit_crit.ogg'],
  hit_melee: ['/sfx/combat/hit_melee.ogg'],
  kill: ['/sfx/combat/kill.ogg'],
  hurt: ['/sfx/player/hurt.ogg'],
  footstep: ['/sfx/player/footstep.ogg', '/sfx/player/footstep2.ogg'],
  gem: ['/sfx/ui/gem.ogg'],
  levelup: ['/sfx/ui/levelup.ogg'],
  ability: ['/sfx/ui/ability.ogg'],
  grunt_idle: ['/sfx/zombie/grunt_idle.ogg', '/sfx/zombie/grunt_idle2.ogg', '/sfx/zombie/grunt_idle3.ogg'],
  grunt_hurt: ['/sfx/zombie/grunt_hurt.ogg', '/sfx/zombie/grunt_hurt2.ogg'],
  grunt_attack: ['/sfx/zombie/grunt_attack.ogg', '/sfx/zombie/grunt_attack2.ogg'],
  grunt_death: ['/sfx/zombie/grunt_death.ogg', '/sfx/zombie/grunt_death2.ogg'],
  acid_idle: ['/sfx/zombie/acid_idle.ogg'],
  acid_hurt: ['/sfx/zombie/acid_hurt.ogg'],
  acid_attack: ['/sfx/zombie/acid_attack.ogg'],
  acid_death: ['/sfx/zombie/acid_death.ogg'],
  boss_idle: ['/sfx/zombie/boss_idle.ogg', '/sfx/zombie/boss_growl.ogg'],
  boss_hurt: ['/sfx/zombie/boss_hurt.ogg'],
  boss_attack: ['/sfx/zombie/boss_attack.ogg', '/sfx/zombie/boss_roar.ogg'],
  boss_death: ['/sfx/zombie/boss_death.ogg'],
};

/** Relative bus gains — combat/weapons sit above zombie ambience. */
const DEFAULT_BUS: AudioBusLevels = {
  master: 0.55,
  weapons: 1,
  combat: 0.92,
  zombie: 0.72,
  player: 1,
  ui: 0.82,
};

const STORAGE_KEY = 'protocol-z-audio-bus-v1';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function loadStoredBus(): Partial<AudioBusLevels> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AudioBusLevels>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistBus(levels: AudioBusLevels): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  } catch {
    /* ignore quota / private mode */
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function createGameAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const buses = new Map<Exclude<AudioBusId, 'master'>, GainNode>();
  const levels: AudioBusLevels = { ...DEFAULT_BUS, ...loadStoredBus() };
  const buffers = new Map<string, Buf[]>();
  let loadPromise: Promise<void> | null = null;
  let stepGate = 0;
  let zombieIdleGate = 0;
  let duckUntil = 0;

  const ensure = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = clamp01(levels.master);
      master.connect(ctx.destination);

      (['weapons', 'combat', 'zombie', 'player', 'ui'] as const).forEach((id) => {
        const g = ctx!.createGain();
        g.gain.value = clamp01(levels[id]);
        g.connect(master!);
        buses.set(id, g);
      });
    }
    return ctx;
  };

  const busNode = (bus: Exclude<AudioBusId, 'master'>): GainNode | null => {
    ensure();
    return buses.get(bus) ?? null;
  };

  const applyLevels = () => {
    if (master) master.gain.value = clamp01(levels.master);
    for (const [id, node] of buses) {
      const base = clamp01(levels[id]);
      if (id === 'zombie' && duckUntil > performance.now()) {
        node.gain.value = base * 0.45;
      } else {
        node.gain.value = base;
      }
    }
  };

  const duckZombie = (ms = 220) => {
    duckUntil = Math.max(duckUntil, performance.now() + ms);
    const zBus = buses.get('zombie');
    if (!zBus || !ctx) return;
    const base = clamp01(levels.zombie);
    zBus.gain.cancelScheduledValues(ctx.currentTime);
    zBus.gain.setValueAtTime(base * 0.45, ctx.currentTime);
    zBus.gain.linearRampToValueAtTime(base, ctx.currentTime + ms / 1000);
  };

  const resume = () => {
    const c = ensure();
    if (c?.state === 'suspended') void c.resume();
    void preload();
  };

  const decodeUrl = async (c: AudioContext, url: string): Promise<Buf> => {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return await c.decodeAudioData(ab.slice(0));
    } catch {
      return null;
    }
  };

  const preload = (): Promise<void> => {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const c = ensure();
      if (!c) return;
      await Promise.all(
        Object.entries(MANIFEST).map(async ([key, urls]) => {
          const decoded = await Promise.all(urls.map((u) => decodeUrl(c, u)));
          buffers.set(
            key,
            decoded.filter((b): b is AudioBuffer => !!b),
          );
        }),
      );
    })();
    return loadPromise;
  };

  const playBuffer = (
    key: string,
    bus: Exclude<AudioBusId, 'master'>,
    opts: { gain?: number; pan?: number; rate?: number; rateJitter?: number } = {},
  ) => {
    const c = ensure();
    const dest = busNode(bus);
    if (!c || !dest) return false;
    void preload();
    const list = buffers.get(key);
    if (!list || list.length === 0) return false;
    const buf = pick(list);
    if (!buf) return false;

    const src = c.createBufferSource();
    src.buffer = buf;
    const baseRate = opts.rate ?? 1;
    const jitter = opts.rateJitter ?? 0.04;
    src.playbackRate.value = baseRate * (1 + (Math.random() * 2 - 1) * jitter);

    const g = c.createGain();
    const peak = opts.gain ?? 0.7;
    g.gain.setValueAtTime(peak, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + Math.max(0.08, buf.duration * 0.95));

    const panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));

    src.connect(g);
    g.connect(panner);
    panner.connect(dest);
    src.start();
    return true;
  };

  /** Soft fallback if sample missing — never the old 8-bit stack. */
  const softFallback = (
    freq: number,
    dur: number,
    gain: number,
    bus: Exclude<AudioBusId, 'master'>,
    pan = 0,
  ) => {
    const c = ensure();
    const dest = busNode(bus);
    if (!c || !dest) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    const panner = c.createStereoPanner();
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.4), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    osc.connect(filter);
    filter.connect(g);
    g.connect(panner);
    panner.connect(dest);
    osc.start();
    osc.stop(c.currentTime + dur + 0.02);
  };

  const playOrSoft = (
    key: string,
    bus: Exclude<AudioBusId, 'master'>,
    opts: { gain?: number; pan?: number; rate?: number; rateJitter?: number },
    soft: { freq: number; dur: number; gain: number },
  ) => {
    if (!playBuffer(key, bus, opts)) softFallback(soft.freq, soft.dur, soft.gain, bus, opts.pan);
  };

  const playGunshot = (kind: WeaponSfxKind, pan = 0) => {
    resume();
    duckZombie(kind === 'shotgun' || kind === 'sniper' ? 320 : 200);
    const gains: Record<WeaponSfxKind, number> = {
      pistol: 0.72,
      smg: 0.55,
      rifle: 0.7,
      shotgun: 0.85,
      sniper: 0.9,
      lmg: 0.68,
      melee: 0.65,
    };
    const rates: Partial<Record<WeaponSfxKind, number>> = {
      smg: 1.12,
      lmg: 0.92,
      sniper: 0.88,
      pistol: 1.05,
    };
    playOrSoft(
      kind,
      'weapons',
      { gain: gains[kind], pan, rate: rates[kind] ?? 1, rateJitter: kind === 'smg' ? 0.06 : 0.03 },
      { freq: 140, dur: 0.08, gain: 0.12 },
    );
  };

  const playHit = (kind: 'flesh' | 'crit' | 'melee' = 'flesh') => {
    resume();
    if (kind === 'crit') {
      playOrSoft('hit_crit', 'combat', { gain: 0.8, rateJitter: 0.05 }, { freq: 90, dur: 0.1, gain: 0.15 });
      return;
    }
    if (kind === 'melee') {
      playOrSoft('hit_melee', 'combat', { gain: 0.75, rateJitter: 0.06 }, { freq: 80, dur: 0.1, gain: 0.14 });
      return;
    }
    playOrSoft('hit_flesh', 'combat', { gain: 0.7, rateJitter: 0.07 }, { freq: 160, dur: 0.06, gain: 0.12 });
  };

  const playZombie = (
    kind: ZombieKind | ZombieSfxKind,
    event: 'idle' | 'hurt' | 'attack' | 'death',
    pan = 0,
  ) => {
    resume();
    if (event === 'idle') {
      const now = performance.now();
      if (now - zombieIdleGate < 480) return;
      zombieIdleGate = now;
    }
    const sfx = toZombieSfxKind(kind as ZombieKind);
    const key = `${sfx}_${event}`;
    const gain =
      sfx === 'boss' ? (event === 'attack' || event === 'death' ? 0.9 : 0.7) : event === 'idle' ? 0.45 : 0.65;
    const rate =
      sfx === 'acid'
        ? 1.15
        : kind === 'screamer'
          ? 1.35
          : sfx === 'boss'
            ? 0.82
            : kind === 'runner'
              ? 1.22
              : 1;
    playOrSoft(key, 'zombie', { gain, pan, rate, rateJitter: 0.08 }, { freq: 90, dur: 0.12, gain: 0.08 });
  };

  return {
    resume,
    playGunshot,
    playHit,
    playKill: () => {
      resume();
      playOrSoft('kill', 'combat', { gain: 0.7, rateJitter: 0.05 }, { freq: 70, dur: 0.14, gain: 0.12 });
    },
    playPlayerHurt: () => {
      resume();
      playOrSoft('hurt', 'player', { gain: 0.85, rateJitter: 0.04 }, { freq: 100, dur: 0.14, gain: 0.18 });
    },
    playZombie,
    playLevelUp: () => {
      resume();
      playOrSoft('levelup', 'ui', { gain: 0.55, rate: 1.05 }, { freq: 440, dur: 0.12, gain: 0.1 });
    },
    playAbility: () => {
      resume();
      playOrSoft('ability', 'ui', { gain: 0.65, rateJitter: 0.03 }, { freq: 240, dur: 0.12, gain: 0.12 });
    },
    playWeaponSwitch: () => {
      resume();
      playOrSoft('switch', 'weapons', { gain: 0.5, rateJitter: 0.02 }, { freq: 420, dur: 0.05, gain: 0.08 });
    },
    playReload: () => {
      resume();
      playOrSoft('reload', 'weapons', { gain: 0.55, rateJitter: 0.03 }, { freq: 200, dur: 0.08, gain: 0.1 });
      const c = ensure();
      if (!c) return;
      window.setTimeout(() => {
        playBuffer('empty', 'weapons', { gain: 0.4, rate: 0.85 });
      }, 280);
    },
    playEmptyClick: () => {
      resume();
      playOrSoft('empty', 'weapons', { gain: 0.45, rate: 1.1 }, { freq: 80, dur: 0.04, gain: 0.08 });
    },
    playFootstep: () => {
      const now = performance.now();
      if (now - stepGate < 260) return;
      stepGate = now;
      resume();
      playOrSoft('footstep', 'player', { gain: 0.28, rateJitter: 0.1 }, { freq: 60, dur: 0.04, gain: 0.05 });
    },
    playGem: () => {
      resume();
      playOrSoft('gem', 'ui', { gain: 0.45, rate: 1.2, rateJitter: 0.05 }, { freq: 660, dur: 0.06, gain: 0.08 });
    },
    getBusLevels: () => ({ ...levels }),
    setBusLevel: (bus, value) => {
      levels[bus] = clamp01(value);
      ensure();
      applyLevels();
      persistBus(levels);
    },
    dispose: () => {
      void ctx?.close();
      ctx = null;
      master = null;
      buses.clear();
      buffers.clear();
      loadPromise = null;
    },
  };
}
