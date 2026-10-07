import type { FxProvenance, TransactionInput } from '@folio/shared';
import {
  FinancialError,
  decimal,
  nonnegative,
  positive,
  serialize,
  storedDecimal,
} from './decimal.ts';
import type { Money } from './decimal.ts';

export type EconomicRecord = TransactionInput & {
  id: string;
  sequence: number;
  currency: string;
  baseCurrency: string;
  fx: FxProvenance;
};
export interface VoidEvent {
  id: string;
  transactionId: string;
  reason: string;
  recordedAt: string;
}
export interface Lot {
  transactionId: string;
  quantity: string;
  localCost: string;
  baseCost: string;
}
export interface Position {
  instrumentId: string;
  currency: string;
  baseCurrency: string;
  quantity: string;
  localCost: string;
  baseCost: string;
  averageCost: string | null;
  realizedLocal: string;
  realizedBase: string;
  dividendLocal: string;
  dividendBase: string;
  lots: Lot[];
}
export interface LedgerProjection {
  positions: Position[];
  cashFlows: Record<string, string>;
}
interface WorkingLot {
  transactionId: string;
  quantity: Money;
  localCost: Money;
  baseCost: Money;
}
interface WorkingPosition {
  instrumentId: string;
  currency: string;
  baseCurrency: string;
  lots: WorkingLot[];
  realizedLocal: Money;
  realizedBase: Money;
  dividendLocal: Money;
  dividendBase: Money;
}
function fail(code: string, message: string): never {
  throw new FinancialError(code, message);
}
function sum(values: Money[]): Money {
  return values.reduce((total, value) => total.plus(value), decimal('0'));
}
export function nativeCashFlow(entry: EconomicRecord): string {
  if (entry.type === 'SPLIT') return '0';
  const gross =
    entry.type === 'DIVIDEND'
      ? nonnegative(entry.grossAmount)
      : positive(entry.quantity).times(nonnegative(entry.price));
  const fees = nonnegative(entry.fees);
  return serialize(entry.type === 'BUY' ? gross.plus(fees).negated() : gross.minus(fees));
}
export function replayLedger(
  records: readonly EconomicRecord[],
  voids: readonly VoidEvent[] = [],
  asOf?: string,
): LedgerProjection {
  if (asOf !== undefined && !Number.isFinite(Date.parse(asOf)))
    fail('INVALID_DATE', 'Invalid projection date.');
  const ids = new Set<string>();
  const sequences = new Set<number>();
  for (const entry of records) {
    if (
      !entry.id ||
      ids.has(entry.id) ||
      !Number.isSafeInteger(entry.sequence) ||
      entry.sequence < 1 ||
      sequences.has(entry.sequence)
    )
      fail('DUPLICATE_RECORD', 'Ledger identities and sequences must be unique.');
    ids.add(entry.id);
    sequences.add(entry.sequence);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.effectiveAt) ||
      !Number.isFinite(Date.parse(entry.effectiveAt)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.tradingDate)
    )
      fail('INVALID_DATE', 'Invalid transaction date.');
    if (!/^[A-Z]{3}$/.test(entry.currency) || !/^[A-Z]{3}$/.test(entry.baseCurrency))
      fail('INVALID_CURRENCY', 'Invalid transaction currency.');
    if (entry.fx.rateDate > entry.tradingDate)
      fail('FUTURE_FX', 'Historical FX must be dated on or before the trading date.');
    positive(entry.fx.rate);
    storedDecimal(entry.fx.rate);
    if (entry.currency === entry.baseCurrency && !decimal(entry.fx.rate).equals('1'))
      fail('IDENTITY_FX', 'Same-currency FX must equal one.');
  }
  const excluded = new Set<string>();
  const voidIds = new Set<string>();
  for (const event of voids) {
    if (
      !ids.has(event.transactionId) ||
      excluded.has(event.transactionId) ||
      !event.id ||
      voidIds.has(event.id) ||
      event.reason.trim().length < 3
    )
      fail(
        'INVALID_VOID',
        'Void events must reference a unique existing transaction and include a reason.',
      );
    excluded.add(event.transactionId);
    voidIds.add(event.id);
  }
  const ordered = records
    .filter((entry) => !excluded.has(entry.id) && (asOf === undefined || entry.effectiveAt <= asOf))
    .toSorted((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.sequence - b.sequence);
  const positions = new Map<string, WorkingPosition>();
  const cashFlows: Record<string, string> = {};
  for (const entry of ordered) {
    const p = positions.get(entry.instrumentId) ?? {
      instrumentId: entry.instrumentId,
      currency: entry.currency,
      baseCurrency: entry.baseCurrency,
      lots: [],
      realizedLocal: decimal('0'),
      realizedBase: decimal('0'),
      dividendLocal: decimal('0'),
      dividendBase: decimal('0'),
    };
    if (p.currency !== entry.currency || p.baseCurrency !== entry.baseCurrency)
      fail('CURRENCY_MISMATCH', 'Instrument and portfolio currencies cannot change during replay.');
    positions.set(entry.instrumentId, p);
    const fx = positive(entry.fx.rate);
    if (entry.type === 'BUY' || entry.type === 'SELL') {
      const qty = positive(entry.quantity);
      storedDecimal(entry.quantity, 18);
      storedDecimal(entry.price, 10);
      storedDecimal(entry.fees);
      const gross = qty.times(nonnegative(entry.price));
      const fees = nonnegative(entry.fees);
      if (entry.type === 'BUY') {
        const cost = gross.plus(fees);
        p.lots.push({
          transactionId: entry.id,
          quantity: qty,
          localCost: cost,
          baseCost: cost.times(fx),
        });
        cashFlows[entry.id] = serialize(cost.negated());
      } else {
        if (fees.greaterThan(gross))
          fail('FEES_EXCEED_PROCEEDS', 'Fees cannot exceed sale proceeds.');
        if (qty.greaterThan(sum(p.lots.map((lot) => lot.quantity))))
          fail(
            'OVERSELL',
            'This transaction would sell more units than held at its effective date.',
          );
        let remaining = qty;
        let releasedLocal = decimal('0');
        let releasedBase = decimal('0');
        for (const lot of p.lots) {
          if (remaining.isZero()) break;
          const taken = remaining.lessThan(lot.quantity) ? remaining : lot.quantity;
          // Release the exact residual on full consumption; partial releases preserve both cost currencies.
          const local = taken.equals(lot.quantity)
            ? lot.localCost
            : lot.localCost.times(taken).div(lot.quantity);
          const base = taken.equals(lot.quantity)
            ? lot.baseCost
            : lot.baseCost.times(taken).div(lot.quantity);
          lot.quantity = lot.quantity.minus(taken);
          lot.localCost = lot.localCost.minus(local);
          lot.baseCost = lot.baseCost.minus(base);
          releasedLocal = releasedLocal.plus(local);
          releasedBase = releasedBase.plus(base);
          remaining = remaining.minus(taken);
        }
        p.lots = p.lots.filter((lot) => !lot.quantity.isZero());
        const net = gross.minus(fees);
        p.realizedLocal = p.realizedLocal.plus(net.minus(releasedLocal));
        p.realizedBase = p.realizedBase.plus(net.times(fx).minus(releasedBase));
        cashFlows[entry.id] = serialize(net);
      }
    } else if (entry.type === 'DIVIDEND') {
      const gross = nonnegative(entry.grossAmount);
      const fees = nonnegative(entry.fees);
      storedDecimal(entry.grossAmount);
      storedDecimal(entry.fees);
      if (fees.greaterThan(gross))
        fail('FEES_EXCEED_INCOME', 'Fees or withholding cannot exceed gross dividend income.');
      const income = gross.minus(fees);
      p.dividendLocal = p.dividendLocal.plus(income);
      p.dividendBase = p.dividendBase.plus(income.times(fx));
      cashFlows[entry.id] = serialize(income);
    } else {
      const numerator = positive(entry.numerator);
      const denominator = positive(entry.denominator);
      storedDecimal(entry.numerator);
      storedDecimal(entry.denominator);
      if (!p.lots.length) fail('SPLIT_WITHOUT_POSITION', 'A split requires an existing position.');
      for (const lot of p.lots) {
        const units = lot.quantity.times(numerator).div(denominator);
        try {
          storedDecimal(serialize(units), 18);
        } catch {
          fail(
            'CASH_IN_LIEU_UNSUPPORTED',
            'This split produces unsupported fractional units; cash-in-lieu is not supported.',
          );
        }
        lot.quantity = units;
      }
      cashFlows[entry.id] = '0';
    }
  }
  for (const entry of ordered) cashFlows[entry.id] = nativeCashFlow(entry);
  return {
    cashFlows,
    positions: [...positions.values()]
      .sort((a, b) => a.instrumentId.localeCompare(b.instrumentId))
      .map((p) => {
        const quantity = sum(p.lots.map((lot) => lot.quantity));
        const localCost = sum(p.lots.map((lot) => lot.localCost));
        return {
          instrumentId: p.instrumentId,
          currency: p.currency,
          baseCurrency: p.baseCurrency,
          quantity: serialize(quantity),
          localCost: serialize(localCost),
          baseCost: serialize(sum(p.lots.map((lot) => lot.baseCost))),
          averageCost: quantity.isZero() ? null : serialize(localCost.div(quantity)),
          realizedLocal: serialize(p.realizedLocal),
          realizedBase: serialize(p.realizedBase),
          dividendLocal: serialize(p.dividendLocal),
          dividendBase: serialize(p.dividendBase),
          lots: p.lots.map((lot) => ({
            transactionId: lot.transactionId,
            quantity: serialize(lot.quantity),
            localCost: serialize(lot.localCost),
            baseCost: serialize(lot.baseCost),
          })),
        };
      }),
  };
}
