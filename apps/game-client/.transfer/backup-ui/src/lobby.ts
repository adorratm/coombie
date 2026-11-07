import * as THREE from 'three';
import { ensureWeaponEnvironment } from './weaponAssets';
import { holdGun, orientGun, type BoneSource } from './gunHold';
import { MAPS, MAP_ORDER } from './mapDefs';
import { DIFFICULTIES, DIFFICULTY_ORDER, MODES } from './gameModes';
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

/**
 * Pre-run lobby: hero select with a live 3D preview (costume, accessories, backpack,
 * selected weapon), Dolap (cosmetics), Cephanelik (30 weapons + slots) and
 * Yetenekler (permanent Q/E/R levels). Everything is bought with run credits.
 */

type Tab = 'mission' | 'locker' | 'armory' | 'skills' | 'ach';

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

const CSS = /* css */ `
#lobby { position: absolute; inset: 0; z-index: 40; display: none; color: var(--text);
  background: radial-gradient(1200px 700px at 50% 40%, #121a16 0%, #07090c 70%); font-family: var(--font); }
#lobby.on { display: grid; grid-template-columns: 250px 1fr 430px; grid-template-rows: 64px 1fr 76px; }
#lobby .lb-top { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; padding: 0 22px;
  border-bottom: 1px solid var(--line); background: rgba(6,8,10,0.6); }
#lobby .lb-logo { font: 700 28px var(--display); letter-spacing: .12em; }
#lobby .lb-logo b { color: #00ff87; }
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
    <div class="lb-top"><div class="lb-logo">PROTOCOL<b>-Z</b></div><div class="lb-cr" id="lbCr"></div></div>
    <div class="lb-heroes" id="lbHeroes"></div>
    <div class="lb-stage" id="lbStage"><div class="lb-name"><h1 id="lbName"></h1><p id="lbRole"></p></div><div class="toast" id="lbToast"></div></div>
    <div class="lb-side">
      <div class="tabs" id="lbTabs">
        <button data-t="mission">GÖREV</button><button data-t="locker">DOLAP</button><button data-t="armory">CEPHANELİK</button><button data-t="skills">YETENEK</button><button data-t="ach">BAŞARIM</button>
      </div>
      <div class="panel" id="lbPanel"></div>
    </div>
    <div class="lb-bot"><div class="sum" id="lbSum"></div><button class="start" id="lbStart" type="button">GÖREVE BAŞLA</button></div>`;
  const $ = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  let tab: Tab = 'mission';
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
    $('lbHeroes').replaceChildren(
      ...OPERATIVE_ROSTER.map((h) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `hero${h.id === p.hero ? ' on' : ''}`;
        b.innerHTML = `<div class="ic" style="border-color:${hexc(h.accent)};color:${hexc(h.accent)}">${h.icon}</div>
          <div><div class="nm">${h.name}</div><div class="rl">${h.role} · ${h.gender === 'male' ? 'Erkek' : 'Kadın'}</div></div>`;
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

  const item = (opts: { name: string; desc?: string; price?: number; owned: boolean; on: boolean; tag?: string; cls?: string; swatch?: string; onClick: () => void }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `item${opts.on ? ' on' : ''}${opts.owned ? '' : ' locked'}${opts.cls ? ` ${opts.cls}` : ''}`;
    const price = opts.owned
      ? `<span class="price" style="color:var(--ok)">${opts.on ? 'TAKILI' : 'SAHİP'}</span>`
      : `<span class="price${credits() < (opts.price ?? 0) ? ' no' : ''}">${cr(opts.price ?? 0)}</span>`;
    b.innerHTML = `${opts.tag ? `<span class="tag">${opts.tag}</span>` : ''}<b>${opts.name}</b>${opts.desc ? `<small>${opts.desc}</small>` : ''}${opts.swatch ?? ''}${price}`;
    b.onclick = opts.onClick;
    return b;
  };

  const renderLocker = (panel: HTMLElement) => {
    const p = loadProfile();
    const heroId = p.hero;
    const h = heroLoadout(heroId);
    const sec = (t: string) => Object.assign(document.createElement('h3'), { textContent: t });
    const grid = () => Object.assign(document.createElement('div'), { className: 'grid' });

    panel.append(sec('Kostüm'));
    const g1 = grid();
    for (const c of COSTUMES) {
      const key = itemKey.costume(c.id);
      const sw = c.primary === null ? '' : `<div class="sw" style="background:linear-gradient(90deg,${hexc(c.primary)} 0 60%,${hexc(c.secondary ?? 0)} 60%${c.glow ? `,${hexc(c.glow)} 92%` : ''})"></div>`;
      g1.append(
        item({
          name: c.name,
          price: c.cost,
          owned: owns(key),
          on: h.costume === c.id,
          swatch: sw,
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
      item({ name: 'Çantasız', desc: '5 silah slotu', owned: true, on: h.backpack === 0, onClick: () => (updateHero(heroId, (x) => (x.backpack = 0)), renderAll(), void rebuildAvatar()) }),
    );
    for (const bp of BACKPACKS) {
      const key = itemKey.backpack(bp.tier);
      g2.append(
        item({
          name: bp.name,
          desc: `+${bp.slots} slot · toplam ${5 + bp.slots}`,
          price: bp.cost,
          owned: owns(key),
          on: h.backpack === bp.tier,
          tag: `T${bp.tier}`,
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

    panel.append(sec('Aksesuarlar'));
    const g3 = grid();
    for (const a of ACCESSORIES) {
      const key = itemKey.accessory(a.id);
      const on = h.accessories.includes(a.id);
      g3.append(
        item({
          name: a.name,
          desc: a.desc,
          price: a.cost,
          owned: owns(key),
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
    panel.append(Object.assign(document.createElement('h3'), { textContent: `Silah slotları · ${cap}/8 (çanta ile artar)` }));
    const slots = document.createElement('div');
    slots.className = 'slots';
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      const v = h.slots[i];
      const locked = i >= cap;
      b.className = `slotb${i === selSlot ? ' on' : ''}${locked ? ' lock' : ''}`;
      b.innerHTML = `<span class="n">${i + 1}</span>${locked ? 'Çanta gerekli' : v ? weaponByVariant(v).name : 'Boş'}`;
      if (!locked)
        b.onclick = () => {
          selSlot = i;
          previewWeapon = null;
          if (v) equipPreviewGun(v);
          renderAll();
        };
      slots.append(b);
    }
    panel.append(slots);
    const hint = document.createElement('small');
    hint.style.cssText = 'display:block;color:var(--dim);margin:6px 0 2px;font-size:11.5px';
    hint.textContent = `Slot ${selSlot + 1} seçili — aşağıdan bir silaha tıkla (sahip değilsen satın alınır ve takılır).`;
    panel.append(hint);

    for (const fam of FAMILY_ORDER) {
      const list = WEAPONS.filter((w) => familyOf(w) === fam);
      if (!list.length) continue;
      panel.append(Object.assign(document.createElement('h3'), { textContent: `${FAMILY_LABEL[fam]} · ${list.length}` }));
      const g = document.createElement('div');
      g.className = 'grid';
      for (const w of list) {
        const v = weaponVariantId(w);
        const key = itemKey.weapon(v);
        const inSlot = h.slots.indexOf(v);
        const stats = w.melee
          ? `<div class="stats"><span>HSR <i>${w.damage.toFixed(1)}</i></span><span>HIZ <i>${(1 / w.fireRate).toFixed(1)}</i></span><span>MNZ <i>${w.range}</i></span></div>`
          : `<div class="stats"><span>HSR <i>${(w.damage * w.pellets).toFixed(1)}</i></span><span>HIZ <i>${(1 / w.fireRate).toFixed(1)}</i></span><span>ŞRJ <i>${w.magSize}</i></span><span>MNZ <i>${w.range}</i></span></div>`;
        g.append(
          item({
            name: w.name,
            desc: `${w.desc ?? ''}${stats}`,
            price: w.cost ?? 0,
            owned: owns(key),
            on: inSlot >= 0,
            tag: inSlot >= 0 ? `SLOT ${inSlot + 1}` : TIER_NAME[w.tier ?? 1]!.toUpperCase(),
            cls: `t${w.tier ?? 1}`,
            onClick: () => {
              previewWeapon = v;
              equipPreviewGun(v);
              if (!buy(key, w.cost ?? 0, w.name)) {
                renderAll();
                return;
              }
              updateHero(heroId, (x) => {
                const prev = x.slots.indexOf(v);
                const cur = x.slots[selSlot];
                while (x.slots.length <= selSlot) x.slots.push(v);
                x.slots[selSlot] = v;
                if (prev >= 0 && prev !== selSlot) {
                  if (cur) x.slots[prev] = cur;
                  else x.slots.splice(prev, 1);
                }
                x.slots = x.slots.filter(Boolean);
              });
              selSlot = Math.min(selSlot + 1, cap - 1);
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
      b.innerHTML = `<b>${d.name}</b><span class="tg">${d.tagline}</span><small>${d.desc}</small><span class="md">${d.modes.map((m) => MODES[m].icon).join(' ')}</span>`;
      b.onclick = () => {
        const mode = d.modes.includes(ms.mode) ? ms.mode : d.modes[0]!;
        setMission({ ...ms, map: id, mode });
        renderAll();
      };
      maps.append(b);
    }
    panel.append(maps);
    panel.append(sec('Oyun modu'));
    const modes = Object.assign(document.createElement('div'), { className: 'grid' });
    for (const m of MAPS[ms.map].modes) {
      const md = MODES[m];
      modes.append(
        item({ name: `${md.icon} ${md.name}`, desc: md.desc, owned: true, on: ms.mode === m, onClick: () => (setMission({ ...ms, mode: m }), renderAll()) }),
      );
    }
    panel.append(modes);
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
    host.querySelectorAll<HTMLButtonElement>('#lbTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const panel = $('lbPanel');
    const scroll = panel.scrollTop;
    panel.replaceChildren();
    if (tab === 'mission') renderMission(panel);
    else if (tab === 'locker') renderLocker(panel);
    else if (tab === 'armory') renderArmory(panel);
    else if (tab === 'ach') renderAchievements(panel);
    else renderSkills(panel);
    panel.scrollTop = scroll;
    const costume = COSTUMES.find((c) => c.id === h.costume)?.name ?? 'Standart';
    const ms = currentMission();
    $('lbSum').innerHTML = `<b>${MAPS[ms.map].name}</b> · ${MODES[ms.mode].name} · <span style="color:${hexc(DIFFICULTIES[ms.difficulty].color)}">${DIFFICULTIES[ms.difficulty].name}</span> — <b>${hero.name}</b> · ${costume} · ${slotCapacity(p.hero)} slot`;
  };

  host.querySelectorAll<HTMLButtonElement>('#lbTabs button').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.t as Tab;
      $('lbPanel').scrollTop = 0;
      renderAll();
    }),
  );
  $('lbStart').addEventListener('click', () => onStart());

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
