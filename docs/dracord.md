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
- [ ] Maç ağ kodu: istemci arena şu an yerel simülasyon; `match` namespace'ine bağlanması oyun tarafı işlerle birlikte (boss, spawn, denge — ertelendi)
- [ ] `src/lib/dracord-embed` vendored kopya → `@dracord/embedded-sdk` npm'de yayınlanınca pakete geç
