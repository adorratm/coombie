/**
 * Dracord oyun platformu doğrulaması.
 * Oyun Dracord içinde açıldığında istemci kısa ömürlü bir launch token alır;
 * kimliğe ASLA istemcide güvenilmez — token burada Dracord API'sine doğrulatılır.
 *
 * Env:
 *   DRACORD_GAME_SECRET  geliştirici portalındaki oyun anahtarı (yalnız sunucuda)
 *   DRACORD_API_URL      varsayılan https://api.dracord.com.tr
 */
export interface DracordClaims {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  gameId: string;
  sessionId: string;
  guildId: string;
  channelId: string;
  participantIds: string[];
  testMode: boolean;
  exp: number;
}

export function dracordEnabled(): boolean {
  return Boolean(process.env.DRACORD_GAME_SECRET);
}

export async function verifyDracordToken(token: string): Promise<DracordClaims> {
  const secret = process.env.DRACORD_GAME_SECRET;
  if (!secret) throw new Error('DRACORD_DISABLED');
  if (!token || typeof token !== 'string' || token.length > 4096) throw new Error('DRACORD_BAD_TOKEN');
  const base = (process.env.DRACORD_API_URL ?? 'https://api.dracord.com.tr').replace(/\/$/, '');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}/v1/games/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Game ${secret}` },
      body: JSON.stringify({ token }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(res.status === 401 ? 'DRACORD_UNAUTHORIZED' : `DRACORD_VERIFY_${res.status}`);
    return (await res.json()) as DracordClaims;
  } finally {
    clearTimeout(t);
  }
}

export { dracordRoomCode } from '@protocol-z/shared';
