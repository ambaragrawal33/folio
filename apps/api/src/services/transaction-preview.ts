import { TransactionEffects } from '@folio/shared';
import { replayLedger, nativeCashFlow } from './financial/ledger.ts';
import type { EconomicRecord, VoidEvent, Position } from './financial/ledger.ts';
import { decimal, serialize } from './financial/decimal.ts';

// This adds no accounting rule: all positions and changes come from the existing engine.
export function transactionEffects(
  records: readonly EconomicRecord[],
  voids: readonly VoidEvent[],
  candidate: EconomicRecord,
) {
  const previous = replayLedger(records, voids),
    next = replayLedger([...records, candidate], voids);
  const empty: Position = {
    instrumentId: candidate.instrumentId,
    currency: candidate.currency,
    baseCurrency: candidate.baseCurrency,
    quantity: '0',
    localCost: '0',
    baseCost: '0',
    averageCost: null,
    realizedLocal: '0',
    realizedBase: '0',
    dividendLocal: '0',
    dividendBase: '0',
    lots: [],
  };
  const before = previous.positions.find((p) => p.instrumentId === candidate.instrumentId) ?? empty;
  const after = next.positions.find((p) => p.instrumentId === candidate.instrumentId)!;
  const withoutLots = ({ lots, ...position }: Position) => {
    void lots;
    return position;
  };
  const gross =
    candidate.type === 'SPLIT'
      ? decimal('0')
      : candidate.type === 'DIVIDEND'
        ? decimal(candidate.grossAmount)
        : decimal(candidate.quantity).times(candidate.price);
  const fees = decimal(candidate.type === 'SPLIT' ? '0' : candidate.fees);
  const flow = nativeCashFlow(candidate),
    fx = decimal(candidate.fx.rate);
  const change = (
    key:
      | 'quantity'
      | 'localCost'
      | 'baseCost'
      | 'realizedLocal'
      | 'realizedBase'
      | 'dividendLocal'
      | 'dividendBase',
  ) => serialize(decimal(after[key]).minus(before[key]));
  return TransactionEffects.parse({
    grossNative: serialize(gross),
    feesNative: serialize(fees),
    nativeCashFlow: flow,
    grossBase: serialize(gross.times(fx)),
    feesBase: serialize(fees.times(fx)),
    baseCashFlow: serialize(decimal(flow).times(fx)),
    before: withoutLots(before),
    after: withoutLots(after),
    quantityChange: change('quantity'),
    localCostChange: change('localCost'),
    baseCostChange: change('baseCost'),
    realizedLocalChange: change('realizedLocal'),
    realizedBaseChange: change('realizedBase'),
    dividendLocalChange: change('dividendLocal'),
    dividendBaseChange: change('dividendBase'),
  });
}
