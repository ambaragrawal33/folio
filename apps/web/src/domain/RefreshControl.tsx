import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { JobRun, RefreshStatus } from '@folio/shared';
import { api, ApiError } from '../auth/client';
import { Button } from '../design-system/primitives';
const pending = (r: JobRun | null) =>
  Boolean(r && ['queued', 'running', 'retrying'].includes(r.state));
export const refreshPollDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 5000);
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
export function RefreshControl({ portfolioId }: { portfolioId: string }) {
  const client = useQueryClient(),
    key = ['jobs', 'refresh-status', portfolioId];
  const status = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api(
        '/portfolios/' + portfolioId + '/refresh',
        RefreshStatus,
        undefined,
        'GET',
        true,
        {},
        signal,
      ),
    retry: false,
    staleTime: 30000,
    refetchOnMount: (query) => (pending(query.state.data?.latest ?? null) ? 'always' : true),
    refetchOnWindowFocus: false,
  });
  const [run, setRun] = useState<JobRun | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null),
    requestId = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const remember = (value: JobRun) => {
    setRun(value);
    client.setQueryData(key, { enabled: true, reason: null, latest: value });
  };
  const watch = async (value: JobRun, signal: AbortSignal) => {
    remember(value);
    setMessage('Checking refresh progress…');
    for (let n = 0; n < 7 && pending(value); n++) {
      await wait(refreshPollDelay(n), signal);
      try {
        value = await api(
          '/portfolios/' + portfolioId + '/refresh/' + value.id,
          JobRun,
          undefined,
          'GET',
          true,
          {},
          signal,
        );
        remember(value);
      } catch (error) {
        if (signal.aborted) throw error;
        if (!(error instanceof ApiError && error.status >= 500) || n === 6) throw error;
        setMessage(
          'Refresh status is temporarily unavailable. Retrying within this bounded check.',
        );
      }
    }
    if (pending(value)) {
      setFailed(true);
      setMessage(
        'The refresh is still queued or running. Automatic checks have stopped; check again explicitly.',
      );
      return;
    }
    const unsuccessful = ['failed', 'unavailable', 'cancelled'].includes(value.state);
    setFailed(unsuccessful);
    requestId.current = null;
    setMessage(
      value.state === 'completed'
        ? 'Refresh completed. Source and as-of labels remain authoritative.'
        : value.state === 'degraded'
          ? 'Refresh completed with missing or stale inputs. Existing valid observations were retained.'
          : value.state === 'unavailable'
            ? 'No permitted quote was returned. Missing values remain unavailable.'
            : 'Refresh failed. Existing valid data was retained; retry explicitly.',
    );
    await client.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === 'domain' &&
        ['valuation', 'holdings', 'asset-detail'].includes(String(q.queryKey[1])),
    });
  };
  const refresh = async () => {
    if (busy) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const deadline = setTimeout(() => {
      if (!mounted.current || controller.current !== current) return;
      current.abort();
      setBusy(false);
      setFailed(true);
      setMessage('Refresh checks timed out. The worker may still finish; check again explicitly.');
    }, 35000);
    setBusy(true);
    setFailed(false);
    setMessage('Submitting refresh…');
    try {
      const latest = run ?? status.data?.latest ?? null;
      if (pending(latest) && latest) await watch(latest, current.signal);
      else {
        requestId.current ??= crypto.randomUUID();
        const value = await api(
          '/portfolios/' + portfolioId + '/refresh',
          JobRun,
          {},
          'POST',
          true,
          { 'Idempotency-Key': requestId.current },
          current.signal,
        );
        await watch(value, current.signal);
      }
    } catch (error) {
      if (!current.signal.aborted) {
        setFailed(true);
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'Refresh is unavailable. Existing data was retained; retry explicitly.',
        );
      }
    } finally {
      clearTimeout(deadline);
      if (!current.signal.aborted) setBusy(false);
    }
  };
  const latest = run ?? status.data?.latest;
  return (
    <aside className="portfolio-notice" aria-label="Market refresh">
      <div className="portfolio-toolbar">
        <p className="type-caption text-secondary">
          Refresh current prices without changing your transactions. Source and as-of labels remain
          visible.
        </p>
        <Button
          kind="Tertiary"
          disabled={busy || status.isFetching || status.isPending || status.data?.enabled === false}
          aria-busy={busy}
          onClick={() => void refresh()}
        >
          {busy
            ? 'Refreshing…'
            : pending(latest ?? null)
              ? 'Check refresh again'
              : failed
                ? 'Retry refresh'
                : 'Refresh prices'}
        </Button>
      </div>
      <p className="type-caption text-secondary" role="status">
        {message ||
          status.data?.reason ||
          (status.isError
            ? 'Refresh status is unavailable. Retry refresh explicitly.'
            : 'Refresh runs only when requested.')}{' '}
        {busy && latest ? 'Refresh ' + latest.state + '.' : ''}
      </p>
      {latest && (
        <p className="type-caption text-secondary">
          Last refresh: {latest.state} · attempts {latest.attempts} · accepted{' '}
          {latest.stats.accepted}/{latest.stats.requested} · stale {latest.stats.stale} · missing{' '}
          {latest.stats.missing}
          {latest.finishedAt ? ' · ' + latest.finishedAt : ''}
        </p>
      )}
    </aside>
  );
}
