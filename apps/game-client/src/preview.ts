import { thumbImg, weaponThumb } from './thumbs';
import { createArena, type ArenaHandle, type ArenaHudState } from './arena';
import { createLobby } from './lobby';
import { currentRunLoadout, loadProfile } from './loadout';
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
import { checkLive, commitRun, type AchievementDef } from './achievements';
import { DIFFICULTIES } from './gameModes';
import { writeMetaSave } from './metaSave';

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

// Arena is created when a run starts from the lobby.
let arena = null as unknown as ArenaHandle;
let running = false;
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
  resultsTitle: document.getElementById('resultsTitle')!,
  resultsSub: document.getElementById('resultsSub')!,
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
  heroSkills: document.getElementById('heroSkills')!,
  slotBar: document.getElementById('slotBar')!,
  runSkillBar: document.getElementById('runSkillBar'),
};

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const renderHeroSkills = (hud: ArenaHudState) => {
  const sup = hud.support;
  const list = sup
    ? [...hud.heroAbilities, { slot: 'H', name: `${sup.name} (imlecin olduğu yere)`, icon: sup.icon, color: 0xc8a868, level: 0, cooldown: sup.cd, maxCooldown: sup.max }]
    : hud.heroAbilities;
  if (el.heroSkills.childElementCount !== list.length) {
    el.heroSkills.replaceChildren(
      ...list.map(() => {
        const d = document.createElement('div');
        d.className = 'skill';
        d.innerHTML = '<span class="ico"></span><div class="cd"></div><div class="cdt"></div><span class="key"></span><span class="lv"></span>';
        return d;
      }),
    );
  }
  list.forEach((a, i) => {
    const d = el.heroSkills.children[i] as HTMLElement;
    d.classList.toggle('radio', a.slot === 'H');
    const ready = a.cooldown <= 0.01;
    d.classList.toggle('ready', ready);
    d.style.setProperty('--sk', hex(a.color));
    d.title = `${a.slot} · ${a.name} (Sv ${a.level})`;
    (d.querySelector('.ico') as HTMLElement).textContent = a.icon;
    (d.querySelector('.key') as HTMLElement).textContent = a.slot;
    (d.querySelector('.lv') as HTMLElement).textContent = a.slot === 'H' ? '📻' : `Sv${a.level}`;
    (d.querySelector('.cd') as HTMLElement).style.height = ready ? '0%' : `${Math.min(100, (a.cooldown / Math.max(0.01, a.maxCooldown)) * 100)}%`;
    (d.querySelector('.cdt') as HTMLElement).textContent = ready ? '' : a.cooldown >= 1 ? String(Math.ceil(a.cooldown)) : a.cooldown.toFixed(1);
  });
};
let runSkillKey = '';
const renderRunSkills = (hud: ArenaHudState) => {
  const bar = el.runSkillBar;
  const list = hud.runSkills ?? [];
  if (!bar) return;
  const key = list.map((r) => `${r.id}${r.level}${r.evo ? 'e' : ''}`).join('|');
  if (key === runSkillKey) return;
  runSkillKey = key;
  bar.replaceChildren(
    ...list.map((r) => {
      const d = document.createElement('div');
      d.className = `rsk${r.passive ? ' pas' : ''}${r.evo ? ' evo' : ''}`;
      d.title = `${r.name} · Sv ${r.evo ? 'EVRİM' : r.level}`;
      d.innerHTML = `<span class="i">${r.icon}</span><span class="pips">${r.evo ? '★' : '▮'.repeat(r.level)}</span>`;
      return d;
    }),
  );
};
let slotKey = '';
let weaponPicVariant = '';
const renderSlots = (hud: ArenaHudState) => {
  const key = hud.weaponSlots.map((w) => `${w.variant}${w.active ? '*' : ''}${w.locked ? `L${w.unlockAt}` : ''}:${w.level ?? 0}`).join(',');
  if (key === slotKey) return;
  slotKey = key;
  el.slotBar.replaceChildren(
    ...hud.weaponSlots.map((w, i) => {
      const d = document.createElement('div');
      d.className = `slot${w.active ? ' on' : ''} t${w.tier}${w.locked ? ' locked' : ''}`;
      const lv = !w.locked && (w.level ?? 0) > 0 ? ` <small class="wl">Sv${w.level}</small>` : '';
      d.innerHTML = w.locked
        ? `<span class="n">${i + 1}</span><span class="nm">🔒 Sv ${w.unlockAt}</span>`
        : `<span class="n">${i + 1}</span><span class="nm">${w.name}${lv}</span>`;
      d.prepend(thumbImg(weaponThumb(w.variant), 'sth'));
      if (w.locked) {
        d.style.opacity = '0.42';
        d.style.filter = 'grayscale(1)';
        d.title = `Oyun içi seviye ${w.unlockAt} olunca açılır`;
      }
      return d;
    }),
  );
  const act = hud.weaponSlots.find((w) => w.active);
  const pic = document.getElementById('weaponPic') as HTMLImageElement | null;
  if (act && pic && act.variant !== weaponPicVariant) {
    weaponPicVariant = act.variant;
    const want = act.variant;
    void weaponThumb(want).then((u) => {
      if (weaponPicVariant === want) pic.src = u;
    });
  }
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
  // skip the DOM rebuild (layout + style recalc) when nothing visible changed
  const key = items.map((it) => `${it.label}:${it.count}:${it.tint}`).join('|');
  if (host.dataset.k === key) return;
  host.dataset.k = key;
  host.replaceChildren();

  for (const item of items) {
    const d = document.createElement('div');
    d.className = `dia ${item.tint}`;
    d.innerHTML = `<span>${item.label.slice(0, 2)}</span><div class="cnt">${item.count}</div>`;
    host.appendChild(d);
  }
};

