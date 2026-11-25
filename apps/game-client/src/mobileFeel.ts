/**
 * Phone extras:
 *  - haptics: short vibrations on taking damage, big kills and nearby blasts
 *    (navigator.vibrate — Android browsers; iOS Safari ignores it silently)
 *  - gyro aim: rotate the phone like a steering wheel to turn your aim; auto-aim then
 *    only snaps to zombies close to where you point. iOS asks for motion permission,
 *    which needs a tap (the setting's toggle).
 * Both are opt-in settings kept in localStorage.
 */

const HAPTIC_KEY = 'coombie:haptics';
const GYRO_KEY = 'coombie:gyro';

const read = (k: string, d: boolean): boolean => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v === '1';
  } catch {
    return d;
  }
};
const write = (k: string, v: boolean) => {
  try {
    localStorage.setItem(k, v ? '1' : '0');
  } catch {
    /* ignore */
  }
};

export const hapticsSupported = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export const hapticsOn = (): boolean => hapticsSupported() && read(HAPTIC_KEY, true);
export const setHaptics = (on: boolean) => write(HAPTIC_KEY, on);

let lastBuzz = 0;
/** Vibrate (rate-limited so a fire fight doesn't buzz nonstop). */
export function buzz(pattern: number | number[], minGapMs = 90): void {
  if (!hapticsOn()) return;
  const now = performance.now();
  if (now - lastBuzz < minGapMs) return;
  lastBuzz = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export const gyroSupported = (): boolean => typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
export const gyroOn = (): boolean => gyroSupported() && read(GYRO_KEY, false);

/** Turn gyro aim on/off (asks iOS for permission — call from a tap). */
export async function setGyro(on: boolean): Promise<boolean> {
  if (on) {
    const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    if (DME?.requestPermission) {
      try {
        if ((await DME.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
  }
  write(GYRO_KEY, on);
  return true;
}

/**
 * Steering-wheel aim: integrates the rotation rate around the axis through the screen.
 * `yaw` is in radians, added to the aim direction by the arena.
 */
export class GyroAim {
  yaw = 0;
  private rate = 0;
  private listening = false;
  private readonly onMotion = (e: DeviceMotionEvent) => {
    const r = e.rotationRate;
    if (!r || r.alpha === null) return;
    // degrees per second around the screen normal
    this.rate = (r.alpha ?? 0) * (Math.PI / 180);
  };

  start(): void {
    if (this.listening || !gyroOn()) return;
    window.addEventListener('devicemotion', this.onMotion);
    this.listening = true;
  }

  stop(): void {
    if (!this.listening) return;
    window.removeEventListener('devicemotion', this.onMotion);
    this.listening = false;
    this.rate = 0;
  }

  get active(): boolean {
    return this.listening && gyroOn();
  }

  update(dt: number): void {
    if (!this.listening) return;
    // tiny rates are hand tremor: dead zone
    const r = Math.abs(this.rate) < 0.06 ? 0 : this.rate;
    this.yaw -= r * dt * 1.6;
  }
}
