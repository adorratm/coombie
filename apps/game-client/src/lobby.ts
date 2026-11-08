import * as THREE from 'three';
import { ensureWeaponEnvironment } from './weaponAssets';
import { holdGun, orientGun, type BoneSource } from './gunHold';
import { MAPS, MAP_ORDER } from './mapDefs';
import { DEFAULT_RUN_MINUTES, DIFFICULTIES, DIFFICULTY_ORDER, HORDE_WAVES, MODES, RUN_MINUTES, TIMED_MODES } from './gameModes';
import { HERO_LEVEL_MAX, TREE_NODES, TREE_TOTAL_RANKS, availablePoints, heroXpForLevel, loadHeroProgress, resetTree, spentPoints, unlockBlock, unlockTreeNode, type TreeBranch } from './heroProgress';
import { achievementCounts, listAchievements } from './achievements';
import { createVrmAvatar, type VrmAvatarHandle } from './avatars';
import { HERO_ABILITIES, levelCd, levelPower } from './heroAbilities';
import {
  ABILITY_MAX_LEVEL,
  ABILITY_SLOTS,
  ACCESSORIES,
  BACKPACKS,
  COSTUMES,
  abilityUpgradeCost,
  credits,
  heroLoadout,
  itemKey,
  loadProfile,
  owns,
  purchase,
  selectHero,
  slotCapacity,
  updateHero,
  upgradeAbility,
  currentMission,
  setMission,
  type AbilitySlot,
} from './loadout';
import { OPERATIVE_ROSTER, rosterById, type OperativeId } from './roster';
import { WEAPONS, attachWeaponMesh, weaponByVariant, weaponVariantId, type WeaponDef, type WeaponId } from './weapons';
import { RUN_SKILLS } from './runSkills';
import { accessoryThumb, backpackThumb, costumeSwatch, heroPortrait, thumbImg, weaponThumb } from './thumbs';

/**
 * Pre-run lobby: hero select with a live 3D preview (costume, accessories, backpack,
 * selected weapon), Dolap (cosmetics), Cephanelik (30 weapons + slots) and
 * Yetenekler (permanent Q/E/R levels). Everything is bought with run credits.
 */

type StepId = 'map' | 'mode' | 'costume' | 'gear' | 'weapons' | 'skills' | 'tree' | 'ready';
const STEPS: Array<{ id: StepId; group: string; icon: string; title: string; hint: string }> = [
  { id: 'map', group: 'GÖREV', icon: '🗺', title: 'Bölge Seç', hint: 'Operasyonun geçeceği haritayı seç.' },
  { id: 'mode', group: 'GÖREV', icon: '🎯', title: 'Mod ve Zorluk', hint: 'Görev tipini ve zorluğu belirle — zorluk ödülü artırır.' },
  { id: 'costume', group: 'DOLAP', icon: '🎽', title: 'Kamuflaj', hint: 'Bölgeye uygun kamuflajı giy.' },
  { id: 'gear', group: 'DOLAP', icon: '🎒', title: 'Çanta ve Teçhizat', hint: 'Çanta ek silah slotu açar; kask ve yelekler görünümü değiştirir.' },
  { id: 'weapons', group: 'SİLAHLAR', icon: '🔫', title: 'Cephanelik', hint: 'Slot seç, silaha tıkla, alttaki düğmeyle tak.' },
  { id: 'skills', group: 'YETENEK', icon: '⚡', title: 'Yetenekler', hint: 'Q / E / R yeteneklerini kalıcı olarak geliştir.' },
  { id: 'tree', group: 'YETENEK', icon: '🌳', title: 'Yetenek Ağacı', hint: 'Operatör seviyesi (maks 75) her seviyede 1 puan verir. Pasif, aktif ve silah özelliklerini aç.' },
  { id: 'ready', group: 'HAZIR', icon: '✔', title: 'Göreve Hazır', hint: 'Son kontrol — her şey tamamsa başla.' },
];

