import { createArena, type ArenaHandle, type ArenaHudState } from './arena';
import type { AudioBusId } from './audio';
import {
  META_UNLOCKS,
  commitRunResults,
  loadMetaSave,
  purchaseMetaUnlock,
  type MetaSaveData,
  type RunCommitResult,
} from './metaSave';
import { cardStatLines, rarityTierLabel, type UpgradeCardDef } from './progression';

const BUS_LABELS: Array<{ id: AudioBusId; label: string }> = [
  { id: 'master', label: 'MASTER' },
  { id: 'weapons', label: 'SİLAH' },
  { id: 'combat', label: 'İSABET' },
  { id: 'zombie', label: 'ZOMBİ' },
  { id: 'player', label: 'OYUNCU' },
  { id: 'ui', label: 'ARAYÜZ' },
];

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

let arena: ArenaHandle = createArena(root);
let meta: MetaSaveData = loadMetaSave();
let runCommitted = false;
let lastCommit: RunCommitResult | null = null;

const el = {
  hud: document.getElementById('hud')!,
  timerPill: document.getElementById('timerPill')!,
  modRow: document.getElementById('modRow')!,
  teamTop: document.getElementById('teamTop')!,
  objTitle: document.getElementById('objTitle')!,
  objText: document.getElementById('objText')!,
  objBar: document.getElementById('objBar')!,
  sector: document.getElementById('sector')!,
  weaponName: document.getElementById('weaponName')!,
  ammoText: document.getElementById('ammoText')!,
  xp: document.getElementById('xp')!,
  xpBar: document.getElementById('xpBar')!,
  lvl: document.getElementById('lvl')!,
  wave: document.getElementById('wave')!,
  abilityName: document.getElementById('abilityName')!,
  abilityBar: document.getElementById('abilityBar')!,
  downed: document.getElementById('downed')!,
  results: document.getElementById('results')!,
  resultsStats: document.getElementById('resultsStats')!,
  resultsCredits: document.getElementById('resultsCredits')!,
  metaShop: document.getElementById('metaShop')!,
  pause: document.getElementById('pause')!,
  pauseBuses: document.getElementById('pauseBuses')!,
  btnResume: document.getElementById('btnResume') as HTMLButtonElement,
  btnPauseRestart: document.getElementById('btnPauseRestart') as HTMLButtonElement,
  btnRestart: document.getElementById('btnRestart') as HTMLButtonElement,
  banner: document.getElementById('banner')!,
  upgrade: document.getElementById('upgrade')!,
  upgradeCards: document.getElementById('upgradeCards')!,
  upMods: document.getElementById('upMods')!,
  upTimer: document.getElementById('upTimer')!,
  upTeam: document.getElementById('upTeam')!,
  sideStats: document.getElementById('sideStats')!,
  sideIcons: document.getElementById('sideIcons')!,
  dangerTitle: document.getElementById('dangerTitle')!,
  dangerStats: document.getElementById('dangerStats')!,
  btnReroll: document.getElementById('btnReroll') as HTMLButtonElement,
  btnLock: document.getElementById('btnLock') as HTMLButtonElement,
  btnBanish: document.getElementById('btnBanish') as HTMLButtonElement,
  btnSkip: document.getElementById('btnSkip') as HTMLButtonElement,
  rerollN: document.getElementById('rerollN')!,
  lockN: document.getElementById('lockN')!,
  banishN: document.getElementById('banishN')!,
  embers: document.getElementById('embers')!,
};

let focusIndex = 0;

const formatTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
};

