import { Quote, PriceHistory } from '@folio/shared';
import type { JobStats, Instrument } from '@folio/shared';
import type { z } from 'zod';
import type { Connection, ClientSession } from 'mongoose';
import type { MarketGateway } from '../providers/market.ts';
import { jobModels } from './models.ts';
import { JobFailure } from './lease.ts';
import { decimal, storedDecimal, readStoredDecimal } from '../services/financial/decimal.ts';
import {
  quoteFreshness,
  marketSession,
  exchangeDate,
  completedSessionDate,
} from '../providers/calendars.ts';
type Guard = (session?: ClientSession) => Promise<void>;
export class ObservedMarketGateway implements MarketGateway {
  readonly upstream: MarketGateway;
  readonly models;
  private readonly connection: Connection;
  private readonly fixture: boolean;
  private readonly now: () => Date;
  constructor(
    connection: Connection,
    upstream: MarketGateway,
    fixture: boolean,
    now: () => Date = () => new Date(),
  ) {
    this.connection = connection;
    this.upstream = upstream;
    this.fixture = fixture;
    this.now = now;
    this.models = jobModels(connection);
  }
  capability(instrument: Instrument) {
    return (
      this.upstream.capability?.(instrument) ?? {
        quotes: false,
        closes: false,
        reason: 'Provider refresh capability is unavailable.',
      }
    );
  }
  async quotes(instruments: readonly Instrument[]) {
    const docs = await this.models.Observation.find({
      _id: { $in: instruments.map((i) => i.id) },
    }).lean();
    const result: z.infer<typeof Quote>[] = [];
    for (const doc of docs) {
      const instrument = instruments.find((i) => i.id === doc._id);
      if (
        !instrument ||
        doc.currency !== instrument.currency ||
        doc.fixture !== this.fixture ||
        this.capability(instrument).display === false
      )
        continue;
      const status =
        doc.status === 'stale' ||
        (this.fixture
          ? this.now().getTime() - doc.observedAt.getTime() > 300000
          : quoteFreshness(instrument, doc.asOf, this.now()) === 'stale')
          ? 'stale'
          : 'fresh';
      result.push(
        Quote.parse({
          instrumentId: doc._id,
          currency: doc.currency,
          price: readStoredDecimal(doc.price),
          referencePrice: doc.referencePrice ? readStoredDecimal(doc.referencePrice) : null,
          referencePeriod: doc.referencePeriod,
          source: doc.source,
          asOf: doc.asOf.toISOString(),
          status,
          fixture: doc.fixture,
        }),
      );
    }
    const unobserved = instruments.filter((i) => !result.some((q) => q.instrumentId === i.id));
    // Compatibility reads do not persist or manufacture a Mongo observation.
    if (unobserved.length) result.push(...(await this.upstream.quotes(unobserved)));
    return result;
  }
  rates(currencies: readonly string[], base: string) {
    return this.upstream.rates(currencies, base);
  }
  historicalFx(currency: string, base: string, date: string) {
    return this.upstream.historicalFx(currency, base, date);
  }
  historicalFxForCommit(currency: string, base: string, date: string) {
    return this.upstream.historicalFxForCommit
      ? this.upstream.historicalFxForCommit(currency, base, date)
      : this.upstream
          .historicalFx(currency, base, date)
          .then((fx) => (fx ? { fx, stale: false } : null));
  }
  history(instrument: Instrument) {
    return this.upstream.history(instrument);
  }
  async refresh(
    instruments: readonly Instrument[],
    stats: JobStats,
    guard: Guard,
    signal: AbortSignal,
  ) {
    if (instruments.length > 25) throw new JobFailure('PROVIDER_MALFORMED');
    stats.requested = instruments.length;
    await guard();
    const old = await this.models.Observation.find({
      _id: { $in: instruments.map((i) => i.id) },
    }).lean();
    const recent = new Set(
      old
        .filter(
          (q) =>
            q.currency === instruments.find((i) => i.id === q._id)?.currency &&
            q.fixture === this.fixture &&
            this.capability(instruments.find((i) => i.id === q._id)!).display !== false &&
            q.status === 'fresh' &&
            this.now().getTime() - q.observedAt.getTime() < 60000 &&
            (this.fixture ||
              quoteFreshness(
                instruments.find((i) => i.id === q._id)!,
                q.asOf,
                this.now(),
              ) === 'fresh'),
        )
        .map((q) => q._id),
    );
    const targets = instruments.filter(
      (i) =>
        !recent.has(i.id) &&
        this.capability(i).quotes &&
        (this.fixture || marketSession(i.exchange, this.now()) === 'open'),
    );
    stats.reused = recent.size;
    stats.accepted = recent.size;
    const started = performance.now();
    let raw: unknown = [];
    if (targets.length) {
      try {
        raw = await (this.upstream.refreshQuotes
          ? this.upstream.refreshQuotes(targets, signal)
          : this.upstream.quotes(targets));
      } catch {
        throw new JobFailure('PROVIDER_UNAVAILABLE');
      }
    }
    stats.providerMs = Math.max(0, performance.now() - started);
    await guard();
    const parsed = Quote.array().max(25).safeParse(raw);
    if (!parsed.success) throw new JobFailure('PROVIDER_MALFORMED');
    const unique = new Set<string>();
    for (const q of parsed.data) {
      const i = targets.find((i) => i.id === q.instrumentId);
      if (
        !i ||
        i.currency !== q.currency ||
        q.fixture !== this.fixture ||
        unique.has(q.instrumentId) ||
        new Date(q.asOf) > this.now() ||
        decimal(q.price).isNegative() ||
        q.source.length > 500
      )
        throw new JobFailure('PROVIDER_MALFORMED');
      try {
        storedDecimal(q.price);
        if (q.referencePrice !== null) storedDecimal(q.referencePrice);
      } catch {
        throw new JobFailure('PROVIDER_MALFORMED');
      }
      unique.add(q.instrumentId);
    }
    for (const q of parsed.data) {
      await guard();
      await this.connection.transaction(async (session) => {
        await guard(session);
        const prior = await this.models.Observation.findById(q.instrumentId)
          .session(session)
          .lean();
        if (prior && prior.asOf > new Date(q.asOf)) return;
        const observedAt = q.status === 'stale' && prior ? prior.observedAt : this.now();
        await this.models.Observation.updateOne(
          { _id: q.instrumentId },
          {
            $set: {
              currency: q.currency,
              price: storedDecimal(q.price),
              referencePrice: q.referencePrice === null ? null : storedDecimal(q.referencePrice),
              referencePeriod: q.referencePeriod,
              source: q.source,
              asOf: new Date(q.asOf),
              observedAt,
              status: q.status,
              fixture: q.fixture,
            },
          },
          { upsert: true, session },
        );
        await guard(session);
      });
      stats.accepted++;
      if (q.status === 'stale') stats.stale++;
    }
    stats.missing = stats.requested - stats.accepted;
  }
  async captureCloses(
    instruments: readonly Instrument[],
    stats: JobStats,
    guard: Guard,
    signal: AbortSignal,
  ) {
    stats.requested = instruments.length;
    for (const i of instruments) {
      await guard();
      if (
        !this.capability(i).closes ||
        i.exchange === 'CRYPTO' ||
        (!this.fixture && marketSession(i.exchange, this.now()) !== 'closed')
      ) {
        stats.missing++;
        continue;
      }
      const started = performance.now();
      const rawHistory = await this.upstream.history(i);
      const checkedHistory = PriceHistory.extend({
        points: PriceHistory.shape.points.max(400),
      }).safeParse(rawHistory);
      if (!checkedHistory.success) throw new JobFailure('PROVIDER_MALFORMED');
      const history = checkedHistory.data;
      stats.providerMs += performance.now() - started;
      await guard();
      if (signal.aborted) throw new JobFailure('TIMEOUT');
      if (history.status !== 'available' || history.fixture !== this.fixture || !history.source) {
        stats.missing++;
        continue;
      }
      const date = this.fixture
        ? exchangeDate(this.now(), i.exchange)
        : completedSessionDate(i.exchange, this.now());
      if (!date) {
        stats.missing++;
        continue;
      }
      const point = history.points
        .filter((p) => p.date <= date)
        .toSorted((a, b) => b.date.localeCompare(a.date))[0];
      if (!point || (!this.fixture && point.date !== date)) {
        stats.missing++;
        continue;
      }
      if (decimal(point.price).isNegative()) throw new JobFailure('PROVIDER_MALFORMED');
      try {
        storedDecimal(point.price);
      } catch {
        throw new JobFailure('PROVIDER_MALFORMED');
      }
      await this.connection.transaction(async (session) => {
        await guard(session);
        await this.models.Close.updateOne(
          { instrumentId: i.id, date: point.date },
          {
            $setOnInsert: {
              close: storedDecimal(point.price),
              currency: i.currency,
              source: history.source,
              observedAt: this.now(),
              basis: this.fixture ? 'synthetic-fixture' : 'observed-split-adjusted',
              fixture: this.fixture,
            },
          },
          { upsert: true, session },
        );
        await guard(session);
      });
      stats.accepted++;
    }
  }
}
