// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocalFixtureNotice } from './LocalFixtureNotice';
import { useAccess } from '../auth/client';
import { useFinancialDisplay } from './client';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAccess.setState({ token: null, status: 'anonymous' });
});
it('displays a fractional FX return difference as percentage points with Decimal-safe scaling', () => {
  useAccess.setState({ token: null, status: 'anonymous' });
  function Values() {
    const f = useFinancialDisplay();
    return (
      <>
        {['0.066265060241', '-0.0125', '0', null].map((v, i) => (
          <p key={i}>{f.percentagePoints(v)}</p>
        ))}
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Values />
    </QueryClientProvider>,
  );
  expect(screen.getByText('6.63 percentage points')).toBeTruthy();
  expect(screen.getByText('-1.25 percentage points')).toBeTruthy();
  expect(screen.getByText('0.00 percentage points')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
});
it('shows explicit fixture provenance before signup, with no fake financial success', async () => {
  useAccess.setState({ token: null, status: 'anonymous' });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: true }))),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LocalFixtureNotice />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText('Local writable fixture mode')).toBeTruthy();
  expect(screen.getByText(/never a live provider observation/)).toBeTruthy();
  expect(screen.getByText(/ETH is deliberately stale/)).toBeTruthy();
});
it('keeps the fixture warning visible from verified session metadata if status is unavailable', async () => {
  useAccess.setState({ token: null, status: 'anonymous' });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['me'], { user: { localFixture: true } });
  render(
    <QueryClientProvider client={client}>
      <LocalFixtureNotice />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText('Local writable fixture mode')).toBeTruthy();
});
