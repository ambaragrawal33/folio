import { describe, it, expect, vi } from 'vitest';
import { Redis } from 'ioredis';
import { parseEnv } from '../src/config/env.ts';
import { ProviderTransport } from '../src/providers/transport.ts';
import { parseExact, exactFinancial, exactPrice, timestamp } from '../src/providers/exact.ts';
import { LiveMarketGateway } from '../src/providers/adapters.ts';
import { calendarVersion, marketSession, quoteFreshness } from '../src/providers/calendars.ts';
import { CachedProvider, RedisMarketCache } from '../src/services/market-cache.ts';
import type { MarketCache } from '../src/services/market-cache.ts';
import type { Instrument } from '@folio/shared';
const config = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost/folio',
  REDIS_URL: 'redis://localhost',
  WEB_ORIGIN: 'http://localhost:5173',
};
const equity: Instrument = {
  id: 'TEST:US',
  symbol: 'TEST',
  name: 'Synthetic adapter fixture',
  currency: 'USD',
  exchange: 'US',
  assetClass: 'equity',
  sector: 'Unknown',
  provider: 'yahoo',
  providerId: 'TEST',
  metadataSource: 'Synthetic test fixture',
};
const crypto: Instrument = {
  ...equity,
  id: 'BTC:CRYPTO',
  symbol: 'BTC',
  name: 'Bitcoin',
  exchange: 'CRYPTO',
  assetClass: 'crypto',
  provider: 'coingecko',
  providerId: 'bitcoin',
};
const seconds = (date: string) => String(new Date(date).getTime() / 1000);
const instant = '2026-01-06T15:01:00.000Z';
function chart(price = '123.4567890123456789012345678901234', symbol = 'TEST', currency = 'USD') {
  return `{"chart":{"error":null,"result":[{"meta":{"symbol":"${symbol}","currency":"${currency}","regularMarketPrice":${price},"regularMarketTime":${seconds('2026-01-06T15:00:00.000Z')},"chartPreviousClose":9},"timestamp":[${seconds('2026-01-05T14:30:00.000Z')},${seconds('2026-01-06T14:30:00.000Z')}],"indicators":{"quote":[{"close":[80,123]}],"adjclose":[{"adjclose":[77,120]}]}}]}}`;
}
class TestMarketCache implements MarketCache {
  entries = new Map<string, { value: string; expires: number }>();
  now = 0;
  async get(key: string) {
    const row = this.entries.get(key);
    return row && row.expires > this.now ? row.value : null;
  }
  async set(key: string, value: string, ttl: number) {
    this.entries.set(key, { value, expires: this.now + ttl * 1000 });
  }
  async acquire(key: string, token: string, ttl: number) {
    const row = this.entries.get(key);
    if (row && row.expires > this.now) return false;
    this.entries.set(key, { value: token, expires: this.now + ttl * 1000 });
    return true;
  }
  async release(key: string, token: string) {
    if ((await this.get(key)) === token) this.entries.delete(key);
  }
  async increment(key: string, ttl: number) {
    const value = Number((await this.get(key)) ?? '0') + 1;
    await this.set(key, String(value), ttl);
    return value;
  }
}
function gateway(
  fetcher: typeof fetch,
  extra: Record<string, string> = {},
  cache = new TestMarketCache(),
  master = [equity, crypto],
) {
  return new LiveMarketGateway(
    parseEnv({ ...config, ...extra }),
    cache,
    master,
    new ProviderTransport(fetcher),
    () => new Date(instant),
  );
}
const entitled = {
  YAHOO_DISPLAY_ENTITLED: 'true',
  YAHOO_ENTITLEMENT_REFERENCE: 'Explicit synthetic test entitlement; not production authorization',
};
describe('bounded exact provider transports', () => {
  it('preserves raw financial tokens including exponents without a JS-number intermediate', () => {
    expect(parseExact('{"price":123.4567890123456789012345678901234,"small":1e-18}')).toEqual({
      price: '123.4567890123456789012345678901234',
      small: '1e-18',
    });
    expect(exactFinancial('1e-18')).toBe('0.000000000000000001');
    expect(exactFinancial('-2e2')).toBe('-200');
    for (const token of ['NaN', 'Infinity', '01', '1'.repeat(101), '1e1000000', '1e-1000000'])
      expect(() => exactFinancial(token)).toThrow();
    expect(() => exactPrice('-1')).toThrow();
    expect(() => timestamp('1.5')).toThrow();
    expect(() => timestamp('9999999999999')).toThrow();
  });
  it('enforces HTTPS host/path/redirect/size constraints and redacts upstream errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"x":1}'));
    const transport = new ProviderTransport(fetcher);
    for (const url of [
      'http://api.frankfurter.dev/v2/rates',
      'https://127.0.0.1/v2/rates',
      'https://api.frankfurter.dev/secret',
      'https://x:y@api.frankfurter.dev/v2/rates',
      'https://api.frankfurter.dev:123/v2/rates',
    ])
      await expect(transport.text(url)).rejects.toMatchObject({ code: 'HOST_REJECTED' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await transport.text('https://api.frankfurter.dev/v2/rates')).toBe('{"x":1}');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    await expect(
      new ProviderTransport(async () => new Response('private raw failure', { status: 429 })).text(
        'https://api.frankfurter.dev/v2/rates',
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', message: 'Market provider is unavailable.' });
    await expect(
      new ProviderTransport(async () => new Response('private raw failure', { status: 500 })).text(
        'https://api.frankfurter.dev/v2/rates',
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    await expect(
      new ProviderTransport(async () => new Response(null)).text(
        'https://api.frankfurter.dev/v2/rates',
      ),
    ).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
    await expect(
      new ProviderTransport(
        async () => new Response('body', { headers: { 'content-length': '100' } }),
        5000,
        3,
      ).text('https://api.frankfurter.dev/v2/rates'),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    await expect(
      new ProviderTransport(async () => new Response('body'), 5000, 3).text(
        'https://api.frankfurter.dev/v2/rates',
      ),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    const timeout: typeof fetch = async (_url, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener('abort', () => reject(new Error('timeout'))),
      );
    await expect(
      new ProviderTransport(timeout, 10).text('https://api.frankfurter.dev/v2/rates'),
    ).rejects.toThrow('timeout');
  });
});
describe('current approved providers and capabilities', () => {
  it('keeps missing keys/unverified Yahoo rights unavailable without network calls', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = gateway(fetcher);
    expect(await provider.quotes([equity, crypto])).toEqual([]);
    expect((await provider.history(equity)).reason).toContain('entitlement');
    expect((await provider.history(crypto)).reason).toContain('key');
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => gateway(fetcher, { YAHOO_DISPLAY_ENTITLED: 'true' })).toThrow('entitlement');
    expect(() =>
      gateway(fetcher, {
        DEMO_MODE: 'true',
        CACHE_NAMESPACE: 'folio:demo',
        MONGODB_URI: 'mongodb://localhost/folio_demo',
      }),
    ).toThrow('Live providers');
  });
  it('uses ECB only and selects latest actual rate date on/before trading date', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            '[{"date":"2026-01-02","base":"USD","quote":"INR","rate":82.1234567890123456789},{"date":"2026-01-07","base":"USD","quote":"INR","rate":99},{"date":"2026-01-05","base":"USD","quote":"EUR","rate":0.9}]',
          ),
      );
    const provider = gateway(fetcher);
    const rate = await provider.historicalFx('USD', 'INR', '2026-01-06');
    expect(rate).toMatchObject({
      rate: '82.1234567890123456789',
      rateDate: '2026-01-02',
      source: 'Frankfurter/ECB',
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('providers=ecb');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('date=2026-01-06');
    expect((await provider.rates(['USD', 'INR', 'USD'], 'INR'))['INR']).toMatchObject({
      rate: '1',
      source: 'identity',
      status: 'fresh',
    });
    expect((await provider.rates(['USD'], 'INR'))['USD']?.status).toBe('stale');
    expect(await provider.historicalFx('usd', 'INR', '2026-01-06')).toBeNull();
    expect(await provider.historicalFx('USD', 'bad', '2026-01-06')).toBeNull();
    expect(await provider.historicalFx('USD', 'INR', 'bad')).toBeNull();
    expect(await provider.historicalFx('USD', 'INR', '2027-01-06')).toBeNull();
    expect(
      await gateway(async () => new Response('[]')).historicalFx('USD', 'INR', '2026-01-06'),
    ).toBeNull();
    expect(
      await gateway(async () => {
        throw new Error('offline');
      }).historicalFx('USD', 'INR', '2026-01-06'),
    ).toBeNull();
  });
  it('verifies the installed Yahoo wrapper fetch hook and discards its float result', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(chart()));
    const provider = gateway(fetcher, entitled);
    const quotes = await provider.quotes([equity]);
    expect(quotes[0]).toMatchObject({
      price: '123.4567890123456789012345678901234',
      referencePrice: '80',
      referencePeriod: 'previous-close',
      fixture: false,
      status: 'fresh',
    });
    // range chartPreviousClose=9 and dividend-adjusted adjclose=77 must never become previous close/price-only series.
    const history = await provider.history(equity);
    expect(history.points.map((p) => p.price)).toEqual(['80', '123']);
    expect(history.label).toContain('split-adjusted');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/v8/finance/chart/TEST');
    expect(
      await gateway(async () => new Response(chart('10', 'WRONG')), entitled).quotes([equity]),
    ).toEqual([]);
    expect(
      await gateway(async () => new Response(chart('10', 'TEST', 'INR')), entitled).quotes([
        equity,
      ]),
    ).toEqual([]);
    expect(await provider.quotes([{ ...equity, id: 'poisoned' }])).toEqual([]);
    expect((await provider.history({ ...equity, id: 'poisoned' })).status).toBe('unavailable');
    expect(
      (
        await gateway(
          async () => new Response('{"chart":{"result":null,"error":{"code":"bad"}}}'),
          entitled,
        ).history(equity)
      ).status,
    ).toBe('unavailable');
    expect(await gateway(async () => new Response('bad json'), entitled).quotes([equity])).toEqual(
      [],
    );
  });
  it('uses configured Demo header, batches the canonical universe and derives provider-reported rolling 24h reference exactly', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            '[{"id":"bitcoin","current_price":123.456789012345678901,"price_change_24h":3.000000000000000001,"last_updated":"2026-01-06T15:00:00.000Z"},{"id":"unknown","current_price":100,"price_change_24h":1,"last_updated":"2026-01-06T15:00:00.000Z"}]',
          ),
      );
    const provider = gateway(fetcher, { COINGECKO_DEMO_KEY: 'synthetic-test-key' });
    const quotes = await provider.quotes([crypto]);
    expect(quotes[0]).toMatchObject({
      price: '123.456789012345678901',
      referencePrice: '120.4567890123456789',
      referencePeriod: 'rolling-24h',
      fixture: false,
    });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      'x-cg-demo-api-key': 'synthetic-test-key',
    });
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain('synthetic-test-key');
    await provider.quotes([crypto]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const missing = gateway(
      async () =>
        new Response(
          '[{"id":"bitcoin","current_price":null,"price_change_24h":null,"last_updated":"2026-01-06T15:00:00.000Z"}]',
        ),
      { COINGECKO_DEMO_KEY: 'synthetic-test-key' },
    );
    expect(await missing.quotes([crypto])).toEqual([]);
    const noChange = gateway(
      async () =>
        new Response(
          '[{"id":"bitcoin","current_price":0,"price_change_24h":null,"last_updated":"2026-01-06T15:00:00.000Z"}]',
        ),
      { COINGECKO_DEMO_KEY: 'synthetic-test-key' },
    );
    expect((await noChange.quotes([crypto]))[0]?.referencePrice).toBeNull();
    expect(
      await gateway(
        fetcher,
        { COINGECKO_DEMO_KEY: 'synthetic-test-key' },
        new TestMarketCache(),
        [],
      ).quotes([crypto]),
    ).toEqual([]);
  });
  it('rejects unsafe references, exhausted budgets and unsupported history instead of fabricating backfill', async () => {
    const cache = new TestMarketCache();
    const month = instant.slice(0, 7);
    await cache.set('folio:normal:coingecko-budget:month:' + month, '9000', 86400);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]'));
    expect(
      await gateway(fetcher, { COINGECKO_DEMO_KEY: 'synthetic-test-key' }, cache).quotes([crypto]),
    ).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    const minutes = new TestMarketCache();
    await minutes.set('folio:normal:coingecko-budget:minute:' + instant.slice(0, 16), '60', 120);
    expect(
      (
        await gateway(fetcher, { COINGECKO_DEMO_KEY: 'synthetic-test-key' }, minutes).history(
          crypto,
        )
      ).status,
    ).toBe('unavailable');
    const negative = gateway(
      async () =>
        new Response(
          '[{"id":"bitcoin","current_price":1,"price_change_24h":2,"last_updated":"2026-01-06T15:00:00.000Z"}]',
        ),
      { COINGECKO_DEMO_KEY: 'synthetic-test-key' },
    );
    expect(await negative.quotes([crypto])).toEqual([]);
    const history = gateway(
      async () => new Response('{"prices":[[1767711600000,123.456789012345678901]]}'),
      { COINGECKO_DEMO_KEY: 'synthetic-test-key' },
    );
    expect((await history.history(crypto)).points[0]?.price).toBe('123.456789012345678901');
    const old = gateway(async () => new Response('{"error":"last year only"}', { status: 401 }), {
      COINGECKO_DEMO_KEY: 'synthetic-test-key',
    });
    expect((await old.history(crypto)).points).toEqual([]);
  });
});
describe('calendar-aware data age and bounded shared cache', () => {
  it('respects verified holidays, early closes, DST, weekends and unknown sessions', () => {
    expect(calendarVersion).toBe('2026-10-04.1');
    expect(marketSession('NSE', new Date('2026-01-15T05:00:00Z'))).toBe('closed');
    expect(marketSession('NSE', new Date('2026-01-16T05:00:00Z'))).toBe('open');
    expect(marketSession('NSE', new Date('2026-11-08T10:00:00Z'))).toBe('unknown');
    expect(marketSession('BSE', new Date(instant))).toBe('unknown');
    expect(marketSession('US', new Date('2027-01-06T15:00:00Z'))).toBe('unknown');
    expect(marketSession('US', new Date('2026-11-27T18:01:00Z'))).toBe('closed');
    expect(marketSession('US', new Date('2026-07-03T15:00:00Z'))).toBe('closed');
    expect(marketSession('US', new Date('2026-06-04T13:31:00Z'))).toBe('open');
    expect(marketSession('US', new Date('2026-01-06T13:31:00Z'))).toBe('closed');
    expect(marketSession('CRYPTO', new Date('2026-01-04T00:00:00Z'))).toBe('open');
    expect(quoteFreshness(equity, new Date('2026-01-06T15:00:00Z'), new Date(instant))).toBe(
      'fresh',
    );
    expect(quoteFreshness(equity, new Date('2026-01-05T15:00:00Z'), new Date(instant))).toBe(
      'stale',
    );
    expect(quoteFreshness(equity, new Date('2026-01-07T15:00:00Z'), new Date(instant))).toBe(
      'stale',
    );
    expect(quoteFreshness(crypto, new Date('2026-01-06T15:00:00Z'), new Date(instant))).toBe(
      'fresh',
    );
    expect(quoteFreshness(crypto, new Date('2026-01-06T14:00:00Z'), new Date(instant))).toBe(
      'stale',
    );
    expect(
      quoteFreshness({ ...equity, exchange: 'BSE' }, new Date(instant), new Date(instant)),
    ).toBe('stale');
    expect(
      quoteFreshness(equity, new Date('2026-01-02T21:00:00Z'), new Date('2026-01-04T18:00:00Z')),
    ).toBe('fresh');
    expect(
      quoteFreshness(equity, new Date('2026-11-25T21:00:00Z'), new Date('2026-11-27T18:05:00Z')),
    ).toBe('stale');
    expect(
      quoteFreshness(equity, new Date('2026-11-27T18:00:00Z'), new Date('2026-11-27T18:05:00Z')),
    ).toBe('fresh');
  });
  it('single-flights cross-worker fetches, preserves stale data on failure and opens a timed breaker', async () => {
    const cache = new TestMarketCache();
    const provider = new CachedProvider(cache, 'test', () => cache.now);
    const validate = (v: unknown) => {
      if (typeof v !== 'string') throw new Error('poison');
      return v;
    };
    const fetcher = vi.fn(async () => '123.456789012345678901');
    const results = await Promise.all([
      provider.get('x', fetcher, validate, 1, 100, 'p'),
      provider.get('x', fetcher, validate, 1, 100, 'p'),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.filter((v) => v !== null)).toHaveLength(1);
    expect((await provider.get('x', fetcher, validate, 1, 100, 'p'))?.stale).toBe(false);
    cache.now = 2000;
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await provider.get(
            'x',
            async () => {
              throw new Error('offline');
            },
            validate,
            1,
            100,
            'p',
          )
        )?.stale,
      ).toBe(true);
      await provider.drain();
    }
    expect(await cache.get('test:breaker:p')).toBe('open');
    await provider.get('x', fetcher, validate, 1, 100, 'p');
    expect(fetcher).toHaveBeenCalledTimes(1);
    cache.now = 101000;
    expect(
      await provider.get(
        'x',
        async () => {
          throw new Error('offline');
        },
        validate,
        1,
        100,
        'p',
      ),
    ).toBeNull();
    const broken = {
      ...cache,
      get: async () => {
        throw new Error('Redis offline');
      },
    } as MarketCache;
    expect(
      await new CachedProvider(broken, 'test').get('x', fetcher, validate, 1, 100, 'p'),
    ).toBeNull();
    await cache.set('test:market:poison', '{"fetchedAt":0,"value":100}', 100);
    expect(await provider.get('poison', fetcher, validate, 1, 100, 'p')).toBeNull();
    // Stale data returns immediately while a bounded refresh is still pending.
    cache.now = 200000;
    await provider.get('swr', fetcher, validate, 1, 100, 'p');
    cache.now = 202000;
    let finish: (value: string) => void = () => {};
    const refresh = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    expect(await provider.get('swr', refresh, validate, 1, 100, 'p')).toEqual({
      value: '123.456789012345678901',
      stale: true,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((await provider.get('swr', refresh, validate, 1, 100, 'p'))?.stale).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    finish('456.1234567890123456789');
    await provider.drain();
    expect(await provider.get('swr', fetcher, validate, 1, 100, 'p')).toEqual({
      value: '456.1234567890123456789',
      stale: false,
    });
  });
  it.runIf(Boolean(process.env['FOLIO_TEST_REDIS_URL']))(
    'encrypts exact cached values and uses atomic leases/quotas on real Redis',
    async () => {
      const redis = new Redis(process.env['FOLIO_TEST_REDIS_URL']!);
      const prefix = 'folio:provider-test:' + Date.now();
      const cache = new RedisMarketCache(redis, 'synthetic-long-cache-secret-for-test-only');
      try {
        await cache.set(prefix, '123.456789012345678901', 60);
        expect(await cache.get(prefix)).toBe('123.456789012345678901');
        expect(await redis.get(prefix)).not.toContain('123.456');
        expect(await cache.get(prefix + ':missing')).toBeNull();
        expect(await cache.acquire(prefix + ':lock', 'first', 20)).toBe(true);
        expect(await cache.acquire(prefix + ':lock', 'second', 20)).toBe(false);
        await cache.release(prefix + ':lock', 'second');
        expect(await redis.get(prefix + ':lock')).toBe('first');
        await cache.release(prefix + ':lock', 'first');
        expect(await redis.get(prefix + ':lock')).toBeNull();
        expect(
          await Promise.all([
            cache.increment(prefix + ':quota', 60),
            cache.increment(prefix + ':quota', 60),
          ]),
        ).toEqual([1, 2]);
        expect(await redis.ttl(prefix + ':quota')).toBeGreaterThan(0);
        await redis.set(prefix, 'corrupt');
        await expect(cache.get(prefix)).rejects.toThrow();
      } finally {
        await redis.del(prefix, prefix + ':lock', prefix + ':quota');
        await redis.quit();
      }
    },
  );
});
