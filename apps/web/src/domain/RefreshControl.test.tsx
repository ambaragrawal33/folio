// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JobRun } from '@folio/shared';
import { RefreshControl, refreshPollDelay } from './RefreshControl';
import { useAccess } from '../auth/client';
const id = 'a'.repeat(64),
  portfolio = '000000000000000000000001';
const base = JobRun.parse({
  id,
  name: 'price-refresh',
  state: 'queued',
  attempts: 0,
  createdAt: '2026-10-06T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  error: null,
  stats: {
    requested: 1,
    accepted: 0,
    missing: 0,
    stale: 0,
    reused: 0,
    durationMs: 0,
    providerMs: 0,
    lockWaitMs: 0,
    cleaned: 0,
  },
});
const complete: JobRun = {
  ...base,
  state: 'completed',
  attempts: 1,
  finishedAt: '2026-10-06T10:00:01.000Z',
  stats: { ...base.stats, accepted: 1, durationMs: 20 },
};
let client: QueryClient,
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>,
  status: unknown,
  result: unknown,
  poll: unknown;
const response = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), { status: code });
const error = (code = 503) =>
  response(
    {
      error: {
        code: 'REFRESH_UNAVAILABLE',
        message: 'Refresh is temporarily unavailable.',
        requestId: '00000000-0000-4000-8000-000000000001',
      },
    },
    code,
  );
