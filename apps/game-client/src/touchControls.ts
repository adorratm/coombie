/**
 * On-screen controls for phones and tablets: a floating move stick on the left half,
 * ability buttons (the HUD's own Q/E/R/H cards, enlarged) and reload / weapon / pause
 * buttons on the right. Firing stays automatic, as on desktop.
 */
export interface TouchInput {
  setMove(x: number, z: number): void;
  press(code: string, down: boolean): void;
  wheel(step: number): void;
}

/** Phones and tablets, or `?touch=1` for testing on a desktop. */
export function wantsTouchControls(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(location.search).get('touch') === '1') return true;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

const STICK_RADIUS = 52;

export function mountTouchControls(input: TouchInput, skills: HTMLElement): () => void {
  document.body.classList.add('touch');
  const root = document.createElement('div');
  root.id = 'touchUi';
  root.innerHTML = `
    <div id="tStickZone" aria-hidden="true"><div id="tStickBase"><div id="tStickKnob"></div></div></div>
    <div id="tBtns">
      <button type="button" class="tb" data-act="swap" aria-label="Silah değiştir">⇄</button>
      <button type="button" class="tb" data-key="KeyG" aria-label="Şarjör değiştir">↻</button>
    </div>
    <button type="button" id="tPause" aria-label="Duraklat">❚❚</button>`;
  document.body.appendChild(root);

  const zone = root.querySelector<HTMLElement>('#tStickZone')!;
  const base = root.querySelector<HTMLElement>('#tStickBase')!;
  const knob = root.querySelector<HTMLElement>('#tStickKnob')!;
  let stickId: number | null = null;
  let ox = 0;
  let oy = 0;

  const stickDown = (e: PointerEvent) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect();
    ox = e.clientX;
    oy = e.clientY;
    base.style.transform = `translate(${ox - r.left}px, ${oy - r.top}px)`;
    base.classList.add('on');
    knob.style.transform = 'translate(-50%, -50%)';
  };
  const stickMove = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    input.setMove(dx / STICK_RADIUS, dy / STICK_RADIUS);
  };
  const stickUp = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    base.classList.remove('on');
    input.setMove(0, 0);
  };
  zone.addEventListener('pointerdown', stickDown);
  zone.addEventListener('pointermove', stickMove);
  zone.addEventListener('pointerup', stickUp);
  zone.addEventListener('pointercancel', stickUp);

  // buttons: hold = key held, so abilities that charge or repeat behave like the keyboard
  const held = new Map<number, string>();
  const keyDown = (code: string, e: PointerEvent) => {
    e.preventDefault();
    held.set(e.pointerId, code);
    input.press(code, true);
  };
  const keyUp = (e: PointerEvent) => {
    const code = held.get(e.pointerId);
    if (!code) return;
    held.delete(e.pointerId);
    input.press(code, false);
  };
  const onButtons = (e: PointerEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.tb');
    if (!btn) return;
    if (btn.dataset.act === 'swap') {
      e.preventDefault();
      input.wheel(1);
      return;
    }
    if (btn.dataset.key) keyDown(btn.dataset.key, e);
  };
  const btns = root.querySelector<HTMLElement>('#tBtns')!;
  btns.addEventListener('pointerdown', onButtons);
  // the HUD's ability cards (Q/E/R/H with cooldowns) double as the ability buttons
  const onSkill = (e: PointerEvent) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.skill');
    const slot = card?.dataset.slot;
    if (slot) keyDown(`Key${slot}`, e);
  };
  skills.addEventListener('pointerdown', onSkill);
  window.addEventListener('pointerup', keyUp);
  window.addEventListener('pointercancel', keyUp);

  const pause = root.querySelector<HTMLElement>('#tPause')!;
  const onPause = (e: Event) => {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  };
  pause.addEventListener('click', onPause);

  // stop the browser from scrolling, zooming or long-press selecting during play
  const noScroll = (e: TouchEvent) => {
    if ((e.target as HTMLElement).closest('#touchUi, #heroSkills, #app')) e.preventDefault();
  };
  document.addEventListener('touchmove', noScroll, { passive: false });

  return () => {
    for (const code of held.values()) input.press(code, false);
    held.clear();
    input.setMove(0, 0);
    skills.removeEventListener('pointerdown', onSkill);
    window.removeEventListener('pointerup', keyUp);
    window.removeEventListener('pointercancel', keyUp);
    document.removeEventListener('touchmove', noScroll);
    root.remove();
    document.body.classList.remove('touch');
  };
}

/** Phones: ask for landscape. Android can lock it once fullscreen; iOS shows the rotate overlay. */
export async function preferLandscape(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
    /* iOS Safari / in-app web views: no fullscreen API */
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* not supported or not fullscreen: the CSS rotate overlay covers it */
  }
}
