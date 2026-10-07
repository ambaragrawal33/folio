import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import type { ClientSession, HydratedDocument } from 'mongoose';
import { z } from 'zod';
import {
  Instrument,
  TransactionInput,
  Portfolio,
  DomainExport,
  LedgerPage,
  Valuation,
  TransactionPreview,
  FxProvenance,
  AssetDetailResponse,
  RenamePortfolioInput,
  DeletePortfolioInput,
  PortfolioManagement,
  DeletePortfolioResponse,
} from '@folio/shared';
import type { HoldingsQuery } from '@folio/shared';
import type { AssetDetailQuery } from '@folio/shared';
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

import { transactionEffects } from './transaction-preview.ts';
import { previewHash, signPreview, readPreview } from './preview-receipt.ts';
import type { PreviewScope } from './preview-receipt.ts';
import { jobModels, publicRun } from '../jobs/models.ts';

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
    managementVersion: doc.managementVersion ?? 0,
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
    await Promise.all(Object.values(jobModels(this.auth.connection)).map((m) => m.init()));
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
  private async deletionReason(
    portfolio: HydratedDocument<PortfolioDocument>,
    session?: ClientSession,
  ) {
    const query = { portfolioId: portfolio._id };
    const economic = this.models.Economic.exists(query);
    const voids = this.models.Void.exists(query);
    const projection = this.models.Projection.exists(query);
    if (
      portfolio.currencyLockedAt ||
      portfolio.dirtyFrom ||
      portfolio.nextSequence > 0 ||
      portfolio.revision > 0 ||
      (await (session ? economic.session(session) : economic)) ||
      (await (session ? voids.session(session) : voids)) ||
      (await (session ? projection.session(session) : projection))
    )
      return 'This portfolio has transaction history or economic state and cannot be deleted. Voiding or selling does not erase that history. Keep it and rename it instead; account privacy erasure is separate in Data & Export.';
    return null;
  }
  async management(identity: Identity, id: string) {
    return this.auth.connection.transaction(
      async (session) => {
        const portfolio = await this.owned(identity, id, session);
        const reason = identity.user.demoReadonly
          ? 'This public demo is read-only.'
          : await this.deletionReason(portfolio, session);
        return PortfolioManagement.parse({
          portfolio: portfolioView(portfolio),
          canDelete: reason === null,
          deletionReason: reason,
        });
      },
      { readConcern: { level: 'snapshot' } },
    );
  }
  async renamePortfolio(identity: Identity, id: string, raw: unknown) {
    const parsed = RenamePortfolioInput.safeParse(raw);
    if (!parsed.success)
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Enter a name of 1–100 characters using letters, numbers, spaces or . , apostrophe & ( ) _ + - /.',
      );
    return this.auth.connection.transaction(async (session) => {
      await this.touchUser(identity, session);
      const portfolio = await this.owned(identity, id, session);
      if (portfolio.name === parsed.data.name) return portfolioView(portfolio);
      if ((portfolio.managementVersion ?? 0) !== parsed.data.expectedVersion)
        throw new HttpError(
          409,
          'PORTFOLIO_CHANGED',
          'The portfolio name changed. Reload its details and review your edit again.',
        );
      portfolio.name = parsed.data.name;
      portfolio.managementVersion = (portfolio.managementVersion ?? 0) + 1;
      await portfolio.save({ session });
      await this.auth.audit(
        'portfolio.renamed',
        identity.user._id,
        { ip: 'domain', userAgent: 'domain' },
        undefined,
        this.auth.digest(id, 'portfolio-audit'),
        session,
      );
      return portfolioView(portfolio);
    });
  }
  async deleteEmptyPortfolio(identity: Identity, id: string, raw: unknown, key: string) {
    const parsed = DeletePortfolioInput.safeParse(raw);
    if (!parsed.success || !z.uuid().safeParse(key).success)
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Type DELETE and review the current portfolio details before deleting. A valid request identifier is required.',
      );
    const portfolioId = objectId(id),
      userId = identity.user._id;
    const requestHash = createHash('sha256')
      .update(canonical({ id: portfolioId.toHexString(), input: parsed.data }))
      .digest('hex');
    return this.auth.connection.transaction(async (session) => {
      await this.touchUser(identity, session);
      const prior = await this.models.Deletion.findOne({ userId, idempotencyKey: key }).session(
        session,
      );
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new HttpError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This request identifier was already used for a different deletion.',
          );
        return DeletePortfolioResponse.parse({
          portfolioId: prior.portfolioId.toHexString(),
          deletedAt: prior.deletedAt.toISOString(),
          duplicate: true,
        });
      }
      const portfolio = await this.owned(identity, id, session);
      const reason = await this.deletionReason(portfolio, session);
      if (reason) throw new HttpError(409, 'PORTFOLIO_NOT_EMPTY', reason);
      if ((portfolio.managementVersion ?? 0) !== parsed.data.expectedVersion)
        throw new HttpError(
          409,
          'PORTFOLIO_CHANGED',
          'The portfolio name changed. Reload its details before confirming deletion.',
        );
      const deletedAt = this.clock();
      const result = await this.models.Portfolio.deleteOne({ _id: portfolioId, userId }).session(
        session,
      );
      if (result.deletedCount !== 1) throw notFound();
      await this.models.Deletion.create(
        [{ userId, portfolioId, idempotencyKey: key, requestHash, deletedAt }],
        { session },
      );
      await this.auth.audit(
        'portfolio.deleted_empty',
        userId,
        { ip: 'domain', userAgent: 'domain' },
        undefined,
        this.auth.digest(id, 'portfolio-audit'),
        session,
      );
      return DeletePortfolioResponse.parse({
        portfolioId: portfolioId.toHexString(),
        deletedAt: deletedAt.toISOString(),
        duplicate: false,
      });
    });
  }
  async assertOwnedForRefresh(identity: Identity, id: string) {
    await this.owned(identity, id);
  }
  async refreshInstruments(userId: Types.ObjectId, portfolioId: Types.ObjectId) {
    return this.auth.connection.transaction(
      async (session) => {
        const user = await this.auth.models.User.exists({
          _id: userId,
          emailVerifiedAt: { $ne: null },
          demoReadonly: false,
        }).session(session);
        const portfolio = await this.models.Portfolio.exists({ _id: portfolioId, userId }).session(
          session,
        );
        if (!user || !portfolio) throw notFound();
        const records = await this.models.Economic.find({ userId, portfolioId })
          .sort({ effectiveAt: 1, sequence: 1 })
          .limit(10001)
          .session(session)
          .lean();
        if (records.length > 10000)
          throw new HttpError(422, 'LEDGER_LIMIT', 'The supported ledger limit was reached.');
        const voids = await this.models.Void.find({ userId, portfolioId }).session(session).lean();
        const projection = replayLedger(records.map(economicRecord), voids.map(voidEvent));
        const ids = projection.positions
          .filter((p) => !decimal(p.quantity).isZero())
          .map((p) => p.instrumentId)
          .sort();
        if (ids.length > 25)
          throw new HttpError(
            422,
            'REFRESH_LIMIT',
            'Refresh supports up to 25 instruments per batch.',
          );
        return (
          await this.models.Instrument.find({ _id: { $in: ids } })
            .sort({ _id: 1 })
            .session(session)
            .lean()
        ).map(({ _id, ...r }) => Instrument.parse({ id: _id, ...r }));
      },
      { readConcern: { level: 'snapshot' } },
    );
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
  private parsedTransaction(raw: unknown) {
    const parsed = TransactionInput.safeParse(raw);
    if (!parsed.success)
      throw new HttpError(400, 'VALIDATION_ERROR', 'Check the transaction fields and dates.');
    return parsed.data;
  }
  private async resolvedTransaction(
    portfolio: HydratedDocument<PortfolioDocument>,
    input: TransactionInput,
    session?: ClientSession,
  ) {
    const query = this.models.Instrument.findById(input.instrumentId);
    const rawInstrument = await (session ? query.session(session) : query).lean();
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
    if (
      !['INR', 'USD'].includes(instrument.currency) ||
      !['INR', 'USD'].includes(portfolio.baseCurrency)
    )
      throw new HttpError(
        422,
        'UNSUPPORTED_CURRENCY',
        'This instrument or portfolio currency is not supported.',
      );
    let resolved: FxProvenance | null;
    if (instrument.currency === portfolio.baseCurrency)
      resolved = sameCurrency(instrument.currency, input.tradingDate);
    else if (input.historicalFxOverride) resolved = input.historicalFxOverride;
    else if (this.market.historicalFxForCommit) {
      const observation = await this.market.historicalFxForCommit(
        instrument.currency,
        portfolio.baseCurrency,
        input.tradingDate,
      );
      if (observation?.stale)
        throw new HttpError(
          422,
          'HISTORICAL_FX_STALE',
          'Historical FX is awaiting a fresh provider check. Retry the review; no transaction was recorded.',
        );
      resolved = observation?.fx ?? null;
    } else
      resolved = await this.market.historicalFx(
        instrument.currency,
        portfolio.baseCurrency,
        input.tradingDate,
      );
    if (!resolved)
      throw new HttpError(
        422,
        'HISTORICAL_FX_UNAVAILABLE',
        'Historical reference FX is unavailable. Add an explicit historical FX override with its source.',
      );
    const parsedFx = FxProvenance.safeParse(resolved);
    if (!parsedFx.success)
      throw new HttpError(
        422,
        'HISTORICAL_FX_INVALID',
        'Historical FX could not be validated. Retry or enter a sourced override.',
      );
    return { instrument, effective, fx: parsedFx.data };
  }
  private previewScope(
    identity: Identity,
    portfolio: HydratedDocument<PortfolioDocument>,
    input: TransactionInput,
    instrument: Instrument,
    fx: FxProvenance,
    effects: unknown,
  ): PreviewScope {
    return {
      owner: identity.user._id.toHexString(),
      portfolio: portfolio._id.toHexString(),
      authVersion: identity.user.authVersion,
      requestHash: createHash('sha256').update(canonical(input)).digest('hex'),
      revision: portfolio.revision,
      sequence: portfolio.nextSequence,
      instrumentHash: previewHash(instrument),
      fxHash: previewHash(fx),
      effectsHash: previewHash(effects),
    };
  }
  private candidate(
    portfolio: HydratedDocument<PortfolioDocument>,
    input: TransactionInput,
    instrument: Instrument,
    fx: FxProvenance,
  ): EconomicRecord {
    return {
      ...input,
      id: '__preview__',
      sequence: portfolio.nextSequence + 1,
      currency: instrument.currency,
      baseCurrency: portfolio.baseCurrency,
      fx,
    };
  }
  async preview(identity: Identity, portfolioId: string, raw: unknown) {
    if (identity.user.demoReadonly) throw readonly();
    const input = this.parsedTransaction(raw);
    try {
      return await this.auth.connection.transaction(
        async (session) => {
          const portfolio = await this.owned(identity, portfolioId, session);
          const { instrument, fx } = await this.resolvedTransaction(portfolio, input, session);
          const data = await this.entries(identity, portfolio._id, session);
          if (data.records.length >= 10000)
            throw new HttpError(
              409,
              'LEDGER_CAPACITY',
              'A portfolio supports at most 10,000 economic records.',
            );
          const effects = transactionEffects(
            data.records,
            data.voids,
            this.candidate(portfolio, input, instrument, fx),
          );
          const binding = this.previewScope(identity, portfolio, input, instrument, fx, effects),
            now = this.clock();
          return TransactionPreview.parse({
            input,
            instrument,
            portfolioId: portfolio._id.toHexString(),
            portfolioRevision: portfolio.revision,
            baseCurrency: portfolio.baseCurrency,
            fxMode:
              instrument.currency === portfolio.baseCurrency
                ? 'identity'
                : input.historicalFxOverride
                  ? 'override'
                  : 'automatic',
            fx,
            effects,
            issuedAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + 180000).toISOString(),
            receipt: signPreview(binding, now, this.auth.digest.bind(this.auth)),
          });
        },
        { readConcern: { level: 'snapshot' } },
      );
    } catch (error) {
      if (error instanceof FinancialError) throw new HttpError(422, error.code, error.message);
      throw error;
    }
  }
  async append(
    identity: Identity,
    portfolioId: string,
    raw: unknown,
    idempotencyKey: string,
    receipt?: string,
  ) {
    if (identity.user.demoReadonly) throw readonly();
    const input = this.parsedTransaction(raw);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey))
      throw new HttpError(
        400,
        'IDEMPOTENCY_REQUIRED',
        'A valid transaction request identifier is required.',
      );
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
    try {
      return await this.auth.connection.transaction(async (session) => {
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
        // Public confirmation is mandatory; internal seed/test calls may omit a receipt.
        const proof =
          receipt === undefined
            ? null
            : readPreview(receipt, this.clock(), this.auth.digest.bind(this.auth));
        if (
          proof &&
          (proof.revision !== current.revision || proof.sequence !== current.nextSequence)
        )
          throw new HttpError(
            409,
            'PREVIEW_CHANGED',
            'The portfolio changed after this review. Revalidate and review the updated values.',
          );
        if (
          proof &&
          (proof.owner !== identity.user._id.toHexString() ||
            proof.portfolio !== current._id.toHexString() ||
            proof.authVersion !== identity.user.authVersion ||
            proof.requestHash !== requestHash)
        )
          throw new HttpError(
            409,
            'PREVIEW_INVALID',
            'This review does not match the transaction. Revalidate before confirming.',
          );
        const { instrument, effective, fx } = await this.resolvedTransaction(
          current,
          input,
          session,
        );
        const effects = transactionEffects(
          data.records,
          data.voids,
          this.candidate(current, input, instrument, fx),
        );
        if (proof) {
          const binding = this.previewScope(identity, current, input, instrument, fx, effects);
          if (Object.entries(binding).some(([k, v]) => proof[k as keyof typeof proof] !== v))
            throw new HttpError(
              409,
              'PREVIEW_CHANGED',
              'Portfolio, instrument or historical FX inputs changed. Revalidate and review the updated values.',
            );
        }
        await this.touchUser(identity, session);
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
        if (receipt !== undefined)
          readPreview(receipt, this.clock(), this.auth.digest.bind(this.auth));
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
  async assetDetail(
    identity: Identity,
    portfolioId: string,
    instrumentId: string,
    query: z.infer<typeof AssetDetailQuery>,
  ) {
    const { portfolio, data } = await this.state(identity, portfolioId);
    if (instrumentId.length > 100 || /[\u0000-\u001f\u007f]/.test(instrumentId)) throw notFound();
    const projection = replayLedger(data.records, data.voids);
    const ids = [...new Set([instrumentId, ...projection.positions.map((p) => p.instrumentId)])];
    const docs = await this.models.Instrument.find({ _id: { $in: ids } }).lean();
    const instruments = docs.map(({ _id, ...fields }) => Instrument.parse({ id: _id, ...fields }));
    const instrument = instruments.find((i) => i.id === instrumentId);
    if (!instrument) throw notFound();
    const activeIds = new Set(
      projection.positions.filter((p) => !decimal(p.quantity).isZero()).map((p) => p.instrumentId),
    );
    const ownedInstruments = instruments.filter((i) => activeIds.has(i.id));
    const quotes = ownedInstruments.length ? await this.market.quotes(ownedInstruments) : [];
    const rates = ownedInstruments.length
      ? await this.market.rates(
          [...new Set(ownedInstruments.map((i) => i.currency))],
          portfolio.baseCurrency,
        )
      : {};
    const valuation = valuePortfolio(
      projection.positions,
      ownedInstruments,
      quotes,
      rates,
      portfolio.baseCurrency,
    );
    const position = projection.positions.find((p) => p.instrumentId === instrumentId);
    const holding = valuation.holdings.find((p) => p.instrumentId === instrumentId);
    const records = new Map(data.records.map((record) => [record.id, record]));
    const voids = new Map(data.voids.map((event) => [event.transactionId, event]));
    const lots = position?.lots ?? [];
    const activity = data.records.filter((r) => r.instrumentId === instrumentId).reverse();
    const summary = <T extends { lots: unknown }>(value: T | undefined) => {
      if (!value) return null;
      const { lots: omitted, ...fields } = value;
      void omitted;
      return fields;
    };
    return AssetDetailResponse.parse({
      instrument,
      portfolioId: portfolio._id.toHexString(),
      revision: portfolio.revision,
      baseCurrency: portfolio.baseCurrency,
      position: summary(position),
      holding: summary(holding),
      valuation: {
        complete: valuation.complete,
        status: valuation.status,
        asOf: valuation.asOf,
        coverage: valuation.coverage,
      },
      lots: {
        page: query.lotPage,
        pageSize: query.lotPageSize,
        total: lots.length,
        items: lots
          .slice((query.lotPage - 1) * query.lotPageSize, query.lotPage * query.lotPageSize)
          .map((lot) => {
            const acquisition = records.get(lot.transactionId);
            if (!acquisition || acquisition.type !== 'BUY')
              throw new HttpError(
                500,
                'ASSET_DATA_UNAVAILABLE',
                'Lot provenance is unavailable. Please retry.',
              );
            return { ...lot, acquisition };
          }),
      },
      activity: {
        page: query.page,
        pageSize: query.pageSize,
        total: activity.length,
        items: activity
          .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
          .map((record) => ({
            record,
            nativeCashFlow: projection.cashFlows[record.id] ?? nativeCashFlow(record),
            void: voids.get(record.id) ?? null,
          })),
      },
    });
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
          portfolioDeletions: (
            await this.models.Deletion.find({ userId })
              .sort({ deletedAt: 1, _id: 1 })
              .session(session)
          ).map((row) => ({
            portfolioId: row.portfolioId.toHexString(),
            deletedAt: row.deletedAt.toISOString(),
          })),
          jobs: (
            await jobModels(this.auth.connection)
              .Run.find({ userId })
              .sort({ createdAt: 1, _id: 1 })
              .session(session)
              .lean()
          ).map(publicRun),
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
    await this.models.Deletion.collection.deleteMany({ userId }, { session });
    await jobModels(this.auth.connection).Run.deleteMany({ userId }).session(session);
    // Privacy erasure is the sole append-only deletion exception, inside the account transaction.
    await this.models.Economic.collection.deleteMany({ userId }, { session });
    await this.models.Void.collection.deleteMany({ userId }, { session });
    await this.models.Projection.deleteMany({ userId }, { session });
    await this.models.Portfolio.deleteMany({ userId }, { session });
  }
}
