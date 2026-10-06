import { Fragment, useEffect, useRef, useState } from 'react';
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
  AssetDetailResponse,
  TransactionInput,
  TransactionPreview,
  AppendResponse,
  VoidResponse,
  financialTone,
  formatPercent,
  pricePlot,
} from '@folio/shared';
import type { Valuation, ValuedHolding as Holding } from '@folio/shared';
import { Button, ContentState, DataStatus, FormField, Tab } from '../design-system/primitives';
import { Icon } from '../design-system/Icon';
import { api, ApiError } from '../auth/client';
import { TransactionReview } from './TransactionReview';
import { useSession } from '../auth/session';
import { useFinancialDisplay, usePortfolios, useValuation } from './client';
import './domain.css';
import { InstrumentPicker } from './InstrumentPicker';
import { RefreshControl } from './RefreshControl';
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
  label = 'Table pages',
}: {
  page: number;
  total: number;
  size: number;
  change: (p: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav className="portfolio-pagination" aria-label={label}>
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
      {view !== 'transactions' && <RefreshControl key={p.id} portfolioId={p.id} />}
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
  const [review, setReview] = useState<TransactionPreview | null>(null),
    [key, setKey] = useState('');
  const [blocked, setBlocked] = useState(false),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!review) return;
    const update = () => setExpired(Date.now() >= Date.parse(review.expiresAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [review]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review, blocked]);
  const instrument = instruments.data?.instruments.find((i) => i.id === instrumentId);
  const action = useMutation({
    mutationFn: (data: TransactionInput) =>
      api('/portfolios/' + p.id + '/ledger', AppendResponse, data, 'POST', true, {
        'Idempotency-Key': key,
        'Transaction-Preview': review?.receipt ?? '',
      }),
    onError: (failure) => {
      if (failure instanceof ApiError && [409, 422, 428].includes(failure.status)) setBlocked(true);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['domain'] });
      navigate('/transactions');
    },
  });
  const previewAction = useMutation({
    mutationFn: (input: TransactionInput) =>
      api('/portfolios/' + p.id + '/ledger/preview', TransactionPreview, input),
    onSuccess: (value) => {
      setReview(value);
      setBlocked(false);
      setExpired(false);
      action.reset();
    },
  });
  const uncertain = Boolean(
    action.error && (!(action.error instanceof ApiError) || action.error.status >= 500),
  );
  const previewError =
    previewAction.error instanceof ApiError
      ? previewAction.error.message
      : 'The server review could not be validated. Retry before recording.';
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
    previewAction.mutate(parsed.data);
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
          <TransactionReview preview={review} />
          <p className="type-compact text-secondary">
            Confirmation rechecks ownership, ledger and historical FX. Changed or expired inputs
            require revalidation and another confirmation. An incorrect booked record can be voided,
            never edited.
          </p>
          {(blocked || expired) && (
            <p role="alert" className="text-negative">
              {blocked
                ? 'This review needs revalidation. No new transaction was recorded by the rejected confirmation.'
                : 'This review has expired. Revalidate and review the updated values before confirming.'}
            </p>
          )}
          {uncertain && (
            <p role="status" className="type-compact text-secondary">
              The booking result could not be confirmed. Retry confirmation uses the same request
              identifier and cannot book twice.
            </p>
          )}
          <div className="portfolio-actions">
            {(blocked || expired) && (
              <Button
                disabled={previewAction.isPending || action.isPending}
                state={previewAction.isPending ? 'Disabled' : 'Default'}
                onClick={() => previewAction.mutate(review.input)}
              >
                {previewAction.isPending ? 'Revalidating…' : 'Revalidate transaction'}
              </Button>
            )}
            <Button
              kind="Primary"
              disabled={
                action.isPending || previewAction.isPending || blocked || (expired && !uncertain)
              }
              state={
                action.isPending || previewAction.isPending || blocked || (expired && !uncertain)
                  ? 'Disabled'
                  : 'Default'
              }
              aria-busy={action.isPending}
              onClick={() => action.mutate(review.input)}
            >
              {action.isPending
                ? 'Recording…'
                : uncertain
                  ? 'Retry confirmation'
                  : 'Confirm record'}
            </Button>
            <Button
              disabled={action.isPending || previewAction.isPending}
              onClick={() => {
                setReview(null);
                setBlocked(false);
                setExpired(false);
                previewAction.reset();
                action.reset();
              }}
            >
              Back to entry
            </Button>
          </div>
          {previewAction.error && (
            <p role="alert" className="text-negative">
              {previewError}
            </p>
          )}
          {action.error && (
            <p role="alert" className="text-negative">
              {action.error instanceof ApiError
                ? action.error.message
                : 'The booking result could not be validated. Retry confirmation using the same request identifier.'}
            </p>
          )}
        </Panel>
      ) : (
        <Panel title="Manual economic entry">
          <form className="portfolio-form" noValidate onSubmit={prepare}>
            <InstrumentPicker
              catalogue={instruments.data.instruments}
              value={instrumentId}
              onSelect={(id) => {
                setInstrument(id);
                setOverride(false);
                setRate('');
                setRateDate('');
                setReference('');
              }}
            />
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
            {previewAction.error && (
              <p role="alert" className="text-negative">
                {previewError}
              </p>
            )}
            {error && (
              <p role="alert" className="text-negative">
                {error}
              </p>
            )}
            <div className="portfolio-actions">
              <Button
                kind="Primary"
                type="submit"
                disabled={previewAction.isPending}
                state={previewAction.isPending ? 'Disabled' : 'Default'}
                aria-busy={previewAction.isPending}
              >
                {previewAction.isPending ? 'Resolving review…' : 'Review transaction'}
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
  const { instrumentId = '' } = useParams();
  return (
    <PortfolioBoundary>{(p) => <AssetContent key={p.id + instrumentId} p={p} />}</PortfolioBoundary>
  );
}
function AssetContent({ p }: { p: z.infer<typeof Portfolio> }) {
  const { instrumentId = '' } = useParams(),
    f = useFinancialDisplay(),
    navigate = useNavigate();
  const [page, setPage] = useState(1),
    [lotPage, setLotPage] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const readonly = useSession().data?.user.demoReadonly;
  const localFixture = useSession().data?.user.localFixture;
  const prefix = '/portfolios/' + p.id;
  const holding = useQuery({
    queryKey: ['domain', 'asset-detail', p.id, instrumentId, page, lotPage],
    queryFn: () =>
      api(
        prefix +
          '/instruments/' +
          encodeURIComponent(instrumentId) +
          '/detail?' +
          new URLSearchParams({
            page: String(page),
            pageSize: '20',
            lotPage: String(lotPage),
            lotPageSize: '20',
          }),
        AssetDetailResponse,
      ),
    retry: false,
  });
  const history = useQuery({
    enabled: holding.isSuccess,
    queryKey: ['domain', 'history', p.id, instrumentId],
    staleTime: 60000,
    queryFn: () =>
      api(prefix + '/instruments/' + encodeURIComponent(instrumentId) + '/history', PriceHistory),
    retry: false,
  });
  useEffect(() => {
    if (holding.isSuccess) heading.current?.focus();
  }, [holding.isSuccess, page, lotPage]);
  if (holding.isPending) return <ContentState loading />;
  if (holding.error)
    return (
      <ContentState>
        <span>
          {holding.error instanceof ApiError
            ? holding.error.message
            : 'Asset data could not be validated. Please retry.'}
        </span>
        <Button onClick={() => void holding.refetch()}>Retry asset detail</Button>
        <Link className="auth-link" to="/holdings">
          Back to holdings
        </Link>
      </ContentState>
    );
  const detail = holding.data,
    h = detail.holding,
    position = detail.position,
    instrument = detail.instrument;
  return (
    <div className="portfolio-screen asset-detail" data-figma="32:143">
      <DemoBanner />
      <Link className="auth-link type-caption" to="/holdings">
        Holdings / {instrument.symbol}
      </Link>
      <div className="portfolio-heading">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {instrument.name}
          </h1>
          <p className="type-body text-secondary">
            {instrument.symbol} · {instrument.assetClass} · {instrument.exchange}
          </p>
        </div>
        <p className="type-metric">{f.price(h?.quote?.price ?? null, instrument.currency)}</p>
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
      <RefreshControl key={p.id} portfolioId={p.id} />
      <div className="portfolio-summary" data-figma="34:68">
        <Metric label="Quantity" value={f.quantity(position?.quantity ?? '0')} />
        <Metric label="Base value · INR" value={f.money(h?.baseValue ?? null)} />
        <Metric
          label="Average native cost"
          value={f.price(position?.averageCost ?? null, instrument.currency)}
        />
        <Metric
          label="Unrealized P&L · INR"
          value={f.money(h?.unrealizedBase ?? null)}
          tone={financialTone(h?.unrealizedBase ?? null)}
        />
        <Metric label="Current weight" value={f.percent(h?.weight ?? null)} />
      </div>
      <aside className="portfolio-status type-compact" aria-label="Asset valuation state">
        <div>
          <strong>Portfolio valuation · {detail.valuation.status}</strong>
          <p>
            Valued {detail.valuation.coverage.valued} of {detail.valuation.coverage.total} current
            positions.{' '}
            {detail.valuation.complete
              ? 'Complete current coverage.'
              : 'Coverage is incomplete; portfolio weights remain unavailable.'}
          </p>
          {!position && (
            <p>
              No owned position for this instrument. Only your own recorded activity appears below.
            </p>
          )}
          {position?.quantity === '0' && (
            <p>No units currently held; realized income and recorded activity remain available.</p>
          )}
          {h?.unavailableReason && <p>{h.unavailableReason}</p>}
        </div>
      </aside>
      <div className="portfolio-two-columns">
        <Panel
          title={localFixture ? 'Synthetic local price history' : 'Observed price history'}
          source="34:85"
        >
          {history.isPending ? (
            <ContentState loading />
          ) : history.error ? (
            <ContentState>{history.error.message}</ContentState>
          ) : (
            <>
              <p className="type-caption text-secondary">{history.data.label}</p>
              {history.data.status === 'available' && history.data.points.length > 0 ? (
                <>
                  <ObservedChart
                    points={history.data.points}
                    currency={instrument.currency}
                    fixture={Boolean(localFixture)}
                  />
                  <details>
                    <summary className="auth-link type-compact">
                      {localFixture ? 'View exact fixture prices' : 'View exact observed prices'}
                    </summary>
                    <table className="portfolio-table">
                      <caption className="sr-only">
                        {localFixture
                          ? 'Synthetic local test prices; not observed market data'
                          : 'Observed price-only series, never a historical portfolio valuation'}
                      </caption>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Native close · {instrument.currency}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.data.points.map((point) => (
                          <tr key={point.date}>
                            <td data-label="Date">{point.date}</td>
                            <td data-label="Native close">
                              {f.price(point.price, instrument.currency)}
                            </td>
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
                {history.data.source ?? 'No permitted history source'} ·{' '}
                {localFixture
                  ? 'Two explicit synthetic test points; no live or reconstructed history.'
                  : 'No fabricated backfill. Split-adjusted prices are never paired with pre-split ledger quantities.'}
              </p>
            </>
          )}
        </Panel>
        <Panel title="Cost-based return / FX" source="34:128">
          <dl className="portfolio-details">
            <dt>Local return</dt>
            <dd>{f.percent(h?.localReturn ?? null)}</dd>
            <dt>Base return</dt>
            <dd>{f.percent(h?.baseReturn ?? null)}</dd>
            <dt>FX return effect</dt>
            <dd>{f.percentagePoints(h?.fxReturnEffect ?? null)}</dd>
            <dt>Price contribution · INR</dt>
            <dd>{f.money(h?.priceContribution ?? null)}</dd>
            <dt>FX contribution · INR</dt>
            <dd>{f.money(h?.fxContribution ?? null)}</dd>
            <dt>Realized FIFO P&L · INR</dt>
            <dd>{f.money(position?.realizedBase ?? null)}</dd>
            <dt>Net dividend income · INR</dt>
            <dd>{f.money(position?.dividendBase ?? null)}</dd>
          </dl>
          {h?.returnUnavailableReason && (
            <p className="type-caption text-secondary">{h?.returnUnavailableReason}</p>
          )}
        </Panel>
      </div>
      <AssetRecords detail={detail} setPage={setPage} setLotPage={setLotPage} />
      <Panel title="Sources and instrument metadata" source="34:196">
        <dl className="portfolio-details">
          <dt>Quote</dt>
          <dd>
            {h?.quote
              ? h?.quote.source + ' · ' + f.date(h?.quote.asOf) + ' · ' + h?.quote.status
              : 'Unavailable · no permitted/provider price'}
          </dd>
          <dt>Current FX</dt>
          <dd>
            {h?.fx
              ? h?.fx.rate + ' · ' + h?.fx.source + ' · ' + h?.fx.rateDate + ' · ' + h?.fx.status
              : 'Unavailable'}
          </dd>
          <dt>Sector</dt>
          <dd>{instrument.sector}</dd>
          <dt>Metadata</dt>
          <dd>{instrument.metadataSource}</dd>
        </dl>
        {h?.quote?.source.startsWith('CoinGecko Demo') && (
          <a className="auth-link type-caption" href="https://www.coingecko.com/">
            Powered by CoinGecko
          </a>
        )}
      </Panel>
    </div>
  );
}
function AssetRecords({
  detail,
  setPage,
  setLotPage,
}: {
  detail: z.infer<typeof AssetDetailResponse>;
  setPage: (page: number) => void;
  setLotPage: (page: number) => void;
}) {
  const f = useFinancialDisplay(),
    currency = detail.instrument.currency,
    base = detail.baseCurrency;
  return (
    <>
      <Panel title="Remaining FIFO lots" source="34:128">
        <p className="type-caption text-secondary">
          Server-derived remaining units and costs, in FIFO acquisition order. Original BUY inputs
          stay unchanged after sells and splits; fees are included in remaining cost.
        </p>
        <table className="portfolio-table asset-ledger-table" aria-label="Remaining FIFO lots">
          <caption className="sr-only">
            Owned remaining FIFO lots with immutable acquisition provenance
          </caption>
          <thead>
            <tr>
              <th>Acquisition</th>
              <th>Remaining quantity</th>
              <th>Remaining local cost · {currency}</th>
              <th>Remaining base cost · {base}</th>
              <th>Cost provenance</th>
            </tr>
          </thead>
          <tbody>
            {detail.lots.items.map((lot) => (
              <Fragment key={lot.transactionId}>
                <tr data-asset-lot="true">
                  <td data-label="Acquisition">
                    {f.date(lot.acquisition.effectiveAt)}
                    <span className="type-caption text-secondary">
                      Exchange date {lot.acquisition.tradingDate}
                    </span>
                  </td>
                  <td data-label="Remaining quantity">{f.quantity(lot.quantity)}</td>
                  <td data-label="Remaining local cost">{f.money(lot.localCost, currency)}</td>
                  <td data-label="Remaining base cost">{f.money(lot.baseCost, base)}</td>
                  <td data-label="Cost provenance">
                    <span className="type-caption text-secondary">
                      {lot.acquisition.fx.source} · {lot.acquisition.fx.rateDate}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} data-label="Acquisition provenance">
                    <details>
                      <summary className="auth-link type-compact">Original BUY provenance</summary>
                      <dl className="portfolio-details">
                        <dt>Recorded BUY</dt>
                        <dd>
                          <Link
                            to={'/transactions?record=' + encodeURIComponent(lot.transactionId)}
                          >
                            Open BUY {lot.transactionId}
                          </Link>
                        </dd>
                        <dt>Original quantity</dt>
                        <dd>{f.quantity(lot.acquisition.quantity)}</dd>
                        <dt>Original native unit price</dt>
                        <dd>{f.price(lot.acquisition.price, currency)}</dd>
                        <dt>Original fees</dt>
                        <dd>{f.money(lot.acquisition.fees, currency)}</dd>
                        <dt>Recorded historical FX</dt>
                        <dd>
                          {lot.acquisition.fx.rate} {base} per {currency} ·{' '}
                          {lot.acquisition.fx.rateDate}
                        </dd>
                        <dt>FX source / reference</dt>
                        <dd>
                          {lot.acquisition.fx.source} · {lot.acquisition.fx.reference}
                        </dd>
                        <dt>Effective UTC instant</dt>
                        <dd>{lot.acquisition.effectiveAt}</dd>
                      </dl>
                    </details>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        {!detail.lots.total && (
          <ContentState>
            No remaining FIFO lots. Fully sold or voided acquisitions are not remaining holdings.
          </ContentState>
        )}
        <Pagination
          label="FIFO lot pages"
          page={detail.lots.page}
          total={detail.lots.total}
          size={detail.lots.pageSize}
          change={setLotPage}
        />
      </Panel>
      <Panel title="Transaction activity" source="34:165">
        <p className="type-caption text-secondary">
          Your immutable records, newest effective instant and sequence first. Voiding excludes an
          event from the position replay; its original record and cash flow remain visible below.
        </p>
        <table
          className="portfolio-table asset-ledger-table"
          aria-label="Owned instrument activity"
        >
          <caption className="sr-only">
            Owned BUY SELL DIVIDEND SPLIT activity and immutable void effects
          </caption>
          <thead>
            <tr>
              <th>Effective date</th>
              <th>Type / status</th>
              <th>Quantity / split</th>
              <th>Native price / gross / fees</th>
              <th>Original signed native cash flow</th>
              <th>Record / provenance</th>
            </tr>
          </thead>
          <tbody>
            {detail.activity.items.map((row) => (
              <Fragment key={row.record.id}>
                <tr>
                  <td data-label="Effective date">
                    {f.date(row.record.effectiveAt)}
                    <span className="type-caption text-secondary">
                      Exchange date {row.record.tradingDate}
                    </span>
                  </td>
                  <td data-label="Type / status">
                    {row.record.type}
                    <span className="type-caption text-secondary">
                      {row.void ? 'Voided · excluded from position' : 'Recorded'}
                    </span>
                    {row.void && (
                      <span className="type-caption text-secondary">
                        {row.void.reason} · {f.date(row.void.recordedAt)} · void ID {row.void.id}
                      </span>
                    )}
                  </td>
                  <td data-label="Quantity / split">
                    {'quantity' in row.record
                      ? f.quantity(row.record.quantity)
                      : 'numerator' in row.record
                        ? row.record.numerator + ':' + row.record.denominator
                        : '—'}
                  </td>
                  <td data-label="Native price / gross / fees">
                    {'price' in row.record
                      ? f.price(row.record.price, currency)
                      : 'grossAmount' in row.record
                        ? f.money(row.record.grossAmount, currency)
                        : 'No price · unit adjustment'}
                    {'fees' in row.record && (
                      <span className="type-caption text-secondary">
                        Fees / withholding {f.money(row.record.fees, currency)}
                      </span>
                    )}
                  </td>
                  <td data-label="Original signed native cash flow">
                    {f.money(row.nativeCashFlow, currency)}
                  </td>
                  <td data-label="Record / provenance">
                    <Link to={'/transactions?record=' + encodeURIComponent(row.record.id)}>
                      Inspect {row.record.type} {row.record.id}
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td colSpan={6} data-label="Recorded provenance">
                    <details>
                      <summary className="auth-link type-caption">Recorded FX / dates</summary>
                      <p className="type-caption text-secondary">
                        {row.record.fx.rate} {base} per {currency} · {row.record.fx.rateDate} ·{' '}
                        {row.record.fx.source} · {row.record.fx.reference}
                      </p>
                      <p className="type-caption text-secondary">
                        {row.record.effectiveAt} · sequence {row.record.sequence}
                      </p>
                    </details>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        {!detail.activity.total && (
          <ContentState>No owned transaction activity for this instrument.</ContentState>
        )}
        <Pagination
          label="Instrument activity pages"
          page={detail.activity.page}
          total={detail.activity.total}
          size={detail.activity.pageSize}
          change={setPage}
        />
      </Panel>
    </>
  );
}
function ObservedChart({
  points,
  currency,
  fixture = false,
}: {
  points: z.infer<typeof PriceHistory>['points'];
  currency: string;
  fixture?: boolean;
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
          (fixture
            ? 'Synthetic local fixture prices from '
            : 'Observed native closing prices from ') +
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
