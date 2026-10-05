import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import type { ClientSession, HydratedDocument } from 'mongoose';
import type { z } from 'zod';
import {
  Instrument,
  TransactionInput,
  Portfolio,
  DomainExport,
  LedgerPage,
  Valuation,
} from '@folio/shared';
import type { FxProvenance, HoldingsQuery } from '@folio/shared';
import { domainModels } from '../models/domain.ts';
import type { EconomicDocument, VoidDocument, PortfolioDocument } from '../models/domain.ts';
import type { AuthService, Identity } from './auth.ts';
import type { MarketGateway } from '../providers/market.ts';
import { replayLedger, nativeCashFlow } from './financial/ledger.ts';
import type { EconomicRecord, VoidEvent } from './financial/ledger.ts';
import { FinancialError, decimal, readStoredDecimal, storedDecimal } from './financial/decimal.ts';
import { valuePortfolio } from './financial/valuation.ts';
import { HttpError } from '../utils/http-error.ts';
import { catalogueSearch, gatedDiscovery, verifiedRegistry } from '../providers/discovery.ts';
import type { InstrumentDiscovery } from '../providers/discovery.ts';
import type { InstrumentSearchQuery } from '@folio/shared';

const notFound = () => new HttpError(404, 'RESOURCE_NOT_FOUND', 'This resource is unavailable.');
const readonly = () => new HttpError(403, 'DEMO_READ_ONLY', 'This public demo is read-only.');
const objectId = (id: string) => {
  if (!/^[a-f\d]{24}$/i.test(id)) throw notFound();
  return new Types.ObjectId(id);
};
const sameCurrency = (currency: string, date: string): FxProvenance => ({
  rate: '1',
  rateDate: date,
  source: 'identity',
  reference: `${currency}/${currency}`,
});
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
const zones = {
  NSE: 'Asia/Kolkata',
  BSE: 'Asia/Kolkata',
  US: 'America/New_York',
  CRYPTO: 'UTC',
} as const;
export function economicRecord(doc: EconomicDocument & { _id: Types.ObjectId }): EconomicRecord {
  const common = {
    id: doc._id.toHexString(),
    instrumentId: doc.instrumentId,
    sequence: doc.sequence,
    currency: doc.currency,
    baseCurrency: doc.baseCurrency,
    effectiveAt: doc.effectiveAt.toISOString(),
    tradingDate: doc.tradingDate,
    fx: {
      rate: readStoredDecimal(doc.fx.rate),
      rateDate: doc.fx.rateDate,
      source: doc.fx.source,
      reference: doc.fx.reference,
    },
  };
  if (doc.type === 'BUY' || doc.type === 'SELL')
    return {
      ...common,
      type: doc.type,
      quantity: readStoredDecimal(doc.quantity!),
      price: readStoredDecimal(doc.price!),
      fees: readStoredDecimal(doc.fees!),
    };
  if (doc.type === 'DIVIDEND')
    return {
      ...common,
      type: doc.type,
      grossAmount: readStoredDecimal(doc.grossAmount!),
      fees: readStoredDecimal(doc.fees!),
    };
  return {
    ...common,
    type: 'SPLIT',
    numerator: readStoredDecimal(doc.numerator!),
    denominator: readStoredDecimal(doc.denominator!),
  };
}
const voidEvent = (doc: VoidDocument & { _id: Types.ObjectId }): VoidEvent => ({
  id: doc._id.toHexString(),
  transactionId: doc.transactionId.toHexString(),
  reason: doc.reason,
  recordedAt: doc.recordedAt.toISOString(),
});
export const portfolioView = (doc: HydratedDocument<PortfolioDocument>) =>
  Portfolio.parse({
    id: doc._id.toHexString(),
    name: doc.name,
    baseCurrency: doc.baseCurrency,
    costBasis: doc.costBasis,
    currencyLockedAt: doc.currencyLockedAt?.toISOString() ?? null,
    revision: doc.revision,
  });
