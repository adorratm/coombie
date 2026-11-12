import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { NetEvents, type NetRoster } from '@protocol-z/shared';
import { MatchService } from './match.service';

const sizeOf = (body: unknown): number => {
  try {
    return JSON.stringify(body)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/**
 * Co-op maç aktarıcısı. Sunucu simülasyon yapmaz: oda sahibinin istemcisi dünyayı yürütür,
 * sunucu biletle kimlik doğrular ve mesajları boyut / hız sınırıyla iletir.
 * Kurallar `MatchRelay` (shared, birim testli) içinde.
 */
@WebSocketGateway({
  namespace: '/match',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' },
})
export class MatchGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Namespace;

  constructor(private readonly matches: MatchService) {}

  @SubscribeMessage(NetEvents.Join)
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { ticket?: string }) {
    const res = this.matches.relay.join(String(body?.ticket ?? ''), client.id, Date.now());
    if (!res.ok) return { error: res.error };
    void client.join(res.roomCode);
    // herkese güncel kadro; "you" alanı alıcıya göre
    for (const [id, sock] of this.server.sockets) {
      if (!sock.rooms.has(res.roomCode) && id !== client.id) continue;
      const me = id === client.id ? res.playerId : (sock.data.playerId as string | undefined);
      if (!me) continue;
      const roster: NetRoster = { ...res.roster, you: me };
      sock.emit(NetEvents.Roster, roster);
    }
    client.data.playerId = res.playerId;
    return { ok: true, playerId: res.playerId, isHost: res.isHost, roster: { ...res.roster, you: res.playerId } };
  }

  /** misafir → oda sahibi: kendi kahramanının durumu */
  @SubscribeMessage(NetEvents.Input)
  onInput(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const a = this.matches.relay.authorize(client.id, 'input', sizeOf(body), Date.now());
    if (!a.ok || a.isHost || !a.hostConnId) return;
    this.server.to(a.hostConnId).volatile.emit(NetEvents.Input, { from: a.playerId, d: body });
  }

  /** oda sahibi → misafirler: dünya görüntüsü */
  @SubscribeMessage(NetEvents.Snapshot)
  onSnapshot(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const a = this.matches.relay.authorize(client.id, 'snapshot', sizeOf(body), Date.now());
    if (!a.ok) return;
    client.to(a.roomCode).volatile.emit(NetEvents.Snapshot, body);
  }

  /** güvenilir tek seferlik olaylar (hasar, xp, yetenek, bitiş) */
  @SubscribeMessage(NetEvents.Event)
  onEvent(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const a = this.matches.relay.authorize(client.id, 'event', sizeOf(body), Date.now());
    if (!a.ok) return;
    if (a.isHost) client.to(a.roomCode).emit(NetEvents.Event, { from: a.playerId, d: body });
    else if (a.hostConnId) this.server.to(a.hostConnId).emit(NetEvents.Event, { from: a.playerId, d: body });
  }

  handleDisconnect(client: Socket) {
    const left = this.matches.relay.leave(client.id, Date.now());
    if (!left) return;
    if (left.ended) {
      this.server.to(left.roomCode).emit(NetEvents.Ended, { reason: 'HOST_LEFT' });
      this.server.in(left.roomCode).socketsLeave(left.roomCode);
      return;
    }
    for (const [, sock] of this.server.sockets) {
      if (!sock.rooms.has(left.roomCode)) continue;
      const me = sock.data.playerId as string | undefined;
      if (me) sock.emit(NetEvents.Roster, { ...left.roster, you: me } satisfies NetRoster);
    }
  }
}
