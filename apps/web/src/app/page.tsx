import Link from 'next/link';
import { GAME_NAME, GAME_TAGLINE, OPERATIVES } from '@protocol-z/shared';

export default function HomePage() {
  const males = OPERATIVES.filter((o) => o.gender === 'male').length;
  const females = OPERATIVES.filter((o) => o.gender === 'female').length;

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem',
        background:
          'radial-gradient(ellipse at top, #142820 0%, #090d10 55%, #05070a 100%)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <p className="label-caps" style={{ color: 'var(--phosphor)', marginBottom: 8 }}>
          {GAME_TAGLINE}
        </p>
        <h1 className="tactical-title" style={{ fontSize: 'clamp(2.5rem, 8vw, 4.5rem)', margin: 0 }}>
          {GAME_NAME}
        </h1>
        <p style={{ color: 'var(--muted)', maxWidth: 560, marginTop: 12 }}>
          Co-op survival zombie defense. 1–4 oyuncu, 8 operatör, dalga elitleri ve Horde
          Attack. Web / mobil / Electron — tek WebGL istemci.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
          <Link className="btn-primary" href="/lobby">
            Lobiye Gir
          </Link>
          <Link className="btn-ghost" href="/arena">
            Arena Preview
          </Link>
          <Link className="btn-ghost" href="/codex">
            Zombi Ansiklopedisi
          </Link>
        </div>

        <section
          className="panel"
          style={{ marginTop: 40, padding: 20, display: 'grid', gap: 12 }}
        >
          <span className="label-caps" style={{ color: 'var(--on-surface-variant)' }}>
            Operatör Kadrosu // {males}M / {females}F
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {OPERATIVES.map((op) => (
              <article key={op.id} className="panel" style={{ padding: 14 }}>
                <div className="label-caps" style={{ color: 'var(--phosphor)' }}>
                  {op.codename}
                </div>
                <div style={{ fontFamily: 'Chivo, sans-serif', fontWeight: 800 }}>
                  {op.displayName}
                </div>
                <div className="label-caps" style={{ color: 'var(--muted)', marginTop: 8 }}>
                  {op.role} · {op.gender}
                </div>
                <div style={{ fontSize: 13, color: 'var(--on-surface)', marginTop: 6 }}>
                  AKTİF: {op.activeAbility}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