const renderTeam = (host: HTMLElement, hud: ArenaHudState) => {
  const max = hud.maxSquad || 8;
  const key = `${max}|${hud.squad.map((m) => `${m.name}:${Math.ceil(m.hp)}:${m.maxHp}:${m.alive ? 1 : 0}`).join(',')}`;
  if (host.dataset.k === key) return;
  host.dataset.k = key;
  host.replaceChildren();
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
    btn.className = `pcard ${card.rarity}${card.runSkill ? ` rs rs-${card.runSkill.kind}` : ''}${i === focusIndex ? ' focus' : ''}${
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
  renderHeroSkills(hud);
  renderRunSkills(hud);
  renderSlots(hud);
  const m = hud.mission;
  const upgrading = hud.pausedForUpgrade && hud.choices.length > 0;
  const paused = hud.paused && !upgrading && hud.alive && !runCommitted;

  el.timerPill.textContent = formatTime(hud.runTimeSec);
  el.upTimer.textContent = formatTime(hud.runTimeSec);
  el.lvl.textContent = String(hud.level);
  el.wave.textContent = String(hud.wave);

  el.objTitle.textContent = `${m.chapterTitle} · ${m.chapterCodename}`;
  el.objText.textContent = `${m.objectiveLabel}${m.objectiveComplete ? ' ✓' : ''}`;
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

  const over = hud.runOver ?? null;
  el.downed.classList.toggle('on', !hud.alive && !over);
  const downedBox = el.downed.querySelector('.box');
  if (downedBox) downedBox.textContent = hud.revivesLeft === undefined || hud.revivesLeft === Infinity ? 'YERE SERİLDİN' : hud.revivesLeft > 0 ? `YERE SERİLDİN · ${hud.revivesLeft} dirilme hakkı` : 'YERE SERİLDİN · SON HAK';
  el.hud.classList.toggle('hidden', upgrading || runCommitted || paused);

  if (paused) {
    ensurePauseBuses();
    el.pause.classList.add('on');
  } else {
    el.pause.classList.remove('on');
  }

  if (over) {
    if (!runCommitted) {
      runCommitted = true;
      lastCommit = commitRunResults(arena.getRunSummary(), meta);
      const d = DIFFICULTIES[hud.runStats?.difficulty ?? 'normal'];
      const bonus = Math.round(lastCommit.creditsEarned * (d.reward - 1) + (over.won ? 150 * d.reward : 0));
      if (bonus) {
        lastCommit.meta.credits += bonus;
        writeMetaSave(lastCommit.meta);
        lastCommit = { ...lastCommit, creditsEarned: lastCommit.creditsEarned + bonus };
      }
      runAchievements = hud.runStats ? commitRun(hud.runStats, lastCommit.creditsEarned) : [];
      meta = loadMetaSave();
      lastCommit = { ...lastCommit, meta };
    }
    el.resultsTitle.textContent = over.title;
    el.resultsTitle.className = over.won ? 'won' : 'lost';
    el.resultsSub.textContent = over.subtitle;
    renderResults(hud);
    el.results.classList.add('on');
  } else {
    el.results.classList.remove('on');
    if (hud.runStats && performance.now() - lastAchCheck > 2000) {
      lastAchCheck = performance.now();
      for (const a of checkLive(hud.runStats)) achToast(a);
    }
  }

  // ---- off-screen / on-screen markers
  const ind = document.getElementById('indic');
  if (ind) {
    const list = hud.indicators ?? [];
    while (ind.children.length < list.length) {
      const d = document.createElement('div');
      d.className = 'ind';
      d.innerHTML = '<i class="ar"></i><span class="ic"></span><span class="tx"></span>';
      ind.append(d);
    }
    for (let i = 0; i < ind.children.length; i++) {
      const d = ind.children[i] as HTMLElement;
      const it = list[i];
      if (!it) {
        d.style.display = 'none';
        continue;
      }
      d.style.display = '';
      d.style.setProperty('--c', it.color);
      d.style.transform = `translate(${it.x.toFixed(0)}px, ${it.y.toFixed(0)}px)`;
      const cls = `ind${it.on ? ' on' : ''}${it.urgent ? ' urg' : ''}`;
      if (d.className !== cls) d.className = cls;
      (d.children[0] as HTMLElement).style.transform = `rotate(${it.ang.toFixed(3)}rad)`;
      d.children[1]!.textContent = it.icon;
      const t = it.timer !== undefined ? `${Math.ceil(it.timer)} sn` : `${Math.round(it.dist)} m`;
      d.children[2]!.textContent = it.on ? t : `${it.label} · ${t}`;
    }
  }
  const sub = document.getElementById('subtitle');
  if (sub) {
    const st = hud.subtitle;
    const key = st ? `${st.who}|${st.text}` : '';
    if (sub.dataset.key !== key) {
      sub.dataset.key = key;
      sub.className = st ? `on ${st.who}` : '';
      sub.innerHTML = st ? `<span>${st.who === 'me' ? '📻 SEN' : '📻 TELSİZ'}</span>${st.text}` : '';
    }
  }
  const bf = document.getElementById('buffBar');
  if (bf) {
    const list = hud.buffs ?? [];
    const html = list.map((b) => `<div style="--c:${b.color}"><span>${b.icon}</span><b>${b.name}</b><i>${Math.ceil(b.left)}</i></div>`).join('');
    if (bf.dataset.h !== html) {
      bf.dataset.h = html;
      bf.innerHTML = html;
    }
  }
  const feed = document.getElementById('pickFeed');
  if (feed) {
    const list = hud.pickups ?? [];
    const key = list.map((p) => p.name).join('|');
    if (feed.dataset.key !== key) {
      feed.dataset.key = key;
      feed.innerHTML = list.map((p) => `<div><b>+ ${p.name}</b><small>${p.desc}</small></div>`).join('');
    }
    list.forEach((p, i) => {
      const d = feed.children[i] as HTMLElement | undefined;
      if (d) d.style.opacity = String(Math.max(0, Math.min(1, (3.5 - p.age) / 0.6)));
    });
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

let runAchievements: AchievementDef[] = [];
let lastAchCheck = 0;
const achQueue: AchievementDef[] = [];
let achBusy = false;
const achToast = (a: AchievementDef) => {
  achQueue.push(a);
  if (achBusy) return;
  const next = () => {
    const d = achQueue.shift();
    const box = document.getElementById('achToast');
    if (!d || !box) {
      achBusy = false;
      return;
    }
    achBusy = true;
    box.innerHTML = `<span class="i">${d.icon}</span><div><b>BAŞARIM: ${d.name}</b><small>${d.desc} · +${d.reward} CR</small></div>`;
    box.classList.add('on');
    setTimeout(() => {
      box.classList.remove('on');
      setTimeout(next, 450);
    }, 3200);
  };
  next();
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
    ['Zorluk', DIFFICULTIES[hud.runStats?.difficulty ?? 'normal'].name],
    ['Yere düşme', String(hud.runStats?.downs ?? 0)],
  ]
    .map(([k, v]) => `<div><span>${k}</span><br/><b>${v}</b></div>`)
    .join('');
  el.resultsCredits.innerHTML =
    [`+${credits} kredi · Toplam ${meta.credits} CR`, badges.length ? badges.join(' · ') : null].filter(Boolean).join(' · ') +
    (runAchievements.length ? `<div class="achRow">${runAchievements.map((a) => `<span title="${a.desc}">${a.icon} ${a.name} +${a.reward}</span>`).join('')}</div>` : '');
  renderMetaShop();
};

const onResize = () => {
  if (running) arena.setSize(root.clientWidth, root.clientHeight);
};

const restartRun = () => {
  if (running) arena.dispose();
  lobby.hide();
  el.hud.style.display = '';
  arena = createArena(root, { loadout: currentRunLoadout() });
  (window as unknown as { __pzArena?: ArenaHandle }).__pzArena = arena;
  running = true;
  runCommitted = false;
  lastCommit = null;
  runAchievements = [];
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

const toMenu = () => {
  if (running) arena.dispose();
  running = false;
  meta = loadMetaSave();
  el.results.classList.remove('on');
  el.pause.classList.remove('on');
  el.upgrade.classList.remove('on');
  el.downed.classList.remove('on');
  el.hud.style.display = 'none';
  lobby.show();
};
const lobbyHost = document.getElementById('lobby')!;
const lobby = createLobby(lobbyHost, () => restartRun());
document.getElementById('btnMenu')?.addEventListener('click', toMenu);
document.getElementById('btnPauseMenu')?.addEventListener('click', toMenu);

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || !running) return;
  const hud = arena.getHudState();
  if (!hud.alive || runCommitted || hud.runOver || hud.pausedForUpgrade) return;
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
    if (!running) {
      requestAnimationFrame(loop);
      return;
    }
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
        hud.heroAbilities.map((a) => Math.ceil(a.cooldown * 5)).join(','),
        hud.weaponSlots.findIndex((w) => w.active),
        runCommitted ? 1 : 0,
        meta.credits,
        hud.runOver ? 1 : 0,
        hud.revivesLeft ?? -1,
        Math.floor(hud.runTimeSec / 2),
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

loadProfile();
toMenu();
requestAnimationFrame(loop);
