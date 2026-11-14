import type { CSSProperties } from 'react';
import { BOSSES, DRACORD_URL, GAME_URL, MAPS, MODES, OPERATIVES } from './_landing/data';
import s from './_landing/landing.module.css';

const tint = (color: string) => ({ '--c': color }) as CSSProperties;

export default function HomePage() {
  return (
    <div className={s.page}>
      <header className={s.top}>
        <div className={s.wrap}>
          <a className={s.mark} href="#">COOMBIE</a>
          <nav aria-label="Sayfa içi">
            <a href="#operatorler">Operatörler</a>
            <a href="#modlar">Modlar</a>
            <a href="#haritalar">Haritalar</a>
            <a href="#coop">Co-op</a>
          </nav>
        </div>
      </header>

      <main>
        <div className={s.hero}>
          <div className={s.wrap}>
            <p className={s.kicker}>Protocol-Z · co-op hayatta kalma</p>
            <h1>COOM<span>BIE</span></h1>
            <p className={s.lead}>Sürü her dakika büyüyor. Timini kur, operatörünü seç, 8 kişiye kadar aynı haritada ayakta kalmaya çalış.</p>
            <div className={s.cta}>
              <a className={`${s.btn} ${s.go}`} href={GAME_URL}>Hemen oyna</a>
              <a className={s.btn} href="#coop">Arkadaşlarınla oyna</a>
            </div>
            <p className={s.note}>Tarayıcıda açılır. İndirme ve hesap gerekmez.</p>
          </div>
        </div>

        <div className={s.facts}>
          <ul className={s.wrap}>
            <li><b>{OPERATIVES.length}</b><span>Operatör</span></li>
            <li><b>{MAPS.length}</b><span>Harita</span></li>
            <li><b>{MODES.length}</b><span>Oyun modu</span></li>
            <li><b>1–8</b><span>Oyuncu</span></li>
          </ul>
        </div>

        <section id="operatorler" className={s.section}>
          <div className={s.wrap}>
            <p className={s.kicker}>Tim</p>
            <h2>Sekiz operatör, sekiz ayrı oyun</h2>
            <p className={s.sub}>Her birinin kendi başlangıç silahı, üç yeteneği ve H tuşuyla telsizden çağırdığı bir desteği var.</p>
            <div className={s.ops}>
              {OPERATIVES.map((op) => (
                <article key={op.name} className={s.op} style={tint(op.color)}>
                  <div>
                    <h3>{op.name}</h3>
                    <span className={s.role}>{op.role}</span>
                  </div>
                  <dl>
                    <div><dt>Silah</dt><dd>{op.weapon}</dd></div>
                    <div><dt>H desteği</dt><dd>{op.support}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="modlar" className={s.section}>
          <div className={s.wrap}>
            <p className={s.kicker}>Görevler</p>
            <h2>{MODES.length} mod, her haritada</h2>
            <div className={s.modes}>
              {MODES.map((m) => (
                <div key={m.name} className={s.mode}>
                  <i aria-hidden="true">{m.icon}</i>
                  <h3>{m.name}{m.isNew && <span className={s.new}>Yeni</span>}</h3>
                  <p>{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="haritalar" className={s.section}>
          <div className={s.wrap}>
            <p className={s.kicker}>Sahalar</p>
            <h2>{MAPS.length} harita</h2>
            <div className={s.maps}>
              {MAPS.map((m) => (
                <div key={m.id} className={s.map} style={{ backgroundImage: `url(/ui/maps/${m.id}.jpg)` }}>
                  <div><b>{m.name}</b><span>{m.mood}</span></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="bosslar" className={s.section}>
          <div className={s.wrap}>
            <p className={s.kicker}>Tehdit</p>
            <h2>{BOSSES.length} boss, art arda aynısı gelmez</h2>
            <div className={s.bosses}>
              {BOSSES.map((b) => (
                <div key={b.name} className={s.boss} style={tint(b.color)}>
                  <h3>{b.name}</h3>
                  <p>{b.desc}</p>
                  <em>{b.wave}. dalga</em>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="coop" className={s.section}>
          <div className={`${s.wrap} ${s.coop}`}>
            <div>
              <p className={s.kicker}>Co-op</p>
              <h2>8 kişiye kadar, tek kodla</h2>
              <ol>
                <li><div><b>Oda kur</b><span>Lobide CO-OP&apos;a bas, oda kodunu al.</span></div></li>
                <li><div><b>Kodu paylaş</b><span>Arkadaşların aynı sayfadan kodu girip katılır.</span></div></li>
                <li><div><b>Hazır ol, başlat</b><span>Herkes operatörünü seçer, oda sahibi görevi başlatır.</span></div></li>
              </ol>
            </div>
            <aside>
              <h3>Dracord içinde oyna</h3>
              <p>Oyunu Dracord&apos;daki bir oyun kanalından açarsan o kanaldaki herkes aynı odaya düşer, kod gerekmez. Masaüstü, web ve mobilde çalışır.</p>
              <a className={s.btn} href={DRACORD_URL} rel="noopener">Dracord&apos;a git</a>
            </aside>
          </div>
        </section>

        <section className={`${s.section} ${s.end}`}>
          <div className={s.wrap}>
            <h2>Sürü bekliyor</h2>
            <a className={`${s.btn} ${s.go}`} href={GAME_URL}>Hemen oyna</a>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.wrap}>
          <span>COOMBIE · Protocol-Z</span>
          <span>Bir <a href={DRACORD_URL} rel="noopener">Dracord</a> oyunu · <a href="/codex">Zombi ansiklopedisi</a></span>
        </div>
      </footer>
    </div>
  );
}
