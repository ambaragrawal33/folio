import { createHash } from 'node:crypto';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { z } from 'zod';
import { JobName } from '@folio/shared';
import type { JobStats, JobRun } from '@folio/shared';
import type { Env } from '../config/env.ts';
import type { DomainService } from '../services/domain.ts';
import type { Identity } from '../services/auth.ts';
import type { Instrument } from '@folio/shared';
import { HttpError } from '../utils/http-error.ts';
import { marketSession } from '../providers/calendars.ts';
import { jobModels, publicRun, emptyStats } from './models.ts';
import type { ObservedMarketGateway } from './observations.ts';
import { Lease, JobFailure } from './lease.ts';
export const jobPayload = z.strictObject({ runId: z.string().regex(/^[a-f0-9]{64}$/) });
const terminal: JobRun['state'][] = ['completed', 'degraded', 'unavailable', 'failed', 'cancelled'];
export interface JobRunner {
  enqueue(runId: string): Promise<void>;
  reconcile?(): Promise<void>;
  close(): Promise<void>;
}
export const retryDelay = (attempt: number) => Math.min(1000 * 2 ** Math.max(0, attempt - 1), 5000);
const unavailable = () =>
  new HttpError(
    503,
    'REFRESH_UNAVAILABLE',
    'Refresh is unavailable. Existing data has been retained. Please retry shortly.',
  );
