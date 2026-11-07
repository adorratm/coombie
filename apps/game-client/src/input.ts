export type KeyState = Record<string, boolean>;

export function createInput(target: Window | HTMLElement = window) {
  const keys: KeyState = {};
  const mouse = { x: 0, y: 0, down: false };
  let zoomDelta = 0;
  let weaponWheel = 0;
  let wheelAcc = 0;

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
  const onPointerMove = (e: PointerEvent) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  };
  const onPointerDown = () => {
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

  return { keys, mouse, moveAxis, consumeZoomDelta, consumeWeaponWheel, dispose };
}
