import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MatchRelay, type LobbyStatePayload } from '@protocol-z/shared';
import { randomBytes } from 'node:crypto';

/** Co-op maç aktarıcısının durumu (biletler, kim hangi odada, hız sınırları). */
@Injectable()
export class MatchService implements OnModuleDestroy {
  readonly relay = new MatchRelay(() => randomBytes(24).toString('base64url'));
  private readonly sweeper = setInterval(() => this.relay.sweep(Date.now()), 60_000);

  constructor() {
    this.sweeper.unref?.();
  }

  /** Lobi başladı: her oyuncuya tek kullanımlık maç bileti. */
  ticketsFor(lobby: LobbyStatePayload): Map<string, string> {
    return this.relay.issueTickets(
      lobby.roomCode,
      lobby.hostPlayerId,
      lobby.players.filter((p) => !p.isBot).map((p) => ({ playerId: p.playerId, displayName: p.displayName, operativeId: p.operativeId })),
      Date.now(),
    );
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }
}
