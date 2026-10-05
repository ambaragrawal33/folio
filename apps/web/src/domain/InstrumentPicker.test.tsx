// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { Instrument } from '@folio/shared';
import { InstrumentPicker } from './InstrumentPicker';
const instrument: Instrument = {
  id: 'INFY:NSE',
  symbol: 'INFY',
  name: 'Infosys Limited',
  currency: 'INR',
  exchange: 'NSE',
  assetClass: 'equity',
  sector: 'Unknown',
  provider: 'yahoo',
  providerId: 'INFY.NS',
  metadataSource: 'Verified identity test source',
};
const response = (instruments: Instrument[] = [instrument]) =>
  new Response(
    JSON.stringify({
      instruments,
      limit: 20,
      truncated: false,
      source: 'verified-catalogue',
      providers: [
        {
          provider: 'yahoo',
          status: 'capability-unavailable',
          reason: 'Live discovery is unavailable; catalogue remains searchable.',
        },
      ],
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Harness() {
    const [value, setValue] = useState('');
    return <InstrumentPicker catalogue={[instrument]} value={value} onSelect={setValue} />;
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('searches only on submission, preserves canonical selection and gives keyboard access', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      response(String(url).includes('q=unknown') ? [] : [instrument]),
    );
  vi.stubGlobal('fetch', fetcher);
  mount();
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('1 verified results'),
  );
  expect((screen.getByLabelText('Canonical instrument') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Search instruments'), { target: { value: 'infy' } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByLabelText('Search instruments'), { key: 'Enter' });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('1 verified results'),
  );
  fireEvent.keyDown(screen.getByLabelText('Search instruments'), { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByLabelText('Canonical instrument'));
  fireEvent.change(screen.getByLabelText('Canonical instrument'), {
    target: { value: 'INFY:NSE' },
  });
  expect(screen.getByLabelText('Selected instrument').textContent).toContain('INR');
  fireEvent.change(screen.getByLabelText('Search instruments'), { target: { value: 'unknown' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search catalogue' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('No verified instruments'),
  );
  expect((screen.getByLabelText('Canonical instrument') as HTMLSelectElement).value).toBe(
    'INFY:NSE',
  );
  expect(screen.getByLabelText('Discovery provider status').textContent).toContain('unavailable');
});
it('shows actual failure and explicit retry without inventing results or changing selection', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockImplementation(async () => response());
  vi.stubGlobal('fetch', fetcher);
  mount();
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Instrument search unavailable'),
  );
  expect(screen.queryByLabelText('Selected instrument')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry instrument search' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('1 verified results'),
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects malformed API data with the same honest recovery state', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ instruments: [{ id: 'guessed' }] }))),
  );
  mount();
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Instrument search unavailable'),
  );
  expect(screen.getByRole('button', { name: 'Retry instrument search' })).toBeTruthy();
});
