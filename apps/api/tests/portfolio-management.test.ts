import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { PortfolioName, RenamePortfolioInput, DeletePortfolioInput } from '@folio/shared';
import { AuthService } from '../src/services/auth.ts';
import type { Identity } from '../src/services/auth.ts';
import { DomainService } from '../src/services/domain.ts';
import { PasswordAuthProvider } from '../src/providers/password-auth.ts';
import { instrumentMaster } from '../src/models/instrument-master.ts';
import type { MarketGateway } from '../src/providers/market.ts';
import { parseEnv } from '../src/config/env.ts';
import { createApp } from '../src/app.ts';
import { createLogger } from '../src/config/logger.ts';
import { MemoryCache } from '../src/services/cache.ts';
const env = parseEnv({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost/folio_management_test',
  REDIS_URL: 'redis://localhost',
  WEB_ORIGIN: 'http://localhost:5173',
});
const market: MarketGateway = {
  quotes: async () => [],
  rates: async () => ({}),
  historicalFx: async () => null,
  history: async () => ({
    status: 'unavailable',
    reason: 'Explicit unit-test unavailable gateway',
    label: 'History unavailable',
    points: [],
    source: null,
    fixture: false,
  }),
};
const password = 'Portfolio management integration passphrase!';
const database = 'folio_management_test_' + randomBytes(8).toString('hex');
let repl: MongoMemoryReplSet | undefined,
  connection: mongoose.Connection,
  auth: AuthService,
  domain: DomainService,
  app: Express,
  passwordHash: string;
