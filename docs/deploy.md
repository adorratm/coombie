# Yayın: coombie.dracord.com.tr

Tek kapsayıcı yeter: oyun istemcisi, lobi ve co-op maç aktarıcısı aynı süreçte ve aynı adreste çalışır
(`infra/Dockerfile.coombie`). Veritabanı ve Redis gerekmez.

> Not: imaj bu ortamda derlenemedi (Docker yok). Aynı adımlar Docker'sız doğrulandı: derlenmiş istemci API'den
> tek porttan sunuldu ve iki tarayıcıyla co-op maç oynandı. İlk `docker build`'de bir sorun çıkarsa adım adım bakılır.

## 1. DNS (Cloudflare)
`coombie` için **A** kaydı → sunucunun IP'si, proxy **açık** (turuncu bulut). WebSocket Cloudflare'da varsayılan açıktır.

## 2. Sunucuda
```bash
git clone https://github.com/adorratm/coombie && cd coombie
echo "DRACORD_GAME_SECRET=<portaldaki anahtar>" > infra/.env      # isteğe bağlı
docker compose -f infra/docker-compose.coombie.yml --env-file infra/.env up -d --build
curl -s localhost:3101/health
```

## 3. nginx (TLS + WebSocket)
```nginx
server {
  server_name coombie.dracord.com.tr;
  listen 443 ssl http2;
  # ssl_certificate ... (Cloudflare Origin sertifikası ya da certbot)
  client_max_body_size 1m;
  location / {
    proxy_pass http://127.0.0.1:3101;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}
```

## 4. Dracord'a ekleme
dracord.com.tr → Ayarlar → Geliştirici → Oyunlarım → giriş URL'si `https://coombie.dracord.com.tr/`, oyuncu 1–8.
Anahtarı 2. adımdaki `.env`'e koy, kapsayıcıyı yeniden başlat. Ayrıntı: `docs/dracord.md`.

## Sınırlar
- Tek süreç: odalar bellekte. Yeniden başlatınca açık lobiler ve maçlar düşer.
- Birden fazla kopya çalıştırma (yük dengeleme) şu an desteklenmiyor — socket.io için ortak bir adaptör gerekir.
