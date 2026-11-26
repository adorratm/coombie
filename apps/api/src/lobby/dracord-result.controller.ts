import { Body, Controller, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { dracordEnabled } from './dracord-auth';

interface Request {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

const last = new Map<string, number>();

/**
 * Oyun istemcisi → Dracord maç sonucu. Oyun anahtarı yalnız burada (sunucu) kullanılır;
 * kimlik doğrulaması Dracord'da launch token ile yapılır.
 */
@Controller('dracord')
export class DracordResultController {
  @Post('result')
  async result(@Body() body: Record<string, unknown>, @Req() req: Request) {
    if (!dracordEnabled()) throw new HttpException({ ok: false, error: 'DRACORD_DISABLED' }, HttpStatus.SERVICE_UNAVAILABLE);
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token || token.length > 4096) throw new HttpException({ ok: false, error: 'BAD_TOKEN' }, HttpStatus.BAD_REQUEST);
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'x';
    const now = Date.now();
    if (now - (last.get(ip) ?? 0) < 5000) throw new HttpException({ ok: false, error: 'TOO_FAST' }, HttpStatus.TOO_MANY_REQUESTS);
    last.set(ip, now);
    if (last.size > 5000) last.clear();
    const base = (process.env.DRACORD_API_URL ?? 'https://api.dracord.com.tr').replace(/\/$/, '');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${base}/v1/games/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Game ${process.env.DRACORD_GAME_SECRET}` },
        body: JSON.stringify({
          token,
          runId: body.runId,
          won: body.won === true,
          stats: typeof body.stats === 'object' && body.stats ? body.stats : {},
          share: body.share === true,
          summary: typeof body.summary === 'string' ? body.summary.slice(0, 300) : '',
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new HttpException({ ok: false, error: `DRACORD_${res.status}` }, res.status === 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_GATEWAY);
      return { ok: true, data: await res.json(), error: null };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException({ ok: false, error: 'DRACORD_UNREACHABLE' }, HttpStatus.BAD_GATEWAY);
    } finally {
      clearTimeout(t);
    }
  }
}
