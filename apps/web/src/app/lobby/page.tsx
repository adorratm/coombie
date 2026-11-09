'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ClientEvents,
  OPERATIVES,
  type GameMode,
  type OperativeId,
} from '@protocol-z/shared';
import { useDracord, useDracordLobby } from '../../lib/useDracord';

export default function LobbyPage() {
  const [mode, setMode] = useState<GameMode>('coop');
  const [selected, setSelected] = useState<OperativeId[]>(['ironclad']);
  const [localRoomCode] = useState('ALPHA-9481');
  const [fillBots, setFillBots] = useState(true);
  const dracord = useDracord();
  const dl = useDracordLobby(dracord);
  const inDracord = dracord.status === 'ready';
  const roomCode = inDracord ? dracord.roomCode : localRoomCode;
  const me = dl.lobby?.players.find((p) => p.playerId === dl.you) ?? null;
  const takenByOthers = new Set(
    (dl.lobby?.players ?? []).filter((p) => p.playerId !== dl.you).map((p) => p.operativeId),
  );

  const slots = useMemo(() => {
    if (mode === 'solo') return selected;
    return selected.slice(0, 1);
  }, [mode, selected]);

  function toggleOperative(id: OperativeId) {
    if (inDracord) {
      if (takenByOthers.has(id)) return;
      setSelected([id]);
      dl.socket?.emit(ClientEvents.LobbySelectOperative, { operativeId: id });
      return;
    }
    if (mode === 'coop') {
      setSelected([id]);
      return;
    }
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 8) return prev;
      return [...prev, id];
    });
  }

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'var(--surface)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 16 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <Link href="/" className="label-caps" style={{ color: 'var(--muted)' }}>
              ← PROTOCOL-Z
            </Link>
            <h1 className="tactical-title" style={{ margin: '8px 0 0', fontSize: '1.75rem' }}>
              Lobi & Karakter Seçimi
            </h1>
          </div>
          <div className="panel" style={{ padding: '10px 14px' }}>
            <div className="label-caps" style={{ color: 'var(--muted)' }}>Oda Kodu</div>
            <div className="tactical-title" style={{ color: 'var(--phosphor)', fontSize: '1.25rem' }}>
              {roomCode}
            </div>
          </div>
        </header>

        {dracord.status !== 'standalone' && (
          <div className="panel" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <div className="label-caps" style={{ color: 'var(--phosphor)' }}>
              DRACORD
              {dracord.status === 'ready' && dracord.ctx.testMode ? ' // TEST MODU' : ''}
            </div>
            {dracord.status === 'connecting' && <div>Dracord'a bağlanılıyor…</div>}
            {dracord.status === 'error' && <div style={{ color: 'var(--muted)' }}>Dracord: {dracord.message}</div>}
            {dracord.status === 'ready' && (
              <>
                <div>
                  Hoş geldin, <strong>{dracord.ctx.user.displayName || dracord.ctx.user.username}</strong> — ses
                  kanalındaki herkes bu odaya düşer.
                </div>
                {dl.error && (
                  <div style={{ color: 'var(--muted)' }}>
                    {dl.error === 'DRACORD_DISABLED'
                      ? 'Lobi sunucusunda Dracord anahtarı tanımlı değil (DRACORD_GAME_SECRET).'
                      : `Lobi: ${dl.error}`}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(dl.lobby?.players ?? []).map((p) => (
                    <span key={p.playerId} className={p.isReady ? 'panel panel-active' : 'panel'} style={{ padding: '4px 10px' }}>
                      {p.displayName} · {p.operativeId}
                      {p.playerId === dl.lobby?.hostPlayerId ? ' ★' : ''}
                      {p.isReady ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
                {me && (
                  <button
                    className={me.isReady ? 'btn-primary' : 'btn-ghost'}
                    style={{ justifySelf: 'start' }}
                    onClick={() => dl.socket?.emit(ClientEvents.LobbySetReady, { isReady: !me.isReady })}
                  >
                    {me.isReady ? 'Hazırım ✓' : 'Hazır ol'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ display: inDracord ? 'none' : 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={mode === 'solo' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setMode('solo')}
          >
            Tek Kişilik
          </button>
          <button
            className={mode === 'coop' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => {
              setMode('coop');
              setSelected((s) => s.slice(0, 1));
            }}
          >
            2–8 Co-op
          </button>
          {mode === 'solo' && (
            <button className="btn-ghost" onClick={() => setFillBots((v) => !v)}>
              Bot doldur: {fillBots ? 'AÇIK' : 'KAPALI'}
            </button>
          )}
        </div>

        <p className="label-caps" style={{ color: 'var(--on-surface-variant)' }}>
          {mode === 'solo'
            ? `Solo fireteam: ${selected.length}/8 — kurtarma ile 8 tüfeğe kadar genişler`
            : 'Co-op: en fazla 8 operatör; EXP ve power-up bireysel'}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {OPERATIVES.map((op) => {
            const active = inDracord && me ? me.operativeId === op.id : selected.includes(op.id);
            const taken = inDracord && takenByOthers.has(op.id);
            return (
              <button
                key={op.id}
                onClick={() => toggleOperative(op.id)}
                className={active ? 'panel panel-active' : 'panel'}
                disabled={taken}
                style={{ textAlign: 'left', padding: 14, color: 'inherit', opacity: taken ? 0.45 : 1 }}
              >
                <div className="label-caps" style={{ color: 'var(--phosphor)' }}>
                  {op.codename} // {op.gender}
                </div>
                <div style={{ fontFamily: 'Chivo, sans-serif', fontWeight: 800, marginTop: 4 }}>
                  {op.displayName}
                </div>
                <div style={{ fontSize: 13, marginTop: 8, color: 'var(--on-surface)' }}>
                  AKTİF: {op.activeAbility}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>PASİF: {op.passive}</div>
                <div className="label-caps" style={{ marginTop: 10, color: active ? 'var(--phosphor)' : 'var(--muted)' }}>
                  {active ? 'SEÇİLDİ' : taken ? 'ALINDI' : 'HAZIRDA'}
                </div>
              </button>
            );
          })}
        </div>

        <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div className="panel" style={{ padding: 12 }}>
            <span className="label-caps" style={{ color: 'var(--muted)' }}>Squad slotları: </span>
            <strong>{slots.length}</strong>
          </div>
          <Link className="btn-primary" href="/arena">
            Operasyonu Başlat
          </Link>
        </footer>
      </div>
    </main>
  );
}
