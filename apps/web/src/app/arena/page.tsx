'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  cardStatLines,
  createArena,
  rarityTierLabel,
  type ArenaHandle,
  type ArenaHudState,
  type UpgradeCardDef,
} from '@protocol-z/game-client';

const emptyMission = {
  chapterIndex: 1,
  chapterTitle: 'Karantina İhlali',
  chapterCodename: 'KARARLIK',
  brief: 'Reaktör önünü tut. İlk temas yaklaşıyor.',
  sectorId: 'core',
  sectorName: 'Reaktör Merkezi',
  sectorCode: 'Z-0',
  objectiveLabel: 'Dalgaları atlat',
  objectiveProgress: 0,
  objectiveTarget: 2,
  objectiveComplete: false,
  chapterCount: 6,
  banner: 'Bölüm 1: Karantina İhlali',
};

const emptyHud: ArenaHudState = {
  weapon: 'Assault Rifle',
  weaponId: 'rifle',
  className: 'Assaulter',
  abilityName: 'Kinetic Nova',
  abilityReady: true,
  abilityCooldown: 0,
  abilityMaxCooldown: 9,
  hp: 100,
  maxHp: 100,
  xp: 0,
  xpToLevel: 20,
  level: 1,
  kills: 0,
  wave: 1,
  combo: 0,
  alive: true,
  pausedForUpgrade: false,
  choices: [],
  unlockedWeapons: [],
  modsSummary: [],
  overdrive: false,
  pierceShots: 0,
  squad: [],
  rescue: [],
  runTimeSec: 0,
  inventory: [],
  scrap: 0,
  shield: 0,
  shieldMax: 0,
  skillPoints: 0,
  skills: [],
  showSkillTree: false,
  showInventory: false,
  raging: false,
  pickupRadius: 1.6,
  ammo: 30,
  magSize: 30,
  reloading: false,
  reloadProgress: 1,
  mission: emptyMission,
  maxSquad: 8,
  rerolls: 7,
  lockdowns: 2,
  banishes: 2,
  lockedChoiceIndex: null,
  moveSpeedMult: 1,
  xpMult: 1,
  armorFlat: 0,
  critChance: 0.12,
  dangerLevel: 1,
};

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
}

function initials(name: string, isYou: boolean): string {
  if (isYou) return 'SEN';
  return name.slice(0, 2).toUpperCase();
}

function gemLetter(card: UpgradeCardDef): string {
  return (card.icon ?? card.name.trim().charAt(0) ?? '?').toString().slice(0, 2).toUpperCase();
}

function tintFor(id: string): string {
  const l = id.toLowerCase();
  if (l.includes('shot') || l.includes('lmg')) return 'red';
  if (l.includes('sniper') || l.includes('smg')) return 'blue';
  if (l.includes('rifle')) return 'ok';
  return 'gold';
}

