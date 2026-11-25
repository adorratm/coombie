/**
 * Procedural soundtrack + map ambience (Web Audio only, no files):
 *  - music: a minor-key loop in four layers (pad → bass → drums → lead) that fade in
 *    with the threat level the arena reports (zombies around you, bosses, low health).
 *  - ambience: a noise bed per map (wind, rain, fire, city rumble) plus small details:
 *    crickets at night, distant crows, a broken music box in the amusement park.
 * Scheduled with a short look-ahead so timing stays tight even when frames stutter.
 */

export interface ScapeOpts {
  map: string;
  weather: 'none' | 'rain' | 'snow' | 'dust' | 'ash';
  night: boolean;
}

const BPM = 100;
const STEP = 60 / BPM / 4; // 16th note
const LOOKAHEAD = 0.35;
// A minor: i – VI – III – VII  (Am F C G), two bars each
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Soundscape {
  private music: GainNode;
  private amb: GainNode;
  private layers: GainNode[] = [];
  private target = 0;
  private level = 0;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private noise: AudioBuffer;
  private ambNodes: AudioNode[] = [];
  private ambTimers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly ctx: AudioContext,
    musicBus: GainNode,
    ambBus: GainNode,
  ) {
    this.music = ctx.createGain();
    this.music.gain.value = 0.9;
    this.music.connect(musicBus);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(ambBus);
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.music);
      this.layers.push(g);
    }
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  start(o: ScapeOpts): void {
    this.stop();
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 90);
    this.startAmbience(o);
    this.amb.gain.setTargetAtTime(1, this.ctx.currentTime, 2);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.ambTimers) clearInterval(t);
    this.ambTimers = [];
    for (const n of this.ambNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambNodes = [];
    for (const g of this.layers) g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    this.amb.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  /** 0 = calm … 1 = boss fight; layers follow smoothly */
  setIntensity(x: number): void {
    this.target = Math.max(0, Math.min(1, x));
  }

  // ------------------------------------------------------------- music
  private schedule(): void {
    const c = this.ctx;
    if (c.state !== 'running') {
      this.nextTime = c.currentTime + 0.1;
      return;
    }
    // ease toward the target (rises faster than it falls)
    this.level += (this.target - this.level) * (this.target > this.level ? 0.08 : 0.02);
    const L = this.level;
    const gains = [0.05 + L * 0.06, L > 0.2 ? Math.min(1, (L - 0.2) / 0.2) * 0.12 : 0, L > 0.45 ? Math.min(1, (L - 0.45) / 0.2) * 0.2 : 0, L > 0.8 ? Math.min(1, (L - 0.8) / 0.15) * 0.06 : 0];
    gains.forEach((g, i) => this.layers[i]!.gain.setTargetAtTime(g, c.currentTime, 0.6));
    if (this.nextTime < c.currentTime - 0.2) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime, L);
      this.step = (this.step + 1) % (16 * 8);
      this.nextTime += STEP;
    }
  }

  private playStep(s: number, t: number, L: number): void {
    const bar = Math.floor(s / 16);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length]!;
    const beat = s % 16;
    // pad: a new chord every two bars
    if (s % 32 === 0) for (const n of chord) this.pad(midi(n), t, STEP * 32);
    // bass: root on 8ths, octave jump on the off-beats when tense
    if (L > 0.2 && beat % 2 === 0) this.bass(midi(chord[0]! - 24 + (beat % 4 === 2 && L > 0.6 ? 12 : 0)), t);
    // drums
    if (L > 0.45) {
      if (beat % 8 === 0 || (L > 0.75 && beat === 10)) this.kick(t);
      if (L > 0.6 && beat % 8 === 4) this.snare(t);
      if (L > 0.7 && beat % 2 === 1) this.hat(t, beat % 4 === 3 ? 0.6 : 0.35);
    }
    // lead: arpeggio over the chord during boss-level fights
    if (L > 0.8 && beat % 2 === 0) {
      const n = chord[(beat / 2) % 3]! + 12 + (beat >= 8 ? 12 : 0);
      this.lead(midi(n), t);
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private pad(f: number, t: number, dur: number): void {
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = c.createGain();
    this.env(g, t, 1.2, 0.5, dur + 0.5);
    for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.6);
    }
    lp.connect(g);
    g.connect(this.layers[0]!);
  }

  private bass(f: number, t: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.2);
    const g = c.createGain();
    this.env(g, t, 0.01, 0.9, 0.24);
    o.connect(lp).connect(g).connect(this.layers[1]!);
    o.start(t);
    o.stop(t + 0.3);
  }

  private kick(t: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = c.createGain();
    this.env(g, t, 0.004, 1, 0.3);
    o.connect(g).connect(this.layers[2]!);
    o.start(t);
    o.stop(t + 0.32);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, dur: number, peak: number, out: AudioNode): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    this.env(g, t, 0.003, peak, dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number): void {
    this.noiseHit(t, 'bandpass', 1800, 0.18, 0.7, this.layers[2]!);
  }

  private hat(t: number, k: number): void {
    this.noiseHit(t, 'highpass', 7000, 0.05, 0.25 * k, this.layers[2]!);
  }

  private lead(f: number, t: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = c.createGain();
    this.env(g, t, 0.01, 0.6, STEP * 1.8);
    o.connect(lp).connect(g).connect(this.layers[3]!);
    o.start(t);
    o.stop(t + STEP * 2);
  }

  // ------------------------------------------------------------- ambience
  private bed(type: BiquadFilterType, freq: number, gain: number, wobble = 0): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.amb);
    src.start();
    this.ambNodes.push(src, f, g);
    if (wobble) {
      // slow gusts: an LFO on the filter
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lg = c.createGain();
      lg.gain.value = wobble;
      lfo.connect(lg).connect(f.frequency);
      lfo.start();
      this.ambNodes.push(lfo, lg);
    }
  }

  private every(ms: number, fn: () => void): void {
    this.ambTimers.push(setInterval(() => this.ctx.state === 'running' && fn(), ms));
  }

  private chirp(f: number, t: number, dur: number, peak: number, type: OscillatorType = 'sine', slide = 1): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.01, peak, dur);
    o.connect(g).connect(this.amb);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private startAmbience(o: ScapeOpts): void {
    const c = this.ctx;
    const indoor = o.map === 'lab' || o.map === 'mall' || o.map === 'hospital';
    if (indoor) this.bed('lowpass', 120, 0.25); // building hum
    else this.bed('lowpass', 420, 0.16, 260); // wind
    if (o.weather === 'rain') {
      this.bed('highpass', 3500, 0.12);
      this.bed('bandpass', 900, 0.08);
    }
    if (o.weather === 'snow') this.bed('bandpass', 1400, 0.05, 500);
    if (o.weather === 'dust') this.bed('bandpass', 700, 0.1, 400);
    if (o.map === 'volcano' || o.weather === 'ash') {
      this.bed('lowpass', 90, 0.35); // rumble
      this.every(220, () => Math.random() < 0.5 && this.noiseHit(c.currentTime, 'highpass', 2500, 0.03, 0.15 * Math.random(), this.amb));
    }
    if (o.map === 'city' || o.map === 'highway' || o.map === 'industrial') {
      this.bed('lowpass', 70, 0.22);
      // far-off sirens
      this.every(9000, () => {
        if (Math.random() > 0.35) return;
        const t = c.currentTime;
        for (let k = 0; k < 4; k++) this.chirp(620, t + k * 0.9, 0.85, 0.018, 'triangle', 1.35);
      });
    }
    if (o.map === 'harbor' || o.map === 'river') {
      this.bed('lowpass', 300, 0.18, 200); // water
      this.every(6000, () => Math.random() < 0.3 && this.chirp(1900, c.currentTime, 0.35, 0.02, 'sine', 0.8)); // gulls
    }
    if (o.night || o.map === 'forest' || o.map === 'maze' || o.map === 'village') {
      // crickets
      this.every(130, () => {
        if (Math.random() > 0.35) return;
        const t = c.currentTime;
        const f = 4300 + Math.random() * 500;
        for (let k = 0; k < 3; k++) this.chirp(f, t + k * 0.045, 0.03, 0.006);
      });
    }
    if (!indoor && o.weather !== 'rain') {
      // crows
      this.every(7000, () => {
        if (Math.random() > 0.3) return;
        const t = c.currentTime;
        const n = 1 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) this.chirp(620, t + k * 0.32, 0.22, 0.02, 'sawtooth', 0.55);
      });
    }
    if (o.map === 'lunapark') {
      // a broken music box somewhere in the park: a slow, slightly out-of-tune waltz
      const tune = [76, 79, 83, 79, 76, 72, 74, 76, 71, 74, 79, 74];
      let i = 0;
      this.every(560, () => {
        const n = tune[i++ % tune.length]!;
        const wow = 1 + Math.sin(c.currentTime * 0.7) * 0.012;
        this.chirp(midi(n) * wow, c.currentTime, 0.9, 0.014, 'triangle', 0.998);
        if (i % 3 === 1) this.chirp(midi(n - 24) * wow, c.currentTime, 1.2, 0.01, 'sine');
      });
    }
  }
}
