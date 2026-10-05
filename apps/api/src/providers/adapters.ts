import { z } from 'zod';
import YahooFinance from 'yahoo-finance2';
import { Quote, FxProvenance, PriceHistory } from '@folio/shared';
import type { Instrument, CurrentFx } from '@folio/shared';
import type { Env } from '../config/env.ts';
import type { MarketGateway } from './market.ts';
import { ProviderTransport, ProviderUnavailable } from './transport.ts';
import { parseExact, exactFinancial, exactPrice, timestamp } from './exact.ts';
import { decimal, serialize } from '../services/financial/decimal.ts';
import { CachedProvider } from '../services/market-cache.ts';
import type { MarketCache } from '../services/market-cache.ts';
import { exchangeDate, quoteFreshness } from './calendars.ts';

const fxRows = z.array(
  z.object({ date: z.iso.date(), base: z.string(), quote: z.string(), rate: z.string() }),
);
const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string(),
            currency: z.string(),
            regularMarketPrice: z.string(),
            regularMarketTime: z.string(),
          }),
          timestamp: z.array(z.string()).optional(),
          indicators: z.object({
            quote: z.array(z.object({ close: z.array(z.string().nullable()).optional() })),
          }),
        }),
      )
      .nullable(),
    error: z.unknown(),
  }),
});
const coinsSchema = z.array(
  z.object({
    id: z.string(),
    current_price: z.string().nullable(),
    price_change_24h: z.string().nullable(),
    last_updated: z.iso.datetime(),
  }),
);
const historySchema = z.object({ prices: z.array(z.tuple([z.string(), z.string()])) });
const unavailableHistory = (reason: string): z.infer<typeof PriceHistory> => ({
  status: 'unavailable',
  reason,
  label: 'Observed split-adjusted price history; price only, not portfolio performance.',
  points: [],
  source: null,
  fixture: false,
});
export class LiveMarketGateway implements MarketGateway {
  async drain() {
    await this.cached.drain();
  }
  private readonly env: Env;
  private readonly transport: ProviderTransport;
  private readonly cached: CachedProvider;
  private readonly cache: MarketCache;
  private readonly master: readonly Instrument[];
  private readonly now: () => Date;
  private readonly yahoo = new YahooFinance({
    versionCheck: false,
    suppressNotices: ['yahooSurvey'],
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, dir: () => {} },
    queue: { concurrency: 2 },
  });
  constructor(
    env: Env,
    cache: MarketCache,
    master: readonly Instrument[],
    transport = new ProviderTransport(),
    now: () => Date = () => new Date(),
  ) {
    if (env.DEMO_MODE || env.LOCAL_FIXTURE_MODE)
      throw new Error('Live providers cannot run in DEMO_MODE or local fixture mode.');
    this.env = env;
    this.cache = cache;
    this.master = master;
    this.transport = transport;
    this.now = now;
    this.cached = new CachedProvider(cache, env.CACHE_NAMESPACE, () => this.now().getTime());
  }
  async historicalFx(
    currency: string,
    baseCurrency: string,
    date: string,
  ): Promise<z.infer<typeof FxProvenance> | null> {
    if (
      !/^[A-Z]{3}$/.test(currency) ||
      !/^[A-Z]{3}$/.test(baseCurrency) ||
      !z.iso.date().safeParse(date).success ||
      date > this.now().toISOString().slice(0, 10)
    )
      return null;
    if (currency === baseCurrency)
      return {
        rate: '1',
        rateDate: date,
        source: 'identity',
        reference: `${currency}/${baseCurrency}`,
      };
    const key = `fx:${currency}:${baseCurrency}:${date}`;
    const result = await this.cached.get(
      key,
      async () => {
        const url = new URL('https://api.frankfurter.dev/v2/rates');
        url.search = new URLSearchParams({
          base: currency,
          quotes: baseCurrency,
          providers: 'ecb',
          date,
        }).toString();
        const rows = fxRows
          .parse(parseExact(await this.transport.text(url.toString())))
          .filter((r) => r.base === currency && r.quote === baseCurrency && r.date <= date)
          .toSorted((a, b) => b.date.localeCompare(a.date));
        const row = rows[0];
        if (!row) throw new ProviderUnavailable('FX_COVERAGE_UNAVAILABLE');
        return FxProvenance.parse({
          rate: exactPrice(row.rate),
          rateDate: row.date,
          source: 'Frankfurter/ECB',
          reference: `ECB daily ${currency}/${baseCurrency}; requested ${date}`,
        });
      },
      (v) => FxProvenance.parse(v),
      86400,
      365 * 86400,
      'frankfurter',
    );
    return result?.value ?? null;
  }
  async rates(currencies: readonly string[], baseCurrency: string) {
    const result: Record<string, z.infer<typeof CurrentFx>> = {};
    const today = this.now().toISOString().slice(0, 10);
    for (const currency of [...new Set(currencies)].sort()) {
      const fx = await this.historicalFx(currency, baseCurrency, today);
      if (!fx) continue;
      const age = this.now().getTime() - new Date(fx.rateDate + 'T00:00:00.000Z').getTime();
      result[currency] = {
        ...fx,
        asOf: fx.rateDate + 'T00:00:00.000Z',
        status: currency === baseCurrency || age <= 4 * 86400000 ? 'fresh' : 'stale',
      };
    }
    return result;
  }
  private async chart(instrument: Instrument, days: number) {
    let captured: string | undefined;
    const transport = this.transport;
    const rawFetch: typeof fetch = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      captured = await transport.text(url);
      return new Response(captured, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    // The wrapper's parsed numeric result is discarded. Only bounded raw text crosses the financial parser.
    await this.yahoo.chart(
      instrument.providerId,
      {
        period1: new Date(this.now().getTime() - days * 86400000),
        period2: this.now(),
        interval: '1d',
        return: 'object',
      },
      { fetch: rawFetch, validateResult: false },
    );
    if (captured === undefined) throw new ProviderUnavailable('RAW_RESPONSE_UNAVAILABLE');
    const body = chartSchema.parse(parseExact(captured));
    const chart = body.chart.result?.[0];
    if (
      body.chart.error ||
      !chart ||
      chart.meta.symbol !== instrument.providerId ||
      chart.meta.currency !== instrument.currency
    )
      throw new ProviderUnavailable('IDENTITY_MISMATCH');
    return chart;
  }
  private async yahooQuote(instrument: Instrument) {
    if (!this.env.YAHOO_DISPLAY_ENTITLED) return null;
    const value = await this.cached.get(
      'yahoo:quote:' + instrument.id,
      async () => {
        const chart = await this.chart(instrument, 14);
        const asOf = timestamp(chart.meta.regularMarketTime);
        const quoteDate = exchangeDate(asOf, instrument.exchange);
        const previous = (chart.timestamp ?? [])
          .flatMap((stamp, index) => {
            const price = chart.indicators.quote[0]?.close?.[index];
            const date = exchangeDate(timestamp(stamp), instrument.exchange);
            return price !== null && price !== undefined && date < quoteDate
              ? [{ date, price }]
              : [];
          })
          .toSorted((a, b) => b.date.localeCompare(a.date))[0];
        return Quote.parse({
          instrumentId: instrument.id,
          currency: instrument.currency,
          price: exactPrice(chart.meta.regularMarketPrice),
          referencePrice: previous ? exactPrice(previous.price) : null,
          referencePeriod: 'previous-close',
          source: 'Yahoo wrapper; display entitlement configured',
          asOf: asOf.toISOString(),
          status: quoteFreshness(instrument, asOf, this.now()),
          fixture: false,
        });
      },
      (v) => Quote.parse(v),
      60,
      7 * 86400,
      'yahoo',
    );
    if (!value) return null;
    return {
      ...value.value,
      status: value.stale
        ? 'stale'
        : quoteFreshness(instrument, new Date(value.value.asOf), this.now()),
    };
  }
  private async cryptoBudget() {
    const prefix = this.env.CACHE_NAMESPACE + ':coingecko-budget:';
    const month = this.now().toISOString().slice(0, 7);
    const minute = this.now().toISOString().slice(0, 16);
    if ((await this.cache.increment(prefix + 'minute:' + minute, 120)) > 60)
      throw new ProviderUnavailable('MINUTE_BUDGET');
    if ((await this.cache.increment(prefix + 'month:' + month, 32 * 86400)) > 9000)
      throw new ProviderUnavailable('MONTH_BUDGET');
  }
  private async cryptoQuotes() {
    if (!this.env.COINGECKO_DEMO_KEY) return [];
    const ids = this.master
      .filter((i) => i.provider === 'coingecko' && i.currency === 'USD')
      .map((i) => i.providerId)
      .sort();
    if (!ids.length || ids.length > 50) return [];
    const value = await this.cached.get(
      'coingecko:canonical-usd:' + ids.join(','),
      async () => {
        await this.cryptoBudget();
        const url = new URL('https://api.coingecko.com/api/v3/coins/markets');
        url.search = new URLSearchParams({
          vs_currency: 'usd',
          ids: ids.join(','),
          per_page: '50',
          page: '1',
          sparkline: 'false',
          precision: 'full',
        }).toString();
        const rows = coinsSchema.parse(
          parseExact(
            await this.transport.text(url.toString(), {
              'x-cg-demo-api-key': this.env.COINGECKO_DEMO_KEY!,
            }),
          ),
        );
        return rows.flatMap((row) => {
          const instrument = this.master.find(
            (i) => i.provider === 'coingecko' && i.providerId === row.id,
          );
          if (!instrument || row.current_price === null) return [];
          const price = exactPrice(row.current_price);
          const reference =
            row.price_change_24h === null
              ? null
              : serialize(decimal(price).minus(exactFinancial(row.price_change_24h)));
          if (reference !== null && decimal(reference).isNegative()) return [];
          return [
            Quote.parse({
              instrumentId: instrument.id,
              currency: 'USD',
              price,
              referencePrice: reference,
              referencePeriod: 'rolling-24h',
              source: 'CoinGecko Demo; provider-reported 24h price change',
              asOf: row.last_updated,
              status: quoteFreshness(instrument, new Date(row.last_updated), this.now()),
              fixture: false,
            }),
          ];
        });
      },
      (v) => z.array(Quote).parse(v),
      300,
      86400,
      'coingecko',
    );
    return (
      value?.value.map((q) => ({
        ...q,
        status: value.stale
          ? ('stale' as const)
          : quoteFreshness(
              this.master.find((i) => i.id === q.instrumentId)!,
              new Date(q.asOf),
              this.now(),
            ),
      })) ?? []
    );
  }
  async quotes(instruments: readonly Instrument[]) {
    const result: z.infer<typeof Quote>[] = [];
    const eligible = instruments.filter((instrument) =>
      this.master.some(
        (i) =>
          i.id === instrument.id &&
          i.provider === instrument.provider &&
          i.providerId === instrument.providerId &&
          i.currency === instrument.currency,
      ),
    );
    const crypto = eligible.some((i) => i.provider === 'coingecko')
      ? await this.cryptoQuotes()
      : [];
    for (const instrument of eligible) {
      const quote =
        instrument.provider === 'coingecko'
          ? crypto.find((q) => q.instrumentId === instrument.id)
          : await this.yahooQuote(instrument);
      if (quote) result.push(quote);
    }
    return result;
  }
  async history(instrument: Instrument): Promise<z.infer<typeof PriceHistory>> {
    if (!this.master.some((i) => i.id === instrument.id && i.providerId === instrument.providerId))
      return unavailableHistory('Canonical provider identity is unavailable.');
    if (instrument.provider === 'yahoo' && !this.env.YAHOO_DISPLAY_ENTITLED)
      return unavailableHistory(
        'Yahoo display/history entitlement is unverified; provider use is gated.',
      );
    if (instrument.provider === 'coingecko' && !this.env.COINGECKO_DEMO_KEY)
      return unavailableHistory('CoinGecko Demo key is not configured.');
    const result = await this.cached.get(
      'history:' + instrument.id,
      async () => {
        if (instrument.provider === 'yahoo') {
          const chart = await this.chart(instrument, 365);
          const points = (chart.timestamp ?? []).flatMap((stamp, index) => {
            const price = chart.indicators.quote[0]?.close?.[index];
            return price === null || price === undefined
              ? []
              : [
                  {
                    date: exchangeDate(timestamp(stamp), instrument.exchange),
                    price: exactPrice(price),
                  },
                ];
          });
          return PriceHistory.parse({
            status: 'available',
            reason: null,
            label:
              'Observed Yahoo split-adjusted price history; excludes adjclose. Not portfolio performance or pre-split ledger valuation.',
            points,
            source: 'Yahoo wrapper; display entitlement configured',
            fixture: false,
          });
        }
        await this.cryptoBudget();
        const url = new URL(
          `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(instrument.providerId)}/market_chart`,
        );
        url.search = new URLSearchParams({
          vs_currency: 'usd',
          days: '365',
          interval: 'daily',
          precision: 'full',
        }).toString();
        const response = historySchema.parse(
          parseExact(
            await this.transport.text(url.toString(), {
              'x-cg-demo-api-key': this.env.COINGECKO_DEMO_KEY!,
            }),
          ),
        );
        const points = response.prices.map(([time, price]) => ({
          date: timestamp(serialize(decimal(time).div('1000').floor()))
            .toISOString()
            .slice(0, 10),
          price: exactPrice(price),
        }));
        return PriceHistory.parse({
          status: 'available',
          reason: null,
          label:
            'Observed CoinGecko USD price history; available last-year coverage only. Not portfolio performance.',
          points,
          source: 'CoinGecko Demo',
          fixture: false,
        });
      },
      (v) => PriceHistory.parse(v),
      3600,
      86400,
      instrument.provider,
    );
    return (
      result?.value ??
      unavailableHistory('Provider history is unavailable or its request budget is exhausted.')
    );
  }
}
