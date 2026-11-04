# PROTOCOL-Z — Oyun Tasarımı

Co-op survival + progression odaklı zombie defense. Motor: **Three.js / WebGL** (web + mobil tarayıcı + Electron desktop). Sunucu otoriter; istemci render + input.

## Pillarlar

1. **Cross-platform** — tek WebGL istemci; Electron ile desktop; mobil web / PWA.
2. **1–4 oyuncu** — Solo (AI squad 4’e kadar) veya Co-op 2/3/4.
3. **8 operatör** — 4 erkek / 4 kadın, özgün animasyon setleri, unique special.
4. **Level → power-up** — 3 karttan 1 seç; solo’da squad boyutuna göre N seçim.
5. **Dalga baskısı** — her 5 level elit süperpower zombi; her 10 level Horde Attack.

## Modlar

| Mod | Oyuncu | Squad | EXP / Level | Power-up |
|-----|--------|-------|-------------|----------|
| Solo | 1 | 1–4 (bot doldurma opsiyonel) | Takım ortak pool veya karakter başına (config) | Level’de seçim sayısı = aktif karakter sayısı (1→1 … 4→4). Her seçimde 3 karttan 1, sonra hedef karakter. |
| Co-op | 2–4 | Her oyuncu 1 karakter | Her oyuncu kendi EXP’sini alır | Her oyuncu kendi 3’ten 1 seçimini yapar |

## Operatörler (8)

| ID | Kod | İsim | Cinsiyet | Rol | Aktif | Pasif | Silah |
|----|-----|------|----------|-----|-------|-------|-------|
| ironclad | IRONCLAD | Marcus Vance | M | Tank | Kinetic Nova | +40% zırh | Mag-Pulse Shotgun |
| valkyrie | VALKYRIE | Elena Rostova | F | Medic | Biotic Mist | +25% revive hızı | MK-4 Surgical SMG |
| breaker | BREAKER | Jax Thorne | M | Gunner | Concussive Blast | +30% şarjör | Titan Rotary Cannon |
| tox | TOX | Dr. Sarah Chen | F | Bio-Alchemist | Toxin Cloud | Asit DoT | Acid Launcher 9mm |
| ghost | GHOST | Vera Sokolov | F | Sniper | Thermal Pierce | +50% kafa kritik | AP-50 Coil Rifle |
| spark | SPARK | Maya Ramirez | F | Engineer | Sentry Pulse | Mühimmat dronu | Arc-Stun Carbine |
| warden | WARDEN | Aria Kane | F | Heavy | Overdrive | Sustained fire | Twin Mag Minigun |
| havoc | HAVOC | Nova Reyes | F | Demolisher | Cluster Barrage | Blast radius | Fragment Launcher |

Her karakterin idle / walk / run / aim / shoot / reload / ability / hit / death animasyon seti ayrıdır.

## Zombiler

### Temel tipler (client canon)
- **Grunt** — swarm fodder
- **Runner** — yüksek hız, sık lunge
- **Tank** — yavaş, yüksek HP, slam/roar
- **Acid** — uzaktan spit + puddle
- **Boss** — elite behemoth (slam/roar/lunge)
- **Screamer** — mid-range purple shriek: yavaşlatma + ateş hızı disrupt (öncelikli hedef)

### Dalga kuralları
- **Her 5 level** → elite_super (son spawn boss)
- **Her 10 level** → **Horde Attack** (runner ağırlıklı swarm; budget client’ta clamp)

## Power-up sistemi

Level atlandığında menü açılır; **3 rastgele kart** sunulur (common / rare / epic ağırlıklı).

- Co-op: oyuncu kendi kartını seçer (oyun kısa pause veya soft-pause).
- Solo: N aktif karakter → N seçim hakkı; her seçimde hedef karakter atanır.

Örnek kartlar: Damage+, Fire Rate+, Armor+, Ability CDR, Lifesteal, AOE radius, Crit, Ammo regen, Move speed, Team aura.

## Teknik mimari

```
[Electron | Browser | Mobile Web]
        │
   Next.js (UI shell: lobi, HUD, power-up, ansiklopedi)
        │ embeds
   @protocol-z/game-client (Three.js WebGL)
        │ Socket.IO
   @protocol-z/api (NestJS) ── Redis (ioredis, room state)
        │ TypeORM + PgBouncer
   PostgreSQL
```

- **Authoritative server**: hasar, spawn, EXP, power-up roll, win/lose
- **Client prediction**: hareket / nişan (reconcile ile)
- **Redis**: lobby room, match state snapshot, rate-limit
- **Postgres**: hesap, progress, unlock, match history

## UI (Stitch → ürün)

Tactical Bio-Hazard Combat Interface: phosphor `#00FF87`, urgent `#FF5722`, Chivo + Geist, sıfır radius HUD panelleri.
Ekranlar: Lobi & Karakter, Savaş HUD, Seviye / Power-up, Zombi Ansiklopedisi.
