import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { AssetDetailQuery, AssetDetailResponse } from '@folio/shared';
import type { FxProvenance, TransactionInput, Instrument } from '@folio/shared';
import { parseEnv } from '../src/config/env.ts';
import { AuthService } from '../src/services/auth.ts';
import type { Identity } from '../src/services/auth.ts';
import { DomainService } from '../src/services/domain.ts';
import { PasswordAuthProvider } from '../src/providers/password-auth.ts';
import { instrumentMaster } from '../src/models/instrument-master.ts';
import { createApp } from '../src/app.ts';
import { createLogger } from '../src/config/logger.ts';
import { MemoryCache } from '../src/services/cache.ts';
import type { MarketGateway } from '../src/providers/market.ts';
const date = '2026-10-06T10:00:00.000Z';
let instant = new Date(date);
const clock = () => new Date(instant);
const initialFx: FxProvenance = {
  rate: '83',
  rateDate: '2026-01-02',
  source: 'local-fixture',
  reference: 'Explicit synthetic historical test observation; not live FX',
};
let observed: unknown = initialFx,
  stale = false;
const historical = vi.fn(async () => observed as FxProvenance | null);
let availability: 'complete' | 'missing' | 'stale' | 'partial' | 'no-fx' = 'complete';
const quotes = vi.fn(async (instruments: Instrument[]) =>
  instruments
    .filter(
      (i) => availability !== 'missing' && !(availability === 'partial' && i.id === 'AAPL:US'),
    )
    .map((i) => ({
      instrumentId: i.id,
      currency: i.currency,
      price: '70',
      referencePrice: '68',
      referencePeriod: 'previous-close' as const,
      source: 'Explicit isolated asset unit fixture',
      asOf: date,
      status: availability === 'stale' ? ('stale' as const) : ('fresh' as const),
      fixture: true,
    })),
);
const rates = vi.fn(async (currencies: string[]) =>
  availability === 'no-fx'
    ? {}
    : Object.fromEntries(
        currencies.map((c) => [
          c,
          {
            ...initialFx,
            rate: c === 'INR' ? '1' : '88',
            source: c === 'INR' ? ('identity' as const) : ('local-fixture' as const),
            asOf: date,
            status: 'fresh' as const,
          },
        ]),
      ),
);
const market: MarketGateway = {
  quotes,
  rates,
  historicalFx: historical,
  historicalFxForCommit: async () => (observed ? { fx: observed as FxProvenance, stale } : null),
  history: async () => ({
    status: 'unavailable',
    reason: 'Test only',
    label: 'No test history',
    points: [],
    source: null,
    fixture: true,
  }),
};
const buy: TransactionInput = {
  instrumentId: 'TCS:NSE',
  type: 'BUY',
  quantity: '10',
  price: '100',
  fees: '10',
  effectiveAt: '2026-01-05T15:00:00.000Z',
  tradingDate: '2026-01-05',
};
const foreign: TransactionInput = { ...buy, instrumentId: 'AAPL:US', fees: '0' };
const password = 'A long private preview test passphrase!';
let repl: MongoMemoryReplSet | undefined,
  connection: mongoose.Connection,
  auth: AuthService,
  domain: DomainService,
  passwordHash: string;
