export type KeyState = Record<string, boolean>;

export function createInput(target: Window | HTMLElement = window) {
  const keys: KeyState = {};
  const mouse = { x: 0, y: 0, down: false };
  let zoomDelta = 0;
  let weaponWheel = 0;
  let wheelAcc = 0;
  /** virtual stick from touchControls.ts, -1..1 on both axes (screen right = +x, screen down = +z) */
  const touchMove = { x: 0, z: 0 };
  let touchUsed = false;

  const onKeyDown = (e: KeyboardEvent) => {
    keys[e.code] = true;
    // F11 → real (API) fullscreen so Keyboard Lock can catch Ctrl+W
    if (e.code === 'F11') {
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    // best effort: browsers that let pages cancel it won't close the tab
    if (e.ctrlKey && (e.code === 'KeyW' || e.code === 'KeyQ')) e.preventDefault();
    if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') {
      zoomDelta -= 0.12;
      e.preventDefault();
    }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_') {
      zoomDelta += 0.12;
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
  };
  // Touches belong to the on-screen controls; they must not move the aim cursor or "click".
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    mouse.down = true;
  };
  const onPointerUp = () => {
    mouse.down = false;
  };
  // Wheel = weapon slots; Shift/Ctrl + wheel (or +/-) = camera zoom.
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.shiftKey || e.ctrlKey || e.altKey) {
      const step = e.deltaMode === 1 ? 0.14 : 0.08;
      const d = e.deltaY !== 0 ? e.deltaY : e.deltaX; // Shift turns vertical wheel into deltaX on some OSes
      zoomDelta += Math.sign(d) * step;
      return;
    }
    // accumulate trackpad deltas so one notch = one weapon
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    if (Math.abs(wheelAcc) >= 60) {
      weaponWheel += Math.sign(wheelAcc);
      wheelAcc = 0;
    }
  };

  target.addEventListener('keydown', onKeyDown as EventListener);
  target.addEventListener('keyup', onKeyUp as EventListener);
  target.addEventListener('pointermove', onPointerMove as EventListener);
  target.addEventListener('pointerdown', onPointerDown as EventListener);
  target.addEventListener('pointerup', onPointerUp as EventListener);
  target.addEventListener('wheel', onWheel as EventListener, { passive: false });

  const moveAxis = () => {
    const tl = Math.hypot(touchMove.x, touchMove.z);
    if (tl > 0.12) {
      // analog: partial tilt walks slower, full tilt runs
      const k = Math.min(1, tl) / tl;
      return { x: touchMove.x * k, z: touchMove.z * k };
    }
    let x = 0;
    let z = 0;
    if (keys.KeyW || keys.ArrowUp) z -= 1;
    if (keys.KeyS || keys.ArrowDown) z += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    return { x, z };
  };

  const consumeWeaponWheel = () => {
    const d = weaponWheel;
    weaponWheel = 0;
    return d;
  };

  const consumeZoomDelta = () => {
    const d = zoomDelta;
    zoomDelta = 0;
    return d;
  };

  const dispose = () => {
    target.removeEventListener('keydown', onKeyDown as EventListener);
    target.removeEventListener('keyup', onKeyUp as EventListener);
    target.removeEventListener('pointermove', onPointerMove as EventListener);
    target.removeEventListener('pointerdown', onPointerDown as EventListener);
    target.removeEventListener('pointerup', onPointerUp as EventListener);
    target.removeEventListener('wheel', onWheel as EventListener);
  };

  /** Called by the touch layer. */
  const touch = {
    setMove(x: number, z: number) {
      touchMove.x = x;
      touchMove.z = z;
      touchUsed = true;
    },
    press(code: string, down: boolean) {
      keys[code] = down;
      touchUsed = true;
    },
    wheel(step: number) {
      weaponWheel += step;
    },
    /** true once the player has used the on-screen controls (aim then follows the action, not a cursor) */
    get active() {
      return touchUsed;
    },
  };

  return { keys, mouse, moveAxis, consumeZoomDelta, consumeWeaponWheel, dispose, touch };
}
