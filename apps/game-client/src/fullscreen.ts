/**
 * Tam ekran — tarayıcı farkları:
 * - Android Chrome / masaüstü: Fullscreen API (adres çubuğu gizlenir)
 * - iPad Safari: webkit önekli API
 * - iPhone (Safari ve Chrome — ikisi de WebKit): sayfalar için tam ekran API'si YOK. Tek yol oyunu
 *   "Ana Ekrana Ekle" ile açmak (manifest display: fullscreen → adres çubuğu yok). Bu durumda bir ipucu gösteririz.
 */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: (opts?: unknown) => Promise<void> | void };

export function isStandaloneApp(): boolean {
  try {
    return (
      matchMedia('(display-mode: fullscreen)').matches ||
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function fullscreenSupported(): boolean {
  const d = document as FsDoc;
  return Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

export async function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    /* reddedildi */
  }
  return false;
}

export async function exitFullscreen(): Promise<void> {
  const d = document as FsDoc;
  try {
    if (d.fullscreenElement) await d.exitFullscreen();
    else if (d.webkitFullscreenElement) await d.webkitExitFullscreen?.();
  } catch {
    /* ignore */
  }
}

/** Düğme için: aç/kapat; API yoksa (iPhone) ana ekrana ekleme ipucunu göster */
export async function toggleFullscreen(): Promise<void> {
  if (isFullscreen()) return exitFullscreen();
  if (isStandaloneApp()) return;
  if (fullscreenSupported() && (await enterFullscreen())) return;
  showHomeScreenHint();
}

let hintEl: HTMLElement | null = null;
export function showHomeScreenHint(): void {
  if (hintEl) return;
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const chromeIos = /CriOS/.test(navigator.userAgent);
  const steps = ios
    ? chromeIos
      ? 'Chrome menüsündeki <b>Paylaş</b> ⤴ → <b>Ana Ekrana Ekle</b>'
      : 'Alttaki <b>Paylaş</b> ⤴ → <b>Ana Ekrana Ekle</b>'
    : 'Tarayıcı menüsü ⋮ → <b>Ana ekrana ekle</b> / <b>Uygulamayı yükle</b>';
  const el = document.createElement('div');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Tam ekran');
  el.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.72);font-family:Barlow,system-ui,sans-serif';
  el.innerHTML = `
    <div style="max-width:420px;background:#10141a;border:1px solid rgba(226,59,47,.5);border-radius:14px;padding:16px 18px;color:#f3f5f7;line-height:1.45;box-shadow:0 10px 40px rgba(0,0,0,.6)">
      <div style="font:700 18px Rajdhani,system-ui,sans-serif;letter-spacing:.04em;margin-bottom:6px;color:#e23b2f">TAM EKRAN</div>
      <div style="font-size:14px;color:#cfd5dc">${
        ios
          ? 'iPhone tarayıcıları (Safari ve Chrome) sayfaların adres çubuğunu gizlemesine izin vermiyor.'
          : 'Bu tarayıcı tam ekrana izin vermedi.'
      } Oyunu ana ekrana eklersen <b>adres çubuğu olmadan</b>, uygulama gibi açılır:</div>
      <div style="margin:10px 0 12px;font-size:15px">${steps}</div>
      <div style="font-size:12px;color:#9aa3ad">Sonra oyunu ana ekrandaki COOMBIE simgesinden aç.</div>
      <button type="button" style="margin-top:12px;width:100%;height:40px;border:0;border-radius:10px;background:#e23b2f;color:#fff;font:700 15px Rajdhani,system-ui,sans-serif;letter-spacing:.05em">TAMAM</button>
    </div>`;
  const close = () => {
    el.remove();
    hintEl = null;
  };
  el.addEventListener('click', (e) => {
    if (e.target === el || (e.target as HTMLElement).tagName === 'BUTTON') close();
  });
  document.body.appendChild(el);
  hintEl = el;
}
