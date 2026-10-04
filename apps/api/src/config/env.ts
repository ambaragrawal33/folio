import { z } from 'zod';
import { randomBytes } from 'node:crypto';
const localOnlyHost = z
  .string()
  .refine(
    (s) => s === 'localhost' || s === '127.0.0.1' || s === 'mailhog',
    'Development SMTP must use a local MailHog host',
  );
export const EnvSchema = z.strictObject({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z
    .string()
    .url()
    .refine((s) => s.startsWith('mongodb://') || s.startsWith('mongodb+srv://')),
  REDIS_URL: z
    .string()
    .url()
    .refine((s) => s.startsWith('redis://') || s.startsWith('rediss://')),
  WEB_ORIGIN: z.string().url(),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CACHE_NAMESPACE: z.enum(['folio:normal', 'folio:demo']).default('folio:normal'),
  COINGECKO_DEMO_KEY: z.string().min(1).max(200).optional(),
  YAHOO_DISPLAY_ENTITLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  YAHOO_ENTITLEMENT_REFERENCE: z.string().min(10).max(500).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  EMAIL_TRANSPORT: z.enum(['console', 'mailhog']).default('mailhog'),
  SMTP_HOST: localOnlyHost.default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default(() => randomBytes(48).toString('base64url')),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(32)
    .default(() => randomBytes(48).toString('base64url')),
});
export type Env = z.infer<typeof EnvSchema>;
export function parseEnv(input: Record<string, string | undefined>): Env {
  const known = Object.fromEntries(Object.keys(EnvSchema.shape).map((key) => [key, input[key]]));
  const result = EnvSchema.safeParse(known);
  if (!result.success) {
    // Never include a configuration value or raw Zod issue body in errors.
    throw new Error(
      'Invalid environment: ' +
        [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', '),
    );
  }
  if (result.data.NODE_ENV === 'production')
    throw new Error('Production startup remains gated by O02/O04/O06 operational decisions');
  const database = new URL(result.data.MONGODB_URI).pathname.slice(1);
  if (
    result.data.DEMO_MODE &&
    (database !== 'folio_demo' || result.data.CACHE_NAMESPACE !== 'folio:demo')
  )
    throw new Error(
      'DEMO_MODE requires the isolated folio_demo database and folio:demo cache namespace',
    );
  if (
    !result.data.DEMO_MODE &&
    (database === 'folio_demo' || result.data.CACHE_NAMESPACE !== 'folio:normal')
  )
    throw new Error('Normal mode must not use demo storage');
  if (result.data.YAHOO_DISPLAY_ENTITLED && !result.data.YAHOO_ENTITLEMENT_REFERENCE)
    throw new Error('Yahoo display requires a verified entitlement reference');
  return result.data;
}