beforeAll(async () => {
  const supplied = process.env['FOLIO_TEST_MONGODB_URI'];
  if (!supplied)
    repl = await MongoMemoryReplSet.create({
      binary: { version: '8.2.12' },
      replSet: { count: 1 },
    });
  connection = await mongoose
    .createConnection(supplied ?? repl!.getUri(), { dbName: database })
    .asPromise();
  passwordHash = await new PasswordAuthProvider().hash(password);
}, 180000);
beforeEach(async () => {
  auth = new AuthService(connection, env, new PasswordAuthProvider(), { send: async () => {} });
  await auth.initialize();
  domain = new DomainService(auth, market);
  await domain.initialize(instrumentMaster);
  for (const m of Object.values(auth.models)) await m.deleteMany({});
  for (const m of [domain.models.Portfolio, domain.models.Projection]) await m.deleteMany({});
  for (const m of [domain.models.Economic, domain.models.Void, domain.models.Deletion])
    await m.collection.deleteMany({});
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
  const login = await auth.login({ email: row.email, password }, { ip: 'test', userAgent: 'test' });
  const identity = await auth.authenticate(login.response.accessToken);
  return {
    identity,
    token: login.response.accessToken,
    portfolio: await domain.createDefault(identity),
  };
}
function headers(token: string) {
  return { Authorization: 'Bearer ' + token, Origin: env.WEB_ORIGIN, 'X-Folio-CSRF': '1' };
}
const input = { confirmation: 'DELETE', expectedVersion: 0 };
const buy = {
  type: 'BUY',
  instrumentId: 'TCS:NSE',
  effectiveAt: '2026-01-05T10:00:00.000Z',
  tradingDate: '2026-01-05',
  quantity: '2',
  price: '100',
  fees: '1',
};
const rename = (identity: Identity, id: string, name = 'Renamed Portfolio', expectedVersion = 0) =>
  domain.renamePortfolio(identity, id, { name, expectedVersion });
const remove = (identity: Identity, id: string, key = randomUUID(), expectedVersion = 0) =>
  domain.deleteEmptyPortfolio(identity, id, { ...input, expectedVersion }, key);
describe('single owned portfolio management', () => {
  it('strict names accept bounded Unicode text and reject unsafe/control/bidi/HTML/oversized values and unknown fields', () => {
    for (const name of [
      'भारत निवेश',
      'Ambar’s long-term 2026/27',
      'A & B (INR) + Growth_1',
      'épargne',
    ])
      expect(PortfolioName.parse('  ' + name + '  ')).toBe(name);
    for (const name of [
      '',
      '  ',
      'x'.repeat(101),
      '<img src=x>',
      'x\nY',
      'x\u202eY',
      'x\u200bY',
      'x\u0000Y',
    ])
      expect(PortfolioName.safeParse(name).success).toBe(false);
    expect(
      RenamePortfolioInput.safeParse({ name: 'OK', expectedVersion: 0, userId: 'injection' })
        .success,
    ).toBe(false);
    expect(DeletePortfolioInput.safeParse({ ...input, force: true }).success).toBe(false);
  });
  it('renames, persists after reconnect, preserves financial identity/state and makes same-name retry audit-repeat-safe', async () => {
    const u = await user();
    const before = await domain.models.Portfolio.findById(u.portfolio.id).lean();
    const changed = await rename(u.identity, u.portfolio.id, '  भारत निवेश  ');
    expect(changed).toEqual({ ...u.portfolio, name: 'भारत निवेश', managementVersion: 1 });
    expect(await rename(u.identity, u.portfolio.id, changed.name, 0)).toEqual(changed);
    expect(await auth.models.Audit.countDocuments({ action: 'portfolio.renamed' })).toBe(1);
    const after = await domain.models.Portfolio.findById(u.portfolio.id).lean();
    for (const field of [
      'userId',
      'key',
      'baseCurrency',
      'costBasis',
      'currencyLockedAt',
      'revision',
      'nextSequence',
      'dirtyFrom',
      'projectionVersion',
    ] as const)
      expect(after?.[field]).toEqual(before?.[field]);
    const second = await mongoose
      .createConnection(process.env['FOLIO_TEST_MONGODB_URI'] ?? repl!.getUri(), {
        dbName: database,
      })
      .asPromise();
    try {
      expect(
        (
          await second.db!.collection('portfolios').findOne({ _id: new Types.ObjectId(changed.id) })
        )?.['name'],
      ).toBe(changed.name);
    } finally {
      await second.close();
    }
  });
  it('allows only one default and resolves concurrent conflicting renames without a lost update', async () => {
    const u = await user();
    const created = await Promise.all([
      domain.createDefault(u.identity),
      domain.createDefault(u.identity),
    ]);
    expect(created.map((p) => p.id)).toEqual([u.portfolio.id, u.portfolio.id]);
    const results = await Promise.allSettled([
      rename(u.identity, u.portfolio.id, 'One'),
      rename(u.identity, u.portfolio.id, 'Two'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason).toMatchObject({
      status: 409,
      code: 'PORTFOLIO_CHANGED',
    });
    expect((await domain.portfolios(u.identity))[0]?.managementVersion).toBe(1);
  });
  it('empty deletion is atomic, matching concurrent retries share one receipt and replacement is a new single default', async () => {
    const u = await user(),
      key = randomUUID();
    expect((await domain.management(u.identity, u.portfolio.id)).canDelete).toBe(true);
    const results = await Promise.all([
      remove(u.identity, u.portfolio.id, key),
      remove(u.identity, u.portfolio.id, key),
    ]);
    expect(results.map((r) => r.duplicate).sort()).toEqual([false, true]);
    expect(results[0]?.deletedAt).toBe(results[1]?.deletedAt);
    expect(await domain.portfolios(u.identity)).toEqual([]);
    expect(await domain.models.Deletion.countDocuments()).toBe(1);
    const replacement = await domain.createDefault(u.identity);
    expect(replacement.id).not.toBe(u.portfolio.id);
    expect(replacement.baseCurrency).toBe('INR');
    expect(replacement.costBasis).toBe('FIFO');
    expect((await remove(u.identity, u.portfolio.id, key)).duplicate).toBe(true);
    expect((await domain.portfolios(u.identity))[0]?.id).toBe(replacement.id);
    await expect(remove(u.identity, replacement.id, key)).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(remove(u.identity, u.portfolio.id)).rejects.toMatchObject({ status: 404 });
    await expect(domain.management(u.identity, u.portfolio.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(await domain.models.Economic.countDocuments()).toBe(0);
    expect(await domain.models.Void.countDocuments()).toBe(0);
    expect(await domain.models.Projection.countDocuments()).toBe(0);
  });
  it('rename vs delete serialization rejects stale confirmation or makes rename safely unavailable', async () => {
    const u = await user();
    const results = await Promise.allSettled([
      rename(u.identity, u.portfolio.id),
      remove(u.identity, u.portfolio.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await domain.models.Deletion.countDocuments()).toBe(
      (await domain.portfolios(u.identity)).length ? 0 : 1,
    );
  });
  it('durable deletion replay survives service restart and development secret rotation', async () => {
    const u = await user(),
      key = randomUUID();
    const original = await remove(u.identity, u.portfolio.id, key);
    const restartedAuth = new AuthService(
      connection,
      { ...env, REFRESH_TOKEN_SECRET: 'explicit-local-test-rotated-key-'.repeat(3) },
      new PasswordAuthProvider(),
      { send: async () => {} },
    );
    await restartedAuth.initialize();
    const restarted = new DomainService(restartedAuth, market);
    await restarted.initialize(instrumentMaster);
    const login = await restartedAuth.login(
      { email: u.identity.user.email, password },
      { ip: 'test', userAgent: 'test' },
    );
    const identity = await restartedAuth.authenticate(login.response.accessToken);
    expect(await restarted.deleteEmptyPortfolio(identity, u.portfolio.id, input, key)).toEqual({
      ...original,
      duplicate: true,
    });
    expect(await restarted.portfolios(identity)).toEqual([]);
  });
  it('append vs delete has exactly one winner and never creates orphaned economics/projections', async () => {
    const u = await user();
    const preview = await domain.preview(u.identity, u.portfolio.id, buy);
    const results = await Promise.allSettled([
      domain.append(u.identity, u.portfolio.id, buy, randomUUID(), preview.receipt),
      remove(u.identity, u.portfolio.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const records = await domain.models.Economic.countDocuments();
    expect(records).toBe((await domain.portfolios(u.identity)).length);
    expect(await domain.models.Projection.countDocuments()).toBe(records);
    expect(await domain.models.Void.countDocuments()).toBe(0);
  });
  it('rename does not expire an unchanged financial preview or alter historical audit records', async () => {
    const u = await user(),
      preview = await domain.preview(u.identity, u.portfolio.id, buy);
    const audit = await auth.models.Audit.find().lean();
    await rename(u.identity, u.portfolio.id);
    expect(await auth.models.Audit.find({ _id: { $in: audit.map((a) => a._id) } }).lean()).toEqual(
      audit,
    );
    await expect(
      domain.append(u.identity, u.portfolio.id, buy, randomUUID(), preview.receipt),
    ).resolves.toMatchObject({ duplicate: false });
    const p = (await domain.portfolios(u.identity))[0]!;
    expect(p.revision).toBe(1);
    expect(p.managementVersion).toBe(1);
  });
  it('a delete holding the user guard blocks a racing append until it safely observes the deleted portfolio', async () => {
    const u = await user();
    const preview = await domain.preview(u.identity, u.portfolio.id, buy);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      ready = new Promise<void>((r) => {
        entered = r;
      });
    const original = domain.models.Portfolio.deleteOne.bind(domain.models.Portfolio);
    const spy = vi.spyOn(domain.models.Portfolio, 'deleteOne').mockImplementationOnce((...args) => {
      const query = original(...args),
        execute = query.exec.bind(query);
      query.exec = async () => {
        entered();
        await gate;
        return execute();
      };
      return query;
    });
    try {
      const deleting = remove(u.identity, u.portfolio.id);
      await ready;
      const appending = domain.append(
        u.identity,
        u.portfolio.id,
        buy,
        randomUUID(),
        preview.receipt,
      );
      const result = Promise.allSettled([deleting, appending]);
      release();
      const rows = await result;
      expect(rows[0]?.status).toBe('fulfilled');
      expect(rows[1]?.status).toBe('rejected');
      expect(await domain.models.Economic.countDocuments()).toBe(0);
      expect(await domain.models.Projection.countDocuments()).toBe(0);
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('an append holding the guard makes a racing deletion retry against the committed populated state', async () => {
    const u = await user();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      ready = new Promise<void>((r) => {
        entered = r;
      });
    const original = domain.models.Economic.create.bind(domain.models.Economic);
    const spy = vi
      .spyOn(domain.models.Economic, 'create')
      .mockImplementationOnce(async (...args) => {
        entered();
        await gate;
        return original(...args);
      });
    try {
      const appending = domain.append(u.identity, u.portfolio.id, buy, randomUUID());
      await ready;
      const deleting = remove(u.identity, u.portfolio.id);
      const result = Promise.allSettled([appending, deleting]);
      release();
      const rows = await result;
      expect(rows[0]?.status).toBe('fulfilled');
      expect(rows[1]).toMatchObject({
        status: 'rejected',
        reason: { code: 'PORTFOLIO_NOT_EMPTY' },
      });
      expect(await domain.models.Economic.countDocuments()).toBe(1);
      expect(await domain.models.Portfolio.countDocuments()).toBe(1);
      expect(await domain.models.Deletion.countDocuments()).toBe(0);
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('an original economic record alone blocks deletion even if financial metadata/projections are inconsistent', async () => {
    const u = await user();
    await domain.append(u.identity, u.portfolio.id, buy, randomUUID());
    await domain.models.Portfolio.updateOne(
      { _id: u.portfolio.id },
      { $set: { revision: 0, nextSequence: 0, currencyLockedAt: null } },
    );
    await domain.models.Projection.deleteMany({});
    expect((await domain.management(u.identity, u.portfolio.id)).canDelete).toBe(false);
    await expect(remove(u.identity, u.portfolio.id)).rejects.toMatchObject({
      code: 'PORTFOLIO_NOT_EMPTY',
    });
    expect(await domain.models.Economic.countDocuments()).toBe(1);
  });
  it('BUY/SELL/DIVIDEND/SPLIT and fully sold/voided history stay undeletable and immutable', async () => {
    const u = await user();
    const record = await domain.append(u.identity, u.portfolio.id, buy, randomUUID());
    await domain.append(
      u.identity,
      u.portfolio.id,
      {
        instrumentId: buy.instrumentId,
        effectiveAt: buy.effectiveAt,
        tradingDate: buy.tradingDate,
        type: 'DIVIDEND',
        grossAmount: '10',
        fees: '1',
      },
      randomUUID(),
    );
    await domain.append(
      u.identity,
      u.portfolio.id,
      {
        instrumentId: buy.instrumentId,
        type: 'SPLIT',
        effectiveAt: '2026-01-06T10:00:00.000Z',
        tradingDate: '2026-01-06',
        numerator: '2',
        denominator: '1',
      },
      randomUUID(),
    );
    await domain.append(
      u.identity,
      u.portfolio.id,
      {
        ...buy,
        type: 'SELL',
        effectiveAt: '2026-01-07T10:00:00.000Z',
        tradingDate: '2026-01-07',
        quantity: '4',
      },
      randomUUID(),
    );
    const before = await domain.exportOwned(u.identity.user._id);
    await expect(remove(u.identity, u.portfolio.id)).rejects.toMatchObject({
      code: 'PORTFOLIO_NOT_EMPTY',
    });
    expect(await domain.exportOwned(u.identity.user._id)).toEqual(before);
    const other = await user('Bob'),
      b = await domain.append(other.identity, other.portfolio.id, buy, randomUUID());
    await domain.void(other.identity, other.portfolio.id, b.record.id, 'Void explicit test');
    expect((await domain.valuation(other.identity, other.portfolio.id)).holdings).toEqual([]);
    await expect(remove(other.identity, other.portfolio.id)).rejects.toMatchObject({
      code: 'PORTFOLIO_NOT_EMPTY',
    });
    expect(await domain.models.Economic.findById(record.record.id)).not.toBeNull();
  });
  it('rejects orphan projection or void state even when no economic record exists', async () => {
    const u = await user();
    await domain.models.Projection.create({
      userId: u.identity.user._id,
      portfolioId: u.portfolio.id,
      instrumentId: 'TCS:NSE',
      quantity: '0',
      revision: 0,
    });
    await expect(remove(u.identity, u.portfolio.id)).rejects.toMatchObject({
      code: 'PORTFOLIO_NOT_EMPTY',
    });
    await domain.models.Projection.deleteMany({});
    await domain.models.Void.create({
      userId: u.identity.user._id,
      portfolioId: u.portfolio.id,
      transactionId: new Types.ObjectId(),
      reason: 'Inconsistent state test',
      recordedAt: new Date(),
    });
    expect((await domain.management(u.identity, u.portfolio.id)).canDelete).toBe(false);
    await expect(remove(u.identity, u.portfolio.id)).rejects.toMatchObject({
      code: 'PORTFOLIO_NOT_EMPTY',
    });
  });
  it('stale/invalid deletion confirmation and idempotency values never mutate state', async () => {
    const u = await user();
    await rename(u.identity, u.portfolio.id);
    await expect(remove(u.identity, u.portfolio.id)).rejects.toMatchObject({
      code: 'PORTFOLIO_CHANGED',
    });
    for (const [raw, key] of [
      [{ ...input, confirmation: 'delete' }, randomUUID()],
      [input, 'invalid'],
      [{ ...input, force: true }, randomUUID()],
      [{ expectedVersion: -1, confirmation: 'DELETE' }, randomUUID()],
    ] as const)
      await expect(
        domain.deleteEmptyPortfolio(u.identity, u.portfolio.id, raw, key),
      ).rejects.toMatchObject({ status: 400 });
    expect(await domain.models.Deletion.countDocuments()).toBe(0);
    expect(await domain.portfolios(u.identity)).toHaveLength(1);
  });
  it('HTTP auth/CSRF/JSON/strict queries and safe uniform ownership errors cover every new operation', async () => {
    const alice = await user(),
      bob = await user('Bob');
    for (const method of ['get', 'patch', 'delete'] as const) {
      const path =
        '/api/v1/portfolios/' + alice.portfolio.id + (method === 'get' ? '/management' : '');
      const body = method === 'patch' ? { name: 'New name', expectedVersion: 0 } : input;
      expect(
        (
          await request(app)
            [method](path)
            .set({ Origin: env.WEB_ORIGIN, 'X-Folio-CSRF': '1' })
            .send(body)
        ).status,
      ).toBe(401);
      const cross = await request(app)
        [method](path)
        .set(headers(bob.token))
        .set('Idempotency-Key', randomUUID())
        .send(method === 'get' ? undefined : body);
      const unknown = await request(app)
        [method](path.replace(alice.portfolio.id, '000000000000000000000001'))
        .set(headers(bob.token))
        .set('Idempotency-Key', randomUUID())
        .send(method === 'get' ? undefined : body);
      expect(cross.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(cross.body.error.code).toBe(unknown.body.error.code);
      expect(cross.body.error.message).toBe(unknown.body.error.message);
      expect(cross.headers['cache-control']).toBe('no-store');
      if (method !== 'get')
        expect(
          (
            await request(app)
              [method](path)
              .set('Authorization', 'Bearer ' + alice.token)
              .send(body)
          ).status,
        ).toBe(403);
    }
    expect(
      (
        await request(app)
          .patch('/api/v1/portfolios/' + alice.portfolio.id)
          .set(headers(alice.token))
          .send({ name: '<script>', expectedVersion: 0 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get('/api/v1/portfolios/' + alice.portfolio.id + '/management?force=true')
          .set(headers(alice.token))
      ).status,
    ).toBe(400);
    const renamed = await request(app)
      .patch('/api/v1/portfolios/' + alice.portfolio.id)
      .set(headers(alice.token))
      .send({ name: 'HTTP portfolio', expectedVersion: 0 });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('HTTP portfolio');
    const deleted = await request(app)
      .delete('/api/v1/portfolios/' + alice.portfolio.id)
      .set(headers(alice.token))
      .set('Idempotency-Key', randomUUID())
      .send({ ...input, expectedVersion: 1 });
    expect(deleted.status).toBe(200);
  });
  it('public demo cannot rename/delete and privacy account erasure separately removes populated history and receipts', async () => {
    const u = await user();
    const deletionKey = randomUUID();
    await remove(u.identity, u.portfolio.id, deletionKey);
    const replacement = await domain.createDefault(u.identity);
    await domain.append(u.identity, replacement.id, buy, randomUUID());
    const exported = await domain.exportOwned(u.identity.user._id);
    expect(exported.portfolioDeletions).toHaveLength(1);
    expect(exported.ledger).toHaveLength(1);
    const csv = await request(app)
      .post('/api/v1/me/export')
      .set(headers(u.token))
      .send({ format: 'csv' });
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('portfolio_deletion.' + u.portfolio.id);
    expect(csv.text).not.toContain(deletionKey);
    expect(csv.text).not.toContain('requestHash');
    const json = await request(app)
      .post('/api/v1/me/export')
      .set(headers(u.token))
      .send({ format: 'json' });
    expect(json.status).toBe(200);
    expect(json.body.domain.portfolioDeletions).toHaveLength(1);
    const demoUser = u.identity.user.$clone();
    demoUser.demoReadonly = true;
    const demo = { ...u.identity, user: demoUser };
    expect((await domain.management(demo, replacement.id)).canDelete).toBe(false);
    await expect(rename(demo, replacement.id)).rejects.toMatchObject({ code: 'DEMO_READ_ONLY' });
    await expect(remove(demo, replacement.id)).rejects.toMatchObject({ code: 'DEMO_READ_ONLY' });
    await auth.deleteAccount(u.identity, password, { ip: 'test', userAgent: 'test' });
    for (const m of [
      domain.models.Portfolio,
      domain.models.Projection,
      domain.models.Economic,
      domain.models.Void,
      domain.models.Deletion,
    ])
      expect(await m.countDocuments({ userId: u.identity.user._id })).toBe(0);
    await expect(remove(u.identity, u.portfolio.id, deletionKey)).rejects.toMatchObject({
      status: 401,
    });
  });
});