const setBar = (node: HTMLElement, value: number, max: number) => {
  node.style.width = `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;
};

const initials = (name: string, isYou: boolean): string => {
  if (isYou) return 'SEN';
  return name.slice(0, 2).toUpperCase();
};

const gemLetter = (card: UpgradeCardDef): string =>
  (card.icon ?? card.name.trim().charAt(0) ?? '?').toString().slice(0, 2).toUpperCase();

const tintFor = (label: string): string => {
  const l = label.toLowerCase();
  if (l.includes('shot') || l.includes('lmg')) return 'red';
  if (l.includes('sniper') || l.includes('smg')) return 'blue';
  if (l.includes('rifle') || l.includes('nova') || l.includes('heal')) return 'ok';
  return 'gold';
};

const renderDiamonds = (host: HTMLElement, hud: ArenaHudState) => {
  host.replaceChildren();
  const items: Array<{ label: string; count: string; tint: string }> = [
    ...hud.squad
      .filter((s) => s.alive)
      .slice(0, 8)
      .map((s) => ({
        label: (s.icon ?? s.name.slice(0, 2)).toUpperCase(),
        count: String(Math.max(1, Math.ceil((s.hp / Math.max(1, s.maxHp)) * 100))),
        tint: tintFor(s.classId ?? s.name),
      })),
    ...hud.modsSummary.slice(0, 4).map((m) => ({
      label: m.split(' ')[0]!.slice(0, 2),
      count: m.includes('%') ? m.replace(/[^0-9]/g, '') || '1' : '1',
      tint: 'gold',
    })),
  ].slice(0, 8);

  for (const item of items) {
    const d = document.createElement('div');
    d.className = `dia ${item.tint}`;
    d.innerHTML = `<span>${item.label.slice(0, 2)}</span><div class="cnt">${item.count}</div>`;
    host.appendChild(d);
  }
};

const renderTeam = (host: HTMLElement, hud: ArenaHudState) => {
  host.replaceChildren();
  const max = hud.maxSquad || 8;
  for (let i = 0; i < Math.min(max, 8); i++) {
    const member = hud.squad[i];
    const face = document.createElement('div');
    if (!member) {
      face.className = 'face empty';
      face.textContent = '·';
    } else {
      face.className = `face${i === 0 ? ' you' : ''}${member.alive ? '' : ' dead'}`;
      face.textContent = initials(member.name, i === 0);
      face.title = `${member.name} ${Math.ceil(member.hp)}/${member.maxHp}`;
    }
    host.appendChild(face);
  }
};

const renderSidePanel = (hud: ArenaHudState) => {
  const rows: Array<[string, string]> = [
    ['Can', `${Math.ceil(hud.hp)}/${hud.maxHp}`],
    ['Rejenerasyon', '0.0'],
    ['Zırh', String(hud.armorFlat | 0)],
    ['Hareket', `${Math.round(hud.moveSpeedMult * 100)}%`],
    ['Toplama', hud.pickupRadius.toFixed(1)],
    ['XP', `${Math.round(hud.xpMult * 100)}%`],
    ['Şans', `${Math.round(hud.critChance * 100)}%`],
    ['Kaçınma', '0%'],
  ];
  el.sideStats.innerHTML = rows
    .map(([k, v]) => `<div class="stat-row"><span>${k}</span><span>${v}</span></div>`)
    .join('');

  el.sideIcons.replaceChildren();
  for (const w of hud.unlockedWeapons.slice(0, 8)) {
    const d = document.createElement('div');
    d.className = `dia ${tintFor(w.id)}`;
    d.innerHTML = `<span>${w.label.slice(0, 2).toUpperCase()}</span><div class="cnt">100%</div>`;
    el.sideIcons.appendChild(d);
  }

  const danger = hud.dangerLevel;
  el.dangerTitle.textContent = `TEHLİKE ${danger}`;
  const hpMul = 100 + danger * 35;
  const dmgMul = 100 + danger * 18;
  el.dangerStats.innerHTML = [
    ['Can', `+${hpMul}%`],
    ['Hasar', `+${dmgMul}%`],
    ['Hız', `+${Math.round(danger * 6)}%`],
  ]
    .map(([k, v]) => `<div class="stat-row"><span>${k}</span><span>${v}</span></div>`)
    .join('');
};

const renderUpgradeCards = (hud: ArenaHudState) => {
  el.upgradeCards.replaceChildren();
  hud.choices.forEach((card, i) => {
    const lines = cardStatLines(card);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pcard ${card.rarity}${i === focusIndex ? ' focus' : ''}${
      hud.lockedChoiceIndex === i ? ' locked' : ''
    }`;
    btn.innerHTML = `
      <div class="key">${i + 1}</div>
      <div class="gem"><b>${gemLetter(card)}</b></div>
      <div class="name">${card.name}</div>
      <div class="desc">${card.description}</div>
      <div class="stats">
        ${lines
          .map(
            (l) =>
              `<div class="stat"><span>${l.label}</span><span class="delta">${l.before} &gt;&gt; ${l.after}</span></div>`,
          )
          .join('')}
      </div>
      <div class="tier"><span>${rarityTierLabel(card.rarity)}</span></div>
    `;
    btn.addEventListener('mouseenter', () => {
      focusIndex = i;
      el.upgradeCards.querySelectorAll('.pcard').forEach((n, idx) => {
        n.classList.toggle('focus', idx === focusIndex);
      });
    });
    btn.addEventListener('click', () => {
      focusIndex = i;
      arena.selectUpgrade(i);
      renderHud(arena.getHudState());
    });
    el.upgradeCards.appendChild(btn);
  });
};

