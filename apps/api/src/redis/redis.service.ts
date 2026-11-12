import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis is optional: lobbies live in memory and are only mirrored here.
 * Without REDIS_URL (or when Redis is down) every call is a quiet no-op — a missing
 * cache must never take the game server down.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger('Redis');
  readonly client: Redis | null;
  private warned = false;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.client = null;
      return;
    }
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(30_000, 500 * 2 ** Math.min(times, 6)),
    });
    this.client.on('error', (err) => {
      if (this.warned) return;
      this.warned = true;
      this.log.warn(`unreachable (${err.message}) — continuing without it`);
    });
    this.client.on('ready', () => {
      this.warned = false;
    });
  }

  async connect(): Promise<void> {
    if (this.client?.status === 'wait') await this.client.connect();
  }

  async setJson(key: string, value: unknown, ttlSec?: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.connect();
      const payload = JSON.stringify(value);
      if (ttlSec) await this.client.set(key, payload, 'EX', ttlSec);
      else await this.client.set(key, payload);
    } catch {
      /* optional mirror */
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      await this.connect();
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.connect();
      await this.client.del(key);
    } catch {
      /* optional mirror */
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client?.quit();
    } catch {
      /* already closed */
    }
  }
}
