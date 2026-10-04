import { useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { navigation, releaseMap } from '@folio/shared';
import type { NavigationItem } from '@folio/shared';
import { Gallery } from './design-system/Gallery';
import { ContentState, Button } from './design-system/primitives';
import { Icon } from './design-system/Icon';
import { useTheme } from './state/theme';
import { AuthScreens, PrivacyPage } from './auth/AuthScreens';
import { Account } from './auth/Account';
import { useAccess } from './auth/client';
import { useSession } from './auth/session';
import {
  PortfolioScreen,
  RecordTransaction,
  AssetDetail,
  GlobalSearch,
} from './domain/PortfolioScreens';
import { usePortfolios } from './domain/client';
function AuthGate({ children }: { children: ReactNode }) {
  const status = useAccess((s) => s.status);
  if (status === 'loading') return <ContentState loading />;
  if (status !== 'authenticated')
    return <Navigate to={status === 'expired' ? '/auth/session-expired' : '/auth/login'} replace />;
  return children;
}
function Unavailable({
  item,
  foundationPreview = false,
}: {
  item?: NavigationItem | undefined;
  foundationPreview?: boolean;
}) {
  const release = item ? releaseMap[item.path] : undefined;
  return (
    <div className="unavailable">
      <h1 className="type-title">{item?.label ?? 'Page unavailable'}</h1>
      <ContentState>
        {item && release && (foundationPreview || !release.available)
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
  const navigate = useNavigate();
  const session = useSession();
  const portfolios = usePortfolios();
  const authenticated = useAccess((state) => state.status === 'authenticated');
  const user = authenticated ? session.data?.user : undefined;
  const preview = import.meta.env.DEV && location.pathname === '/dev/shell';
  const previewRoute = new URLSearchParams(location.search).get('preview') ?? 'dashboard';
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  useEffect(() => {
    setMenu(false);
  }, [location.pathname, location.search]);
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
      to={preview ? '/dev/shell?preview=' + item.path.slice(1) : item.path}
      className={({ isActive }) =>
        'shell-nav type-compact' +
        ((preview ? previewRoute === item.path.slice(1) : isActive) ? ' selected' : '')
      }
    >
      {item.icon && <Icon name="briefcase" />}
      <span>{item.label}</span>
    </NavLink>
  );
  if (location.pathname.startsWith('/auth/')) return <AuthScreens key={location.pathname} />;
  if (location.pathname === '/privacy') return <PrivacyPage />;
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
              {preview ? 'No portfolio' : (portfolios.data?.portfolios[0]?.name ?? 'No portfolio')}
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
            {authenticated && !preview ? (
              <GlobalSearch />
            ) : (
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
            )}
            <div className="notification-control">
              <Button kind="Icon-only" disabled aria-label="Notifications unavailable" />
              <span className="type-compact text-secondary">Notifications</span>
            </div>
            <div className="user-menu">
              <span className="avatar type-caption" aria-hidden="true">
                {user
                  ? user.name
                      .trim()
                      .split(/\s+/)
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : '—'}
              </span>
              <button
                disabled={!user}
                type="button"
                className="account-name type-compact"
                data-authenticated={Boolean(user)}
                onClick={() => navigate('/settings')}
              >
                {user?.name ?? 'Signed out'}
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
            {import.meta.env.DEV && (
              <Route
                path="/dev/shell"
                element={
                  <Unavailable
                    item={navigation.find((n) => n.path === '/' + previewRoute)}
                    foundationPreview
                  />
                }
              />
            )}
            {navigation.map((item) => (
              <Route
                key={item.path}
                path={item.path}
                element={
                  <AuthGate>
                    {item.path === '/settings' ? (
                      <Account />
                    ) : ['/dashboard', '/holdings', '/transactions'].includes(item.path) ? (
                      <PortfolioScreen
                        view={item.path.slice(1) as 'dashboard' | 'holdings' | 'transactions'}
                      />
                    ) : (
                      <Unavailable item={item} />
                    )}
                  </AuthGate>
                }
              />
            ))}
            <Route
              path="/transactions/new"
              element={
                <AuthGate>
                  <RecordTransaction />
                </AuthGate>
              }
            />
            <Route
              path="/holdings/:instrumentId"
              element={
                <AuthGate>
                  <AssetDetail />
                </AuthGate>
              }
            />
            <Route path="*" element={<Unavailable />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
