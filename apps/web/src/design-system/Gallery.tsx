import { useState } from 'react';
import families from '@folio/design-tokens/families.json';
import variants from '@folio/design-tokens/components.json';
import {
  Button,
  Field,
  Choice,
  NavigationPrimitive,
  Tab,
  Breadcrumb,
  PaginationItem,
  FinancialValue,
  DataStatus,
  TableSpecimen,
  ColumnHeader,
  ContentState,
} from './primitives';
import { useTheme } from '../state/theme';
function Specimen({ family, properties }: { family: string; properties: string }) {
  const p = Object.fromEntries(properties.split(', ').map((s) => s.split('=')));
  const state = p['State'] ?? 'Default';
  const size = p['Size'] ?? 'Default';
  if (family.startsWith('Folio/Button/'))
    return (
      <Button
        kind={family.split('/')[2] as 'Primary'}
        size={size}
        state={state}
        aria-label={family.includes('Icon-only') ? state + ' icon button' : undefined}
      >
        {state}
      </Button>
    );
  if (family.includes('Size and icon'))
    return (
      <Button kind="Size and icon" size={size} leading={p['Icon'] === 'Leading'}>
        {size === 'Compact' ? 'Compact · 32' : size === 'Large' ? 'Standard · 36' : 'Leading icon'}
      </Button>
    );
  if (family.includes('Text input')) return <Field label={state + ' field'} state={state} />;
  if (family.includes('Search input'))
    return <Field label={state + ' search'} state={state} kind="search" />;
  if (family.includes('Select'))
    return <Field label={state + ' select'} state={state} kind="select" />;
  if (family.includes('Numeric input'))
    return <Field label="Numeric specimen" kind="numeric" initialValue="" />;
  if (['Checkbox', 'Radio', 'Switch'].some((k) => family === 'Folio/' + k))
    return <Choice kind={family.split('/')[1] as 'Checkbox'} state={state} name={family + state} />;
  if (family.includes('Navigation')) return <NavigationPrimitive state={state} />;
  if (family === 'Folio/Tab')
    return (
      <div role="tablist" aria-label={state + ' tab specimen'}>
        <Tab state={state}>{state}</Tab>
      </div>
    );
  if (family.includes('Breadcrumb')) return <Breadcrumb />;
  if (family.includes('Pagination'))
    return <PaginationItem state={state} arrow={p['Type'] === 'Arrow'} />;
  if (family === 'Folio/Financial value') return <FinancialValue state={state} />;
  if (family === 'Folio/Financial delta') return <FinancialValue state={state} delta />;
  if (family === 'Folio/Data status') return <DataStatus state={state} />;
  if (family.includes('Column header')) return <ColumnHeader state={state} />;
  if (family.includes('Table')) return <TableSpecimen state={state} density={p['Density']} />;
  return <ContentState loading={state === 'Loading'} />;
}
export function Gallery() {
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState('Components');
  return (
    <div className="gallery">
      <div className="page-heading">
        <div>
          <h1 className="type-title">Design System</h1>
          <p className="type-body text-secondary">Folio foundation · component specimens</p>
        </div>
        <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          Switch to {theme === 'dark' ? 'light' : 'dark'}
        </Button>
      </div>
      <p className="type-compact text-secondary">
        These are component states, not market data. All product capabilities are unavailable.
      </p>
      <div role="tablist" aria-label="Gallery views" className="gallery-tabs">
        {['Components', 'Tokens'].map((t) => (
          <Tab key={t} state={t === tab ? 'Selected' : 'Default'} onClick={() => setTab(t)}>
            {t}
          </Tab>
        ))}
      </div>
      {tab === 'Tokens' ? (
        <TokenGallery />
      ) : (
        families.map((f) => (
          <section
            key={f.id}
            className="gallery-section"
            data-family-section={f.name}
            aria-label={f.name}
          >
            <h2 className="type-section">{f.name.replace('Folio/', '')}</h2>
            <div className="specimens">
              {variants
                .filter((v) => v[1] === f.id || v[0] === f.id)
                .map((v) => (
                  <div key={String(v[0])} className="specimen" data-specimen={String(v[0])}>
                    <p className="type-caption text-secondary">{String(v[2])}</p>
                    <Specimen family={f.name} properties={String(v[2])} />
                  </div>
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
function TokenGallery() {
  const roles = [
    'surface-canvas',
    'surface-base',
    'surface-raised',
    'surface-hover',
    'surface-selected',
    'text-primary',
    'text-secondary',
    'text-muted',
    'text-disabled',
    'accent-primary',
    'accent-hover',
    'accent-pressed',
    'status-positive',
    'status-negative',
    'status-warning',
    'border-default',
    'border-subtle',
  ];
  return (
    <section className="gallery-section">
      <h2 className="type-section">Semantic palette</h2>
      <p className="type-body text-secondary">
        Original Figma roles; accessible text aliases preserve this palette.
      </p>
      <div className="specimens">
        {roles.map((role) => (
          <div key={role} className="swatch" style={{ background: 'var(--' + role + ')' }}>
            <span className="swatch-label type-caption">{role}</span>
          </div>
        ))}
      </div>
      <h2 className="type-section">Typography</h2>
      {['title', 'section', 'heading', 'body', 'compact', 'caption', 'numeric', 'metric'].map(
        (type) => (
          <p className={'type-' + type} key={type}>
            {type}: Folio 0123456789
          </p>
        ),
      )}
    </section>
  );
}