export class JobService {
  readonly models;
  readonly env: Env;
  readonly domain: DomainService;
  readonly market: ObservedMarketGateway;
  readonly redis: Redis;
  readonly namespace: string;
  private runner: JobRunner | null = null;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly leaseMs: number;
  private readonly report: (value: {
    name: string;
    id: string;
    attempt: number;
    stats: JobStats;
    error: string | null;
  }) => void;
  constructor(
    env: Env,
    domain: DomainService,
    market: ObservedMarketGateway,
    redis: Redis,
    options: {
      now?: () => Date;
      timeoutMs?: number;
      leaseMs?: number;
      report?: JobService['report'];
      isolatedTestNamespace?: string;
    } = {},
  ) {
    this.env = env;
    this.domain = domain;
    this.market = market;
    this.redis = redis;
    if (
      options.isolatedTestNamespace &&
      (env.NODE_ENV !== 'test' || !/^[a-f0-9]{16}$/.test(options.isolatedTestNamespace))
    )
      throw new Error('Isolated job namespace is test-only');
    this.namespace =
      env.CACHE_NAMESPACE +
      (options.isolatedTestNamespace ? ':test:' + options.isolatedTestNamespace : '');
    this.models = jobModels(domain.auth.connection);
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.leaseMs = options.leaseMs ?? 20000;
    this.report = options.report ?? (() => {});
    if (this.leaseMs <= this.timeoutMs) throw new Error('Job lease must exceed execution deadline');
  }
  attach(runner: JobRunner) {
    this.runner = runner;
  }
  async initialize() {
    await Promise.all(Object.values(this.models).map((m) => m.init()));
  }
  private async owned(identity: Identity, portfolioId: string) {
    await this.domain.assertOwnedForRefresh(identity, portfolioId);
  }
  async status(identity: Identity, portfolioId: string) {
    await this.owned(identity, portfolioId);
    const latest = await this.models.Run.findOne({
      userId: identity.user._id,
      portfolioId: new Types.ObjectId(portfolioId),
    })
      .sort({ createdAt: -1, _id: 1 })
      .lean();
    return {
      enabled: this.env.LOCAL_JOBS_ENABLED && !this.env.DEMO_MODE,
      reason: this.env.DEMO_MODE
        ? 'This public demo is read-only.'
        : !this.env.LOCAL_JOBS_ENABLED
          ? 'Local refresh workers are not enabled.'
          : null,
      latest: latest ? publicRun(latest) : null,
    };
  }
  async get(identity: Identity, portfolioId: string, id: string) {
    await this.owned(identity, portfolioId);
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'This resource is unavailable.');
    const doc = await this.models.Run.findOne({
      _id: id,
      userId: identity.user._id,
      portfolioId: new Types.ObjectId(portfolioId),
    }).lean();
    if (!doc) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'This resource is unavailable.');
    return publicRun(doc);
  }
  async submit(identity: Identity, portfolioId: string, key: string) {
    await this.owned(identity, portfolioId);
    if (this.env.DEMO_MODE || identity.user.demoReadonly)
      throw new HttpError(403, 'DEMO_READ_ONLY', 'This public demo is read-only.');
    if (!z.uuid().safeParse(key).success)
      throw new HttpError(400, 'IDEMPOTENCY_REQUIRED', 'Use a valid refresh request identifier.');
    if (!this.env.LOCAL_JOBS_ENABLED || !this.runner) throw unavailable();
    await this.redis.ping().catch(() => {
      throw unavailable();
    });
    const id = createHash('sha256')
      .update('price-refresh\0' + identity.user._id.toHexString() + '\0' + portfolioId + '\0' + key)
      .digest('hex');
    await this.domain.auth.connection.transaction(async (session) => {
      if (await this.models.Run.exists({ _id: id }).session(session)) return;
      const user = await this.domain.auth.models.User.updateOne(
        { _id: identity.user._id, authVersion: identity.user.authVersion },
        { $inc: { domainVersion: 1 } },
        { session },
      );
      const portfolio = await this.domain.models.Portfolio.exists({
        _id: new Types.ObjectId(portfolioId),
        userId: identity.user._id,
      }).session(session);
      if (!user.matchedCount || !portfolio)
        throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'This resource is unavailable.');
      if (
        (await this.models.Run.countDocuments({
          userId: identity.user._id,
          portfolioId: new Types.ObjectId(portfolioId),
          state: { $in: ['queued', 'running', 'retrying'] },
        }).session(session)) >= 20
      )
        throw new HttpError(
          429,
          'REFRESH_QUEUE_FULL',
          'Your pending refresh queue is full. Check an existing refresh before retrying.',
        );
      await this.models.Run.updateOne(
        { _id: id },
        {
          $setOnInsert: {
            userId: identity.user._id,
            portfolioId: new Types.ObjectId(portfolioId),
            name: 'price-refresh',
          },
        },
        { upsert: true, session },
      );
    });
    const doc = await this.models.Run.findById(id).lean();
    if (!doc) throw unavailable();
    if (!terminal.includes(doc.state))
      await this.runner.enqueue(id).catch(() => {
        throw unavailable();
      });
    return publicRun((await this.models.Run.findById(id).lean()) ?? doc);
  }
  async operator(name: string, key: string) {
    const parsed = JobName.safeParse(name);
    if (!parsed.success || !/^[a-zA-Z0-9_-]{1,100}$/.test(key))
      throw new JobFailure('SCOPE_UNAVAILABLE');
    if (!this.env.LOCAL_JOBS_ENABLED || this.env.DEMO_MODE || !this.runner)
      throw new JobFailure('SCOPE_UNAVAILABLE');
    const id = createHash('sha256')
      .update('operator\0' + name + '\0' + key)
      .digest('hex');
    await this.models.Run.updateOne(
      { _id: id },
      { $setOnInsert: { userId: null, portfolioId: null, name: parsed.data } },
      { upsert: true },
    );
    const doc = await this.models.Run.findById(id).lean();
    if (!doc) throw new JobFailure('STORAGE_UNAVAILABLE');
    if (!terminal.includes(doc.state)) await this.runner.enqueue(id);
    return publicRun((await this.models.Run.findById(id).lean()) ?? doc);
  }
  async recover() {
    await this.runner?.reconcile?.();
    const docs = await this.models.Run.find({
      state: { $in: ['queued', 'retrying', 'running'] },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: this.now() } }],
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(25)
      .lean();
    for (const doc of docs) await this.runner?.enqueue(doc._id);
    return docs.length;
  }
  private async targets(run: {
    userId?: Types.ObjectId | null;
    portfolioId?: Types.ObjectId | null;
    name: string;
  }) {
    if (run.userId && run.portfolioId)
      return this.domain.refreshInstruments(run.userId, run.portfolioId);
    const users = await this.domain.auth.models.User.find({
      lastLoginAt: { $gte: new Date(this.now().getTime() - 7 * 86400000) },
      emailVerifiedAt: { $ne: null },
      demoReadonly: false,
    })
      .sort({ lastLoginAt: -1, _id: 1 })
      .limit(25)
      .select('_id')
      .lean();
    const portfolios = await this.domain.models.Portfolio.find({
      userId: { $in: users.map((u) => u._id) },
    })
      .sort({ _id: 1 })
      .limit(25)
      .lean();
    const instruments = new Map<string, Instrument>();
    for (const p of portfolios)
      for (const i of await this.domain.refreshInstruments(p.userId, p._id))
        if (instruments.size < 25) instruments.set(i.id, i);
    return [...instruments.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter(
        (i) =>
          this.env.LOCAL_FIXTURE_MODE ||
          marketSession(i.exchange, this.now()) ===
            (run.name === 'price-refresh' ? 'open' : 'closed'),
      );
  }
  private async housekeeping(stats: JobStats, guard: (session?: ClientSession) => Promise<void>) {
    for (const name of ['auth_tokens', 'refresh_tokens', 'refresh_families']) {
      const model = this.domain.auth.connection.db!.collection<{
        _id: Types.ObjectId;
        expiresAt: Date;
      }>(name);
      await guard();
      const ids = (
        await model
          .find({ expiresAt: { $lte: this.now() } }, { projection: { _id: 1 } })
          .sort({ expiresAt: 1, _id: 1 })
          .limit(100)
          .toArray()
      ).map((r) => r._id);
      const result = await model.deleteMany({ _id: { $in: ids }, expiresAt: { $lte: this.now() } });
      stats.cleaned += result.deletedCount;
    }
    await guard();
    const older = new Date(this.now().getTime() - 30 * 86400000);
    const ids = (
      await this.models.Run.find({ state: { $in: terminal }, finishedAt: { $lt: older } })
        .sort({ finishedAt: 1, _id: 1 })
        .limit(100)
        .select('_id')
        .lean()
    ).map((r) => r._id);
    stats.cleaned += (
      await this.models.Run.deleteMany({
        _id: { $in: ids },
        state: { $in: terminal },
        finishedAt: { $lt: older },
      })
    ).deletedCount;
  }
  async execute(id: string) {
    if (!jobPayload.safeParse({ runId: id }).success) throw new JobFailure('SCOPE_UNAVAILABLE');
    const found = await this.models.Run.findById(id).lean();
    if (!found || terminal.includes(found.state)) return;
    if (!JobName.safeParse(found.name).success) throw new JobFailure('SCOPE_UNAVAILABLE');
    const lease = new Lease(
      this.redis,
      this.namespace + ':jobs:lease:' + (found.name === 'housekeeping' ? 'housekeeping' : 'market'),
    );
    const controller = new AbortController(),
      stats = emptyStats(),
      started = performance.now();
    if (!(await lease.acquire(this.leaseMs))) throw new JobFailure('LOCK_CONTENDED');
    stats.lockWaitMs = Math.max(0, performance.now() - started);
    const deadline = new Date(this.now().getTime() + this.timeoutMs);
    const run = await this.models.Run.findOneAndUpdate(
      {
        _id: id,
        state: { $nin: terminal },
        attempts: { $lt: 3 },
        $or: [{ state: { $ne: 'running' } }, { leaseUntil: { $lte: this.now() } }],
      },
      {
        $inc: { attempts: 1, generation: 1 },
        $set: { state: 'running', startedAt: this.now(), leaseUntil: deadline, error: null },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!run) {
      await lease.release();
      throw new JobFailure('RETRY_EXHAUSTED');
    }
    const guard = async (session?: ClientSession) => {
      await lease.check(controller.signal);
      const filter = {
        _id: id,
        generation: run.generation,
        state: 'running' as const,
        leaseUntil: { $gte: this.now() },
      };
      if (session) {
        const updated = await this.models.Run.updateOne(filter, { $set: { stats } }, { session });
        if (!updated.matchedCount) throw new JobFailure('LOCK_LOST');
      } else if (!(await this.models.Run.exists(filter))) throw new JobFailure('LOCK_LOST');
      if (
        run.userId &&
        run.portfolioId &&
        !(await this.domain.models.Portfolio.exists({
          _id: run.portfolioId,
          userId: run.userId,
        }).session(session ?? null))
      )
        throw new JobFailure('SCOPE_UNAVAILABLE');
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new JobFailure('TIMEOUT'));
      }, this.timeoutMs);
    });
    const work = async () => {
      await guard();
      if (run.name === 'housekeeping') await this.housekeeping(stats, guard);
      else {
        const instruments = await this.targets(run);
        await guard();
        if (run.name === 'price-refresh')
          await this.market.refresh(instruments, stats, guard, controller.signal);
        else await this.market.captureCloses(instruments, stats, guard, controller.signal);
      }
      await guard();
    };
    try {
      await Promise.race([work(), timeout]);
      stats.durationMs = Math.max(0, performance.now() - started);
      const state =
        stats.missing === 0 && stats.stale === 0
          ? 'completed'
          : stats.accepted
            ? 'degraded'
            : 'unavailable';
      await this.models.Run.updateOne(
        { _id: id, generation: run.generation, state: 'running' },
        {
          $set: {
            state,
            finishedAt: this.now(),
            leaseUntil: null,
            stats,
            error: state === 'unavailable' ? 'PROVIDER_UNAVAILABLE' : null,
          },
        },
      );
      this.report({ name: run.name, id, attempt: run.attempts, stats, error: null });
    } catch (error) {
      controller.abort();
      const code = error instanceof JobFailure ? error.code : 'STORAGE_UNAVAILABLE';
      stats.durationMs = Math.max(0, performance.now() - started);
      await this.models.Run.updateOne(
        { _id: id, generation: run.generation, state: 'running' },
        {
          $set: {
            state: run.attempts >= 3 ? 'failed' : 'retrying',
            finishedAt: run.attempts >= 3 ? this.now() : null,
            leaseUntil: null,
            stats,
            error: code,
          },
        },
      ).catch(() => {});
      this.report({ name: run.name, id, attempt: run.attempts, stats, error: code });
      throw new JobFailure(code);
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      await lease.release().catch(() => {});
    }
  }
  async exhausted(id: string, code: JobRun['error'] = 'RETRY_EXHAUSTED') {
    await this.models.Run.updateOne(
      { _id: id, state: { $nin: terminal } },
      {
        $set: { state: 'failed', finishedAt: this.now(), leaseUntil: null, error: code },
      },
    );
  }
}
export class BullMQJobRunner implements JobRunner {
  readonly queue: Queue;
  private readonly connection: Redis;
  private readonly service: JobService;
  private worker: Worker | undefined;
  private workerConnection: Redis | undefined;
  constructor(service: JobService) {
    this.service = service;
    this.connection = new Redis(service.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 3000,
    });
    this.connection.on('error', () => {});
    this.queue = new Queue('market-jobs', {
      connection: this.connection,
      prefix: service.namespace + ':bull',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'folio' },
        removeOnComplete: { age: 7 * 86400, count: 1000 },
        removeOnFail: { age: 30 * 86400, count: 1000 },
      },
    });
    this.queue.on('error', () => {});
    service.attach(this);
  }
  async enqueue(runId: string) {
    jobPayload.parse({ runId });
    await this.connection.ping();
    const existing = await this.queue.getJob(runId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed' || state === 'completed')
        await this.service.exhausted(runId, 'WORKER_LOST');
      return;
    }
    const admitted = await this.connection.eval(
      "if redis.call('ZSCORE',KEYS[1],ARGV[1]) then return 1 end; if redis.call('ZCARD',KEYS[1])>=1000 then return 0 end; redis.call('ZADD',KEYS[1],ARGV[2],ARGV[1]); return 1",
      1,
      this.service.namespace + ':jobs:admissions',
      runId,
      String(Date.now()),
    );
    if (admitted !== 1) throw new JobFailure('STORAGE_UNAVAILABLE');
    await this.queue.add('run', { runId }, { jobId: runId });
  }
  async reconcile() {
    const key = this.service.namespace + ':jobs:admissions',
      ids = await this.connection.zrange(key, '0', '24');
    for (const id of ids) {
      const run = await this.service.models.Run.findById(id).lean();
      if (!run || terminal.includes(run.state)) {
        const job = await this.queue.getJob(id);
        if (job && (await job.getState()) !== 'active') await job.remove();
        await this.connection.zrem(key, id);
      }
    }
  }
  async start(options: { lockDuration?: number; stalledInterval?: number } = {}) {
    this.workerConnection = new Redis(this.service.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
    });
    this.workerConnection.on('error', () => {});
    this.worker = new Worker(
      'market-jobs',
      async (job: Job<z.infer<typeof jobPayload>>) => {
        const parsed = jobPayload.safeParse(job.data);
        if (job.name !== 'run' || !parsed.success)
          throw new UnrecoverableError('SCOPE_UNAVAILABLE');
        try {
          await this.service.execute(parsed.data.runId);
        } catch (error) {
          throw new Error(error instanceof JobFailure ? error.code : 'STORAGE_UNAVAILABLE');
        }
      },
      {
        connection: this.workerConnection,
        prefix: this.service.namespace + ':bull',
        concurrency: 1,
        lockDuration: options.lockDuration ?? 30000,
        stalledInterval: options.stalledInterval ?? 30000,
        maxStalledCount: 2,
        maxStartedAttempts: 6,
        settings: { backoffStrategy: retryDelay },
      },
    );
    this.worker.on('error', () => {});
    this.worker.on('completed', (job) => {
      void this.connection
        .zrem(this.service.namespace + ':jobs:admissions', job.id!)
        .catch(() => {});
    });
    this.worker.on('failed', (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3))
        void Promise.allSettled([
          this.service.exhausted(job.id!),
          this.connection.zrem(this.service.namespace + ':jobs:admissions', job.id!),
        ]);
    });
    await this.worker.waitUntilReady();
  }
  async stopWorker(force = false) {
    await this.worker?.close(force);
    this.worker = undefined;
    await this.workerConnection?.quit().catch(() => {});
    this.workerConnection = undefined;
  }
  async close() {
    await this.stopWorker();
    await this.queue.close();
    await this.connection.quit().catch(() => {});
  }
}
export class StatelessJobRunner implements JobRunner {
  private readonly service: JobService;
  constructor(service: JobService) {
    this.service = service;
    service.attach(this);
  }
  async enqueue(runId: string) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.service.execute(runId);
        return;
      } catch {
        if (attempt === 3) {
          await this.service.exhausted(runId);
          return;
        }
        await new Promise((r) => setTimeout(r, retryDelay(attempt)));
      }
    }
  }
  async close() {}
}
