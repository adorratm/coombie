import * as THREE from 'three';
import { ensureWeaponEnvironment } from './weaponAssets';
import { castAbility, createAbilityRuntime } from './abilities';
import {
  alignGunToAim,
  attachVrmToOperative,
  bumpOperativeAnim,
  beginZombieVrmAttachBudget,
  disposeZombieVrm,
  requestZombieVrm,
  preloadAvatars,
  createVrmAvatar,
} from './avatars';
import { ZOMBIE_LOOKS } from './zombieLook';
import { allAvatarUrls } from './roster';
import { rosterById } from './roster';
import { currentRunLoadout, type AbilitySlot, type RunLoadout } from './loadout';
import { createHeroAbilityRuntime, type HeroAbilityRuntime, type HeroBuffs } from './heroAbilities';
import { WEAPONS as ALL_WEAPONS, weaponByVariant, weaponIndexOfVariant, weaponVariantId, type WeaponFxDef } from './weapons';
import { createGameAudio, type AudioBusId, type AudioBusLevels } from './audio';
import { waveKindForLevel } from '@protocol-z/shared';
import {
  animateOperative,
  animateZombieWalk,
  beginReload,
  createOperative,
  createZombie,
  flashZombieHurt,
  setOperativeWeapon,
  tickReload,
  updateZombieHurtFlash,
  type OperativeVisual,
  type ZombieVisual,
} from './characters';
import { SpatialHash2D } from './spatialHash';
import { applyStatus, rollStatusOnHit, statusTint, tickZombieStatuses } from './statusEffects';
import { beginZombieLodFrame, zombieVrmLod } from './vrmLod';
import {
  clientWaveSpawnBudget,
  deathBurstScale,
  deathDecalScale,
  engageRangeFor,
  hitRadiusFor,
  moanChanceFor,
  pickWaveSpawnKind,
} from './zombieKinds';
import { nearbyBoxes, resolveCircleAabbs } from './collision';
import { billboardHealthBars, createCombatFx, type HealthBar } from './fx';
import { createInput } from './input';
import { faceToward, sanitizeObject3D } from './look';
import { createInventory, addItem, consumeItem, type InventoryState } from './inventory';
import {
  createWorldItem,
  buildSampleModel,
  rollItemDrop,
  updateWorldItem,
  ITEM_DEFS,
  type ItemId,
  type WorldItem,
} from './items';
import { bloodMap, disposeMaterialTextures } from './materials';
import { buildGameMap } from './gameMap';
import { MAPS } from './mapDefs';
import { DIFFICULTIES, ModeRuntime, type MissionSelection, type RunOutcome } from './gameModes';
import type { RunStats } from './achievements';
import { ALLY_TEMPLATES } from './rescue';
import { applyMetaRunBonuses, loadMetaSave, type RunSummary } from './metaSave';
import {
  createMissionRuntime,
  tickMission,
  type MissionHudState,
} from './mission';
import {
  banishUpgrade,
  createProgressState,
  gainProgressXp,
  getActiveClass,
  listUnlockedWeaponDefs,
  lockdownUpgrade,
  rerollUpgrades,
  selectUpgrade,
  setActiveClassForWeapon,
  skipUpgrade,
  startAbilityCooldown,
  tickProgressTimers,
  weaponDisplayName,
  weaponUnlockLabel,
  type UpgradeCardDef,
} from './progression';
import {
  MAX_SQUAD_SIZE,
  createRescueSlots,
  getRescueHud,
  tickRescueSystem,
  type RescueHudInfo,
} from './rescue';
import {
  SKILL_NODES,
  activateRage,
  applySkillPassiveMods,
  canUnlock,
  createSkillTreeState,
  effectivePickupRadius,
  grantSkillPoint,
  isRaging,
  tickSkillTree,
  unlockSkill,
  type SkillId,
  type SkillTreeState,
} from './skilltree';
import type { WeaponId } from './weapons';
import {
  beginZombieAttack,
  bloaterExplode,
  breakGrab,
  chooseZombieSkill,
  fireRateDebuffMul,
  frenzyMul,
  operativePinned,
  rangedSkillFor,
  telegraphZombieSkill,
  tickAcidSpits,
  tickOperativeSlow,
  tickZombieAttack,
  ZombieHazards,
  type AcidSpit,
  type ZombieCombatCtx,
} from './zombieCombat';
import { SkillFx } from './skillFx';
import { createRunSkillState, HERO_START_SKILL, RUN_SKILLS, RunSkillRuntime, type RunSkillId } from './runSkills';
import { queueZombieAnim, setOperativeDead, spawnZombieCorpse, tickZombieCorpses, type ZombieCorpse } from './avatars';

export interface ArenaHudState {
  heroId: string;
  /** recent loot pickups (newest last) — name + what it does */
  pickups?: Array<{ name: string; desc: string; age: number }>;
  heroAbilities: Array<{ slot: string; name: string; icon: string; color: number; cooldown: number; maxCooldown: number; level: number }>;
  /** set when the mission is won / lost (sim is frozen) */
  runOver?: RunOutcome | null;
  revivesLeft?: number;
  runStats?: RunStats;
  /** YAZS run skills + passives (optional for older HUD consumers) */
  runSkills?: Array<{ id: string; icon: string; name: string; level: number; evo: boolean; passive: boolean }>;
  weaponSlots: Array<{ name: string; active: boolean; tier: number }>;
  weapon: string;
  weaponId: WeaponId;
  className: string;
  abilityName: string;
  abilityReady: boolean;
  abilityCooldown: number;
  abilityMaxCooldown: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpToLevel: number;
  level: number;
  kills: number;
  wave: number;
  combo: number;
  alive: boolean;
  pausedForUpgrade: boolean;
  /** Player Esc pause (sim frozen; not upgrade draft). */
  paused: boolean;
  choices: UpgradeCardDef[];
  unlockedWeapons: Array<{ id: WeaponId; label: string }>;
  modsSummary: string[];
  overdrive: boolean;
  pierceShots: number;
      squad: Array<{
        name: string;
        hp: number;
        maxHp: number;
        alive: boolean;
        icon?: string;
        classId?: string;
      }>;
  rescue: RescueHudInfo[];
  runTimeSec: number;
  inventory: Array<{ id: ItemId; name: string; count: number }>;
  scrap: number;
  shield: number;
  shieldMax: number;
  skillPoints: number;
  skills: Array<{
    id: SkillId;
    name: string;
    description: string;
    rank: number;
    maxRank: number;
    cost: number;
    canUnlock: boolean;
    column: number;
    row: number;
  }>;
  showSkillTree: boolean;
  showInventory: boolean;
  raging: boolean;
  pickupRadius: number;
  ammo: number;
  magSize: number;
  reloading: boolean;
  reloadProgress: number;
  mission: MissionHudState;
  maxSquad: number;
  rerolls: number;
  lockdowns: number;
  banishes: number;
  lockedChoiceIndex: number | null;
  moveSpeedMult: number;
  xpMult: number;
  armorFlat: number;
  critChance: number;
  dangerLevel: number;
}

export interface ArenaHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
  setSize: (w: number, h: number) => void;
  animate: (t: number) => void;
  getWeaponName: () => string;
  getHudState: () => ArenaHudState;
  getRunSummary: () => RunSummary;
  selectUpgrade: (index: number) => void;
  rerollUpgrades: () => void;
  lockdownUpgrade: (index: number) => void;
  banishUpgrade: (index: number) => void;
  skipUpgrade: () => void;
  activateAbility: () => void;
  unlockSkillNode: (id: SkillId) => void;
  useItem: (id: ItemId) => void;
  toggleSkillTree: () => void;
  toggleInventory: () => void;
  setPaused: (paused: boolean) => void;
  togglePause: () => boolean;
  getAudioBusLevels: () => AudioBusLevels;
  setAudioBusLevel: (bus: AudioBusId, value: number) => void;
}

type Decal = { mesh: THREE.Mesh; life: number };
type Gem = { mesh: THREE.Object3D; life: number; xp: number };
type MuzzleFlash = { mesh: THREE.Mesh; life: number };
type Bullet = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  owner: OperativeVisual;
  pierce: number;
  fx?: WeaponFxDef;
};

const PLAYER_RADIUS = 0.55;
const ZOMBIE_RADIUS = 0.5;
/** Soft cap — raised with spatial hash + VRM LOD; still far below design aspirational counts. */
const MAX_ZOMBIES_BASE = 48;
const ZOMBIE_HIT_QUERY_R = 1.5;
const CAM_ZOOM_MIN = 0.55;
const CAM_ZOOM_MAX = 1.85;

