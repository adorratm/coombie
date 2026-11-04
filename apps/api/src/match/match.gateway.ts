import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  ClientEvents,
  ServerEvents,
  type MatchPowerUpSelectPayload,
} from '@protocol-z/shared';
import { MatchService } from './match.service';
import { LobbyService } from '../lobby/lobby.service';

@WebSocketGateway({
  namespace: '/match',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' },
})
export class MatchGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly matches: MatchService,
    private readonly lobby: LobbyService,
  ) {}

  @SubscribeMessage('match:bootstrap')
  onBootstrap(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomCode: string },
  ) {
    const lobby = this.lobby.getRoom(body.roomCode);
    const match = this.matches.startFromLobby(lobby);
    client.join(body.roomCode);
    client.data.roomCode = body.roomCode;
    const snapshot = {
      tick: match.tick,
      level: match.level,
      players: [...match.players.values()].map((p) => p.state),
      entities: [],
    };
    client.emit(ServerEvents.MatchSnapshot, snapshot);
    return snapshot;
  }

  @SubscribeMessage(ClientEvents.MatchPowerUpSelect)
  onPowerUp(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: MatchPowerUpSelectPayload,
  ) {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode) return { error: 'NO_ROOM' };
    const ok = this.matches.selectPowerUp(
      roomCode,
      body.offerId,
      body.powerUpId,
      body.targetOperativeId,
    );
    return { ok };
  }

  /** Dev helper — simulate kill EXP / level-up */
  @SubscribeMessage('match:debug_exp')
  onDebugExp(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { amount?: number },
  ) {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode) return { error: 'NO_ROOM' };
    const result = this.matches.awardExp(
      roomCode,
      client.data.playerId ?? 'debug',
      body.amount ?? 500,
    );
    if (result.offers.length) {
      this.server.to(roomCode).emit(ServerEvents.MatchLevelUp, {
        level: result.wave.level,
        wave: result.wave,
        offers: result.offers,
      });
      this.server
        .to(roomCode)
        .emit(ServerEvents.MatchPowerUpOffer, result.offers);
    }
    this.server.to(roomCode).emit(ServerEvents.MatchWave, result.wave);
    return result;
  }
}
