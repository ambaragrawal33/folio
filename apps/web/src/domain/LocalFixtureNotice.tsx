import { useQuery } from '@tanstack/react-query';
import { LocalFixtureStatus } from '@folio/shared';
import { api } from '../auth/client';
import { useSession } from '../auth/session';

export function LocalFixtureNotice() {
  const user = useSession().data?.user;
  const status = useQuery({
    queryKey: ['local-fixture-mode'],
    queryFn: () => api('/auth/local-fixture', LocalFixtureStatus),
    retry: false,
    staleTime: Infinity,
  });
  if (!status.data?.enabled && !user?.localFixture) return null;
  return (
    <aside
      className="demo-banner local-fixture-notice type-compact"
      aria-label="Local writable fixture mode"
    >
      <strong>Local writable test mode · synthetic fixtures, not live market data</strong>
      <p>
        Accounts and transactions are real and isolated from normal accounts and the read-only demo.
        Prices, history and FX are test inputs with source/date labels. Fresh means generated
        fixture data, never a live provider observation.
      </p>
      <p>
        Historical USD/INR: 83 on 5 Jan 2026 only; current fixture FX: 88. TCS/AAPL/VTI/BTC have
        generated price fixtures; ETH is deliberately stale (6 Jan 2026); RELIANCE has no price
        fixture. No automatic live fallback.
      </p>
    </aside>
  );
}
