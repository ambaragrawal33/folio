import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { fork, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { JobRun, RefreshStatus } from '@folio/shared';
import type { Instrument } from '@folio/shared';
import { parseEnv } from '../src/config/env.ts';
import { AuthService } from '../src/services/auth.ts';
import { DomainService } from '../src/services/domain.ts';
import { PasswordAuthProvider } from '../src/providers/password-auth.ts';
import { LocalFixtureMarketGateway } from '../src/providers/local-fixture.ts';
import { instrumentMaster } from '../src/models/instrument-master.ts';
import { ObservedMarketGateway } from '../src/jobs/observations.ts';
import {
  JobService,
  BullMQJobRunner,
  StatelessJobRunner,
  retryDelay,
  jobPayload,
} from '../src/jobs/runner.ts';
import { Lease } from '../src/jobs/lease.ts';
import { emptyStats } from '../src/jobs/models.ts';
import { completedSessionDate } from '../src/providers/calendars.ts';
import { createApp } from '../src/app.ts';
import { createLogger } from '../src/config/logger.ts';
import { MemoryCache } from '../src/services/cache.ts';
const namespace = randomBytes(8).toString('hex'),
  database = 'folio_local_fixture_test_' + namespace;
const env = parseEnv({
  NODE_ENV: 'test',
  LOCAL_FIXTURE_MODE: 'true',
  LOCAL_JOBS_ENABLED: 'true',
  CACHE_NAMESPACE: 'folio:local-fixture',
  MONGODB_URI: 'mongodb://127.0.0.1/' + database,
  REDIS_URL: 'redis://127.0.0.1:6379/1',
  WEB_ORIGIN: 'http://localhost:5190',
  JOB_HTTP_SECRET: randomBytes(32).toString('hex'),
});
let connection: mongoose.Connection,
  redis: Redis,
  auth: AuthService,
  domain: DomainService,
  market: ObservedMarketGateway,
  jobs: JobService,
  runner: BullMQJobRunner;
let source: LocalFixtureMarketGateway, passwordHash: string;
const password = 'Isolated local job verification passphrase!';
let mode: 'ok' | 'partial' | 'missing' | 'bad' | 'throw' | 'slow' | 'lost' = 'ok',
  ticks = 0;
const refresh = vi.fn(async (instruments: readonly Instrument[], signal?: AbortSignal) => {
  ticks++;
  if (mode === 'slow')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  if (mode === 'throw')
    throw new Error('upstream secret credentials and URI must never be persisted');
  if (mode === 'bad')
    return [{ wrong: 'schema' }] as unknown as Awaited<ReturnType<typeof source.quotes>>;
  if (mode === 'missing') return [];
  if (mode === 'lost') await redis.del(jobs.namespace + ':jobs:lease:market');
  const quotes = await source.quotes(instruments);
  return mode === 'partial' ? quotes.slice(0, 1) : quotes;
});
beforeAll(async () => {
  connection = await mongoose
    .createConnection(
      process.env['FOLIO_TEST_MONGODB_URI'] ??
        'mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=rs0',
      { dbName: database, serverSelectionTimeoutMS: 2000 },
    )
    .asPromise();
  redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, commandTimeout: 2000 });
  redis.on('error', () => {});
  await redis.ping();
  const passwords = new PasswordAuthProvider();
  auth = new AuthService(connection, env, passwords, { send: async () => {} });
  await auth.initialize();
  passwordHash = await passwords.hash(password);
  source = new LocalFixtureMarketGateway(env);
  const upstream = {
    quotes: source.quotes.bind(source),
    rates: source.rates.bind(source),
    historicalFx: source.historicalFx.bind(source),
    history: source.history.bind(source),
    capability: source.capability.bind(source),
    refreshQuotes: refresh,
  };
  market = new ObservedMarketGateway(connection, upstream, true);
  domain = new DomainService(auth, market);
  await domain.initialize(instrumentMaster);
  jobs = new JobService(env, domain, market, redis, { isolatedTestNamespace: namespace });
  await jobs.initialize();
}, 30000);
beforeEach(async () => {
  jobs = new JobService(env, domain, market, redis, { isolatedTestNamespace: namespace });
  mode = 'ok';
  ticks = 0;
  refresh.mockClear();
  runner = new BullMQJobRunner(jobs);
  await runner.queue.obliterate({ force: true });
  for (const m of Object.values(jobs.models)) await m.deleteMany({});
  for (const m of Object.values(auth.models)) await m.deleteMany({});
  await domain.models.Economic.collection.deleteMany({});
  await domain.models.Void.collection.deleteMany({});
  await domain.models.Projection.deleteMany({});
  await domain.models.Portfolio.deleteMany({});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await runner.close();
});
afterAll(async () => {
  await connection.dropDatabase();
  await connection.close();
  const keys = await redis.keys(env.CACHE_NAMESPACE + ':test:' + namespace + ':*');
  if (keys.length) await redis.del(...keys);
  await redis.quit();
});
async function user(name = 'Alice') {
  const row = await auth.models.User.create({
    name,
    email: name.toLowerCase() + '@jobs.example.test',
    passwordHash,
    emailVerifiedAt: new Date(),
  });
  const login = await auth.login({ email: row.email, password }, { ip: 'test', userAgent: 'test' });
  const identity = await auth.authenticate(login.response.accessToken),
    portfolio = await domain.createDefault(identity);
  return { identity, portfolio, token: login.response.accessToken };
}
async function buy(a: Awaited<ReturnType<typeof user>>, id = 'TCS:NSE') {
  const input = {
    instrumentId: id,
    type: 'BUY' as const,
    quantity: '10',
    price: '100',
    fees: '10',
    effectiveAt: '2026-01-05T15:00:00.000Z',
    tradingDate: '2026-01-05',
  };
  await domain.append(a.identity, a.portfolio.id, input, randomUUID());
}
async function done(a: Awaited<ReturnType<typeof user>>, id: string) {
  let run = await jobs.get(a.identity, a.portfolio.id, id);
  for (let n = 0; n < 120 && ['queued', 'running', 'retrying'].includes(run.state); n++) {
    await new Promise((r) => setTimeout(r, 50));
    run = await jobs.get(a.identity, a.portfolio.id, id);
  }
  return run;
}
async function financialSnapshot() {
  return JSON.stringify(
    await Promise.all([
      domain.models.Economic.find().lean(),
      domain.models.Void.find().lean(),
      domain.models.Projection.find().lean(),
      domain.models.Portfolio.find().lean(),
    ]),
  );
}
const app = () =>
  createApp(
    env,
    { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
    createLogger('silent'),
    undefined,
    { service: auth, domain, cache: new MemoryCache(), jobs },
  );
describe('durable bounded local jobs with real Mongo and Redis', () => {
  it('deduplicates concurrent submission and worker execution without any financial mutation', async () => {
    const a = await user();
    await buy(a);
    const before = await financialSnapshot(),
      key = randomUUID();
    const runs = await Promise.all(
      Array.from({ length: 5 }, () => jobs.submit(a.identity, a.portfolio.id, key)),
    );
    expect(new Set(runs.map((r) => r.id)).size).toBe(1);
    expect(await jobs.models.Run.countDocuments()).toBe(1);
    await runner.start({ lockDuration: 1000, stalledInterval: 1000 });
    const second = new BullMQJobRunner(jobs);
    await second.start({ lockDuration: 1000, stalledInterval: 1000 });
    try {
      const value = await done(a, runs[0]!.id);
      expect(value.state).toBe('completed');
      expect(value.stats).toMatchObject({ requested: 1, accepted: 1, missing: 0 });
      expect(ticks).toBe(1);
      expect(await financialSnapshot()).toBe(before);
      expect(await jobs.models.Observation.countDocuments()).toBe(1);
      const record = await jobs.models.Observation.findOne().lean();
      expect(record?.price.toString()).toBe('70');
      expect(record?.source).toContain('synthetic');
      expect(record?.observedAt).toBeInstanceOf(Date);
      const retry = await jobs.submit(a.identity, a.portfolio.id, key);
      expect(retry.id).toBe(value.id);
      expect(ticks).toBe(1);
      const queued = await runner.queue.getJob(value.id);
      expect(queued?.data).toEqual({ runId: value.id });
    } finally {
      await second.close();
      jobs.attach(runner);
    }
  }, 15000);
  it('persists queued state without worker, then resumes after worker startup/restart', async () => {
    const a = await user();
    await buy(a);
    const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await new Promise((r) => setTimeout(r, 100));
    expect((await jobs.get(a.identity, a.portfolio.id, run.id)).state).toBe('queued');
    await runner.start();
    expect((await done(a, run.id)).state).toBe('completed');
    await runner.stopWorker();
    const next = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    expect(next.state).toBe('queued');
    await runner.start();
    expect((await done(a, next.id)).state).toBe('completed');
    expect(ticks).toBe(1);
  });
  it('coordinates distinct concurrent jobs with broker backoff after application-lock contention', async () => {
    const a = await user(),
      b = await user('Bob');
    await buy(a);
    await buy(b);
    mode = 'slow';
    const first = await jobs.submit(a.identity, a.portfolio.id, randomUUID()),
      secondRun = await jobs.submit(b.identity, b.portfolio.id, randomUUID());
    const secondWorker = new BullMQJobRunner(jobs);
    try {
      await Promise.all([runner.start(), secondWorker.start()]);
      expect((await done(a, first.id)).state).toBe('completed');
      expect((await done(b, secondRun.id)).state).toBe('completed');
      const attempts = [
        (await runner.queue.getJob(first.id))?.attemptsMade ?? 0,
        (await runner.queue.getJob(secondRun.id))?.attemptsMade ?? 0,
      ];
      expect(attempts.some((n) => n >= 1)).toBe(true);
      expect(ticks).toBe(1);
      await expect
        .poll(() => redis.get(jobs.namespace + ':jobs:lease:market'), { timeout: 3000 })
        .toBeNull();
    } finally {
      await secondWorker.close();
      jobs.attach(runner);
    }
  }, 15000);
  it('recovers durable Mongo outbox left before Redis enqueue', async () => {
    const a = await user();
    await buy(a);
    vi.spyOn(runner, 'enqueue').mockRejectedValueOnce(new Error('redis unreachable'));
    await expect(jobs.submit(a.identity, a.portfolio.id, randomUUID())).rejects.toMatchObject({
      status: 503,
    });
    expect(await jobs.models.Run.countDocuments({ state: 'queued' })).toBe(1);
    await runner.start();
    expect(await jobs.recover()).toBe(1);
    const run = await jobs.models.Run.findOne().lean();
    expect((await done(a, run!._id)).state).toBe('completed');
  });
  it('leases contend, expire and compare token so an old owner cannot release a new lease', async () => {
    const key = jobs.namespace + ':test-lock',
      a = new Lease(redis, key),
      b = new Lease(redis, key);
    expect(await a.acquire(40)).toBe(true);
    expect(await b.acquire(100)).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(await b.acquire(100)).toBe(true);
    await a.release();
    await expect(b.check(new AbortController().signal)).resolves.toBeUndefined();
    await b.release();
    await expect(a.check(new AbortController().signal)).rejects.toMatchObject({
      code: 'LOCK_LOST',
    });
  });
  it('lock loss fences late observation writes and leaves no permanent lock', async () => {
    const a = await user();
    await buy(a);
    mode = 'lost';
    const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await expect(jobs.execute(run.id)).rejects.toMatchObject({ code: 'LOCK_LOST' });
    expect(await jobs.models.Observation.countDocuments()).toBe(0);
    expect((await jobs.get(a.identity, a.portfolio.id, run.id)).state).toBe('retrying');
    mode = 'ok';
    await jobs.execute(run.id);
    expect((await jobs.get(a.identity, a.portfolio.id, run.id)).state).toBe('completed');
  });
  it('records broker lock-contention exhaustion without inventing execution attempts', async () => {
    const a = await user();
    await buy(a);
    const lease = new Lease(redis, jobs.namespace + ':jobs:lease:market');
    expect(await lease.acquire(10000)).toBe(true);
    try {
      const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
      await runner.start();
      const result = await done(a, run.id);
      expect(result.state).toBe('failed');
      expect(result.attempts).toBe(0);
      expect((await runner.queue.getJob(run.id))?.attemptsMade).toBe(3);
      expect(refresh).not.toHaveBeenCalled();
      expect(await jobs.models.Observation.countDocuments()).toBe(0);
    } finally {
      await lease.release();
    }
  }, 15000);
  it('times out, cancels late provider result and exhausts bounded backoff without secrets', async () => {
    await runner.close();
    jobs = new JobService(env, domain, market, redis, {
      isolatedTestNamespace: namespace,
      timeoutMs: 150,
      leaseMs: 500,
    });
    runner = new BullMQJobRunner(jobs);
    const a = await user();
    await buy(a);
    mode = 'slow';
    const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await runner.start();
    const result = await done(a, run.id);
    expect(result.state).toBe('failed');
    expect(result.attempts).toBe(3);
    expect(['TIMEOUT', 'RETRY_EXHAUSTED']).toContain(result.error);
    expect(await jobs.models.Observation.countDocuments()).toBe(0);
    expect([1, 2, 3, 9].map(retryDelay)).toEqual([1000, 2000, 4000, 5000]);
  }, 15000);
  it('retries provider failure three times, persists sanitized error and retains the original quote', async () => {
    const a = await user();
    await buy(a);
    let run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await jobs.execute(run.id);
    const quote = await jobs.models.Observation.findOne().lean();
    await jobs.models.Observation.updateMany(
      {},
      { $set: { observedAt: new Date(Date.now() - 70000) } },
    );
    mode = 'throw';
    run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await runner.start();
    const value = await done(a, run.id);
    expect(value.state).toBe('failed');
    expect(JSON.stringify(value)).not.toMatch(/secret|credentials|URI/);
    expect((await jobs.models.Observation.findOne().lean())?.price.toString()).toBe(
      quote?.price.toString(),
    );
  }, 15000);
  it('malformed/duplicate/wrong-currency/future/fixture mismatch fail before any observation write', async () => {
    const a = await user();
    await buy(a);
    mode = 'bad';
    let run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await expect(jobs.execute(run.id)).rejects.toMatchObject({ code: 'PROVIDER_MALFORMED' });
    mode = 'ok';
    const base = (await source.quotes([instrumentMaster[0]!]))[0]!;
    for (const raw of [
      [base, base],
      [{ ...base, currency: 'USD' }],
      [{ ...base, fixture: false }],
      [{ ...base, asOf: '2099-01-01T00:00:00.000Z' }],
      [{ ...base, price: '-1' }],
      [{ ...base, price: '12345678901234567890123456789012345' }],
      [{ ...base, referencePrice: '12345678901234567890123456789012345' }],
    ]) {
      refresh.mockResolvedValueOnce(raw);
      run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
      await expect(jobs.execute(run.id)).rejects.toMatchObject({ code: 'PROVIDER_MALFORMED' });
    }
    expect(await jobs.models.Observation.countDocuments()).toBe(0);
  });
  it('keeps a reported zero distinct from missing, preserves newer observations and stale observation age', async () => {
    const a = await user();
    await buy(a);
    const base = (await source.quotes([instrumentMaster[0]!]))[0]!;
    refresh.mockResolvedValueOnce([{ ...base, price: '0', referencePrice: null }]);
    let run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await jobs.execute(run.id);
    expect((await market.quotes([instrumentMaster[0]!]))[0]?.price).toBe('0');
    const earlier = new Date(Date.now() - 70000);
    await jobs.models.Observation.updateMany({}, { $set: { observedAt: earlier } });
    refresh.mockResolvedValueOnce([{ ...base, status: 'stale' }]);
    run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await jobs.execute(run.id);
    expect((await jobs.models.Observation.findOne().lean())?.observedAt).toEqual(earlier);
    expect((await jobs.get(a.identity, a.portfolio.id, run.id)).state).toBe('degraded');
    const newer = new Date(Date.now() - 1000);
    await jobs.models.Observation.updateMany({}, { $set: { asOf: newer, status: 'stale' } });
    run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    refresh.mockResolvedValueOnce([
      { ...base, asOf: new Date(newer.getTime() - 1000).toISOString() },
    ]);
    await jobs.execute(run.id);
    expect((await jobs.models.Observation.findOne().lean())?.asOf).toEqual(newer);
  });
  it('delegates FX/history without alternate accounting and gates stored observations by display/currency/mode', async () => {
    const a = await user();
    await buy(a);
    const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await jobs.execute(run.id);
    const rates = await market.rates(['USD'], 'INR');
    expect(rates['USD']).toMatchObject({ rate: '88', source: 'local-fixture', status: 'fresh' });
    expect(await market.historicalFx('USD', 'INR', '2026-01-05')).toEqual(
      await source.historicalFx('USD', 'INR', '2026-01-05'),
    );
    expect(await market.historicalFxForCommit('USD', 'INR', '2026-01-05')).toMatchObject({
      stale: false,
    });
    expect(await market.historicalFxForCommit('ZZZ', 'INR', '2026-01-05')).toBeNull();
    expect(await market.history(instrumentMaster[0]!)).toEqual(
      await source.history(instrumentMaster[0]!),
    );
    const denied = new ObservedMarketGateway(
      connection,
      {
        ...market.upstream,
        capability: () => ({
          quotes: false,
          closes: false,
          display: false,
          reason: 'Not permitted',
        }),
        quotes: async () => [],
      },
      true,
    );
    expect(await denied.quotes([instrumentMaster[0]!])).toEqual([]);
    await jobs.models.Observation.updateMany({}, { $set: { currency: 'USD', fixture: false } });
    expect(await denied.quotes([instrumentMaster[0]!])).toEqual([]);
    const unsupported = new ObservedMarketGateway(
      connection,
      { ...market.upstream, capability: undefined } as unknown as typeof market.upstream,
      false,
    );
    expect(unsupported.capability(instrumentMaster[0]!).quotes).toBe(false);
  });
  it('validates permitted close history and never captures missing/future/crypto or malformed closes', async () => {
    const instrument = instrumentMaster[0]!,
      stats = emptyStats(),
      signal = new AbortController().signal;
    const history = await source.history(instrument);
    const spy = vi.spyOn(market.upstream, 'history');
    for (const response of [
      { ...history, status: 'unavailable' as const },
      { ...history, fixture: false },
      { ...history, source: null },
      { ...history, points: [] },
      { ...history, points: [{ date: '2099-01-01', price: '1' }] },
    ]) {
      spy.mockResolvedValueOnce(response);
      await market.captureCloses([instrument], stats, async () => {}, signal);
    }
    expect(await jobs.models.Close.countDocuments()).toBe(0);
    spy.mockResolvedValueOnce({ ...history, points: [{ date: '2026-01-06', price: '-1' }] });
    await expect(
      market.captureCloses([instrument], emptyStats(), async () => {}, signal),
    ).rejects.toMatchObject({ code: 'PROVIDER_MALFORMED' });
    spy.mockResolvedValueOnce({
      ...history,
      points: Array.from({ length: 401 }, () => ({ date: '2026-01-06', price: '1' })),
    });
    await expect(
      market.captureCloses([instrument], emptyStats(), async () => {}, signal),
    ).rejects.toMatchObject({ code: 'PROVIDER_MALFORMED' });
    const abort = new AbortController();
    abort.abort();
    await expect(
      market.captureCloses([instrument], emptyStats(), async () => {}, abort.signal),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    const crypto = instrumentMaster.find((i) => i.exchange === 'CRYPTO')!;
    await market.captureCloses([crypto], stats, async () => {}, signal);
    expect(await jobs.models.Close.countDocuments()).toBe(0);
  });
  it('atomically bounds queue admission and reconciles terminal/erased permits', async () => {
    const key = jobs.namespace + ':jobs:admissions';
    await redis.del(key);
    await redis.zadd(
      key,
      ...Array.from({ length: 999 }, (_, n) => [n, n.toString(16).padStart(64, '0')]).flat(),
    );
    const ids = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
    const admitted = await Promise.allSettled(ids.map((id) => runner.enqueue(id)));
    expect(admitted.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await redis.zcard(key)).toBe(1000);
    await runner.reconcile();
    expect(await redis.zcard(key)).toBe(975);
    await redis.del(key);
  });
  it('bounds owned durable pending runs while matching-key retry remains accepted', async () => {
    const a = await user(),
      firstKey = randomUUID();
    const first = await jobs.submit(a.identity, a.portfolio.id, firstKey);
    for (let n = 1; n < 20; n++) await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await expect(jobs.submit(a.identity, a.portfolio.id, randomUUID())).rejects.toMatchObject({
      status: 429,
      code: 'REFRESH_QUEUE_FULL',
    });
    expect((await jobs.submit(a.identity, a.portfolio.id, firstKey)).id).toBe(first.id);
    expect(await jobs.models.Run.countDocuments()).toBe(20);
  }, 15000);
  it('uses verified normal calendars, display/retention capabilities and completed-session close dates', async () => {
    const instrument = instrumentMaster[0]!,
      signal = new AbortController().signal;
    const quote = (await source.quotes([instrument]))[0]!;
    const fetch = vi.fn(async () => [
      { ...quote, fixture: false, asOf: '2026-01-06T05:00:00.000Z' },
    ]);
    const history = vi.fn(async () => ({
      ...(await source.history(instrument)),
      fixture: false,
      source: 'Recorded adapter test only',
    }));
    const upstream = {
      ...market.upstream,
      quotes: fetch,
      refreshQuotes: fetch,
      history,
      capability: () => ({ display: true, quotes: true, closes: true, reason: null }),
      historicalFxForCommit: async () => ({
        fx: {
          rate: '83',
          rateDate: '2026-01-05',
          source: 'Recorded test',
          reference: 'Synthetic unit test provenance',
        },
        stale: true,
      }),
    };
    const opened = new ObservedMarketGateway(
      connection,
      upstream,
      false,
      () => new Date('2026-01-06T05:01:00.000Z'),
    );
    await opened.refresh([instrument], emptyStats(), async () => {}, signal);
    expect((await opened.quotes([instrument]))[0]?.status).toBe('fresh');
    expect(await opened.historicalFxForCommit('USD', 'INR', '2026-01-05')).toMatchObject({
      stale: true,
    });
    await opened.captureCloses([instrument], emptyStats(), async () => {}, signal);
    expect(history).not.toHaveBeenCalled();
    const closed = new ObservedMarketGateway(
      connection,
      upstream,
      false,
      () => new Date('2026-01-06T11:00:00.000Z'),
    );
    await closed.captureCloses([instrument], emptyStats(), async () => {}, signal);
    expect((await jobs.models.Close.findOne().lean())?.basis).toBe('observed-split-adjusted');
    history.mockResolvedValueOnce({
      ...(await source.history(instrument)),
      fixture: false,
      source: 'Recorded adapter test only',
      points: [{ date: '2026-01-05', price: '68' }],
    });
    const stats = emptyStats();
    await closed.captureCloses([instrument], stats, async () => {}, signal);
    expect(stats.missing).toBe(1);
    fetch.mockClear();
    await jobs.models.Observation.deleteMany({});
    await closed.refresh([instrument], emptyStats(), async () => {}, signal);
    expect(fetch).not.toHaveBeenCalled();
    const unknown = new ObservedMarketGateway(
      connection,
      upstream,
      false,
      () => new Date('2027-01-06T11:00:00.000Z'),
    );
    await unknown.captureCloses([instrument], emptyStats(), async () => {}, signal);
    expect(await jobs.models.Close.countDocuments()).toBe(1);
  });
  it('partial response and missing quote preserve prior valid observations and null missing valuation', async () => {
    const a = await user();
    await buy(a);
    await buy(a, 'AAPL:US');
    mode = 'partial';
    const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await jobs.execute(run.id);
    expect(await jobs.models.Observation.countDocuments()).toBe(1);
    expect((await jobs.get(a.identity, a.portfolio.id, run.id)).state).toBe('degraded');
    mode = 'missing';
    await jobs.models.Observation.updateMany(
      {},
      { $set: { observedAt: new Date(Date.now() - 70000) } },
    );
    const next = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await jobs.execute(next.id);
    expect(await jobs.models.Observation.countDocuments()).toBe(1);
    expect((await jobs.get(a.identity, a.portfolio.id, next.id)).state).toBe('unavailable');
    await buy(a, 'RELIANCE:BSE');
    const valuation = await domain.valuation(a.identity, a.portfolio.id);
    expect(valuation.complete).toBe(false);
    expect(valuation.holdings.find((h) => h.instrumentId === 'RELIANCE:BSE')?.baseValue).toBeNull();
  });
  it('ages stored fixture observations explicitly and never substitutes acquisition cost for a price', async () => {
    const a = await user();
    await buy(a);
    const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await jobs.execute(run.id);
    await jobs.models.Observation.updateMany(
      {},
      { $set: { observedAt: new Date(Date.now() - 301000) } },
    );
    const quotes = await market.quotes([instrumentMaster[0]!]);
    expect(quotes[0]?.status).toBe('stale');
    expect(quotes[0]?.price).toBe('70');
    expect(quotes[0]?.source).toContain('synthetic');
  });
  it('unknown capability makes no provider call; no raw symbols or unbounded payload permitted', async () => {
    const a = await user();
    await buy(a, 'RELIANCE:BSE');
    const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    await jobs.execute(run.id);
    expect(refresh).not.toHaveBeenCalled();
    expect((await jobs.get(a.identity, a.portfolio.id, run.id)).state).toBe('unavailable');
    expect(jobPayload.safeParse({ runId: run.id, token: 'credential' }).success).toBe(false);
    await expect(
      market.refresh(
        Array.from({ length: 26 }, () => instrumentMaster[0]!),
        emptyStats(),
        async () => {},
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_MALFORMED' });
  });
  it('captures only explicit synthetic permitted closes, idempotently, without snapshots/ledger writes', async () => {
    const a = await user();
    await buy(a);
    const before = await financialSnapshot(),
      run = await jobs.operator('eod-close-capture', 'close_fixture');
    await jobs.execute(run.id);
    expect(await jobs.models.Close.countDocuments()).toBe(1);
    const close = await jobs.models.Close.findOne().lean();
    expect(close).toMatchObject({ fixture: true, basis: 'synthetic-fixture', date: '2026-01-06' });
    expect(close?.close.toString()).toBe('70');
    const next = await jobs.operator('eod-close-capture', 'close_fixture_again');
    await jobs.execute(next.id);
    expect(await jobs.models.Close.countDocuments()).toBe(1);
    expect(await financialSnapshot()).toBe(before);
    expect(completedSessionDate('BSE', new Date())).toBeNull();
    expect(completedSessionDate('CRYPTO', new Date())).toBeNull();
    expect(completedSessionDate('NSE', new Date('2026-10-06T02:00:00.000Z'))).toBe('2026-10-05');
    expect(completedSessionDate('NSE', new Date('2026-10-06T11:00:00.000Z'))).toBe('2026-10-06');
  });
  it('housekeeping removes only expired auth resources/old terminal jobs within caps', async () => {
    const a = await user();
    const run = await jobs.operator('housekeeping', 'cleanup_fixture');
    await auth.models.Family.updateMany(
      {},
      { $set: { expiresAt: new Date(Date.now() + 86400000) } },
    );
    const live = await auth.models.Family.countDocuments();
    await auth.models.Family.create({ userId: a.identity.user._id, expiresAt: new Date(0) });
    await jobs.execute(run.id);
    expect(await auth.models.Family.countDocuments()).toBe(live);
    expect((await jobs.models.Run.findById(run.id).lean())?.state).toBe('completed');
  });
  it('HTTP enforces auth/CSRF/strictness/idempotency/IDOR/no-store and no cross-user job disclosure', async () => {
    const a = await user(),
      b = await user('Bob');
    await buy(a);
    const path = '/api/v1/portfolios/' + a.portfolio.id + '/refresh',
      server = app();
    expect((await request(server).get(path)).status).toBe(401);
    expect(
      (
        await request(server)
          .get(path)
          .set('Authorization', 'Bearer ' + b.token)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(server)
          .post(path)
          .set('Authorization', 'Bearer ' + a.token)
          .send({})
      ).status,
    ).toBe(403);
    const post = (body: unknown, key = randomUUID()) =>
      request(server)
        .post(path)
        .set('Authorization', 'Bearer ' + a.token)
        .set('Origin', env.WEB_ORIGIN)
        .set('X-Folio-CSRF', '1')
        .set('Idempotency-Key', key)
        .send(body);
    expect((await post({ instrumentId: 'RAW', token: 'secret' })).status).toBe(400);
    expect((await post({}, 'invalid')).status).toBe(400);
    const key = randomUUID(),
      first = await post({}, key),
      again = await post({}, key);
    expect(first.status).toBe(202);
    expect(again.body.id).toBe(first.body.id);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(JobRun.safeParse(first.body).success).toBe(true);
    expect(
      (
        await request(server)
          .get(path + '/' + first.body.id)
          .set('Authorization', 'Bearer ' + b.token)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(server)
          .get('/api/v1/portfolios/' + b.portfolio.id + '/refresh/' + first.body.id)
          .set('Authorization', 'Bearer ' + b.token)
      ).status,
    ).toBe(404);
    const state = await request(server)
      .get(path)
      .set('Authorization', 'Bearer ' + a.token);
    expect(RefreshStatus.safeParse(state.body).success).toBe(true);
    expect(JSON.stringify(first.body)).not.toMatch(/userId|portfolioId|password|tokenHash/);
  });
  it('HMAC local operator rejects unsigned/tampered/expired/replayed requests and unknown jobs', async () => {
    const server = app(),
      body = { key: 'protected_fixture' },
      path = '/internal/jobs/housekeeping',
      stamp = String(Date.now()),
      nonce = randomUUID();
    const signature = createHmac('sha256', env.JOB_HTTP_SECRET!)
      .update('POST\n' + path + '\n' + stamp + '\n' + nonce + '\n' + JSON.stringify(body))
      .digest('hex');
    expect((await request(server).post(path).send(body)).status).toBe(403);
    const send = () =>
      request(server)
        .post(path)
        .set('X-Folio-Job-Time', stamp)
        .set('X-Folio-Job-Nonce', nonce)
        .set('X-Folio-Job-Signature', signature)
        .send(body);
    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(403);
    expect(
      (
        await request(server)
          .post(path)
          .set('X-Folio-Job-Time', stamp)
          .set('X-Folio-Job-Nonce', randomUUID())
          .set('X-Folio-Job-Signature', '0'.repeat(64))
          .send(body)
      ).status,
    ).toBe(403);
    expect((await request(server).post('/internal/jobs/not-a-job').send(body)).status).toBe(403);
    expect(
      (
        await request(server)
          .post(path)
          .set('X-Folio-Job-Time', String(Date.now() - 120000))
          .set('X-Folio-Job-Nonce', randomUUID())
          .set('X-Folio-Job-Signature', signature)
          .send(body)
      ).status,
    ).toBe(403);
    const rateKey = jobs.namespace + ':jobs:operator-rate:housekeeping';
    await redis.del(rateKey);
    for (let n = 0; n < 11; n++) {
      const nonce = randomUUID(),
        stamp = String(Date.now());
      const signature = createHmac('sha256', env.JOB_HTTP_SECRET!)
        .update('POST\n' + path + '\n' + stamp + '\n' + nonce + '\n' + JSON.stringify(body))
        .digest('hex');
      const response = await request(server)
        .post(path)
        .set('X-Folio-Job-Time', stamp)
        .set('X-Folio-Job-Nonce', nonce)
        .set('X-Folio-Job-Signature', signature)
        .send(body);
      expect(response.status).toBe(n === 10 ? 429 : 202);
    }
    await redis.del(rateKey);
  });
  it('privacy export includes only owned jobs and account erasure removes them; no recreation from opaque queue', async () => {
    const a = await user(),
      b = await user('Bob');
    const first = await jobs.submit(a.identity, a.portfolio.id, randomUUID()),
      other = await jobs.submit(b.identity, b.portfolio.id, randomUUID());
    const exported = await domain.exportOwned(a.identity.user._id);
    expect(exported.jobs?.map((j) => j.id)).toEqual([first.id]);
    expect(exported.jobs?.some((j) => j.id === other.id)).toBe(false);
    await auth.deleteAccount(a.identity, password, { ip: 'test', userAgent: 'test' });
    expect(await jobs.models.Run.exists({ _id: first.id })).toBeNull();
    await jobs.execute(first.id);
    expect(await jobs.models.Run.exists({ _id: first.id })).toBeNull();
  });
  it('stateless implementation uses the same scoped fenced executor and preserves idempotency', async () => {
    const a = await user();
    await buy(a);
    new StatelessJobRunner(jobs);
    const key = randomUUID(),
      first = await jobs.submit(a.identity, a.portfolio.id, key),
      second = await jobs.submit(a.identity, a.portfolio.id, key);
    expect(first.state).toBe('completed');
    expect(second.id).toBe(first.id);
    expect(ticks).toBe(1);
    jobs.attach(runner);
    expect(
      () => new JobService(env, domain, market, redis, { timeoutMs: 20, leaseMs: 10 }),
    ).toThrow();
    expect(
      () =>
        new JobService({ ...env, NODE_ENV: 'development' }, domain, market, redis, {
          isolatedTestNamespace: namespace,
        }),
    ).toThrow();
  });
  it('recovers after hard worker termination, broker stall and application lease expiry', async () => {
    await runner.close();
    jobs = new JobService(env, domain, market, redis, {
      isolatedTestNamespace: namespace,
      timeoutMs: 800,
      leaseMs: 1200,
    });
    runner = new BullMQJobRunner(jobs);
    const a = await user();
    await buy(a);
    const before = await financialSnapshot(),
      run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
    const child = fork(new URL('./helpers/job-worker.ts', import.meta.url), [], {
      env: { ...process.env, NODE_ENV: 'test', FOLIO_JOB_NAMESPACE: namespace },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Test worker did not reach provider')),
          12000,
        );
        child.on('message', (value) => {
          if (value === 'provider-running') {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once('error', reject);
      });
      expect((await jobs.get(a.identity, a.portfolio.id, run.id)).state).toBe('running');
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGKILL');
      await exited;
      await new Promise((r) => setTimeout(r, 1300));
      await runner.start({ lockDuration: 1000, stalledInterval: 1000 });
      const result = await done(a, run.id);
      expect(result.state).toBe('completed');
      expect(result.attempts).toBe(2);
      expect(await financialSnapshot()).toBe(before);
      expect(await jobs.models.Observation.countDocuments()).toBe(1);
      expect(await redis.get(jobs.namespace + ':jobs:lease:market')).toBeNull();
    } finally {
      child.kill('SIGKILL');
    }
  }, 30000);
  it.runIf(process.env['FOLIO_JOB_FAULTS'] === '1')(
    'real Redis stop/start fails closed then reconnects without financial mutation',
    async () => {
      const docker = promisify(execFile),
        executable =
          process.platform === 'win32'
            ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
            : 'docker';
      const container = (
        await docker(executable, ['compose', '-f', 'docker-compose.yml', 'ps', '-q', 'redis'])
      ).stdout.trim();
      expect(container).toMatch(/^[a-f0-9]{64}$/);
      const a = await user();
      await buy(a);
      const before = await financialSnapshot();
      try {
        await docker(executable, ['stop', '-t', '1', container]);
        await expect(jobs.submit(a.identity, a.portfolio.id, randomUUID())).rejects.toMatchObject({
          status: 503,
        });
        expect(await jobs.models.Run.countDocuments()).toBe(0);
      } finally {
        await docker(executable, ['start', container]);
      }
      await expect
        .poll(async () => redis.ping().catch(() => null), { timeout: 15000 })
        .toBe('PONG');
      await runner.start();
      const key = randomUUID();
      let recoveredId = '';
      await expect
        .poll(
          async () => {
            try {
              recoveredId = (await jobs.submit(a.identity, a.portfolio.id, key)).id;
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 15000 },
        )
        .toBe(true);
      expect((await done(a, recoveredId)).state).toBe('completed');
      expect(await financialSnapshot()).toBe(before);
    },
    45000,
  );
  it.runIf(process.env['FOLIO_JOB_FAULTS'] === '1')(
    'real Mongo stop/start retains queued state and financial persistence',
    async () => {
      const docker = promisify(execFile),
        executable =
          process.platform === 'win32'
            ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
            : 'docker';
      const container = (
        await docker(executable, ['compose', '-f', 'docker-compose.yml', 'ps', '-q', 'mongo'])
      ).stdout.trim();
      expect(container).toMatch(/^[a-f0-9]{64}$/);
      const a = await user();
      await buy(a);
      const before = await financialSnapshot();
      const run = await jobs.submit(a.identity, a.portfolio.id, randomUUID());
      try {
        await docker(executable, ['stop', '-t', '1', container]);
        await expect(jobs.get(a.identity, a.portfolio.id, run.id)).rejects.toThrow();
      } finally {
        await docker(executable, ['start', container]);
      }
      await expect
        .poll(
          async () =>
            connection
              .db!.admin()
              .command({ hello: 1 })
              .then((h) => h.isWritablePrimary)
              .catch(() => false),
          { timeout: 20000 },
        )
        .toBe(true);
      expect((await jobs.get(a.identity, a.portfolio.id, run.id)).state).toBe('queued');
      await runner.start();
      expect((await done(a, run.id)).state).toBe('completed');
      expect(await financialSnapshot()).toBe(before);
    },
    45000,
  );
});
