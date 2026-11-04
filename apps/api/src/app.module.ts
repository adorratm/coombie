import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { RedisModule } from './redis/redis.module';
import { LobbyGateway } from './lobby/lobby.gateway';
import { LobbyService } from './lobby/lobby.service';
import { MatchGateway } from './match/match.gateway';
import { MatchService } from './match/match.service';
import { UserEntity } from './entities/user.entity';
import { MatchHistoryEntity } from './entities/match-history.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? '127.0.0.1',
      port: Number(process.env.DATABASE_PORT ?? 6432),
      username: process.env.DATABASE_USER ?? 'protocolz',
      password: process.env.DATABASE_PASSWORD ?? 'protocolz',
      database: process.env.DATABASE_NAME ?? 'protocolz',
      entities: [UserEntity, MatchHistoryEntity],
      synchronize:
        process.env.TYPEORM_SYNC === 'true' ||
        process.env.NODE_ENV !== 'production',
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    TypeOrmModule.forFeature([UserEntity, MatchHistoryEntity]),
    RedisModule,
  ],
  controllers: [HealthController],
  providers: [LobbyService, LobbyGateway, MatchService, MatchGateway],
})
export class AppModule {}
