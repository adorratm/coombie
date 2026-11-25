/**
 * First-run coach: a short guided tour of the controls during a new player's first solo
 * run. Each step waits for the player to actually do the thing (or times out), then
 * moves on. Shown once; "Geç" skips it for good.
 */
import type { ArenaHudState } from './arena';

const DONE_KEY = 'coombie:tutorial-done';

interface Step {
  title: string;
  desk: string;
  touch: string;
  /** done when this returns true (or after `max` seconds on the step) */
  done: (h: ArenaHudState, s: TutorialState) => boolean;
  max: number;
}

interface TutorialState {
  t0: number;
  kills0: number;
  casts: Set<string>;
}

const cd = (h: ArenaHudState, slot: string) => (h.heroAbilities ?? []).find((a) => a.slot === slot)?.cooldown ?? 0;

const STEPS: Step[] = [
  { title: 'Hareket', desk: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ile hareket et, <kbd>Boşluk</kbd> ile atıl.', touch: 'Sol alttaki çubukla hareket et.', done: (h, s) => h.runTimeSec - s.t0 > 6, max: 8 },
  { title: 'Ateş', desk: 'Fareyle nişan al, <b>sol tık</b> ile ateş et. 5 zombi indir.', touch: 'Sağ taraftaki çubukla nişan al: çekince ateş eder. 5 zombi indir.', done: (h, s) => h.kills - s.kills0 >= 5, max: 40 },
  { title: 'Kahraman yetenekleri', desk: '<kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> kahramanının yetenekleri. Birini kullan.', touch: 'Sağdaki Q / E / R kartlarına dokunarak yetenek kullan.', done: (h, s) => ['Q', 'E', 'R'].some((k) => s.casts.has(k)), max: 25 },
  { title: 'Ağzı bozuk hamle', desk: '<kbd>H</kbd>: her kahramanın kendine özel, küfürlü süper hamlesi. Kalabalığa sakla.', touch: 'H kartı: kahramanının küfürlü süper hamlesi. Kalabalığa sakla.', done: (_h, s) => s.casts.has('H'), max: 14 },
  { title: 'Seviye atla', desk: 'Yere düşen yeşil kristalleri topla. Seviye atlayınca bir güçlendirme seç.', touch: 'Yeşil kristalleri topla. Seviye atlayınca bir güçlendirme seç.', done: (h) => h.level >= 2, max: 45 },
  { title: 'Telsiz ve eşyalar', desk: 'Telsiz kartı alırsan <kbd>B</kbd> ile hava desteği çağırırsın. Sandıklar, mermi ve can paketleri haritada. <b>Patlayıcı varilleri vur!</b>', touch: 'Telsiz kartı alırsan B kartıyla hava desteği çağırırsın. Kırmızı varilleri vur, patlarlar!', done: () => false, max: 9 },
];

export class Tutorial {
  private i = -1;
  private stepT = 0;
  private readonly st: TutorialState = { t0: 0, kills0: 0, casts: new Set() };
  private readonly box: HTMLElement;
  private lastCd = new Map<string, number>();
  private active: boolean;

  constructor(
    host: HTMLElement,
    private readonly touch: boolean,
  ) {
    let done = false;
    try {
      done = localStorage.getItem(DONE_KEY) === '1';
    } catch {
      /* ignore */
    }
    this.active = !done;
    this.box = document.createElement('div');
    this.box.id = 'coach';
    this.box.hidden = true;
    host.append(this.box);
  }

  static reset(): void {
    try {
      localStorage.removeItem(DONE_KEY);
    } catch {
      /* ignore */
    }
  }

  private finish(): void {
    this.active = false;
    this.box.hidden = true;
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  private show(): void {
    const s = STEPS[this.i]!;
    this.box.innerHTML = `<div class="ch"><span>EĞİTİM ${this.i + 1}/${STEPS.length}</span><b>${s.title}</b></div><p>${this.touch ? s.touch : s.desk}</p><button type="button">Geç</button>`;
    (this.box.querySelector('button') as HTMLButtonElement).onclick = () => this.finish();
    this.box.hidden = false;
    this.box.classList.remove('pop');
    void this.box.offsetWidth;
    this.box.classList.add('pop');
  }

  /** Call every HUD frame of a solo run. */
  update(h: ArenaHudState, dt: number, solo: boolean): void {
    if (!this.active) return;
    if (!solo || h.runOver) {
      this.box.hidden = true;
      return;
    }
    // casts: a cooldown that jumps up means the ability was used
    for (const k of ['Q', 'E', 'R', 'H']) {
      const c = cd(h, k);
      if (c > (this.lastCd.get(k) ?? 0) + 0.5) this.st.casts.add(k);
      this.lastCd.set(k, c);
    }
    if (this.i < 0) {
      this.i = 0;
      this.stepT = 0;
      this.st.t0 = h.runTimeSec;
      this.st.kills0 = h.kills;
      this.show();
      return;
    }
    this.box.hidden = !!h.pausedForUpgrade && this.i !== 4;
    this.stepT += dt;
    const s = STEPS[this.i]!;
    if (s.done(h, this.st) || this.stepT > s.max) {
      this.i++;
      if (this.i >= STEPS.length) return this.finish();
      this.stepT = 0;
      this.st.t0 = h.runTimeSec;
      this.st.kills0 = h.kills;
      this.show();
    }
  }

  dispose(): void {
    this.box.remove();
  }
}
