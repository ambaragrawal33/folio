import { z } from 'zod';
export * from './auth.ts';
export * from './domain.ts';
export * from './jobs.ts';
export * from './pagination.ts';
export * from './financial-format.ts';
// Exact financial values cross the boundary as strings; Decimal arithmetic lives in domain services.
export const DecimalString = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(100);
export type DecimalString = z.infer<typeof DecimalString>;
export const RequestId = z.string().uuid();
export const ErrorEnvelope = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string(), requestId: RequestId }),
});
export const HealthResponse = z.strictObject({ status: z.literal('ok') });
export const ReadyResponse = z.strictObject({
  status: z.enum(['ready', 'unavailable']),
  dependencies: z.strictObject({ mongo: z.boolean(), redis: z.boolean() }),
});
export const DEFAULT_BASE_CURRENCY = 'INR' as const;
export const DEFAULT_COST_BASIS = 'FIFO' as const;
export const Theme = z.enum(['dark', 'light']);
export type Theme = z.infer<typeof Theme>;
export const navigation = [
  { label: 'Dashboard', path: '/dashboard', tier: 'P0', phase: 3, icon: true },
  { label: 'Holdings', path: '/holdings', tier: 'P0', phase: 3, icon: true },
  { label: 'Performance', path: '/performance', tier: 'P1', phase: 6, icon: true },
  { label: 'Analytics', path: '/analytics', tier: 'P2', phase: null, icon: true },
  { label: 'Transactions', path: '/transactions', tier: 'P0', phase: 3, icon: true },
  { label: 'Tax', path: '/tax', tier: 'P2', phase: null, icon: true },
  { label: 'Watchlist', path: '/watchlist', tier: 'P1', phase: null, icon: true },
  { label: 'Goals', path: '/goals', tier: 'P1', phase: 7, icon: true },
  { label: 'News', path: '/news', tier: 'P0', phase: 4, icon: false },
  { label: 'AI Assistant', path: '/assistant', tier: 'P0', phase: 5, icon: false },
  { label: 'Alerts', path: '/alerts', tier: 'P1', phase: 7, icon: false },
  { label: 'Settings', path: '/settings', tier: 'P0', phase: 2, icon: true },
] as const;
export type NavigationItem = (typeof navigation)[number];
// Changing a tier or route never ships its engine. Activate only after that feature's gate passes.
export const capabilities = Object.freeze({
  authentication: true,
  portfolio: true,
  valuation: true,
  news: false,
  assistant: false,
  analytics: false,
  watchlist: false,
  notifications: false,
  dashboard: true,
  holdings: true,
  transactions: true,
  performance: false,
  tax: false,
  goals: false,
  alerts: false,
  settings: true,
});
const routeCapabilities: Record<NavigationItem['path'], keyof typeof capabilities> = {
  '/dashboard': 'dashboard',
  '/holdings': 'holdings',
  '/performance': 'performance',
  '/analytics': 'analytics',
  '/transactions': 'transactions',
  '/tax': 'tax',
  '/watchlist': 'watchlist',
  '/goals': 'goals',
  '/news': 'news',
  '/assistant': 'assistant',
  '/alerts': 'alerts',
  '/settings': 'settings',
};
export const releaseMap = Object.freeze(
  Object.fromEntries(
    navigation.map((item) => [
      item.path,
      {
        available: capabilities[routeCapabilities[item.path]],
        tier: item.tier,
        phase: item.phase,
      },
    ]),
  ),
);
