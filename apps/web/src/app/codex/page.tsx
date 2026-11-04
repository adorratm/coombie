import Link from 'next/link';
import {
  ELITE_SUPER_INTERVAL,
  HORDE_INTERVAL,
  ZOMBIES,
  waveKindForLevel,
} from '@protocol-z/shared';

export default function CodexPage() {
  const samples = [1, 5, 10, 15, 20].map((level) => ({
    level,
    kind: waveKindForLevel(level),
  }));

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'var(--surface)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 16 }}>
        <Link href="/" className="label-caps" style={{ color: 'var(--muted)' }}>
          ← PROTOCOL-Z
        </Link>
        <h1 className="tactical-title" style={{ margin: 0, fontSize: '1.75rem' }}>
          Zombi Ansiklopedisi & Dalga İstihbaratı
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <article className="panel" style={{ padding: 16 }}>
            <div className="label-caps" style={{ color: 'var(--phosphor)' }}>
              Her {ELITE_SUPER_INTERVAL} level
            </div>
            <h2 style={{ fontFamily: 'Chivo, sans-serif', margin: '8px 0' }}>
              Elite Superpower Zombie
            </h2>
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              Mutasyonlu alfa önder. Özel güç pool&apos;undan yeni süperpower.
            </p>
          </article>
          <article className="panel" style={{ padding: 16, borderColor: 'rgba(255,87,34,0.4)' }}>
            <div className="label-caps" style={{ color: 'var(--urgent)' }}>
              Her {HORDE_INTERVAL} level
            </div>
            <h2 style={{ fontFamily: 'Chivo, sans-serif', margin: '8px 0' }}>Horde Attack</h2>
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              Çok girişli kıyamet sürüsü. Kısa süreli hat savunması.
            </p>
          </article>
        </div>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {ZOMBIES.map((z) => (
            <article key={z.id} className="panel" style={{ padding: 14 }}>
              <div className="label-caps" style={{ color: 'var(--phosphor)' }}>
                {z.id}
              </div>
              <div style={{ fontFamily: 'Chivo, sans-serif', fontWeight: 800 }}>{z.name}</div>
              <div style={{ fontSize: 13, color: 'var(--on-surface)', marginTop: 8 }}>
                HP {z.hp} · ARM {z.armor} · SPD {z.moveSpeed}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>SPECIAL: {z.special}</div>
            </article>
          ))}
        </section>

        <section className="panel" style={{ padding: 14 }}>
          <div className="label-caps" style={{ marginBottom: 8, color: 'var(--muted)' }}>
            Dalga örnekleri
          </div>
          {samples.map((s) => (
            <div key={s.level} style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
              <span className="label-caps">LVL {s.level}</span>
              <span className="label-caps" style={{ color: 'var(--phosphor)' }}>
                {s.kind}
              </span>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
