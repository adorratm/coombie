import { Injectable } from '@nestjs/common';
import {
  applyKillExp,
  createMatch,
  currentWave,
  type MatchRuntime,
} from '@protocol-z/game-engine';
import {
  rollPowerUpChoices,
  type LobbyStatePayload,
  type PowerUpChoiceOffer,
} from '@protocol-z/shared';
import { v4 as uuid } from 'uuid';

@Injectable()
export class MatchService {
  private matches = new Map<string, MatchRuntime>();

  startFromLobby(lobby: LobbyStatePayload): MatchRuntime {
    const match = createMatch(lobby.config.mode, lobby.players);
    this.matches.set(lobby.roomCode, match);
    return match;
  }

  get(roomCode: string): MatchRuntime | undefined {
    return this.matches.get(roomCode);
  }

  /** Prototype: award exp and open power-up offers */
  awardExp(
    roomCode: string,
    killerPlayerId: string,
    amount: number,
  ): { offers: PowerUpChoiceOffer[]; wave: ReturnType<typeof currentWave> } {
    const match = this.matches.get(roomCode);
    if (!match) return { offers: [], wave: currentWave(1) };
    const offers = applyKillExp(match, killerPlayerId, amount, () => uuid());
    match.pendingOffers.push(...offers);
    return { offers, wave: currentWave(match.level) };
  }

  selectPowerUp(
    roomCode: string,
    offerId: string,
    powerUpId: string,
    targetOperativeId: string,
  ): boolean {
    const match = this.matches.get(roomCode);
    if (!match) return false;
    const offerIdx = match.pendingOffers.findIndex((o) => o.offerId === offerId);
    if (offerIdx < 0) return false;
    const offer = match.pendingOffers[offerIdx]!;
    const choice = offer.choices.find((c) => c.id === powerUpId);
    if (!choice) return false;

    for (const entry of match.players.values()) {
      if (entry.state.operativeId === targetOperativeId) {
        entry.state.powerUps.push(choice.id);
      }
    }

    offer.picksRemaining -= 1;
    if (offer.picksRemaining <= 0) {
      match.pendingOffers.splice(offerIdx, 1);
    } else {
      offer.choices = rollPowerUpChoices(3);
    }
    return true;
  }
}
