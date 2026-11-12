import { NestFactory } from '@nestjs/core';
import { corsOrigins } from './cors';

async function bootstrap() {
  // DB_DISABLED=1 → yalnız lobi + maç aktarıcısı (Postgres gerekmez)
  const dbOff = process.env.DB_DISABLED === '1';
  const root = dbOff ? (await import('./realtime.module')).RealtimeOnlyModule : (await import('./app.module')).AppModule;
  const app = await NestFactory.create(root);
  app.enableCors({ origin: corsOrigins(), credentials: true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[PROTOCOL-Z API] listening on :${port}${dbOff ? ' (realtime only)' : ''}`);
}
void bootstrap();
