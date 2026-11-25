import { Body, Controller, Get, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
/** the bits of the express request this needs (no @types/express dependency) */
interface Request {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}
import { LeaderboardService } from './leaderboard.service';

const clean = (v: unknown, max: number): string =>
  String(v ?? '')
    .replace(/[\u0000-\u001f<>"'`\\]/g, '')
    .trim()
    .slice(0, max);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly board: LeaderboardService) {}

  @Get('daily')
  daily() {
    return { ok: true, data: this.board.daily(), error: null };
  }

  @Get('weekly')
  weekly() {
    return { ok: true, data: this.board.weekly(), error: null };
  }

  @Post('daily')
  submit(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const device = clean(body?.device, 40);
    const name = clean(body?.name, 20) || 'Anonim';
    const hero = clean(body?.hero, 16);
    const day = clean(body?.day, 10);
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(device) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpException({ ok: false, data: null, error: 'BAD_INPUT' }, HttpStatus.BAD_REQUEST);
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'x';
    if (!this.board.allow(`${ip}|${device}`)) throw new HttpException({ ok: false, data: null, error: 'TOO_FAST' }, HttpStatus.TOO_MANY_REQUESTS);
    const res = this.board.submit({ device, name, hero, day, kills: num(body?.kills), timeSec: num(body?.timeSec), level: num(body?.level), won: body?.won === true });
    if (!res.ok) throw new HttpException({ ok: false, data: null, error: res.error }, HttpStatus.UNPROCESSABLE_ENTITY);
    return { ok: true, data: { score: res.score, rank: res.rank, best: res.best }, error: null };
  }
}
