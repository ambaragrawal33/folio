import { z } from 'zod';
export const JobName = z.enum(['price-refresh', 'eod-close-capture', 'housekeeping']);
export const OperatorJobRequest = z.strictObject({
  key: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
});
export const JobState = z.enum([
  'queued',
  'running',
  'retrying',
  'completed',
  'degraded',
  'unavailable',
  'failed',
  'cancelled',
]);
export const JobStats = z.strictObject({
  requested: z.number().int().min(0).max(25),
  accepted: z.number().int().min(0).max(25),
  missing: z.number().int().min(0).max(25),
  stale: z.number().int().min(0).max(25),
  reused: z.number().int().min(0).max(25),
  durationMs: z.number().nonnegative(),
  providerMs: z.number().nonnegative(),
  lockWaitMs: z.number().nonnegative(),
  cleaned: z.number().int().min(0).max(1000),
});
export const JobRun = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  name: JobName,
  state: JobState,
  attempts: z.number().int().min(0).max(3),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  error: z
    .enum([
      'TIMEOUT',
      'LOCK_LOST',
      'LOCK_CONTENDED',
      'PROVIDER_UNAVAILABLE',
      'PROVIDER_MALFORMED',
      'STORAGE_UNAVAILABLE',
      'WORKER_LOST',
      'RETRY_EXHAUSTED',
      'SCOPE_UNAVAILABLE',
    ])
    .nullable(),
  stats: JobStats,
});
export const RefreshStatus = z.strictObject({
  enabled: z.boolean(),
  reason: z.string().max(200).nullable(),
  latest: JobRun.nullable(),
});
export type JobRun = z.infer<typeof JobRun>;
export type JobStats = z.infer<typeof JobStats>;
export type JobName = z.infer<typeof JobName>;