const ensureEmbers = () => {
  if (el.embers.childElementCount > 0) return;
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('span');
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDuration = `${6 + Math.random() * 10}s`;
    s.style.animationDelay = `${Math.random() * 8}s`;
    s.style.width = s.style.height = `${2 + Math.random() * 3}px`;
    el.embers.appendChild(s);
  }
};

let pauseBusesBuilt = false;

const syncPauseBuses = () => {
  const levels = arena.getAudioBusLevels();
  for (const { id } of BUS_LABELS) {
    const input = el.pauseBuses.querySelector(`input[data-bus="${id}"]`) as HTMLInputElement | null;
    const pct = el.pauseBuses.querySelector(`span[data-bus="${id}"]`) as HTMLElement | null;
    if (!input || !pct) continue;
    const v = Math.round(levels[id] * 100);
    if (document.activeElement !== input) input.value = String(v);
    pct.textContent = `${v}%`;
  }
};

const ensurePauseBuses = () => {
  if (pauseBusesBuilt) {
    syncPauseBuses();
    return;
  }
  pauseBusesBuilt = true;
  el.pauseBuses.replaceChildren();
  const levels = arena.getAudioBusLevels();
  for (const { id, label } of BUS_LABELS) {
    const row = document.createElement('label');
    row.className = 'busRow';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.dataset.bus = id;
    input.value = String(Math.round(levels[id] * 100));
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.dataset.bus = id;
    pct.textContent = `${input.value}%`;
    input.addEventListener('input', () => {
      const v = Number(input.value) / 100;
      arena.setAudioBusLevel(id, v);
      pct.textContent = `${input.value}%`;
    });
    row.append(name, input, pct);
    el.pauseBuses.appendChild(row);
  }
};

