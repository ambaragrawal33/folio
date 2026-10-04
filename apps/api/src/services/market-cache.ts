import type { Redis } from 'ioredis';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
export interface MarketCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
  acquire(key: string, token: string, ttl: number): Promise<boolean>;
  release(key: string, token: string): Promise<void>;
  increment(key: string, ttl: number): Promise<number>;
}
export class RedisMarketCache implements MarketCache {
  private readonly redis: Redis;
  private readonly key: Buffer;
  constructor(redis: Redis, secret: string) {
    this.redis = redis;
    this.key = createHash('sha256')
      .update('folio-market-cache\0' + secret)
      .digest();
  }
  async get(key: string) {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    const [nonce, tag, payload] = raw.split('.');
    if (!nonce || !tag || payload === undefined) throw new Error('Invalid encrypted cache');
    const cipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(nonce, 'base64url'));
    cipher.setAAD(Buffer.from(key));
    cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      cipher.update(Buffer.from(payload, 'base64url')),
      cipher.final(),
    ]).toString('utf8');
  }
  async set(key: string, value: string, ttl: number) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(key));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    await this.redis.set(
      key,
      [
        nonce.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url'),
      ].join('.'),
      'EX',
      ttl,
    );
  }
  async acquire(key: string, token: string, ttl: number) {
    return (await this.redis.set(key, token, 'EX', ttl, 'NX')) === 'OK';
  }
  async release(key: string, token: string) {
    await this.redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
      1,
      key,
      token,
    );
  }
  async increment(key: string, ttl: number) {
    const count = await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
      1,
      key,
      ttl,
    );
    if (typeof count !== 'number') throw new Error('Cache unavailable');
    return count;
  }
}
export class CachedProvider {
  private readonly pending = new Set<Promise<unknown>>();
  async drain() {
    await Promise.allSettled([...this.pending]);
  }
  private readonly cache: MarketCache;
  private readonly prefix: string;
  private readonly now: () => number;
  constructor(cache: MarketCache, prefix: string, now: () => number = Date.now) {
    this.cache = cache;
    this.prefix = prefix;
    this.now = now;
  }
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    validate: (value: unknown) => T,
    ttlSeconds: number,
    maxAgeSeconds: number,
    provider: string,
  ): Promise<{ value: T; stale: boolean } | null> {
    const namespace = this.prefix + ':market:' + key;
    let old: { value: T; fetchedAt: number } | null = null;
    try {
      const raw = await this.cache.get(namespace);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'fetchedAt' in parsed &&
          typeof parsed.fetchedAt === 'number' &&
          'value' in parsed
        ) {
          old = { value: validate(parsed.value), fetchedAt: parsed.fetchedAt };
        }
      }
      if (old && this.now() - old.fetchedAt < ttlSeconds * 1000)
        return { value: old.value, stale: false };
      const fallback = () =>
        old && this.now() - old.fetchedAt < maxAgeSeconds * 1000
          ? { value: old.value, stale: true }
          : null;
      const breakerKey = this.prefix + ':breaker:' + provider;
      if (await this.cache.get(breakerKey)) return fallback();
      const token = randomBytes(18).toString('hex');
      const lock = namespace + ':lock';
      if (!(await this.cache.acquire(lock, token, 20))) return fallback();
      const refresh = async () => {
        try {
          const value = validate(await fetcher());
          await this.cache.set(
            namespace,
            JSON.stringify({ value, fetchedAt: this.now() }),
            maxAgeSeconds,
          );
          return { value, stale: false };
        } catch {
          const failures = await this.cache.increment(this.prefix + ':failures:' + provider, 300);
          if (failures >= 3) await this.cache.set(breakerKey, 'open', 60);
          return fallback();
        } finally {
          await this.cache.release(lock, token);
        }
      };
      const stale = fallback();
      if (stale) {
        const work = refresh().catch(() => null);
        this.pending.add(work);
        void work.finally(() => this.pending.delete(work));
        return stale;
      }
      return await refresh();
    } catch {
      return null;
    } // Cache/security/quota outages never cause unbounded direct provider requests.
  }
}
