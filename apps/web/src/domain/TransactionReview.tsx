import type { TransactionPreview } from '@folio/shared';
import { useFinancialDisplay } from './client';
export function TransactionReview({ preview }: { preview: TransactionPreview }) {
  const f = useFinancialDisplay(),
    input = preview.input,
    currency = preview.instrument.currency,
    base = preview.baseCurrency,
    effects = preview.effects;
  return (
    <>
      <dl className="portfolio-details" aria-label="Server-resolved transaction review">
        <dt>Type / instrument</dt>
        <dd>
          {input.type} · {preview.instrument.id} · {currency}
        </dd>
        <dt>Effective UTC instant</dt>
        <dd>{input.effectiveAt}</dd>
        <dt>Exchange trading date</dt>
        <dd>{input.tradingDate}</dd>
        {'quantity' in input && (
          <>
            <dt>Quantity</dt>
            <dd>{f.quantity(input.quantity)}</dd>
            <dt>Native price</dt>
            <dd>{f.price(input.price, currency)}</dd>
          </>
        )}
        {'grossAmount' in input && (
          <>
            <dt>Gross native dividend</dt>
            <dd>{f.money(input.grossAmount, currency)}</dd>
          </>
        )}
        {'fees' in input && (
          <>
            <dt>Fees / withholding</dt>
            <dd>{f.money(input.fees, currency)}</dd>
          </>
        )}
        {'numerator' in input && (
          <>
            <dt>Split ratio</dt>
            <dd>
              {input.numerator}:{input.denominator} · preserves total lot cost
            </dd>
          </>
        )}
        <dt>Historical FX method</dt>
        <dd>
          {preview.fxMode === 'identity'
            ? 'Identity · no conversion required'
            : preview.fxMode === 'override'
              ? 'Explicit manual override'
              : preview.fx.source === 'local-fixture'
                ? 'Automatic · explicit local historical FX fixture'
                : 'Automatic historical reference'}
        </dd>
        <dt>Resolved historical FX</dt>
        <dd>
          {preview.fx.rate} {base} per {currency} · {preview.fx.rateDate}
        </dd>
        <dt>FX source / provenance</dt>
        <dd>
          <span>
            {preview.fx.source} · {preview.fx.reference}
          </span>
        </dd>
        <dt>Native gross / fees</dt>
        <dd>
          {f.money(effects.grossNative, currency)} / {f.money(effects.feesNative, currency)}
        </dd>
        <dt>Signed native cash flow</dt>
        <dd>{f.money(effects.nativeCashFlow, currency)}</dd>
        <dt>Base gross / fees</dt>
        <dd>
          {f.money(effects.grossBase, base)} / {f.money(effects.feesBase, base)}
        </dd>
        <dt>Signed base cash flow</dt>
        <dd>{f.money(effects.baseCashFlow, base)}</dd>
        <dt>Quantity before → after</dt>
        <dd>
          {f.quantity(effects.before.quantity)} → {f.quantity(effects.after.quantity)}
        </dd>
        <dt>Remaining native cost before → after</dt>
        <dd>
          {f.money(effects.before.localCost, currency)} →{' '}
          {f.money(effects.after.localCost, currency)}
        </dd>
        <dt>Remaining base cost before → after</dt>
        <dd>
          {f.money(effects.before.baseCost, base)} → {f.money(effects.after.baseCost, base)}
        </dd>
        <dt>Average native cost after replay</dt>
        <dd>{f.price(effects.after.averageCost, currency)}</dd>
        <dt>Replayed realized P&amp;L change</dt>
        <dd>
          {f.money(effects.realizedLocalChange, currency)} /{' '}
          {f.money(effects.realizedBaseChange, base)}
        </dd>
        <dt>Replayed net dividend change</dt>
        <dd>
          {f.money(effects.dividendLocalChange, currency)} /{' '}
          {f.money(effects.dividendBaseChange, base)}
        </dd>
        <dt>Review valid until</dt>
        <dd>
          <span>{f.date(preview.expiresAt)} · your timezone</span>
        </dd>
      </dl>
      <p className="type-compact text-secondary">
        Server preview only · nothing recorded. Effects use the complete ordered ledger; backdated
        events may change later results. Transaction prices are your recorded inputs, not market
        quotes. Cash is excluded from holdings valuation.
      </p>
      <details className="type-caption text-secondary">
        <summary>Exact decimal calculation values</summary>
        <dl className="portfolio-details">
          {Object.entries(effects)
            .filter(([, v]) => typeof v === 'string')
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
        </dl>
        <p>Full precision is retained; formatted values above round only for display.</p>
      </details>
    </>
  );
}
