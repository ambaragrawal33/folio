import { useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InstrumentSearchResponse } from '@folio/shared';
import type { Instrument } from '@folio/shared';
import { Button, FormField } from '../design-system/primitives';
import { Icon } from '../design-system/Icon';
import { api } from '../auth/client';

export function InstrumentPicker({
  catalogue,
  value,
  onSelect,
}: {
  catalogue: readonly Instrument[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [submitted, setSubmitted] = useState('');
  const id = useId(),
    select = useRef<HTMLSelectElement>(null);
  const result = useQuery({
    queryKey: ['domain', 'instrument-discovery', submitted],
    queryFn: () =>
      api(
        '/instruments/search?' + new URLSearchParams({ q: submitted, limit: '20' }),
        InstrumentSearchResponse,
      ),
    retry: false,
  });
  const selected = catalogue.find((i) => i.id === value),
    found = result.data?.instruments ?? [];
  const choices =
    selected && !found.some((i) => i.id === selected.id) ? [selected, ...found] : found;
  const search = () => {
    setSubmitted(query.trim());
    if (query.trim() === submitted) void result.refetch();
  };
  return (
    <section className="instrument-picker" aria-label="Instrument discovery">
      <div className="instrument-search" data-figma="2:4830">
        <div className="instrument-search-field">
          <FormField
            label="Search instruments"
            type="search"
            value={query}
            maxLength={100}
            placeholder="Symbol, security name or verified alias"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search();
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                select.current?.focus();
              }
            }}
          />
          <Icon name="search" />
        </div>
        <Button
          disabled={result.isFetching}
          state={result.isFetching ? 'Disabled' : 'Default'}
          onClick={search}
        >
          Search catalogue
        </Button>
      </div>
      <p
        id={id + '-status'}
        className="type-caption text-secondary"
        role="status"
        aria-live="polite"
      >
        {result.isFetching
          ? 'Searching verified catalogue…'
          : result.error
            ? 'Instrument search unavailable. Retry; your existing selection is preserved.'
            : submitted && !found.length
              ? 'No verified instruments match this search. Try a symbol, name or provider alias.'
              : `${found.length} verified results${result.data?.truncated ? ' · result limit reached; refine your search' : ''}. Choose the exchange and currency explicitly.`}
      </p>
      {result.error && (
        <Button onClick={() => void result.refetch()}>Retry instrument search</Button>
      )}
      <label className="portfolio-select" htmlFor={id}>
        Canonical instrument
        <select
          id={id}
          ref={select}
          aria-label="Canonical instrument"
          aria-describedby={id + '-status'}
          value={value}
          disabled={result.isPending}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">Choose instrument</option>
          {choices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.symbol} · {i.exchange} · {i.currency} · {i.name}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div className="instrument-selection type-compact" aria-label="Selected instrument">
          <strong>{selected.name}</strong>
          <p>
            {selected.id} · {selected.exchange} · {selected.currency} · {selected.assetClass}
          </p>
          <p className="type-caption text-secondary">Identity source: {selected.metadataSource}</p>
          <p className="type-caption text-secondary">
            Verified alias: {selected.providerId}
            {selected.aliases?.length ? ' · ' + selected.aliases.join(' · ') : ''}. Selection does
            not guarantee a permitted market price.
          </p>
        </div>
      )}
      {result.data && (
        <div
          className="instrument-capabilities type-caption text-secondary"
          aria-label="Discovery provider status"
        >
          {result.data.providers.map((p) => (
            <p key={p.provider}>{p.reason}</p>
          ))}
          <p>
            Search uses the verified catalogue. Unknown symbols cannot be recorded; no arbitrary
            provider-symbol entry or automatic identity creation.
          </p>
        </div>
      )}
    </section>
  );
}
