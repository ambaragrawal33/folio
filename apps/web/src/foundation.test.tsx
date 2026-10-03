// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { useTheme } from './state/theme';
import { Gallery } from './design-system/Gallery';
import { Choice, Field, Button } from './design-system/primitives';
afterEach(cleanup);
describe('Frontend foundation', () => {
  it('preserves all designed navigation and shows unavailable product routes', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link').some((l) => l.textContent === 'Watchlist')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('not available');
    expect(screen.getByRole('searchbox', { name: 'Global search unavailable' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Navigation' }));
    expect(screen.getByRole('navigation', { name: 'Mobile primary' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Mobile primary' })).toBeNull();
  });
  it('renders all 119 inspected states and interactive theme/tokens tabs', () => {
    const { container } = render(
      <MemoryRouter>
        <Gallery />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll('[data-specimen]').length).toBe(119);
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Switch to/ }));
    expect(useTheme.getState().theme).toBe('light');
    fireEvent.click(screen.getByRole('tab', { name: 'Tokens' }));
    expect(screen.getByRole('heading', { name: 'Semantic palette' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Components' }));
    expect(screen.getAllByRole('button', { name: /Sort:/ }).length).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Unsorted' }));
    expect(screen.getAllByRole('button', { name: 'Sort: Ascending' }).length).toBe(2);
  });
  it('keeps native form controls accessible and editable with correct disabled/read-only semantics', () => {
    render(
      <>
        <Field label="Name" />
        <Field label="Decimal" kind="numeric" />
        <Field label="Currency" kind="select" />
        <Choice kind="Checkbox" state="Unchecked" label="Include" />
        <Choice kind="Checkbox" state="Indeterminate" label="Mixed" />
        <Button state="Disabled">Disabled action</Button>
      </>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Local' } });
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Local');
    fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), {
      target: { value: 'USD' },
    });
    expect((screen.getByRole('combobox', { name: 'Currency' }) as HTMLSelectElement).value).toBe(
      'USD',
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include' }));
    expect((screen.getByRole('checkbox', { name: 'Include' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      (screen.getByRole('checkbox', { name: 'Mixed' }) as HTMLInputElement).indeterminate,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Disabled action' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('handles a missing route and changes route after navigation', () => {
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Page unavailable' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Holdings' }));
    expect(screen.getByRole('heading', { name: 'Holdings' })).toBeTruthy();
  });
});
