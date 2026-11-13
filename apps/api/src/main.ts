import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { corsOrigins } from './cors';

async function bootstrap() {
  // DB_DISABLED=1 → yalnız lobi + maç aktarıcısı (Postgres gerekmez)
  const dbOff = process.env.DB_DISABLED === '1';
  const root = dbOff ? (await import('./realtime.module')).RealtimeOnlyModule : (await import('./app.module')).AppModule;
  const app = await NestFactory.create<NestExpressApplication>(root);
  app.enableCors({ origin: corsOrigins(), credentials: true });

  // GAME_STATIC_DIR → oyunun derlenmiş istemcisini aynı adresten sun (tek kapsayıcılı kurulum:
  // oyun + lobi + maç aktarıcısı aynı köken, CORS gerekmez).
  const staticDir = process.env.GAME_STATIC_DIR ? resolve(process.env.GAME_STATIC_DIR) : null;
  if (staticDir && existsSync(resolve(staticDir, 'index.html'))) {
    app.useStaticAssets(staticDir, {
      setHeaders: (res, file) => {
        // adında özet olan paketler değişmez; index.html her zaman taze; modeller/sesler bir gün
        if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    });
  } else if (staticDir) {
    // eslint-disable-next-line no-console
    console.warn(`[PROTOCOL-Z API] GAME_STATIC_DIR has no index.html: ${staticDir}`);
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[PROTOCOL-Z API] listening on :${port}${dbOff ? ' (realtime only)' : ''}${staticDir ? ' + game client' : ''}`);
}
void bootstrap();
