import { z } from 'zod';
import { NumberedPagination } from './pagination.ts';

export const Currency = z.string().regex(/^[A-Z]{3}$/);
export const FinancialString = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(100);
export const PositiveFinancialString = FinancialString.refine(
  (value) => /[1-9]/.test(value),
  'Enter a value greater than zero.',
);
export const TradingDate = z.iso.date();
export const FxProvenance = z.strictObject({
  rate: PositiveFinancialString,
  rateDate: TradingDate,
  source: z.enum(['identity', 'Frankfurter/ECB', 'manual', 'demo-fixture', 'local-fixture']),
  reference: z.string().trim().min(1).max(240),
});
export type FxProvenance = z.infer<typeof FxProvenance>;
const common = {
  instrumentId: z.string().min(1).max(100),
  effectiveAt: z.iso.datetime({ precision: 3 }),
  tradingDate: TradingDate,
  historicalFxOverride: FxProvenance.extend({ source: z.literal('manual') }).optional(),
};
export const TransactionInput = z.discriminatedUnion('type', [
  z.strictObject({
    ...common,
    type: z.literal('BUY'),
    quantity: PositiveFinancialString,
    price: FinancialString,
    fees: FinancialString,
  }),
  z.strictObject({
    ...common,
    type: z.literal('SELL'),
    quantity: PositiveFinancialString,
    price: FinancialString,
    fees: FinancialString,
  }),
  z.strictObject({
    ...common,
    type: z.literal('DIVIDEND'),
    grossAmount: FinancialString,
    fees: FinancialString,
  }),
  z.strictObject({
    ...common,
    type: z.literal('SPLIT'),
    numerator: PositiveFinancialString,
    denominator: PositiveFinancialString,
  }),
]);
export type TransactionInput = z.infer<typeof TransactionInput>;
export const VoidInput = z.strictObject({ reason: z.string().trim().min(3).max(500) });
export const Instrument = z.strictObject({
  id: z.string().min(1).max(100),
  symbol: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  exchange: z.enum(['NSE', 'BSE', 'US', 'CRYPTO']),
  currency: Currency,
  assetClass: z.enum(['equity', 'etf', 'crypto']),
  sector: z.string().min(1).max(100),
  provider: z.enum(['yahoo', 'coingecko']),
  providerId: z.string().min(1).max(100),
  metadataSource: z.string().min(1).max(240),
  aliases: z.array(z.string().trim().min(1).max(100)).max(12).optional(),
});
export type Instrument = z.infer<typeof Instrument>;
export const OutputDecimal = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(256);
export const Portfolio = z.strictObject({
  id: z.string(),
  name: z.string(),
  baseCurrency: Currency,
  costBasis: z.literal('FIFO'),
  currencyLockedAt: z.iso.datetime().nullable(),
  revision: z.number().int().nonnegative(),
});
export type Portfolio = z.infer<typeof Portfolio>;
export const Lot = z.strictObject({
  transactionId: z.string(),
  quantity: OutputDecimal,
  localCost: OutputDecimal,
  baseCost: OutputDecimal,
});
export const Position = z.strictObject({
  instrumentId: z.string(),
  currency: Currency,
  baseCurrency: Currency,
  quantity: OutputDecimal,
  localCost: OutputDecimal,
  baseCost: OutputDecimal,
  averageCost: OutputDecimal.nullable(),
  realizedLocal: OutputDecimal,
  realizedBase: OutputDecimal,
  dividendLocal: OutputDecimal,
  dividendBase: OutputDecimal,
  lots: z.array(Lot),
});
export const Quote = z.strictObject({
  instrumentId: z.string(),
  currency: Currency,
  price: FinancialString,
  referencePrice: FinancialString.nullable(),
  referencePeriod: z.enum(['previous-close', 'rolling-24h']),
  source: z.string(),
  asOf: z.iso.datetime(),
  status: z.enum(['fresh', 'stale']),
  fixture: z.boolean(),
});
export const CurrentFx = FxProvenance.extend({
  asOf: z.iso.datetime(),
  status: z.enum(['fresh', 'stale']),
});
export const ValuedHolding = Position.extend({
  instrument: Instrument,
  quote: Quote.nullable(),
  fx: CurrentFx.nullable(),
  localValue: OutputDecimal.nullable(),
  baseValue: OutputDecimal.nullable(),
  unrealizedBase: OutputDecimal.nullable(),
  localReturn: OutputDecimal.nullable(),
  baseReturn: OutputDecimal.nullable(),
  fxReturnEffect: OutputDecimal.nullable(),
  priceContribution: OutputDecimal.nullable(),
  fxContribution: OutputDecimal.nullable(),
  movementBase: OutputDecimal.nullable(),
  movementReferenceBase: OutputDecimal.nullable(),
  weight: OutputDecimal.nullable(),
  unavailableReason: z.string().nullable(),
  returnUnavailableReason: z.string().nullable(),
});
export const Allocation = z.strictObject({
  dimension: z.enum(['instrument', 'assetClass', 'sector', 'currency']),
  label: z.string(),
  baseValue: OutputDecimal,
  weight: OutputDecimal,
});
export const Valuation = z.strictObject({
  baseCurrency: Currency,
  complete: z.boolean(),
  status: z.enum(['empty', 'fresh', 'stale', 'partial']),
  asOf: z.iso.datetime().nullable(),
  coverage: z.strictObject({ valued: z.number().int(), total: z.number().int() }),
  holdings: z.array(ValuedHolding),
  knownValuedSubtotal: OutputDecimal,
  totalValue: OutputDecimal.nullable(),
  totalBaseCost: OutputDecimal,
  unrealizedBase: OutputDecimal.nullable(),
  costBasedReturn: OutputDecimal.nullable(),
  realizedBase: OutputDecimal,
  dividendBase: OutputDecimal,
  movementBase: OutputDecimal.nullable(),
  movementReturn: OutputDecimal.nullable(),
  movementLabel: z.string(),
  allocation: z.array(Allocation).nullable(),
  concentration: z
    .array(
      z.strictObject({
        dimension: z.enum(['instrument', 'sector']),
        label: z.string(),
        weight: OutputDecimal,
      }),
    )
    .nullable(),
  sectorCoverage: z.strictObject({ classified: z.number().int(), total: z.number().int() }),
  sectorConcentrationUnavailableReason: z.string().nullable(),
});
export type Valuation = z.infer<typeof Valuation>;
export type ValuedHolding = z.infer<typeof ValuedHolding>;
const recorded = {
  id: z.string(),
  sequence: z.number().int().positive(),
  currency: Currency,
  baseCurrency: Currency,
  fx: FxProvenance,
};
export const EconomicRecord = z.discriminatedUnion('type', [
  TransactionInput.options[0].extend(recorded),
  TransactionInput.options[1].extend(recorded),
  TransactionInput.options[2].extend(recorded),
  TransactionInput.options[3].extend(recorded),
]);
export const LedgerRow = z.strictObject({
  record: EconomicRecord,
  nativeCashFlow: OutputDecimal,
  void: z
    .strictObject({
      id: z.string(),
      transactionId: z.string(),
      reason: z.string(),
      recordedAt: z.iso.datetime(),
    })
    .nullable(),
});
export const LedgerPage = z.strictObject({
  items: z.array(LedgerRow),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export const DomainExport = z.strictObject({
  portfolios: z.array(Portfolio),
  ledger: z.array(LedgerRow),
  projectionVersion: z.literal(1),
});
export type DomainExport = z.infer<typeof DomainExport>;
export const LedgerQuery = NumberedPagination.extend({
  q: z.string().trim().max(100).default(''),
  type: z.enum(['', 'BUY', 'SELL', 'DIVIDEND', 'SPLIT']).default(''),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export const HoldingsQuery = NumberedPagination.extend({
  q: z.string().trim().max(100).default(''),
  assetClass: z.enum(['', 'equity', 'etf', 'crypto']).default(''),
  sector: z.string().trim().max(100).default(''),
  sort: z.enum(['instrument', 'quantity', 'baseValue', 'baseCost', 'weight']).default('instrument'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type HoldingsQuery = z.infer<typeof HoldingsQuery>;
export const SearchQuery = z.strictObject({ q: z.string().trim().min(2).max(100) });
export const InstrumentQuery = z.strictObject({ q: z.string().trim().max(100).default('') });
export const InstrumentSearchQuery = z.strictObject({
  q: z
    .string()
    .trim()
    .max(100)
    .regex(/^[^\u0000-\u001f\u007f]*$/)
    .default(''),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
export const DiscoveryCapability = z.strictObject({
  provider: z.string().min(1).max(40),
  status: z.enum(['available', 'capability-unavailable', 'unavailable', 'invalid-response']),
  reason: z.string().max(240),
});
export const InstrumentSearchResponse = z.strictObject({
  instruments: z.array(Instrument).max(30),
  limit: z.number().int().min(1).max(30),
  truncated: z.boolean(),
  source: z.literal('verified-catalogue'),
  providers: z.array(DiscoveryCapability).max(5),
});
export const HoldingsPage = z.strictObject({
  items: z.array(ValuedHolding),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export const PriceHistory = z.strictObject({
  status: z.enum(['available', 'unavailable']),
  reason: z.string().nullable(),
  label: z.string(),
  points: z.array(z.strictObject({ date: TradingDate, price: FinancialString })),
  source: z.string().nullable(),
  fixture: z.boolean(),
});
export const AppendResponse = z.strictObject({ record: EconomicRecord, duplicate: z.boolean() });
export const VoidResponse = z.strictObject({
  event: z.strictObject({
    id: z.string(),
    transactionId: z.string(),
    reason: z.string(),
    recordedAt: z.iso.datetime(),
  }),
  duplicate: z.boolean(),
});
export const SearchResponse = z.strictObject({
  instruments: z.array(Instrument),
  ledger: z.array(z.strictObject({ record: EconomicRecord, portfolioId: z.string() })),
});
const empty = z.strictObject({});
export const domainContracts = [
  {
    method: 'get',
    path: '/api/v1/portfolios',
    request: empty,
    response: z.strictObject({ portfolios: z.array(Portfolio) }),
  },
  { method: 'post', path: '/api/v1/portfolios/default', request: empty, response: Portfolio },
  {
    method: 'get',
    path: '/api/v1/instruments',
    request: InstrumentQuery,
    response: z.strictObject({ instruments: z.array(Instrument) }),
  },
  { method: 'get', path: '/api/v1/search', request: SearchQuery, response: SearchResponse },
  {
    method: 'get',
    path: '/api/v1/instruments/search',
    request: InstrumentSearchQuery,
    response: InstrumentSearchResponse,
  },
  {
    method: 'get',
    path: '/api/v1/portfolios/{portfolioId}/ledger',
    request: LedgerQuery,
    response: LedgerPage,
  },
  {
    method: 'post',
    path: '/api/v1/portfolios/{portfolioId}/ledger',
    request: TransactionInput,
    response: AppendResponse,
  },
  {
    method: 'post',
    path: '/api/v1/portfolios/{portfolioId}/ledger/{transactionId}/void',
    request: VoidInput,
    response: VoidResponse,
  },
  {
    method: 'get',
    path: '/api/v1/portfolios/{portfolioId}/valuation',
    request: empty,
    response: Valuation,
  },
  {
    method: 'get',
    path: '/api/v1/portfolios/{portfolioId}/holdings',
    request: HoldingsQuery,
    response: HoldingsPage,
  },
  {
    method: 'get',
    path: '/api/v1/portfolios/{portfolioId}/holdings/{instrumentId}',
    request: empty,
    response: ValuedHolding,
  },
  {
    method: 'get',
    path: '/api/v1/portfolios/{portfolioId}/instruments/{instrumentId}/history',
    request: empty,
    response: PriceHistory,
  },
] as const;
