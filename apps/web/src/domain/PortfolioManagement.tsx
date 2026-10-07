import { useRef, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Portfolio,
  PortfolioName,
  PortfolioManagement as Management,
  DeletePortfolioResponse,
} from '@folio/shared';
import type { z } from 'zod';
import { api, ApiError } from '../auth/client';
import { useSession } from '../auth/session';
import { Button, FormField, ContentState } from '../design-system/primitives';
const safeError = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : 'Folio could not verify the response. Reload portfolio details or retry the original request.';

export function PortfolioManagement({ portfolio }: { portfolio: z.infer<typeof Portfolio> }) {
  const client = useQueryClient(),
    navigate = useNavigate();
  const session = useSession();
  const readonly = Boolean(session.data?.user.demoReadonly);
  const listKey = ['domain', session.data?.user.id, 'portfolios'];
  const [name, setName] = useState(portfolio.name),
    [nameError, setNameError] = useState(''),
    [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [confirmationError, setConfirmationError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<{
    key: string;
    input: { confirmation: 'DELETE'; expectedVersion: number };
  } | null>(null);
  const reviewed = useRef<{ name: string; version: number } | null>(null);
  const deleteButtonId = 'portfolio-delete-' + portfolio.id;
  const managementKey = ['domain', 'management', portfolio.id];
  const clearScoped = async () => {
    const scoped = {
      predicate: (q: { queryKey: readonly unknown[] }) =>
        ['domain', 'jobs'].includes(String(q.queryKey[0])) && q.queryKey.includes(portfolio.id),
    };
    await client.cancelQueries(scoped);
    client.removeQueries(scoped);
  };
  const management = useQuery({
    queryKey: managementKey,
    queryFn: async ({ signal }) => {
      const data = await api(
        '/portfolios/' + portfolio.id + '/management',
        Management,
        undefined,
        'GET',
        true,
        {},
        signal,
      );
      if (data.portfolio.id !== portfolio.id) throw new Error('Unverified portfolio response');
      return data;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (confirm) heading.current?.focus();
    else if (reviewed.current) document.getElementById(deleteButtonId)?.focus();
  }, [confirm, deleteButtonId]);
  const updateList = (updated: z.infer<typeof Portfolio>) =>
    client.setQueryData<{ portfolios: z.infer<typeof Portfolio>[] }>(listKey, (data) =>
      data ? { portfolios: data.portfolios.map((p) => (p.id === updated.id ? updated : p)) } : data,
    );
  const rename = useMutation({
    mutationFn: async (input: { name: string; expectedVersion: number }) => {
      const data = await api('/portfolios/' + portfolio.id, Portfolio, input, 'PATCH');
      if (data.id !== portfolio.id || data.name !== input.name)
        throw new Error('Unverified rename response');
      return data;
    },
    onSuccess: async (updated) => {
      updateList(updated);
      setName(updated.name);
      setSaved(true);
      await client.invalidateQueries({ queryKey: managementKey });
    },
  });
  const deletion = useMutation({
    mutationFn: async () => {
      if (!attempt.current) throw new Error('Review the deletion before confirming.');
      const data = await api(
        '/portfolios/' + portfolio.id,
        DeletePortfolioResponse,
        attempt.current.input,
        'DELETE',
        true,
        { 'Idempotency-Key': attempt.current.key },
      );
      if (data.portfolioId !== portfolio.id) throw new Error('Unverified deletion response');
      return data;
    },
    onSuccess: async () => {
      await clearScoped();
      client.setQueryData<{ portfolios: z.infer<typeof Portfolio>[] }>(listKey, (data) =>
        data ? { portfolios: data.portfolios.filter((p) => p.id !== portfolio.id) } : data,
      );
      navigate('/dashboard', { state: { portfolioDeleted: true }, replace: true });
      await client.invalidateQueries({ queryKey: listKey });
    },
  });
  const current = management.data?.portfolio;
  const busy = rename.isPending || deletion.isPending || management.isFetching;
  const reload = async () => {
    attempt.current = null;
    setConfirm(false);
    setConfirmation('');
    rename.reset();
    deletion.reset();
    setSaved(false);
    const result = await management.refetch();
    await client.invalidateQueries({ queryKey: listKey });
    if (result.error instanceof ApiError && result.error.code === 'RESOURCE_NOT_FOUND') {
      await clearScoped();
      navigate('/dashboard', { replace: true });
    }
  };
  return (
    <div>
      {management.isPending ? (
        <ContentState loading>Loading portfolio management…</ContentState>
      ) : management.error ? (
        <>
          <p role="alert" className="type-caption text-negative">
            {safeError(management.error)}
          </p>
          <Button kind="Tertiary" onClick={() => void reload()}>
            Retry portfolio details
          </Button>
        </>
      ) : (
        <>
          <p className="type-caption text-secondary">Current default portfolio: {current?.name}</p>
          <form
            className="settings-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(false);
              rename.reset();
              const result = PortfolioName.safeParse(name);
              if (!result.success) {
                setNameError(result.error.issues[0]?.message ?? 'Enter a valid portfolio name.');
                nameRef.current?.focus();
                return;
              }
              setNameError('');
              if (current)
                rename.mutate({ name: result.data, expectedVersion: current.managementVersion });
            }}
          >
            <div className="settings-fields">
              <FormField
                ref={nameRef}
                label="Default portfolio name"
                value={name}
                maxLength={100}
                error={nameError || undefined}
                disabled={readonly || busy || confirm}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError('');
                  setSaved(false);
                }}
              />
            </div>
            <p className="type-caption text-secondary">
              One default portfolio. Renaming changes its label only; your transactions, FIFO and
              financial values stay unchanged.
            </p>
            <Button
              kind="Primary"
              type="submit"
              disabled={readonly || busy || confirm}
              state={readonly || busy || confirm ? 'Disabled' : 'Default'}
              aria-busy={rename.isPending}
            >
              {rename.isPending ? 'Saving name…' : 'Save portfolio name'}
            </Button>
            {saved && (
              <p role="status" className="type-caption">
                Portfolio name saved.
              </p>
            )}
            {rename.error && (
              <p role="alert" className="type-caption text-negative">
                {safeError(rename.error)}
              </p>
            )}
            {rename.error instanceof ApiError &&
              ['PORTFOLIO_CHANGED', 'RESOURCE_NOT_FOUND'].includes(rename.error.code) && (
                <Button kind="Tertiary" onClick={() => void reload()}>
                  Reload portfolio details
                </Button>
              )}
          </form>
          <h3 className="type-compact">Delete empty portfolio</h3>
          <p className="type-caption text-secondary">
            Only a portfolio with no transaction history or economic state can be deleted. Voiding
            or selling does not make it empty. Your account is retained.
          </p>
          {!management.data.canDelete && (
            <p
              id={'portfolio-delete-reason-' + portfolio.id}
              className="type-caption text-secondary"
            >
              {management.data.deletionReason}
            </p>
          )}
          {!confirm ? (
            <Button
              id={deleteButtonId}
              aria-describedby={
                !management.data.canDelete ? 'portfolio-delete-reason-' + portfolio.id : undefined
              }
              kind="Destructive"
              disabled={readonly || busy || !management.data.canDelete}
              state={readonly || busy || !management.data.canDelete ? 'Disabled' : 'Default'}
              onClick={() => {
                setConfirm(true);
                if (current)
                  reviewed.current = { name: current.name, version: current.managementVersion };
                setConfirmation('');
                setConfirmationError('');
                deletion.reset();
                attempt.current = null;
              }}
            >
              Delete portfolio
            </Button>
          ) : (
            <div className="portfolio-notice">
              <h3 ref={heading} tabIndex={-1} className="type-compact">
                Confirm empty portfolio deletion
              </h3>
              <p className="type-caption">
                Delete “{reviewed.current?.name}”? Folio checks emptiness again atomically. This
                does not delete your account. You can create a new default portfolio afterward.
              </p>
              <form
                className="settings-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (confirmation !== 'DELETE') {
                    setConfirmationError('Type DELETE exactly to confirm portfolio deletion.');
                    return;
                  }
                  setConfirmationError('');
                  if (!attempt.current && reviewed.current)
                    attempt.current = {
                      key: crypto.randomUUID(),
                      input: { confirmation: 'DELETE', expectedVersion: reviewed.current.version },
                    };
                  deletion.mutate();
                }}
              >
                <FormField
                  label="Type DELETE to confirm portfolio deletion"
                  value={confirmation}
                  disabled={deletion.isPending || Boolean(attempt.current)}
                  error={confirmationError || undefined}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
                <div className="portfolio-actions">
                  <Button
                    kind="Destructive"
                    type="submit"
                    disabled={deletion.isPending}
                    state={deletion.isPending ? 'Disabled' : 'Default'}
                    aria-busy={deletion.isPending}
                  >
                    {deletion.isPending
                      ? 'Deleting…'
                      : attempt.current
                        ? 'Retry deletion'
                        : 'Confirm deletion'}
                  </Button>
                  <Button
                    kind="Tertiary"
                    disabled={deletion.isPending || Boolean(attempt.current)}
                    onClick={() => setConfirm(false)}
                  >
                    Cancel portfolio deletion
                  </Button>
                </div>
                {deletion.error && (
                  <p role="alert" className="type-caption text-negative">
                    {safeError(deletion.error)} Retry uses the same request identifier and cannot
                    delete a replacement portfolio.
                  </p>
                )}
                {deletion.error instanceof ApiError &&
                  ['PORTFOLIO_CHANGED', 'PORTFOLIO_NOT_EMPTY', 'RESOURCE_NOT_FOUND'].includes(
                    deletion.error.code,
                  ) && (
                    <Button kind="Tertiary" onClick={() => void reload()}>
                      Reload portfolio details
                    </Button>
                  )}
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
