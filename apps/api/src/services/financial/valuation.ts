import type { FxProvenance, Instrument } from '@folio/shared';
import type { Position } from './ledger.ts';
import { decimal, nonnegative, positive, serialize } from './decimal.ts';
import type { Money } from './decimal.ts';

export interface Quote {
  instrumentId: string;
  currency: string;
  price: string;
  referencePrice: string | null;
  referencePeriod: 'previous-close' | 'rolling-24h';
  source: string;
  asOf: string;
  status: 'fresh' | 'stale';
  fixture: boolean;
}
export interface CurrentFx extends FxProvenance {
  asOf: string;
  status: 'fresh' | 'stale';
}
export interface ValuedHolding extends Position {
  instrument: Instrument;
  quote: Quote | null;
  fx: CurrentFx | null;
  localValue: string | null;
  baseValue: string | null;
  unrealizedBase: string | null;
  localReturn: string | null;
  baseReturn: string | null;
  fxReturnEffect: string | null;
  priceContribution: string | null;
  fxContribution: string | null;
  movementBase: string | null;
  movementReferenceBase: string | null;
  weight: string | null;
  unavailableReason: string | null;
  returnUnavailableReason: string | null;
}
export interface Allocation {
  dimension: 'instrument' | 'assetClass' | 'sector' | 'currency';
  label: string;
  baseValue: string;
  weight: string;
}
export interface Valuation {
  baseCurrency: string;
  complete: boolean;
  status: 'empty' | 'fresh' | 'stale' | 'partial';
  asOf: string | null;
  coverage: { valued: number; total: number };
  holdings: ValuedHolding[];
  knownValuedSubtotal: string;
  totalValue: string | null;
  totalBaseCost: string;
  unrealizedBase: string | null;
  costBasedReturn: string | null;
  realizedBase: string;
  dividendBase: string;
  movementBase: string | null;
  movementReturn: string | null;
  movementLabel: string;
  allocation: Allocation[] | null;
  concentration: { dimension: 'instrument' | 'sector'; label: string; weight: string }[] | null;
  sectorCoverage: { classified: number; total: number };
  sectorConcentrationUnavailableReason: string | null;
}
const zero = () => decimal('0');
const sum = (values: string[]) =>
  values.reduce((result, value) => result.plus(decimal(value)), zero());