const renderHud = (hud: ArenaHudState) => {
  const m = hud.mission;
  const upgrading = hud.pausedForUpgrade && hud.choices.length > 0;
  const paused = hud.paused && !upgrading && hud.alive && !runCommitted;

  el.timerPill.textContent = formatTime(hud.runTimeSec);
  el.upTimer.textContent = formatTime(hud.runTimeSec);
  el.lvl.textContent = String(hud.level);
  el.wave.textContent = String(hud.wave);

  el.objTitle.textContent = `HEDEF · BÖLÜM ${m.chapterIndex}`;
  el.objText.textContent = `${m.objectiveLabel}  ${m.objectiveProgress}/${m.objectiveTarget}${
    m.objectiveComplete ? ' ✓' : ''
  }`;
  setBar(el.objBar, m.objectiveProgress, m.objectiveTarget);
  el.sector.textContent = `${m.sectorCode}  ${m.sectorName}`;

  el.weaponName.textContent = hud.weapon;
  if (hud.reloading) {
    el.ammoText.textContent = `ŞARJÖR… ${Math.round(hud.reloadProgress * 100)}%`;
    el.ammoText.className = 'reload';
  } else {
    el.ammoText.textContent = `${hud.ammo} / ${hud.magSize}`;
    el.ammoText.className = hud.ammo <= 5 ? 'low' : '';
  }

  el.xp.textContent = `${Math.floor(hud.xp)} / ${hud.xpToLevel}`;
  setBar(el.xpBar, hud.xp, hud.xpToLevel);

  el.abilityName.textContent = hud.abilityName;
  const abilityPct =
    hud.abilityMaxCooldown <= 0
      ? 100
      : ((hud.abilityMaxCooldown - hud.abilityCooldown) / hud.abilityMaxCooldown) * 100;
  setBar(el.abilityBar, abilityPct, 100);
  el.abilityBar.style.background = hud.abilityReady ? '#5ad46a' : '#4aa3ff';

  renderDiamonds(el.modRow, hud);
  renderTeam(el.teamTop, hud);
  renderDiamonds(el.upMods, hud);
  renderTeam(el.upTeam, hud);

  el.downed.classList.toggle('on', !hud.alive && !runCommitted);
  el.hud.classList.toggle('hidden', upgrading || runCommitted || paused);

  if (paused) {
    ensurePauseBuses();
    el.pause.classList.add('on');
  } else {
    el.pause.classList.remove('on');
  }

  if (!hud.alive) {
    if (!runCommitted) {
      runCommitted = true;
      lastCommit = commitRunResults(arena.getRunSummary(), meta);
      meta = lastCommit.meta;
    }
    renderResults(hud);
    el.results.classList.add('on');
  } else {
    el.results.classList.remove('on');
  }

  if (m.banner) {
    el.banner.textContent = m.banner;
    el.banner.classList.add('on');
  } else {
    el.banner.classList.remove('on');
  }

  if (upgrading) {
    ensureEmbers();
    el.upgrade.classList.add('on');
    if (focusIndex >= hud.choices.length) focusIndex = 0;
    renderUpgradeCards(hud);
    renderSidePanel(hud);
    el.rerollN.textContent = String(hud.rerolls);
    el.lockN.textContent = String(hud.lockdowns);
    el.banishN.textContent = String(hud.banishes);
    el.btnReroll.disabled = hud.rerolls <= 0;
    el.btnLock.disabled = hud.lockdowns <= 0;
    el.btnBanish.disabled = hud.banishes <= 0;
  } else {
    el.upgrade.classList.remove('on');
    el.upgradeCards.replaceChildren();
  }
};

const renderMetaShop = () => {
  el.metaShop.replaceChildren();
  for (const unlock of META_UNLOCKS) {
    const owned = meta.unlocked.includes(unlock.id);
    const row = document.createElement('div');
    row.className = `metaItem${owned ? ' owned' : ''}`;
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.textContent = owned ? 'ALINDI' : `${unlock.cost} CR`;
    buy.disabled = owned || meta.credits < unlock.cost;
    buy.addEventListener('click', () => {
      const next = purchaseMetaUnlock(unlock.id, meta);
      if (!next) return;
      meta = next;
      if (lastCommit) lastCommit = { ...lastCommit, meta: next };
      renderMetaShop();
      if (lastCommit) {
        el.resultsCredits.textContent = `+${lastCommit.creditsEarned} kredi · Toplam ${meta.credits} CR · Rekor dalga ${meta.bestWave}`;
      }
    });
    row.innerHTML = `<b>${unlock.name}</b><small>${unlock.description}</small>`;
    row.appendChild(buy);
    el.metaShop.appendChild(row);
  }
};

