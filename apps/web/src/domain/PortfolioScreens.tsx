import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Instrument,
  Portfolio,
  HoldingsPage,
  LedgerPage,
  SearchResponse,
  PriceHistory,
  ValuedHolding,
  TransactionInput,
  AppendResponse,
  VoidResponse,
  financialTone,
  formatPercent,
  pricePlot,
} from '@folio/shared';
import type { Valuation, ValuedHolding as Holding } from '@folio/shared';
import { Button, ContentState, DataStatus, FormField, Tab } from '../design-system/primitives';
import { Icon } from '../design-system/Icon';
import { api } from '../auth/client';
import { useSession } from '../auth/session';
import { useFinancialDisplay, usePortfolios, useValuation } from './client';
import './domain.css';
const instrumentResponse = z.strictObject({ instruments: z.array(Instrument) });
function Metric({
  label,
  value,
  large = false,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  large?: boolean;
  tone?: string;
}) {
  return (
    <div className="portfolio-metric">
      <p className="type-caption text-muted">{label}</p>
      <p className={large ? 'type-metric' : 'type-numeric'} data-tone={tone}>
        {value}
      </p>
    </div>
  );
}
function Panel({
  title,
  children,
  source,
}: {
  title: string;
  children: ReactNode;
  source?: string;
}) {
  return (
    <section className="portfolio-panel" data-figma={source}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function DemoBanner() {
  return useSession().data?.user.demoReadonly ? (
    <aside className="demo-banner type-compact" aria-label="Read-only demo">
      <strong>Read-only demo · hand-computed fixtures</strong>
      <p>
        Prices and FX are labelled fixtures, not live market data. Financial and account changes are
        unavailable. Normal accounts never receive these fixtures.
      </p>
    </aside>
  ) : null;
}
function RecordAction() {
  const navigate = useNavigate();
  const readonly = useSession().data?.user.demoReadonly;
  return (
    <Button
      kind="Primary"
      size="Compact"
      disabled={readonly}
      state={readonly ? 'Disabled' : 'Default'}
      onClick={() => navigate('/transactions/new')}
    >
      Record transaction
    </Button>
  );
}
function PortfolioBoundary({
  children,
}: {
  children: (p: z.infer<typeof Portfolio>) => ReactNode;
}) {
  const list = usePortfolios();
  const client = useQueryClient();
  const creation = useMutation({
    mutationFn: () => api('/portfolios/default', Portfolio, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ['domain'] }),
  });
  if (list.isPending) return <ContentState loading>Loading your portfolio…</ContentState>;
  if (list.error) return <ContentState>{list.error.message}</ContentState>;
  const p = list.data.portfolios[0];
  if (!p)
    return (
      <div className="portfolio-screen onboarding" data-figma="57:301">
        <Panel title="Create your first portfolio" source="57:316">
          <p className="type-body text-secondary">
            All figures come from your append-only transaction ledger.
          </p>
          <div className="portfolio-summary">
            <Metric label="Base currency" value="INR" />
            <Metric label="Cost basis" value="FIFO" />
          </div>
          <p className="type-compact text-secondary">
            Your base currency locks after the first transaction. Add and review transactions
            manually; CSV import is a later release.
          </p>
          <Button
            kind="Primary"
            disabled={creation.isPending}
            state={creation.isPending ? 'Disabled' : 'Default'}
            aria-busy={creation.isPending}
            onClick={() => creation.mutate()}
          >
            Create portfolio
          </Button>
          {creation.error && (
            <p role="alert" className="text-negative">
              {creation.error.message}
            </p>
          )}
        </Panel>
      </div>
    );
  return children(p);
}
function Summary({ v }: { v: Valuation }) {
  const f = useFinancialDisplay();
  return (
    <>
      <div className="portfolio-summary" data-figma="27:637">
        <Metric
          label={
            v.complete ? 'Holdings value · excludes cash' : 'Known-valued subtotal · incomplete'
          }
          value={f.money(v.complete ? v.totalValue : v.knownValuedSubtotal)}
          large
        />
        <Metric label="Remaining historical cost" value={f.money(v.totalBaseCost)} />
        <Metric
          label="Unrealized P&L"
          value={f.money(v.unrealizedBase)}
          tone={financialTone(v.unrealizedBase)}
        />
        <Metric
          label="Cost-based unrealized return"
          value={f.percent(v.costBasedReturn)}
          tone={financialTone(v.costBasedReturn)}
        />
        <Metric
          label="Current holdings movement"
          value={f.money(v.movementBase)}
          tone={financialTone(v.movementBase)}
        />
      </div>
      <div className="portfolio-status">
        <DataStatus
          state={v.status === 'fresh' ? 'Fresh' : v.status === 'stale' ? 'Stale' : 'Unavailable'}
        />
        <span className="type-caption text-secondary">
          Valued {v.coverage.valued} of {v.coverage.total} positions
          {v.asOf ? ' · Oldest input: ' + f.date(v.asOf) : ' · No market as-of available'}.{' '}
          {v.movementLabel}.
        </span>
      </div>
    </>
  );
}
function Allocation({ v }: { v: Valuation }) {
  const f = useFinancialDisplay();
  const [dimension, setDimension] = useState<'assetClass' | 'currency'>('assetClass');
  return (
    <Panel title="Current allocation" source="17:352">
      <div className="portfolio-filters" aria-label="Allocation dimension">
        {(['assetClass', 'currency'] as const).map((d) => (
          <Button
            key={d}
            kind="Tertiary"
            size="Compact"
            aria-pressed={dimension === d}
            onClick={() => setDimension(d)}
          >
            {d === 'assetClass' ? 'Asset class' : 'Currency'}
          </Button>
        ))}
      </div>
      {v.allocation && v.coverage.total ? (
        <ul className="allocation-list">
          {v.allocation
            .filter((a) => a.dimension === dimension)
            .map((a) => (
              <li key={a.label}>
                <div>
                  <span className="type-compact">{a.label}</span>
                  <span className="type-numeric">{f.percent(a.weight)}</span>
                </div>
                <div className="allocation-track">
                  <span style={{ width: formatPercent(a.weight, 'international') }} />
                </div>
                <span className="type-caption text-muted">{f.money(a.baseValue)}</span>
              </li>
            ))}
        </ul>
      ) : (
        <ContentState>
          Allocation is unavailable until every position has a valid price and FX rate.
        </ContentState>
      )}
    </Panel>
  );
}
function HoldingsTable({ items }: { items: Holding[] }) {
  const f = useFinancialDisplay();
  return (
    <table className="portfolio-table">
      <caption className="sr-only">
        Real derived holdings. Unavailable values are shown as a dash.
      </caption>
      <thead>
        <tr>
          <th>Security</th>
          <th>Quantity</th>
          <th>Native price</th>
          <th>Base value · INR</th>
          <th>Average native cost</th>
          <th>Weight</th>
          <th>Unrealized P&L · INR</th>
        </tr>
      </thead>
      <tbody>
        {items.map((h) => (
          <tr key={h.instrumentId}>
            <td data-label="Security">
              <Link to={'/holdings/' + encodeURIComponent(h.instrumentId)}>
                <strong>{h.instrument.symbol}</strong>
                <span className="type-caption text-secondary">
                  {h.instrument.name} · {h.instrument.exchange}
                </span>
              </Link>
            </td>
            <td data-label="Quantity">{f.quantity(h.quantity)}</td>
            <td data-label="Native price">{f.price(h.quote?.price ?? null, h.currency)}</td>
            <td data-label="Base value · INR">{f.money(h.baseValue)}</td>
            <td data-label="Average native cost">{f.money(h.averageCost, h.currency)}</td>
            <td data-label="Weight">{f.percent(h.weight)}</td>
            <td data-label="Unrealized P&L · INR" data-tone={financialTone(h.unrealizedBase)}>
              {f.money(h.unrealizedBase)}
              {h.unavailableReason && (
                <span className="type-caption text-secondary">{h.unavailableReason}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Pagination({
  page,
  total,
  size,
  change,
}: {
  page: number;
  total: number;
  size: number;
  change: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav className="portfolio-pagination" aria-label="Table pages">
      <span className="type-caption text-secondary">
        {total} records · page {page} of {pages}
      </span>
      <Button size="Compact" disabled={page <= 1} onClick={() => change(page - 1)}>
        Previous
      </Button>
      <Button size="Compact" disabled={page >= pages} onClick={() => change(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
export function PortfolioScreen({ view }: { view: 'dashboard' | 'holdings' | 'transactions' }) {
  return <PortfolioBoundary>{(p) => <PortfolioContent p={p} view={view} />}</PortfolioBoundary>;
}
function PortfolioContent({
  p,
  view,
}: {
  p: z.infer<typeof Portfolio>;
  view: 'dashboard' | 'holdings' | 'transactions';
}) {
  const valuation = useValuation(p.id);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('record') ?? ''),
    [page, setPage] = useState(1),
    [asset, setAsset] = useState(''),
    [sort, setSort] = useState('baseValue'),
    [order, setOrder] = useState('desc'),
    [type, setType] = useState('');
  const ledger = useQuery({
    queryKey: ['domain', 'ledger', p.id, search, page, type, order],
    queryFn: () =>
      api(
        '/portfolios/' +
          p.id +
          '/ledger?' +
          new URLSearchParams({ q: search, page: String(page), pageSize: '20', type, order }),
        LedgerPage,
      ),
    enabled: view === 'transactions',
    retry: false,
  });
  const holdings = useQuery({
    queryKey: ['domain', 'holdings', p.id, search, page, asset, sort, order],
    queryFn: () =>
      api(
        '/portfolios/' +
          p.id +
          '/holdings?' +
          new URLSearchParams({
            q: search,
            page: String(page),
            pageSize: '20',
            assetClass: asset,
            sort,
            order,
          }),
        HoldingsPage,
      ),
    enabled: view === 'holdings',
    retry: false,
  });
  const f = useFinancialDisplay();
  const title = view[0]!.toUpperCase() + view.slice(1);
  const v = valuation.data;
  const selected = ledger.data?.items.find((l) => l.record.id === params.get('record'));
  return (
    <div
      className={'portfolio-screen ' + view}
      data-figma={view === 'dashboard' ? '10:485' : view === 'holdings' ? '27:390' : '47:2'}
    >
      <DemoBanner />
      <div className="portfolio-heading">
        <div>
          <h1>{title}</h1>
          <p className="type-body text-secondary">
            {p.name} · FIFO ·{' '}
            {view === 'transactions'
              ? 'Immutable economic records and void events.'
              : 'Positions and current exposure from your ledger.'}
          </p>
        </div>
        <RecordAction />
      </div>
      {valuation.isPending ? (
        <ContentState loading />
      ) : valuation.error ? (
        <ContentState>{valuation.error.message}</ContentState>
      ) : (
        v && <Summary v={v} />
      )}
      {view === 'dashboard' && v && (
        <>
          <div className="portfolio-two-columns">
            <Panel title="Portfolio performance" source="17:297">
              <div role="tablist" aria-label="Performance views">
                <Tab state="Disabled">Value</Tab>
                <Tab state="Disabled">Return</Tab>
              </div>
              <ContentState>
                Historical performance, TWR, XIRR and benchmark analytics remain unavailable until
                their engines exist.
              </ContentState>
            </Panel>
            <Allocation v={v} />
          </div>
          <Panel title="Holdings" source="17:375">
            {v.holdings.length ? (
              <>
                <HoldingsTable items={v.holdings.slice(0, 5)} />
                <Link className="auth-link" to="/holdings">
                  View all holdings
                </Link>
              </>
            ) : (
              <ContentState>No positions yet. Record and review your first BUY.</ContentState>
            )}
          </Panel>
          <Panel title="Performance attribution" source="17:426">
            <ContentState>
              Historical attribution is unavailable until its engine exists. Current cost-based
              price and FX decomposition is available in each holding.
            </ContentState>
          </Panel>
          <Panel title="Current concentration" source="17:459">
            {v.concentration ? (
              v.concentration.length ? (
                <ul>
                  {v.concentration.map((c) => (
                    <li key={c.dimension + c.label} className="type-compact">
                      {c.label} · {f.percent(c.weight)} ·{' '}
                      {c.dimension === 'instrument'
                        ? 'above 25% instrument limit'
                        : 'above 40% sector limit'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="type-compact">No current instrument concentration warning.</p>
              )
            ) : (
              <ContentState>Concentration is unavailable with incomplete valuation.</ContentState>
            )}
            {v.sectorConcentrationUnavailableReason && (
              <p className="type-caption text-muted">{v.sectorConcentrationUnavailableReason}</p>
            )}
          </Panel>
        </>
      )}
      {view !== 'dashboard' && (
        <>
          <div className="portfolio-toolbar">
            <FormField
              type="search"
              label={view === 'holdings' ? 'Search holdings' : 'Search ledger'}
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {view === 'holdings' ? (
              <div className="portfolio-filters" aria-label="Asset filters">
                {[
                  ['', 'All Assets'],
                  ['equity', 'Equities'],
                  ['etf', 'ETFs'],
                  ['crypto', 'Crypto'],
                ].map(([key, label]) => (
                  <Button
                    kind="Tertiary"
                    size="Compact"
                    key={key}
                    aria-pressed={asset === key}
                    onClick={() => {
                      setAsset(key!);
                      setPage(1);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            ) : (
              <label className="portfolio-select">
                Transaction type
                <select
                  aria-label="Transaction type"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    setPage(1);
                  }}
                >
                  {['', 'BUY', 'SELL', 'DIVIDEND', 'SPLIT'].map((t) => (
                    <option key={t} value={t}>
                      {t || 'All types'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {view === 'holdings' && (
              <label className="portfolio-select">
                Sort holdings
                <select
                  aria-label="Sort holdings"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                >
                  {[
                    ['baseValue', 'Base value'],
                    ['instrument', 'Security'],
                    ['quantity', 'Quantity'],
                    ['baseCost', 'Historical cost'],
                    ['weight', 'Weight'],
                  ].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="portfolio-select">
              Order
              <select
                aria-label="Sort order"
                value={order}
                onChange={(e) => {
                  setOrder(e.target.value);
                  setPage(1);
                }}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </div>
          {view === 'holdings' ? (
            holdings.isPending ? (
              <ContentState loading />
            ) : holdings.error ? (
              <ContentState>{holdings.error.message}</ContentState>
            ) : (
              <Panel title="Positions" source="27:681">
                {holdings.data.items.length ? (
                  <HoldingsTable items={holdings.data.items} />
                ) : (
                  <ContentState>No holdings match these filters.</ContentState>
                )}
                <Pagination page={page} total={holdings.data.total} size={20} change={setPage} />
              </Panel>
            )
          ) : ledger.isPending ? (
            <ContentState loading />
          ) : ledger.error ? (
            <ContentState>{ledger.error.message}</ContentState>
          ) : (
            <>
              <Panel title="Append-only ledger" source="47:271">
                <table className="portfolio-table ledger-table">
                  <caption className="sr-only">
                    Economic ledger, ordered by effective date and sequence
                  </caption>
                  <thead>
                    <tr>
                      <th>Effective date</th>
                      <th>Type / security</th>
                      <th>Quantity / split</th>
                      <th>Native price / gross</th>
                      <th>Fees / withholding</th>
                      <th>Signed native cash flow</th>
                      <th>Recorded ID / status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.data.items.map((l) => (
                      <tr key={l.record.id} data-selected={l.record.id === selected?.record.id}>
                        <td data-label="Effective date">{f.date(l.record.effectiveAt)}</td>
                        <td data-label="Type / security">
                          {l.record.type}
                          <span>{l.record.instrumentId}</span>
                        </td>
                        <td data-label="Quantity / split">
                          {'quantity' in l.record
                            ? f.quantity(l.record.quantity)
                            : 'numerator' in l.record
                              ? l.record.numerator + ':' + l.record.denominator
                              : '—'}
                        </td>
                        <td data-label="Native price / gross">
                          {f.price(
                            'price' in l.record
                              ? l.record.price
                              : 'grossAmount' in l.record
                                ? l.record.grossAmount
                                : null,
                            l.record.currency,
                          )}
                        </td>
                        <td data-label="Fees / withholding">
                          {f.money('fees' in l.record ? l.record.fees : null, l.record.currency)}
                        </td>
                        <td data-label="Signed native cash flow">
                          {f.money(l.nativeCashFlow, l.record.currency)}
                        </td>
                        <td data-label="Recorded ID / status">
                          <Button
                            kind="Tertiary"
                            size="Compact"
                            onClick={() => setParams({ record: l.record.id })}
                          >
                            Details · {l.void ? 'Voided' : 'Recorded'}
                          </Button>
                          <span className="ledger-id type-caption">{l.record.id}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!ledger.data.items.length && (
                  <ContentState>No economic records match these filters.</ContentState>
                )}
                <Pagination page={page} total={ledger.data.total} size={20} change={setPage} />
              </Panel>
              {selected && <LedgerDetail p={p} row={selected} close={() => setParams({})} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
function LedgerDetail({
  p,
  row,
  close,
}: {
  p: z.infer<typeof Portfolio>;
  row: z.infer<typeof LedgerPage>['items'][number];
  close: () => void;
}) {
  const f = useFinancialDisplay(),
    client = useQueryClient();
  const readonly = useSession().data?.user.demoReadonly;
  const [confirm, setConfirm] = useState(false),
    [reason, setReason] = useState('');
  const focus = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    focus.current?.focus();
  }, []);
  const action = useMutation({
    mutationFn: () =>
      api('/portfolios/' + p.id + '/ledger/' + row.record.id + '/void', VoidResponse, { reason }),
    onSuccess: async () => {
      setConfirm(false);
      await client.invalidateQueries({ queryKey: ['domain'] });
    },
  });
  return (
    <section
      className="portfolio-panel ledger-detail"
      data-figma="47:372"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <div className="portfolio-heading">
        <h2 ref={focus} tabIndex={-1}>
          Recorded transaction
        </h2>
        <Button kind="Tertiary" onClick={close}>
          Close details
        </Button>
      </div>
      <dl className="portfolio-details">
        <dt>Ledger ID</dt>
        <dd>{row.record.id}</dd>
        <dt>Effective date</dt>
        <dd>{f.date(row.record.effectiveAt)}</dd>
        <dt>Trading date</dt>
        <dd>{row.record.tradingDate}</dd>
        <dt>Sequence</dt>
        <dd>{row.record.sequence}</dd>
        <dt>Historical FX</dt>
        <dd>
          {row.record.fx.rate} · {row.record.fx.source} · {row.record.fx.rateDate}
          <span>{row.record.fx.reference}</span>
        </dd>
        <dt>Status</dt>
        <dd>{row.void ? 'Voided · ' + row.void.reason : 'Recorded'}</dd>
      </dl>
      {!row.void && (
        <>
          <Button kind="Destructive" disabled={readonly} onClick={() => setConfirm(true)}>
            Void
          </Button>
          {confirm && (
            <form
              className="portfolio-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim().length >= 3) action.mutate();
              }}
            >
              <p className="type-compact">
                Voiding creates an immutable event. The original remains in your ledger. Folio
                rejects a void if it would make a later sale exceed available units.
              </p>
              <FormField
                label="Void reason"
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="portfolio-actions">
                <Button kind="Destructive" type="submit" disabled={action.isPending}>
                  Confirm void
                </Button>
                <Button onClick={() => setConfirm(false)}>Cancel</Button>
              </div>
              {action.error && (
                <p role="alert" className="text-negative">
                  {action.error.message}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}
export function RecordTransaction() {
  return <PortfolioBoundary>{(p) => <TransactionForm p={p} />}</PortfolioBoundary>;
}
function TransactionForm({ p }: { p: z.infer<typeof Portfolio> }) {
  const user = useSession().data?.user,
    f = useFinancialDisplay(),
    client = useQueryClient(),
    navigate = useNavigate();
  const [params] = useSearchParams();
  const instruments = useQuery({
    queryKey: ['domain', 'instruments'],
    queryFn: () => api('/instruments', instrumentResponse),
    retry: false,
  });
  const [type, setType] = useState<'BUY' | 'SELL' | 'DIVIDEND' | 'SPLIT'>('BUY'),
    [instrumentId, setInstrument] = useState(params.get('instrument') ?? '');
  const [effective, setEffective] = useState(''),
    [trading, setTrading] = useState(''),
    [quantity, setQuantity] = useState(''),
    [price, setPrice] = useState(''),
    [fees, setFees] = useState('0'),
    [gross, setGross] = useState(''),
    [numerator, setNumerator] = useState(''),
    [denominator, setDenominator] = useState('');
  const [override, setOverride] = useState(false),
    [rate, setRate] = useState(''),
    [rateDate, setRateDate] = useState(''),
    [reference, setReference] = useState(''),
    [error, setError] = useState('');
  const [review, setReview] = useState<TransactionInput | null>(null),
    [key, setKey] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);
  const instrument = instruments.data?.instruments.find((i) => i.id === instrumentId);
  const action = useMutation({
    mutationFn: (data: TransactionInput) =>
      api('/portfolios/' + p.id + '/ledger', AppendResponse, data, 'POST', true, {
        'Idempotency-Key': key,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['domain'] });
      navigate('/transactions');
    },
  });
  function prepare(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const input = {
      type,
      instrumentId,
      effectiveAt: effective ? effective + ':00.000Z' : '',
      tradingDate: trading,
      ...(type === 'BUY' || type === 'SELL'
        ? { quantity, price, fees }
        : type === 'DIVIDEND'
          ? { grossAmount: gross, fees }
          : { numerator, denominator }),
      ...(override
        ? { historicalFxOverride: { rate, rateDate, source: 'manual', reference } }
        : {}),
    };
    const parsed = TransactionInput.safeParse(input);
    if (!parsed.success || !instrument) {
      setError(
        'Choose an instrument and enter valid dates and plain decimal values. Quantity and split ratios must be positive; FX overrides need a rate, date and source reference.',
      );
      return;
    }
    setKey(crypto.randomUUID());
    setReview(parsed.data);
    action.reset();
  }
  return (
    <div className="portfolio-screen transaction-entry">
      <DemoBanner />
      <div className="portfolio-heading">
        <h1 ref={heading} tabIndex={-1}>
          {review ? 'Review transaction' : 'Record transaction'}
        </h1>
        <Link className="auth-link" to="/transactions">
          Back to ledger
        </Link>
      </div>
      <p className="type-compact text-secondary">
        {p.baseCurrency} · FIFO ·{' '}
        {p.currencyLockedAt
          ? 'Base currency locked after your first transaction.'
          : 'Base currency locks when you record the first transaction.'}{' '}
        This records an economic event; Folio does not execute trades.
      </p>
      {user?.demoReadonly ? (
        <ContentState>
          This public demo is read-only. Financial mutations are disabled.
        </ContentState>
      ) : instruments.isPending ? (
        <ContentState loading />
      ) : instruments.error ? (
        <ContentState>{instruments.error.message}</ContentState>
      ) : review ? (
        <Panel title="Confirm economic record">
          <dl className="portfolio-details">
            <dt>Type / instrument</dt>
            <dd>
              {review.type} · {instrument?.symbol} · {instrument?.currency}
            </dd>
            <dt>Effective UTC instant</dt>
            <dd>{review.effectiveAt}</dd>
            <dt>Exchange trading date</dt>
            <dd>{review.tradingDate}</dd>
            {'quantity' in review && (
              <>
                <dt>Quantity</dt>
                <dd>{f.quantity(review.quantity)}</dd>
                <dt>Native price</dt>
                <dd>{f.price(review.price, instrument!.currency)}</dd>
              </>
            )}
            {'grossAmount' in review && (
              <>
                <dt>Gross native dividend</dt>
                <dd>{f.money(review.grossAmount, instrument!.currency)}</dd>
              </>
            )}
            {'fees' in review && (
              <>
                <dt>Fees / withholding</dt>
                <dd>{f.money(review.fees, instrument!.currency)}</dd>
              </>
            )}
            {'numerator' in review && (
              <>
                <dt>Split ratio</dt>
                <dd>
                  {review.numerator}:{review.denominator} · preserves total lot cost
                </dd>
              </>
            )}
            <dt>Historical FX</dt>
            <dd>
              {review.historicalFxOverride
                ? review.historicalFxOverride.rate +
                  ' · ' +
                  review.historicalFxOverride.rateDate +
                  ' · ' +
                  review.historicalFxOverride.reference
                : instrument?.currency === 'INR'
                  ? 'Identity · INR/INR'
                  : 'Latest available ECB daily reference on or before the trading date, verified by the server.'}
            </dd>
          </dl>
          <p className="type-compact text-secondary">
            The server validates the complete ordered ledger and resolves historical FX before
            recording. Missing FX requires an explicit override; no current rate is substituted. An
            incorrect record can be voided, never edited.
          </p>
          <div className="portfolio-actions">
            <Button
              kind="Primary"
              disabled={action.isPending}
              state={action.isPending ? 'Disabled' : 'Default'}
              aria-busy={action.isPending}
              onClick={() => action.mutate(review)}
            >
              {action.isPending ? 'Recording…' : 'Confirm record'}
            </Button>
            <Button
              disabled={action.isPending}
              onClick={() => {
                setReview(null);
                action.reset();
              }}
            >
              Back to entry
            </Button>
          </div>
          {action.error && (
            <p role="alert" className="text-negative">
              {action.error.message}
            </p>
          )}
        </Panel>
      ) : (
        <Panel title="Manual economic entry">
          <form className="portfolio-form" noValidate onSubmit={prepare}>
            <div className="portfolio-form-grid">
              <label className="portfolio-select">
                Transaction type
                <select
                  aria-label="Transaction type"
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  {['BUY', 'SELL', 'DIVIDEND', 'SPLIT'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="portfolio-select">
                Canonical instrument
                <select
                  aria-label="Canonical instrument"
                  value={instrumentId}
                  onChange={(e) => {
                    setInstrument(e.target.value);
                    setOverride(false);
                    setRate('');
                    setRateDate('');
                    setReference('');
                  }}
                >
                  <option value="">Choose instrument</option>
                  {instruments.data.instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.symbol} · {i.exchange} · {i.currency}
                    </option>
                  ))}
                </select>
              </label>
              <FormField
                label="Effective date and time · UTC"
                type="datetime-local"
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
              />
              <FormField
                label="Exchange trading date"
                type="date"
                value={trading}
                onChange={(e) => setTrading(e.target.value)}
              />
              {type === 'BUY' || type === 'SELL' ? (
                <>
                  <FormField
                    label="Quantity"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <FormField
                    label={'Native price · ' + (instrument?.currency ?? 'choose instrument')}
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </>
              ) : type === 'DIVIDEND' ? (
                <FormField
                  label="Gross native dividend"
                  inputMode="decimal"
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                />
              ) : (
                <>
                  <FormField
                    label="Split numerator · new units"
                    inputMode="decimal"
                    value={numerator}
                    onChange={(e) => setNumerator(e.target.value)}
                  />
                  <FormField
                    label="Split denominator · old units"
                    inputMode="decimal"
                    value={denominator}
                    onChange={(e) => setDenominator(e.target.value)}
                  />
                </>
              )}
              {type !== 'SPLIT' && (
                <FormField
                  label="Native fees / withholding"
                  inputMode="decimal"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                />
              )}
            </div>
            {instrument && (
              <p className="type-caption text-muted">
                {instrument.name} · Sector: {instrument.sector} · Metadata:{' '}
                {instrument.metadataSource}
              </p>
            )}
            {instrument && instrument.currency !== p.baseCurrency && (
              <>
                <label className="portfolio-check">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                  />
                  Explicit historical FX override
                </label>
                {override && (
                  <div className="portfolio-form-grid">
                    <FormField
                      label="Historical FX · INR per native unit"
                      inputMode="decimal"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                    />
                    <FormField
                      label="Actual FX rate date"
                      type="date"
                      value={rateDate}
                      onChange={(e) => setRateDate(e.target.value)}
                    />
                    <FormField
                      label="FX source / provenance reference"
                      maxLength={240}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
            <p className="type-caption text-secondary">
              BUY records negative gross plus fees; SELL records positive net proceeds; DIVIDEND
              records positive net income without changing units. SPLIT preserves lot cost and
              rejects unsupported fractional cash-in-lieu.
            </p>
            {error && (
              <p role="alert" className="text-negative">
                {error}
              </p>
            )}
            <div className="portfolio-actions">
              <Button kind="Primary" type="submit">
                Review transaction
              </Button>
              <Button disabled title="CSV import is P1">
                Import CSV · unavailable
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
export function AssetDetail() {
  return <PortfolioBoundary>{(p) => <AssetContent p={p} />}</PortfolioBoundary>;
}
function AssetContent({ p }: { p: z.infer<typeof Portfolio> }) {
  const { instrumentId = '' } = useParams(),
    f = useFinancialDisplay(),
    navigate = useNavigate();
  const readonly = useSession().data?.user.demoReadonly;
  const prefix = '/portfolios/' + p.id;
  const holding = useQuery({
    queryKey: ['domain', 'holding', p.id, instrumentId],
    queryFn: () => api(prefix + '/holdings/' + encodeURIComponent(instrumentId), ValuedHolding),
    retry: false,
  });
  const history = useQuery({
    queryKey: ['domain', 'history', p.id, instrumentId],
    queryFn: () =>
      api(prefix + '/instruments/' + encodeURIComponent(instrumentId) + '/history', PriceHistory),
    retry: false,
  });
  if (holding.isPending) return <ContentState loading />;
  if (holding.error) return <ContentState>{holding.error.message}</ContentState>;
  const h = holding.data;
  return (
    <div className="portfolio-screen asset-detail" data-figma="32:143">
      <DemoBanner />
      <Link className="auth-link type-caption" to="/holdings">
        Holdings / {h.instrument.symbol}
      </Link>
      <div className="portfolio-heading">
        <div>
          <h1>{h.instrument.name}</h1>
          <p className="type-body text-secondary">
            {h.instrument.symbol} · {h.instrument.assetClass} · {h.instrument.exchange}
          </p>
        </div>
        <p className="type-metric">{f.price(h.quote?.price ?? null, h.currency)}</p>
        <div className="portfolio-actions">
          <Button disabled size="Compact">
            Watchlist · P1
          </Button>
          <Button
            kind="Primary"
            size="Compact"
            disabled={readonly}
            onClick={() =>
              navigate('/transactions/new?instrument=' + encodeURIComponent(instrumentId))
            }
          >
            Record transaction
          </Button>
        </div>
      </div>
      <div className="portfolio-summary" data-figma="34:68">
        <Metric label="Quantity" value={f.quantity(h.quantity)} />
        <Metric label="Base value · INR" value={f.money(h.baseValue)} />
        <Metric label="Average native cost" value={f.price(h.averageCost, h.currency)} />
        <Metric
          label="Unrealized P&L · INR"
          value={f.money(h.unrealizedBase)}
          tone={financialTone(h.unrealizedBase)}
        />
        <Metric label="Current weight" value={f.percent(h.weight)} />
      </div>
      <div className="portfolio-two-columns">
        <Panel title="Observed price history" source="34:85">
          {history.isPending ? (
            <ContentState loading />
          ) : history.error ? (
            <ContentState>{history.error.message}</ContentState>
          ) : (
            <>
              <p className="type-caption text-secondary">{history.data.label}</p>
              {history.data.status === 'available' && history.data.points.length > 0 ? (
                <>
                  <ObservedChart points={history.data.points} currency={h.currency} />
                  <details>
                    <summary className="auth-link type-compact">View exact observed prices</summary>
                    <table className="portfolio-table">
                      <caption className="sr-only">
                        Observed price-only series, never a historical portfolio valuation
                      </caption>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Native close · {h.currency}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.data.points.map((point) => (
                          <tr key={point.date}>
                            <td data-label="Date">{point.date}</td>
                            <td data-label="Native close">{f.price(point.price, h.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              ) : (
                <ContentState>{history.data.reason}</ContentState>
              )}
              <p className="type-caption text-muted">
                {history.data.source ?? 'No permitted history source'} · No fabricated backfill.
                Split-adjusted prices are never paired with pre-split ledger quantities.
              </p>
            </>
          )}
        </Panel>
        <Panel title="Cost-based return / FX" source="34:128">
          <dl className="portfolio-details">
            <dt>Local return</dt>
            <dd>{f.percent(h.localReturn)}</dd>
            <dt>Base return</dt>
            <dd>{f.percent(h.baseReturn)}</dd>
            <dt>FX return effect</dt>
            <dd>{f.percentagePoints(h.fxReturnEffect)}</dd>
            <dt>Price contribution · INR</dt>
            <dd>{f.money(h.priceContribution)}</dd>
            <dt>FX contribution · INR</dt>
            <dd>{f.money(h.fxContribution)}</dd>
            <dt>Realized FIFO P&L · INR</dt>
            <dd>{f.money(h.realizedBase)}</dd>
            <dt>Net dividend income · INR</dt>
            <dd>{f.money(h.dividendBase)}</dd>
          </dl>
          {h.returnUnavailableReason && (
            <p className="type-caption text-secondary">{h.returnUnavailableReason}</p>
          )}
        </Panel>
      </div>
      <Panel title="Sources and instrument metadata" source="34:196">
        <dl className="portfolio-details">
          <dt>Quote</dt>
          <dd>
            {h.quote
              ? h.quote.source + ' · ' + f.date(h.quote.asOf) + ' · ' + h.quote.status
              : 'Unavailable · no permitted/provider price'}
          </dd>
          <dt>Current FX</dt>
          <dd>
            {h.fx
              ? h.fx.rate + ' · ' + h.fx.source + ' · ' + h.fx.rateDate + ' · ' + h.fx.status
              : 'Unavailable'}
          </dd>
          <dt>Sector</dt>
          <dd>{h.instrument.sector}</dd>
          <dt>Metadata</dt>
          <dd>{h.instrument.metadataSource}</dd>
        </dl>
        {h.quote?.source.startsWith('CoinGecko Demo') && (
          <a className="auth-link type-caption" href="https://www.coingecko.com/">
            Powered by CoinGecko
          </a>
        )}
      </Panel>
    </div>
  );
}
function ObservedChart({
  points,
  currency,
}: {
  points: z.infer<typeof PriceHistory>['points'];
  currency: string;
}) {
  const plot = pricePlot(points.map((p) => p.price)),
    f = useFinancialDisplay();
  return (
    <div className="observed-chart" data-figma="34:109">
      <p className="type-caption text-secondary">{f.price(plot.high, currency)}</p>
      <svg
        viewBox="-4 -4 648 188"
        role="img"
        aria-label={
          'Observed native closing prices from ' +
          points[0]!.date +
          ' to ' +
          points.at(-1)!.date +
          '. Exact prices follow.'
        }
      >
        <polyline
          points={plot.points}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="type-caption text-secondary">
        {f.price(plot.low, currency)} · {points[0]!.date} — {points.at(-1)!.date}
      </p>
    </div>
  );
}
export function GlobalSearch() {
  const [query, setQuery] = useState(''),
    [term, setTerm] = useState(''),
    [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const timeout = window.setTimeout(() => setTerm(query.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const result = useQuery({
    queryKey: ['domain', 'search', term],
    queryFn: () => api('/search?q=' + encodeURIComponent(term), SearchResponse),
    enabled: open && term.length >= 2,
    retry: false,
  });
  return (
    <div
      className="global-search portfolio-global-search"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <Icon name="search" />
      <input
        type="search"
        className="type-compact"
        aria-label="Global search"
        placeholder="Search instruments or your ledger"
        maxLength={100}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-controls={open && query.length >= 2 ? 'global-search-results' : undefined}
      />
      {open && query.length >= 2 && (
        <section
          id="global-search-results"
          className="global-search-results"
          aria-label="Search results"
        >
          <Button kind="Tertiary" size="Compact" onClick={() => setOpen(false)}>
            Close search
          </Button>
          {result.isPending ? (
            <ContentState loading />
          ) : result.error ? (
            <p role="alert">{result.error.message}</p>
          ) : (
            <>
              <h2 className="type-caption">Canonical instruments</h2>
              {result.data.instruments.map((i) => (
                <Button
                  kind="Tertiary"
                  key={i.id}
                  onClick={() => {
                    setOpen(false);
                    navigate('/transactions/new?instrument=' + encodeURIComponent(i.id));
                  }}
                >
                  {i.symbol} · {i.exchange} · {i.name}
                </Button>
              ))}
              <h2 className="type-caption">Your owned ledger</h2>
              {result.data.ledger.map((l) => (
                <Button
                  kind="Tertiary"
                  key={l.record.id}
                  onClick={() => {
                    setOpen(false);
                    navigate('/transactions?record=' + l.record.id);
                  }}
                >
                  {l.record.type} · {l.record.instrumentId} · {l.record.tradingDate}
                </Button>
              ))}
              {!result.data.instruments.length && !result.data.ledger.length && (
                <ContentState>No matching records.</ContentState>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
