# PROTOCOL-Z — Monorepo Mimari

## Workspace’ler

| Paket | Rol |
|-------|-----|
| `apps/api` | NestJS + Socket.IO + TypeORM + ioredis |
| `apps/web` | Next.js + React (lobi, menü, HUD overlay) |
| `apps/game-client` | Three.js WebGL savaş alanı |
| `apps/desktop` | Electron shell → web + game-client |
| `packages/shared` | Tipler, event’ler, karakter/zombi/power-up data |
| `packages/game-engine` | Saf simülasyon (sunucu + istemci ortak kurallar) |

## Neden Three.js (Unity/Unreal değil)?

- Tek kod tabanı: web / mobil tarayıcı / Electron
- Stitch prototype zaten Three.js
- Nest + Socket pipeline ile kolay otoriter sync
- Unity/Unreal istenirse `game-client` adaptör katmanı değiştirilebilir; shared + api aynı kalır

## Runtime (Volta)

- Node `26.13.0` (LTS Lithium)
- Yarn `4.18.1`
- `.yarnrc.yml` → `nodeLinker: node_modules`

## Cloud deploy (hedef)

- API + Socket: container (Cloud Run / ECS / K8s)
- Postgres + PgBouncer managed
- Redis managed
- Web: CDN / Vercel veya aynı cluster
- Desktop: Electron build artifact (auto-update)