const renderResults = (hud: ArenaHudState) => {
  const commit = lastCommit;
  const credits = commit?.creditsEarned ?? 0;
  const badges: string[] = [];
  if (commit?.isNewBestWave) badges.push('Yeni dalga rekoru');
  if (commit?.isNewBestKills) badges.push('Yeni kill rekoru');
  el.resultsStats.innerHTML = [
    ['Kills', String(hud.kills)],
    ['Dalga', String(hud.wave)],
    ['Seviye', String(hud.level)],
    ['Süre', formatTime(hud.runTimeSec)],
    ['Koşular', String(meta.totalRuns)],
    ['En iyi dalga', String(meta.bestWave)],
  ]
    .map(([k, v]) => `<div><span>${k}</span><br/><b>${v}</b></div>`)
    .join('');
  el.resultsCredits.textContent = [
    `+${credits} kredi · Toplam ${meta.credits} CR`,
    badges.length ? badges.join(' · ') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  renderMetaShop();
};

const onResize = () => arena.setSize(root.clientWidth, root.clientHeight);

const restartRun = () => {
  arena.dispose();
  arena = createArena(root);
  runCommitted = false;
  lastCommit = null;
  meta = loadMetaSave();
  pauseBusesBuilt = false;
  el.results.classList.remove('on');
  el.pause.classList.remove('on');
  lastSig = '';
  onResize();
  renderHud(arena.getHudState());
};

el.btnReroll.addEventListener('click', () => {
  arena.rerollUpgrades();
  renderHud(arena.getHudState());
});
el.btnLock.addEventListener('click', () => {
  arena.lockdownUpgrade(focusIndex);
  renderHud(arena.getHudState());
});
el.btnBanish.addEventListener('click', () => {
  arena.banishUpgrade(focusIndex);
  renderHud(arena.getHudState());
});
el.btnSkip.addEventListener('click', () => {
  arena.skipUpgrade();
  renderHud(arena.getHudState());
});
el.btnRestart.addEventListener('click', () => {
  restartRun();
});
el.btnResume.addEventListener('click', () => {
  arena.setPaused(false);
  lastSig = '';
  renderHud(arena.getHudState());
});
el.btnPauseRestart.addEventListener('click', () => {
  restartRun();
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  const hud = arena.getHudState();
  if (!hud.alive || runCommitted || hud.pausedForUpgrade) return;
  e.preventDefault();
  arena.togglePause();
  lastSig = '';
  renderHud(arena.getHudState());
});

window.addEventListener('resize', onResize);
onResize();

let lastHudMs = 0;
let lastSig = '';

const loop = (t: number) => {
  try {
    arena.animate(t);
    if (t - lastHudMs > 90) {
      lastHudMs = t;
      const hud = arena.getHudState();
      const m = hud.mission;
      const sig = [
        hud.hp | 0,
        hud.alive ? 1 : 0,
        hud.ammo,
        hud.reloading ? 1 : 0,
        Math.round(hud.reloadProgress * 20),
        hud.wave,
        hud.kills,
        hud.level,
        hud.squad.map((s) => `${s.name}:${s.hp | 0}:${s.alive ? 1 : 0}`).join(','),
        m.objectiveProgress | 0,
        m.sectorCode,
        m.banner,
        hud.pausedForUpgrade ? 1 : 0,
        hud.paused ? 1 : 0,
        hud.choices.map((c) => c.id).join(','),
        hud.rerolls,
        hud.lockdowns,
        hud.banishes,
        hud.lockedChoiceIndex ?? -1,
        Math.floor(hud.runTimeSec),
        hud.abilityReady ? 1 : 0,
        runCommitted ? 1 : 0,
        meta.credits,
      ].join(';');
      if (sig !== lastSig) {
        lastSig = sig;
        renderHud(hud);
      }
    }
  } catch (err) {
    console.error('[preview] frame error', err);
  }
  requestAnimationFrame(loop);
};

renderHud(arena.getHudState());
requestAnimationFrame(loop);
