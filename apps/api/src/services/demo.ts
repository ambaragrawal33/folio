import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import type { Env } from '../config/env.ts';
import type { AuthService } from './auth.ts';
import type { DomainService } from './domain.ts';
import type { MarketGateway } from '../providers/market.ts';
import type { CurrentFx, Quote } from './financial/valuation.ts';
import type { EconomicRecord } from './financial/ledger.ts';
import { replayLedger } from './financial/ledger.ts';
import { storedDecimal } from './financial/decimal.ts';
import type { Instrument } from '@folio/shared';
import { PasswordAuthProvider } from '../providers/password-auth.ts';

const effectiveAt = '2026-01-05T15:00:00.000Z';
const tradingDate = '2026-01-05';
const provenance = (currency: string, rate = '83') => ({
  rate: currency === 'INR' ? '1' : rate,
  rateDate: tradingDate,
  source: 'demo-fixture' as const,
  reference: 'Hand-computed isolated demo fixture; not a provider rate',
});
export function demoRecords(): EconomicRecord[] {
  const common = {
    currency: 'INR',
    baseCurrency: 'INR',
    instrumentId: 'TCS:NSE',
    effectiveAt,
    tradingDate,
    fx: provenance('INR'),
  };
  return [
    {
      ...common,
      id: '000000000000000000000001',
      sequence: 1,
      type: 'BUY',
      quantity: '10',
      price: '100',
      fees: '10',
    },
    {
      ...common,
      id: '000000000000000000000002',
      sequence: 2,
      type: 'BUY',
      quantity: '5',
      price: '120',
      fees: '5',
    },
    {
      ...common,
      id: '000000000000000000000003',
      sequence: 3,
      type: 'SELL',
      quantity: '12',
      price: '150',
      fees: '12',
    },
    {
      ...common,
      id: '000000000000000000000004',
      sequence: 4,
      type: 'SPLIT',
      numerator: '2',
      denominator: '1',
    },
    {
      ...common,
      id: '000000000000000000000005',
      sequence: 5,
      type: 'DIVIDEND',
      grossAmount: '30',
      fees: '2',
    },
    {
      ...common,
      id: '000000000000000000000006',
      sequence: 6,
      type: 'BUY',
      instrumentId: 'AAPL:US',
      currency: 'USD',
      fx: provenance('USD'),
      quantity: '10',
      price: '100',
      fees: '0',
    },
    {
      ...common,
      id: '000000000000000000000007',
      sequence: 7,
      type: 'BUY',
      instrumentId: 'VTI:US',
      currency: 'USD',
      fx: provenance('USD', '83.15'),
      quantity: '3',
      price: '12',
      fees: '0',
    },
    {
      ...common,
      id: '000000000000000000000008',
      sequence: 8,
      type: 'BUY',
      instrumentId: 'BTC:CRYPTO',
      currency: 'USD',
      fx: provenance('USD'),
      quantity: '0.015',
      price: '60000',
      fees: '2',
    },
    {
      ...common,
      id: '000000000000000000000009',
      sequence: 9,
      type: 'BUY',
      instrumentId: 'ETH:CRYPTO',
      currency: 'USD',
      fx: provenance('USD'),
      quantity: '0.125',
      price: '2400',
      fees: '1',
    },
  ];
}
export class DemoMarketGateway implements MarketGateway {
  constructor(env: Env) {
    if (!env.DEMO_MODE) throw new Error('Demo fixtures cannot run in normal mode.');
  }
  async quotes(instruments: readonly Instrument[]): Promise<Quote[]> {
    const prices: Record<string, { price: string; reference: string }> = {
      'TCS:NSE': { price: '70', reference: '68' },
      'AAPL:US': { price: '110', reference: '108' },
      'VTI:US': { price: '14', reference: '13' },
      'BTC:CRYPTO': { price: '65000', reference: '64000' },
      'ETH:CRYPTO': { price: '2600', reference: '2550' },
    };
    return instruments.flatMap((instrument) => {
      const price = prices[instrument.id];
      return price
        ? [
            {
              instrumentId: instrument.id,
              currency: instrument.currency,
              price: price.price,
              referencePrice: price.reference,
              referencePeriod: instrument.exchange === 'CRYPTO' ? 'rolling-24h' : 'previous-close',
              source: 'Hand-computed demo price fixture; not live market data',
              asOf: '2026-01-06T15:00:00.000Z',
              status: 'stale' as const,
              fixture: true,
            },
          ]
        : [];
    });
  }
  async rates(
    currencies: readonly string[],
    baseCurrency: string,
  ): Promise<Record<string, CurrentFx>> {
    if (baseCurrency !== 'INR') throw new Error('Unsupported demo base currency.');
    return Object.fromEntries(
      [...new Set(currencies)]
        .filter((c) => c === 'INR' || c === 'USD')
        .map((currency) => [
          currency,
          {
            ...provenance(currency, '88'),
            asOf: tradingDate + 'T00:00:00.000Z',
            status: 'stale' as const,
          },
        ]),
    );
  }
  async historicalFx() {
    return null;
  }
  async history() {
    return {
      status: 'unavailable' as const,
      reason:
        'The read-only demo contains hand-computed current fixtures and no fabricated historical backfill.',
      label: 'Price history unavailable in this fixture demo.',
      points: [],
      source: null,
      fixture: true,
    };
  }
}
export async function seedDemo(env: Env, auth: AuthService, domain: DomainService) {
  if (
    !env.DEMO_MODE ||
    (auth.connection.name !== 'folio_demo' &&
      !(env.NODE_ENV === 'test' && auth.connection.name.startsWith('folio_demo_test_')))
  )
    throw new Error('Demo seed requires isolated demo storage.');
  const passwordHash = await new PasswordAuthProvider().hash(randomBytes(48).toString('base64url'));
  await auth.connection.transaction(async (session) => {
    const user = await auth.models.User.findOneAndUpdate(
      { email: 'demo@folio.invalid' },
      {
        $setOnInsert: {
          name: 'Folio Demo',
          passwordHash,
          emailVerifiedAt: new Date(tradingDate + 'T00:00:00.000Z'),
          demoReadonly: true,
        },
      },
      { upsert: true, returnDocument: 'after', session },
    );
    if (!user?.demoReadonly) throw new Error('Demo identity is not read-only.');
    const existing = await domain.models.Portfolio.findOne({
      userId: user._id,
      key: 'default',
    }).session(session);
    if (existing) {
      if (
        (await domain.models.Economic.countDocuments({ portfolioId: existing._id }).session(
          session,
        )) !== 9
      )
        throw new Error('Demo seed is inconsistent.');
      return;
    }
    const [portfolio] = await domain.models.Portfolio.create(
      [
        {
          userId: user._id,
          name: 'Demo Portfolio',
          key: 'default',
          baseCurrency: 'INR',
          costBasis: 'FIFO',
          revision: 1,
          nextSequence: 9,
          currencyLockedAt: new Date(effectiveAt),
          dirtyFrom: new Date(effectiveAt),
        },
      ],
      { session },
    );
    const records = demoRecords();
    const projection = replayLedger(records);
    for (const record of records) {
      const { id, ...fields } = record;
      const values = Object.fromEntries(
        Object.entries(fields)
          .filter(([key]) =>
            ['quantity', 'price', 'fees', 'grossAmount', 'numerator', 'denominator'].includes(key),
          )
          .map(([key, value]) => [key, storedDecimal(value as string)]),
      );
      await domain.models.Economic.create(
        [
          {
            ...fields,
            ...values,
            _id: new Types.ObjectId(id),
            userId: user._id,
            portfolioId: portfolio!._id,
            idempotencyKey: 'demo-v1-' + record.sequence,
            requestHash: 'demo-hand-fixture-v1-' + record.sequence,
            fx: { ...record.fx, rate: storedDecimal(record.fx.rate) },
            effectiveAt: new Date(effectiveAt),
            recordedAt: new Date(effectiveAt),
          },
        ],
        { session },
      );
    }
    await domain.models.Projection.create(
      projection.positions.map((p) => ({
        userId: user._id,
        portfolioId: portfolio!._id,
        instrumentId: p.instrumentId,
        quantity: storedDecimal(p.quantity, 18),
        revision: 1,
        projectionVersion: 1,
      })),
      { session, ordered: true },
    );
  });
}
