# COOMBIE × Dracord

COOMBIE Dracord'da **ücretsiz** bir oyun odası olarak çalışır. Multiplayer kendi sunucumuzda (bu repodaki `apps/api`) kalır;
Dracord yalnız kimlik + ses kanalı oturumunu sağlar.

## Akış
1. Dracord ses kanalında biri COOMBIE'yi başlatır → oyun `apps/web` adresinde iframe / mobil WebView olarak açılır.
2. `apps/web/src/lib/useDracord.ts` → `DracordEmbed.ready()` ile kısa ömürlü launch token + kullanıcı + oturum gelir.
3. İstemci lobi soketine `lobby:dracord { token }` gönderir.
4. Sunucu (`apps/api/src/lobby/dracord-auth.ts`) token'ı `POST https://api.dracord.com.tr/v1/games/verify`
   (`Authorization: Game <DRACORD_GAME_SECRET>`) ile doğrular. Oyuncu kimliği `dc:<dracordUserId>` olur.
5. Aynı Dracord oturumundaki herkes `dracordRoomCode(sessionId)` → `DC-XXXXXX` odasına düşer (co-op).

Dracord dışında açıldığında hiçbir şey değişmez (status `standalone`).

## Kurulum
1. dracord.com.tr → Ayarlar → Geliştirici → **Oyunlarım** → yeni oyun:
   - Giriş URL'si (entryUrl): COOMBIE web adresi, https (ör. `https://coombie.example.com/lobby`)
   - Oyuncu: 1–8 · Yön: yatay · Platformlar: web, desktop, mobil
2. **Anahtar oluştur** → çıkan değeri yalnız sunucuya koy: `apps/api/.env` → `DRACORD_GAME_SECRET=...`
   (asla `NEXT_PUBLIC_*` değil).
3. Web: `NEXT_PUBLIC_API_URL` lobi sunucusunu göstermeli. Lobi sunucusunun `CORS_ORIGIN`'i web adresini içermeli.
4. Kendini/arkadaşlarını **testçi** ekle → onaysız oyunu test modunda dene.
5. Hazır olunca **İncelemeye gönder** → yayın kararı admin.dracord.com.tr'den.

## Durum
- [x] Kimlik + ortak oda + operatör seçimi + hazır ol (lobi sunucuda gerçek)
- [x] Co-op maç (1–8 kişi) — oda sahibinin istemcisi dünyayı yürütür, sunucu yalnız aktarır (`packages/shared/src/net.ts`).
  - Lobi: oyun içi **CO-OP** düğmesi → oda kur / kodla katıl → hazır → oda sahibi başlatır. Görevi (harita/mod/zorluk) oda sahibi seçer.
  - Her oyuncu kendi kahramanını yürütür (hareket, can, seviye, yükseltme); zombiler, hasar, dalgalar oda sahibinde.
  - Co-op'ta duraklatma yok; yükseltme seçerken oyuncu kısa süre hasar almaz. Oda sahibi çıkarsa maç biter.
  - Yerel deneme: `DB_DISABLED=1 yarn dev:api` (Postgres/Redis gerekmez) + `yarn dev:game`, iki sekme.
  - Misafirin yetenek / otomatik beceri hasarı oda sahibine bildirilir ve zombilere uygulanır.
  - Düşen oyuncuyu yanına gelen takım arkadaşı 3 sn'de kaldırır (dirilme hakkı harcanmaz); dirilme hakkı bitince
    oyuncu yerde bekler, tüm tim 6 sn boyunca yerdeyse görev başarısız olur (`coopRules.ts`, testli).
  - Yükseltme seçerken hasar almama en fazla 6 sn sürer.
  - [ ] Eksikler: yeteneklerin yavaşlatma / sersemletme gibi yan etkileri, zombi saldırı animasyonu, asit/kanca gibi
        özel efektler, tahliye/kurtarma modlarının nesneleri ve yerden toplananlar misafire yansımıyor;
        Dracord oturumundan otomatik odaya giriş oyun istemcisine bağlanmadı.
- [ ] `src/lib/dracord-embed` vendored kopya → `@dracord/embedded-sdk` npm'de yayınlanınca pakete geç
