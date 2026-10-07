import type { Redis } from 'ioredis';
export interface CacheStore {
  increment(key: string, ttlSeconds: number): Promise<number>;
}
export class MemoryCache implements CacheStore {
  private readonly entries = new Map<string, { value: number; expires: number }>();
  async increment(key: string, ttlSeconds: number) {
    const now = Date.now();
    const previous = this.entries.get(key);
    const value = previous && previous.expires > now ? previous.value + 1 : 1;
    this.entries.set(key, {
      value,
      expires: previous && previous.expires > now ? previous.expires : now + ttlSeconds * 1000,
    });
    return value;
  }
}
export class RedisCache implements CacheStore {
  private readonly redis: Redis;
  constructor(redis: Redis) {
    this.redis = redis;
  }
  async increment(key: string, ttlSeconds: number) {
    const result = await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
      1,
      key,
      ttlSeconds,
    );
    if (typeof result !== 'number') throw new Error('Limiter unavailable');
    return result;
  }
}