export function valuePortfolio(
  positions: readonly Position[],
  instruments: readonly Instrument[],
  quotes: readonly Quote[],
  rates: Readonly<Record<string, CurrentFx>>,
  baseCurrency: string,
  limits = { instrument: '0.25', sector: '0.4' },
): Valuation {
  const instrumentLimit = positive(limits.instrument);
  const sectorLimit = positive(limits.sector);
  const active = positions.filter((p) => !decimal(p.quantity).isZero());
  const usedDates: string[] = [];
  let stale = false;
  const holdings: ValuedHolding[] = active.map((p) => {
    const instrument = instruments.find((i) => i.id === p.instrumentId);
    if (!instrument || instrument.currency !== p.currency || p.baseCurrency !== baseCurrency)
      throw new Error('Canonical instrument/portfolio currency mismatch.');
    const candidate = quotes.find((q) => q.instrumentId === p.instrumentId);
    const quote = candidate?.currency === p.currency ? candidate : null;
    const fx = rates[p.currency] ?? null;
    const reason = !quote
      ? 'Market price is unavailable.'
      : !fx
        ? 'Reference FX is unavailable.'
        : null;
    const local = quote ? nonnegative(quote.price).times(decimal(p.quantity)) : null;
    const value = local && fx ? local.times(positive(fx.rate)) : null;
    let localReturn: Money | null = null;
    let baseReturn: Money | null = null;
    let priceContribution: Money | null = null;
    let fxContribution: Money | null = null;
    const noCost = decimal(p.localCost).isZero() || decimal(p.baseCost).isZero();
    if (local !== null && value !== null && fx !== null) {
      usedDates.push(quote!.asOf, fx.asOf);
      stale ||= quote!.status === 'stale' || fx.status === 'stale';
      if (!noCost) {
        const historical = decimal(p.baseCost).div(decimal(p.localCost));
        localReturn = local.div(decimal(p.localCost)).minus('1');
        baseReturn = value.div(decimal(p.baseCost)).minus('1');
        priceContribution = local.minus(decimal(p.localCost)).times(historical);
        fxContribution = local.times(decimal(fx.rate).minus(historical));
      }
    }
    const reference =
      quote?.referencePrice !== null && quote?.referencePrice !== undefined && fx
        ? nonnegative(quote.referencePrice).times(decimal(p.quantity)).times(positive(fx.rate))
        : null;
    return {
      ...p,
      instrument,
      quote,
      fx,
      localValue: local === null ? null : serialize(local),
      baseValue: value === null ? null : serialize(value),
      unrealizedBase: value === null ? null : serialize(value.minus(decimal(p.baseCost))),
      localReturn: localReturn === null ? null : serialize(localReturn),
      baseReturn: baseReturn === null ? null : serialize(baseReturn),
      fxReturnEffect:
        localReturn === null || baseReturn === null
          ? null
          : serialize(baseReturn.minus(localReturn)),
      priceContribution: priceContribution === null ? null : serialize(priceContribution),
      fxContribution: fxContribution === null ? null : serialize(fxContribution),
      movementBase: value === null || reference === null ? null : serialize(value.minus(reference)),
      movementReferenceBase: reference === null ? null : serialize(reference),
      weight: null,
      unavailableReason: reason,
      returnUnavailableReason:
        reason ??
        (noCost ? 'Return and FX decomposition are unavailable for a zero cost basis.' : null),
    };
  });
  const complete = holdings.every((h) => h.baseValue !== null);
  const classified = holdings.filter((h) => h.instrument.sector !== 'Unknown').length;
  const known = sum(holdings.flatMap((h) => (h.baseValue === null ? [] : [h.baseValue])));
  const cost = sum(holdings.map((h) => h.baseCost));
  const movementComplete = complete && holdings.every((h) => h.movementBase !== null);
  const movement = sum(holdings.flatMap((h) => (h.movementBase === null ? [] : [h.movementBase])));
  const reference = sum(
    holdings.flatMap((h) => (h.movementReferenceBase === null ? [] : [h.movementReferenceBase])),
  );
  let allocation: Allocation[] | null = null;
  let concentration: Valuation['concentration'] = null;
  if (complete && !known.isZero()) {
    allocation = [];
    concentration = [];
    for (const dimension of ['instrument', 'assetClass', 'sector', 'currency'] as const) {
      const buckets = new Map<string, Money>();
      for (const h of holdings) {
        const label =
          dimension === 'instrument'
            ? h.instrumentId
            : dimension === 'currency'
              ? h.currency
              : h.instrument[dimension];
        buckets.set(label, (buckets.get(label) ?? zero()).plus(decimal(h.baseValue!)));
        h.weight = serialize(decimal(h.baseValue!).div(known));
      }
      for (const [label, value] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const weight = value.div(known);
        allocation.push({
          dimension,
          label,
          baseValue: serialize(value),
          weight: serialize(weight),
        });
        if (
          (dimension === 'instrument' && weight.greaterThan(instrumentLimit)) ||
          (dimension === 'sector' &&
            classified === holdings.length &&
            weight.greaterThan(sectorLimit))
        )
          concentration.push({
            dimension: dimension as 'instrument' | 'sector',
            label,
            weight: serialize(weight),
          });
      }
    }
  }
  return {
    baseCurrency,
    complete,
    status: !holdings.length ? 'empty' : !complete ? 'partial' : stale ? 'stale' : 'fresh',
    asOf: usedDates.toSorted()[0] ?? null,
    coverage: {
      valued: holdings.filter((h) => h.baseValue !== null).length,
      total: holdings.length,
    },
    holdings,
    knownValuedSubtotal: serialize(known),
    totalValue: complete ? serialize(known) : null,
    totalBaseCost: serialize(cost),
    unrealizedBase: complete ? serialize(known.minus(cost)) : null,
    costBasedReturn: !complete || cost.isZero() ? null : serialize(known.div(cost).minus('1')),
    realizedBase: serialize(sum(positions.map((p) => p.realizedBase))),
    dividendBase: serialize(sum(positions.map((p) => p.dividendBase))),
    movementBase: movementComplete ? serialize(movement) : null,
    movementReturn:
      !movementComplete || reference.isZero() ? null : serialize(movement.div(reference)),
    movementLabel:
      'Current holdings/current reference FX: equities versus previous close; crypto rolling 24h. Mixed periods; excludes trading flows and daily FX movement.',
    allocation,
    concentration,
    sectorCoverage: { classified, total: holdings.length },
    sectorConcentrationUnavailableReason:
      classified !== holdings.length
        ? 'Sector concentration is unavailable because sector metadata is incomplete.'
        : null,
  };
}
