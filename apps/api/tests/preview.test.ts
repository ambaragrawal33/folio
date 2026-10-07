import { randomBytes, createHmac } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import type { FxProvenance, TransactionInput } from '@folio/shared';
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
import { transactionEffects } from '../src/services/transaction-preview.ts';
import {
  signPreview,
  readPreview,
  previewHash,
  previewLifetimeMs,
} from '../src/services/preview-receipt.ts';
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
const quotes = vi.fn(async () => []);
const market: MarketGateway = {
  quotes,
  rates: async () => ({}),
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
describe('owned server preview and atomic confirmation', () => {
  it('resolves exact identity/automatic/override FX and deterministic effects without any domain/user/audit mutation', async () => {
    const a = await user(),
      before = await snapshot();
    const native = await domain.preview(a.identity, a.portfolio.id, buy);
    expect(native).toMatchObject({
      fxMode: 'identity',
      fx: { rate: '1', rateDate: '2026-01-05', source: 'identity' },
      effects: {
        grossNative: '1000',
        feesNative: '10',
        nativeCashFlow: '-1010',
        baseCashFlow: '-1010',
        before: { quantity: '0' },
        after: { quantity: '10', localCost: '1010', baseCost: '1010' },
      },
    });
    expect(await domain.preview(a.identity, a.portfolio.id, buy)).toEqual(native);
    const auto = await domain.preview(a.identity, a.portfolio.id, foreign);
    expect(auto).toMatchObject({
      fxMode: 'automatic',
      fx: initialFx,
      effects: { nativeCashFlow: '-1000', baseCashFlow: '-83000', baseCostChange: '83000' },
    });
    const override = {
      ...foreign,
      historicalFxOverride: {
        rate: '84.1234567890123456789',
        rateDate: '2026-01-01',
        source: 'manual' as const,
        reference: 'Explicit historical statement override',
      },
    };
    observed = null;
    const manual = await domain.preview(a.identity, a.portfolio.id, override);
    expect(manual).toMatchObject({
      fxMode: 'override',
      fx: override.historicalFxOverride,
      effects: { baseCashFlow: '-84123.4567890123456789' },
    });
    expect(await snapshot()).toBe(before);
    expect(quotes).not.toHaveBeenCalled();
    expect(manual).not.toHaveProperty('record');
  });
  it('books the reviewed exact values, preserves immutable/idempotent retry after expiry and rejects receipt reuse for a second booking', async () => {
    const a = await user(),
      preview = await domain.preview(a.identity, a.portfolio.id, foreign);
    const result = await domain.append(
      a.identity,
      a.portfolio.id,
      foreign,
      'reviewed-booking',
      preview.receipt,
    );
    expect(result.record.fx).toEqual(initialFx);
    expect((await domain.valuation(a.identity, a.portfolio.id)).totalBaseCost).toBe('83000');
    const before = await snapshot();
    instant = new Date(instant.getTime() + previewLifetimeMs + 1);
    expect(
      await domain.append(a.identity, a.portfolio.id, foreign, 'reviewed-booking', preview.receipt),
    ).toMatchObject({ duplicate: true, record: { id: result.record.id } });
    await expect(
      domain.append(
        a.identity,
        a.portfolio.id,
        { ...foreign, fees: '1' },
        'reviewed-booking',
        preview.receipt,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      domain.append(a.identity, a.portfolio.id, foreign, 'second-booking', preview.receipt),
    ).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' });
    expect(await snapshot()).toBe(before);
    expect(await auth.models.Audit.countDocuments({ action: 'ledger.recorded' })).toBe(1);
  });
  it('rejects changed FX rate/date/source/provenance and changed canonical metadata without mutations', async () => {
    const a = await user();
    for (const fx of [
      { ...initialFx, rate: '84' },
      { ...initialFx, rateDate: '2026-01-03' },
      { ...initialFx, source: 'Frankfurter/ECB' },
      { ...initialFx, reference: 'Changed observation' },
    ]) {
      observed = initialFx;
      const preview = await domain.preview(a.identity, a.portfolio.id, foreign),
        before = await snapshot();
      observed = fx;
      await expect(
        domain.append(
          a.identity,
          a.portfolio.id,
          foreign,
          'changed-fx-' + randomBytes(4).toString('hex'),
          preview.receipt,
        ),
      ).rejects.toMatchObject({ code: 'PREVIEW_CHANGED' });
      expect(await snapshot()).toBe(before);
    }
    observed = initialFx;
    const p = await domain.preview(a.identity, a.portfolio.id, foreign);
    await domain.models.Instrument.updateOne(
      { _id: 'AAPL:US' },
      { $set: { metadataSource: 'Explicit changed identity test' } },
    );
    try {
      await expect(
        domain.append(a.identity, a.portfolio.id, foreign, 'changed-identity', p.receipt),
      ).rejects.toMatchObject({ code: 'PREVIEW_CHANGED' });
    } finally {
      await domain.models.Instrument.updateOne(
        { _id: 'AAPL:US' },
        {
          $set: {
            metadataSource: instrumentMaster.find((i) => i.id === 'AAPL:US')!.metadataSource,
          },
        },
      );
    }
  });
  it('rejects changed input, expired/replayed/tampered/cross-scope receipts and changed ledger revisions', async () => {
    const a = await user(),
      b = await user('Bob'),
      p = await domain.preview(a.identity, a.portfolio.id, buy),
      before = await snapshot();
    await expect(
      domain.append(a.identity, a.portfolio.id, { ...buy, fees: '11' }, 'changed-input', p.receipt),
    ).rejects.toMatchObject({ code: 'PREVIEW_INVALID' });
    await expect(
      domain.append(b.identity, b.portfolio.id, buy, 'wrong-owner', p.receipt),
    ).rejects.toMatchObject({ code: 'PREVIEW_INVALID' });
    await expect(
      domain.append(
        a.identity,
        a.portfolio.id,
        buy,
        'tampered-receipt',
        p.receipt.slice(0, -1) + (p.receipt.endsWith('0') ? '1' : '0'),
      ),
    ).rejects.toMatchObject({ code: 'PREVIEW_INVALID' });
    instant = new Date(instant.getTime() + previewLifetimeMs);
    await expect(
      domain.append(a.identity, a.portfolio.id, buy, 'expired-unbooked', p.receipt),
    ).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' });
    expect(await snapshot()).toBe(before);
    instant = new Date(date);
    await domain.append(a.identity, a.portfolio.id, buy, 'trusted-initial');
    await expect(
      domain.append(a.identity, a.portfolio.id, buy, 'replayed-review', p.receipt),
    ).rejects.toMatchObject({ code: 'PREVIEW_CHANGED' });
  });
  it('fails closed for missing/stale/malformed historical FX and permits only explicit sourced overrides', async () => {
    const a = await user(),
      before = await snapshot();
    observed = null;
    await expect(domain.preview(a.identity, a.portfolio.id, foreign)).rejects.toMatchObject({
      code: 'HISTORICAL_FX_UNAVAILABLE',
    });
    observed = initialFx;
    stale = true;
    await expect(domain.preview(a.identity, a.portfolio.id, foreign)).rejects.toMatchObject({
      code: 'HISTORICAL_FX_STALE',
    });
    stale = false;
    const preview = await domain.preview(a.identity, a.portfolio.id, foreign);
    stale = true;
    await expect(
      domain.append(a.identity, a.portfolio.id, foreign, 'stale-confirmation', preview.receipt),
    ).rejects.toMatchObject({ code: 'HISTORICAL_FX_STALE' });
    stale = false;
    for (const bad of [
      { ...initialFx, rate: -1 },
      { ...initialFx, rate: '-1' },
      { ...initialFx, rateDate: 'invalid' },
      { ...initialFx, source: 'unverified' },
    ]) {
      observed = bad;
      await expect(domain.preview(a.identity, a.portfolio.id, foreign)).rejects.toMatchObject({
        code: 'HISTORICAL_FX_INVALID',
      });
    }
    observed = { ...initialFx, rateDate: '2026-01-06' };
    await expect(domain.preview(a.identity, a.portfolio.id, foreign)).rejects.toMatchObject({
      code: 'FUTURE_FX',
    });
    expect(await snapshot()).toBe(before);
    const legacy = new DomainService(auth, { ...market, historicalFxForCommit: undefined }, clock);
    observed = initialFx;
    expect((await legacy.preview(a.identity, a.portfolio.id, foreign)).fx).toEqual(initialFx);
  });
  it('atomically serializes concurrent confirmations and preserves same-key retries without double booking', async () => {
    const a = await user();
    await domain.append(a.identity, a.portfolio.id, buy, 'initial-owned-buy');
    const sell: TransactionInput = { ...buy, type: 'SELL', quantity: '7', price: '150', fees: '1' };
    const preview = await domain.preview(a.identity, a.portfolio.id, sell);
    expect(preview.effects).toMatchObject({
      nativeCashFlow: '1049',
      realizedLocalChange: '342',
      after: { quantity: '3', localCost: '303' },
    });
    const results = await Promise.all([
      domain.append(a.identity, a.portfolio.id, sell, 'same-confirmation', preview.receipt),
      domain.append(a.identity, a.portfolio.id, sell, 'same-confirmation', preview.receipt),
    ]);
    expect(results.map((r) => r.duplicate).sort()).toEqual([false, true]);
    expect(await domain.models.Economic.countDocuments()).toBe(2);
    const b = await user('Bob');
    await domain.append(b.identity, b.portfolio.id, buy, 'initial-bob-buy');
    const p = await domain.preview(b.identity, b.portfolio.id, sell);
    const conflict = await Promise.allSettled([
      domain.append(b.identity, b.portfolio.id, sell, 'sell-one', p.receipt),
      domain.append(b.identity, b.portfolio.id, sell, 'sell-two', p.receipt),
    ]);
    expect(conflict.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(conflict.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await domain.valuation(b.identity, b.portfolio.id)).holdings[0]?.quantity).toBe('3');
  });
  it('enforces preview authentication/CSRF/ownership, malformed inputs, currency and public confirmation receipts', async () => {
    const a = await user(),
      b = await user('Bob'),
      app = newApp();
    const post = (id: string, token: string, body: unknown = buy) =>
      request(app)
        .post('/api/v1/portfolios/' + id + '/ledger/preview')
        .set('Origin', env.WEB_ORIGIN)
        .set('X-Folio-CSRF', '1')
        .set('Authorization', 'Bearer ' + token)
        .send(body);
    expect((await post(a.portfolio.id, '')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/portfolios/' + a.portfolio.id + '/ledger/preview')
          .set('Authorization', 'Bearer ' + a.token)
          .send(buy)
      ).status,
    ).toBe(403);
    expect((await post(a.portfolio.id, b.token)).status).toBe(404);
    const response = await post(a.portfolio.id, a.token);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const confirm = await request(app)
      .post('/api/v1/portfolios/' + a.portfolio.id + '/ledger')
      .set('Origin', env.WEB_ORIGIN)
      .set('X-Folio-CSRF', '1')
      .set('Authorization', 'Bearer ' + a.token)
      .set('Idempotency-Key', 'no-public-bypass')
      .send(buy);
    expect(confirm.status).toBe(428);
    for (const body of [
      { ...buy, userId: b.identity.user._id.toHexString() },
      { ...buy, quantity: 1 },
      { ...buy, quantity: '1e3' },
      { ...buy, price: '-1' },
      { ...buy, tradingDate: '2026-02-30' },
      { ...buy, tradingDate: '2026-01-04' },
      { ...buy, effectiveAt: '2027-01-05T15:00:00.000Z' },
      { ...buy, instrumentId: 'AAPL' },
      { ...buy, historicalFxOverride: initialFx },
    ])
      expect((await post(a.portfolio.id, a.token, body)).status).toBeGreaterThanOrEqual(400);
    await domain.models.Instrument.updateOne({ _id: 'AAPL:US' }, { $set: { currency: 'ZZZ' } });
    try {
      await expect(domain.preview(a.identity, a.portfolio.id, foreign)).rejects.toMatchObject({
        code: 'UNSUPPORTED_CURRENCY',
      });
    } finally {
      await domain.models.Instrument.updateOne({ _id: 'AAPL:US' }, { $set: { currency: 'USD' } });
    }
    expect(await domain.models.Economic.countDocuments()).toBe(0);
    await auth.models.User.updateOne(
      { _id: a.identity.user._id },
      { $set: { demoReadonly: true } },
    );
    const readonlyIdentity = {
      ...a.identity,
      user: await auth.models.User.findById(a.identity.user._id),
    } as Identity;
    await expect(domain.preview(readonlyIdentity, a.portfolio.id, buy)).rejects.toMatchObject({
      code: 'DEMO_READ_ONLY',
    });
  });
});
describe('pure existing-engine effects and receipt validity', () => {
  it('reuses FIFO/fees/dividends/splits/backdated replay with exact string effects', () => {
    const common = {
      currency: 'INR',
      baseCurrency: 'INR',
      fx: { ...initialFx, rate: '1', source: 'identity' as const },
    };
    const record = { ...buy, ...common, id: 'buy', sequence: 1 };
    expect(transactionEffects([], [], record).baseCashFlow).toBe('-1010');
    const div = {
      instrumentId: 'TCS:NSE',
      effectiveAt: buy.effectiveAt,
      tradingDate: buy.tradingDate,
      type: 'DIVIDEND' as const,
      grossAmount: '30',
      fees: '2',
      ...common,
      id: 'div',
      sequence: 2,
    };
    expect(transactionEffects([record], [], div)).toMatchObject({
      nativeCashFlow: '28',
      dividendBaseChange: '28',
      quantityChange: '0',
    });
    const split = {
      instrumentId: 'TCS:NSE',
      effectiveAt: buy.effectiveAt,
      tradingDate: buy.tradingDate,
      type: 'SPLIT' as const,
      numerator: '2',
      denominator: '1',
      ...common,
      id: 'split',
      sequence: 3,
    };
    expect(transactionEffects([record, div], [], split)).toMatchObject({
      nativeCashFlow: '0',
      baseCashFlow: '0',
      after: { quantity: '20', localCost: '1010', averageCost: '50.5' },
      baseCostChange: '0',
    });
    const decimalRecord = {
      ...record,
      quantity: '0.000000000000000001',
      price: '0.0000000001',
      fees: '0',
    };
    expect(transactionEffects([], [], decimalRecord).nativeCashFlow).toBe(
      '-0.0000000000000000000000000001',
    );
    expect(() => transactionEffects([], [], { ...record, type: 'SELL' })).toThrow('more units');
    const sale = {
      ...record,
      type: 'SELL' as const,
      quantity: '5',
      price: '150',
      fees: '0',
      id: 'sale',
      sequence: 2,
      effectiveAt: '2026-01-06T15:00:00.000Z',
      tradingDate: '2026-01-06',
    };
    const earlier = {
      ...record,
      quantity: '2',
      price: '50',
      fees: '0',
      id: 'earlier',
      sequence: 3,
      effectiveAt: '2026-01-04T15:00:00.000Z',
      tradingDate: '2026-01-04',
      fx: { ...common.fx, rateDate: '2026-01-04' },
    };
    expect(transactionEffects([record, sale], [], earlier)).toMatchObject({
      nativeCashFlow: '-100',
      before: { quantity: '5', localCost: '505', realizedLocal: '245' },
      after: { quantity: '7', localCost: '707', realizedLocal: '347' },
      localCostChange: '202',
      realizedLocalChange: '102',
    });
  });
  it('validates signed scope/expiry/purpose/shape and rejects all forged forms', () => {
    const sign = (v: string, p: string) =>
      createHmac('sha256', 'explicit-synthetic-signing-material')
        .update(p + '\0' + v)
        .digest('hex');
    const binding = {
      owner: 'owner',
      portfolio: 'portfolio',
      authVersion: 0,
      requestHash: previewHash({ a: 1 }),
      revision: 0,
      sequence: 0,
      instrumentHash: previewHash({ b: 2 }),
      fxHash: previewHash({ c: 3 }),
      effectsHash: previewHash({ d: 4 }),
    };
    const token = signPreview(binding, new Date(date), sign);
    expect(readPreview(token, new Date(date), sign)).toMatchObject(binding);
    expect(previewHash({ a: undefined, b: [1, 2] })).toBe(previewHash({ b: [1, 2] }));
    expect(() => readPreview('', new Date(date), sign)).toThrow('Review the transaction');
    for (const forged of ['x'.repeat(2049), 'x', token + '.extra', token.replace(/.$/, 'x')])
      expect(() => readPreview(forged, new Date(date), sign)).toThrow('no longer valid');
    expect(() => readPreview(token, new Date(new Date(date).getTime() - 1), sign)).toThrow(
      'no longer valid',
    );
    expect(() =>
      readPreview(token, new Date(new Date(date).getTime() + previewLifetimeMs), sign),
    ).toThrow('expired');
    const [payload] = token.split('.');
    const malformed = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        extra: 'invalid',
      }),
    ).toString('base64url');
    expect(() =>
      readPreview(
        malformed + '.' + sign(malformed, 'transaction-preview-v1'),
        new Date(date),
        sign,
      ),
    ).toThrow('no longer valid');
  });
});
