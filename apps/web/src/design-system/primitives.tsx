import { useId, useState, useRef, useEffect } from 'react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import families from '@folio/design-tokens/families.json';
import variants from '@folio/design-tokens/components.json';
import { Icon } from './Icon';
import { useTheme } from '../state/theme';
export type State = string;
export function variant(family: string, state: State, size = 'Default') {
  const f = families.find((f) => f.name === family || f.name.startsWith(family + '/State='));
  const rows = variants.filter((v) => v[1] === f?.id || v[0] === f?.id);
  const candidate = rows.find(
    (v) =>
      String(v[2]).includes('State=' + state) &&
      (!String(v[2]).includes('Size=') || String(v[2]).includes('Size=' + size)),
  );
  return String((candidate ?? rows[0])?.[0] ?? '');
}
export function Button({
  children,
  kind = 'Secondary',
  size = 'Default',
  state = 'Default',
  leading = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  kind?: 'Primary' | 'Secondary' | 'Tertiary' | 'Destructive' | 'Icon-only' | 'Size and icon';
  size?: string;
  state?: string;
  leading?: boolean;
}) {
  const family = kind === 'Size and icon' ? 'Folio/Size and icon button' : 'Folio/Button/' + kind;
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      disabled={props.disabled || state === 'Disabled'}
      className={'ds-control ds-button type-compact ' + (props.className ?? '')}
      data-family={family}
      data-size={size}
      data-state={state}
      data-kind={kind}
      data-figma={variant(family, state, size)}
    >
      {(leading || kind === 'Icon-only') && <Icon name="download" />}
      {kind !== 'Icon-only' && children}
    </button>
  );
}
export function Field({
  label,
  state = 'Default',
  kind = 'text',
  help = 'Foundation input',
  initialValue = '',
}: {
  label: string;
  state?: string;
  kind?: 'text' | 'search' | 'select' | 'numeric';
  help?: string;
  initialValue?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(initialValue);
  const family =
    kind === 'search'
      ? 'Folio/Search input'
      : kind === 'select'
        ? 'Folio/Select'
        : kind === 'numeric'
          ? 'Folio/Numeric input'
          : 'Folio/Text input';
  const error = state === 'Error';
  return (
    <div
      className={'ds-field ' + (kind === 'text' ? 'text-field' : 'wide-field')}
      data-state={state}
      data-figma={kind === 'text' ? variant(family, state) : undefined}
    >
      {kind === 'text' && <p className="type-caption text-muted">{state}</p>}
      {kind === 'text' && (
        <label className="type-caption text-secondary" htmlFor={id}>
          {label}
        </label>
      )}
      <div
        className="ds-input-wrap ds-control type-compact"
        data-figma={kind === 'text' ? undefined : variant(family, state)}
      >
        {kind === 'search' && <Icon name="search" />}
        {kind === 'numeric' && (
          <label className="type-caption text-secondary" htmlFor={id}>
            {label}
          </label>
        )}
        {kind === 'select' ? (
          <select
            id={id}
            aria-label={label}
            disabled={state === 'Disabled' || state === 'Read only'}
            aria-invalid={error}
            aria-describedby={id + '-help'}
            value={value || 'INR'}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="INR">Base currency · INR</option>
            <option value="USD">Base currency · USD</option>
          </select>
        ) : (
          <input
            id={id}
            type={kind === 'search' ? 'search' : 'text'}
            inputMode={kind === 'numeric' ? 'decimal' : 'text'}
            className={kind === 'numeric' ? 'type-numeric numeric-input' : ''}
            aria-label={label}
            value={value}
            placeholder={
              kind === 'text'
                ? 'Enter value'
                : kind === 'search'
                  ? 'Search foundation examples'
                  : ''
            }
            onChange={(e) => setValue(e.target.value)}
            disabled={state === 'Disabled'}
            readOnly={state === 'Read only'}
            aria-invalid={error}
            aria-describedby={id + '-help'}
          />
        )}
        {kind === 'select' && <Icon name="down" />}
        {kind === 'numeric' && <span className="type-numeric text-secondary">%</span>}
      </div>
      {(kind === 'text' || error) && (
        <p id={id + '-help'} className={'type-caption ' + (error ? 'text-negative' : 'text-muted')}>
          {error ? 'A valid value is required.' : help}
        </p>
      )}
      {kind !== 'text' && !error && (
        <span id={id + '-help'} className="sr-only">
          {help}
        </span>
      )}
    </div>
  );
}
export function Choice({
  kind,
  state,
  label,
  name = 'foundation-radio',
}: {
  kind: 'Checkbox' | 'Radio' | 'Switch';
  state: string;
  label?: string;
  name?: string;
}) {
  const { theme } = useTheme();
  const [checked, setChecked] = useState(
    state === 'Checked' || state === 'Selected' || state === 'On',
  );
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'Indeterminate';
  }, [state]);
  return (
    <label
      className="ds-choice type-caption"
      data-figma={variant('Folio/' + kind, state)}
      data-kind={kind}
    >
      <input
        ref={ref}
        type={kind === 'Radio' ? 'radio' : 'checkbox'}
        role={kind === 'Switch' ? 'switch' : undefined}
        name={kind === 'Radio' ? name : undefined}
        checked={checked}
        disabled={state === 'Disabled'}
        onChange={(e) => setChecked(e.target.checked)}
      />
      {kind === 'Switch' ? (
        <img
          className="switch-track"
          src={
            '/figma/' +
            (theme === 'light' ? 'light/' : '') +
            (state === 'Disabled' ? '2-4841' : checked ? '2-4840' : '2-4839') +
            '-imgSwitchTrack.svg'
          }
          alt=""
        />
      ) : kind === 'Radio' && checked ? (
        <img
          className="choice-indicator"
          src={'/figma/' + (theme === 'light' ? 'light/' : '') + '2-4837-imgRadioIndicator.svg'}
          alt=""
        />
      ) : (
        <span className="choice-indicator" data-checked={checked || state === 'Indeterminate'}>
          {state === 'Indeterminate' ? (
            <span className="mixed" />
          ) : (
            checked && <Icon name="check" small />
          )}
        </span>
      )}
      <span>{label ?? state}</span>
    </label>
  );
}
export function NavigationPrimitive({ state }: { state: string }) {
  return (
    <button
      type="button"
      disabled={state === 'Disabled'}
      data-family="Folio/Navigation item"
      data-size="Default"
      data-figma={variant('Folio/Navigation item', state)}
      data-state={state}
      className="ds-nav type-compact"
    >
      <Icon name="briefcase" />
      <span className="nav-label">Portfolios</span>
      <span className="type-caption text-muted">{state}</span>
    </button>
  );
}
export function Tab({
  state,
  children,
  onClick,
}: {
  state: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={state === 'Selected'}
      disabled={state === 'Disabled'}
      onClick={onClick}
      data-figma={variant('Folio/Tab', state)}
      data-state={state}
      className="ds-tab type-compact"
    >
      {children}
    </button>
  );
}
export function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" data-figma="2:4850" className="ds-breadcrumb type-caption">
      <a href="/dev/design-system">Foundation</a>
      <Icon name="right" small />
      <span aria-current="page">Components</span>
    </nav>
  );
}
export function PaginationItem({ state, arrow = false }: { state: string; arrow?: boolean }) {
  return (
    <button
      type="button"
      disabled={state === 'Disabled'}
      aria-label={arrow ? 'Previous page' : 'Page ' + (state === 'Selected' ? '1' : '2')}
      aria-current={state === 'Selected' ? 'page' : undefined}
      data-figma={variant('Folio/Pagination item', state)}
      className="ds-control ds-pagination type-compact"
      data-state={state}
    >
      {arrow ? <Icon name="left" /> : state === 'Selected' ? '1' : '2'}
    </button>
  );
}
export function FinancialValue({
  state,
  value = null,
  delta = false,
}: {
  state: string;
  value?: string | null;
  delta?: boolean;
}) {
  if (delta)
    return (
      <span
        data-figma={variant('Folio/Financial delta', state)}
        data-state={state}
        className="ds-delta type-numeric"
      >
        {value ?? '—'}
      </span>
    );
  return (
    <div
      data-figma={variant('Folio/Financial value', state)}
      data-state={state}
      className="ds-metric"
    >
      <div className="metric-context">
        <p className="type-caption text-secondary">Component specimen</p>
        <span className="metric-unit text-muted">INR</span>
      </div>
      <div className="type-metric">{value ?? '—'}</div>
      <div className="metric-context">
        <span className="type-numeric">—</span>
        <span className="type-caption text-muted">{state}</span>
      </div>
      <p className="type-caption text-muted">Awaiting valuation</p>
    </div>
  );
}
export function DataStatus({ state }: { state: string }) {
  return (
    <span
      data-figma={variant('Folio/Data status', state)}
      data-state={state}
      className="ds-status type-caption"
    >
      <span className="status-dot" />
      {state}
    </span>
  );
}
export function ContentState({
  loading = false,
  children,
}: {
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      data-figma={loading ? '2:4878' : '2:4877'}
      className="ds-content type-caption"
    >
      <Icon name={loading ? 'loading' : 'empty'} />
      {children ?? (loading ? 'Loading component specimen…' : 'No data is connected.')}
    </div>
  );
}
export function ColumnHeader({ state }: { state: string }) {
  const [direction, setDirection] = useState(state);
  return (
    <button
      type="button"
      data-figma={variant('Folio/Column header', direction)}
      className="ds-column type-caption"
      aria-label={'Sort: ' + direction}
      onClick={() => setDirection(direction === 'Ascending' ? 'Descending' : 'Ascending')}
    >
      {direction}
      <Icon name="sort" small />
    </button>
  );
}
export function TableSpecimen({
  state = 'Default',
  density = 'Compact',
}: {
  state?: string;
  density?: string;
}) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable table specimen">
      <table className="ds-table">
        <caption className="sr-only">Empty foundation table specimen, no portfolio data</caption>
        <thead>
          <tr data-figma="2:4867">
            <th>State</th>
            <th>Security</th>
            <th>Quantity</th>
            <th>Price (INR)</th>
            <th>Market value (INR)</th>
            <th>Weight (%)</th>
            <th>Day (%)</th>
          </tr>
        </thead>
        <tbody>
          <tr
            data-state={state}
            data-figma={density === 'Default' ? '2:4873' : variant('Folio/Table row', state)}
            aria-disabled={state === 'Disabled'}
          >
            <td>{state}</td>
            <td>
              <span className="security-cell">
                <span className="symbol">—</span>
                <span>Unavailable</span>
              </span>
            </td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
          </tr>
        </tbody>
        <tfoot>
          <tr data-figma="2:4872">
            <td colSpan={4}>No valued positions</td>
            <td>—</td>
            <td>—</td>
            <td>Unavailable</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