export function createArena(container: HTMLElement, opts: { loadout?: RunLoadout } = {}): ArenaHandle {
  const loadout = opts.loadout ?? currentRunLoadout();
  const mission: MissionSelection = loadout.mission ?? { map: 'city', mode: 'survival', difficulty: 'normal' };
  const mapDef = MAPS[mission.map] ?? MAPS.city;
  const diff = DIFFICULTIES[mission.difficulty] ?? DIFFICULTIES.normal;
  const LT = mapDef.lighting;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LT.bg);
  scene.fog = new THREE.FogExp2(LT.fog, LT.fogDensity * 0.6);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 500);
  camera.position.set(0, 22, 16);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  ensureWeaponEnvironment(renderer);
  // ---- adaptive quality: 0 high · 1 medium · 2 low · 3 very low --------------
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let quality = (() => {
    try {
      const q = Number(localStorage.getItem('protocol-z-quality'));
      if (Number.isFinite(q) && q >= 0 && q <= 3) return q;
    } catch {
      /* ignore */
    }
    return coarse ? 2 : 1;
  })();
  const QUALITY_DPR = [1.5, 1.15, 0.9, 0.75];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_DPR[quality]!));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = quality < 2;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LT.exposure;
  container.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.style.outline = 'none';
  renderer.domElement.focus();

  // Dramatic apocalyptic lighting: Cool ambient fill, warm harsh directional key light, and rim kick
  scene.add(new THREE.AmbientLight(LT.ambient[0], LT.ambient[1] * 1.6));
  scene.add(new THREE.HemisphereLight(LT.hemi[0], LT.hemi[1], LT.hemi[2] * 1.5));

  const sun = new THREE.DirectionalLight(LT.sun[0], LT.sun[1] * 1.25);
  const sunOff = new THREE.Vector3(...LT.sunDir);
  sun.position.copy(sunOff);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality === 0 ? 2048 : 1024);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 130;
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  scene.add(sun);
  scene.add(sun.target);

  // Cinematic blue rim backlight
  const rimLight = new THREE.DirectionalLight(LT.rim[0], LT.rim[1]);
  rimLight.position.set(-25, 20, -18);
  scene.add(rimLight);
  renderer.shadowMap.needsUpdate = true;

  const map = buildGameMap(scene, mission.map, renderer);
  const ARENA_BOUND = map.bound;
  const colliders = map.colliders;
  const audio = createGameAudio();
  const fx = createCombatFx(scene);
  const skillFx = new SkillFx(scene);
  skillFx.setCamera(camera);
  const abilityRuntime = createAbilityRuntime(scene);
  const bloodTex = bloodMap();
  const healthBars: HealthBar[] = [];
  const progress = createProgressState('assaulter');
  const metaAtBoot = loadMetaSave();

  // Solo start — allies join only via rescue events
  const hero = rosterById(loadout.heroId);
  const player = createOperative({
    color: hero.accent,
    scale: hero.scale,
    isPlayer: true,
    moveSpeed: hero.speed,
    weaponIndex: hero.weaponIndex,
    name: hero.name,
    maxHp: hero.hp,
    gender: hero.gender,
    avatarUrl: hero.avatarUrl,
    rosterId: hero.id,
    classId: hero.classId,
  });
  player.root.userData.cosmetics = {
    costume: loadout.costume,
    accessories: loadout.accessories,
    backpack: loadout.backpack,
  };
  // Hide neon proxy until VRM arrives — avoids placeholder flash on boot
  player.proxy.visible = false;
  player.root.position.copy(map.anchors.spawn);
  scene.add(player.root);
  healthBars.push(player.healthBar);
  const squad: OperativeVisual[] = [player];

  const rescueSlots = createRescueSlots();
  const inventory: InventoryState = createInventory();
  const skills: SkillTreeState = createSkillTreeState();
  const worldItems: WorldItem[] = [];
  let showSkillTree = false;
  let showInventory = false;

  // Loadout slots (1–5 + backpack). Every family counts as unlocked so level-up
  // "unlock weapon" cards never fight the armory loadout.
  const weaponSlots = loadout.weaponSlots.length ? [...loadout.weaponSlots] : ['rifle'];
  let activeSlot = 0;
  setOperativeWeapon(player, weaponIndexOfVariant(weaponSlots[0]!));
  setActiveClassForWeapon(progress, player.weapon.id);
  progress.activeClassId = hero.classId;
  for (const w of ALL_WEAPONS) progress.unlockedWeapons.add(w.id);
  let heroRt: HeroAbilityRuntime | null = null;
  const NO_BUFF: HeroBuffs = { damage: 1, fireRate: 1, move: 1, armor: 0, crit: 0 };
  const heroBuffs = (op: OperativeVisual): HeroBuffs => (heroRt ? heroRt.buffsFor(op, simTime) : NO_BUFF);
  applyMetaRunBonuses(progress, player, metaAtBoot);
  void (async () => {
    await preloadAvatars();
    const avatar = await attachVrmToOperative(player, hero.gender);
    if (!avatar) player.proxy.visible = true;
  })();

  let kills = 0;
  let wave = 1;
  let combo = 0;
  let comboTimer = 0;
  let shake = 0;
  let waveTimer = 0;
  const missionRuntime = createMissionRuntime();
  let pendingMissionKill = false;
  let pendingMissionRescue = false;
  let spawnBudget = 0;
  let simTime = 0;
  let missionHud = tickMission({
    runtime: missionRuntime,
    wave: 1,
    dt: 0,
    simTime: 0,
    playerX: 0,
    playerZ: 0,
    squadSize: 1,
    justKilled: false,
    justRescued: false,
  });

  const MAX_ZOMBIES = Math.round(MAX_ZOMBIES_BASE * Math.min(1.35, diff.count));
  const zombies: ZombieVisual[] = [];
  const zombieHash = new SpatialHash2D<ZombieVisual>(4);
  const zombieQuery: ZombieVisual[] = [];
  let lodFrame = 0;
  const spawnZombie = (
    kind: ZombieVisual['kind'] = 'grunt',
    nearPlayer = true,
    at?: { x: number; z: number; emerge?: boolean },
  ) => {
    if (zombies.length >= MAX_ZOMBIES && kind !== 'boss') return null;
    const z = createZombie(kind);
    z.proxy.visible = true;
    const waveMul = 1 + (wave - 1) * 0.12;
    z.maxHp = Math.ceil(z.maxHp * waveMul * diff.hp);
    z.hp = z.maxHp;
    z.attackDamage = Math.ceil(z.attackDamage * (1 + (wave - 1) * 0.06) * diff.dmg);
    z.speed *= diff.speed;
    z.baseSpeed = z.speed;
    z.healthBar.setRatio(1);

    const ang = Math.random() * Math.PI * 2;
    const dist = nearPlayer ? 20 + Math.random() * 26 : 50 + Math.random() * 70;
    const cx = nearPlayer ? player.root.position.x : 0;
    const cz = nearPlayer ? player.root.position.z : 0;
    const x = THREE.MathUtils.clamp(at ? at.x : cx + Math.cos(ang) * dist, -ARENA_BOUND, ARENA_BOUND);
    const zz = THREE.MathUtils.clamp(at ? at.z : cz + Math.sin(ang) * dist, -ARENA_BOUND, ARENA_BOUND);
    const resolved = resolveCircleAabbs(x, zz, ZOMBIE_RADIUS, colliders);
    z.root.position.set(resolved.x, 0, resolved.z);
    scene.add(z.root);
    zombies.push(z);
    healthBars.push(z.healthBar);
    // some of the horde claws its way out of the ground
    const emerge = at?.emerge ?? (z.kind !== 'boss' && z.kind !== 'crawler' && Math.random() < 0.35);
    if (emerge) {
      z.root.userData.spawnUntil = simTime + 2.1;
      queueZombieAnim(z, { kind: 'spawn', dur: 2.1 });
      fx.spawnBloodBurst(z.root.position, 0.8, 0x3b2a1a);
    }
    return z;
  };

  for (let i = 0; i < Math.round(12 * diff.count); i++) {
    spawnZombie(i % 6 === 0 ? 'acid' : i % 4 === 0 ? 'runner' : 'grunt', true);
  }

  let camZoom = 1;

  const bloodDecals: Decal[] = [];
  const gems: Gem[] = [];
  const flashes: MuzzleFlash[] = [];
  const bullets: Bullet[] = [];
  const acidSpits: AcidSpit[] = [];
  const hazards = new ZombieHazards(scene);
  hazards.vfx = skillFx;
  const corpses: ZombieCorpse[] = [];
  let nowSec = performance.now() / 1000;
  const zombieCtx: ZombieCombatCtx = {
    scene,
    vfx: skillFx,
    squad,
    zombies,
    spits: acidSpits,
    hazards,
    fx,
    nowSec,
    damageOperative: (op, amount, from) => damageOperative(op, amount, from),
    damageZombie: (z, amount, from) => {
      const dir = z.root.position.clone().sub(from).setY(0).normalize();
      damageZombie(z, amount, z.root.position.clone().setY(1.2), dir, { fromPlayer: false });
    },
    spawnZombieAt: (kind, x, zz) => spawnZombie(kind, true, { x, z: zz, emerge: true }),
    move: (obj, dx, dz, r) => applyMoveWithCollision(obj, dx, dz, r),
    shake: (v) => {
      shake = Math.max(shake, v);
    },
    playSfx: (z, ev) => audio.playZombie(z.kind, ev),
  };

  // ---- game mode / objectives -------------------------------------------
  const runStats: RunStats = {
    map: mission.map,
    mode: mission.mode,
    difficulty: mission.difficulty,
    won: false,
    kills: 0,
    kindKills: {},
    level: 1,
    maxCombo: 0,
    evolutions: 0,
    skills: 0,
    timeSec: 0,
    downs: 0,
    rescued: 0,
    fuel: 0,
    coreHp: 100,
  };
  const recruitAt = (pos: THREE.Vector3) => {
    runStats.rescued += 1;
    if (squad.length >= 8) return;
    const used = new Set(squad.map((o) => o.root.userData.rosterId));
    const t = ALLY_TEMPLATES.find((a) => !used.has(a.id)) ?? ALLY_TEMPLATES[0]!;
    const ally = createOperative({
      color: t.accent,
      scale: t.scale,
      isPlayer: false,
      moveSpeed: t.speed,
      weaponIndex: t.weaponIndex,
      name: t.name,
      maxHp: t.hp,
      gender: t.gender,
      avatarUrl: t.avatarUrl,
      rosterId: t.id,
      classId: t.classId,
    });
    ally.root.userData.rosterId = t.id;
    ally.root.position.copy(pos);
    scene.add(ally.root);
    healthBars.push(ally.healthBar);
    squad.push(ally);
    fx.spawnHitRing(pos, 0x38bdf8);
    void attachVrmToOperative(ally, t.gender).then((avatar) => {
      if (!avatar) ally.proxy.visible = true;
    });
  };
  const modeRt = new ModeRuntime(mission, {
    scene,
    map,
    player,
    squad,
    zombies,
    spawnZombieAt: (kind, x, zz) => spawnZombie(kind, true, { x, z: zz, emerge: false }) ?? null,
    recruitAt,
    warn: (pos, r, color, dur) => fx.spawnWarnRing(pos, r, color, dur),
    sfx: (kind) => {
      if (kind === 'pickup') audio.playLevelUp();
      else if (kind === 'alarm') audio.playAbility();
      else audio.playLevelUp();
    },
  });
  let runOver: RunOutcome | null = null;
  const snapshotRunStats = (): RunStats => {
    runStats.kills = kills;
    runStats.level = progress.level;
    runStats.maxCombo = Math.max(runStats.maxCombo, combo);
    runStats.evolutions = progress.runSkills.evolved.size;
    runStats.skills = progress.runSkills.skills.size;
    runStats.timeSec = simTime;
    runStats.coreHp = modeRt.coreHp;
    runStats.fuel = modeRt.fuelTaken;
    return { ...runStats, kindKills: { ...runStats.kindKills } };
  };

  const bloodMat = new THREE.MeshBasicMaterial({
    map: bloodTex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffe29a,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const bulletGeo = new THREE.SphereGeometry(0.06, 6, 6);
  const bulletMatCache = new Map<number, THREE.MeshBasicMaterial>();
  const bulletMat = (color: number) => {
    let m = bulletMatCache.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color });
      bulletMatCache.set(color, m);
    }
    return m;
  };

  const applyMoveWithCollision = (obj: THREE.Object3D, dx: number, dz: number, radius: number) => {
    let nx = THREE.MathUtils.clamp(obj.position.x + dx, -ARENA_BOUND, ARENA_BOUND);
    let nz = THREE.MathUtils.clamp(obj.position.z + dz, -ARENA_BOUND, ARENA_BOUND);
    const resolved = resolveCircleAabbs(nx, nz, radius, colliders);
    obj.position.x = resolved.x;
    obj.position.z = resolved.z;
  };

  const spawnBloodDecal = (x: number, z: number, size = 1) => {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry((0.3 + Math.random() * 0.5) * size, 12),
      bloodMat.clone(),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.position.set(x, 0.035, z);
    scene.add(mesh);
    bloodDecals.push({ mesh, life: 10 + Math.random() * 5 });
    if (bloodDecals.length > 36) {
      const old = bloodDecals.shift();
      if (old) {
        scene.remove(old.mesh);
        (old.mesh.material as THREE.Material).dispose();
        old.mesh.geometry.dispose();
      }
    }
  };

  // pickup feed shown in the HUD so every drop explains itself
  const pickupLog: { name: string; desc: string; at: number }[] = [];
  let sampleHintShown = false;
  const notePickup = (name: string, desc: string) => {
    const now = performance.now();
    const same = pickupLog.find((p) => p.name === name && now - p.at < 3500);
    if (same) same.at = now;
    else pickupLog.push({ name, desc, at: now });
    while (pickupLog.length > 4) pickupLog.shift();
  };
  const spawnGem = (x: number, z: number, value: number) => {
    const mesh = buildSampleModel(value);
    mesh.position.set(x + (Math.random() - 0.5) * 0.4, 0.3, z + (Math.random() - 0.5) * 0.4);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);
    gems.push({ mesh, life: 16, xp: value });
  };

  const flashGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const spawnFlash = (origin: THREE.Vector3, color = 0xffe29a, scale = 1) => {
    const m = flashMat.clone();
    m.color.setHex(color);
    const mesh = new THREE.Mesh(flashGeo, m);
    mesh.scale.setScalar(Math.max(0.2, scale));
    mesh.userData.base = Math.max(0.2, scale);
    mesh.position.copy(origin);
    scene.add(mesh);
    flashes.push({ mesh, life: 0.07 });
  };

  const refreshPlayerMaxHp = () => {
    const ratio = player.hp / Math.max(1, player.maxHp);
    const base = 130;
    player.maxHp = Math.round(base * runtimeMods().maxHpMult);
    player.hp = Math.min(player.maxHp, Math.max(1, player.maxHp * ratio));
    player.healthBar.setRatio(player.hp / player.maxHp);
  };

  const runtimeMods = () => {
    const mods = { ...progress.mods };
    applySkillPassiveMods(skills, mods);
    return mods;
  };

  const gainXp = (amount: number) => {
    const rm = runtimeMods();
    const levels = gainProgressXp(
      progress,
      amount * (rm.xpMult / Math.max(0.001, progress.mods.xpMult)),
    );
    if (levels > 0) {
      audio.playLevelUp();
      grantSkillPoint(skills, levels);
      refreshPlayerMaxHp();
      for (const op of squad) {
        if (!op.alive) continue;
        op.hp = Math.min(op.maxHp, op.hp + op.maxHp * 0.15);
        op.healthBar.setRatio(op.hp / op.maxHp);
      }
      shake = Math.max(shake, 0.35);
      // Don't auto-open skill tree on level-up — upgrade cards first (avoids “frozen” feel)
    }
  };

  const getCombatStats = (weaponId: WeaponId) => {
    const mods = runtimeMods();
    const mastery = progress.masteries.find((m) => m.weaponId === weaponId);
    let damageMult = mods.damageMult * (1 + (mastery?.damage ?? 0));
    let fireRateMult = mods.fireRateMult * (1 + (mastery?.fireRate ?? 0));
    if (progress.overdriveUntil > simTime) {
      fireRateMult *= 1 + getActiveClass(progress).ability.power * progress.abilityPowerMult;
    }
    if (isRaging(skills, simTime)) {
      damageMult *= 1 + skills.ragePower;
      fireRateMult *= 1 + skills.ragePower * 0.45;
    }
    return { damageMult, fireRateMult, critChance: mods.critChance, mods };
  };

  const killZombie = (z: ZombieVisual) => {
    const pos = z.root.position;
    fx.spawnBloodBurst(pos, deathBurstScale(z.kind));
    fx.spawnHitRing(
      pos,
      z.kind === 'acid'
        ? 0x84cc16
        : z.kind === 'screamer'
          ? 0xd946ef
          : z.kind === 'runner'
            ? 0x0e7490
            : z.kind === 'tank'
              ? 0xb45309
              : 0x8b1018,
    );
    spawnBloodDecal(pos.x, pos.z, deathDecalScale(z.kind));
    spawnGem(pos.x, pos.z, z.xpValue);
    const drop = rollItemDrop(z.kind);
    if (drop) {
      const item = createWorldItem(drop, pos.clone());
      scene.add(item.mesh);
      worldItems.push(item);
    }
    audio.playZombie(z.kind, 'death');
    audio.playKill();
    kills += 1;
    runStats.kindKills[z.kind] = (runStats.kindKills[z.kind] ?? 0) + 1;
    modeRt.onZombieKilled(z);
    combo += 1;
    comboTimer = 2.5;
    pendingMissionKill = true;
    if (z.kind === 'boss' || z.kind === 'tank') shake = Math.max(shake, z.kind === 'boss' ? 0.55 : 0.35);
    const barIdx = healthBars.indexOf(z.healthBar);
    if (barIdx >= 0) healthBars.splice(barIdx, 1);
    z.healthBar.dispose();
    if (z.kind === 'bloater') bloaterExplode(z, zombieCtx, 0.8);
    if (!spawnZombieCorpse(z, scene, corpses)) disposeZombieVrm(z);
    if (z.roleMarker) {
      z.roleMarker.geometry.dispose();
      (z.roleMarker.material as THREE.Material).dispose();
      z.roleMarker = null;
    }
    scene.remove(z.root);
    const idx = zombies.indexOf(z);
    if (idx >= 0) zombies.splice(idx, 1);
  };

  const damageZombie = (
    z: ZombieVisual,
    rawDamage: number,
    hitPos: THREE.Vector3,
    knockDir: THREE.Vector3,
    opts?: { weaponId?: WeaponId; fromPlayer?: boolean },
  ) => {
    const weaponId = opts?.weaponId ?? player.weapon.id;
    const fromPlayer = opts?.fromPlayer ?? true;
    const stats = getCombatStats(weaponId);
    const hb = fromPlayer ? heroBuffs(player) : NO_BUFF;
    const crit = Math.random() < stats.critChance + hb.crit;
    const dmg = rawDamage * stats.damageMult * hb.damage * (crit ? 2.1 : 1) * (1 + Math.min(2, combo) * 0.04);
    z.hp -= dmg;
    z.healthBar.setRatio(z.hp / z.maxHp);
    z.healthBar.setVisible(true);
    flashZombieHurt(z);
    fx.spawnBloodBurst(hitPos, crit ? 1.6 : 0.85);
    fx.spawnDamageNumber(hitPos, dmg, { crit, style: crit ? 'crit' : 'enemy' });
    fx.spawnHitRing(hitPos, crit ? 0xffef5a : 0xb91c1c, 0.12);
    spawnBloodDecal(z.root.position.x, z.root.position.z, crit ? 1.3 : 0.7);
    z.root.position.add(knockDir.clone().multiplyScalar(crit ? 0.55 : 0.3));
    const hitKind =
      opts?.weaponId && ['knife', 'bat', 'axe'].includes(opts.weaponId)
        ? 'melee'
        : crit
          ? 'crit'
          : 'flesh';
    audio.playHit(hitKind);
    audio.playZombie(z.kind, 'hurt', Math.max(-1, Math.min(1, (z.root.position.x - player.root.position.x) / 24)));
    if (crit) shake = Math.max(shake, 0.22);

    const ls = stats.mods.lifesteal;
    if (fromPlayer && ls > 0 && player.alive) {
      player.hp = Math.min(player.maxHp, player.hp + dmg * ls);
      player.healthBar.setRatio(player.hp / player.maxHp);
    }

    if (fromPlayer && z.hp > 0) {
      const evo = progress.evolutions.get(weaponId);
      const chances = {
        burn: stats.mods.burnChance + (evo?.status === 'burn' ? evo.statusChance : 0),
        toxin: stats.mods.toxinChance + (evo?.status === 'toxin' ? evo.statusChance : 0),
        chill: stats.mods.chillChance + (evo?.status === 'chill' ? evo.statusChance : 0),
      };
      const rolled = rollStatusOnHit(chances, Math.max(0.8, dmg * 0.35) * stats.mods.statusPower);
      if (rolled) {
        applyStatus(z, rolled.id, rolled.power);
        fx.spawnHitRing(hitPos, statusTint(rolled.id), 0.2);
      }
    }

    if (z.hp <= 0) killZombie(z);
  };

  const damageOperative = (op: OperativeVisual, amount: number, from: THREE.Vector3, dot = false): boolean => {
    if (!op.alive || (op.invuln > 0 && !dot)) return false;
    const armor = op.isPlayer ? runtimeMods().armorFlat : 0;
    let reduced = Math.max(1, amount * (1 - Math.min(0.55, armor / 120)) * (1 - heroBuffs(op).armor));
    if (op.isPlayer && skills.shield > 0) {
      const absorbed = Math.min(skills.shield, reduced);
      skills.shield -= absorbed;
      reduced -= absorbed;
      fx.spawnHitRing(op.root.position, 0x38bdf8);
      if (reduced <= 0) {
        op.invuln = 0.25;
        return true;
      }
    }
    op.hp -= reduced;
    if (dot) {
      op.healthBar.setRatio(Math.max(0, op.hp) / Math.max(1, op.maxHp));
      op.healthBar.setVisible(true);
      fx.spawnDamageNumber(op.root.position, reduced, { style: 'player' });
      if (op.hp <= 0) {
        op.hp = 0;
        op.alive = false;
        setOperativeDead(op, true);
        op.healthBar.setVisible(false);
      }
      return true;
    }
    op.invuln = 0.7;
    bumpOperativeAnim(op, 'hit');
    const maxHp = Math.max(1, op.maxHp);
    op.healthBar.setRatio(Math.max(0, op.hp) / maxHp);
    op.healthBar.setVisible(true);
    fx.spawnHitRing(op.root.position, 0xff6644);
    fx.spawnDamageNumber(op.root.position, reduced, { style: 'player' });
    if (op.isPlayer) shake = Math.max(shake, Math.min(0.42, 0.12 + reduced * 0.012));

    // Knock away from attacker; if overlapping, use a fixed escape vector
    let kx = op.root.position.x - from.x;
    let kz = op.root.position.z - from.z;
    let kLenSq = kx * kx + kz * kz;
    if (kLenSq < 0.01) {
      kx = Math.cos(op.root.rotation.y + Math.PI);
      kz = Math.sin(op.root.rotation.y + Math.PI);
      kLenSq = 1;
    }
    const inv = 1.15 / Math.sqrt(kLenSq);
    applyMoveWithCollision(op.root, kx * inv, kz * inv, PLAYER_RADIUS);
    sanitizeObject3D(op.root);

    if (op.isPlayer) {
      audio.playPlayerHurt();
      shake = Math.max(shake, 0.35);
      combo = 0;
    }
    if (op.hp <= 0) {
      op.hp = 0;
      op.alive = false;
      setOperativeDead(op, true);
      breakGrab(op);
      if (op.isPlayer) runStats.downs += 1;
      op.healthBar.setVisible(false);
    }
    return true;
  };

  const useInventoryItem = (id: ItemId) => {
    if (!consumeItem(inventory, id, 1)) return;
    if (id === 'medkit') {
      player.hp = Math.min(player.maxHp, player.hp + 35);
      player.healthBar.setRatio(player.hp / player.maxHp);
    } else if (id === 'shield_cell') {
      skills.shield = Math.min(skills.shieldMax + 40, skills.shield + 40);
      skills.shieldMax = Math.max(skills.shieldMax, skills.shield);
    } else if (id === 'rage_stim') {
      skills.rageUntil = simTime + skills.rageDuration;
    } else if (id === 'magnet_chip') {
      skills.magnetBoostUntil = simTime + 30;
    } else if (id === 'xp_battery') {
      gainXp(25);
    } else if (id === 'armor_plate') {
      progress.mods.armorFlat += 8;
    }
    audio.playGem();
  };

  const pickupWorldItem = (item: WorldItem) => {
    const def = ITEM_DEFS[item.defId];
    if (def.autoUse) {
      if (item.defId === 'xp_battery') gainXp(25);
    } else {
      addItem(inventory, item.defId, 1);
    }
    scene.remove(item.mesh);
    notePickup(def.name, def.description);
    audio.playGem();
  };

  const input = createInput(window);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const mouseAim = new THREE.Vector3(0, 0, -4);
  const tmp = new THREE.Vector3();
  const muzzleWorld = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const hitPos = new THREE.Vector3();
  const prevKeys: Record<string, boolean> = {};

  const rebuildZombieHash = () => {
    zombieHash.clear();
    for (const z of zombies) {
      if (z.hp <= 0) continue;
      zombieHash.insert(z.root.position.x, z.root.position.z, z);
    }
  };

  const findNearestZombie = (from: THREE.Vector3, range: number): ZombieVisual | null => {
    let best: ZombieVisual | null = null;
    let bestD = range;
    const rangeSq = range * range;
    zombieHash.query(from.x, from.z, range, zombieQuery);
    for (let i = 0; i < zombieQuery.length; i++) {
      const z = zombieQuery[i]!;
      if (z.hp <= 0) continue;
      const dx = z.root.position.x - from.x;
      const dz = z.root.position.z - from.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD * bestD && d2 <= rangeSq) {
        const d = Math.sqrt(d2);
        bestD = d;
        best = z;
      }
    }
    return best;
  };

  const equipSlot = (i: number) => {
    if (i < 0 || i >= weaponSlots.length || !player.alive) return;
    if (i === activeSlot && weaponVariantId(player.weapon) === weaponSlots[i]) return;
    activeSlot = i;
    const def = weaponByVariant(weaponSlots[i]!);
    setOperativeWeapon(player, weaponIndexOfVariant(weaponSlots[i]!));
    setActiveClassForWeapon(progress, def.id);
    audio.playWeaponSwitch();
  };
  const cycleSlot = (delta: number) => {
    if (weaponSlots.length < 2) return;
    equipSlot((activeSlot + delta + weaponSlots.length) % weaponSlots.length);
  };

  // ---- weapon impact effects (per-variant fx) ----
  const beams: Array<{ line: THREE.Line; life: number }> = [];
  const beamMats = new Map<number, THREE.LineBasicMaterial>();
  const spawnBeam = (from: THREE.Vector3, to: THREE.Vector3, color: number) => {
    let m = beamMats.get(color);
    if (!m) {
      m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false, blending: THREE.AdditiveBlending });
      beamMats.set(color, m);
    }
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const p = from.clone().lerp(to, i / 6);
      if (i > 0 && i < 6) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.45, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.45));
      pts.push(p);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m);
    scene.add(line);
    beams.push({ line, life: 0.12 });
  };
  const bulletImpact = (b: Bullet, at: THREE.Vector3, z: ZombieVisual | null, dir: THREE.Vector3) => {
    const f = b.fx;
    if (!f) return;
    const opts = { weaponId: b.owner.weapon.id, fromPlayer: b.owner.isPlayer };
    const chance = f.statusChance ?? 0.25;
    switch (f.impact) {
      case 'explosive': {
        const r = (f.aoe ?? 2.5) * progress.mods.aoeRadiusMult;
        fx.spawnHitRing(at.clone().setY(0.2), 0xffa040, 0.2);
        fx.spawnWarnRing(at, r, 0xff8a2a, 0.12);
        fx.spawnBloodBurst(at.clone().setY(0.8), 1.6, 0xffa040);
        spawnFlash(at.clone().setY(0.8), 0xffb060, r * 1.2);
        audio.playGunshot('shotgun', 0);
        shake = Math.max(shake, 0.18 + r * 0.03);
        zombieHash.query(at.x, at.z, r, zombieQuery);
        for (let i = 0; i < zombieQuery.length; i++) {
          const o = zombieQuery[i]!;
          if (o.hp <= 0 || o === z) continue;
          const d = Math.hypot(o.root.position.x - at.x, o.root.position.z - at.z);
          if (d > r) continue;
          const kd = o.root.position.clone().sub(at).setY(0).normalize();
          damageZombie(o, b.damage * 0.75 * (1 - (d / r) * 0.5), o.root.position.clone().setY(1.1), kd, opts);
          o.root.position.addScaledVector(kd, 0.6);
        }
        break;
      }
      case 'incendiary':
        if (z && Math.random() < chance) applyStatus(z, 'burn', 1.6 * progress.mods.statusPower);
        if (f.aoe) {
          fx.spawnHitRing(at, 0xff5a1f, 0.15);
          zombieHash.query(at.x, at.z, f.aoe, zombieQuery);
          for (let i = 0; i < zombieQuery.length; i++) if (zombieQuery[i]!.hp > 0) applyStatus(zombieQuery[i]!, 'burn', 1.4);
        }
        fx.spawnBloodBurst(at, 0.5, 0xff7a2a);
        break;
      case 'cryo':
        if (z && Math.random() < chance) applyStatus(z, 'chill', 1.8 * progress.mods.statusPower);
        fx.spawnBloodBurst(at, 0.45, 0x9be7ff);
        break;
      case 'toxic':
        if (z && Math.random() < chance) applyStatus(z, 'toxin', 1.6 * progress.mods.statusPower);
        fx.spawnBloodBurst(at, 0.45, 0x9cff2e);
        break;
      case 'shock': {
        if (!z) break;
        let cur = z;
        const hit = new Set<ZombieVisual>([z]);
        for (let k = 0; k < (f.chain ?? 2); k++) {
          let best: ZombieVisual | null = null;
          let bestD = 6;
          zombieHash.query(cur.root.position.x, cur.root.position.z, 6, zombieQuery);
          for (let i = 0; i < zombieQuery.length; i++) {
            const o = zombieQuery[i]!;
            if (o.hp <= 0 || hit.has(o)) continue;
            const d = o.root.position.distanceTo(cur.root.position);
            if (d < bestD) {
              bestD = d;
              best = o;
            }
          }
          if (!best) break;
          hit.add(best);
          const a = cur.root.position.clone().setY(1.2);
          const c = best.root.position.clone().setY(1.2);
          spawnBeam(a, c, 0x8fdcff);
          damageZombie(best, b.damage * 0.6, c, c.clone().sub(a).setY(0).normalize(), opts);
          applyStatus(best, 'chill', 0.8);
          cur = best;
        }
        fx.spawnHitRing(at, 0x8fdcff, 0.2);
        break;
      }
      case 'heavy':
        if (z) {
          z.root.position.addScaledVector(dir.clone().setY(0), 0.25);
          fx.spawnBloodBurst(at, 1.25);
        }
        break;
      default:
        break;
    }
  };

  const fireFrom = (op: OperativeVisual) => {
    if (!op.alive || op.reloading) return;
    const weapon = op.weapon;

    // Character facing is the authority for aim (gun local +Z is aligned to this)
    tmp.set(0, 0, 1).applyQuaternion(op.root.quaternion);
    tmp.y = 0;
    if (tmp.lengthSq() < 1e-6) tmp.set(0, 0, 1);
    tmp.normalize();
    const forward = tmp.clone();

    const pan = Math.max(-1, Math.min(1, (op.root.position.x - player.root.position.x) / 24));

    if (weapon.melee) {
      op.meleeSwing = 0.01;
      op.recoil = weapon.recoil;
      bumpOperativeAnim(op, 'shot');
      alignGunToAim(op, op.recoil);
      op.gun.updateWorldMatrix(true, true);
      op.muzzlePoint.getWorldPosition(muzzleWorld);
      audio.playGunshot('melee', pan);
      fx.spawnHitRing(muzzleWorld, weapon.tracerColor);
      shake = Math.max(shake, 0.08);

      const arc = weapon.meleeArc ?? 1;
      const range = weapon.range;
      const stats = getCombatStats(weapon.id);
      const dmg =
        weapon.damage * (op.isPlayer ? stats.damageMult : 0.85) * (op.isPlayer ? 1 : 0.9);

      zombieHash.query(op.root.position.x, op.root.position.z, range, zombieQuery);
      for (let mi = 0; mi < zombieQuery.length; mi++) {
        const z = zombieQuery[mi]!;
        const dx = z.root.position.x - op.root.position.x;
        const dz = z.root.position.z - op.root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > range || dist < 0.05) continue;
        const ndx = dx / dist;
        const ndz = dz / dist;
        const dot = forward.x * ndx + forward.z * ndz;
        if (dot < Math.cos(arc)) continue;
        const meleeHit = z.root.position.clone();
        meleeHit.y += 1.1;
        damageZombie(z, dmg, meleeHit, forward, {
          weaponId: weapon.id,
          fromPlayer: op.isPlayer,
        });
      }
      return;
    }

    if (op.ammo <= 0) {
      if (op.isPlayer) audio.playEmptyClick();
      beginReload(op);
      if (op.reloading) audio.playReload();
      return;
    }

    op.ammo -= 1;
    op.recoil = weapon.recoil;
    bumpOperativeAnim(op, 'shot');
    alignGunToAim(op, op.recoil);
    op.gun.updateWorldMatrix(true, true);
    op.muzzlePoint.getWorldPosition(muzzleWorld);
    const wfx = weapon.fx;
    op.muzzleLight.intensity = 8 * (wfx?.flashScale ?? 1);
    if (wfx) op.muzzleLight.color.setHex(wfx.flash);
    spawnFlash(muzzleWorld, wfx?.flash ?? 0xffe29a, wfx?.flashScale ?? 1);
    audio.playGunshot(weapon.sfx, pan);

    let pierce = 0;
    if (op.isPlayer && progress.pierceShots > 0) {
      pierce = 3;
      progress.pierceShots -= 1;
    }

    for (let p = 0; p < weapon.pellets; p++) {
      const dir = forward.clone();
      if (weapon.spread > 0) {
        const yaw = (Math.random() - 0.5) * weapon.spread * 2;
        const pitch = (Math.random() - 0.5) * weapon.spread * 0.4;
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        dir.y += pitch;
        dir.normalize();
      }
      const mesh = new THREE.Mesh(bulletGeo, bulletMat(pierce > 0 ? 0x88eeff : weapon.tracerColor));
      mesh.position.copy(muzzleWorld);
      const tr = wfx?.tracer ?? 1;
      mesh.scale.set(tr, tr, tr * (wfx?.impact === 'explosive' ? 1.2 : 2.6));
      mesh.lookAt(muzzleWorld.clone().add(dir));
      scene.add(mesh);
      const pierceBonus = pierce > 0 ? getActiveClass(progress).ability.power : 1;
      const speed = (55 + weapon.range * 0.4) * (wfx?.speed ?? 1);
      bullets.push({
        mesh,
        vel: dir.multiplyScalar(speed),
        life: weapon.range / (40 * (wfx?.speed ?? 1)),
        damage: weapon.damage * (op.isPlayer ? pierceBonus : 1) * (op.isPlayer ? 1 : 0.85),
        owner: op,
        pierce: Math.max(pierce, wfx?.pierce ?? 0),
        fx: wfx,
      });
    }
  };

  const tryAutoFire = (op: OperativeVisual, preferTarget: THREE.Vector3 | null) => {
    if (!op.alive || op.fireCooldown > 0 || op.reloading) return;
    if (!op.weapon.melee && op.ammo <= 0) {
      if (beginReload(op)) audio.playReload();
      return;
    }
    const target = findNearestZombie(op.root.position, op.weapon.range);
    if (!target) {
      if (preferTarget) faceToward(op.root, preferTarget.x, preferTarget.z);
      return;
    }
    faceToward(op.root, target.root.position.x, target.root.position.z);
    fireFrom(op);
    const stats = getCombatStats(op.weapon.id);
    const rateMul = op.isPlayer ? stats.fireRateMult : 1;
    const disrupt = fireRateDebuffMul(op, performance.now() / 1000);
    op.fireCooldown = (op.weapon.fireRate / Math.max(0.35, rateMul * heroBuffs(op).fireRate)) * disrupt;
  };

  heroRt = createHeroAbilityRuntime(hero.id, loadout.abilityLevels, {
    scene,
    fx,
    player,
    squad,
    zombies,
    aim: mouseAim,
    damageZombie: (z, dmg, at, dir) => damageZombie(z, dmg, at, dir, { weaponId: player.weapon.id, fromPlayer: true }),
    moveWithCollision: applyMoveWithCollision,
    revive: (op) => {
      op.alive = true;
      op.hp = op.maxHp * 0.5;
      setOperativeDead(op, false);
      op.invuln = 1.5;
      op.healthBar.setVisible(true);
      op.healthBar.setRatio(op.hp / op.maxHp);
      fx.spawnHitRing(op.root.position, 0x7cffb2);
    },
    addPierceShots: (k) => {
      progress.pierceShots += k;
    },
    shake: (a) => {
      shake = Math.max(shake, a);
    },
    anim: (op, kind) => bumpOperativeAnim(op, kind),
    sfx: (kind) => {
      if (kind === 'boom') audio.playGunshot('shotgun', 0);
      else if (kind === 'zap') audio.playHit('crit');
      else if (kind === 'throw') audio.playWeaponSwitch();
      else audio.playAbility();
    },
    vfx: skillFx,
    powerMult: () => progress.abilityPowerMult,
    aoeMult: () => progress.mods.aoeRadiusMult,
    cdrMult: () => 1 - Math.min(0.6, progress.mods.abilityCdr),
  });

  // YAZS run skills (auto-cast, picked on level-up)
  progress.runSkills = createRunSkillState(HERO_START_SKILL[hero.id]);
  {
    // dev: ?skills=saws:5,laser:3,meteor:5e  (e = evolved)
    const dev = new URLSearchParams(location.search).get('skills');
    if (dev) {
      for (const part of dev.split(',')) {
        const [id, lv] = part.split(':');
        if (!id || !(id in RUN_SKILLS)) continue;
        progress.runSkills.skills.set(id as RunSkillId, Math.min(5, parseInt(lv ?? '1', 10) || 1));
        if (lv?.endsWith('e')) progress.runSkills.evolved.add(id as RunSkillId);
      }
    }
  }
  const runSkills = new RunSkillRuntime({
    scene,
    fx: skillFx,
    player,
    zombies,
    state: progress.runSkills,
    damageZombie: (z, dmg, at, dir) => damageZombie(z, dmg, at, dir, { weaponId: player.weapon.id, fromPlayer: true }),
    shake: (a) => {
      shake = Math.max(shake, a);
    },
    sfx: (kind) => {
      if (kind === 'boom') audio.playGunshot('shotgun', 0);
      else if (kind === 'zap') audio.playHit('crit');
      else if (kind === 'throw') audio.playWeaponSwitch();
      else if (kind === 'shot') audio.playGunshot('smg', 0);
    },
    powerMult: () => progress.abilityPowerMult,
  });

  const castHero = (slot: AbilitySlot) => {
    if (!player.alive || progress.pendingPicks > 0 || !heroRt) return;
    if (heroRt.cast(slot, simTime)) shake = Math.max(shake, 0.12);
  };

  const activateAbility = () => {
    if (!player.alive || progress.pendingPicks > 0) return;
    if (progress.abilityCooldown > 0) return;
    const ability = startAbilityCooldown(progress, simTime);
    audio.playAbility();
    bumpOperativeAnim(player, 'ability');
    castAbility({
      scene,
      fx,
      runtime: abilityRuntime,
      progress,
      ability,
      caster: player,
      squad,
      zombies,
      damageZombie,
      now: simTime,
    });
    shake = Math.max(shake, 0.25);
  };

  const doSelectUpgrade = (index: number) => {
    const card = selectUpgrade(progress, index);
    if (!card) return;
    audio.playLevelUp();
    refreshPlayerMaxHp();
    if (card.heroRank && heroRt) heroRt.bonus[card.heroRank] = progress.heroRankBonus[card.heroRank];
  };

  const doRerollUpgrades = () => {
    if (rerollUpgrades(progress)) audio.playAbility();
  };

  const doLockdownUpgrade = (index: number) => {
    lockdownUpgrade(progress, index);
  };

  const doBanishUpgrade = (index: number) => {
    if (banishUpgrade(progress, index)) audio.playAbility();
  };

  const doSkipUpgrade = () => {
    skipUpgrade(progress);
  };

  let upgradeFocus = 0;

  const updateAimFromMouse = () => {
    const rect = container.getBoundingClientRect();
    ndc.x = ((input.mouse.x - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    ndc.y = -((input.mouse.y - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) mouseAim.copy(hit);
  };

  let userPaused = false;

  const setPaused = (paused: boolean) => {
    if (!player.alive) {
      userPaused = false;
      return;
    }
    if (progress.pendingPicks > 0) {
      userPaused = false;
      return;
    }
    userPaused = paused;
  };

  const togglePause = (): boolean => {
    setPaused(!userPaused);
    return userPaused;
  };

  const handleHotkeys = () => {
    if (userPaused) return;

    const upgrading = progress.pendingPicks > 0 && progress.choices.length > 0;

    if (upgrading) {
      for (let i = 0; i < 4; i++) {
        const code = `Digit${i + 1}`;
        if (input.keys[code] && !prevKeys[code]) {
          upgradeFocus = i;
          doSelectUpgrade(i);
        }
        prevKeys[code] = !!input.keys[code];
      }
      if (input.keys.KeyR && !prevKeys.KeyR) doRerollUpgrades();
      if (input.keys.KeyL && !prevKeys.KeyL) doLockdownUpgrade(upgradeFocus);
      if (input.keys.KeyB && !prevKeys.KeyB) doBanishUpgrade(upgradeFocus);
      if (input.keys.KeyV && !prevKeys.KeyV) doSkipUpgrade();
      prevKeys.KeyR = !!input.keys.KeyR;
      prevKeys.KeyL = !!input.keys.KeyL;
      prevKeys.KeyB = !!input.keys.KeyB;
      prevKeys.KeyV = !!input.keys.KeyV;
      prevKeys.KeyQ = !!input.keys.KeyQ;
      prevKeys.KeyE = !!input.keys.KeyE;
      return;
    }

    for (let i = 0; i < 8; i++) {
      const code = `Digit${i + 1}`;
      if (input.keys[code] && !prevKeys[code]) equipSlot(i);
      prevKeys[code] = !!input.keys[code];
    }
    const wheel = input.consumeWeaponWheel();
    if (wheel !== 0) cycleSlot(wheel > 0 ? 1 : -1);
    if (input.keys.KeyQ && !prevKeys.KeyQ) castHero('q');
    if (input.keys.KeyE && !prevKeys.KeyE) castHero('e');
    if (input.keys.KeyR && !prevKeys.KeyR) castHero('r');
    if (input.keys.KeyF && !prevKeys.KeyF) {
      if (activateRage(skills, simTime)) {
        audio.playAbility();
        fx.spawnHitRing(player.root.position, 0xef4444);
        shake = Math.max(shake, 0.25);
      }
    }
    if (input.keys.KeyG && !prevKeys.KeyG) {
      if (beginReload(player)) audio.playReload();
    }
    if (input.keys.KeyT && !prevKeys.KeyT) showSkillTree = !showSkillTree;
    if (input.keys.KeyI && !prevKeys.KeyI) showInventory = !showInventory;
    // Quick-use: Z medkit, X shield, C rage stim
    if (input.keys.KeyZ && !prevKeys.KeyZ) useInventoryItem('medkit');
    if (input.keys.KeyX && !prevKeys.KeyX) useInventoryItem('shield_cell');
    if (input.keys.KeyC && !prevKeys.KeyC) useInventoryItem('rage_stim');
    prevKeys.KeyQ = !!input.keys.KeyQ;
    prevKeys.KeyE = !!input.keys.KeyE;
    prevKeys.KeyR = !!input.keys.KeyR;
    prevKeys.KeyF = !!input.keys.KeyF;
    prevKeys.KeyG = !!input.keys.KeyG;
    prevKeys.KeyT = !!input.keys.KeyT;
    prevKeys.KeyI = !!input.keys.KeyI;
    prevKeys.KeyZ = !!input.keys.KeyZ;
    prevKeys.KeyX = !!input.keys.KeyX;
    prevKeys.KeyC = !!input.keys.KeyC;
  };

  let lastT = performance.now();
  let audioUnlocked = false;
  let reviveTimer = 0;

  const setSize = (w: number, h: number) => {
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

  const getHudState = (): ArenaHudState => {
    const cls = getActiveClass(progress);
    const cdr = Math.min(0.6, progress.mods.abilityCdr);
    const maxCd = cls.ability.cooldown * (1 - cdr);
    const nowMs = performance.now();
    return {
      pickups: pickupLog.filter((p) => nowMs - p.at < 3500).map((p) => ({ name: p.name, desc: p.desc, age: (nowMs - p.at) / 1000 })),
      heroId: hero.id,
      runSkills: runSkills.hud(),
      heroAbilities: heroRt
        ? (['q', 'e', 'r'] as AbilitySlot[]).map((sl) => ({
            slot: sl.toUpperCase(),
            name: heroRt!.defs[sl].name,
            icon: heroRt!.defs[sl].icon,
            color: heroRt!.defs[sl].color,
            cooldown: heroRt!.cooldowns[sl],
            maxCooldown: heroRt!.maxCooldown(sl),
            level: heroRt!.level(sl),
          }))
        : [],
      weaponSlots: weaponSlots.map((v, i) => {
        const w = weaponByVariant(v);
        return { name: w.name, active: i === activeSlot, tier: w.tier ?? 1 };
      }),
      weapon: player.weapon.variant ? player.weapon.name : weaponDisplayName(progress, player.weapon.id),
      weaponId: player.weapon.id,
      className: cls.name,
      abilityName: cls.ability.name,
      abilityReady: progress.abilityCooldown <= 0,
      abilityCooldown: progress.abilityCooldown,
      abilityMaxCooldown: maxCd,
      hp: Math.max(0, player.hp),
      maxHp: player.maxHp,
      xp: progress.xp,
      xpToLevel: progress.xpToLevel,
      level: progress.level,
      kills,
      wave,
      combo,
      alive: player.alive,
      pausedForUpgrade: progress.pendingPicks > 0,
      paused: userPaused && progress.pendingPicks <= 0 && player.alive,
      choices: [...progress.choices],
      unlockedWeapons: listUnlockedWeaponDefs(progress).map((w) => ({ id: w.id, label: weaponUnlockLabel(w.id) })),
      modsSummary: [
        `DMG x${progress.mods.damageMult.toFixed(2)}`,
        `FR x${progress.mods.fireRateMult.toFixed(2)}`,
        `CRIT ${(progress.mods.critChance * 100).toFixed(0)}%`,
        progress.mods.lifesteal > 0 ? `LS ${(progress.mods.lifesteal * 100).toFixed(0)}%` : '',
        progress.mods.armorFlat > 0 ? `ARM ${progress.mods.armorFlat}` : '',
        progress.mods.burnChance > 0 ? `BRN ${(progress.mods.burnChance * 100).toFixed(0)}%` : '',
        progress.mods.toxinChance > 0 ? `TXN ${(progress.mods.toxinChance * 100).toFixed(0)}%` : '',
        progress.mods.chillChance > 0 ? `CHL ${(progress.mods.chillChance * 100).toFixed(0)}%` : '',
        progress.evolutions.size > 0 ? `EVO ${progress.evolutions.size}` : '',
      ].filter(Boolean),
      overdrive: progress.overdriveUntil > simTime,
      pierceShots: progress.pierceShots,
      squad: squad.map((s) => ({
        name: s.name,
        hp: Math.max(0, s.hp),
        maxHp: s.maxHp,
        alive: s.alive,
        icon: rosterById((s.rosterId ?? 'ironclad') as 'ironclad').icon,
        classId: s.classId,
      })),
      rescue: getRescueHud(rescueSlots, simTime),
      runTimeSec: simTime,
      inventory: inventory.slots.map((s) => ({
        id: s.itemId,
        name: ITEM_DEFS[s.itemId].name,
        count: s.count,
      })),
      scrap: inventory.scrap,
      shield: skills.shield,
      shieldMax: skills.shieldMax,
      skillPoints: skills.points,
      skills: SKILL_NODES.map((n) => ({
        id: n.id,
        name: n.name,
        description: n.description,
        rank: skills.ranks[n.id] ?? 0,
        maxRank: n.maxRank,
        cost: n.costPerRank,
        canUnlock: canUnlock(skills, n.id),
        column: n.column,
        row: n.row,
      })),
      showSkillTree,
      showInventory,
      raging: isRaging(skills, simTime),
      pickupRadius: effectivePickupRadius(skills),
      ammo: player.ammo,
      magSize: player.weapon.magSize,
      reloading: player.reloading,
      reloadProgress: player.reloading
        ? 1 - player.reloadTimer / Math.max(0.01, player.weapon.reloadTime)
        : 1,
      mission: modeRt.hud(missionHud),
      runOver,
      revivesLeft: modeRt.revivesLeft,
      runStats: snapshotRunStats(),
      maxSquad: MAX_SQUAD_SIZE,
      rerolls: progress.rerolls,
      lockdowns: progress.lockdowns,
      banishes: progress.banishes,
      lockedChoiceIndex: progress.lockedChoiceIndex,
      moveSpeedMult: progress.mods.moveSpeedMult,
      xpMult: progress.mods.xpMult,
      armorFlat: progress.mods.armorFlat,
      critChance: progress.mods.critChance,
      dangerLevel: Math.max(1, wave),
    };
  };

  let frameEma = 16;
  let slowFor = 0;
  let fastFor = 0;
  let frameNo = 0;
  const applyQuality = (q: number) => {
    quality = q;
    try {
      localStorage.setItem('protocol-z-quality', String(q));
    } catch {
      /* ignore */
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_DPR[q]!));
    setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.autoUpdate = q < 2;
    // keep shadows enabled (toggling recompiles every material); just make them cheap
    const size = q === 0 ? 2048 : q >= 3 ? 512 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.setScalar(size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  const tuneQuality = (frameMs: number) => {
    frameEma += (Math.min(100, frameMs) - frameEma) * 0.05;
    if (frameEma > 24) {
      slowFor += frameMs / 1000;
      fastFor = 0;
      if (slowFor > 2.5 && quality < 3) {
        applyQuality(quality + 1);
        slowFor = 0;
        frameEma = 18;
      }
    } else if (frameEma < 11) {
      fastFor += frameMs / 1000;
      slowFor = 0;
      if (fastFor > 10 && quality > 1) {
        applyQuality(quality - 1);
        fastFor = 0;
      }
    } else {
      slowFor = Math.max(0, slowFor - frameMs / 2000);
      fastFor = 0;
    }
  };

  // -------------------------------------------------------------------------
  // Warm-up: compile every shader, upload every texture/geometry and build the
  // shadow programs behind a loading screen, so nothing hitches the first time
  // a new area, zombie type, mutant, objective or effect shows up.
  // -------------------------------------------------------------------------
  let warming = true;
  const warmEl = document.createElement('div');
  warmEl.className = 'pzWarm';
  warmEl.innerHTML = '<div><b>BÖLGE HAZIRLANIYOR</b><small>Grafikler önbelleğe alınıyor…</small><i></i></div>';
  container.appendChild(warmEl);
  const warmKeep = new THREE.Group();
  warmKeep.name = 'warmKeep';
  scene.add(warmKeep);
  const initAllTextures = (root: THREE.Object3D) => {
    const seen = new Set<THREE.Texture>();
    root.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        for (const v of Object.values(m as unknown as Record<string, unknown>)) {
          if (v instanceof THREE.Texture && !seen.has(v)) {
            seen.add(v);
            try {
              renderer.initTexture(v);
            } catch {
              /* ignore */
            }
          }
        }
      }
    });
  };
  const overviewRender = () => {
    // one frame that sees the whole map: uploads all geometry and shadow programs
    const B = ARENA_BOUND + 10;
    const ortho = new THREE.OrthographicCamera(-B, B, B, -B, 1, 400);
    ortho.position.set(0, 150, 0.01);
    ortho.lookAt(0, 0, 0);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, ortho);
  };
  void (async () => {
    const t0 = performance.now();
    try {
      await Promise.race([map.ready, new Promise((r) => setTimeout(r, 15000))]);
      await preloadAvatars();
      // one live instance of every zombie model + type (kept hidden afterwards so
      // their GPU programs/textures stay resident)
      const jobs: Promise<unknown>[] = [];
      let k = 0;
      for (const [kind, look] of Object.entries(ZOMBIE_LOOKS)) {
        for (const id of look.pool) {
          const i = k++;
          jobs.push(
            createVrmAvatar({ url: `/avatars/rb/zombie_${id}.glb`, accentColor: 0x6b3f2a, style: 'zombie', targetHeight: 2, showRing: false, zombieKind: kind as ZombieVisual['kind'] })
              .then((a) => {
                a.root.position.set(player.root.position.x + (i % 6) * 1.5 - 4, 0, player.root.position.z + Math.floor(i / 6) * 1.5 + 3);
                warmKeep.add(a.root);
              })
              .catch(() => undefined),
          );
        }
      }
      // squad / captive operatives (rescue objectives)
      allAvatarUrls().forEach((url, i) => {
        jobs.push(
          createVrmAvatar({ url, accentColor: 0x888888, style: 'operative', showRing: false })
            .then((a) => {
              a.root.position.set(player.root.position.x + i * 1.2 - 4, 0, player.root.position.z - 3);
              warmKeep.add(a.root);
            })
            .catch(() => undefined),
        );
      });
      await Promise.all(jobs);
      // effects: fire each primitive once so their materials exist
      const at = player.root.position.clone().add(new THREE.Vector3(0, 0, 4));
      skillFx.explosion(at, 2);
      skillFx.gas(at.x, at.z, 1);
      skillFx.vapor(at, 1);
      skillFx.dustRing(at, 2);
      skillFx.debris(at, 4, 1);
      skillFx.tracer(player.root.position.clone().setY(1.3), at.clone().setY(1));
      skillFx.bolt(player.root.position.clone().setY(1.3), at.clone().setY(1), 0xd8e6ff, 0.06, 0.1, 6);
      skillFx.flame(at.x, at.z, 1);
      fx.spawnBloodBurst(at, 1, 0x7a1010);
      fx.spawnHitRing(at, 0x9a2a1e, 0.1);
      fx.spawnWarnRing(at, 2, 0x9a2a1e, 0.5);
      for (const m of runSkills.warmMaterials()) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), m);
        mesh.position.copy(at);
        warmKeep.add(mesh);
      }
      await renderer.compileAsync(scene, camera);
      initAllTextures(scene);
      overviewRender();
      renderer.render(scene, camera);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    } catch (err) {
      console.warn('[arena] warm-up failed', err);
    } finally {
      // flush the test effects, hide the warm instances
      skillFx.update(20);
      fx.update(20);
      for (const c of warmKeep.children) c.visible = false;
      warming = false;
      warmEl.classList.add('off');
      setTimeout(() => warmEl.remove(), 600);
      lastT = performance.now();
      console.info(`[arena] warm-up ${(performance.now() - t0).toFixed(0)} ms`);
    }
  })();

  const animate = (now: number) => {
    if (warming) {
      lastT = now;
      return;
    }
    const frameMs = now - lastT;
    const rawDt = Math.min(0.05, frameMs / 1000);
    lastT = now;
    frameNo++;
    if (!document.hidden && frameMs > 0 && frameMs < 500) tuneQuality(frameMs);
    // low quality: refresh the sun shadow map every other frame
    if (quality >= 2) renderer.shadowMap.needsUpdate = frameNo % 2 === 0;
    const upgrading = progress.pendingPicks > 0;
    if (upgrading || !player.alive) userPaused = false;
    const frozen = upgrading || userPaused || !!runOver;
    const dt = frozen ? 0 : rawDt;
    if (!frozen) simTime += dt;
    const t = simTime;

    if (!audioUnlocked && (input.mouse.down || input.keys.KeyW || input.keys.KeyA || input.keys.KeyS || input.keys.KeyD || input.keys.Space)) {
      audio.resume();
      audioUnlocked = true;
    }

    updateAimFromMouse();
    handleHotkeys();

    if (frozen) {
      billboardHealthBars(healthBars, camera);
      renderer.render(scene, camera);
      return;
    }

    tickProgressTimers(progress, dt, simTime);
    tickSkillTree(skills, dt, simTime);

    const rescueEvents = tickRescueSystem({
      slots: rescueSlots,
      simTime,
      dt,
      scene,
      player,
      squad,
      colliders,
      healthBars,
      bound: ARENA_BOUND,
    });
    if (rescueEvents.spawned || rescueEvents.retrying) {
      audio.playLevelUp();
      shake = Math.max(shake, 0.2);
    }
    if (rescueEvents.rescued) {
      audio.playGem();
      shake = Math.max(shake, 0.3);
      pendingMissionRescue = true;
      const joined = squad[squad.length - 1];
      if (joined && !joined.isPlayer) {
        void attachVrmToOperative(joined, joined.gender).then((avatar) => {
          if (!avatar) joined.proxy.visible = true;
        });
      }
    }
    if (rescueEvents.failed) {
      audio.playPlayerHurt();
    }

    waveTimer += dt;
    comboTimer = Math.max(0, comboTimer - dt);
    if (comboTimer <= 0) combo = 0;
    if (waveTimer > 45) {
      waveTimer = 0;
      wave += 1;
      spawnBudget = Math.round(clientWaveSpawnBudget(wave) * diff.count * modeRt.spawnMul);
      shake = Math.max(shake, 0.3);
      const wk = waveKindForLevel(wave);
      if (wk === 'horde') {
        missionRuntime.banner = `DALGA ${wave}: HORDE SALDIRISI`;
        missionRuntime.bannerUntil = simTime + 3.8;
      } else if (wk === 'elite_super') {
        missionRuntime.banner = `DALGA ${wave}: ELİT SÜPER`;
        missionRuntime.bannerUntil = simTime + 3.8;
      } else {
        missionRuntime.banner = `DALGA ${wave}`;
        missionRuntime.bannerUntil = simTime + 2.2;
      }
    }
    if (spawnBudget > 0 && zombies.length < MAX_ZOMBIES) {
      spawnBudget -= 1;
      const kind = pickWaveSpawnKind(wave, spawnBudget);
      if (mission.mode === 'defense' && Math.random() < 0.45) {
        const a = Math.random() * Math.PI * 2;
        const c = map.anchors.core;
        spawnZombie(kind, true, { x: c.x + Math.cos(a) * 32, z: c.z + Math.sin(a) * 32 });
      } else spawnZombie(kind);
    }
    modeRt.update(dt, kills);
    if (modeRt.outcome && !runOver) {
      runOver = modeRt.outcome;
      runStats.won = runOver.won;
    }

    lodFrame += 1;
    beginZombieLodFrame(12);
    beginZombieVrmAttachBudget(2);
    rebuildZombieHash();

    for (const op of squad) {
      op.fireCooldown = Math.max(0, op.fireCooldown - dt);
      op.invuln = Math.max(0, op.invuln - dt);
      op.muzzleLight.intensity = THREE.MathUtils.lerp(op.muzzleLight.intensity, 0, dt * 16);
      if (tickReload(op, dt) && op.isPlayer) audio.playWeaponSwitch();
      if (op.alive) op.healthBar.setRatio(op.hp / op.maxHp);
    }

    if (player.alive) {
      for (const ally of squad) {
        if (ally.alive || ally.isPlayer) continue;
        if (ally.root.position.distanceTo(player.root.position) < 4) {
          ally.hp = Math.min(ally.maxHp, ally.hp + dt * 25);
          if (ally.hp >= ally.maxHp * 0.35) {
            ally.alive = true;
            setOperativeDead(ally, false);
            ally.invuln = 1.2;
            ally.healthBar.setVisible(true);
          }
        }
      }
    } else {
      reviveTimer += dt;
      if (reviveTimer > 4 && !runOver && !modeRt.tryRevive()) {
        modeRt.fail('Tüm dirilme hakların bitti.');
      } else if (reviveTimer > 4 && !runOver) {
        reviveTimer = 0;
        player.alive = true;
        player.hp = player.maxHp * 0.45;
        setOperativeDead(player, false);
        player.invuln = 2;
        player.healthBar.setVisible(true);
        player.healthBar.setRatio(player.hp / player.maxHp);
      }
    }

    const moveMul = runtimeMods().moveSpeedMult * (isRaging(skills, simTime) ? 1.12 : 1) * heroBuffs(player).move;
    const axis = input.moveAxis();
    const moving = player.alive && Math.hypot(axis.x, axis.z) > 0.01 && !operativePinned(player, nowSec);
    if (moving) {
      applyMoveWithCollision(
        player.root,
        axis.x * player.moveSpeed * moveMul * dt,
        axis.z * player.moveSpeed * moveMul * dt,
        PLAYER_RADIUS,
      );
      audio.playFootstep();
    }

    // Magnet / pickup radius loot vacuum
    const magnetR = effectivePickupRadius(skills);
    for (let i = worldItems.length - 1; i >= 0; i--) {
      const item = worldItems[i]!;
      updateWorldItem(item, dt);
      if (player.alive) {
        const d = item.mesh.position.distanceTo(player.root.position);
        if (d < magnetR) {
          tmp.copy(player.root.position).sub(item.mesh.position).normalize().multiplyScalar(dt * (10 + (magnetR - d) * 2));
          item.mesh.position.add(tmp);
        }
        if (d < 1.3) {
          pickupWorldItem(item);
          worldItems.splice(i, 1);
          continue;
        }
      }
      if (item.life <= 0) {
        scene.remove(item.mesh);
        worldItems.splice(i, 1);
      }
    }

    if (player.alive) {
      const playerTarget = findNearestZombie(player.root.position, player.weapon.range);
      if (playerTarget) faceToward(player.root, playerTarget.root.position.x, playerTarget.root.position.z);
      else faceToward(player.root, mouseAim.x, mouseAim.z);
    }
    sanitizeObject3D(player.root);
    animateOperative(player, t, dt, moving, true);
    if (player.alive) tryAutoFire(player, mouseAim);

    // 7 ally formation slots for full 8-rifle fireteam
    const formSlots: Array<{ right: number; forward: number }> = [
      { right: 2.6, forward: -0.6 },
      { right: -2.6, forward: -0.6 },
      { right: 4.2, forward: -1.6 },
      { right: -4.2, forward: -1.6 },
      { right: 1.4, forward: -3.2 },
      { right: -1.4, forward: -3.2 },
      { right: 0, forward: -4.6 },
    ];
    // Formation axes from player facing (fallback world if idle)
    tmp.set(0, 0, 1).applyQuaternion(player.root.quaternion);
    tmp.y = 0;
    if (tmp.lengthSq() < 1e-4) tmp.set(0, 0, 1);
    tmp.normalize();
    const forwardX = tmp.x;
    const forwardZ = tmp.z;
    const rightX = forwardZ;
    const rightZ = -forwardX;

    for (let i = 1; i < squad.length; i++) {
      const ally = squad[i]!;
      if (!ally.alive) continue;
      const slot = formSlots[i - 1] ?? formSlots[formSlots.length - 1]!;
      const tx = player.root.position.x + rightX * slot.right + forwardX * slot.forward;
      const tz = player.root.position.z + rightZ * slot.right + forwardZ * slot.forward;
      const dx = tx - ally.root.position.x;
      const dz = tz - ally.root.position.z;
      const dist = Math.hypot(dx, dz);
      let allyMoving = false;
      // Dead-zone so allies don't jitter/slide when already in formation
      if (dist > 0.55) {
        const step = Math.min(dist, ally.moveSpeed * (dist > 4 ? 1.15 : 0.95) * heroBuffs(ally).move * dt);
        applyMoveWithCollision(ally.root, (dx / dist) * step, (dz / dist) * step, PLAYER_RADIUS);
        allyMoving = dist > 0.7;
        // Face travel direction while catching up
        if (dist > 1.2) faceToward(ally.root, tx, tz);
      }
      sanitizeObject3D(ally.root);
      animateOperative(ally, t + i, dt, allyMoving, true);
      tryAutoFire(ally, null);
    }

    nowSec = performance.now() / 1000;
    zombieCtx.nowSec = nowSec;
    for (const op of squad) tickOperativeSlow(op, nowSec);

    const statusKills: ZombieVisual[] = [];
    for (const z of zombies) {
      if (z.hp <= 0) continue;
      z.attackCooldown = Math.max(0, z.attackCooldown - dt);
      z.skillCooldown = Math.max(0, z.skillCooldown - dt);
      updateZombieHurtFlash(z, dt);
      const statusTick = tickZombieStatuses(z, dt);
      if (statusTick.damage > 0) {
        z.hp -= statusTick.damage;
        z.healthBar.setRatio(z.hp / Math.max(1, z.maxHp));
        z.healthBar.setVisible(true);
        if (statusTick.tint != null) {
          fx.spawnDamageNumber(z.root.position, statusTick.damage, { style: 'enemy' });
          fx.spawnHitRing(z.root.position, statusTick.tint, 0.16);
        }
        if (z.hp <= 0) {
          statusKills.push(z);
          continue;
        }
      }
      z.healthBar.setRatio(z.hp / Math.max(1, z.maxHp));

      let targetOp: OperativeVisual | null = null;
      let bestD = Infinity;
      for (const op of squad) {
        if (!op.alive) continue;
        const d = z.root.position.distanceTo(op.root.position);
        if (d < bestD) {
          bestD = d;
          targetOp = op;
        }
      }
      if (!targetOp) {
        const idleLod = zombieVrmLod(z, player.root.position.x, player.root.position.z, lodFrame);
        if (idleLod === 'full' || idleLod === 'reduced') requestZombieVrm(z);
        animateZombieWalk(z, t, dt, false, idleLod);
        continue;
      }

      tmp.copy(targetOp.root.position).sub(z.root.position);
      tmp.y = 0;
      let dist = tmp.length();
      if (dist < 0.85) {
        if (dist < 1e-4) {
          tmp.set(Math.cos(z.root.rotation.y), 0, Math.sin(z.root.rotation.y));
          dist = 1;
        }
        const push = ((0.85 - dist) / dist) * 0.55;
        applyMoveWithCollision(z.root, -tmp.x * push, -tmp.z * push, ZOMBIE_RADIUS);
        tmp.copy(targetOp.root.position).sub(z.root.position);
        tmp.y = 0;
        dist = tmp.length();
      }

      const engageRange = engageRangeFor(z.kind);
      const spawning = ((z.root.userData.spawnUntil as number | undefined) ?? 0) > simTime;
      const zPan = Math.max(-1, Math.min(1, (z.root.position.x - player.root.position.x) / 24));
      const startAttack = (skill: ReturnType<typeof chooseZombieSkill>) => {
        faceToward(z.root, targetOp!.root.position.x, targetOp!.root.position.z);
        const seg = beginZombieAttack(z, skill, targetOp!.root.position);
        queueZombieAnim(z, { kind: 'act', seg, dur: z.attackDuration, priority: 2 });
        telegraphZombieSkill(z, fx);
        audio.playZombie(z.kind, 'attack', zPan);
      };
      let chasing = false;
      if (spawning) {
        // climbing out of the ground
      } else if (z.attackAnim <= 0) {
        const ranged = rangedSkillFor(z, dist);
        if (ranged) startAttack(ranged);
        else if (dist > engageRange) {
          chasing = true;
          tmp.normalize();
          const sp = z.speed * frenzyMul(z, nowSec);
          applyMoveWithCollision(z.root, tmp.x * sp * dt, tmp.z * sp * dt, ZOMBIE_RADIUS);
          faceToward(z.root, targetOp.root.position.x, targetOp.root.position.z);
          if (Math.random() < dt * moanChanceFor(z.kind)) audio.playZombie(z.kind, 'idle', zPan);
        } else if (z.attackCooldown <= 0) startAttack(chooseZombieSkill(z));
      }
      if (z.attackAnim > 0) {
        if (z.activeSkill !== 'charge' && z.activeSkill !== 'leap' && z.attackAnim < 0.4) {
          faceToward(z.root, targetOp.root.position.x, targetOp.root.position.z);
        }
        tickZombieAttack(z, targetOp, dt, zombieCtx);
        if (z.hp <= 0) {
          statusKills.push(z);
          continue;
        }
      }

      sanitizeObject3D(z.root);
      const lod = zombieVrmLod(z, player.root.position.x, player.root.position.z, lodFrame);
      if (lod === 'full' || lod === 'reduced') requestZombieVrm(z);
      animateZombieWalk(z, t, dt, chasing, lod);
    }
    for (const z of statusKills) killZombie(z);

    rebuildZombieHash();

    tickAcidSpits(acidSpits, dt, squad, hazards, (op, amount, from) => void damageOperative(op, amount, from), fx);
    hazards.tick(dt, squad, (op, amount) => void damageOperative(op, amount, op.root.position, true), nowSec);
    tickZombieCorpses(corpses, dt);

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]!;
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);

      let hitZ: ZombieVisual | null = null;
      zombieHash.query(b.mesh.position.x, b.mesh.position.z, ZOMBIE_HIT_QUERY_R, zombieQuery);
      for (let qi = 0; qi < zombieQuery.length; qi++) {
        const z = zombieQuery[qi]!;
        if (z.hp <= 0) continue;
        const hitRadius = hitRadiusFor(z.kind);
        const dx = z.root.position.x - b.mesh.position.x;
        const dy = 1.1 - b.mesh.position.y;
        const dz = z.root.position.z - b.mesh.position.z;
        if (dx * dx + dy * dy + dz * dz < hitRadius * hitRadius) {
          hitZ = z;
          break;
        }
      }

      const blocked =
        b.pierce <= 0 &&
        nearbyBoxes(b.mesh.position.x, b.mesh.position.z, 0.5, colliders).some((box) => {
          const p = b.mesh.position;
          return p.x >= box.minX && p.x <= box.maxX && p.z >= box.minZ && p.z <= box.maxZ && p.y < 3.5;
        });

      if (hitZ || blocked || b.life <= 0 || b.mesh.position.y < 0) {
        if (hitZ) {
          hitPos.copy(b.mesh.position);
          tmp.copy(b.vel).normalize();
          damageZombie(hitZ, b.damage, hitPos, tmp, {
            weaponId: b.owner.weapon.id,
            fromPlayer: b.owner.isPlayer,
          });
          bulletImpact(b, hitPos, hitZ, tmp);
          if (b.pierce > 0) {
            b.pierce -= 1;
            continue;
          }
        } else if (b.fx?.impact === 'explosive') {
          hitPos.copy(b.mesh.position).setY(0.3);
          bulletImpact(b, hitPos, null, tmp.copy(b.vel).normalize());
        }
        scene.remove(b.mesh);
        bullets.splice(i, 1);
      }
    }

    abilityRuntime.update(dt, zombies, damageZombie);
    heroRt?.update(dt, simTime);
    runSkills.update(dt, moving);
    for (let i = beams.length - 1; i >= 0; i--) {
      const bm = beams[i]!;
      bm.life -= dt;
      if (bm.life <= 0) {
        scene.remove(bm.line);
        bm.line.geometry.dispose();
        beams.splice(i, 1);
      }
    }

    for (let i = gems.length - 1; i >= 0; i--) {
      const gem = gems[i]!;
      gem.life -= dt;
      gem.mesh.rotation.y += dt * 0.6;
      if (gem.life < 4) gem.mesh.visible = Math.sin(gem.life * 12) > -0.3;
      if (player.alive) {
        const d = gem.mesh.position.distanceTo(player.root.position);
        if (d < 5 && d > 0.05) {
          tmp.copy(player.root.position).sub(gem.mesh.position);
          if (tmp.lengthSq() > 1e-6) {
            tmp.normalize().multiplyScalar(dt * (8 + (5 - d) * 3));
            gem.mesh.position.add(tmp);
          }
        }
        if (d < 1.4) {
          gainXp(gem.xp * (1 + Math.min(combo, 10) * 0.05));
          audio.playGem();
          scene.remove(gem.mesh);
          if (!sampleHintShown) {
            sampleHintShown = true;
            notePickup('Zombi Numunesi', 'Tecrübe verir · bar dolunca seviye atlar, yeni yetenek seçersin');
          }
          gems.splice(i, 1);
          continue;
        }
      }
      if (gem.life <= 0) {
        scene.remove(gem.mesh);
        gems.splice(i, 1);
      }
    }

    for (let i = bloodDecals.length - 1; i >= 0; i--) {
      const d = bloodDecals[i]!;
      d.life -= dt;
      if (d.life < 2) (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life / 2) * 0.85;
      if (d.life <= 0) {
        scene.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        d.mesh.geometry.dispose();
        bloodDecals.splice(i, 1);
      }
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]!;
      f.life -= dt;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.07);
      f.mesh.scale.setScalar(((f.mesh.userData.base as number) ?? 1) * (1 + (0.07 - f.life) * 10));
      if (f.life <= 0) {
        scene.remove(f.mesh);
        (f.mesh.material as THREE.Material).dispose();
        flashes.splice(i, 1);
      }
    }

    fx.update(dt);
    skillFx.update(dt);
    billboardHealthBars(healthBars, camera);

    map.update(dt, t, player.root.position);
    map.core.rotation.y += dt * 0.65;
    map.ring.rotation.z += dt * 0.45;
    map.ring2.rotation.z -= dt * 0.3;
    map.ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.04);
    map.alarm.intensity = 1.6 + Math.sin(t * 3.5) * 1.1;
    map.coreGlow.intensity = 2.8 + Math.sin(t * 2) * 0.6;

    missionHud = tickMission({
      runtime: missionRuntime,
      wave,
      dt,
      simTime,
      playerX: player.root.position.x,
      playerZ: player.root.position.z,
      squadSize: squad.length,
      justKilled: pendingMissionKill,
      justRescued: pendingMissionRescue,
    });
    pendingMissionKill = false;
    pendingMissionRescue = false;

    sun.position.set(player.root.position.x + sunOff.x, sunOff.y, player.root.position.z + sunOff.z);
    sun.target.position.copy(player.root.position);
    sun.target.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;

    // Zoom: mouse wheel / +/- 
    camZoom = THREE.MathUtils.clamp(camZoom + input.consumeZoomDelta(), CAM_ZOOM_MIN, CAM_ZOOM_MAX);
    const camH = 24 * camZoom;
    const camBack = 17 * camZoom;

    shake = Math.max(0, shake - dt * 1.8);
    const sx = shake > 0.01 ? (Math.random() - 0.5) * shake * 1.2 : 0;
    const sz = shake > 0.01 ? (Math.random() - 0.5) * shake * 1.2 : 0;
    camTarget.set(player.root.position.x + sx * 0.3, 0.4, player.root.position.z + sz * 0.3);
    camPos.set(player.root.position.x + 0.2 + sx, camH, player.root.position.z + camBack + sz);
    camera.position.lerp(camPos, 1 - Math.exp(-3.4 * dt));
    camera.lookAt(camTarget);

    // Soft cap ambient spawns — avoid hitch spikes
    const targetZ = Math.round((16 + Math.min(20, wave * 2)) * diff.count * Math.min(1.8, modeRt.spawnMul));
    if (zombies.length < targetZ && Math.random() < dt * 0.9) {
      const r = Math.random();
      spawnZombie(
        r > 0.94
          ? 'tank'
          : r > 0.86
            ? 'screamer'
            : r > 0.76
              ? 'runner'
              : r > 0.68
                ? 'acid'
                : 'grunt',
      );
    }

    renderer.render(scene, camera);
  };

  const onClick = () => {
    renderer.domElement.focus();
    audio.resume();
  };
  container.addEventListener('pointerdown', onClick);

  return {
    scene,
    camera,
    renderer,
    setSize,
    animate,
    getWeaponName: () => player.weapon.name,
    getHudState,
    getRunSummary: (): RunSummary => ({
      kills,
      wave,
      level: progress.level,
      runTimeSec: simTime,
    }),
    selectUpgrade: doSelectUpgrade,
    rerollUpgrades: doRerollUpgrades,
    lockdownUpgrade: doLockdownUpgrade,
    banishUpgrade: doBanishUpgrade,
    skipUpgrade: doSkipUpgrade,
    activateAbility,
    unlockSkillNode: (id: SkillId) => {
      if (unlockSkill(skills, id)) {
        audio.playLevelUp();
        refreshPlayerMaxHp();
      }
    },
    useItem: useInventoryItem,
    toggleSkillTree: () => {
      showSkillTree = !showSkillTree;
    },
    toggleInventory: () => {
      showInventory = !showInventory;
    },
    setPaused,
    togglePause,
    getAudioBusLevels: () => audio.getBusLevels(),
    setAudioBusLevel: (bus, value) => {
      audio.setBusLevel(bus, value);
    },
    dispose: () => {
      for (const z of zombies) disposeZombieVrm(z);
      zombies.length = 0;
      input.dispose();
      audio.dispose();
      fx.dispose();
      abilityRuntime.dispose();
      heroRt?.dispose();
      runSkills.dispose();
      modeRt.dispose();
      map.dispose();
      skillFx.dispose();
      hazards.dispose();
      for (const c of corpses) c.avatar.dispose();
      container.removeEventListener('pointerdown', onClick);
      disposeMaterialTextures();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
