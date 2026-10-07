import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Instrument } from '@folio/shared';
import {
  decimal,
  nonnegative,
  positive,
  present,
  readStoredDecimal,
  serialize,
  storedDecimal,
} from '../src/services/financial/decimal.ts';
import { replayLedger } from '../src/services/financial/ledger.ts';
import type { EconomicRecord, VoidEvent } from '../src/services/financial/ledger.ts';
import { valuePortfolio } from '../src/services/financial/valuation.ts';
import type { CurrentFx, Quote } from '../src/services/financial/valuation.ts';

const date = '2026-01-05';
const base = (id: string, sequence: number) => ({
  id,
  sequence,
  instrumentId: 'TEST:NSE',
  currency: 'INR',
  baseCurrency: 'INR',
  effectiveAt: `${date}T10:00:00.000Z`,
  tradingDate: date,
  fx: { rate: '1', rateDate: date, source: 'identity' as const, reference: 'INR/INR' },
});
const buy = (
  id = 'b1',
  sequence = 1,
  quantity = '10',
  price = '100',
  fees = '10',
): EconomicRecord => ({ ...base(id, sequence), type: 'BUY', quantity, price, fees });
const sell = (
  id = 's1',
  sequence = 3,
  quantity = '12',
  price = '150',
  fees = '12',
): EconomicRecord => ({ ...base(id, sequence), type: 'SELL', quantity, price, fees });
const split = (numerator = '2', denominator = '1'): EconomicRecord => ({
  ...base('split', 4),
  type: 'SPLIT',
  numerator,
  denominator,
});
const dividend = (grossAmount = '30', fees = '2'): EconomicRecord => ({
  ...base('d1', 5),
  type: 'DIVIDEND',
  grossAmount,
  fees,
});
const fixture = () => [buy(), buy('b2', 2, '5', '120', '5'), sell(), split(), dividend()];
const instrument: Instrument = {
  id: 'TEST:NSE',
  symbol: 'TEST',
  name: 'Verified test instrument',
  exchange: 'NSE',
  currency: 'INR',
  assetClass: 'equity',
  sector: 'Unknown',
  provider: 'yahoo',
  providerId: 'TEST.NS',
  metadataSource: 'explicit test fixture',
};
const quote: Quote = {
  instrumentId: instrument.id,
  currency: 'INR',
  price: '70',
  referencePrice: '68',
  referencePeriod: 'previous-close',
  source: 'test fixture',
  asOf: '2026-01-06T10:00:00.000Z',
  status: 'fresh',
  fixture: true,
};
const rate: CurrentFx = {
  rate: '1',
  rateDate: date,
  source: 'identity',
  reference: 'INR/INR',
  asOf: '2026-01-05T00:00:00.000Z',
  status: 'fresh',
};

