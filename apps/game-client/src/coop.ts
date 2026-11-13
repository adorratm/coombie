import { io, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  SOCKET_NS,
  ServerEvents,
  type LobbyStatePayload,
  type MatchMission,
  type MatchStartPayload,
} from '@protocol-z/shared';
import { NetSession, type NetTransport } from './netSession';
import { currentMission, loadProfile } from './loadout';
import { rosterById } from './roster';
import { DracordEmbed } from './dracord-embed';

/**
 * Co-op lobby panel (1–8 players): create a room or join by code, ready up, host starts.
 * On start every player gets a ticket, opens the /match socket and the run begins with a
 * NetSession — the host's client runs the world, the server only relays.
 */
export interface CoopStart {
  session: NetSession;
  /** the host's mission; guests must load the same map */
  mission: MatchMission | undefined;
  /** call when the run is over / abandoned */
  leave: () => void;
}

const NAME_KEY = 'coombie:coop-name';

export function coopServerUrl(): string {
  const q = new URLSearchParams(location.search).get('api');
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_URL;
  if (q && /^https?:\/\//.test(q)) return q.replace(/\/$/, '');
  if (env) return env.replace(/\/$/, '');
  // vite dev server → the API next to it; otherwise the game is served by the API itself (same origin)
  return location.port === '5173' ? `${location.protocol}//${location.hostname}:3001` : location.origin;
}

const ERR: Record<string, string> = {
  ROOM_NOT_FOUND: 'Oda bulunamadı. Kodu kontrol et.',
  ROOM_FULL: 'Oda dolu (8 kişi).',
  SOLO_ROOM: 'Bu oda tek kişilik.',
  OPERATIVE_TAKEN: 'Bu operatörü başkası seçmiş — lobiden başka bir operatör seç.',
  NOT_READY: 'Herkes hazır olmalı (en az 2 oyuncu).',
  NOT_HOST: 'Oyunu yalnız oda sahibi başlatabilir.',
  NOT_IN_ROOM: 'Odada değilsin.',
  DRACORD_DISABLED: 'Bu sunucuda Dracord girişi kapalı (oyun anahtarı tanımlı değil).',
  DRACORD_BAD_TOKEN: 'Dracord oturumu doğrulanamadı.',
  DRACORD_UNAUTHORIZED: 'Dracord oyun anahtarı geçersiz.',
};

/** extra Dracord origins allowed to host the game (self-hosted / staging), comma separated */
function dracordHostOrigins(): string[] {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_DRACORD_HOST_ORIGINS ?? '';
  return env.split(',').map((s) => s.trim()).filter(Boolean);
}

const CSS = `
.coop-back{position:fixed;inset:0;z-index:60;background:rgba(4,6,9,.78);display:none;align-items:center;justify-content:center;font-family:var(--font,Barlow,sans-serif)}
.coop-back.on{display:flex}
.coop{width:min(560px,94vw);max-height:92vh;overflow:auto;background:var(--panel-solid,#10141a);border:1px solid var(--line-strong,rgba(220,230,240,.32));padding:22px 24px;color:var(--text,#f3f5f7)}
.coop h2{font-family:var(--display,Rajdhani,sans-serif);font-size:26px;letter-spacing:.12em;margin:0 0 4px}
.coop p{margin:0 0 14px;color:var(--dim,#9aa3ad);font-size:14px;line-height:1.45}
.coop label{display:block;font-size:11px;letter-spacing:.14em;color:var(--dim,#9aa3ad);margin:12px 0 5px}
.coop input{width:100%;box-sizing:border-box;height:42px;padding:0 12px;background:#0a0d11;border:1px solid var(--line,rgba(220,230,240,.16));color:inherit;font:600 16px var(--font,Barlow,sans-serif);outline:none}
.coop input:focus-visible{border-color:var(--ok,#5ad46a)}
.coop .row{display:flex;gap:10px;align-items:stretch}
.coop button{height:42px;padding:0 16px;border:1px solid var(--line-strong,rgba(220,230,240,.32));background:transparent;color:inherit;font:700 14px var(--display,Rajdhani,sans-serif);letter-spacing:.12em;cursor:pointer;white-space:nowrap}
.coop button:hover:not(:disabled){background:rgba(255,255,255,.06)}
.coop button:disabled{opacity:.4;cursor:not-allowed}
.coop button.go{background:var(--ok,#5ad46a);border-color:var(--ok,#5ad46a);color:#06110a}
.coop button.go:hover:not(:disabled){filter:brightness(1.1);background:var(--ok,#5ad46a)}
.coop .code{font:700 30px var(--display,Rajdhani,sans-serif);letter-spacing:.2em;color:var(--gold,#e8b84a)}
.coop ul{list-style:none;margin:12px 0;padding:0;border:1px solid var(--line,rgba(220,230,240,.16))}
.coop li{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line,rgba(220,230,240,.16));font-size:15px}
.coop li:last-child{border-bottom:0}
.coop li b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.coop li small{color:var(--dim,#9aa3ad);letter-spacing:.08em}
.coop .tag{font-size:11px;letter-spacing:.12em;padding:2px 7px;border:1px solid currentColor}
.coop .tag.ok{color:var(--ok,#5ad46a)} .coop .tag.wait{color:var(--dim,#9aa3ad)} .coop .tag.host{color:var(--gold,#e8b84a)}
.coop .err{color:var(--danger,#d6453d);min-height:20px;font-size:14px;margin-top:8px}
.coop .foot{display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
`;

export interface CoopPanel {
  open: () => void;
  close: () => void;
  /** in a room right now? (the solo start button should not start a run then) */
  inRoom: () => boolean;
}

export function createCoopPanel(onStart: (start: CoopStart) => void): CoopPanel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const back = document.createElement('div');
  back.className = 'coop-back';
  back.innerHTML = `<div class="coop" role="dialog" aria-modal="true" aria-labelledby="coopTitle"></div>`;
  document.body.appendChild(back);
  const box = back.firstElementChild as HTMLElement;

  let lobby: Socket | null = null;
  let state: LobbyStatePayload | null = null;
  let me = '';
  let error = '';
  let busy = false;
  let starting = false;
  /**
   * Inside Dracord (iframe / mobile WebView): no room codes — identity comes from Dracord and
   * everyone in the same voice-channel session lands in the same room automatically.
   */
  const dracord = DracordEmbed.isEmbedded() ? new DracordEmbed({ allowedHostOrigins: dracordHostOrigins() }) : null;

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const myName = () => (localStorage.getItem(NAME_KEY) || 'Operatör').slice(0, 24);

  const connect = (): Promise<Socket> =>
    new Promise((resolve, reject) => {
      if (lobby?.connected) return resolve(lobby);
      lobby?.close();
      const s = io(`${coopServerUrl()}${SOCKET_NS.lobby}`, { transports: ['websocket'], reconnectionAttempts: dracord ? Infinity : 3 });
      const timer = setTimeout(() => reject(new Error('Sunucuya bağlanılamadı.')), 7000);
      s.on('connect', () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.on('connect_error', () => {
        clearTimeout(timer);
        reject(new Error('Sunucuya bağlanılamadı.'));
      });
      s.on(ServerEvents.LobbyState, (st: LobbyStatePayload) => {
        state = st;
        render();
      });
      s.on(ServerEvents.LobbyError, (e: { message?: string }) => {
        error = ERR[e?.message ?? ''] ?? 'Bir hata oluştu.';
        busy = false;
        render();
      });
      s.on(ServerEvents.MatchStart, (p: MatchStartPayload) => void beginMatch(p));
      s.on('disconnect', () => {
        if (starting) return;
        state = null;
        error = 'Sunucu bağlantısı koptu.';
        render();
      });
      // Dracord: the room is tied to the session, so simply walk back in after a reconnect
      s.io.on('reconnect', () => {
        if (dracord) void enterDracord();
      });
      lobby = s;
    });

  const ack = <T>(event: string, body: unknown): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Sunucu yanıt vermedi.')), 7000);
      lobby!.emit(event, body, (res: T & { error?: string }) => {
        clearTimeout(timer);
        if (res && typeof res === 'object' && res.error) reject(new Error(ERR[res.error] ?? res.error));
        else resolve(res);
      });
    });

  /** tell the room which operative the profile currently has selected */
  const syncOperative = async () => {
    const hero = loadProfile().hero;
    const mine = state?.players.find((p) => p.playerId === me);
    if (!mine || mine.operativeId === hero) return;
    state = await ack<LobbyStatePayload>(ClientEvents.LobbySelectOperative, { operativeId: hero });
  };

  const enter = async (fn: () => Promise<LobbyStatePayload>) => {
    busy = true;
    error = '';
    render();
    try {
      await connect();
      me = '';
      state = await fn();
      // the server names us by socket: we are the newest entry we do not know yet
      me = (state as LobbyStatePayload & { you?: string }).you ?? state.players[state.players.length - 1]!.playerId;
      await syncOperative().catch((e: Error) => {
        error = e.message;
      });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Bağlanılamadı.';
    }
    busy = false;
    render();
  };

  const enterDracord = async () => {
    if (!dracord) return;
    busy = true;
    error = '';
    render();
    try {
      const ctx = await dracord.ready();
      await connect();
      const res = await ack<LobbyStatePayload & { you: string }>(ClientEvents.LobbyDracord, { token: dracord.context?.token ?? ctx.token });
      state = res;
      me = res.you;
      await syncOperative().catch((e: Error) => {
        error = e.message;
      });
    } catch (e) {
      error = e instanceof Error ? (ERR[e.message] ?? e.message) : 'Dracord bağlantısı kurulamadı.';
    }
    busy = false;
    render();
  };
  // a refreshed launch token re-authenticates the same socket (the old one expires)
  dracord?.onTokenRefresh(({ token }) => {
    if (lobby?.connected && state) void ack(ClientEvents.LobbyDracord, { token }).catch(() => undefined);
  });

  const leaveRoom = () => {
    lobby?.close();
    lobby = null;
    state = null;
    error = '';
    render();
  };

  const beginMatch = async (p: MatchStartPayload) => {
    if (starting) return;
    starting = true;
    error = '';
    render();
    const sock = io(`${coopServerUrl()}${SOCKET_NS.match}`, { transports: ['websocket'] });
    const transport: NetTransport = {
      emit: (event, payload, ack) => void (ack ? sock.emit(event, payload, ack) : sock.emit(event, payload)),
      on: (event, handler) => void sock.on(event, handler as (...args: unknown[]) => void),
      off: (event, handler) => void sock.off(event, handler as (...args: unknown[]) => void),
    };
    const session = new NetSession(transport);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Maç sunucusuna bağlanılamadı.')), 7000);
        sock.on('connect', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      await session.join(p.ticket);
      back.classList.remove('on');
      onStart({
        session,
        mission: p.mission,
        leave: () => {
          session.dispose();
          sock.close();
        },
      });
    } catch (e) {
      session.dispose();
      sock.close();
      error = e instanceof Error ? e.message : 'Maç başlatılamadı.';
    }
    starting = false;
    render();
  };

  function render() {
    const inRoom = !!state;
    if (!inRoom && dracord) {
      box.innerHTML = `
        <h2 id="coopTitle">DRACORD ODASI</h2>
        <p>Ses kanalındaki herkes aynı odaya girer; kod gerekmez.</p>
        <div class="err" role="alert">${esc(busy ? '' : error)}</div>
        <div class="foot"><button id="coopClose">KAPAT</button><button id="coopRetry" class="go" ${busy ? 'disabled' : ''}>${busy ? 'BAĞLANIYOR…' : 'TEKRAR DENE'}</button></div>`;
      box.querySelector('#coopClose')!.addEventListener('click', () => back.classList.remove('on'));
      box.querySelector('#coopRetry')!.addEventListener('click', () => void enterDracord());
      return;
    }
    if (!inRoom) {
      box.innerHTML = `
        <h2 id="coopTitle">CO-OP</h2>
        <p>Arkadaşlarınla aynı görevde oyna (en fazla 8 kişi). Bir oda kur ve kodu paylaş ya da sana verilen kodla katıl. Operatörünü ve görevi lobiden seçersin; görevi oda sahibi belirler.</p>
        <label for="coopName">ADIN</label>
        <input id="coopName" maxlength="24" value="${esc(myName())}" autocomplete="nickname" />
        <label for="coopCode">ODA KODU</label>
        <div class="row"><input id="coopCode" placeholder="ALPHA-1234" maxlength="12" style="text-transform:uppercase" /><button id="coopJoin" ${busy ? 'disabled' : ''}>KATIL</button></div>
        <div class="err" role="alert">${esc(error)}</div>
        <div class="foot"><button id="coopClose">KAPAT</button><button id="coopCreate" class="go" ${busy ? 'disabled' : ''}>${busy ? 'BAĞLANIYOR…' : 'ODA KUR'}</button></div>`;
      const name = box.querySelector<HTMLInputElement>('#coopName')!;
      name.addEventListener('change', () => localStorage.setItem(NAME_KEY, name.value.trim().slice(0, 24) || 'Operatör'));
      const saveName = () => localStorage.setItem(NAME_KEY, name.value.trim().slice(0, 24) || 'Operatör');
      box.querySelector('#coopCreate')!.addEventListener('click', () => {
        saveName();
        void enter(async () => {
          return ack<LobbyStatePayload>(ClientEvents.LobbyCreate, { mode: 'coop', fillBots: false, displayName: myName() });
        });
      });
      box.querySelector('#coopJoin')!.addEventListener('click', () => {
        saveName();
        const code = box.querySelector<HTMLInputElement>('#coopCode')!.value.trim().toUpperCase();
        if (!code) {
          error = 'Oda kodunu yaz.';
          return render();
        }
        void enter(() => ack<LobbyStatePayload>(ClientEvents.LobbyJoin, { roomCode: code, displayName: myName() }));
      });
      box.querySelector('#coopClose')!.addEventListener('click', () => back.classList.remove('on'));
      return;
    }
    const st = state!;
    const mine = st.players.find((p) => p.playerId === me);
    const host = st.hostPlayerId === me;
    const allReady = st.players.length >= 2 && st.players.every((p) => p.isReady);
    const m = currentMission();
    box.innerHTML = `
      <h2 id="coopTitle">${dracord ? 'DRACORD ODASI' : `ODA <span class="code">${esc(st.roomCode)}</span>`}</h2>
      <p>${dracord ? 'Ses kanalındaki herkes bu odada. ' : ''}${host ? `${dracord ? '' : 'Kodu arkadaşlarına gönder. '}Görev senin lobide seçtiğin harita, mod ve zorlukla başlar.` : 'Görevi oda sahibi seçer. Operatörünü değiştirmek için bu pencereyi kapatıp lobiden seç, sonra geri gel.'}</p>
      <ul>${st.players
        .map((p) => {
          const def = rosterById(p.operativeId as Parameters<typeof rosterById>[0]);
          return `<li><b>${esc(p.displayName)}${p.playerId === me ? ' (sen)' : ''}</b><small>${esc(def?.name ?? p.operativeId)}</small>${p.playerId === st.hostPlayerId ? '<span class="tag host">ODA SAHİBİ</span>' : ''}<span class="tag ${p.isReady ? 'ok' : 'wait'}">${p.isReady ? 'HAZIR' : 'BEKLİYOR'}</span></li>`;
        })
        .join('')}</ul>
      <p>${st.players.length}/8 oyuncu${host ? ` · Görev: ${esc(m.map)} · ${esc(m.mode)} · ${esc(m.difficulty)}` : ''}</p>
      <div class="err" role="alert">${esc(starting ? '' : error)}</div>
      <div class="foot">
        ${dracord ? '' : '<button id="coopLeave">ODADAN ÇIK</button>'}
        <button id="coopHide">LOBİYE DÖN</button>
        <button id="coopReady" ${starting ? 'disabled' : ''}>${mine?.isReady ? 'HAZIR DEĞİLİM' : 'HAZIRIM'}</button>
        ${host ? `<button id="coopStart" class="go" ${allReady && !starting ? '' : 'disabled'}>${starting ? 'BAŞLIYOR…' : 'BAŞLAT'}</button>` : ''}
      </div>`;
    box.querySelector('#coopLeave')?.addEventListener('click', leaveRoom);
    box.querySelector('#coopHide')!.addEventListener('click', () => back.classList.remove('on'));
    box.querySelector('#coopReady')!.addEventListener('click', () => {
      error = '';
      void syncOperative()
        .then(() => ack<LobbyStatePayload>(ClientEvents.LobbySetReady, { isReady: !mine?.isReady }))
        .then((s) => {
          state = s;
          render();
        })
        .catch((e: Error) => {
          error = e.message;
          render();
        });
    });
    box.querySelector('#coopStart')?.addEventListener('click', () => {
      error = '';
      void ack(ClientEvents.LobbyStart, { mission: currentMission() }).catch((e: Error) => {
        error = e.message;
        render();
      });
    });
  }

  render();
  if (dracord) {
    // opened from a Dracord voice channel: go straight to the shared room
    back.classList.add('on');
    void enterDracord();
  }
  return {
    open: () => {
      error = '';
      back.classList.add('on');
      if (state) void syncOperative().then(render, render);
      else render();
    },
    close: () => back.classList.remove('on'),
    inRoom: () => !!state,
  };
}
