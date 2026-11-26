import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { RedisModule } from './redis/redis.module';
import { LobbyGateway } from './lobby/lobby.gateway';
import { LobbyService } from './lobby/lobby.service';
import { MatchGateway } from './match/match.gateway';
import { MatchService } from './match/match.service';
import { LeaderboardController } from './leaderboard/leaderboard.controller';
import { DracordResultController } from './lobby/dracord-result.controller';
import { LeaderboardService } from './leaderboard/leaderboard.service';

/** Lobi + maç aktarıcısı. Veritabanı gerektirmez (Redis isteğe bağlı). */
@Module({
  imports: [RedisModule],
  controllers: [LeaderboardController, DracordResultController],
  providers: [LobbyService, LobbyGateway, MatchService, MatchGateway, LeaderboardService],
  exports: [LobbyService, MatchService],
})
export class RealtimeModule {}

/** `DB_DISABLED=1` ile açılış: yalnız co-op sunucusu (yerel deneme, tek kapsayıcılı kurulum). */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RealtimeModule],
  controllers: [HealthController],
})
export class RealtimeOnlyModule {}
