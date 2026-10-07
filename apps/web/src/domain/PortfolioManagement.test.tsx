// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Portfolio } from '@folio/shared';
import { PortfolioManagement } from './PortfolioManagement';
import { useAccess } from '../auth/client';
const p = Portfolio.parse({
  id: '000000000000000000000002',
  name: 'My Portfolio',
  baseCurrency: 'INR',
  costBasis: 'FIFO',
  currencyLockedAt: null,
  revision: 0,
});
const user = {
  id: '000000000000000000000001',
  name: 'Portfolio Reviewer',
  email: 'reviewer@example.test',
  role: 'user',
  baseCurrency: 'INR',
  timezone: 'Asia/Kolkata',
  preferences: { theme: 'dark', numberFormat: 'indian' },
  emailVerifiedAt: '2026-01-05T00:00:00.000Z',
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};
let client: QueryClient,
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>,
  eligibility: { portfolio: Portfolio; canDelete: boolean; deletionReason: string | null },
  mutationError: Response | null;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (code: string, message: string, status = 409) =>
  response({ error: { code, message, requestId: '00000000-0000-4000-8000-000000000001' } }, status);
beforeEach(() => {
  useAccess.setState({ token: 'explicit-test-token', status: 'authenticated' });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  client.setQueryData(['me'], { user });
  client.setQueryDefaults(['me'], { staleTime: Infinity });
  client.setQueryData(['domain', user.id, 'portfolios'], { portfolios: [p] });
  eligibility = { portfolio: p, canDelete: true, deletionReason: null };
  mutationError = null;
  fetcher = vi.fn<typeof fetch>(async (input, init) => {
    if (init?.method === 'PATCH') {
      if (mutationError) return mutationError;
      const body = JSON.parse(String(init.body));
      eligibility = { ...eligibility, portfolio: { ...p, name: body.name, managementVersion: 1 } };
      return response(eligibility.portfolio);
    }
    if (init?.method === 'DELETE')
      return (
        mutationError ??
        response({ portfolioId: p.id, deletedAt: '2026-10-06T12:00:00.000Z', duplicate: false })
      );
    return response(String(input).endsWith('/management') ? eligibility : { user });
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function Deleted() {
  return <p>First portfolio flow {String(useLocation().state?.portfolioDeleted)}</p>;
}
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings#portfolio-defaults']}>
        <Routes>
          <Route path="/settings" element={<PortfolioManagement portfolio={p} />} />
          <Route path="/dashboard" element={<Deleted />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function ready() {
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Delete portfolio' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
}
it('name validation is product copy, focuses input and never submits a malformed rename', async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText('Default portfolio name'), {
    target: { value: '<script>' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save portfolio name' }));
  expect(document.activeElement).toBe(screen.getByLabelText('Default portfolio name'));
  expect(screen.getByText(/Use letters/)).not.toBeNull();
  expect(fetcher.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(false);
});
it('rename updates owned list immediately while leaving valuation, ledger and job cache unchanged', async () => {
  client.setQueryData(['domain', 'valuation', p.id], { retained: true });
  client.setQueryData(['jobs', 'refresh-status', p.id], { retained: true });
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText('Default portfolio name'), {
    target: { value: '  New label  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save portfolio name' }));
  await screen.findByText('Portfolio name saved.');
  expect(client.getQueryData(['domain', user.id, 'portfolios'])).toMatchObject({
    portfolios: [{ name: 'New label', managementVersion: 1 }],
  });
  expect(client.getQueryData(['domain', 'valuation', p.id])).toEqual({ retained: true });
  expect(client.getQueryData(['jobs', 'refresh-status', p.id])).toEqual({ retained: true });
});
it('explicit confirmation focuses heading and validates DELETE without sending a request', async () => {
  mount();
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Delete portfolio' }));
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: 'Confirm empty portfolio deletion' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  expect(screen.getByText('Type DELETE exactly to confirm portfolio deletion.')).not.toBeNull();
  expect(fetcher.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel portfolio deletion' }));
  expect(screen.queryByRole('heading', { name: 'Confirm empty portfolio deletion' })).toBeNull();
});
it('successful deletion removes scoped cached state, retains unrelated cache and enters first-portfolio flow', async () => {
  client.setQueryData(['domain', 'valuation', p.id], { private: true });
  client.setQueryData(['jobs', 'refresh-status', p.id], { private: true });
  client.setQueryData(['domain', 'valuation', 'different-id'], { retained: true });
  mount();
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Delete portfolio' }));
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm portfolio deletion'), {
    target: { value: 'DELETE' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  await screen.findByText('First portfolio flow true');
  expect(client.getQueryData(['domain', 'valuation', p.id])).toBeUndefined();
  expect(client.getQueryData(['jobs', 'refresh-status', p.id])).toBeUndefined();
  expect(client.getQueryData(['domain', user.id, 'portfolios'])).toEqual({ portfolios: [] });
  expect(client.getQueryData(['domain', 'valuation', 'different-id'])).toEqual({ retained: true });
});
it('uncertain response retry preserves exactly the original UUID and reviewed payload', async () => {
  let calls = 0;
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (...args) => {
    if (args[1]?.method === 'DELETE' && calls++ === 0)
      throw Error('Explicit unit network interruption');
    return original(...args);
  });
  mount();
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Delete portfolio' }));
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm portfolio deletion'), {
    target: { value: 'DELETE' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  await screen.findByText(/Unable to reach Folio/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry deletion' }));
  await screen.findByText('First portfolio flow true');
  const callsMade = fetcher.mock.calls.filter((c) => c[1]?.method === 'DELETE');
  expect(callsMade).toHaveLength(2);
  expect(callsMade[0]?.[1]?.headers).toEqual(callsMade[1]?.[1]?.headers);
  expect(callsMade[0]?.[1]?.body).toBe(callsMade[1]?.[1]?.body);
});
it('populated state stays explicitly unavailable and cannot open confirmation', async () => {
  eligibility.canDelete = false;
  eligibility.deletionReason = 'Keep this transaction history and rename the portfolio instead.';
  mount();
  await screen.findByText(eligibility.deletionReason);
  expect(
    (screen.getByRole('button', { name: 'Delete portfolio' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('changed rename keeps the draft and requires explicit reload before a new version can be submitted', async () => {
  mutationError = failure('PORTFOLIO_CHANGED', 'The portfolio name changed.');
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText('Default portfolio name'), {
    target: { value: 'Draft name' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save portfolio name' }));
  await screen.findByText('The portfolio name changed.');
  eligibility.portfolio = { ...p, name: 'Other edit', managementVersion: 2 };
  mutationError = null;
  fireEvent.click(screen.getByRole('button', { name: 'Reload portfolio details' }));
  await ready();
  expect((screen.getByLabelText('Default portfolio name') as HTMLInputElement).value).toBe(
    'Draft name',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save portfolio name' }));
  await screen.findByText('Portfolio name saved.');
  const calls = fetcher.mock.calls.filter((c) => c[1]?.method === 'PATCH');
  expect(JSON.parse(String(calls[1]?.[1]?.body)).expectedVersion).toBe(2);
});
it('management read failure has a truthful error and explicit retry', async () => {
  fetcher.mockResolvedValueOnce(
    failure('RESOURCE_NOT_FOUND', 'This resource is unavailable.', 404),
  );
  mount();
  await screen.findByText('This resource is unavailable.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry portfolio details' }));
  await ready();
});
it('stale deleted-resource recovery clears scoped state and returns to the first-portfolio boundary without claiming deletion success', async () => {
  client.setQueryData(['domain', 'valuation', p.id], { stale: true });
  mount();
  await ready();
  mutationError = failure('RESOURCE_NOT_FOUND', 'This resource is unavailable.', 404);
  fireEvent.change(screen.getByLabelText('Default portfolio name'), {
    target: { value: 'New name' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save portfolio name' }));
  await screen.findByText('This resource is unavailable.');
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((...args) =>
    String(args[0]).endsWith('/management')
      ? Promise.resolve(failure('RESOURCE_NOT_FOUND', 'This resource is unavailable.', 404))
      : original(...args),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reload portfolio details' }));
  await screen.findByText('First portfolio flow undefined');
  expect(client.getQueryData(['domain', 'valuation', p.id])).toBeUndefined();
});
it('read-only demo preserves unavailable account/portfolio mutation controls', async () => {
  client.setQueryData(['me'], { user: { ...user, demoReadonly: true } });
  mount();
  await waitFor(() => expect(screen.queryByText('Loading portfolio management…')).toBeNull());
  expect(
    (screen.getByRole('button', { name: 'Save portfolio name' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Delete portfolio' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('malformed management responses use safe product copy rather than exposing schema internals', async () => {
  fetcher.mockResolvedValueOnce(response({ internalField: 'invalid response' }));
  mount();
  await screen.findByText(
    'Folio could not verify the response. Reload portfolio details or retry the original request.',
  );
  expect(screen.queryByText(/Zod|internalField/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry portfolio details' }));
  await ready();
});
it('mis-scoped deletion response never claims success and retry retains its original request', async () => {
  mutationError = response({
    portfolioId: '000000000000000000000099',
    deletedAt: '2026-10-06T12:00:00.000Z',
    duplicate: false,
  });
  mount();
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Delete portfolio' }));
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm portfolio deletion'), {
    target: { value: 'DELETE' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  await screen.findByText(/Folio could not verify the response/);
  expect(screen.queryByText('First portfolio flow true')).toBeNull();
  expect(client.getQueryData(['domain', user.id, 'portfolios'])).toMatchObject({
    portfolios: [{ id: p.id }],
  });
  mutationError = null;
  fireEvent.click(screen.getByRole('button', { name: 'Retry deletion' }));
  await screen.findByText('First portfolio flow true');
  const calls = fetcher.mock.calls.filter((c) => c[1]?.method === 'DELETE');
  expect(calls[0]?.[1]?.headers).toEqual(calls[1]?.[1]?.headers);
});