export class DomainService {
  readonly models;
  readonly auth: AuthService;
  readonly market: MarketGateway;
  private readonly clock: () => Date;
  private readonly discovery: InstrumentDiscovery;
  constructor(
    auth: AuthService,
    market: MarketGateway,
    clock: () => Date = () => new Date(),
    discovery: InstrumentDiscovery = gatedDiscovery(),
  ) {
    this.auth = auth;
    this.market = market;
    this.clock = clock;
    this.discovery = discovery;
    this.models = domainModels(auth.connection);
    auth.registerAccountResources({
      export: (userId) => this.exportOwned(userId),
      delete: (userId, session) => this.deleteOwned(userId, session),
    });
  }
  async initialize(master: readonly Instrument[]) {
    await Promise.all(Object.values(this.models).map((m) => m.init()));
    for (const candidate of verifiedRegistry(master)) {
      const { id, ...entry } = Instrument.parse(candidate);
      const existing = await this.models.Instrument.findById(id).lean();
      if (existing) {
        const { _id, ...stored } = existing;
        const current = Instrument.parse({ id: _id, ...stored });
        if (JSON.stringify(current) !== JSON.stringify(Instrument.parse(candidate)))
          throw new Error('Stored canonical instrument conflicts with verified registry');
      }
      await this.models.Instrument.updateOne(
        { _id: id },
        { $setOnInsert: entry },
        { upsert: true },
      );
    }
  }
  private async touchUser(identity: Identity, session: ClientSession) {
    if (identity.user.demoReadonly) throw readonly();
    const changed = await this.auth.models.User.updateOne(
      { _id: identity.user._id, authVersion: identity.user.authVersion, demoReadonly: false },
      { $inc: { domainVersion: 1 } },
      { session },
    );
    if (changed.matchedCount !== 1)
      throw new HttpError(401, 'AUTH_REQUIRED', 'Your session has expired. Please sign in again.');
  }
  async portfolios(identity: Identity) {
    return (
      await this.models.Portfolio.find({ userId: identity.user._id }).sort({ key: 1, _id: 1 })
    ).map(portfolioView);
  }
  async createDefault(identity: Identity) {
    const found = await this.models.Portfolio.findOne({
      userId: identity.user._id,
      key: 'default',
    });
    if (found) return portfolioView(found);
    return this.auth.connection.transaction(async (session) => {
      await this.touchUser(identity, session);
      const current = await this.models.Portfolio.findOne({
        userId: identity.user._id,
        key: 'default',
      }).session(session);
      if (current) return portfolioView(current);
      const [created] = await this.models.Portfolio.create(
        [{ userId: identity.user._id, key: 'default', baseCurrency: identity.user.baseCurrency }],
        { session },
      );
      return portfolioView(created!);
    });
  }
  private async owned(identity: Identity, id: string, session?: ClientSession) {
    const query = this.models.Portfolio.findOne({ _id: objectId(id), userId: identity.user._id });
    const doc = await (session ? query.session(session) : query);
    if (!doc) throw notFound();
    return doc;
  }
  async instruments(query: string) {
    return catalogueSearch(await this.catalogue(), query, 30).instruments;
  }
  private async catalogue() {
    const found = await this.models.Instrument.find().sort({ _id: 1 }).limit(1001).lean();
    if (found.length > 1000)
      throw new HttpError(
        503,
        'CATALOGUE_CAPACITY',
        'The verified instrument catalogue is unavailable.',
      );
    return found.map(({ _id, ...data }) => Instrument.parse({ id: _id, ...data }));
  }
  async discover(query: z.infer<typeof InstrumentSearchQuery>) {
    return this.discovery.search(await this.catalogue(), query);
  }
  private async entries(identity: Identity, portfolioId: Types.ObjectId, session?: ClientSession) {
    const economicQuery = this.models.Economic.find({ userId: identity.user._id, portfolioId })
      .sort({ effectiveAt: 1, sequence: 1 })
      .limit(10001);
    const economic = await (session ? economicQuery.session(session) : economicQuery).lean();
    if (economic.length > 10000)
      throw new HttpError(
        409,
        'LEDGER_CAPACITY',
        'This portfolio exceeds the supported ledger capacity.',
      );
    const voidQuery = this.models.Void.find({ userId: identity.user._id, portfolioId }).sort({
      recordedAt: 1,
      _id: 1,
    });
    const voids = await (session ? voidQuery.session(session) : voidQuery).lean();
    return { records: economic.map(economicRecord), voids: voids.map(voidEvent) };
  }
  private async project(
    identity: Identity,
    portfolio: HydratedDocument<PortfolioDocument>,
    records: EconomicRecord[],
    voids: VoidEvent[],
    session: ClientSession,
  ) {
    const projection = replayLedger(records, voids);
    await this.models.Projection.deleteMany(
      { userId: identity.user._id, portfolioId: portfolio._id },
      { session },
    );
    if (projection.positions.length)
      await this.models.Projection.create(
        projection.positions.map((p) => ({
          userId: identity.user._id,
          portfolioId: portfolio._id,
          instrumentId: p.instrumentId,
          quantity: storedDecimal(p.quantity, 18),
          revision: portfolio.revision,
          projectionVersion: 1,
        })),
        { session, ordered: true },
      );
    return projection;
  }
  async append(identity: Identity, portfolioId: string, raw: unknown, idempotencyKey: string) {
    if (identity.user.demoReadonly) throw readonly();
    const parsed = TransactionInput.safeParse(raw);
    if (!parsed.success)
      throw new HttpError(400, 'VALIDATION_ERROR', 'Check the transaction fields and dates.');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey))
      throw new HttpError(
        400,
        'IDEMPOTENCY_REQUIRED',
        'A valid transaction request identifier is required.',
      );
    const input = parsed.data;
    const portfolio = await this.owned(identity, portfolioId);
    const requestHash = createHash('sha256').update(canonical(input)).digest('hex');
    const previous = await this.models.Economic.findOne({
      userId: identity.user._id,
      portfolioId: portfolio._id,
      idempotencyKey,
    });
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new HttpError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request identifier was already used for a different transaction.',
        );
      return { record: economicRecord(previous), duplicate: true };
    }
    const rawInstrument = await this.models.Instrument.findById(input.instrumentId).lean();
    if (!rawInstrument) throw notFound();
    const { _id, ...instrumentData } = rawInstrument;
    const instrument = Instrument.parse({ id: _id, ...instrumentData });
    const effective = new Date(input.effectiveAt);
    if (effective > this.clock())
      throw new HttpError(
        400,
        'FUTURE_TRANSACTION',
        'Future-dated transactions are not supported.',
      );
    const exchangeDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: zones[instrument.exchange],
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(effective);
    if (exchangeDate !== input.tradingDate)
      throw new HttpError(
        400,
        'TRADING_DATE_MISMATCH',
        'The trading date must match the effective instant in the instrument exchange timezone.',
      );
    if (instrument.currency === portfolio.baseCurrency && input.historicalFxOverride)
      throw new HttpError(
        400,
        'IDENTITY_FX_OVERRIDE',
        'Base-currency transactions use an FX rate of 1. Remove the FX override.',
      );
    const fx =
      instrument.currency === portfolio.baseCurrency
        ? sameCurrency(instrument.currency, input.tradingDate)
        : (input.historicalFxOverride ??
          (await this.market.historicalFx(
            instrument.currency,
            portfolio.baseCurrency,
            input.tradingDate,
          )));
    if (!fx)
      throw new HttpError(
        422,
        'HISTORICAL_FX_UNAVAILABLE',
        'Historical reference FX is unavailable. Add an explicit historical FX override with its source.',
      );
    try {
      return await this.auth.connection.transaction(async (session) => {
        await this.touchUser(identity, session);
        const current = await this.owned(identity, portfolioId, session);
        const duplicate = await this.models.Economic.findOne({
          userId: identity.user._id,
          portfolioId: current._id,
          idempotencyKey,
        }).session(session);
        if (duplicate) {
          if (duplicate.requestHash !== requestHash)
            throw new HttpError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This request identifier was already used for a different transaction.',
            );
          return { record: economicRecord(duplicate), duplicate: true };
        }
        const data = await this.entries(identity, current._id, session);
        if (data.records.length >= 10000)
          throw new HttpError(
            409,
            'LEDGER_CAPACITY',
            'A portfolio supports at most 10,000 economic records.',
          );
        current.revision += 1;
        current.nextSequence += 1;
        current.currencyLockedAt ??= this.clock();
        current.dirtyFrom =
          current.dirtyFrom && current.dirtyFrom < effective ? current.dirtyFrom : effective;
        await current.save({ session });
        const { _id: newId } = new this.models.Economic();
        const record: EconomicRecord = {
          ...input,
          id: newId.toHexString(),
          sequence: current.nextSequence,
          currency: instrument.currency,
          baseCurrency: current.baseCurrency,
          fx,
        };
        const projection = replayLedger([...data.records, record], data.voids);
        const { historicalFxOverride: discarded, ...fields } = input;
        void discarded;
        const values = Object.fromEntries(
          Object.entries(fields)
            .filter(([key]) =>
              ['quantity', 'price', 'fees', 'grossAmount', 'numerator', 'denominator'].includes(
                key,
              ),
            )
            .map(([key, value]) => [
              key,
              storedDecimal(
                String(value),
                key === 'quantity' ? 18 : key === 'price' ? 10 : undefined,
              ),
            ]),
        );
        await this.models.Economic.create(
          [
            {
              ...fields,
              ...values,
              _id: newId,
              userId: identity.user._id,
              portfolioId: current._id,
              sequence: current.nextSequence,
              idempotencyKey,
              requestHash,
              currency: record.currency,
              baseCurrency: record.baseCurrency,
              fx: { ...fx, rate: storedDecimal(fx.rate) },
              effectiveAt: effective,
              recordedAt: this.clock(),
            },
          ],
          { session },
        );
        await this.project(identity, current, [...data.records, record], data.voids, session);
        await this.auth.audit(
          'ledger.recorded',
          identity.user._id,
          { ip: 'domain', userAgent: 'domain' },
          input.type,
          undefined,
          session,
        );
        void projection;
        return { record, duplicate: false };
      });
    } catch (error) {
      if (error instanceof FinancialError) throw new HttpError(422, error.code, error.message);
      throw error;
    }
  }
  async void(identity: Identity, portfolioId: string, transactionId: string, reason: string) {
    if (identity.user.demoReadonly) throw readonly();
    if (reason.trim().length < 3 || reason.length > 500)
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Enter a clear reason for voiding this transaction.',
      );
    try {
      return await this.auth.connection.transaction(async (session) => {
        await this.touchUser(identity, session);
        const portfolio = await this.owned(identity, portfolioId, session);
        const target = await this.models.Economic.findOne({
          _id: objectId(transactionId),
          portfolioId: portfolio._id,
          userId: identity.user._id,
        }).session(session);
        if (!target) throw notFound();
        const existing = await this.models.Void.findOne({
          transactionId: target._id,
          userId: identity.user._id,
        }).session(session);
        if (existing) return { event: voidEvent(existing), duplicate: true };
        const data = await this.entries(identity, portfolio._id, session);
        const event: VoidEvent = {
          id: new Types.ObjectId().toHexString(),
          transactionId: target._id.toHexString(),
          reason: reason.trim(),
          recordedAt: this.clock().toISOString(),
        };
        replayLedger(data.records, [...data.voids, event]);
        portfolio.revision += 1;
        portfolio.dirtyFrom =
          portfolio.dirtyFrom && portfolio.dirtyFrom < target.effectiveAt
            ? portfolio.dirtyFrom
            : target.effectiveAt;
        await portfolio.save({ session });
        await this.models.Void.create(
          [
            {
              _id: objectId(event.id),
              transactionId: target._id,
              portfolioId: portfolio._id,
              userId: identity.user._id,
              reason: event.reason,
              recordedAt: this.clock(),
            },
          ],
          { session },
        );
        await this.project(identity, portfolio, data.records, [...data.voids, event], session);
        await this.auth.audit(
          'ledger.voided',
          identity.user._id,
          { ip: 'domain', userAgent: 'domain' },
          event.reason,
          undefined,
          session,
        );
        return { event, duplicate: false };
      });
    } catch (error) {
      if (error instanceof FinancialError) throw new HttpError(422, error.code, error.message);
      throw error;
    }
  }
  async ledger(
    identity: Identity,
    portfolioId: string,
    page: number,
    pageSize: number,
    query = '',
    type = '',
    order: 'asc' | 'desc' = 'desc',
  ) {
    const { data } = await this.state(identity, portfolioId);
    const projection = replayLedger(data.records, data.voids);
    const matches = data.records.filter(
      (r) =>
        (!type || r.type === type) &&
        (!query ||
          [r.id, r.instrumentId, r.type, r.tradingDate].some((v) =>
            v.toLowerCase().includes(query.toLowerCase()),
          )),
    );
    if (order === 'desc') matches.reverse();
    return LedgerPage.parse({
      items: matches.slice((page - 1) * pageSize, page * pageSize).map((record) => ({
        record,
        nativeCashFlow: projection.cashFlows[record.id] ?? nativeCashFlow(record),
        void: data.voids.find((v) => v.transactionId === record.id) ?? null,
      })),
      page,
      pageSize,
      total: matches.length,
    });
  }
  async valuation(identity: Identity, portfolioId: string) {
    const { portfolio, data } = await this.state(identity, portfolioId);
    const projection = replayLedger(data.records, data.voids);
    const ids = projection.positions.map((p) => p.instrumentId);
    const docs = await this.models.Instrument.find({ _id: { $in: ids } }).lean();
    const instruments = docs.map(({ _id, ...fields }) => Instrument.parse({ id: _id, ...fields }));
    const quotes = await this.market.quotes(instruments);
    const rates = await this.market.rates(
      [...new Set(instruments.map((i) => i.currency))],
      portfolio.baseCurrency,
    );
    return Valuation.parse(
      valuePortfolio(projection.positions, instruments, quotes, rates, portfolio.baseCurrency),
    );
  }
  private async state(identity: Identity, portfolioId: string) {
    return this.auth.connection.transaction(
      async (session) => {
        const portfolio = await this.owned(identity, portfolioId, session);
        const data = await this.entries(identity, portfolio._id, session);
        return { portfolio, data };
      },
      { readConcern: { level: 'snapshot' } },
    );
  }
  async holdings(identity: Identity, portfolioId: string, q: HoldingsQuery) {
    const valuation = await this.valuation(identity, portfolioId);
    const items = valuation.holdings.filter(
      (h) =>
        (!q.assetClass || h.instrument.assetClass === q.assetClass) &&
        (!q.sector || h.instrument.sector === q.sector) &&
        (!q.q ||
          [h.instrument.name, h.instrument.symbol, h.instrumentId].some((v) =>
            v.toLowerCase().includes(q.q.toLowerCase()),
          )),
    );
    items.sort((a, b) => {
      let compared: number;
      if (q.sort === 'instrument')
        compared = a.instrument.symbol.localeCompare(b.instrument.symbol);
      else {
        const left = a[q.sort];
        const right = b[q.sort];
        if (left === null || right === null)
          return left === right
            ? a.instrumentId.localeCompare(b.instrumentId)
            : left === null
              ? 1
              : -1;
        compared = decimal(left).comparedTo(decimal(right));
      }
      return (
        (q.order === 'desc' ? -compared : compared) || a.instrumentId.localeCompare(b.instrumentId)
      );
    });
    return {
      items: items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      page: q.page,
      pageSize: q.pageSize,
      total: items.length,
    };
  }
  async holding(identity: Identity, portfolioId: string, instrumentId: string) {
    const holding = (await this.valuation(identity, portfolioId)).holdings.find(
      (h) => h.instrumentId === instrumentId,
    );
    if (!holding) throw notFound();
    return holding;
  }
  async history(identity: Identity, portfolioId: string, instrumentId: string) {
    await this.owned(identity, portfolioId);
    const doc = await this.models.Instrument.findById(instrumentId).lean();
    if (!doc) throw notFound();
    const { _id, ...fields } = doc;
    return this.market.history(Instrument.parse({ id: _id, ...fields }));
  }
  async search(identity: Identity, query: string) {
    const instruments = await this.instruments(query);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows = await this.models.Economic.find({
      userId: identity.user._id,
      $or: [
        { instrumentId: { $regex: escaped, $options: 'i' } },
        { type: { $regex: escaped, $options: 'i' } },
        { tradingDate: { $regex: escaped } },
        ...(/^[a-f\d]{24}$/i.test(query) ? [{ _id: objectId(query) }] : []),
      ],
    })
      .sort({ effectiveAt: -1, sequence: -1, _id: 1 })
      .limit(20)
      .lean();
    return {
      instruments,
      ledger: rows.map((row) => ({
        record: economicRecord(row),
        portfolioId: row.portfolioId.toHexString(),
      })),
    };
  }
  async exportOwned(userId: Types.ObjectId) {
    return this.auth.connection.transaction(
      async (session) => {
        const portfolios = await this.models.Portfolio.find({ userId })
          .sort({ key: 1, _id: 1 })
          .session(session);
        const records = (
          await this.models.Economic.find({ userId })
            .sort({ portfolioId: 1, effectiveAt: 1, sequence: 1 })
            .session(session)
            .lean()
        ).map(economicRecord);
        const voids = (
          await this.models.Void.find({ userId })
            .sort({ recordedAt: 1, _id: 1 })
            .session(session)
            .lean()
        ).map(voidEvent);
        return DomainExport.parse({
          portfolios: portfolios.map(portfolioView),
          ledger: records.map((record) => ({
            record,
            nativeCashFlow: nativeCashFlow(record),
            void: voids.find((v) => v.transactionId === record.id) ?? null,
          })),
          projectionVersion: 1,
        });
      },
      { readConcern: { level: 'snapshot' } },
    );
  }
  private async deleteOwned(userId: Types.ObjectId, session: ClientSession) {
    // Privacy erasure is the sole append-only deletion exception, inside the account transaction.
    await this.models.Economic.collection.deleteMany({ userId }, { session });
    await this.models.Void.collection.deleteMany({ userId }, { session });
    await this.models.Projection.deleteMany({ userId }, { session });
    await this.models.Portfolio.deleteMany({ userId }, { session });
  }
}
