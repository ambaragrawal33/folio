import { useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { navigation, releaseMap } from '@folio/shared';
import type { NavigationItem } from '@folio/shared';
import { Gallery } from './design-system/Gallery';
import { ContentState, Button } from './design-system/primitives';
import { Icon } from './design-system/Icon';
import { useTheme } from './state/theme';
function Unavailable({ item }: { item?: NavigationItem }) {
  const release = item ? releaseMap[item.path] : undefined;
  return (
    <div className="unavailable">
      <h1 className="type-title">{item?.label ?? 'Page unavailable'}</h1>
      <ContentState>
        {item && release && !release.available
          ? item.label + ' is not available yet.'
          : 'This page does not exist.'}
      </ContentState>
      <p className="type-body text-secondary">This view will be available in a future release.</p>
      <NavLink to="/dev/design-system" className="foundation-link type-compact">
        View the component gallery
      </NavLink>
    </div>
  );
}
export function App() {
  const { theme } = useTheme();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const navItem = (item: NavigationItem) => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) => 'shell-nav type-compact' + (isActive ? ' selected' : '')}
    >
      {item.icon && <Icon name="briefcase" />}
      <span>{item.label}</span>
    </NavLink>
  );
  return (
    <div className="app-shell">
      <a className="skip-link type-compact" href="#main">
        Skip to content
      </a>
      <aside className={'sidebar' + (menu ? ' open' : '')} aria-label="Folio sidebar">
        <div className="brand type-section">Folio</div>
        <nav className="primary-nav" aria-label="Primary">
          {navigation.slice(0, -1).map(navItem)}
        </nav>
        <div className="nav-spacer" />
        <nav className="bottom-nav" aria-label="Settings">
          {navigation.slice(-1).map(navItem)}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Button
            className="mobile-menu"
            aria-expanded={menu}
            aria-controls="mobile-nav"
            onClick={() => setMenu(!menu)}
          >
            Navigation
          </Button>
          <div className="portfolio-context">
            <button
              type="button"
              disabled
              className="context-selector portfolio-selector type-compact"
            >
              No portfolio
              <Icon name="down" />
            </button>
            <button
              type="button"
              disabled
              className="context-selector currency-selector type-compact"
            >
              INR ₹<Icon name="down" />
            </button>
          </div>
          <div className="utilities">
            <div className="global-search">
              <Icon name="search" />
              <input
                type="search"
                aria-label="Global search unavailable"
                className="type-compact"
                placeholder="Search unavailable"
                disabled
              />
            </div>
            <div className="notification-control">
              <Button kind="Icon-only" disabled aria-label="Notifications unavailable" />
              <span className="type-compact text-secondary">Notifications</span>
            </div>
            <div className="user-menu">
              <span className="avatar type-caption" aria-hidden="true">
                —
              </span>
              <button disabled type="button" className="account-name type-compact">
                Signed out
              </button>
              <Icon name="down" />
            </div>
          </div>
        </header>
        {menu && (
          <nav id="mobile-nav" className="mobile-navigation" aria-label="Mobile primary">
            {navigation.map(navItem)}
          </nav>
        )}
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dev/design-system" element={<Gallery />} />
            {navigation.map((item) => (
              <Route key={item.path} path={item.path} element={<Unavailable item={item} />} />
            ))}
            <Route path="*" element={<Unavailable />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
