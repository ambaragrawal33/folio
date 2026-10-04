import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Portfolio, Valuation, formatMoney, formatPercent, formatDecimal } from '@folio/shared';
import { api, useAccess } from '../auth/client';
import { useSession } from '../auth/session';
export function usePortfolios() {
  const session = useSession();
  const authenticated = useAccess((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: ['domain', session.data?.user.id, 'portfolios'],
    queryFn: () => api('/portfolios', z.strictObject({ portfolios: z.array(Portfolio) })),
    enabled: authenticated && Boolean(session.data),
    retry: false,
  });
}
export function useValuation(id?: string) {
  return useQuery({
    queryKey: ['domain', 'valuation', id],
    queryFn: () => api('/portfolios/' + id + '/valuation', Valuation),
    enabled: Boolean(id),
    retry: false,
    staleTime: 60000,
  });
}
export function useFinancialDisplay() {
  const user = useSession().data?.user;
  const format = user?.preferences.numberFormat ?? 'indian';
  return {
    money: (v: string | null, currency = 'INR') => formatMoney(v, currency, format),
    percent: (v: string | null) => formatPercent(v, format),
    percentagePoints: (v: string | null) =>
      v === null ? '—' : formatDecimal(v, 2, format) + ' percentage points',
    quantity: (v: string | null) => formatDecimal(v, 18, format, true),
    price: (v: string | null, currency: string) =>
      v === null ? '—' : currency + ' ' + formatDecimal(v, 10, format, true),
    date: (v: string) =>
      new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: user?.timezone ?? 'Asia/Kolkata',
      }).format(new Date(v)),
  };
}
