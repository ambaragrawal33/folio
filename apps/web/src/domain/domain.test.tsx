// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAccess } from '../auth/client';
import { PortfolioScreen, RecordTransaction, GlobalSearch, AssetDetail } from './PortfolioScreens';
import { DemoEntry } from './DemoEntry';
import { Account } from '../auth/Account';
const user = {
  id: '000000000000000000000001',
  name: 'Domain Tester',
  email: 'domain@example.test',
  role: 'user',
  baseCurrency: 'INR',
  timezone: 'Asia/Kolkata',
  preferences: { theme: 'dark', numberFormat: 'indian' },
  emailVerifiedAt: '2026-01-05T00:00:00.000Z',
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};
const p = {
  id: '000000000000000000000002',
  name: 'Owned Portfolio',
  baseCurrency: 'INR',
  costBasis: 'FIFO',
  currencyLockedAt: '2026-01-05T00:00:00.000Z',
  revision: 1,
};
const instrument = {
  id: 'TCS:NSE',
  symbol: 'TCS',
  name: 'Tata Consultancy Services',
  currency: 'INR',
  exchange: 'NSE',
  assetClass: 'equity',
  sector: 'Unknown',
  provider: 'yahoo',
  providerId: 'TCS.NS',
  metadataSource: 'verified fixture metadata',
};
const fx = {
  rate: '1',
  rateDate: '2026-01-05',
  source: 'identity',
  reference: 'INR/INR',
  asOf: '2026-01-05T00:00:00.000Z',
  status: 'fresh',
};
const quote = {
  instrumentId: instrument.id,
  currency: 'INR',
  price: '70',
  referencePrice: '68',
  referencePeriod: 'previous-close',
  source: 'explicit unit-test fixture',
  asOf: '2026-01-06T10:00:00.000Z',
  status: 'fresh',
  fixture: true,
};
const h = {
  instrumentId: instrument.id,
  currency: 'INR',
  baseCurrency: 'INR',
  quantity: '6',
  localCost: '363',
  baseCost: '363',
  averageCost: '60.5',
  realizedLocal: '536',
  realizedBase: '536',
  dividendLocal: '28',
  dividendBase: '28',
  lots: [],
  instrument,
  quote,
  fx,
  localValue: '420',
  baseValue: '420',
  unrealizedBase: '57',
  localReturn: '0.157024793388429752',
  baseReturn: '0.157024793388429752',
  fxReturnEffect: '0',
  priceContribution: '57',
  fxContribution: '0',
  movementBase: '12',
  movementReferenceBase: '408',
  weight: '1',
  unavailableReason: null,
  returnUnavailableReason: null,
};
const valuation = {
  baseCurrency: 'INR',
  complete: true,
  status: 'fresh',
  asOf: quote.asOf,
  coverage: { valued: 1, total: 1 },
  holdings: [h],
  knownValuedSubtotal: '420',
  totalValue: '420',
  totalBaseCost: '363',
  unrealizedBase: '57',
  costBasedReturn: h.baseReturn,
  realizedBase: '536',
  dividendBase: '28',
  movementBase: '12',
  movementReturn: '0.0294117647',
  movementLabel: 'Mixed reference periods',
  allocation: [
    { dimension: 'assetClass', label: 'equity', baseValue: '420', weight: '1' },
    { dimension: 'currency', label: 'INR', baseValue: '420', weight: '1' },
  ],
  concentration: [{ dimension: 'instrument', label: 'TCS:NSE', weight: '1' }],
  sectorCoverage: { classified: 0, total: 1 },
  sectorConcentrationUnavailableReason: 'Sector metadata is incomplete.',
};
const record = {
  id: '000000000000000000000003',
  sequence: 1,
  instrumentId: instrument.id,
  currency: 'INR',
  baseCurrency: 'INR',
  fx: { rate: '1', rateDate: '2026-01-05', source: 'identity', reference: 'INR/INR' },
  effectiveAt: '2026-01-05T10:00:00.000Z',
  tradingDate: '2026-01-05',
  type: 'BUY',
  quantity: '10',
  price: '100',
  fees: '10',
};
const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let replies: Record<string, unknown>;
beforeEach(() => {
  useAccess.setState({ status: 'authenticated', token: 'unit-test-token' });
  replies = {
    '/portfolios': { portfolios: [p] },
    '/instruments': {
      instruments: [
        instrument,
        {
          ...instrument,
          id: 'AAPL:US',
          symbol: 'AAPL',
          currency: 'USD',
          exchange: 'US',
          providerId: 'AAPL',
        },
      ],
    },
    ['/portfolios/' + p.id + '/valuation']: valuation,
    ['/portfolios/' + p.id + '/holdings']: { items: [h], page: 1, pageSize: 20, total: 1 },
    ['/portfolios/' + p.id + '/ledger']: {
      items: [{ record, nativeCashFlow: '-1010', void: null }],
      page: 1,
      pageSize: 20,
      total: 1,
    },
    ['/portfolios/' + p.id + '/holdings/TCS%3ANSE']: h,
    ['/portfolios/' + p.id + '/instruments/TCS%3ANSE/history']: {
      status: 'unavailable',
      reason: 'No permitted history',
      label: 'Observed price only',
      points: [],
      source: null,
      fixture: false,
    },
    '/search': { instruments: [instrument], ledger: [{ record, portfolioId: p.id }] },
    '/auth/demo': { enabled: true },
  };
  fetcher = vi.fn(async (address, options) => {
    const path = String(address).replace('/api/v1', '').split('?')[0]!;
    if (options?.method === 'POST' && path.endsWith('/void'))
      return response({
        event: {
          id: 'void',
          transactionId: record.id,
          reason: 'Correction requested',
          recordedAt: record.effectiveAt,
        },
        duplicate: false,
      });
    if (options?.method === 'POST' && path.endsWith('/ledger'))
      return response({ record, duplicate: false });
    return response(replies[path]);
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show(node: React.ReactNode, path = '/dashboard', demo = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(['me'], { user: { ...user, ...(demo ? { demoReadonly: true } : {}) } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/holdings/:instrumentId" element={<AssetDetail />} />
          <Route path="*" element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
it('presents real fixture-derived totals, gated analytics, allocation dimensions and truthful partial states', async () => {
  const client = show(<PortfolioScreen view="dashboard" />);
  expect(await screen.findByText('₹420.00', { selector: 'p' })).toBeTruthy();
  expect(screen.getByText(/TWR, XIRR/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Currency' }));
  expect(screen.getByText('INR', { selector: 'span' })).toBeTruthy();
  replies['/portfolios/' + p.id + '/valuation'] = {
    ...valuation,
    complete: false,
    status: 'partial',
    coverage: { valued: 0, total: 1 },
    knownValuedSubtotal: '0',
    totalValue: null,
    unrealizedBase: null,
    costBasedReturn: null,
    allocation: null,
    concentration: null,
    holdings: [
      {
        ...h,
        quote: null,
        fx: null,
        baseValue: null,
        unrealizedBase: null,
        weight: null,
        unavailableReason: 'Price missing',
      },
    ],
  };
  await client.invalidateQueries({ queryKey: ['domain'] });
  expect(await screen.findByText('Known-valued subtotal · incomplete')).toBeTruthy();
  expect(screen.getByText(/Allocation is unavailable/)).toBeTruthy();
  expect(screen.getByText(/Concentration is unavailable/)).toBeTruthy();
  expect(screen.getByText('Price missing')).toBeTruthy();
});
it('filters and sorts holdings through bounded server requests and retains ownership context', async () => {
  show(<PortfolioScreen view="holdings" />, '/holdings');
  expect(await screen.findByRole('link', { name: /TCS/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Crypto' }));
  fireEvent.change(screen.getByLabelText('Sort holdings'), { target: { value: 'quantity' } });
  fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'asc' } });
  fireEvent.change(screen.getByLabelText('Search holdings'), { target: { value: 'BTC' } });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url]) =>
          String(url).includes('q=BTC') &&
          String(url).includes('assetClass=crypto') &&
          String(url).includes('sort=quantity') &&
          String(url).includes('order=asc'),
      ),
    ).toBe(true),
  );
});
it('reviews an exact transaction, preserves an idempotency key on confirmation, and exposes readable validation', async () => {
  show(<RecordTransaction />, '/transactions/new');
  const submit = await screen.findByRole('button', { name: 'Review transaction' });
  fireEvent.click(submit);
  expect(screen.getByRole('alert').textContent).toContain('plain decimal');
  fireEvent.change(screen.getByLabelText('Canonical instrument'), { target: { value: 'TCS:NSE' } });
  fireEvent.change(screen.getByLabelText('Effective date and time · UTC'), {
    target: { value: '2026-01-05T10:00' },
  });
  fireEvent.change(screen.getByLabelText('Exchange trading date'), {
    target: { value: '2026-01-05' },
  });
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Native price · INR'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Native fees / withholding'), { target: { value: '10' } });
  fireEvent.click(submit);
  expect(await screen.findByRole('heading', { name: 'Review transaction' })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Review transaction' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm record' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, opt]) =>
          String(url).endsWith('/ledger') &&
          opt?.method === 'POST' &&
          JSON.parse(String(opt.body)).price === '100' &&
          Boolean((opt.headers as Record<string, string>)['Idempotency-Key']),
      ),
    ).toBe(true),
  );
});
it('requires explicit historical FX provenance and supports split/dividend entry without unsupported fields', async () => {
  show(<RecordTransaction />, '/transactions/new');
  await screen.findByLabelText('Canonical instrument');
  fireEvent.change(screen.getByLabelText('Canonical instrument'), { target: { value: 'AAPL:US' } });
  fireEvent.change(screen.getByLabelText('Transaction type'), { target: { value: 'DIVIDEND' } });
  fireEvent.change(screen.getByLabelText('Gross native dividend'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Effective date and time · UTC'), {
    target: { value: '2026-01-05T15:00' },
  });
  fireEvent.change(screen.getByLabelText('Exchange trading date'), {
    target: { value: '2026-01-05' },
  });
  fireEvent.click(screen.getByLabelText('Explicit historical FX override'));
  fireEvent.change(screen.getByLabelText('Historical FX · INR per native unit'), {
    target: { value: '83' },
  });
  fireEvent.change(screen.getByLabelText('Actual FX rate date'), {
    target: { value: '2026-01-05' },
  });
  fireEvent.change(screen.getByLabelText('FX source / provenance reference'), {
    target: { value: 'Historical contract statement' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review transaction' }));
  expect(screen.getByText(/83 · 2026-01-05/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back to entry' }));
  fireEvent.change(screen.getByLabelText('Transaction type'), { target: { value: 'SPLIT' } });
  fireEvent.change(screen.getByLabelText('Split numerator · new units'), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByLabelText('Split denominator · old units'), {
    target: { value: '1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review transaction' }));
  expect(screen.getByText('2:1 · preserves total lot cost')).toBeTruthy();
});
it('makes void explicit with a reason and exposes original immutable record metadata', async () => {
  show(<PortfolioScreen view="transactions" />, '/transactions');
  fireEvent.click(await screen.findByRole('button', { name: 'Details · Recorded' }));
  expect(screen.getByRole('heading', { name: 'Recorded transaction' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Void' }));
  fireEvent.change(screen.getByLabelText('Void reason'), {
    target: { value: 'Correction requested' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm void' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, opt]) =>
          String(url).endsWith('/void') &&
          JSON.parse(String(opt?.body)).reason === 'Correction requested',
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(screen.queryByRole('heading', { name: 'Recorded transaction' })).toBeNull();
});
it('displays permitted observed history and source/FX decomposition rather than inventing portfolio history', async () => {
  replies['/portfolios/' + p.id + '/instruments/TCS%3ANSE/history'] = {
    status: 'available',
    reason: null,
    label: 'Observed split-adjusted price only',
    points: [
      { date: '2026-01-05', price: '68' },
      { date: '2026-01-06', price: '70' },
    ],
    source: 'explicit unit-test fixture',
    fixture: true,
  };
  show(<AssetDetail />, '/holdings/TCS%3ANSE');
  expect(await screen.findByRole('heading', { name: 'Tata Consultancy Services' })).toBeTruthy();
  expect(await screen.findByRole('img', { name: /Observed native closing/ })).toBeTruthy();
  expect(screen.getByText(/never paired with pre-split/)).toBeTruthy();
  expect(screen.getByText('0.00 percentage points')).toBeTruthy();
});
it('keeps a public demo read-only across financial and account controls and allows only local theme changes', async () => {
  show(<RecordTransaction />, '/transactions/new', true);
  expect(await screen.findByText(/Financial mutations are disabled/)).toBeTruthy();
  expect(screen.getByLabelText('Read-only demo')).toBeTruthy();
  cleanup();
  show(<Account />, '/settings', true);
  expect(screen.getByText(/privacy export and deletion are unavailable/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Switch local display theme' }));
  expect(fetcher.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});
it('searches only server-authorized scopes and closes search with Escape', async () => {
  show(<GlobalSearch />);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Global search' }), {
    target: { value: 'TCS' },
  });
  expect(await screen.findByText('Your owned ledger')).toBeTruthy();
  expect(screen.getByRole('button', { name: /BUY · TCS:NSE/ })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
  expect(screen.queryByLabelText('Search results')).toBeNull();
});
it('enters the isolated demo using a real-shaped session instead of synthesizing a client identity', async () => {
  show(<DemoEntry />, '/auth/login');
  await screen.findByRole('button', { name: 'Explore read-only demo' });
  fetcher.mockImplementation(async (_url, opt) =>
    opt?.method === 'POST'
      ? response({
          accessToken: 'demo-unit-token',
          expiresIn: 900,
          user: { ...user, demoReadonly: true },
        })
      : response({ enabled: true }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Explore read-only demo' }));
  await waitFor(() => expect(useAccess.getState().token).toBe('demo-unit-token'));
});