beforeEach(() => {
  vi.useFakeTimers();
  useAccess.setState({ status: 'authenticated', token: 'explicit-unit-token' });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 } },
  });
  status = { enabled: true, reason: null, latest: null };
  result = base;
  poll = complete;
  fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    if (init?.method === 'POST') return response(result, 202);
    return response(path.endsWith('/refresh') ? status : poll);
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function flush(ms = 5) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function mount() {
  const rendered = render(
    <QueryClientProvider client={client}>
      <RefreshControl portfolioId={portfolio} />
    </QueryClientProvider>,
  );
  await flush();
  return rendered;
}
it('waits for authoritative status when a cached pending run is invalidated before offering a new refresh', async () => {
  client.setQueryData(['jobs', 'refresh-status', portfolio], {
    enabled: true,
    reason: null,
    latest: base,
  });
  let finish: (response: Response) => void = () => {};
  fetcher.mockImplementation(async (input, init) => {
    if (init?.method === 'POST') return response(complete, 202);
    if (String(input).endsWith('/refresh'))
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return response(complete);
  });
  await client.invalidateQueries({ queryKey: ['jobs', 'refresh-status', portfolio] });
  await mount();
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  finish(response({ enabled: true, reason: null, latest: complete }));
  await flush();
  expect(screen.getByRole('button').textContent).toBe('Refresh prices');
  fireEvent.click(screen.getByRole('button'));
  await flush();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
it('submits an explicit idempotent request, shows pending/disabled state, then invalidates only valuation/holdings/detail', async () => {
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  await mount();
  const button = screen.getByRole('button', { name: 'Refresh prices' });
  button.focus();
  fireEvent.click(button);
  await flush();
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('queued');
  await flush(1000);
  expect(screen.getByRole('status').textContent).toContain('Refresh completed');
  expect(document.activeElement).toBe(button);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(invalidate).toHaveBeenCalledTimes(1);
  const opts = invalidate.mock.calls[0]![0]!;
  client.setQueryData(['domain', 'valuation', portfolio], {});
  client.setQueryData(['domain', 'ledger', portfolio], {});
  expect(
    opts.predicate!(client.getQueryCache().find({ queryKey: ['domain', 'valuation', portfolio] })!),
  ).toBe(true);
  expect(
    opts.predicate!(client.getQueryCache().find({ queryKey: ['domain', 'ledger', portfolio] })!),
  ).toBe(false);
});
it('does not refetch independent terminal job status for financial ledger cache invalidation', async () => {
  status = { enabled: true, reason: null, latest: complete };
  await mount();
  const initial = fetcher.mock.calls.length;
  await client.invalidateQueries({ queryKey: ['domain'] });
  await flush();
  expect(fetcher.mock.calls).toHaveLength(initial);
  expect(screen.getByRole('button').textContent).toBe('Refresh prices');
});
it('unavailable capability/demo disables the control without a fake success', async () => {
  status = { enabled: false, reason: 'This public demo is read-only.', latest: null };
  await mount();
  expect(
    (screen.getByRole('button', { name: 'Refresh prices' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('read-only');
  expect(fetcher.mock.calls).toHaveLength(1);
});
it('partial and stale results use degraded copy rather than claiming all inputs are current', async () => {
  poll = {
    ...complete,
    state: 'degraded',
    stats: { ...complete.stats, requested: 2, missing: 1, stale: 1 },
  };
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await flush(1100);
  expect(screen.getByRole('status').textContent).toContain('missing or stale');
  expect(screen.getByRole('status').textContent).not.toContain('all prices are fresh');
});
it('missing/unavailable result exposes explicit retry with no price substitution', async () => {
  poll = {
    ...complete,
    state: 'unavailable',
    error: 'PROVIDER_UNAVAILABLE',
    stats: { ...complete.stats, accepted: 0, missing: 1 },
  };
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await flush(1100);
  expect(screen.getByRole('status').textContent).toContain('Missing values remain unavailable');
  expect(screen.getByRole('button', { name: 'Retry refresh' })).toBeTruthy();
});
it('lost submission response retries the original key instead of creating another logical job', async () => {
  let sends = 0;
  fetcher.mockImplementation(async (input, init) => {
    if (init?.method === 'POST') {
      sends++;
      if (sends === 1) throw new Error('lost response');
      return response(base, 202);
    }
    return response(String(input).endsWith('/refresh') ? status : complete);
  });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }));
  await flush(1100);
  const calls = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(calls).toHaveLength(2);
  expect(calls[0]![1]!.headers).toEqual(calls[1]![1]!.headers);
  expect(screen.getByRole('status').textContent).toContain('Refresh completed');
});
it('seven exponentially bounded checks stop; explicit check resumes the same run without POST', async () => {
  poll = base;
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await flush(28000);
  expect(screen.getByRole('status').textContent).toContain('Automatic checks have stopped');
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST').length;
  expect(posts).toBe(1);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/' + id))).toHaveLength(7);
  await flush(60000);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/' + id))).toHaveLength(7);
  poll = complete;
  fireEvent.click(screen.getByRole('button', { name: 'Check refresh again' }));
  await flush(1100);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(screen.getByRole('status').textContent).toContain('Refresh completed');
  expect([0, 1, 2, 8].map(refreshPollDelay)).toEqual([1000, 2000, 4000, 5000]);
});
it('navigation/unmount aborts an in-flight request and cancels pending checks', async () => {
  const signals: AbortSignal[] = [];
  fetcher.mockImplementation(async (input, init) => {
    if (init?.signal) signals.push(init.signal);
    return response(
      init?.method === 'POST' ? base : String(input).endsWith('/refresh') ? status : base,
    );
  });
  const mounted = await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await flush();
  mounted.unmount();
  const count = fetcher.mock.calls.length;
  await flush(60000);
  expect(fetcher.mock.calls).toHaveLength(count);
  expect(signals.some((s) => s.aborted)).toBe(true);
});
it('temporary status failure retries only within the original bounded watch', async () => {
  let reads = 0;
  fetcher.mockImplementation(async (input, init) => {
    if (init?.method === 'POST') return response(base, 202);
    if (String(input).endsWith('/refresh')) return response(status);
    return ++reads === 1 ? error() : response(complete);
  });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await flush(1100);
  expect(screen.getByRole('status').textContent).toContain('temporarily unavailable');
  await flush(2100);
  expect(screen.getByRole('status').textContent).toContain('Refresh completed');
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});
it('a malformed response shows human copy and never exposes schema/error internals', async () => {
  result = { ...base, credentials: 'invalid extra field' };
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await flush();
  expect(screen.getByRole('status').textContent).toContain('Refresh is unavailable');
  expect(screen.getByRole('status').textContent).not.toMatch(/Zod|schema|credentials/);
});
it('an unresponsive submission is cancelled after35 seconds and leaves an explicit retry', async () => {
  fetcher.mockImplementation(async (_input, init) => {
    if (init?.method !== 'POST') return response(status);
    return new Promise<Response>((_, reject) => {
      init.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Cancelled', 'AbortError')),
        { once: true },
      );
    });
  });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await flush(35010);
  expect(screen.getByRole('status').textContent).toContain('timed out');
  expect(
    (screen.getByRole('button', { name: 'Retry refresh' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