const database = 'folio_local_fixture_test_' + randomBytes(8).toString('hex');
const env = parseEnv({
  NODE_ENV: 'test',
  LOCAL_FIXTURE_MODE: 'true',
  CACHE_NAMESPACE: 'folio:local-fixture',
  MONGODB_URI: 'mongodb://127.0.0.1/' + database,
  REDIS_URL: 'redis://127.0.0.1/1',
  WEB_ORIGIN: 'http://localhost:5190',
});
beforeAll(async () => {
  const uri = process.env['FOLIO_TEST_MONGODB_URI'];
  if (!uri) repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  connection = await mongoose
    .createConnection(uri ?? repl!.getUri(), { dbName: database })
    .asPromise();
  const passwords = new PasswordAuthProvider();
  auth = new AuthService(connection, env, passwords, { send: async () => {} }, clock);
  await auth.initialize();
  passwordHash = await passwords.hash(password);
  domain = new DomainService(auth, market, clock);
  await domain.initialize(instrumentMaster);
});
beforeEach(async () => {
  instant = new Date(date);
  observed = initialFx;
  stale = false;
  availability = 'complete';
  rates.mockClear();
  quotes.mockClear();
  historical.mockClear();
  for (const model of Object.values(auth.models)) await model.deleteMany({});
  await domain.models.Economic.collection.deleteMany({});
  await domain.models.Void.collection.deleteMany({});
  await domain.models.Portfolio.deleteMany({});
  await domain.models.Projection.deleteMany({});
});
afterAll(async () => {
  await connection?.dropDatabase();
  await connection?.close();
  await repl?.stop();
});
async function user(name = 'Alice') {
  const row = await auth.models.User.create({
    name,
    email: name.toLowerCase() + '@example.test',
    passwordHash,
    emailVerifiedAt: clock(),
  });
  const login = await auth.login({ email: row.email, password }, { ip: 'test', userAgent: 'test' });
  const identity = await auth.authenticate(login.response.accessToken),
    portfolio = await domain.createDefault(identity);
  return { identity, portfolio, token: login.response.accessToken };
}
async function snapshot() {
  const data: unknown[] = [];
  for (const model of [...Object.values(auth.models), ...Object.values(domain.models)])
    data.push(await model.find().sort({ _id: 1 }).lean());
  return JSON.stringify(data);
}
const newApp = () =>
  createApp(
    env,
    { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
    createLogger('silent'),
    undefined,
    { service: auth, domain, cache: new MemoryCache() },
  );

const defaults = () => AssetDetailQuery.parse({});
async function book(identity: Identity, id: string, input: TransactionInput = buy) {
  return (await domain.append(identity, id, input, 'asset-' + randomBytes(8).toString('hex')))
    .record;
}
describe('owned asset detail from existing engine and immutable activity', () => {
  it('returns canonical empty state without leaking another owner or calling providers', async () => {
    const a = await user(),
      b = await user('Bob');
    await book(b.identity, b.portfolio.id);
    quotes.mockClear();
    rates.mockClear();
    const before = await snapshot(),
      detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(AssetDetailResponse.safeParse(detail).success).toBe(true);
    expect(detail).toMatchObject({
      position: null,
      holding: null,
      lots: { total: 0, items: [] },
      activity: { total: 0, items: [] },
      valuation: { status: 'empty', coverage: { valued: 0, total: 0 } },
    });
    expect(quotes).not.toHaveBeenCalled();
    expect(rates).not.toHaveBeenCalled();
    expect(await snapshot()).toBe(before);
  });
  it('joins exact original BUY dates/fees/FX with server FIFO costs, using a fixed query budget', async () => {
    const a = await user();
    const first = await book(a.identity, a.portfolio.id);
    const second = await book(a.identity, a.portfolio.id, {
      ...buy,
      quantity: '5',
      price: '200',
      fees: '5',
    });
    const spies = [
      vi.spyOn(domain.models.Portfolio, 'findOne'),
      vi.spyOn(domain.models.Economic, 'find'),
      vi.spyOn(domain.models.Void, 'find'),
      vi.spyOn(domain.models.Instrument, 'find'),
    ];
    quotes.mockClear();
    rates.mockClear();
    try {
      const detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
      expect(detail.position).toMatchObject({
        quantity: '15',
        localCost: '2015',
        baseCost: '2015',
      });
      expect(detail.lots.items).toMatchObject([
        {
          transactionId: first.id,
          quantity: '10',
          localCost: '1010',
          acquisition: {
            effectiveAt: buy.effectiveAt,
            fees: '10',
            fx: { rate: '1', source: 'identity' },
          },
        },
        {
          transactionId: second.id,
          quantity: '5',
          localCost: '1005',
          acquisition: { quantity: '5', price: '200' },
        },
      ]);
      expect(detail.activity.items.map((r) => r.record.id)).toEqual([second.id, first.id]);
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
      expect(quotes).toHaveBeenCalledTimes(1);
      expect(rates).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(detail)).not.toContain('userId');
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
  it('renders partial FIFO consumption, split-adjusted units and dividends without changing acquisition inputs', async () => {
    const a = await user();
    await book(a.identity, a.portfolio.id);
    const second = await book(a.identity, a.portfolio.id, {
      ...buy,
      quantity: '5',
      price: '200',
      fees: '5',
    });
    await book(a.identity, a.portfolio.id, {
      ...buy,
      type: 'SELL',
      quantity: '12',
      price: '250',
      fees: '2',
    });
    let detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(detail.position).toMatchObject({
      quantity: '3',
      localCost: '603',
      realizedLocal: '1586',
      averageCost: '201',
    });
    expect(detail.lots.items).toMatchObject([
      { transactionId: second.id, quantity: '3', localCost: '603', baseCost: '603' },
    ]);
    await book(a.identity, a.portfolio.id, {
      instrumentId: buy.instrumentId,
      type: 'SPLIT',
      effectiveAt: buy.effectiveAt,
      tradingDate: buy.tradingDate,
      numerator: '2',
      denominator: '1',
    });
    await book(a.identity, a.portfolio.id, {
      instrumentId: buy.instrumentId,
      type: 'DIVIDEND',
      effectiveAt: buy.effectiveAt,
      tradingDate: buy.tradingDate,
      grossAmount: '30',
      fees: '2',
    });
    detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(detail.position).toMatchObject({
      quantity: '6',
      localCost: '603',
      baseCost: '603',
      averageCost: '100.5',
      dividendLocal: '28',
      dividendBase: '28',
    });
    expect(detail.lots.items[0]).toMatchObject({
      quantity: '6',
      localCost: '603',
      acquisition: { quantity: '5', price: '200', fees: '5' },
    });
    expect(detail.activity.items.map((r) => r.record.type)).toEqual([
      'DIVIDEND',
      'SPLIT',
      'SELL',
      'BUY',
      'BUY',
    ]);
    expect(detail.activity.items.map((r) => r.nativeCashFlow)).toEqual([
      '28',
      '0',
      '2998',
      '-1005',
      '-1010',
    ]);
  });
  it('retains voided originals and original signed cash flows while excluding them from lots', async () => {
    const a = await user(),
      original = await book(a.identity, a.portfolio.id);
    const event = await domain.void(
      a.identity,
      a.portfolio.id,
      original.id,
      'Incorrect acquisition fixture',
    );
    const before = await snapshot(),
      detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(detail.position).toBeNull();
    expect(detail.lots.items).toEqual([]);
    expect(detail.activity.items[0]).toMatchObject({
      record: { id: original.id, type: 'BUY', quantity: '10' },
      nativeCashFlow: '-1010',
      void: { id: event.event.id, reason: 'Incorrect acquisition fixture' },
    });
    expect(await snapshot()).toBe(before);
    expect(await domain.models.Economic.countDocuments()).toBe(1);
  });
  it('keeps closed positions and realized income with no remaining lots', async () => {
    const a = await user();
    await book(a.identity, a.portfolio.id);
    await book(a.identity, a.portfolio.id, {
      ...buy,
      type: 'SELL',
      quantity: '10',
      price: '150',
      fees: '0',
    });
    const detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(detail.position).toMatchObject({
      quantity: '0',
      localCost: '0',
      averageCost: null,
      realizedBase: '490',
    });
    expect(detail.holding).toBeNull();
    expect(detail.lots.total).toBe(0);
    expect(detail.activity.total).toBe(2);
  });
  it('preserves complete/stale/missing/partial and missing-FX values without renormalizing weights', async () => {
    const a = await user();
    await book(a.identity, a.portfolio.id);
    let detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(detail).toMatchObject({
      valuation: { complete: true, status: 'fresh' },
      holding: { baseValue: '700', unrealizedBase: '-310', weight: '1' },
    });
    availability = 'stale';
    detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(detail).toMatchObject({
      valuation: { status: 'stale' },
      holding: { quote: { status: 'stale' }, baseValue: '700' },
    });
    availability = 'missing';
    detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(detail).toMatchObject({
      valuation: { complete: false, status: 'partial', coverage: { valued: 0, total: 1 } },
      holding: { quote: null, baseValue: null, unrealizedBase: null, weight: null },
    });
    await book(a.identity, a.portfolio.id, foreign);
    availability = 'partial';
    detail = await domain.assetDetail(a.identity, a.portfolio.id, 'TCS:NSE', defaults());
    expect(detail).toMatchObject({
      valuation: { complete: false, status: 'partial', coverage: { valued: 1, total: 2 } },
      holding: { baseValue: '700', weight: null },
    });
    availability = 'no-fx';
    detail = await domain.assetDetail(a.identity, a.portfolio.id, 'AAPL:US', defaults());
    expect(detail.holding).toMatchObject({
      fx: null,
      baseValue: null,
      unavailableReason: 'Reference FX is unavailable.',
    });
    expect(detail.lots.items[0]).toMatchObject({
      baseCost: '83000',
      acquisition: { fx: initialFx },
    });
  });
  it('bounds independent pages, stable ties and instrument-only activity with original currencies', async () => {
    const a = await user();
    const first = await book(a.identity, a.portfolio.id),
      second = await book(a.identity, a.portfolio.id),
      third = await book(a.identity, a.portfolio.id);
    await book(a.identity, a.portfolio.id, foreign);
    const detail = await domain.assetDetail(
      a.identity,
      a.portfolio.id,
      'TCS:NSE',
      AssetDetailQuery.parse({ page: 2, pageSize: 1, lotPage: 2, lotPageSize: 1 }),
    );
    expect(detail.lots.total).toBe(3);
    expect(detail.lots.items.map((l) => l.transactionId)).toEqual([second.id]);
    expect(detail.activity.total).toBe(3);
    expect(detail.activity.items.map((r) => r.record.id)).toEqual([second.id]);
    expect(detail.activity.items.every((r) => r.record.instrumentId === 'TCS:NSE')).toBe(true);
    const last = await domain.assetDetail(
      a.identity,
      a.portfolio.id,
      'TCS:NSE',
      AssetDetailQuery.parse({ page: 3, pageSize: 1, lotPage: 3, lotPageSize: 1 }),
    );
    expect(last.lots.items[0]?.transactionId).toBe(third.id);
    expect(last.activity.items[0]?.record.id).toBe(first.id);
    expect(
      (
        await domain.assetDetail(
          a.identity,
          a.portfolio.id,
          'TCS:NSE',
          AssetDetailQuery.parse({ page: 10000, lotPage: 10000 }),
        )
      ).activity.items,
    ).toEqual([]);
  });
  it('enforces auth/IDOR/uniform unknowns, strict bounded queries, no-store and rejects malformed IDs', async () => {
    const a = await user(),
      b = await user('Bob'),
      app = newApp();
    await book(a.identity, a.portfolio.id);
    const path = '/api/v1/portfolios/' + a.portfolio.id + '/instruments/TCS%3ANSE/detail';
    expect((await request(app).get(path)).status).toBe(401);
    const other = await request(app)
      .get(path)
      .set('Authorization', 'Bearer ' + b.token);
    expect(other.status).toBe(404);
    const unknown = await request(app)
      .get(path.replace('TCS%3ANSE', 'UNKNOWN%3ANSE'))
      .set('Authorization', 'Bearer ' + a.token);
    expect(unknown.status).toBe(404);
    expect(other.body.error.code).toBe(unknown.body.error.code);
    for (const q of [
      '?page=0',
      '?pageSize=101',
      '?lotPage=0',
      '?lotPageSize=101',
      '?unexpected=1',
      '?page=1.5',
    ])
      expect(
        (
          await request(app)
            .get(path + q)
            .set('Authorization', 'Bearer ' + a.token)
        ).status,
      ).toBe(400);
    quotes.mockClear();
    rates.mockClear();
    for (const id of ['x'.repeat(101), '\u0001', 'UNKNOWN:NSE'])
      await expect(
        domain.assetDetail(a.identity, a.portfolio.id, id, defaults()),
      ).rejects.toMatchObject({ status: 404 });
    expect(quotes).not.toHaveBeenCalled();
    expect(rates).not.toHaveBeenCalled();
    const response = await request(app)
      .get(path)
      .set('Authorization', 'Bearer ' + a.token);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(AssetDetailResponse.safeParse(response.body).success).toBe(true);
    const emptyOther = await domain.assetDetail(b.identity, b.portfolio.id, 'TCS:NSE', defaults());
    expect(emptyOther.activity.total).toBe(0);
  });
});
