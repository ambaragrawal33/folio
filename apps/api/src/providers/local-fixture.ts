import type { Instrument, FxProvenance } from '@folio/shared';
import { assertLocalFixtureEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';
import type { MarketGateway, PriceHistory } from './market.ts';
import type { CurrentFx, Quote } from '../services/financial/valuation.ts';

// Explicit synthetic test inputs, never provider observations. No network/cache/live fallback.
// RELIANCE has no price; ETH is deliberately stale. Other covered prices are generated now.
const prices: Record<string, { currency: string; price: string; previous: string }> = {
  'TCS:NSE': { currency: 'INR', price: '70', previous: '68' },
  'AAPL:US': { currency: 'USD', price: '110', previous: '108' },
  'VTI:US': { currency: 'USD', price: '14', previous: '13' },
  'BTC:CRYPTO': { currency: 'USD', price: '65000', previous: '64000' },
  'ETH:CRYPTO': { currency: 'USD', price: '2600', previous: '2550' },
};
const source = 'Local writable fixture v1 · synthetic; not live provider data';
export class LocalFixtureMarketGateway implements MarketGateway {
  capability(instrument: Instrument) {
    const supported = Boolean(prices[instrument.id]?.currency === instrument.currency);
    return {
      quotes: supported,
      closes: supported && instrument.exchange !== 'CRYPTO',
      reason: supported ? null : 'No isolated synthetic fixture is defined.',
    };
  }
  async refreshQuotes(instruments: readonly Instrument[]) {
    return this.quotes(instruments);
  }
  private readonly now: () => Date;
  constructor(env: Env, now: () => Date = () => new Date()) {
    assertLocalFixtureEnv(env);
    this.now = now;
  }
  async quotes(instruments: readonly Instrument[]): Promise<Quote[]> {
    return instruments.flatMap((instrument) => {
      const price = prices[instrument.id];
      if (!price || price.currency !== instrument.currency) return [];
      const stale = instrument.id === 'ETH:CRYPTO';
      return [
        {
          instrumentId: instrument.id,
          currency: price.currency,
          price: price.price,
          referencePrice: price.previous,
          referencePeriod:
            instrument.exchange === 'CRYPTO'
              ? ('rolling-24h' as const)
              : ('previous-close' as const),
          source,
          asOf: stale ? '2026-01-06T15:00:00.000Z' : this.now().toISOString(),
          status: stale ? ('stale' as const) : ('fresh' as const),
          fixture: true,
        },
      ];
    });
  }
  async rates(
    currencies: readonly string[],
    baseCurrency: string,
  ): Promise<Record<string, CurrentFx>> {
    if (baseCurrency !== 'INR') return {};
    return Object.fromEntries(
      [...new Set(currencies)]
        .filter((c) => c === 'INR' || c === 'USD')
        .map((currency) => [
          currency,
          {
            rate: currency === 'INR' ? '1' : '88',
            rateDate: this.now().toISOString().slice(0, 10),
            source: 'local-fixture',
            reference: source + ' · generated current reference FX',
            asOf: this.now().toISOString(),
            status: 'fresh',
          },
        ]),
    );
  }
  async historicalFx(
    currency: string,
    baseCurrency: string,
    tradingDate: string,
  ): Promise<FxProvenance | null> {
    if (currency !== 'USD' || baseCurrency !== 'INR' || tradingDate !== '2026-01-05') return null;
    return {
      rate: '83',
      rateDate: '2026-01-05',
      source: 'local-fixture',
      reference: source + ' · historical USD/INR test input',
    };
  }
  async history(instrument: Instrument): Promise<PriceHistory> {
    const price = prices[instrument.id];
    if (!price || price.currency !== instrument.currency)
      return {
        status: 'unavailable',
        reason: 'No local history fixture for this instrument.',
        label: 'Synthetic local history fixture; not provider history',
        points: [],
        source,
        fixture: true,
      };
    return {
      status: 'available',
      reason: null,
      label: 'Synthetic local price-history fixture; not observed market history',
      points: [
        { date: '2026-01-05', price: price.previous },
        { date: '2026-01-06', price: price.price },
      ],
      source,
      fixture: true,
    };
  }
}
