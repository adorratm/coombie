'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  OPERATIVES,
  powerUpPickCount,
  rollPowerUpChoices,
  type OperativeId,
  type PowerUpDef,
} from '@protocol-z/shared';

export default function LevelUpPage() {
  const [mode] = useState<'solo' | 'coop'>('solo');
  const squadSize = 4;
  const picksTotal = powerUpPickCount(mode, squadSize);
  const [picksLeft, setPicksLeft] = useState(picksTotal);
  const [choices, setChoices] = useState<PowerUpDef[]>(() => rollPowerUpChoices(3));
  const [target, setTarget] = useState<OperativeId>('ironclad');
  const [log, setLog] = useState<string[]>([]);

  const squad = useMemo(() => OPERATIVES.slice(0, squadSize), []);

  function pick(card: PowerUpDef) {
    if (picksLeft <= 0) return;
    setLog((l) => [
      `${card.name} → ${target.toUpperCase()}`,
      ...l,
    ].slice(0, 8));
    const next = picksLeft - 1;
    setPicksLeft(next);
    if (next > 0) setChoices(rollPowerUpChoices(3));
  }

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'var(--surface)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 16 }}>
        <Link href="/arena" className="label-caps" style={{ color: 'var(--muted)' }}>
          ← Arena
        </Link>
        <h1 className="tactical-title" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', margin: 0 }}>
          Seviye Atlama Protokolü // Level 10
        </h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          Solo: {picksTotal} seçim hakkı (squad={squadSize}). Her seçimde 3 karttan 1 ve hedef karakter.
        </p>

        <div className="panel" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="label-caps" style={{ color: 'var(--phosphor)' }}>
            {picksLeft} / {picksTotal} hak kaldı
          </span>
          {squad.map((op) => (
            <button
              key={op.id}
              className={target === op.id ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setTarget(op.id)}
            >
              {op.codename}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {choices.map((card) => (
            <button
              key={card.id}
              className="panel panel-active"
              style={{ textAlign: 'left', padding: 18, color: 'inherit' }}
              disabled={picksLeft <= 0}
              onClick={() => pick(card)}
            >
              <div className="label-caps" style={{ color: 'var(--warning)' }}>
                {card.rarity}
              </div>
              <div style={{ fontFamily: 'Chivo, sans-serif', fontWeight: 800, marginTop: 6 }}>
                {card.name}
              </div>
              <p style={{ color: 'var(--on-surface)', fontSize: 14 }}>{card.description}</p>
            </button>
          ))}
        </div>

        <section className="panel" style={{ padding: 14 }}>
          <div className="label-caps" style={{ color: 'var(--muted)', marginBottom: 8 }}>
            Atama Logu
          </div>
          {log.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>Henüz seçim yok.</div>
          ) : (
            log.map((line) => (
              <div key={line} className="label-caps" style={{ color: 'var(--phosphor)', marginBottom: 4 }}>
                {line}
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
