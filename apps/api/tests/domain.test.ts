import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { HoldingsQuery, domainContracts, TransactionInput } from '@folio/shared';
import type { Instrument } from '@folio/shared';
import { AuthService } from '../src/services/auth.ts';
import type { Identity } from '../src/services/auth.ts';
import { DomainService } from '../src/services/domain.ts';
import { PasswordAuthProvider } from '../src/providers/password-auth.ts';
import type { MarketGateway } from '../src/providers/market.ts';
import { MemoryCache } from '../src/services/cache.ts';
import { createApp } from '../src/app.ts';
import { createLogger } from '../src/config/logger.ts';
import { parseEnv } from '../src/config/env.ts';
const env = parseEnv({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost/folio_domain_test',
  REDIS_URL: 'redis://localhost',
  WEB_ORIGIN: 'http://localhost:5173',
});
const master: Instrument[] = [
  {
    id: 'TEST:NSE',
    symbol: 'TEST',
    name: 'Test fixture only',
    currency: 'INR',
    exchange: 'NSE',
    assetClass: 'equity',
    sector: 'Unknown',
    provider: 'yahoo',
    providerId: 'TEST.NS',
    metadataSource: 'integration test fixture',
  },
  {
    id: 'TEST:US',
    symbol: 'FOREIGN',
    name: 'Foreign test fixture',
    currency: 'USD',
    exchange: 'US',
    assetClass: 'etf',
    sector: 'Unknown',
    provider: 'yahoo',
    providerId: 'TEST',
    metadataSource: 'integration test fixture',
  },
];
const fx = {
  rate: '83',
  rateDate: '2026-01-05',
  source: 'Frankfurter/ECB' as const,
  reference: 'explicit integration-test rate fixture',
};
const market: MarketGateway = {
  quotes: async (instruments) =>
    instruments.map((i) => ({
      instrumentId: i.id,
      currency: i.currency,
      price: '70',
      referencePrice: '68',
      referencePeriod: 'previous-close',
      source: 'integration-test quote',
      asOf: '2026-01-06T10:00:00.000Z',
      status: 'fresh',
      fixture: false,
    })),
  rates: async (currencies) =>
    Object.fromEntries(
      currencies.map((currency) => [
        currency,
        {
          ...fx,
          rate: currency === 'INR' ? '1' : '88',
          source: currency === 'INR' ? 'identity' : 'Frankfurter/ECB',
          asOf: '2026-01-05T00:00:00.000Z',
          status: 'fresh',
        },
      ]),
    ),
  historicalFx: async () => fx,
  history: async () => ({
    status: 'unavailable',
    reason: 'History fixture intentionally unavailable',
    label: 'Observed split-adjusted price history',
    points: [],
    source: null,
    fixture: false,
  }),
};
let repl: MongoMemoryReplSet | undefined,
  connection: mongoose.Connection,
  auth: AuthService,
  domain: DomainService,
  app: Express,
  passwordHash: string;
