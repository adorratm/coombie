'use client';

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  ClientEvents,
  SOCKET_NS,
  ServerEvents,
  dracordRoomCode,
  type LobbyStatePayload,
} from '@protocol-z/shared';
import { DracordEmbed, type InitPayload } from './dracord-embed';

/**
 * Dracord içinde çalışma (iframe / mobil WebView).
 * Dışarıda: status 'standalone' — oyun eskisi gibi çalışır.
 * İçeride: kimlik + ses kanalı oturumu; lobi sunucusuna token ile bağlanır
 * (sunucu POST /v1/games/verify ile doğrular, istemciye güvenmez).
 */
export type DracordState =
  | { status: 'standalone' }
  | { status: 'connecting' }
  | { status: 'ready'; ctx: InitPayload; roomCode: string }
  | { status: 'error'; message: string };

const STORE_KEY = 'pz:dracord';
let embed: DracordEmbed | null = null;
let readyP: Promise<InitPayload> | null = null;

function getEmbed(): DracordEmbed {
  if (!embed) {
    const extra = (process.env.NEXT_PUBLIC_DRACORD_HOST_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    embed = new DracordEmbed({ allowedHostOrigins: extra });
  }
  return embed;
}

export function isInDracord(): boolean {
  return DracordEmbed.isEmbedded();
}

/** Arena vb. sayfalar için son bilinen Dracord kimliği (görüntü amaçlı) */
export function storedDracordIdentity(): { displayName: string; roomCode: string } | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as { displayName: string; roomCode: string }) : null;
  } catch {
    return null;
  }
}

export function useDracord(): DracordState {
  const [state, setState] = useState<DracordState>({ status: 'standalone' });
  useEffect(() => {
    if (!isInDracord()) return;
    let alive = true;
    setState({ status: 'connecting' });
    readyP ??= getEmbed().ready();
    readyP
      .then((ctx) => {
        if (!alive) return;
        const roomCode = dracordRoomCode(ctx.session.id);
        try {
          sessionStorage.setItem(
            STORE_KEY,
            JSON.stringify({ displayName: ctx.user.displayName || ctx.user.username, roomCode }),
          );
        } catch {
          /* ignore */
        }
        setState({ status: 'ready', ctx, roomCode });
      })
      .catch((e) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/**
 * Dracord oturumuna bağlı lobiye bağlan. Token yenilenince yeniden doğrular.
 * Lobi sunucusunda DRACORD_GAME_SECRET tanımlı değilse `error: DRACORD_DISABLED` döner.
 */
export function useDracordLobby(dracord: DracordState): {
  lobby: LobbyStatePayload | null;
  you: string | null;
  error: string | null;
  socket: Socket | null;
} {
  const [lobby, setLobby] = useState<LobbyStatePayload | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const token = dracord.status === 'ready' ? dracord.ctx.token : null;

  useEffect(() => {
    if (!token) return;
    const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    const s = io(`${base}${SOCKET_NS.lobby}`, { transports: ['websocket'] });
    const auth = (t: string) =>
      s.emit(ClientEvents.LobbyDracord, { token: t }, (res: (LobbyStatePayload & { you?: string }) | { error: string }) => {
        if ('error' in res) setError(res.error);
        else {
          setError(null);
          setYou(res.you ?? null);
          setLobby(res);
        }
      });
    s.on('connect', () => auth(getEmbed().context?.token ?? token));
    s.on(ServerEvents.LobbyState, (p: LobbyStatePayload) => setLobby(p));
    s.on(ServerEvents.LobbyError, (p: { message: string }) => setError(p.message));
    s.on('connect_error', () => setError('Lobi sunucusuna bağlanılamadı'));
    const offToken = getEmbed().onTokenRefresh(({ token: t }) => {
      if (s.connected) auth(t);
    });
    setSocket(s);
    return () => {
      offToken();
      s.disconnect();
      setSocket(null);
    };
  }, [token]);

  return { lobby, you, error, socket };
}
