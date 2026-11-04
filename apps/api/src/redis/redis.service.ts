import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  async connect(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  async setJson(key: string, value: unknown, ttlSec?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSec) {
      await this.client.set(key, payload, 'EX', ttlSec);
      return;
    }
    await this.client.set(key, payload);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
