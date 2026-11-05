# Animasyon hattı (Mixamo → VRM)

## Akış
1. Mixamo'dan FBX indir (**FBX Binary**, animasyonlar **Without Skin**, 30 fps).
2. Operatör klipleri: `apps/game-client/assets-src/mixamo/operator/`
   Zombi klipleri (gelecek): `apps/game-client/assets-src/mixamo/zombie/`
3. Dönüştür: `yarn workspace @protocol-z/game-client anims:build`
   → `public/anims/operator.anim.json` (VRM normalized humanoid uzayı, ~180 KB gzip)
4. Kontrol: `yarn workspace @protocol-z/game-client dev` → http://localhost:5173/anim-lab.html
   (`?grid=1` 8 operatör, `?mode=runL`, `?steps=40` sabit kare, `?view=front|top|side`)

## Dosya adı → klip
`scripts/build-mixamo-anims.mjs` içindeki `CLIP_IDS` tablosu. Yeni dosya adı ekleyince oraya ekle.
Root motion otomatik silinir (in-place); klibin doğal hızı `speed` olarak saklanır, oyun ayak kaymasını
azaltmak için oynatma hızını hareket hızına göre ölçekler.

## Çalışma zamanı
- `src/animLibrary.ts` → `retargetLibrary()` (model URL başına cache) + `OperativeAnimator`
- Alt gövde (kalça + bacak): 8 yönlü lokomosyon (yürü/koş × ileri/geri/sol/sağ), tek fazlı sync group.
- Üst gövde override katmanları (öncelik sırası): reload > ability > hit > fire > aim.
- Oyun olayları: `bumpOperativeAnim(op, 'shot' | 'hit' | 'ability')` (arena.ts).
- Klip kütüphanesi yüklenemezse eski procedural poz otomatik devreye girer.

## Not
`scripts/vendor/FBXLoader.patched.js`: three r187 FBXLoader + bazı Mixamo dosyalarının footer'ında
takılan "Unknown property type" hatası için tek satırlık yama (top-level null record = içerik sonu).

## Karakter modelleri (Rocketbox, MIT)
- Kaynak: https://github.com/microsoft/Microsoft-Rocketbox — `scripts/rocketbox/roster.json` hangi avatarın hangi operatör/zombi olduğunu tutar.
- Yeniden üret: Rocketbox'ı klonla, sonra `node scripts/rocketbox/build-all.mjs <Microsoft-Rocketbox klasörü>` → `public/avatars/rb/*.glb`
  (Python 3 + Pillow gerekir; doku atlası `scripts/rocketbox/atlas.py`).
- Operatör: ~9k üçgen, 2048 atlas · Zombi: ~4.5k üçgen, 1024 atlas · her karakter tek malzeme = tek draw call.
- Çalışma zamanı: `src/humanoidRig.ts` (VRM benzeri normalized rig; Mixamo klipleri + prosedürel zombi pozları Biped kemiklerine),
  `src/zombieLook.ts` (tür başına çürüme/kan/safra shader'ı, göz parıltısı, vücut oranı, model havuzu).
- Zombi şablonu URL başına bir kez yüklenir; her zombi `SkeletonUtils.clone` kopyasıdır (geometri/doku paylaşılır).
- Eski VRM'ler (`public/avatars/*.vrm`) artık yüklenmiyor; silinebilir (~200 MB).
- İnceleme: `/anim-lab.html?zombies=1` (6 zombi türü), `?zombies=1&only=boss,acid`, `?grid=1` (8 operatör).
