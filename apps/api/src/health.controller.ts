import { Controller, Get } from '@nestjs/common';
import { GAME_NAME } from '@protocol-z/shared';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      ok: true,
      service: GAME_NAME,
      ts: new Date().toISOString(),
    };
  }
}
