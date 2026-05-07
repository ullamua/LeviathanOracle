import Redis, { type Redis as RedisClient } from 'ioredis';
import type { BotConfig } from '../config/load';
import { tracer } from '../observability/tracer';

let client: RedisClient | null = null;
let enabled = false;

export function initializeRedis(cfg: BotConfig['database']['redis']): RedisClient | null {
  if (!cfg.enabled) {
    tracer.info('CACHE: Redis', 'Disabled — caching and BullMQ unavailable');
    return null;
  }

  const c = cfg.url
    ? new Redis(cfg.url, { maxRetriesPerRequest: null, retryStrategy: (t) => Math.min(t * 50, 2_000) })
    : new Redis({
        host: cfg.host,
        port: cfg.port,
        password: cfg.password,
        maxRetriesPerRequest: null,
        retryStrategy: (t) => Math.min(t * 50, 2_000),
      });

  c.on('error', (err) => tracer.error('CACHE: Redis', 'Error', err));
  c.on('ready', () => tracer.info('CACHE: Redis', 'Connected'));

  client = c;
  enabled = true;
  return c;
}

export function getRedis(): RedisClient | null {
  return client;
}

export function isRedisEnabled(): boolean {
  return enabled;
}

export interface CacheOptions {
  fresh?: boolean;
}

export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, opts: CacheOptions = {}): Promise<T> {
  if (opts.fresh) return fetcher();
  if (!client) return fetcher();

  try {
    const hit = await client.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    tracer.warn('CACHE: Redis', `GET failed for ${key}`, err);
  }

  const data = await fetcher();
  if (data != null) {
    client.set(key, JSON.stringify(data), 'EX', ttlSeconds).catch((err) =>
      tracer.warn('CACHE: Redis', `SET failed for ${key}`, err),
    );
  }
  return data;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    enabled = false;
  }
}
