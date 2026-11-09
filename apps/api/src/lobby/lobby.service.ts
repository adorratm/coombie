import { Injectable } from '@nestjs/common';
import {
  MAX_COOP_PLAYERS,
  type GameMode,
  type LobbyStatePayload,
  type OperativeId,
  type PlayerState,
} from '@protocol-z/shared';
import { createPlayerState } from '@protocol-z/game-engine';
import { RedisService } from '../redis/redis.service';
import { randomBytes } from 'node:crypto';

interface Room {
  roomCode: string;
  mode: GameMode;
  fillBots: boolean;
  hostPlayerId: string;
  players: Map<string, PlayerState>;
}

@Injectable()
export class LobbyService {
  private rooms = new Map<string, Room>();

  constructor(private readonly redis: RedisService) {}

  createRoom(
    playerId: string,
    displayName: string,
    mode: GameMode,
    fillBots = true,
  ): LobbyStatePayload {
    const roomCode = this.generateCode();
    const player = createPlayerState(playerId, displayName, 'ironclad');
    const room: Room = {
      roomCode,
      mode,
      fillBots,
      hostPlayerId: playerId,
      players: new Map([[playerId, player]]),
    };
    this.rooms.set(roomCode, room);
    void this.persist(room);
    return this.toPayload(room);
  }

  /**
   * Dracord oturumu → sabit kodlu co-op oda. Yoksa oluşturur (ilk gelen host),
   * varsa katılır. Aynı kullanıcı yeniden bağlanırsa yerini korur.
   */
  joinOrCreateFixedRoom(
    roomCode: string,
    playerId: string,
    displayName: string,
  ): LobbyStatePayload {
    const code = roomCode.toUpperCase();
    if (!this.rooms.has(code)) {
      const player = createPlayerState(playerId, displayName, 'ironclad');
      const room: Room = {
        roomCode: code,
        mode: 'coop',
        fillBots: true,
        hostPlayerId: playerId,
        players: new Map([[playerId, player]]),
      };
      this.rooms.set(code, room);
      void this.persist(room);
      return this.toPayload(room);
    }
    return this.joinRoom(code, playerId, displayName);
  }

  joinRoom(
    roomCode: string,
    playerId: string,
    displayName: string,
  ): LobbyStatePayload {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.mode === 'solo') throw new Error('SOLO_ROOM');
    if (room.players.size >= MAX_COOP_PLAYERS) throw new Error('ROOM_FULL');
    if (room.players.has(playerId)) return this.toPayload(room);

    const taken = new Set(
      [...room.players.values()].map((p) => p.operativeId),
    );
    const fallback = (
      ['ironclad', 'valkyrie', 'breaker', 'tox'] as OperativeId[]
    ).find((id) => !taken.has(id))!;

    room.players.set(
      playerId,
      createPlayerState(playerId, displayName, fallback),
    );
    void this.persist(room);
    return this.toPayload(room);
  }

  selectOperative(
    roomCode: string,
    playerId: string,
    operativeId: OperativeId,
  ): LobbyStatePayload {
    const room = this.requireRoom(roomCode);
    const player = room.players.get(playerId);
    if (!player) throw new Error('NOT_IN_ROOM');

    const conflict = [...room.players.values()].some(
      (p) => p.playerId !== playerId && p.operativeId === operativeId,
    );
    if (conflict) throw new Error('OPERATIVE_TAKEN');

    player.operativeId = operativeId;
    void this.persist(room);
    return this.toPayload(room);
  }

  setReady(
    roomCode: string,
    playerId: string,
    isReady: boolean,
  ): LobbyStatePayload {
    const room = this.requireRoom(roomCode);
    const player = room.players.get(playerId);
    if (!player) throw new Error('NOT_IN_ROOM');
    player.isReady = isReady;
    void this.persist(room);
    return this.toPayload(room);
  }

  leave(roomCode: string, playerId: string): LobbyStatePayload | null {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return null;
    room.players.delete(playerId);
    if (room.players.size === 0) {
      this.rooms.delete(room.roomCode);
      void this.redis.client.del(`lobby:${room.roomCode}`);
      return null;
    }
    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = room.players.keys().next().value!;
    }
    void this.persist(room);
    return this.toPayload(room);
  }

  getRoom(roomCode: string): LobbyStatePayload {
    return this.toPayload(this.requireRoom(roomCode));
  }

  canStart(roomCode: string): boolean {
    const room = this.requireRoom(roomCode);
    const players = [...room.players.values()];
    if (room.mode === 'solo') return players.every((p) => p.isReady);
    if (players.length < 2) return false;
    return players.every((p) => p.isReady);
  }

  private requireRoom(roomCode: string): Room {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) throw new Error('ROOM_NOT_FOUND');
    return room;
  }

  private toPayload(room: Room): LobbyStatePayload {
    return {
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      config: {
        mode: room.mode,
        maxPlayers: room.mode === 'solo' ? 1 : 4,
        fillBots: room.fillBots,
        region: 'eu-central',
      },
      players: [...room.players.values()],
    };
  }

  private async persist(room: Room): Promise<void> {
    try {
      await this.redis.connect();
      await this.redis.setJson(`lobby:${room.roomCode}`, this.toPayload(room), 3600);
    } catch {
      // Redis optional in early local boot
    }
  }

  private generateCode(): string {
    const n = randomBytes(2).readUInt16BE(0) % 10000;
    return `ALPHA-${String(n).padStart(4, '0')}`;
  }
}