const FAMILY_LABEL: Record<WeaponId, string> = {
  pistol: 'Tabancalar',
  smg: 'Hafif Makineli',
  rifle: 'Tüfekler',
  shotgun: 'Pompalılar',
  sniper: 'Keskin Nişancı',
  lmg: 'Ağır Silahlar',
  knife: 'Yakın Dövüş',
  bat: 'Yakın Dövüş',
  axe: 'Yakın Dövüş',
};
const FAMILY_ORDER: WeaponId[] = ['rifle', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol', 'knife'];
const familyOf = (w: WeaponDef): WeaponId => (w.melee ? 'knife' : w.id);
const TIER_NAME = ['', 'Standart', 'Gelişmiş', 'Elit', 'Efsanevi'];
const TIER_COLOR = ['', '#8a948c', '#5b8fd6', '#a874e0', '#e0b040', '#e0b040'];
const STAT_MAX = (() => {
  let dmg = 0, rate = 0, mag = 0, range = 0;
  for (const w of WEAPONS) {
    dmg = Math.max(dmg, w.damage * (w.melee ? 1 : w.pellets));
    rate = Math.max(rate, 1 / w.fireRate);
    if (!w.melee) mag = Math.max(mag, w.magSize);
    range = Math.max(range, w.range);
  }
  return { dmg, rate, mag, range };
})();
/** [label, shown value, 0..1] rows for stat bars. */
function weaponStats(w: WeaponDef): Array<[string, string, number]> {
  const dmg = w.damage * (w.melee ? 1 : w.pellets);
  const rate = 1 / w.fireRate;
  const rows: Array<[string, string, number]> = [
    ['HASAR', dmg.toFixed(1), Math.sqrt(dmg / STAT_MAX.dmg)],
    ['ATIŞ HIZI', `${rate.toFixed(1)}/sn`, rate / STAT_MAX.rate],
  ];
  rows.push(w.melee ? ['ŞARJÖR', '—', 0] : ['ŞARJÖR', String(w.magSize), Math.min(1, w.magSize / Math.min(STAT_MAX.mag, 100))]);
  rows.push(['MENZİL', `${w.range} m`, w.range / STAT_MAX.range]);
  return rows;
}

const CSS = /* css */ `
#lobby { position: absolute; inset: 0; z-index: 40; display: none; color: var(--text);
  background: radial-gradient(1200px 700px at 50% 40%, #121a16 0%, #07090c 70%); font-family: var(--font); }
#lobby.on { display: grid; grid-template-columns: 280px 1fr minmax(560px, 44vw); grid-template-rows: 64px 1fr 76px; }
#lobby .lb-top { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; padding: 0 22px;
  border-bottom: 1px solid var(--line); background: rgba(6,8,10,0.6); }
#lobby .lb-logo { font: 700 28px var(--display); letter-spacing: .12em; }
#lobby .lb-logo b { color: #00ff87; }
#lobby .lb-logo .lb-co { font: 700 11px var(--display); letter-spacing: .2em; color: var(--dim); margin-left: 10px; padding: 2px 6px; border: 1px solid var(--line-strong); vertical-align: middle; }
#lobby .lb-cr { font: 700 20px var(--display); color: var(--gold); letter-spacing: .04em; }
#lobby .lb-heroes { padding: 12px; overflow-y: auto; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
#lobby .hero { display: grid; grid-template-columns: 38px 1fr; gap: 10px; align-items: center; padding: 8px 10px;
  border: 1px solid var(--line); background: rgba(14,18,22,0.75); cursor: pointer; text-align: left; color: inherit; font: inherit; }
#lobby .hero:hover { border-color: var(--line-strong); }
#lobby .hero.on { border-color: #00ff87; background: rgba(0,255,135,0.07); }
#lobby .hero .ic { width: 38px; height: 38px; display: grid; place-items: center; font: 700 14px var(--display); border: 1px solid var(--line-strong); }
#lobby .hero .nm { font: 700 16px var(--display); letter-spacing: .05em; }
#lobby .hero .rl { font-size: 12px; color: var(--dim); }
#lobby .lb-stage { position: relative; }
#lobby .lb-stage canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; cursor: grab; }
#lobby .lb-name { position: absolute; left: 24px; top: 18px; pointer-events: none; }
#lobby .lb-name h1 { margin: 0; font: 700 44px var(--display); letter-spacing: .06em; line-height: 1; }
#lobby .lb-name p { margin: 6px 0 0; color: var(--dim); font-size: 14px; }
#lobby .lb-side { border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; background: rgba(6,8,10,0.45); }
#lobby .tabs { display: flex; border-bottom: 1px solid var(--line); }
#lobby .tabs button { flex: 1; padding: 12px 6px; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--dim);
  font: 700 15px var(--display); letter-spacing: .08em; cursor: pointer; }
#lobby .tabs button.on { color: var(--text); border-bottom-color: #00ff87; }
#lobby .panel { flex: 1; overflow-y: auto; padding: 14px; min-height: 0; }
#lobby h3 { margin: 14px 0 8px; font: 700 13px var(--display); letter-spacing: .14em; color: var(--dim); text-transform: uppercase; }
#lobby h3:first-child { margin-top: 0; }
#lobby .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
#lobby .item { padding: 9px 10px; border: 1px solid var(--line); background: rgba(14,18,22,0.8); cursor: pointer; text-align: left;
  color: inherit; font: inherit; display: flex; flex-direction: column; gap: 3px; position: relative; }
#lobby .item:hover { border-color: var(--line-strong); }
#lobby .item.on { border-color: #00ff87; }
#lobby .item.locked { opacity: .9; }
#lobby .item b { font: 700 14px var(--display); letter-spacing: .03em; }
#lobby .item small { color: var(--dim); font-size: 11.5px; line-height: 1.3; }
#lobby .item .price { font: 700 12px var(--display); color: var(--gold); }
#lobby .item .price.no { color: var(--danger); }
#lobby .item .tag { position: absolute; top: 7px; right: 8px; font: 700 10px var(--display); color: var(--dim); letter-spacing: .08em; }
#lobby .item .sw { width: 100%; height: 6px; margin-top: 2px; }
#lobby .item.t2 { box-shadow: inset 3px 0 0 #3b82f6; } #lobby .item.t3 { box-shadow: inset 3px 0 0 #a855f7; } #lobby .item.t4 { box-shadow: inset 3px 0 0 var(--gold); }
#lobby .slots { display: flex; flex-wrap: wrap; gap: 5px; }
#lobby .slotb { flex: 1 1 calc(25% - 5px); min-width: 0; padding: 7px 6px; border: 1px dashed var(--line-strong); background: rgba(14,18,22,0.8);
  color: inherit; font: 600 12px var(--display); cursor: pointer; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#lobby .slotb .n { color: var(--gold); margin-right: 4px; }
#lobby .slotb.on { border-style: solid; border-color: var(--gold); }
#lobby .slotb.lock { opacity: .35; cursor: default; }
#lobby .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 8px; font-size: 11px; color: var(--dim); }
#lobby .stats i { font-style: normal; color: var(--text); }
#lobby .lskill { display: grid; grid-template-columns: 52px 1fr; gap: 12px; padding: 12px; border: 1px solid var(--line); background: rgba(14,18,22,0.8); margin-bottom: 8px; }
#lobby .lskill .ic { width: 52px; height: 52px; display: grid; place-items: center; font-size: 24px; border: 1px solid var(--line-strong); position: relative; }
#lobby .lskill .ic .k { position: absolute; top: 1px; left: 4px; font: 700 12px var(--display); }
#lobby .lskill b { font: 700 16px var(--display); }
#lobby .tlv { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--line); background: rgba(14,18,22,0.8); margin-bottom: 10px; }
#lobby .tlv .big { font: 700 30px var(--display); color: var(--gold); min-width: 64px; text-align: center; }
#lobby .tlv .bar { height: 6px; background: rgba(255,255,255,0.08); margin-top: 6px; }
#lobby .tlv .bar i { display: block; height: 100%; background: var(--gold); }
#lobby .tcols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
#lobby .tcol h4 { margin: 0 0 6px; font: 700 13px var(--display); letter-spacing: .08em; color: var(--dim); }
#lobby .tnode { display: grid; grid-template-columns: 30px 1fr; gap: 8px; width: 100%; text-align: left; padding: 8px; margin-bottom: 6px; border: 1px solid var(--line); background: rgba(14,18,22,0.8); color: inherit; cursor: pointer; font: inherit; }
#lobby .tnode .ti { font-size: 20px; line-height: 30px; text-align: center; }
#lobby .tnode b { font: 700 13px var(--display); display: block; }
#lobby .tnode small { display: block; color: var(--dim); font-size: 11px; line-height: 1.3; }
#lobby .tnode .tr { font: 700 11px var(--display); color: var(--gold); }
#lobby .tnode .tt { font: 700 9.5px var(--display); letter-spacing: .08em; color: var(--dim); }
#lobby .tnode.can { border-color: #00ff87; }
#lobby .tnode.full { border-color: var(--gold); }
#lobby .tnode.lock { opacity: .4; cursor: default; }
#lobby .tnode:disabled { cursor: default; }
#lobby .durs { display: flex; gap: 6px; flex-wrap: wrap; }
#lobby .durs button { flex: 1 1 0; padding: 10px 6px; border: 1px solid var(--line-strong); background: rgba(14,18,22,0.8); color: inherit; font: 700 14px var(--display); cursor: pointer; }
#lobby .durs button.on { border-color: #00ff87; color: #00ff87; }
@media (max-width: 760px) { #lobby .tcols { grid-template-columns: 1fr; } }
#lobby .pips { display: flex; gap: 3px; margin: 6px 0; }
#lobby .pips i { width: 22px; height: 5px; background: #222a31; }
#lobby .pips i.on { background: #00ff87; }
#lobby .btn { padding: 7px 12px; border: 1px solid var(--line-strong); background: #141b22; color: var(--text); font: 700 13px var(--display);
  letter-spacing: .06em; cursor: pointer; }
#lobby .btn:disabled { opacity: .4; cursor: default; }
#lobby .btn.go { background: #00ff87; color: #04110a; border-color: #00ff87; }
#lobby .lb-bot { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 22px;
  border-top: 1px solid var(--line); background: rgba(6,8,10,0.6); }
#lobby .lb-bot .sum { color: var(--dim); font-size: 13px; }
#lobby .lb-bot .sum b { color: var(--text); }
#lobby .start { padding: 14px 46px; font: 700 22px var(--display); letter-spacing: .16em; background: #00ff87; color: #04110a; border: 0; cursor: pointer; }
#lobby .start:hover { filter: brightness(1.08); }
#lobby .maps { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 8px; }
#lobby .mapc { text-align: left; padding: 10px 12px; border: 1px solid var(--line); border-left: 3px solid var(--ac); background: rgba(14,18,22,0.85);
  color: var(--text); cursor: pointer; display: grid; gap: 2px; }
#lobby .mapc b { font: 700 15px var(--display); }
#lobby .mapc .tg { font: 600 11px var(--display); color: var(--ac); letter-spacing: .05em; }
#lobby .mapc small { color: var(--dim); font-size: 11px; line-height: 1.3; }
#lobby .mapc .md { font-size: 12px; opacity: .8; }
#lobby .mapc.on { background: color-mix(in srgb, var(--ac) 14%, #0e1216); box-shadow: inset 0 0 0 1px var(--ac); }
#lobby .diffs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
#lobby .diff { padding: 8px 6px; border: 1px solid var(--line); border-top: 3px solid var(--ac); background: rgba(14,18,22,0.85); color: var(--text);
  cursor: pointer; display: grid; gap: 3px; text-align: left; }
#lobby .diff b { font: 700 13px var(--display); color: var(--ac); }
#lobby .diff small { color: var(--dim); font-size: 10px; line-height: 1.25; }
#lobby .diff span { font: 600 10px var(--display); color: var(--gold, #f5c542); }
#lobby .diff.on { background: color-mix(in srgb, var(--ac) 16%, #0e1216); box-shadow: inset 0 0 0 1px var(--ac); }
#lobby .ach { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line);
  background: rgba(14,18,22,0.8); margin-bottom: 5px; opacity: .78; }
#lobby .ach.done { opacity: 1; border-color: #f5c54266; }
#lobby .ach .i { font-size: 24px; text-align: center; filter: grayscale(1); }
#lobby .ach.done .i { filter: none; }
#lobby .ach b { font: 700 14px var(--display); }
#lobby .ach small { color: var(--dim); font-size: 11px; display: block; }
#lobby .ach .bar { height: 4px; background: #1c232a; margin-top: 4px; }
#lobby .ach .bar i { display: block; height: 100%; background: #f5c542; }
#lobby .ach .rw { font: 700 11px var(--display); color: #f5c542; white-space: nowrap; }
#lobby .toast { position: absolute; left: 50%; top: 76px; transform: translateX(-50%); padding: 8px 16px; background: #1c1210; border: 1px solid var(--danger);
  font: 700 14px var(--display); opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 2; }
#lobby .toast.ok { border-color: #00ff87; background: #0d1a12; }
#lobby .toast.on { opacity: 1; }
/* ---------- right panel: visual cards ---------- */
#lobby .lb-side { background: linear-gradient(180deg, rgba(10,13,12,0.92), rgba(6,8,10,0.92)); }
#lobby .tabs { background: rgba(0,0,0,0.25); }
#lobby .tabs button { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 4px 9px; font-size: 13px; }
#lobby .tabs button .ti { font-size: 17px; line-height: 1; filter: grayscale(1) brightness(1.4); opacity: .7; }
#lobby .tabs button.on .ti { filter: none; opacity: 1; }
#lobby .tabs button:hover { color: var(--text); background: rgba(255,255,255,0.03); }
#lobby .panel { padding: 16px 16px 24px; }
#lobby .panel::-webkit-scrollbar { width: 6px; } #lobby .panel::-webkit-scrollbar-thumb { background: #2a3530; }
#lobby h3 { display: flex; align-items: center; gap: 8px; }
#lobby h3::after { content: ''; flex: 1; height: 1px; background: var(--line); }
#lobby img.th { display: block; width: 100%; height: 100%; object-fit: contain; }
#lobby img.th.loading { opacity: 0; }
#lobby img.th { transition: opacity .25s; }
/* weapon detail */
#lobby .wdet { border: 1px solid var(--line-strong); background: radial-gradient(120% 90% at 50% 30%, #1b2420 0%, #0b0f0e 70%); margin-bottom: 14px; position: relative; }
#lobby .wdet .pic { height: 150px; padding: 8px 18px 0; }
#lobby .wdet .body { padding: 10px 14px 14px; border-top: 1px solid var(--line); background: rgba(0,0,0,0.25); }
#lobby .wdet .hd { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
#lobby .wdet .hd b { font: 700 22px var(--display); letter-spacing: .04em; }
#lobby .wdet .fam { font: 600 11px var(--display); color: var(--dim); letter-spacing: .12em; text-transform: uppercase; }
#lobby .wdet p { margin: 4px 0 10px; color: var(--dim); font-size: 12.5px; }
#lobby .tierb { position: absolute; top: 10px; left: 10px; font: 700 10px var(--display); letter-spacing: .14em; padding: 3px 8px; border: 1px solid var(--tc); color: var(--tc); background: rgba(0,0,0,0.5); }
#lobby .bars { display: grid; grid-template-columns: 74px 1fr 38px; gap: 5px 10px; align-items: center; font: 600 11px var(--display); color: var(--dim); letter-spacing: .06em; }
#lobby .bars .bar { height: 6px; background: #1a211e; position: relative; overflow: hidden; }
#lobby .bars .bar i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #6f8b5c, #c9d6a0); }
#lobby .bars .v { color: var(--text); text-align: right; }
#lobby .wdet .wact { display: flex; gap: 8px; margin-top: 12px; }
#lobby .wdet .wact .btn { flex: 1 1 auto; width: 100%; padding: 10px; font-size: 14px; }
#lobby .btn.buy { background: var(--gold); color: #1a1406; border-color: var(--gold); }
/* slots */
#lobby .wslots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 4px; }
#lobby .wslot { position: relative; height: 62px; border: 1px solid var(--line); background: rgba(14,18,22,0.85); cursor: pointer; padding: 0; color: inherit; overflow: hidden; }
#lobby .wslot img.th { position: absolute; top: 8px; left: 8px; width: calc(100% - 16px); height: calc(100% - 24px); }
#lobby .wslot .n { position: absolute; top: 3px; left: 5px; font: 700 11px var(--display); color: var(--gold); }
#lobby .wslot .nm { position: absolute; left: 0; right: 0; bottom: 2px; font: 600 10px var(--display); text-align: center; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
#lobby .wslot.on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
#lobby .wslot.lock { opacity: .35; cursor: default; display: grid; place-items: center; font: 600 10px var(--display); color: var(--dim); }
/* image cards */
#lobby .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
#lobby .cards.two { grid-template-columns: repeat(2, 1fr); }
#lobby .card { position: relative; border: 1px solid var(--line); background: linear-gradient(180deg, #141a18, #0d1110); cursor: pointer; padding: 0; color: inherit; text-align: left; display: flex; flex-direction: column; overflow: hidden; transition: border-color .12s, transform .12s; }
#lobby .card:hover { border-color: var(--line-strong); transform: translateY(-1px); }
#lobby .card.on { border-color: #00ff87; box-shadow: inset 0 0 0 1px #00ff87; }
#lobby .card.sel { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
#lobby .card .pic { height: 64px; padding: 6px 8px 2px; background: radial-gradient(90% 80% at 50% 45%, rgba(255,255,255,0.06), transparent 70%); }
#lobby .card .pic.tall { height: 86px; }
#lobby .card .pic.sw { padding: 0; height: 58px; }
#lobby .card .pic.sw img { object-fit: cover; }
#lobby .card .cb { padding: 6px 8px 7px; border-top: 1px solid var(--line); display: grid; gap: 2px; }
#lobby .card .cb b { font: 700 12.5px var(--display); letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#lobby .card .cb small { color: var(--dim); font-size: 10.5px; line-height: 1.25; }
#lobby .card .st { font: 700 10.5px var(--display); letter-spacing: .06em; }
#lobby .card .st.own { color: var(--ok); } #lobby .card .st.cr { color: var(--gold); } #lobby .card .st.no { color: var(--danger); } #lobby .card .st.eq { color: #00ff87; }
#lobby .card .tstrip { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--tc, transparent); }
#lobby .card .mini { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin: 2px 0 1px; }
#lobby .card .mini span { height: 3px; background: #1a211e; position: relative; }
#lobby .card .mini span i { position: absolute; inset: 0 auto 0 0; background: #8fa772; }
#lobby .card .slotTag { position: absolute; top: 5px; right: 6px; font: 700 9.5px var(--display); background: #00ff87; color: #04110a; padding: 1px 5px; }
/* maps */
#lobby .maps { grid-template-columns: repeat(2, 1fr); gap: 8px; }
#lobby .mapc { padding: 0; overflow: hidden; border-left-width: 1px; position: relative; }
#lobby .mapc .mimg { height: 92px; background: #111 center/cover no-repeat; position: relative; }
#lobby .mapc .mimg::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 35%, rgba(5,7,8,0.92)); }
#lobby .mapc .mimg b { position: absolute; left: 10px; bottom: 6px; z-index: 1; font: 700 16px var(--display); text-shadow: 0 1px 3px #000; }
#lobby .mapc .mimg .tg { position: absolute; right: 8px; top: 6px; z-index: 1; background: rgba(0,0,0,0.6); padding: 1px 6px; }
#lobby .mapc .mt { padding: 7px 10px 8px; display: grid; gap: 3px; border-top: 2px solid var(--ac); }
#lobby .modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
#lobby .mode { border: 1px solid var(--line); background: rgba(14,18,22,0.85); color: var(--text); cursor: pointer; padding: 10px 8px; text-align: left; display: grid; gap: 3px; }
#lobby .mode .mi { font-size: 22px; line-height: 1; }
#lobby .mode b { font: 700 13px var(--display); }
#lobby .mode small { color: var(--dim); font-size: 10.5px; line-height: 1.25; }
#lobby .mode.on { border-color: #00ff87; box-shadow: inset 0 0 0 1px #00ff87; background: rgba(0,255,135,0.06); }
/* ---------- hero roster (left) ---------- */
#lobby .lb-heroes { padding: 14px 12px; gap: 8px; background: linear-gradient(180deg, rgba(8,11,10,0.9), rgba(5,7,8,0.9)); }
#lobby .lb-heroes .rhd { font: 700 12px var(--display); letter-spacing: .2em; color: var(--dim); padding: 0 2px 4px; display: flex; justify-content: space-between; }
#lobby .hero { position: relative; grid-template-columns: 64px 1fr; gap: 12px; padding: 7px 10px 7px 7px; overflow: hidden;
  background: linear-gradient(90deg, color-mix(in srgb, var(--ac) 10%, #0e1312) 0%, #0b0e0e 70%); border-color: #1e2624; transition: transform .12s, border-color .12s; }
#lobby .hero { flex-shrink: 0; }
#lobby .hero::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--ac); opacity: .55; }
#lobby .hero:hover { transform: translateX(2px); border-color: color-mix(in srgb, var(--ac) 50%, #1e2624); }
#lobby .hero.on { border-color: var(--ac); background: linear-gradient(90deg, color-mix(in srgb, var(--ac) 26%, #0e1312) 0%, #0d1211 80%); box-shadow: 0 0 18px color-mix(in srgb, var(--ac) 25%, transparent); }
#lobby .hero.on::before { opacity: 1; width: 4px; }
#lobby .hero .por { width: 64px; height: 64px; position: relative; background: radial-gradient(80% 80% at 50% 35%, color-mix(in srgb, var(--ac) 35%, #1a201e), #0a0d0c); border: 1px solid color-mix(in srgb, var(--ac) 45%, #222); overflow: hidden; }
#lobby .hero .por img { width: 100%; height: 100%; object-fit: cover; display: block; }
#lobby .hero .por .ini { position: absolute; inset: 0; display: grid; place-items: center; font: 700 18px var(--display); color: var(--ac); }
#lobby .hero .por img:not(.loading) + .ini { display: none; }
#lobby .hero .nm { font: 700 17px var(--display); letter-spacing: .06em; }
#lobby .hero.on .nm { color: var(--ac); }
#lobby .hero .rl { font-size: 11.5px; color: var(--dim); margin-bottom: 4px; }
#lobby .hero .hs { display: grid; grid-template-columns: 26px 1fr; gap: 2px 6px; align-items: center; font: 600 9px var(--display); color: var(--dim); letter-spacing: .08em; }
#lobby .hero .hs span.b { height: 3px; background: #1c2321; position: relative; }
#lobby .hero .hs span.b i { position: absolute; inset: 0 auto 0 0; background: var(--ac); opacity: .8; }
#lobby .hero .ab { position: absolute; right: 8px; top: 8px; display: flex; gap: 3px; font-size: 12px; opacity: .55; }
#lobby .hero.on .ab { opacity: 1; }
/* ---------- stepper ---------- */
#lobby .stepper { display: flex; padding: 12px 14px 0; gap: 4px; background: rgba(0,0,0,0.25); border-bottom: 1px solid var(--line); }
#lobby .stepper .sg { flex: 1; display: grid; gap: 6px; padding-bottom: 10px; cursor: pointer; background: none; border: 0; color: var(--dim); text-align: left; font: inherit; }
#lobby .stepper .sg .gl { font: 700 11px var(--display); letter-spacing: .14em; display: flex; align-items: center; gap: 6px; }
#lobby .stepper .sg .gl .gi { font-size: 14px; filter: grayscale(1); opacity: .6; }
#lobby .stepper .sg .bars2 { display: flex; gap: 3px; }
#lobby .stepper .sg .bars2 i { flex: 1; height: 4px; background: #222b28; }
#lobby .stepper .sg .bars2 i.done { background: #5a7a62; }
#lobby .stepper .sg .bars2 i.cur { background: #00ff87; box-shadow: 0 0 8px #00ff8788; }
#lobby .stepper .sg.cur { color: var(--text); }
#lobby .stepper .sg.cur .gl .gi, #lobby .stepper .sg.done .gl .gi { filter: none; opacity: 1; }
#lobby .stepper .sg:hover { color: var(--text); }
#lobby .stephead { padding: 14px 20px 10px; display: grid; grid-template-columns: auto 1fr; gap: 0 14px; align-items: center; }
#lobby .stephead .big { grid-row: span 2; width: 48px; height: 48px; display: grid; place-items: center; font-size: 24px; border: 1px solid #00ff8766; background: rgba(0,255,135,0.06); }
#lobby .stephead h2 { margin: 0; font: 700 26px var(--display); letter-spacing: .06em; display: flex; align-items: baseline; gap: 10px; }
#lobby .stephead h2 small { font: 700 12px var(--display); color: var(--dim); letter-spacing: .14em; }
#lobby .stephead p { margin: 2px 0 0; color: var(--dim); font-size: 13px; }
#lobby .stepnav { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--line); background: rgba(0,0,0,0.3); }
#lobby .stepnav button { padding: 11px 26px; font: 700 15px var(--display); letter-spacing: .12em; cursor: pointer; border: 1px solid var(--line-strong); background: #141b19; color: var(--text); }
#lobby .stepnav button:disabled { opacity: .3; cursor: default; }
#lobby .stepnav button.nx { background: #00ff87; color: #04110a; border-color: #00ff87; min-width: 180px; }
#lobby .stepnav button.nx.go { background: var(--gold); border-color: var(--gold); color: #1a1406; }
#lobby .stepnav .pg { display: flex; gap: 6px; }
#lobby .stepnav .pg i { width: 8px; height: 8px; border-radius: 50%; background: #2a3431; cursor: pointer; }
#lobby .stepnav .pg i.on { background: #00ff87; }
#lobby .lb-top #lbFs { margin-left: auto; margin-right: 8px; color: #b8c4cc; border-color: #b8c4cc55; background: rgba(184,196,204,0.06); }
#lobby .lb-top .achb { margin-left: auto; margin-right: 22px; padding: 6px 12px; border: 1px solid #f5c54266; background: rgba(245,197,66,0.06); color: #f5c542; font: 700 13px var(--display); letter-spacing: .08em; cursor: pointer; }
#lobby .lb-top .achb.on { background: #f5c542; color: #1a1406; }
/* bigger cards in the wider panel */
#lobby .panel { padding: 6px 20px 20px; }
#lobby .cards { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
#lobby .card .pic { height: 78px; }
#lobby .card .pic.tall { height: 110px; }
#lobby .card .pic.sw { height: 80px; }
#lobby .maps { grid-template-columns: repeat(auto-fill, minmax(178px, 1fr)); gap: 10px; }
#lobby .mapc .mimg { height: 100px; }
#lobby .modes { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
#lobby .mode { padding: 14px 12px; }
#lobby .mode .mi { font-size: 28px; }
#lobby .diffs { gap: 6px; }
#lobby .diff { padding: 12px 8px; }
#lobby .armtop { display: grid; grid-template-columns: 1.25fr 1fr; gap: 12px; align-items: start; margin-bottom: 6px; }
#lobby .armtop .wdet { margin-bottom: 0; }
#lobby .armtop .wslots { grid-template-columns: repeat(2, 1fr); }
#lobby .armtop .wslot { height: 70px; }
#lobby .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
#lobby .chip { padding: 6px 12px; border: 1px solid var(--line); background: #101513; color: var(--dim); font: 700 12px var(--display); letter-spacing: .06em; cursor: pointer; }
#lobby .chip.on { color: #04110a; background: #00ff87; border-color: #00ff87; }
#lobby .chip .c { opacity: .6; margin-left: 4px; }
/* ready summary */
#lobby .ready { display: grid; gap: 12px; }
#lobby .ready .rmap { height: 170px; background: #111 center/cover; position: relative; border: 1px solid var(--line-strong); }
#lobby .ready .rmap::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 30%, rgba(4,6,7,0.95)); }
#lobby .ready .rmap div { position: absolute; left: 16px; bottom: 12px; z-index: 1; }
#lobby .ready .rmap b { display: block; font: 700 28px var(--display); letter-spacing: .05em; }
#lobby .ready .rmap span { color: var(--dim); font-size: 13px; }
#lobby .ready .row { display: grid; grid-template-columns: 110px 1fr; gap: 14px; align-items: center; border: 1px solid var(--line); background: rgba(14,18,22,0.7); padding: 10px 12px; }
#lobby .ready .row > span { font: 700 11px var(--display); letter-spacing: .14em; color: var(--dim); }
#lobby .ready .guns { display: flex; gap: 6px; flex-wrap: wrap; }
#lobby .ready .guns div { width: 88px; text-align: center; font: 600 10px var(--display); color: var(--dim); }
#lobby .ready .guns img { width: 88px; height: 40px; object-fit: contain; display: block; }
#lobby .ready .abil { display: flex; gap: 14px; flex-wrap: wrap; }
#lobby .ready .abil div { display: flex; gap: 6px; align-items: center; font: 600 13px var(--display); }
#lobby .ready .abil i { font-style: normal; font-size: 18px; }
#lobby .ready .abil .k { color: var(--gold); }
@media (max-width: 1100px) {
  #lobby.on { grid-template-columns: 1fr; grid-template-rows: 56px 170px minmax(260px, 1fr) 1.2fr 70px; }
  #lobby .lb-heroes { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  #lobby .hero { min-width: 150px; }
  #lobby .lb-side { border-left: 0; border-top: 1px solid var(--line); }
}
`;

export interface Lobby {
  show: () => void;
  hide: () => void;
  dispose: () => void;
}

export function createLobby(host: HTMLElement, onStart: () => void): Lobby {
  if (!document.getElementById('lobby-css')) {
    const st = document.createElement('style');
    st.id = 'lobby-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  host.innerHTML = `
    <div class="lb-top"><div class="lb-logo">COOM<b>BIE</b><small class="lb-co">CO-OP</small></div><button type="button" class="achb" id="lbFs" title="Tam ekranda Ctrl+W sekmeyi kapatmaz">⛶ TAM EKRAN</button><button type="button" class="achb" id="lbAch" style="margin-left:0">🏆 BAŞARIMLAR</button><div class="lb-cr" id="lbCr"></div></div>
    <div class="lb-heroes" id="lbHeroes"></div>
    <div class="lb-stage" id="lbStage"><div class="lb-name"><h1 id="lbName"></h1><p id="lbRole"></p></div><div class="toast" id="lbToast"></div></div>
    <div class="lb-side">
      <div class="stepper" id="lbTabs"></div>
      <div class="stephead" id="lbStepHead"></div>
      <div class="panel" id="lbPanel"></div>
      <div class="stepnav"><button type="button" id="lbPrev">‹ GERİ</button><div class="pg" id="lbPg"></div><button type="button" class="nx" id="lbNext">İLERİ ›</button></div>
    </div>
    <div class="lb-bot"><div class="sum" id="lbSum"></div><button class="start" id="lbStart" type="button">GÖREVE BAŞLA</button></div>`;
  const $ = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  let step = 0;
  let achOpen = false;
  let famSel: WeaponId | null = null;
  let selSlot = 0;
  let previewWeapon: string | null = null;

  // ---------------------------------------------------------------- 3D stage
  const stage = $('lbStage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  ensureWeaponEnvironment(renderer);
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  stage.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07090c, 8, 18);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 1.45, 5.6);
  camera.lookAt(0, 1.05, 0);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a1410, 1.1));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
  key.position.set(2.5, 4.5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5cffb0, 1.6);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ color: 0x0f1512, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.2, 64), new THREE.MeshBasicMaterial({ color: 0x00ff87, transparent: true, opacity: 0.5 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  scene.add(ring);
  const turntable = new THREE.Group();
  scene.add(turntable);

  let avatar: VrmAvatarHandle | null = null;
  let gun: THREE.Group | null = null;
  let buildToken = 0;
  const fixedYaw = new URLSearchParams(location.search).get('yaw');
  let yaw = fixedYaw !== null ? Number(fixedYaw) : -0.35;
  let dragging = false;
  let lastX = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
  });
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.01;
    lastX = e.clientX;
  });

  const resize = () => {
    const r = stage.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  let previewDef: WeaponDef | null = null;
  const equipPreviewGun = (variant: string) => {
    if (!avatar?.rightHand) return;
    gun?.removeFromParent();
    const def = weaponByVariant(variant);
    previewDef = def;
    const hero = rosterById(loadProfile().hero);
    gun = new THREE.Group();
    attachWeaponMesh(gun, def, hero.accent, 1);
    const hand = avatar.rightHand;
    hand.add(gun);
    avatar.root.updateMatrixWorld(true);
    const hs = hand.getWorldScale(new THREE.Vector3()).x / Math.max(1e-6, avatar.root.getWorldScale(new THREE.Vector3()).x);
    gun.scale.setScalar(0.92 / hs);
    gun.position.set(0.075 / hs, -0.01 / hs, 0.02 / hs);
  };

  const rebuildAvatar = async () => {
    const token = ++buildToken;
    const p = loadProfile();
    const hero = rosterById(p.hero);
    const h = heroLoadout(p.hero);
    const next = await createVrmAvatar({
      url: hero.avatarUrl,
      accentColor: hero.accent,
      gender: hero.gender,
      style: 'operative',
      showRing: false,
      cosmetics: {
        costume: COSTUMES.find((c) => c.id === h.costume),
        accessories: h.accessories,
        backpack: h.backpack,
        gender: hero.gender,
      },
    });
    if (token !== buildToken) {
      next.dispose();
      return;
    }
    avatar?.dispose();
    gun = null;
    avatar = next;
    turntable.add(next.root);
    next.root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
    equipPreviewGun(previewWeapon ?? h.slots[selSlot] ?? h.slots[0] ?? 'rifle');
  };

  const clock = new THREE.Clock();
  let raf = 0;
  let shotT = 0;
  let serial = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    if (!dragging && fixedYaw === null) yaw += dt * 0.25;
    turntable.rotation.y = yaw;
    if (avatar) {
      shotT += dt;
      if (shotT > 2.8) {
        shotT = 0;
        serial++;
      }
      avatar.update(dt, false, true, 0, 0, false, 0, {
        grip: previewDef?.grip ?? 'rifle',
        anim: { localVelX: 0, localVelZ: 0, shotSerial: serial, hitSerial: 0, abilitySerial: 0, reloading: false, reloadTime: 2, alive: true },
      });
      if (gun?.parent) {
        const melee = !!previewDef?.melee;
        if (melee || !(avatar.vrm as unknown as { isHumanoidRig?: boolean }).isHumanoidRig) orientGun(avatar.root, gun, melee ? -0.15 : 0.06);
        else holdGun(avatar.vrm as unknown as BoneSource, avatar.root, gun, 0.06, 1);
      }
    }
    renderer.render(scene, camera);
  };

  // ---------------------------------------------------------------- UI
  let toastTimer = 0;
  const toast = (msg: string, ok = false) => {
    const t = $('lbToast');
    t.textContent = msg;
    t.className = `toast on${ok ? ' ok' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (t.className = 'toast'), 1600);
  };
  const cr = (n: number) => `${n.toLocaleString('tr-TR')} CR`;
  const hexc = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

  const buy = (key: string, cost: number, name: string): boolean => {
    if (owns(key)) return true;
    if (credits() < cost) {
      toast(`Yetersiz kredi: ${name} için ${cr(cost)} gerekli`);
      return false;
    }
    if (purchase(key, cost)) {
      toast(`${name} satın alındı`, true);
      return true;
    }
    return false;
  };

  const renderHeroes = () => {
    const p = loadProfile();
    const hd = document.createElement('div');
    hd.className = 'rhd';
    hd.innerHTML = `<span>OPERATÖR SEÇ</span><span>${OPERATIVE_ROSTER.length}</span>`;
    $('lbHeroes').replaceChildren(
      hd,
      ...OPERATIVE_ROSTER.map((h) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `hero${h.id === p.hero ? ' on' : ''}`;
        b.style.setProperty('--ac', hexc(h.accent));
        const ab = HERO_ABILITIES[h.id];
        const hl = heroLoadout(h.id);
        const por = document.createElement('div');
        por.className = 'por';
        const cos = { costume: COSTUMES.find((c) => c.id === hl.costume), accessories: hl.accessories, backpack: 0 as const, gender: h.gender };
        por.append(thumbImg(heroPortrait(`${h.id}:${hl.costume}:${hl.accessories.join('+')}`, h.avatarUrl, h.gender, cos)));
        por.insertAdjacentHTML('beforeend', `<span class="ini">${h.icon}</span>`);
        const info = document.createElement('div');
        info.innerHTML = `<div class="nm">${h.name} <small style="color:var(--gold);font-size:11px">Sv ${loadHeroProgress(h.id).level}</small></div><div class="rl">${h.role} · ${h.gender === 'male' ? 'Erkek' : 'Kadın'}</div>
          <div class="hs"><span>CAN</span><span class="b"><i style="width:${Math.round((h.hp / 140) * 100)}%"></i></span><span>HIZ</span><span class="b"><i style="width:${Math.round((h.speed / 8) * 100)}%"></i></span></div>`;
        b.append(por, info);
        b.insertAdjacentHTML('beforeend', `<span class="ab" title="Q · E · R">${ab.q.icon}${ab.e.icon}${ab.r.icon}</span>`);
        b.onclick = () => {
          if (h.id === loadProfile().hero) return;
          selectHero(h.id);
          selSlot = 0;
          previewWeapon = null;
          renderAll();
          void rebuildAvatar();
        };
        return b;
      }),
    );
  };

  /** Image card: picture on top, name + status below. */
  const card = (opts: { img: HTMLImageElement; picCls?: string; name: string; desc?: string; status: string; statusCls: string; on?: boolean; sel?: boolean; tier?: number; extra?: string; slotTag?: string; onClick: () => void }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `card${opts.on ? ' on' : ''}${opts.sel ? ' sel' : ''}`;
    if (opts.tier) b.style.setProperty('--tc', TIER_COLOR[opts.tier]!);
    const pic = document.createElement('div');
    pic.className = `pic${opts.picCls ? ` ${opts.picCls}` : ''}`;
    pic.append(opts.img);
    const body = document.createElement('div');
    body.className = 'cb';
    body.innerHTML = `<b>${opts.name}</b>${opts.desc ? `<small>${opts.desc}</small>` : ''}${opts.extra ?? ''}<span class="st ${opts.statusCls}">${opts.status}</span>`;
    b.innerHTML = `${opts.tier ? '<span class="tstrip"></span>' : ''}${opts.slotTag ? `<span class="slotTag">${opts.slotTag}</span>` : ''}`;
    b.append(pic, body);
    b.onclick = opts.onClick;
    return b;
  };
  const priceStatus = (owned: boolean, on: boolean, cost: number) =>
    owned ? { status: on ? 'TAKILI' : 'SAHİP', statusCls: on ? 'eq' : 'own' } : { status: cr(cost), statusCls: credits() < cost ? 'no' : 'cr' };

  const renderLocker = (panel: HTMLElement) => {
    const p = loadProfile();
    const heroId = p.hero;
    const h = heroLoadout(heroId);
    const sec = (t: string) => Object.assign(document.createElement('h3'), { textContent: t });
    const grid = (two = false) => Object.assign(document.createElement('div'), { className: `cards${two ? ' two' : ''}` });

    panel.append(sec('Kamuflaj / Kostüm'));
    const g1 = grid();
    for (const c of COSTUMES) {
      const key = itemKey.costume(c.id);
      const on = h.costume === c.id;
      g1.append(
        card({
          img: thumbImg(costumeSwatch(c.primary, c.secondary, c.glow)),
          picCls: 'sw',
          name: c.name,
          ...priceStatus(owns(key), on, c.cost),
          on,
          onClick: () => {
            if (!buy(key, c.cost, c.name)) return;
            updateHero(heroId, (x) => (x.costume = c.id));
            renderAll();
            void rebuildAvatar();
          },
        }),
      );
    }
    panel.append(g1);

    panel.append(sec('Sırt Çantası · ek silah slotu'));
    const g2 = grid();
    g2.append(
      card({
        img: thumbImg(costumeSwatch(0x1a1e1c, 0x101312)),
        picCls: 'tall sw',
        name: 'Çantasız',
        desc: '5 silah slotu',
        status: h.backpack === 0 ? 'TAKILI' : 'SAHİP',
        statusCls: h.backpack === 0 ? 'eq' : 'own',
        on: h.backpack === 0,
        onClick: () => (updateHero(heroId, (x) => (x.backpack = 0)), renderAll(), void rebuildAvatar()),
      }),
    );
    for (const bp of BACKPACKS) {
      const key = itemKey.backpack(bp.tier);
      const on = h.backpack === bp.tier;
      g2.append(
        card({
          img: thumbImg(backpackThumb(bp.tier)),
          picCls: 'tall',
          name: bp.name,
          desc: `+${bp.slots} slot · toplam ${5 + bp.slots}`,
          ...priceStatus(owns(key), on, bp.cost),
          on,
          tier: bp.tier + 1,
          onClick: () => {
            if (!buy(key, bp.cost, bp.name)) return;
            updateHero(heroId, (x) => (x.backpack = bp.tier));
            renderAll();
            void rebuildAvatar();
          },
        }),
      );
    }
    panel.append(g2);

    panel.append(sec('Teçhizat'));
    const g3 = grid();
    for (const a of ACCESSORIES) {
      const key = itemKey.accessory(a.id);
      const on = h.accessories.includes(a.id);
      g3.append(
        card({
          img: thumbImg(accessoryThumb(a.id)),
          picCls: 'tall',
          name: a.name,
          desc: a.desc,
          ...priceStatus(owns(key), on, a.cost),
          on,
          onClick: () => {
            if (!buy(key, a.cost, a.name)) return;
            updateHero(heroId, (x) => {
              // one item per slot (a helmet replaces the headlamp, etc.)
              const sameSlot = new Set(ACCESSORIES.filter((o) => o.slot === a.slot).map((o) => o.id));
              x.accessories = on ? x.accessories.filter((v) => v !== a.id) : [...x.accessories.filter((v) => !sameSlot.has(v)), a.id];
            });
            renderAll();
            void rebuildAvatar();
          },
        }),
      );
    }
    panel.append(g3);
  };

  const renderArmory = (panel: HTMLElement) => {
    const p = loadProfile();
    const heroId = p.hero;
    const h = heroLoadout(heroId);
    const cap = slotCapacity(heroId);
    selSlot = Math.min(selSlot, cap - 1);
    const focus = previewWeapon ?? h.slots[selSlot] ?? h.slots[0] ?? 'rifle';
    const fw = weaponByVariant(focus);
    const fKey = itemKey.weapon(focus);
    const fOwned = owns(fKey);
    const fSlot = h.slots.indexOf(focus);
    const tier = fw.tier ?? 1;

    // ---- selected weapon detail
    const det = document.createElement('div');
    det.className = 'wdet';
    det.style.setProperty('--tc', TIER_COLOR[tier]!);
    const pic = document.createElement('div');
    pic.className = 'pic';
    pic.append(thumbImg(weaponThumb(focus)));
    const st = weaponStats(fw);
    const bars = st.map(([label, v, frac]) => `<span>${label}</span><span class="bar"><i style="width:${Math.round(frac * 100)}%"></i></span><span class="v">${v}</span>`).join('');
    const body = document.createElement('div');
    body.className = 'body';
    body.innerHTML = `<div class="hd"><b>${fw.name}</b><span class="fam">${FAMILY_LABEL[familyOf(fw)]}</span></div><p>${fw.desc ?? ''}</p><div class="bars">${bars}</div>`;
    const act = document.createElement('div');
    act.className = 'wact';
    const btn = document.createElement('button');
    btn.type = 'button';
    const cost = fw.cost ?? 0;
    if (!fOwned) {
      btn.className = 'btn buy';
      btn.textContent = `SATIN AL VE SLOT ${selSlot + 1}'E TAK · ${cr(cost)}`;
      btn.disabled = credits() < cost;
    } else if (fSlot === selSlot) {
      btn.className = 'btn';
      btn.textContent = `SLOT ${selSlot + 1}'DE TAKILI`;
      btn.disabled = true;
    } else {
      btn.className = 'btn go';
      btn.textContent = `SLOT ${selSlot + 1}'E TAK`;
    }
    btn.onclick = () => {
      if (!buy(fKey, cost, fw.name)) return;
      updateHero(heroId, (x) => {
        const prev = x.slots.indexOf(focus);
        const cur = x.slots[selSlot];
        while (x.slots.length <= selSlot) x.slots.push(focus);
        x.slots[selSlot] = focus;
        if (prev >= 0 && prev !== selSlot) {
          if (cur) x.slots[prev] = cur;
          else x.slots.splice(prev, 1);
        }
        x.slots = x.slots.filter(Boolean);
      });
      previewWeapon = null;
      renderAll();
    };
    act.append(btn);
    body.append(act);
    det.innerHTML = `<span class="tierb">${TIER_NAME[tier]!.toUpperCase()}</span>`;
    det.append(pic, body);
    const top = document.createElement('div');
    top.className = 'armtop';
    top.append(det);
    panel.append(top);

    // ---- loadout slots
    const slotCol = document.createElement('div');
    slotCol.append(Object.assign(document.createElement('h3'), { textContent: `Slotlar · ${cap}/8` }));
    top.append(slotCol);
    const slots = document.createElement('div');
    slots.className = 'wslots';
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      const v = h.slots[i];
      const locked = i >= cap;
      b.className = `wslot${i === selSlot ? ' on' : ''}${locked ? ' lock' : ''}`;
      if (locked) b.textContent = '🔒 Çanta gerekli';
      else {
        b.innerHTML = `<span class="n">${i + 1}</span><span class="nm">${v ? weaponByVariant(v).name : 'Boş'}</span>`;
        if (v) b.prepend(thumbImg(weaponThumb(v)));
        b.onclick = () => {
          selSlot = i;
          previewWeapon = null;
          if (v) equipPreviewGun(v);
          renderAll();
        };
      }
      slots.append(b);
    }
    slotCol.append(slots);

    // ---- catalogue (one family at a time)
    const fam0 = famSel ?? familyOf(fw);
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const f of FAMILY_ORDER) {
      const n = WEAPONS.filter((w) => familyOf(w) === f).length;
      if (!n) continue;
      const c = document.createElement('button');
      c.type = 'button';
      c.className = `chip${f === fam0 ? ' on' : ''}`;
      c.innerHTML = `${FAMILY_LABEL[f]}<span class="c">${n}</span>`;
      c.onclick = () => ((famSel = f), renderAll());
      chips.append(c);
    }
    panel.append(Object.assign(document.createElement('h3'), { textContent: 'Katalog' }), chips);
    for (const fam of [fam0]) {
      const list = WEAPONS.filter((w) => familyOf(w) === fam);
      if (!list.length) continue;
      const g = document.createElement('div');
      g.className = 'cards';
      for (const w of list) {
        const v = weaponVariantId(w);
        const inSlot = h.slots.indexOf(v);
        const s2 = weaponStats(w);
        const mini = `<div class="mini"><span title="Hasar"><i style="width:${Math.round(s2[0]![2] * 100)}%"></i></span><span title="Atış hızı"><i style="width:${Math.round(s2[1]![2] * 100)}%"></i></span></div>`;
        g.append(
          card({
            img: thumbImg(weaponThumb(v)),
            name: w.name,
            extra: mini,
            ...priceStatus(owns(itemKey.weapon(v)), false, w.cost ?? 0),
            sel: v === focus,
            tier: w.tier ?? 1,
            slotTag: inSlot >= 0 ? `SLOT ${inSlot + 1}` : undefined,
            onClick: () => {
              previewWeapon = v;
              equipPreviewGun(v);
              renderAll();
            },
          }),
        );
      }
      panel.append(g);
    }
  };

  const renderSkills = (panel: HTMLElement) => {
    const heroId = loadProfile().hero;
    const h = heroLoadout(heroId);
    panel.append(Object.assign(document.createElement('h3'), { textContent: 'Kalıcı seviyeler · koşu içinde kartlarla +3 daha' }));
    for (const slot of ABILITY_SLOTS as AbilitySlot[]) {
      const def = HERO_ABILITIES[heroId as OperativeId][slot];
      const lvl = h.abilities[slot];
      const cost = abilityUpgradeCost(lvl);
      const d = document.createElement('div');
      d.className = 'lskill';
      const pips = Array.from({ length: ABILITY_MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const cdNow = (def.cooldown * levelCd(lvl)).toFixed(1);
      const pw = Math.round((levelPower(lvl) - 1) * 100);
      d.innerHTML = `<div class="ic" style="border-color:${hexc(def.color)}"><span class="k">${slot.toUpperCase()}</span>${def.icon}</div>
        <div><b>${def.name}</b> <small style="color:var(--dim)">Sv ${lvl}/${ABILITY_MAX_LEVEL}</small>
        <div style="font-size:12.5px;color:var(--dim);margin-top:2px">${def.desc}</div>
        <div class="pips">${pips}</div>
        <div style="font-size:11.5px;color:var(--dim)">Bekleme ${cdNow} sn · Güç +%${pw}</div></div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn go';
      btn.style.marginTop = '8px';
      btn.textContent = Number.isFinite(cost) ? `YÜKSELT · ${cr(cost)}` : 'MAKSİMUM';
      btn.disabled = !Number.isFinite(cost) || credits() < cost;
      btn.onclick = () => {
        if (upgradeAbility(heroId, slot)) {
          toast(`${def.name} → Sv ${lvl + 1}`, true);
          renderAll();
        }
      };
      d.lastElementChild!.append(btn);
      panel.append(d);
    }
    const sup = Object.values(RUN_SKILLS).filter((r) => r.heroes?.includes(heroId as OperativeId));
    if (sup.length) {
      panel.append(Object.assign(document.createElement('h3'), { textContent: 'Telsiz desteği · koşuda kartla açılır' }));
      for (const r of sup) {
        const d = document.createElement('div');
        d.className = 'lskill';
        d.innerHTML = `<div class="ic" style="border-color:#c8a868">📻<span class="k" style="color:#c8a868">${r.icon}</span></div><div><b>${r.name}</b><div style="font-size:12.5px;color:var(--dim);margin-top:2px">${r.desc}</div><div style="font-size:11.5px;color:#c8a868;margin-top:6px">Evrim: ${r.evo.name} — ${r.evo.desc}</div></div>`;
        panel.append(d);
      }
    }
  };

  const BRANCH_LABEL: Record<TreeBranch, string> = { attack: 'SALDIRI', defense: 'DAYANIKLILIK', tactic: 'TAKTİK' };
  const TYPE_LABEL = { passive: 'PASİF', active: 'AKTİF', weapon: 'SİLAH' } as const;
  const renderTree = (panel: HTMLElement) => {
    const heroId = loadProfile().hero;
    const hero = rosterById(heroId);
    const prog = loadHeroProgress(heroId);
    const pts = availablePoints(prog);
    const spent = spentPoints(prog);
    const maxed = prog.level >= HERO_LEVEL_MAX;
    const need = heroXpForLevel(prog.level);
    const head = document.createElement('div');
    head.className = 'tlv';
    head.innerHTML = `<div class="big">${prog.level}</div><div style="flex:1"><b style="font:700 16px var(--display);color:${hexc(hero.accent)}">${hero.name}</b> <small style="color:var(--dim)">Operatör seviyesi · maks ${HERO_LEVEL_MAX}</small>
      <div style="font-size:12px;color:var(--dim);margin-top:2px">${maxed ? 'Maksimum seviye' : `${Math.floor(prog.xp).toLocaleString('tr-TR')} / ${need.toLocaleString('tr-TR')} XP`} · Puan: <b style="color:#00ff87">${pts}</b> · Harcanan ${spent}/${TREE_TOTAL_RANKS}</div>
      <div class="bar"><i style="width:${maxed ? 100 : Math.min(100, (prog.xp / need) * 100)}%"></i></div>
      <div style="font-size:11px;color:var(--dim);margin-top:4px">Koşuda toplanan her XP kaydedilir. Takımdaki yardımcılar da %60 XP kazanır.</div></div>`;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn';
    reset.textContent = 'SIFIRLA';
    reset.title = 'Tüm puanları ücretsiz geri al';
    reset.disabled = spent === 0;
    reset.onclick = () => {
      resetTree(heroId);
      toast('Puanlar iade edildi', true);
      renderAll();
    };
    head.append(reset);
    panel.append(head);
    const cols = Object.assign(document.createElement('div'), { className: 'tcols' });
    for (const br of ['attack', 'defense', 'tactic'] as TreeBranch[]) {
      const col = Object.assign(document.createElement('div'), { className: 'tcol' });
      col.append(Object.assign(document.createElement('h4'), { textContent: BRANCH_LABEL[br] }));
      for (const n of TREE_NODES.filter((x) => x.branch === br)) {
        const r = prog.ranks[n.id] ?? 0;
        const block = unlockBlock(prog, n.id);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `tnode${block === null ? ' can' : ''}${block === 'max' ? ' full' : ''}${block === 'level' || block === 'requires' ? ' lock' : ''}`;
        const why = block === 'level' ? `Operatör Sv ${n.reqLevel} gerekir` : block === 'requires' ? `Önce: ${TREE_NODES.find((x) => x.id === n.requires)?.name ?? ''}` : '';
        b.innerHTML = `<span class="ti">${n.icon}</span><span><span class="tt">${TYPE_LABEL[n.type]} · Sv ${n.reqLevel}+</span><b>${n.name} <span class="tr">${r}/${n.maxRank}</span></b><small>${n.desc}</small>${why ? `<small style="color:var(--danger)">${why}</small>` : ''}</span>`;
        b.disabled = block !== null;
        b.onclick = () => {
          if (unlockTreeNode(heroId, n.id)) {
            toast(`${n.name} → ${r + 1}/${n.maxRank}`, true);
            renderAll();
          }
        };
        col.append(b);
      }
      cols.append(col);
    }
    panel.append(cols);
  };

  const renderMission = (panel: HTMLElement) => {
    const ms = currentMission();
    const sec = (t: string) => Object.assign(document.createElement('h3'), { textContent: t });
    panel.append(sec('Harita'));
    const maps = Object.assign(document.createElement('div'), { className: 'maps' });
    for (const id of MAP_ORDER) {
      const d = MAPS[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mapc${ms.map === id ? ' on' : ''}`;
      b.style.setProperty('--ac', hexc(d.accent));
      b.innerHTML = `<div class="mimg" style="background-image:url(/ui/maps/${id}.jpg)"><b>${d.name}</b><span class="tg">${d.tagline}</span></div><div class="mt"><small>${d.desc}</small><span class="md">${d.modes.map((m) => MODES[m].icon).join(' ')}</span></div>`;
      b.onclick = () => {
        const mode = d.modes.includes(ms.mode) ? ms.mode : d.modes[0]!;
        setMission({ ...ms, map: id, mode });
        renderAll();
      };
      maps.append(b);
    }
    panel.append(maps);
    panel.append(sec('Oyun modu'));
    const modes = Object.assign(document.createElement('div'), { className: 'modes' });
    for (const m of MAPS[ms.map].modes) {
      const md = MODES[m];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mode${ms.mode === m ? ' on' : ''}`;
      b.innerHTML = `<span class="mi">${md.icon}</span><b>${md.name}</b><small>${md.desc}</small>`;
      b.onclick = () => (setMission({ ...ms, mode: m }), renderAll());
      modes.append(b);
    }
    panel.append(modes);
    if (TIMED_MODES.includes(ms.mode)) {
      panel.append(sec('Görev süresi'));
      const durs = Object.assign(document.createElement('div'), { className: 'durs' });
      const cur = ms.minutes ?? DEFAULT_RUN_MINUTES;
      for (const m of RUN_MINUTES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cur === m ? 'on' : '';
        b.textContent = `${m} dk`;
        b.onclick = () => (setMission({ ...ms, minutes: m }), renderAll());
        durs.append(b);
      }
      panel.append(durs);
    } else if (ms.mode === 'horde') {
      panel.append(Object.assign(document.createElement('h3'), { textContent: `${HORDE_WAVES} sürü · süre sınırı yok` }));
    }
    panel.append(sec('Zorluk'));
    const diffs = Object.assign(document.createElement('div'), { className: 'diffs' });
    for (const id of DIFFICULTY_ORDER) {
      const d = DIFFICULTIES[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `diff${ms.difficulty === id ? ' on' : ''}`;
      b.style.setProperty('--ac', hexc(d.color));
      b.innerHTML = `<b>${d.name}</b><small>${d.desc}</small><span>Ödül ×${d.reward}</span>`;
      b.onclick = () => (setMission({ ...ms, difficulty: id }), renderAll());
      diffs.append(b);
    }
    panel.append(diffs);
  };

  const renderAchievements = (panel: HTMLElement) => {
    const list = listAchievements();
    const c = achievementCounts();
    panel.append(Object.assign(document.createElement('h3'), { textContent: `Başarımlar · ${c.done}/${c.total}` }));
    for (const a of list) {
      const d = document.createElement('div');
      d.className = `ach${a.unlocked ? ' done' : ''}`;
      const pct = Math.round((a.value / a.def.target) * 100);
      d.innerHTML = `<span class="i">${a.def.icon}</span><div><b>${a.def.name}</b><small>${a.def.desc}</small>
        <div class="bar"><i style="width:${a.unlocked ? 100 : pct}%"></i></div></div>
        <span class="rw">${a.unlocked ? '✓' : `${a.def.target > 1 ? `${a.value.toLocaleString('tr-TR')}/${a.def.target.toLocaleString('tr-TR')} · ` : ''}+${a.def.reward} CR`}</span>`;
      panel.append(d);
    }
  };

  const renderReady = (panel: HTMLElement) => {
    const p = loadProfile();
    const hero = rosterById(p.hero);
    const h = heroLoadout(p.hero);
    const ms = currentMission();
    const ab = HERO_ABILITIES[p.hero];
    const d = document.createElement('div');
    d.className = 'ready';
    d.innerHTML = `<div class="rmap" style="background-image:url(/ui/maps/${ms.map}.jpg)"><div><b>${MAPS[ms.map].name}</b><span>${MODES[ms.mode].icon} ${MODES[ms.mode].name}${TIMED_MODES.includes(ms.mode) ? ` · ${ms.minutes ?? DEFAULT_RUN_MINUTES} dk` : ms.mode === 'horde' ? ` · ${HORDE_WAVES} sürü` : ''} · <span style="color:${hexc(DIFFICULTIES[ms.difficulty].color)}">${DIFFICULTIES[ms.difficulty].name}</span> · Ödül ×${DIFFICULTIES[ms.difficulty].reward}</span></div></div>
      <div class="row"><span>OPERATÖR</span><div><b style="font:700 18px var(--display);color:${hexc(hero.accent)}">${hero.name}</b> <small style="color:var(--dim)">${hero.role} · ${COSTUMES.find((c) => c.id === h.costume)?.name ?? 'Standart'} · ${slotCapacity(p.hero)} slot</small></div></div>
      <div class="row"><span>SİLAHLAR</span><div class="guns" id="rdGuns"></div></div>
      <div class="row"><span>YETENEKLER</span><div class="abil">${(['q', 'e', 'r'] as const).map((k) => `<div><span class="k">${k.toUpperCase()}</span><i>${ab[k].icon}</i>${ab[k].name} <small style="color:var(--dim)">Sv ${h.abilities[k]}</small></div>`).join('')}</div></div>`;
    panel.append(d);
    const guns = d.querySelector('#rdGuns')!;
    h.slots.forEach((v) => {
      const g = document.createElement('div');
      g.append(thumbImg(weaponThumb(v)), weaponByVariant(v).name);
      guns.append(g);
    });
  };

  const renderStepper = () => {
    const groups: string[] = [];
    for (const st of STEPS) if (!groups.includes(st.group)) groups.push(st.group);
    const cur = STEPS[step]!;
    $('lbTabs').replaceChildren(
      ...groups.map((g) => {
        const idx = STEPS.map((st, i) => (st.group === g ? i : -1)).filter((i) => i >= 0);
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.t = STEPS[idx[0]!]!.id;
        const isCur = !achOpen && cur.group === g;
        const done = !achOpen && idx[idx.length - 1]! < step;
        b.className = `sg${isCur ? ' cur' : ''}${done ? ' done' : ''}`;
        b.innerHTML = `<span class="gl"><span class="gi">${STEPS[idx[0]!]!.icon}</span>${g}</span><span class="bars2">${idx.map((i) => `<i class="${!achOpen && i === step ? 'cur' : !achOpen && i < step ? 'done' : ''}"></i>`).join('')}</span>`;
        b.onclick = () => go(idx[0]!);
        return b;
      }),
    );
    const head = $('lbStepHead');
    if (achOpen) {
      const c = achievementCounts();
      head.innerHTML = `<span class="big">🏆</span><h2>Başarımlar <small>${c.done}/${c.total}</small></h2><p>Tamamladıkça kredi kazanırsın.</p>`;
    } else head.innerHTML = `<span class="big">${cur.icon}</span><h2>${cur.title} <small>ADIM ${step + 1}/${STEPS.length}</small></h2><p>${cur.hint}</p>`;
    $('lbPg').replaceChildren(
      ...STEPS.map((_, i) => {
        const dot = document.createElement('i');
        if (!achOpen && i === step) dot.className = 'on';
        dot.title = STEPS[i]!.title;
        dot.onclick = () => go(i);
        return dot;
      }),
    );
    const prev = $<HTMLButtonElement>('lbPrev');
    const next = $<HTMLButtonElement>('lbNext');
    prev.disabled = !achOpen && step === 0;
    prev.textContent = achOpen ? '‹ GERİ DÖN' : `‹ ${step > 0 ? STEPS[step - 1]!.title.toUpperCase() : 'GERİ'}`;
    const last = step === STEPS.length - 1;
    next.className = `nx${last && !achOpen ? ' go' : ''}`;
    next.textContent = achOpen ? 'KAPAT' : last ? 'GÖREVE BAŞLA ▸' : `${STEPS[step + 1]!.title.toUpperCase()} ›`;
    $('lbAch').classList.toggle('on', achOpen);
  };

  const go = (i: number) => {
    achOpen = false;
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    $('lbPanel').scrollTop = 0;
    renderAll();
  };

  const renderAll = () => {
    const p = loadProfile();
    const hero = rosterById(p.hero);
    const h = heroLoadout(p.hero);
    $('lbCr').textContent = cr(credits());
    $('lbName').textContent = hero.name;
    $('lbName').style.color = hexc(hero.accent);
    const ab = HERO_ABILITIES[p.hero];
    $('lbRole').textContent = `${hero.role} · Q ${ab.q.name} · E ${ab.e.name} · R ${ab.r.name}`;
    renderHeroes();
    renderStepper();
    const panel = $('lbPanel');
    const scroll = panel.scrollTop;
    panel.replaceChildren();
    const id = STEPS[step]!.id;
    const keep = (from: number, to: number) => [...panel.children].forEach((c, i) => (i < from || i >= to) && c.remove());
    if (achOpen) renderAchievements(panel);
    else if (id === 'map') (renderMission(panel), keep(0, 2));
    else if (id === 'mode') (renderMission(panel), keep(2, 99));
    else if (id === 'costume') (renderLocker(panel), keep(0, 2));
    else if (id === 'gear') (renderLocker(panel), keep(2, 99));
    else if (id === 'weapons') renderArmory(panel);
    else if (id === 'skills') renderSkills(panel);
    else if (id === 'tree') renderTree(panel);
    else renderReady(panel);
    panel.scrollTop = scroll;
    const costume = COSTUMES.find((c) => c.id === h.costume)?.name ?? 'Standart';
    const ms = currentMission();
    $('lbSum').innerHTML = `<b>${MAPS[ms.map].name}</b> · ${MODES[ms.mode].name} · <span style="color:${hexc(DIFFICULTIES[ms.difficulty].color)}">${DIFFICULTIES[ms.difficulty].name}</span> — <b>${hero.name}</b> · ${costume} · ${slotCapacity(p.hero)} slot`;
  };

  $('lbPrev').addEventListener('click', () => (achOpen ? ((achOpen = false), renderAll()) : go(step - 1)));
  $('lbNext').addEventListener('click', () => {
    if (achOpen) return ((achOpen = false), renderAll());
    if (step === STEPS.length - 1) onStart();
    else go(step + 1);
  });
  $('lbAch').addEventListener('click', () => {
    achOpen = !achOpen;
    $('lbPanel').scrollTop = 0;
    renderAll();
  });
  $('lbStart').addEventListener('click', () => onStart());
  $('lbFs').addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  });

  return {
    show: () => {
      host.classList.add('on');
      renderAll();
      resize();
      void rebuildAvatar();
      cancelAnimationFrame(raf);
      clock.getDelta();
      frame();
    },
    hide: () => {
      host.classList.remove('on');
      cancelAnimationFrame(raf);
      avatar?.dispose();
      avatar = null;
      gun = null;
      buildToken++;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      avatar?.dispose();
      renderer.dispose();
      window.removeEventListener('resize', resize);
    },
  };
}
