import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { parseEnv, assertLocalFixtureEnv } from '../src/config/env.ts';
import { LocalFixtureMarketGateway } from '../src/providers/local-fixture.ts';
import { LiveMarketGateway } from '../src/providers/adapters.ts';
import { AuthService } from '../src/services/auth.ts';
import { DomainService } from '../src/services/domain.ts';
import { PasswordAuthProvider } from '../src/providers/password-auth.ts';
import { instrumentMaster } from '../src/models/instrument-master.ts';
import { createApp } from '../src/app.ts';
import { createLogger } from '../src/config/logger.ts';
import { MemoryCache } from '../src/services/cache.ts';
import type { TransactionInput } from '@folio/shared';
const fixtureConfig = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1/folio_local_fixture',
  REDIS_URL: 'redis://127.0.0.1/1',
  WEB_ORIGIN: 'http://localhost:5190',
  LOCAL_FIXTURE_MODE: 'true',
  CACHE_NAMESPACE: 'folio:local-fixture',
};
const now = () => new Date('2026-10-05T12:00:00.000Z');
describe('explicit local fixture configuration and provider boundary', () => {
  it('fails closed for normal/demo/production/storage/remote/provider configuration', () => {
    const env = parseEnv(fixtureConfig);
    for (const change of [
      { LOCAL_FIXTURE_MODE: 'false' },
      { DEMO_MODE: 'true' },
      { NODE_ENV: 'production' },
      { CACHE_NAMESPACE: 'folio:normal' },
      { CACHE_NAMESPACE: 'folio:demo' },
      { MONGODB_URI: 'mongodb://127.0.0.1/folio' },
      { MONGODB_URI: 'mongodb://127.0.0.1/folio_demo' },
      { MONGODB_URI: 'mongodb://remote.example/folio_local_fixture' },
      { MONGODB_URI: 'mongodb+srv://remote.example/folio_local_fixture' },
      { REDIS_URL: 'redis://127.0.0.1/0' },
      { REDIS_URL: 'redis://remote.example/1' },
      { REDIS_URL: 'rediss://127.0.0.1/1' },
      { WEB_ORIGIN: 'https://public.example' },
      { COINGECKO_DEMO_KEY: 'test-only-no-real-key' },
      { YAHOO_DISPLAY_ENTITLED: 'true' },
    ])
      expect(() => parseEnv({ ...fixtureConfig, ...change })).toThrow();
    const normal = parseEnv({
      ...fixtureConfig,
      LOCAL_FIXTURE_MODE: 'false',
      CACHE_NAMESPACE: 'folio:normal',
      MONGODB_URI: 'mongodb://localhost/folio',
      REDIS_URL: 'redis://localhost',
    });
    expect(() => new LocalFixtureMarketGateway(normal)).toThrow('explicit');
    const forbidden = async () => {
      throw new Error('No cache/provider access permitted');
    };
    expect(
      () =>
        new LiveMarketGateway(
          env,
          {
            get: forbidden,
            set: forbidden,
            acquire: forbidden,
            release: forbidden,
            increment: forbidden,
          },
          instrumentMaster,
        ),
    ).toThrow('fixture');
    expect(() => assertLocalFixtureEnv({ ...env, LOCAL_FIXTURE_MODE: false })).toThrow();
    expect(() =>
      parseEnv({
        ...fixtureConfig,
        NODE_ENV: 'development',
        MONGODB_URI: 'mongodb://localhost/folio_local_fixture_test_0123456789abcdef',
      }),
    ).toThrow();
    expect(() =>
      parseEnv({
        ...fixtureConfig,
        LOCAL_FIXTURE_MODE: 'false',
        CACHE_NAMESPACE: 'folio:normal',
        MONGODB_URI: 'mongodb://localhost/folio',
      }),
    ).toThrow('reserved');
    expect(() =>
      parseEnv({
        ...fixtureConfig,
        LOCAL_FIXTURE_MODE: 'false',
        CACHE_NAMESPACE: 'folio:normal',
        REDIS_URL: 'redis://localhost',
      }),
    ).toThrow('reserved');
    expect(() =>
      parseEnv({
        ...fixtureConfig,
        MONGODB_URI: 'mongodb://mongo/folio_local_fixture',
        REDIS_URL: 'redis://redis/1',
      }),
    ).not.toThrow();
  });
  it('labels generated, stale, missing, FX and history inputs without external calls or backfill', async () => {
    const gateway = new LocalFixtureMarketGateway(parseEnv(fixtureConfig), now);
    const quotes = await gateway.quotes(instrumentMaster);
    expect(quotes).toHaveLength(5);
    expect(quotes.every((q) => q.fixture && q.source.includes('not live'))).toBe(true);
    expect(quotes.find((q) => q.instrumentId === 'ETH:CRYPTO')).toMatchObject({
      status: 'stale',
      asOf: '2026-01-06T15:00:00.000Z',
      referencePeriod: 'rolling-24h',
    });
    expect(quotes.find((q) => q.instrumentId === 'TCS:NSE')).toMatchObject({
      status: 'fresh',
      asOf: now().toISOString(),
      price: '70',
      referencePeriod: 'previous-close',
    });
    expect(await gateway.quotes([{ ...instrumentMaster[0]!, currency: 'USD' }])).toEqual([]);
    expect(await gateway.rates(['INR', 'USD', 'GBP', 'USD'], 'INR')).toMatchObject({
      INR: { rate: '1', source: 'local-fixture' },
      USD: { rate: '88', rateDate: '2026-10-05', source: 'local-fixture' },
    });
    expect(await gateway.rates(['USD'], 'USD')).toEqual({});
    expect(await gateway.historicalFx('USD', 'INR', '2026-01-05')).toMatchObject({
      rate: '83',
      rateDate: '2026-01-05',
      source: 'local-fixture',
    });
    for (const args of [
      ['GBP', 'INR', '2026-01-05'],
      ['USD', 'USD', '2026-01-05'],
      ['USD', 'INR', '2026-01-04'],
      ['USD', 'INR', '2026-01-06'],
    ])
      expect(await gateway.historicalFx(args[0]!, args[1]!, args[2]!)).toBeNull();
    expect(await gateway.history(instrumentMaster[0]!)).toMatchObject({
      status: 'available',
      fixture: true,
      points: [
        { date: '2026-01-05', price: '68' },
        { date: '2026-01-06', price: '70' },
      ],
    });
    expect(await gateway.history(instrumentMaster[1]!)).toMatchObject({
      status: 'unavailable',
      fixture: true,
      points: [],
    });
    expect(await gateway.history({ ...instrumentMaster[0]!, currency: 'USD' })).toMatchObject({
      status: 'unavailable',
    });
    expect(
      (
        await new LocalFixtureMarketGateway(parseEnv(fixtureConfig)).quotes([instrumentMaster[0]!])
      )[0]!.asOf,
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
let connection: mongoose.Connection,
  repl: MongoMemoryReplSet | undefined,
  auth: AuthService,
  domain: DomainService;
const meta = { ip: 'test', userAgent: 'Local fixture integration' },
  password = 'A local fixture test passphrase!';
const dbName = 'folio_local_fixture_test_' + randomBytes(8).toString('hex');
const messages: { to: string; url: string }[] = [];
let env: ReturnType<typeof parseEnv>;
beforeAll(async () => {
  const supplied = process.env['FOLIO_TEST_MONGODB_URI'];
  if (!supplied)
    repl = await MongoMemoryReplSet.create({
      binary: { version: '8.2.12' },
      replSet: { count: 1 },
    });
  const uri = new URL(supplied ?? repl!.getUri());
  uri.pathname = '/' + dbName;
  env = parseEnv({ ...fixtureConfig, MONGODB_URI: uri.toString() });
  connection = await mongoose.createConnection(env.MONGODB_URI).asPromise();
  auth = new AuthService(connection, env, new PasswordAuthProvider(), {
    send: async (message) => {
      messages.push(message);
    },
  });
  await auth.initialize();
  domain = new DomainService(auth, new LocalFixtureMarketGateway(env, now));
  await domain.initialize(instrumentMaster);
}, 180000);
afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
  await repl?.stop();
});
async function account(suffix: string) {
  const email = suffix + '@example.test';
  await auth.register({ name: 'Local integration account', email, password }, meta);
  const message = messages.find((m) => m.to === email)!;
  await auth.verify(new URLSearchParams(new URL(message.url).hash.slice(1)).get('token')!, meta);
  const login = await auth.login({ email, password }, meta);
  return { login, identity: await auth.authenticate(login.response.accessToken) };
}
describe('real writable fixture accounts and Decimal ledger', () => {
  it('discovers canonical collisions/aliases and books only an owned verified identity without extending fixtures', async () => {
    expect((await domain.discover({ q: 'INFY', limit: 20 })).instruments.map((i) => i.id)).toEqual([
      'INFY:BSE',
      'INFY:NSE',
    ]);
    expect((await domain.discover({ q: 'infy.ns', limit: 1 })).instruments[0]?.id).toBe('INFY:NSE');
    const owner = await account('discovery-owner'),
      outsider = await account('discovery-outsider');
    const p = await domain.createDefault(owner.identity);
    const input: TransactionInput = {
      instrumentId: 'INFY:NSE',
      type: 'BUY',
      quantity: '2',
      price: '100',
      fees: '1',
      tradingDate: '2026-01-05',
      effectiveAt: '2026-01-05T10:00:00.000Z',
    };
    await domain.append(owner.identity, p.id, input, 'verified-discovery');
    const v = await domain.valuation(owner.identity, p.id);
    expect(v).toMatchObject({
      complete: false,
      totalValue: null,
      totalBaseCost: '201',
      holdings: [{ instrumentId: 'INFY:NSE', quantity: '2', baseCost: '201', quote: null }],
    });
    const count = await domain.models.Economic.countDocuments();
    for (const [index, instrumentId] of ['INFY.NS', 'UNKNOWN:NSE', 'INFY'].entries())
      await expect(
        domain.append(owner.identity, p.id, { ...input, instrumentId }, 'raw-discovery-' + index),
      ).rejects.toMatchObject({ status: 404 });
    await expect(
      domain.append(outsider.identity, p.id, input, 'idor-discovery'),
    ).rejects.toMatchObject({ status: 404 });
    expect(await domain.models.Economic.countDocuments()).toBe(count);
    const app = createApp(
      env,
      { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
      createLogger('silent'),
      undefined,
      { service: auth, domain, cache: new MemoryCache() },
    );
    expect((await request(app).get('/api/v1/instruments/search?q=INFY')).status).toBe(401);
    const get = (q: string) =>
      request(app)
        .get('/api/v1/instruments/search?' + q)
        .set('Authorization', 'Bearer ' + owner.login.response.accessToken);
    const response = await get('q=INFY&limit=1');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ truncated: true, instruments: [{ id: 'INFY:BSE' }] });
    expect(
      response.body.providers.every(
        (x: { status: string }) => x.status === 'capability-unavailable',
      ),
    ).toBe(true);
    for (const query of ['limit=31', 'q[]=INFY', 'q=INFY&userId=other'])
      expect((await get(query)).status).toBe(400);
    for (let n = 0; n < 56; n++) expect((await get('q=INFY')).status).toBe(200);
    expect((await get('q=INFY')).status).toBe(429);
  });
  it('rejects an actual connection override into nonfixture storage before initialization', async () => {
    const invalid = new AuthService(
      connection,
      { ...env, MONGODB_URI: 'mongodb://localhost/folio_local_fixture' },
      new PasswordAuthProvider(),
      { send: async () => {} },
    );
    await expect(invalid.initialize()).rejects.toThrow('connection');
  });
  it('registers/verifies/writes every type and hand-checks FIFO, FX, values and degraded scenarios', async () => {
    const { identity, login } = await account('complete');
    expect(login.response.user.localFixture).toBe(true);
    expect(login.response.user.demoReadonly).toBeUndefined();
    const portfolio = await domain.createDefault(identity);
    const common = {
      instrumentId: 'TCS:NSE',
      effectiveAt: '2026-01-05T15:00:00.000Z',
      tradingDate: '2026-01-05',
    };
    const inputs: TransactionInput[] = [
      { ...common, type: 'BUY', quantity: '10', price: '100', fees: '10' },
      { ...common, type: 'BUY', quantity: '5', price: '120', fees: '5' },
      { ...common, type: 'SELL', quantity: '12', price: '150', fees: '12' },
      { ...common, type: 'SPLIT', numerator: '2', denominator: '1' },
      { ...common, type: 'DIVIDEND', grossAmount: '30', fees: '2' },
      { ...common, instrumentId: 'AAPL:US', type: 'BUY', quantity: '10', price: '100', fees: '0' },
    ];
    for (const [index, input] of inputs.entries())
      await domain.append(identity, portfolio.id, input, 'local-test-' + index);
    const value = await domain.valuation(identity, portfolio.id);
    expect(value).toMatchObject({
      status: 'fresh',
      complete: true,
      totalValue: '97220',
      totalBaseCost: '83363',
      unrealizedBase: '13857',
      realizedBase: '536',
      dividendBase: '28',
      movementBase: '1772',
      coverage: { valued: 2, total: 2 },
    });
    expect(value.holdings.find((h) => h.instrumentId === 'TCS:NSE')).toMatchObject({
      quantity: '6',
      localCost: '363',
      baseCost: '363',
      averageCost: '60.5',
      baseValue: '420',
      unrealizedBase: '57',
      lots: [{ quantity: '6', localCost: '363', baseCost: '363' }],
    });
    expect(value.holdings.find((h) => h.instrumentId === 'AAPL:US')).toMatchObject({
      quantity: '10',
      baseCost: '83000',
      baseValue: '96800',
      unrealizedBase: '13800',
      priceContribution: '8300',
      fxContribution: '5500',
      fx: { rate: '88', source: 'local-fixture' },
    });
    const ledger = await domain.ledger(identity, portfolio.id, 1, 25);
    expect(ledger.items.find((r) => r.record.instrumentId === 'AAPL:US')!.record.fx).toMatchObject({
      rate: '83',
      rateDate: '2026-01-05',
      source: 'local-fixture',
    });
    await domain.append(
      identity,
      portfolio.id,
      {
        ...common,
        instrumentId: 'ETH:CRYPTO',
        type: 'BUY',
        quantity: '0.125',
        price: '2400',
        fees: '1',
      },
      'stale-test',
    );
    expect(await domain.valuation(identity, portfolio.id)).toMatchObject({
      status: 'stale',
      complete: true,
      totalValue: '125820',
      totalBaseCost: '108346',
      unrealizedBase: '17474',
    });
    await domain.append(
      identity,
      portfolio.id,
      {
        ...common,
        instrumentId: 'RELIANCE:BSE',
        type: 'BUY',
        quantity: '1',
        price: '100',
        fees: '0',
      },
      'missing-test',
    );
    const partial = await domain.valuation(identity, portfolio.id);
    expect(partial).toMatchObject({
      status: 'partial',
      complete: false,
      knownValuedSubtotal: '125820',
      totalValue: null,
      unrealizedBase: null,
      allocation: null,
      concentration: null,
      coverage: { valued: 3, total: 4 },
    });
    expect(partial.holdings.every((h) => h.weight === null)).toBe(true);
    const other = await account('missing');
    const empty = await domain.createDefault(other.identity);
    await domain.append(
      other.identity,
      empty.id,
      {
        ...common,
        instrumentId: 'RELIANCE:BSE',
        type: 'BUY',
        quantity: '1',
        price: '100',
        fees: '0',
      },
      'missing-only',
    );
    expect(await domain.valuation(other.identity, empty.id)).toMatchObject({
      knownValuedSubtotal: '0',
      totalValue: null,
      coverage: { valued: 0, total: 1 },
    });
    await expect(domain.valuation(other.identity, portfolio.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      domain.append(other.identity, portfolio.id, inputs[0], 'wrong-owner'),
    ).rejects.toMatchObject({ status: 404 });
    const count = await domain.models.Economic.countDocuments();
    await expect(
      domain.append(
        identity,
        portfolio.id,
        { ...inputs[5]!, tradingDate: '2026-01-06', effectiveAt: '2026-01-06T15:00:00.000Z' },
        'no-backfill',
      ),
    ).rejects.toMatchObject({ code: 'HISTORICAL_FX_UNAVAILABLE' });
    expect(await domain.models.Economic.countDocuments()).toBe(count);
  });
  it('keeps fixture cookies separate, protects sessions/CSRF and documents the local-only contract', async () => {
    const app = createApp(
      env,
      { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
      createLogger('silent'),
      undefined,
      { service: auth, domain, cache: new MemoryCache() },
    );
    expect((await request(app).get('/api/v1/auth/local-fixture')).body).toEqual({ enabled: true });
    expect((await request(app).get('/api/v1/auth/local-fixture?q=1')).status).toBe(400);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.WEB_ORIGIN)
      .set('X-Folio-CSRF', '1')
      .send({ email: 'complete@example.test', password });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(cookie).toMatch(/^folio_fixture_refresh=/);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', env.WEB_ORIGIN)
          .set('X-Folio-CSRF', '1')
          .set('Cookie', cookie.replace('folio_fixture_refresh', 'folio_refresh'))
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', env.WEB_ORIGIN)
          .set('X-Folio-CSRF', '1')
          .set('Cookie', cookie)
          .send({})
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/v1/portfolios/default')
          .set('Authorization', 'Bearer ' + login.body.accessToken)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/demo')
          .set('Origin', env.WEB_ORIGIN)
          .set('X-Folio-CSRF', '1')
          .send({})
      ).status,
    ).toBe(404);
    const document = (await request(app).get('/api/openapi.json')).body;
    expect(document.paths['/api/v1/auth/local-fixture'].get.responses['200']).toBeDefined();
    expect(document.components.securitySchemes.fixtureRefreshCookie.name).toBe(
      'folio_fixture_refresh',
    );
  });
});
