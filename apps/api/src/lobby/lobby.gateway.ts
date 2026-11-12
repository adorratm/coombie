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
  type MatchMission,
} from '@protocol-z/shared';
import { LobbyService } from './lobby.service';
import { corsOrigins } from '../cors';
import { MatchService } from '../match/match.service';
import { v4 as uuid } from 'uuid';
import { dracordRoomCode, verifyDracordToken } from './dracord-auth';

/** Oda sahibinin seçtiği görev (harita / mod / zorluk) — herkes aynı haritayı yüklesin diye iletilir. */
function sanitizeMission(raw: unknown): MatchMission | undefined {
  const m = raw as Record<string, unknown> | null;
  const id = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_-]{1,24}$/i.test(v) ? v : null);
  if (!m || typeof m !== 'object') return undefined;
  const map = id(m.map);
  const mode = id(m.mode);
  const difficulty = id(m.difficulty);
  if (!map || !mode || !difficulty) return undefined;
  const minutes = typeof m.minutes === 'number' && [20, 30, 40, 60].includes(m.minutes) ? m.minutes : undefined;
  return { map, mode, difficulty, minutes };
}

@WebSocketGateway({
  namespace: '/lobby',
  cors: { origin: corsOrigins() },
})
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly lobby: LobbyService,
    private readonly matches: MatchService,
  ) {}

  handleConnection(client: Socket): void {
    if (!client.data.playerId) {
      client.data.playerId = uuid();
    }
  }

  /** Dracord odaları sabit koda sahip — kopan oyuncuyu çıkar ki oda temizlensin */
  handleDisconnect(client: Socket): void {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode) return;
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
    return { ...state, you: client.data.playerId as string };
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
      return { ...state, you: client.data.playerId as string };
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
  async onStart(@ConnectedSocket() client: Socket, @MessageBody() body?: { mission?: unknown }) {
    const roomCode = client.data.roomCode as string | undefined;
    if (!roomCode) return { error: 'NO_ROOM' };
    const state = this.lobby.getRoom(roomCode);
    // yalnız oda sahibi başlatır (dünyayı onun istemcisi yürütecek)
    if (state.hostPlayerId !== client.data.playerId) {
      client.emit(ServerEvents.LobbyError, { message: 'NOT_HOST' });
      return { error: 'NOT_HOST' };
    }
    if (!this.lobby.canStart(roomCode)) {
      client.emit(ServerEvents.LobbyError, { message: 'NOT_READY' });
      return { error: 'NOT_READY' };
    }
    // her oyuncuya kendi maç bileti — /match soketi bununla kimlik doğrular
    const mission = sanitizeMission(body?.mission);
    const tickets = this.matches.ticketsFor(state);
    const socks = await this.server.in(roomCode).fetchSockets();
    for (const s of socks) {
      const ticket = tickets.get(s.data?.playerId as string);
      if (ticket) s.emit(ServerEvents.MatchStart, { ...state, ticket, mission });
    }
    return { ok: true };
  }
}
