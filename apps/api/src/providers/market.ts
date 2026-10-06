import type { FxProvenance, Instrument } from '@folio/shared';
import type { CurrentFx, Quote } from '../services/financial/valuation.ts';
export interface PriceHistory {
  status: 'available' | 'unavailable';
  reason: string | null;
  label: string;
  points: { date: string; price: string }[];
  source: string | null;
  fixture: boolean;
}
export interface MarketGateway {
  quotes(instruments: readonly Instrument[]): Promise<Quote[]>;
  rates(currencies: readonly string[], baseCurrency: string): Promise<Record<string, CurrentFx>>;
  historicalFx(
    currency: string,
    baseCurrency: string,
    tradingDate: string,
  ): Promise<FxProvenance | null>;
  historicalFxForCommit?(
    currency: string,
    baseCurrency: string,
    tradingDate: string,
  ): Promise<{ fx: FxProvenance; stale: boolean } | null>;
  history(instrument: Instrument): Promise<PriceHistory>;
}