describe('exact decimal boundaries', () => {
  it('rejects floating point/exponential/non-finite financial inputs and preserves tiny units', () => {
    for (const value of ['NaN', 'Infinity', '1e-18', '01', ' 1', '', '0'.repeat(257)])
      expect(() => decimal(value)).toThrow();
    expect(serialize(decimal('-0'))).toBe('0');
    expect(serialize(decimal('0.000000000000000001').times('3'))).toBe('0.000000000000000003');
    expect(() => nonnegative('-1')).toThrow('non-negative');
    expect(() => positive('0')).toThrow('greater than zero');
  });
  it('stores exact Decimal128 inputs and rejects lossy storage/scale', () => {
    expect(storedDecimal('0.000000000000000001', 18).toString()).toBe('1E-18');
    expect(readStoredDecimal(storedDecimal('0.000000000000000001'))).toBe('0.000000000000000001');
    expect(() => storedDecimal('0.0000000000000000001', 18)).toThrow('18 decimal');
    expect(() => storedDecimal('12345678901234567890123456789012345')).toThrow('database decimal');
    expect(storedDecimal('1234567890123456789012345678901234').toString()).toBe(
      '1234567890123456789012345678901234',
    );
    expect(present('1.005', 2)).toBe('1.00');
    expect(present('1.015', 2)).toBe('1.02');
    expect(present('-0.005', 2)).toBe('0.00');
    for (const places of [-1, 19, 1.2]) expect(() => present('1', places)).toThrow('precision');
  });
});
describe('immutable FIFO economic ledger', () => {
  it('matches hand-computed BUY/SELL fees, multiple lots, partial sell, split and dividend', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const projected = replayLedger(input);
    expect(projected.cashFlows).toEqual({
      b1: '-1010',
      b2: '-605',
      s1: '1788',
      split: '0',
      d1: '28',
    });
    expect(projected.positions[0]).toMatchObject({
      quantity: '6',
      localCost: '363',
      baseCost: '363',
      averageCost: '60.5',
      realizedLocal: '536',
      realizedBase: '536',
      dividendLocal: '28',
      dividendBase: '28',
      lots: [{ transactionId: 'b2', quantity: '6', localCost: '363', baseCost: '363' }],
    });
    expect(JSON.stringify(input)).toBe(before);
    const atSell = replayLedger(input.slice(0, 3)).positions[0];
    expect(atSell).toMatchObject({ quantity: '3', averageCost: '121' });
  });
  it('preserves per-lot historical FX on partial sales, proceeds and dividend conversion', () => {
    const fxBuy = {
      ...buy('a', 1, '2', '100', '0'),
      currency: 'USD',
      fx: { ...base('a', 1).fx, source: 'manual' as const, reference: 'receipt A', rate: '80' },
    };
    const fxBuy2 = {
      ...buy('b', 2, '2', '100', '0'),
      currency: 'USD',
      fx: { ...fxBuy.fx, rate: '90' },
    };
    const fxSell = {
      ...sell('s', 3, '3', '120', '3'),
      currency: 'USD',
      fx: { ...fxBuy.fx, rate: '85' },
    };
    const fxDividend = { ...dividend('10', '2'), currency: 'USD', fx: { ...fxBuy.fx, rate: '86' } };
    expect(replayLedger([fxBuy, fxBuy2, fxSell, fxDividend]).positions[0]).toMatchObject({
      quantity: '1',
      localCost: '100',
      baseCost: '9000',
      realizedLocal: '57',
      realizedBase: '5345',
      dividendLocal: '8',
      dividendBase: '688',
    });
  });
  it('uses effective instant then sequence regardless of input order and supports economic as-of', () => {
    expect(replayLedger(fixture().reverse())).toEqual(replayLedger(fixture()));
    const later = {
      ...sell('sale', 2, '10', '100', '0'),
      effectiveAt: '2026-01-06T10:00:00.000Z',
      tradingDate: '2026-01-06',
    };
    expect(replayLedger([later, buy()], [], `${date}T23:00:00.000Z`).positions[0]?.quantity).toBe(
      '10',
    );
    expect(replayLedger([later, buy()]).positions[0]).toMatchObject({
      quantity: '0',
      averageCost: null,
      lots: [],
    });
    expect(() => replayLedger([buy()], [], 'bad')).toThrow('date');
    expect(() =>
      replayLedger([
        { ...buy(), effectiveAt: '2026-01-06T10:00:00.000Z' },
        { ...later, effectiveAt: `${date}T10:00:00.000Z` },
      ]),
    ).toThrow('more units');
  });
  it('supports immutable voids and rejects backdated/void-induced oversells', () => {
    const events: VoidEvent[] = [
      {
        id: 'v1',
        transactionId: 's1',
        reason: 'Incorrect sale',
        recordedAt: '2026-01-07T10:00:00.000Z',
      },
    ];
    expect(replayLedger(fixture(), events).positions[0]).toMatchObject({
      quantity: '30',
      localCost: '1615',
      realizedBase: '0',
    });
    expect(() => replayLedger(fixture(), [{ ...events[0]!, transactionId: 'b1' }])).toThrow(
      'more units',
    );
    expect(() => replayLedger(fixture(), [events[0]!, events[0]!])).toThrow('unique');
    expect(() => replayLedger(fixture(), [{ ...events[0]!, transactionId: 'missing' }])).toThrow(
      'unique',
    );
    expect(() => replayLedger(fixture(), [{ ...events[0]!, reason: ' ' }])).toThrow('reason');
  });
  it('validates records and keeps dates/currencies/precision consistent', () => {
    for (const bad of [
      { ...buy(), id: '' },
      { ...buy(), sequence: 0 },
      { ...buy(), sequence: 1.5 },
      { ...buy(), effectiveAt: 'bad' },
      { ...buy(), tradingDate: 'bad' },
      { ...buy(), currency: 'usd' },
      { ...buy(), baseCurrency: 'bad' },
      { ...buy(), fx: { ...buy().fx, rateDate: '2027-01-01' } },
      { ...buy(), fx: { ...buy().fx, rate: '2' } },
    ])
      expect(() => replayLedger([bad])).toThrow();
    expect(() => replayLedger([buy(), buy()])).toThrow('unique');
    expect(() => replayLedger([buy(), { ...buy('b', 2), currency: 'USD' }])).toThrow('currencies');
    expect(() => replayLedger([buy(), sell('s', 2, '1', '1', '2')])).toThrow('Fees');
    expect(() => replayLedger([dividend('1', '2')])).toThrow('withholding');
    expect(() => replayLedger([buy('a', 1, '0')])).toThrow('greater than zero');
    expect(() => replayLedger([buy('a', 1, '1', '0.00000000001')])).toThrow('10 decimal');
    expect(() => replayLedger([split()])).toThrow('existing position');
    expect(() => replayLedger([buy('a', 1, '1', '1', '0'), split('1', '3')])).toThrow(
      'cash-in-lieu',
    );
    expect(() => replayLedger([buy(), split('0')])).toThrow('greater than zero');
    expect(
      replayLedger([buy('a', 1, '0.000000000000000001', '0.0000000001', '0')]).positions[0]
        ?.localCost,
    ).toBe('0.0000000000000000000000000001');
  });
  it('retains exact residual cost when repeating partial allocations consume a complete lot', () => {
    const records = [
      buy('a', 1, '3', '0', '1'),
      sell('s1', 2, '1', '1', '0'),
      sell('s2', 3, '1', '1', '0'),
      sell('s3', 4, '1', '1', '0'),
    ];
    expect(replayLedger(records).positions[0]).toMatchObject({
      quantity: '0',
      localCost: '0',
      baseCost: '0',
      realizedLocal: '2',
    });
  });
  it('property: FIFO replay conserves cost and is permutation invariant', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (units, price, fee) => {
          const input = [
            buy('a', 1, String(units), String(price), String(fee)),
            sell('s', 2, String(units), String(price), '0'),
          ];
          const result = replayLedger(input);
          expect(result.positions[0]).toMatchObject({
            quantity: '0',
            localCost: '0',
            baseCost: '0',
            realizedLocal: String(-BigInt(fee)),
          });
          expect(result.cashFlows['a']).toBe(
            String(-(BigInt(units) * BigInt(price) + BigInt(fee))),
          );
          expect(replayLedger([...input].reverse())).toEqual(result);
        },
      ),
      { numRuns: 250, seed: 20261004 },
    );
  });
});
describe('current holdings valuation without invented data', () => {
  it('matches hand-computed values, cost-based return, allocation and movement', () => {
    const result = valuePortfolio(
      replayLedger(fixture()).positions,
      [instrument],
      [quote],
      { INR: rate },
      'INR',
    );
    expect(result).toMatchObject({
      complete: true,
      status: 'fresh',
      knownValuedSubtotal: '420',
      totalValue: '420',
      totalBaseCost: '363',
      unrealizedBase: '57',
      realizedBase: '536',
      dividendBase: '28',
      movementBase: '12',
      asOf: rate.asOf,
    });
    expect(result.holdings[0]).toMatchObject({
      weight: '1',
      priceContribution: '57',
      fxContribution: '0',
      fxReturnEffect: '0',
    });
    expect(result.allocation).toHaveLength(4);
    expect(result.concentration).toEqual([
      { dimension: 'instrument', label: instrument.id, weight: '1' },
    ]);
    expect(result.sectorConcentrationUnavailableReason).toContain('incomplete');
    expect(
      valuePortfolio(
        replayLedger(fixture()).positions,
        [{ ...instrument, sector: 'Verified sector fixture' }],
        [quote],
        { INR: rate },
        'INR',
      ).concentration,
    ).toContainEqual({ dimension: 'sector', label: 'Verified sector fixture', weight: '1' });
    expect(result.movementLabel).toContain('Mixed periods');
  });
  it('matches approved FX-only hand fixture and exact decomposition identity', () => {
    const foreign = {
      ...buy('a', 1, '10', '100', '0'),
      currency: 'USD',
      fx: { ...base('a', 1).fx, rate: '83', source: 'manual' as const },
    };
    const result = valuePortfolio(
      replayLedger([foreign]).positions,
      [{ ...instrument, currency: 'USD' }],
      [{ ...quote, currency: 'USD', price: '100' }],
      { USD: { ...rate, rate: '88', source: 'Frankfurter/ECB' } },
      'INR',
    );
    expect(result).toMatchObject({
      totalValue: '88000',
      totalBaseCost: '83000',
      unrealizedBase: '5000',
    });
    expect(result.holdings[0]).toMatchObject({
      localReturn: '0',
      priceContribution: '0',
      fxContribution: '5000',
    });
    expect(present(decimal(result.holdings[0]!.baseReturn!).times('100').toFixed(), 10)).toBe(
      '6.0240963855',
    );
    const gained = valuePortfolio(
      replayLedger([foreign]).positions,
      [{ ...instrument, currency: 'USD' }],
      [{ ...quote, currency: 'USD', price: '110' }],
      { USD: { ...rate, rate: '88' } },
      'INR',
    ).holdings[0]!;
    expect(gained).toMatchObject({
      priceContribution: '8300',
      fxContribution: '5500',
      unrealizedBase: '13800',
    });
    expect(serialize(decimal(gained.priceContribution!).plus(gained.fxContribution!))).toBe(
      gained.unrealizedBase,
    );
  });
  it('does not treat missing prices/FX as zero or renormalize incomplete holdings', () => {
    const second = {
      ...buy('b', 2),
      instrumentId: 'SECOND:US',
      currency: 'USD',
      fx: { ...rate, rate: '80' },
    };
    const ps = replayLedger([buy(), second]).positions;
    const instruments = [
      instrument,
      { ...instrument, id: 'SECOND:US', currency: 'USD', exchange: 'US' as const },
    ];
    const result = valuePortfolio(ps, instruments, [quote], { INR: rate }, 'INR');
    expect(result).toMatchObject({
      status: 'partial',
      complete: false,
      coverage: { valued: 1, total: 2 },
      knownValuedSubtotal: '700',
      totalValue: null,
      unrealizedBase: null,
      costBasedReturn: null,
      allocation: null,
      concentration: null,
      movementBase: null,
    });
    expect(result.holdings.every((h) => h.weight === null)).toBe(true);
    expect(
      result.holdings.find((h) => h.instrumentId === 'SECOND:US')?.unavailableReason,
    ).toContain('price');
    const noFx = valuePortfolio(
      ps,
      instruments,
      [quote, { ...quote, instrumentId: 'SECOND:US', currency: 'USD' }],
      { INR: rate },
      'INR',
    );
    expect(noFx.holdings.find((h) => h.instrumentId === 'SECOND:US')).toMatchObject({
      localValue: '700',
      baseValue: null,
      unavailableReason: 'Reference FX is unavailable.',
    });
    const mismatched = valuePortfolio(
      ps,
      instruments,
      [{ ...quote, currency: 'USD' }],
      { INR: rate },
      'INR',
    );
    expect(mismatched.knownValuedSubtotal).toBe('0');
  });
  it('keeps stale values explicitly degraded and handles zero cost/reference and absent references', () => {
    const ps = replayLedger([buy('a', 1, '1', '0', '0')]).positions;
    const result = valuePortfolio(
      ps,
      [instrument],
      [{ ...quote, status: 'stale', price: '0', referencePrice: '0' }],
      { INR: { ...rate, status: 'stale' } },
      'INR',
    );
    expect(result).toMatchObject({
      status: 'stale',
      complete: true,
      totalValue: '0',
      costBasedReturn: null,
      allocation: null,
      concentration: null,
      movementReturn: null,
    });
    expect(result.holdings[0]).toMatchObject({
      localReturn: null,
      baseReturn: null,
      fxReturnEffect: null,
      priceContribution: null,
      returnUnavailableReason: 'Return and FX decomposition are unavailable for a zero cost basis.',
    });
    expect(
      valuePortfolio(ps, [instrument], [{ ...quote, referencePrice: null }], { INR: rate }, 'INR')
        .movementBase,
    ).toBeNull();
    expect(valuePortfolio([], [], [], {}, 'INR')).toMatchObject({
      status: 'empty',
      asOf: null,
      totalValue: '0',
      coverage: { valued: 0, total: 0 },
    });
  });
  it('aggregates only base amounts, includes closed realized income and supports configurable thresholds', () => {
    const ps = replayLedger([
      buy(),
      { ...buy('b', 2), instrumentId: 'SECOND:US', currency: 'USD', fx: { ...rate, rate: '80' } },
    ]).positions;
    const result = valuePortfolio(
      ps,
      [
        instrument,
        {
          ...instrument,
          id: 'SECOND:US',
          currency: 'USD',
          assetClass: 'etf',
          sector: 'Technology',
        },
      ],
      [
        quote,
        { ...quote, instrumentId: 'SECOND:US', currency: 'USD', referencePeriod: 'rolling-24h' },
      ],
      { INR: rate, USD: { ...rate, rate: '80' } },
      'INR',
      { instrument: '1', sector: '1' },
    );
    expect(result.totalValue).toBe('56700');
    expect(result.concentration).toEqual([]);
    expect(
      result.allocation?.filter((a) => a.dimension === 'currency').map((a) => a.baseValue),
    ).toEqual(['700', '56000']);
    const closed = replayLedger([buy(), sell('s', 2, '10', '101', '0'), dividend('2', '0')]);
    expect(valuePortfolio(closed.positions, [instrument], [], {}, 'INR')).toMatchObject({
      status: 'empty',
      realizedBase: '0',
      dividendBase: '2',
    });
    expect(() => valuePortfolio(ps, [], [], {}, 'INR')).toThrow('currency mismatch');
    expect(() => valuePortfolio(ps, [{ ...instrument, currency: 'USD' }], [], {}, 'INR')).toThrow();
    expect(() => valuePortfolio([], [], [], {}, 'USD', { instrument: '0', sector: '1' })).toThrow();
  });
});