export default function ArenaPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const arenaRef = useRef<ArenaHandle | null>(null);
  const [hud, setHud] = useState<ArenaHudState>(emptyHud);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const arena = createArena(host);
    arenaRef.current = arena;

    let raf = 0;
    let lastHudMs = 0;
    let lastSig = '';
    const loop = (t: number) => {
      try {
        arena.animate(t);
        if (t - lastHudMs > 120) {
          lastHudMs = t;
          const next = arena.getHudState();
          const m = next.mission;
          const sig = [
            next.hp | 0,
            next.ammo,
            next.reloading ? 1 : 0,
            Math.round(next.reloadProgress * 20),
            next.level,
            next.kills,
            next.wave,
            next.alive ? 1 : 0,
            next.pausedForUpgrade ? 1 : 0,
            next.showSkillTree ? 1 : 0,
            next.showInventory ? 1 : 0,
            next.weapon,
            next.squad.map((s) => `${s.name}:${s.hp | 0}:${s.alive ? 1 : 0}`).join(','),
            Math.floor(next.runTimeSec),
            next.choices.map((c) => c.id).join(','),
            next.rerolls,
            next.lockdowns,
            next.banishes,
            next.lockedChoiceIndex ?? -1,
            m.sectorCode,
            m.objectiveProgress | 0,
            m.banner,
          ].join(';');
          if (sig !== lastSig) {
            lastSig = sig;
            setHud(next);
          }
        }
      } catch (err) {
        console.error('[arena] frame error', err);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => arena.setSize(host.clientWidth, host.clientHeight);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      arena.dispose();
      arenaRef.current = null;
    };
  }, []);

  const abilityPct =
    hud.abilityMaxCooldown <= 0
      ? 100
      : Math.round(((hud.abilityMaxCooldown - hud.abilityCooldown) / hud.abilityMaxCooldown) * 100);

  const mission = hud.mission;
  const maxSquad = hud.maxSquad || 8;
  const upgrading = hud.pausedForUpgrade && hud.choices.length > 0;
  const ammoClass = hud.reloading ? 'reload' : hud.ammo <= 5 ? 'low' : '';
  const danger = hud.dangerLevel;

  const diamonds = [
    ...hud.unlockedWeapons.slice(0, 6).map((w) => ({
      label: w.label.slice(0, 2).toUpperCase(),
      count: '1',
      tint: tintFor(w.id),
    })),
    ...hud.modsSummary.slice(0, 4).map((m) => ({
      label: m.split(' ')[0]!.slice(0, 2),
      count: m.replace(/[^0-9]/g, '') || '1',
      tint: 'gold',
    })),
  ].slice(0, 8);

  const handlePick = (index: number) => {
    setFocusIndex(index);
    arenaRef.current?.selectUpgrade(index);
  };

  return (
    <main className="yaz-arena">
      <div ref={hostRef} className="yaz-canvas" />

      <nav className="yaz-nav">
        <Link href="/lobby" className="btn-ghost">
          ← Lobi
        </Link>
        <Link href="/levelup" className="btn-ghost">
          Codex
        </Link>
      </nav>

      {mission.banner ? <div className="yaz-banner on">{mission.banner}</div> : null}

      {!hud.alive && (
        <div className="yaz-downed on">
          <div className="panel">YERE SERİLDİN</div>
        </div>
      )}

      {!upgrading && (
        <div className="yaz-play">
          <div className="yaz-play__top">
            <div className="yaz-dias">
              {diamonds.map((d, i) => (
                <div key={`${d.label}-${i}`} className={`yaz-dia ${d.tint}`}>
                  <span>{d.label}</span>
                  <div className="cnt">{d.count}</div>
                </div>
              ))}
            </div>
            <div className="yaz-timer">{formatTime(hud.runTimeSec)}</div>
            <div className="yaz-faces">
              {Array.from({ length: Math.min(maxSquad, 8) }, (_, i) => {
                const member = hud.squad[i];
                if (!member) {
                  return (
                    <div key={i} className="yaz-face empty">
                      ·
                    </div>
                  );
                }
                return (
                  <div key={i} className={`yaz-face${i === 0 ? ' you' : ''}${member.alive ? '' : ' dead'}`}>
                    {initials(member.name, i === 0)}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="yaz-objchip">
            <div className="label-caps" style={{ color: 'var(--warning)' }}>
              HEDEF · BÖLÜM {mission.chapterIndex}
            </div>
            <div className="obj-text">
              {mission.objectiveLabel} {mission.objectiveProgress}/{mission.objectiveTarget}
              {mission.objectiveComplete ? ' ✓' : ''}
            </div>
            <div className="yaz-track" style={{ height: 6 }}>
              <span
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (mission.objectiveProgress / Math.max(1, mission.objectiveTarget)) * 100),
                  )}%`,
                  background: 'linear-gradient(90deg, #c88920, var(--xp))',
                }}
              />
            </div>
            <div className="label-caps" style={{ marginTop: 6 }}>
              {mission.sectorCode} {mission.sectorName}
            </div>
          </div>

          <div className="yaz-play__bottom">
            <div className="yaz-glass">
              <div className="label-caps">Silah</div>
              <div className="weapon-name">{hud.weapon}</div>
              <div className={`ammo ${ammoClass}`}>
                {hud.reloading
                  ? `ŞARJÖR… ${Math.round(hud.reloadProgress * 100)}%`
                  : `${hud.ammo} / ${hud.magSize}`}
              </div>
            </div>
            <div className="yaz-glass">
              <div className="xp-label">
                <span className="label-caps">Tecrübe · Sv {hud.level}</span>
                <span className="label-caps">
                  {Math.floor(hud.xp)} / {hud.xpToLevel}
                </span>
              </div>
              <div className="xp-track">
                <span
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpToLevel)) * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div className="yaz-glass">
              <div className="label-caps">
                [R] Yetenek · Dalga {hud.wave}
              </div>
              <div className="ability-name">{hud.abilityName}</div>
              <div className="yaz-track" style={{ height: 6 }}>
                <span
                  style={{
                    width: `${abilityPct}%`,
                    background: hud.abilityReady ? '#5ad46a' : '#4aa3ff',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {upgrading && (
        <div className="yaz-upgrade on">
          <div className="yaz-upgrade__bg" />
          <div className="yaz-upgrade__top">
            <div className="yaz-dias">
              {diamonds.map((d, i) => (
                <div key={`u-${d.label}-${i}`} className={`yaz-dia ${d.tint}`}>
                  <span>{d.label}</span>
                  <div className="cnt">{d.count}</div>
                </div>
              ))}
            </div>
            <div className="yaz-timer">{formatTime(hud.runTimeSec)}</div>
            <div className="yaz-faces">
              {Array.from({ length: Math.min(maxSquad, 8) }, (_, i) => {
                const member = hud.squad[i];
                if (!member) {
                  return (
                    <div key={i} className="yaz-face empty">
                      ·
                    </div>
                  );
                }
                return (
                  <div key={i} className={`yaz-face${i === 0 ? ' you' : ''}${member.alive ? '' : ' dead'}`}>
                    {initials(member.name, i === 0)}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="yaz-upgrade__main">
            <div className="yaz-upgrade__title">GÜÇLENDİRME SEÇ</div>
            <div className="yaz-upgrade__cards">
              {hud.choices.map((card, i) => {
                const lines = cardStatLines(card);
                return (
                  <button
                    key={`${card.id}-${i}`}
                    type="button"
                    className={`yaz-pcard ${card.rarity}${i === focusIndex ? ' focus' : ''}${
                      hud.lockedChoiceIndex === i ? ' locked' : ''
                    }`}
                    onMouseEnter={() => setFocusIndex(i)}
                    onClick={() => handlePick(i)}
                  >
                    <div className="key">{i + 1}</div>
                    <div className="gem">
                      <b>{gemLetter(card)}</b>
                    </div>
                    <div className="name">{card.name}</div>
                    <div className="desc">{card.description}</div>
                    <div className="stats">
                      {lines.map((l) => (
                        <div key={l.label} className="stat">
                          <span>{l.label}</span>
                          <span className="delta">
                            {l.before} {'>>'} {l.after}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="tier">
                      <span>{rarityTierLabel(card.rarity)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="yaz-side">
            <h3>TIM</h3>
            <div className="sep" />
            {[
              ['Can', `${Math.ceil(hud.hp)}/${hud.maxHp}`],
              ['Rejenerasyon', '0.0'],
              ['Zırh', String(hud.armorFlat | 0)],
              ['Hareket', `${Math.round(hud.moveSpeedMult * 100)}%`],
              ['Toplama', hud.pickupRadius.toFixed(1)],
              ['XP', `${Math.round(hud.xpMult * 100)}%`],
              ['Şans', `${Math.round(hud.critChance * 100)}%`],
              ['Kaçınma', '0%'],
            ].map(([k, v]) => (
              <div key={k} className="stat-row">
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            <div className="sep" />
            <div className="yaz-side__icons">
              {hud.unlockedWeapons.slice(0, 8).map((w) => (
                <div key={w.id} className={`yaz-dia ${tintFor(w.id)}`}>
                  <span>{w.label.slice(0, 2).toUpperCase()}</span>
                  <div className="cnt">100%</div>
                </div>
              ))}
            </div>
            <div className="yaz-danger">
              <div className="ttl">TEHLİKE {danger}</div>
              <div className="stat-row">
                <span>Can</span>
                <span>+{100 + danger * 35}%</span>
              </div>
              <div className="stat-row">
                <span>Hasar</span>
                <span>+{100 + danger * 18}%</span>
              </div>
              <div className="stat-row">
                <span>Hız</span>
                <span>+{Math.round(danger * 6)}%</span>
              </div>
            </div>
          </aside>

          <div className="yaz-actions">
            <button
              type="button"
              className="yaz-act"
              disabled={hud.rerolls <= 0}
              onClick={() => arenaRef.current?.rerollUpgrades()}
            >
              <div className="ico">
                ↻
                <span className="n">
                  <i>{hud.rerolls}</i>
                </span>
              </div>
              <div className="lbl">Reroll</div>
            </button>
            <button
              type="button"
              className="yaz-act"
              disabled={hud.lockdowns <= 0}
              onClick={() => arenaRef.current?.lockdownUpgrade(focusIndex)}
            >
              <div className="ico">
                🔒
                <span className="n">
                  <i>{hud.lockdowns}</i>
                </span>
              </div>
              <div className="lbl">Lockdown</div>
            </button>
            <button
              type="button"
              className="yaz-act"
              disabled={hud.banishes <= 0}
              onClick={() => arenaRef.current?.banishUpgrade(focusIndex)}
            >
              <div className="ico">
                ⛔
                <span className="n">
                  <i>{hud.banishes}</i>
                </span>
              </div>
              <div className="lbl">Banish</div>
            </button>
            <button type="button" className="yaz-act" onClick={() => arenaRef.current?.skipUpgrade()}>
              <div className="ico">⏭</div>
              <div className="lbl">Skip</div>
            </button>
          </div>
        </div>
      )}

      {hud.showSkillTree && (
        <div className="arena-modal" style={{ zIndex: 40 }}>
          <div style={{ width: 'min(920px, 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="label-caps" style={{ color: 'var(--phosphor)' }}>
                YETENEK AĞACI — puan {hud.skillPoints} · [T] kapat
              </div>
              <button className="btn-ghost" type="button" onClick={() => arenaRef.current?.toggleSkillTree()}>
                Kapat
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              {hud.skills.map((sk) => (
                <button
                  key={sk.id}
                  className="panel"
                  type="button"
                  disabled={!sk.canUnlock}
                  onClick={() => arenaRef.current?.unlockSkillNode(sk.id)}
                  style={{
                    textAlign: 'left',
                    padding: 12,
                    opacity: sk.rank > 0 || sk.canUnlock ? 1 : 0.45,
                    color: 'inherit',
                    gridColumn: sk.column + 1,
                    gridRow: sk.row + 1,
                  }}
                >
                  <div className="label-caps">
                    {sk.name} · {sk.rank}/{sk.maxRank}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6, opacity: 0.85 }}>{sk.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {hud.showInventory && (
        <div className="yaz-inv">
          <div className="panel" style={{ padding: 14 }}>
            <div className="label-caps" style={{ color: 'var(--xp)', marginBottom: 8 }}>
              ÇANTA · hurda {hud.scrap} · [I]
            </div>
            {hud.inventory.length === 0 && (
              <div className="label-caps" style={{ opacity: 0.6 }}>
                Boş
              </div>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {hud.inventory.map((it) => (
                <button
                  key={it.id}
                  className="btn-ghost"
                  type="button"
                  style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }}
                  onClick={() => arenaRef.current?.useItem(it.id)}
                >
                  <span>
                    {it.name} x{it.count}
                  </span>
                  <span className="label-caps">KULLAN</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
