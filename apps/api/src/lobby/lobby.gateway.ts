import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  ClientEvents,
  ServerEvents,
  type LobbyCreatePayload,
  type LobbyDracordPayload,
  type LobbyJoinPayload,
  type LobbySelectOperativePayload,
} from '@protocol-z/shared';
import { LobbyService } from './lobby.service';
import { v4 as uuid } from 'uuid';
import { dracordRoomCode, verifyDracordToken } from './dracord-auth';

@WebSocketGateway({
  namespace: '/lobby',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' },
})
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly lobby: LobbyService) {}

  handleConnection(client: Socket): void {
    if (!client.data.playerId) {
      client.data.playerId = uuid();
    }
  }

  /** Dracord odaları sabit koda sahip — kopan oyuncuyu çıkar ki oda temizlensin */
  handleDisconnect(client: Socket): void {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode || !client.data.dracord) return;
    const playerId = client.data.playerId as string;
    // Aynı kullanıcı başka sekmeden bağlıysa çıkarma
    void this.server
      .in(roomCode)
      .fetchSockets()
      .then((socks) => {
        if (socks.some((s) => s.id !== client.id && s.data?.playerId === playerId)) return;
        const state = this.lobby.leave(roomCode, playerId);
        if (state) this.server.to(roomCode).emit(ServerEvents.LobbyState, state);
      })
      .catch(() => undefined);
  }

  @SubscribeMessage(ClientEvents.LobbyCreate)
  onCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LobbyCreatePayload,
  ) {
    const state = this.lobby.createRoom(
      client.data.playerId,
      body.displayName,
      body.mode,
      body.fillBots ?? true,
    );
    client.join(state.roomCode);
    client.data.roomCode = state.roomCode;
    this.server.to(state.roomCode).emit(ServerEvents.LobbyState, state);
    return state;
  }

  /**
   * Dracord içinden giriş: token sunucuda doğrulanır, oyuncu kimliği Dracord kullanıcısı olur,
   * aynı ses kanalı oturumundaki herkes aynı odaya girer.
   */
  @SubscribeMessage(ClientEvents.LobbyDracord)
  async onDracord(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LobbyDracordPayload,
  ) {
    try {
      const claims = await verifyDracordToken(String(body?.token ?? ''));
      const prevRoom = client.data.roomCode as string | undefined;
      const prevId = client.data.playerId as string;
      const playerId = `dc:${claims.userId}`;
      if (prevRoom && prevId !== playerId) {
        const left = this.lobby.leave(prevRoom, prevId);
        client.leave(prevRoom);
        if (left) this.server.to(prevRoom).emit(ServerEvents.LobbyState, left);
      }
      client.data.playerId = playerId;
      client.data.dracord = { userId: claims.userId, sessionId: claims.sessionId, testMode: claims.testMode };
      const roomCode = dracordRoomCode(claims.sessionId);
      const state = this.lobby.joinOrCreateFixedRoom(
        roomCode,
        playerId,
        (claims.displayName || claims.username).slice(0, 32),
      );
      client.join(state.roomCode);
      client.data.roomCode = state.roomCode;
      this.server.to(state.roomCode).emit(ServerEvents.LobbyState, state);
      return { ...state, you: playerId };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'DRACORD_FAILED';
      client.emit(ServerEvents.LobbyError, { message });
      return { error: message };
    }
  }

  @SubscribeMessage(ClientEvents.LobbyJoin)
  onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LobbyJoinPayload,
  ) {
    try {
      const state = this.lobby.joinRoom(
        body.roomCode,
        client.data.playerId,
        body.displayName,
      );
      client.join(state.roomCode);
      client.data.roomCode = state.roomCode;
      this.server.to(state.roomCode).emit(ServerEvents.LobbyState, state);
      return state;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'JOIN_FAILED';
      client.emit(ServerEvents.LobbyError, { message });
      return { error: message };
    }
  }

  @SubscribeMessage(ClientEvents.LobbySelectOperative)
  onSelect(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: LobbySelectOperativePayload,
  ) {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode) return { error: 'NO_ROOM' };
    try {
      const state = this.lobby.selectOperative(
        roomCode,
        client.data.playerId,
        body.operativeId,
      );
      this.server.to(roomCode).emit(ServerEvents.LobbyState, state);
      return state;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'SELECT_FAILED';
      client.emit(ServerEvents.LobbyError, { message });
      return { error: message };
    }
  }

  @SubscribeMessage(ClientEvents.LobbySetReady)
  onReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { isReady: boolean },
  ) {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode) return { error: 'NO_ROOM' };
    const state = this.lobby.setReady(
      roomCode,
      client.data.playerId,
      body.isReady,
    );
    this.server.to(roomCode).emit(ServerEvents.LobbyState, state);
    return state;
  }

  @SubscribeMessage(ClientEvents.LobbyChat)
  onChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { message: string },
  ) {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode) return;
    this.server.to(roomCode).emit(ServerEvents.LobbyChat, {
      playerId: client.data.playerId,
      message: body.message,
      ts: Date.now(),
    });
  }

  @SubscribeMessage(ClientEvents.LobbyStart)
  onStart(@ConnectedSocket() client: Socket) {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode) return { error: 'NO_ROOM' };
    if (!this.lobby.canStart(roomCode)) {
      client.emit(ServerEvents.LobbyError, { message: 'NOT_READY' });
      return { error: 'NOT_READY' };
    }
    const state = this.lobby.getRoom(roomCode);
    this.server.to(roomCode).emit(ServerEvents.MatchStart, state);
    return { ok: true };
  }
}