const password = 'Long integration test passphrase!';
beforeAll(async () => {
  const supplied = process.env['FOLIO_TEST_MONGODB_URI'];
  if (!supplied)
    repl = await MongoMemoryReplSet.create({
      binary: { version: '8.2.12' },
      replSet: { count: 1 },
    });
  connection = await mongoose
    .createConnection(supplied ?? repl!.getUri(), {
      dbName: 'folio_domain_test_' + randomBytes(8).toString('hex'),
    })
    .asPromise();
  passwordHash = await new PasswordAuthProvider().hash(password);
}, 180000);
beforeEach(async () => {
  auth = new AuthService(connection, env, new PasswordAuthProvider(), { send: async () => {} });
  await auth.initialize();
  domain = new DomainService(auth, market);
  await domain.initialize(master);
  for (const model of Object.values(auth.models)) await model.deleteMany({});
  for (const model of [domain.models.Portfolio, domain.models.Projection])
    await model.deleteMany({});
  await domain.models.Economic.collection.deleteMany({});
  await domain.models.Void.collection.deleteMany({});
  app = createApp(
    env,
    { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
    createLogger('silent'),
    undefined,
    { service: auth, cache: new MemoryCache(), domain },
  );
});
afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
  await repl?.stop();
});
async function user(name = 'Alice') {
  const row = await auth.models.User.create({
    name,
    email: name.toLowerCase() + '@example.test',
    passwordHash,
    emailVerifiedAt: new Date(),
  });
  const login = await auth.login(
    { email: row.email, password },
    { ip: 'test', userAgent: 'integration-test' },
  );
  const identity = await auth.authenticate(login.response.accessToken);
  const portfolio = await domain.createDefault(identity);
  return { identity, portfolio, token: login.response.accessToken };
}
const buy = (quantity = '10', price = '100', fees = '10') => ({
  type: 'BUY',
  instrumentId: 'TEST:NSE',
  effectiveAt: '2026-01-05T10:00:00.000Z',
  tradingDate: '2026-01-05',
  quantity,
  price,
  fees,
});
const key = () => randomBytes(12).toString('hex');
function api(
  method: 'post' | 'get' | 'delete' | 'patch',
  path: string,
  token: string,
  body: unknown = {},
) {
  const test = request(app)
    [method]('/api/v1' + path)
    .set('Authorization', 'Bearer ' + token);
  if (method === 'get') return test;
  return test
    .set('Origin', env.WEB_ORIGIN)
    .set('X-Folio-CSRF', '1')
    .set('Idempotency-Key', key())
    .send(body);
}
async function recorded(
  identity: Identity,
  portfolioId: string,
  input: unknown = buy(),
  requestKey = key(),
) {
  return domain.append(identity, portfolioId, input, requestKey);
}
describe('owned atomic append-only portfolio domain', () => {
  it('creates only the default portfolio idempotently and locks currency on the first economic record', async () => {
    const a = await user();
    expect((await domain.createDefault(a.identity)).id).toBe(a.portfolio.id);
    expect((await domain.portfolios(a.identity))[0]?.currencyLockedAt).toBeNull();
    const append = await api('post', `/portfolios/${a.portfolio.id}/ledger`, a.token, buy());
    expect(append.status).toBe(200);
    expect(append.body.record.fx).toMatchObject({ rate: '1', source: 'identity' });
    expect((await domain.portfolios(a.identity))[0]).toMatchObject({ revision: 1 });
    expect((await domain.portfolios(a.identity))[0]?.currencyLockedAt).not.toBeNull();
    const stored = await domain.models.Economic.findById(append.body.record.id);
    expect(stored?.quantity?._bsontype).toBe('Decimal128');
    expect((await domain.models.Projection.findOne())?.quantity.toString()).toBe('10');
  });
  it('matches the entire hand-computed financial fixture through real Mongo and API contracts', async () => {
    const a = await user();
    const id = a.portfolio.id;
    for (const input of [
      buy(),
      buy('5', '120', '5'),
      { ...buy('12', '150', '12'), type: 'SELL' },
      {
        type: 'SPLIT',
        instrumentId: 'TEST:NSE',
        effectiveAt: '2026-01-05T10:00:00.000Z',
        tradingDate: '2026-01-05',
        numerator: '2',
        denominator: '1',
      },
      {
        type: 'DIVIDEND',
        instrumentId: 'TEST:NSE',
        effectiveAt: '2026-01-05T10:00:00.000Z',
        tradingDate: '2026-01-05',
        grossAmount: '30',
        fees: '2',
      },
    ])
      await recorded(a.identity, id, input);
    const value = await api('get', `/portfolios/${id}/valuation`, a.token);
    expect(value.status).toBe(200);
    expect(value.body).toMatchObject({
      totalValue: '420',
      totalBaseCost: '363',
      unrealizedBase: '57',
      realizedBase: '536',
      dividendBase: '28',
    });
    expect(value.body.holdings[0]).toMatchObject({ quantity: '6', averageCost: '60.5' });
    const page = await api('get', `/portfolios/${id}/ledger?page=1&pageSize=2&order=asc`, a.token);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 2, total: 5 });
    expect(page.body.items[0].nativeCashFlow).toBe('-1010');
    const splitRecord = (await domain.ledger(a.identity, id, 1, 25)).items.find(
      (r) => r.record.type === 'SPLIT',
    )!.record.id;
    expect((await domain.void(a.identity, id, splitRecord, 'Correct split ratio')).duplicate).toBe(
      false,
    );
    expect(
      (await domain.void(a.identity, id, splitRecord, 'Second reason does not rewrite the first'))
        .duplicate,
    ).toBe(true);
    expect((await domain.valuation(a.identity, id)).holdings[0]?.quantity).toBe('3');
  });
  it('rejects IDOR on portfolio, ledger, void, valuation, holdings, detail and history; search/export remain owned', async () => {
    const a = await user();
    const b = await user('Bob');
    const tx = await recorded(a.identity, a.portfolio.id);
    for (const suffix of [
      'ledger',
      'valuation',
      'holdings',
      'holdings/TEST:NSE',
      'instruments/TEST:NSE/history',
    ])
      expect((await api('get', `/portfolios/${a.portfolio.id}/${suffix}`, b.token)).status).toBe(
        404,
      );
    expect((await api('post', `/portfolios/${a.portfolio.id}/ledger`, b.token, buy())).status).toBe(
      404,
    );
    expect(
      (
        await api('post', `/portfolios/${b.portfolio.id}/ledger/${tx.record.id}/void`, b.token, {
          reason: 'Not mine',
        })
      ).status,
    ).toBe(404);
    expect((await api('get', '/search?q=TEST', b.token)).body.ledger).toEqual([]);
    expect((await api('get', '/search?q=' + tx.record.id, a.token)).body.ledger).toHaveLength(1);
    expect((await auth.exportAccount(b.identity)).domain?.ledger).toEqual([]);
    expect((await api('get', '/portfolios/not-an-id/ledger', a.token)).status).toBe(404);
    expect(
      (await api('get', `/portfolios/${a.portfolio.id}/holdings/MISSING`, a.token)).status,
    ).toBe(404);
  });
  it('enforces matching idempotency and conflicts without duplicated sequence/cost', async () => {
    const a = await user();
    const requestKey = key();
    const results = await Promise.all([
      recorded(a.identity, a.portfolio.id, buy(), requestKey),
      recorded(a.identity, a.portfolio.id, buy(), requestKey),
    ]);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(results[0]?.record.id).toBe(results[1]?.record.id);
    await expect(recorded(a.identity, a.portfolio.id, buy('11'), requestKey)).rejects.toMatchObject(
      { status: 409, code: 'IDEMPOTENCY_CONFLICT' },
    );
    expect(await domain.models.Economic.countDocuments()).toBe(1);
    expect((await domain.portfolios(a.identity))[0]?.revision).toBe(1);
    expect((await recorded(a.identity, a.portfolio.id, buy(), requestKey)).duplicate).toBe(true);
  });
  it('serializes concurrent oversells atomically and rolls back sequence/projection', async () => {
    const a = await user();
    await recorded(a.identity, a.portfolio.id, buy('10', '100', '0'));
    const sale = { ...buy('7', '150', '1'), type: 'SELL' };
    const outcomes = await Promise.allSettled([
      recorded(a.identity, a.portfolio.id, sale),
      recorded(a.identity, a.portfolio.id, sale),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'OVERSELL' },
    });
    expect(await domain.models.Economic.countDocuments()).toBe(2);
    expect((await domain.valuation(a.identity, a.portfolio.id)).holdings[0]?.quantity).toBe('3');
    expect((await domain.models.Portfolio.findById(a.portfolio.id))?.nextSequence).toBe(2);
  });
  it('rejects backdating and voids that cause any later oversell and permits replacement after void', async () => {
    const a = await user();
    const first = await recorded(a.identity, a.portfolio.id);
    const sale = await recorded(a.identity, a.portfolio.id, {
      ...buy('10', '150', '0'),
      type: 'SELL',
      effectiveAt: '2026-01-06T10:00:00.000Z',
      tradingDate: '2026-01-06',
    });
    await expect(
      domain.void(a.identity, a.portfolio.id, first.record.id, 'Incorrect purchase'),
    ).rejects.toMatchObject({ code: 'OVERSELL' });
    await expect(
      recorded(a.identity, a.portfolio.id, {
        ...buy('1', '100', '0'),
        type: 'SELL',
        effectiveAt: '2026-01-04T10:00:00.000Z',
        tradingDate: '2026-01-04',
      }),
    ).rejects.toMatchObject({ code: 'OVERSELL' });
    expect(await domain.models.Void.countDocuments()).toBe(0);
    await domain.void(a.identity, a.portfolio.id, sale.record.id, 'Incorrect sale');
    await recorded(a.identity, a.portfolio.id, {
      ...buy('10', '150', '0'),
      type: 'SELL',
      effectiveAt: '2026-01-06T11:00:00.000Z',
      tradingDate: '2026-01-06',
    });
    expect((await domain.ledger(a.identity, a.portfolio.id, 1, 25)).items).toHaveLength(3);
    expect((await auth.exportAccount(a.identity)).domain?.ledger).toHaveLength(3);
    const immutable = await domain.models.Economic.findById(first.record.id);
    await expect(
      domain.models.Economic.updateOne({ _id: first.record.id }, { $set: { quantity: '99' } }),
    ).rejects.toThrow('append-only');
    immutable!.fees = new mongoose.Types.Decimal128('999');
    await expect(immutable!.save()).rejects.toThrow(/immutable|append-only/);
    await expect(domain.models.Void.deleteMany({})).rejects.toThrow('append-only');
  });
  it('persists actual historical FX provenance and supports explicit missing-FX overrides', async () => {
    const a = await user();
    const foreign = { ...buy('10', '100', '0'), instrumentId: 'TEST:US' };
    const tx = await recorded(a.identity, a.portfolio.id, foreign);
    expect(tx.record.fx).toEqual(fx);
    const absent = new DomainService(auth, { ...market, historicalFx: async () => null });
    await expect(absent.append(a.identity, a.portfolio.id, foreign, key())).rejects.toMatchObject({
      code: 'HISTORICAL_FX_UNAVAILABLE',
    });
    const override = {
      ...foreign,
      historicalFxOverride: {
        rate: '82.5',
        rateDate: '2026-01-02',
        source: 'manual',
        reference: 'Bank conversion receipt 2026-01-02',
      },
    };
    expect(
      (await absent.append(a.identity, a.portfolio.id, override, key())).record.fx,
    ).toMatchObject({ rate: '82.5', source: 'manual', rateDate: '2026-01-02' });
    await expect(
      recorded(a.identity, a.portfolio.id, {
        ...foreign,
        historicalFxOverride: { ...override.historicalFxOverride, rateDate: '2026-01-06' },
      }),
    ).rejects.toMatchObject({ code: 'FUTURE_FX' });
    const value = await domain.valuation(a.identity, a.portfolio.id);
    expect(value.holdings[0]?.baseCost).toBe('165500');
  });
  it('keeps private domain data in export and removes it atomically with account deletion', async () => {
    const a = await user();
    const b = await user('Bob');
    const tx = await recorded(a.identity, a.portfolio.id);
    await domain.void(a.identity, a.portfolio.id, tx.record.id, 'Wrong trade');
    await recorded(b.identity, b.portfolio.id);
    const exported = await auth.exportAccount(a.identity);
    expect(exported.domain?.ledger[0]).toMatchObject({
      nativeCashFlow: '-1010',
      void: { reason: 'Wrong trade' },
    });
    await auth.deleteAccount(a.identity, password, { ip: 'test', userAgent: 'test' });
    for (const model of [
      domain.models.Economic,
      domain.models.Void,
      domain.models.Portfolio,
      domain.models.Projection,
    ])
      expect(await model.countDocuments({ userId: a.identity.user._id })).toBe(0);
    expect(await domain.models.Economic.countDocuments({ userId: b.identity.user._id })).toBe(1);
    await expect(recorded(a.identity, a.portfolio.id)).rejects.toMatchObject({ status: 404 });
  });
  it('serializes account deletion against concurrent financial writes without orphaned data', async () => {
    const a = await user();
    await Promise.allSettled([
      recorded(a.identity, a.portfolio.id),
      auth.deleteAccount(a.identity, password, { ip: 'test', userAgent: 'test' }),
    ]);
    expect(await auth.models.User.countDocuments({ _id: a.identity.user._id })).toBe(0);
    expect(await domain.models.Economic.countDocuments({ userId: a.identity.user._id })).toBe(0);
    expect(await domain.models.Portfolio.countDocuments({ userId: a.identity.user._id })).toBe(0);
  });
  it('supports deterministic holdings filters/search/sort/pagination and explicit unavailable history', async () => {
    const a = await user();
    await recorded(a.identity, a.portfolio.id);
    await recorded(a.identity, a.portfolio.id, {
      ...buy('2', '100', '0'),
      instrumentId: 'TEST:US',
    });
    const page = await domain.holdings(
      a.identity,
      a.portfolio.id,
      HoldingsQuery.parse({ sort: 'baseValue', order: 'desc', pageSize: 1 }),
    );
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(page.items[0]?.instrumentId).toBe('TEST:US');
    expect(
      (
        await domain.holdings(
          a.identity,
          a.portfolio.id,
          HoldingsQuery.parse({ q: 'TEST', assetClass: 'equity', sector: 'Unknown' }),
        )
      ).total,
    ).toBe(1);
    expect(
      (await api('get', `/portfolios/${a.portfolio.id}/ledger?type=BUY&q=2026&pageSize=1`, a.token))
        .body.total,
    ).toBe(2);
    expect(
      (await api('get', `/portfolios/${a.portfolio.id}/instruments/TEST:US/history`, a.token)).body
        .status,
    ).toBe('unavailable');
    expect((await api('get', '/instruments?q=%5B', a.token)).status).toBe(200);
    expect(await domain.instruments('TEST')).toHaveLength(2);
    expect((await domain.ledger(a.identity, a.portfolio.id, 1, 25, 'missing')).total).toBe(0);
  });
  it('rejects unsupported/invalid fields, dates, precision and unauthenticated or untrusted requests', async () => {
    const a = await user();
    for (const body of [
      { ...buy(), accountId: 'fake' },
      { ...buy(), quantity: 1 },
      { ...buy(), quantity: '1e-18' },
      { ...buy(), effectiveAt: '2027-01-05T10:00:00.000Z', tradingDate: '2027-01-05' },
      { ...buy(), tradingDate: '2026-01-04' },
      { ...buy(), instrumentId: 'UNVERIFIED' },
      {
        ...buy(),
        historicalFxOverride: {
          rate: '83',
          rateDate: '2026-01-05',
          source: 'manual',
          reference: 'Invalid identity-currency FX override',
        },
      },
    ])
      expect(
        (await api('post', `/portfolios/${a.portfolio.id}/ledger`, a.token, body)).status,
      ).toBeGreaterThanOrEqual(400);
    expect(
      (await api('get', `/portfolios/${a.portfolio.id}/ledger?pageSize=101`, a.token)).status,
    ).toBe(400);
    expect((await api('get', '/search?q=a', a.token)).status).toBe(400);
    expect((await request(app).get('/api/v1/portfolios')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/portfolios/default')
          .set('Authorization', 'Bearer ' + a.token)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/portfolios/default')
          .set('Authorization', 'Bearer ' + a.token)
          .set('Origin', env.WEB_ORIGIN)
          .set('X-Folio-CSRF', '1')
          .send('text')
      ).status,
    ).toBe(415);
    await expect(recorded(a.identity, a.portfolio.id, buy(), 'short')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_REQUIRED',
    });
    await expect(domain.void(a.identity, a.portfolio.id, key(), 'a')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(TransactionInput.safeParse({ ...buy(), fees: '-1' }).success).toBe(false);
  });
  it('keeps server-side search limits fail-closed and verifies OpenAPI ownership/security contracts', async () => {
    const a = await user();
    for (let i = 0; i < 60; i++)
      expect((await api('get', '/search?q=TEST', a.token)).status).toBe(200);
    const limited = await api('get', '/SEARCH/?q=TEST', a.token);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    const broken = createApp(
      env,
      { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
      createLogger('silent'),
      undefined,
      {
        service: auth,
        domain,
        cache: {
          increment: async () => {
            throw new Error('Redis unavailable');
          },
        },
      },
    );
    expect(
      (
        await request(broken)
          .get('/api/v1/search?q=TEST')
          .set('Authorization', 'Bearer ' + a.token)
      ).status,
    ).toBe(503);
    const document = (await request(app).get('/api/openapi.json')).body;
    for (const contract of domainContracts)
      expect(document.paths[contract.path][contract.method].security).toEqual([{ bearerAuth: [] }]);
    expect(
      document.paths['/api/v1/portfolios/{portfolioId}/ledger'].post.parameters.some(
        (p: { name: string }) => p.name === 'Idempotency-Key',
      ),
    ).toBe(true);
  });
});
