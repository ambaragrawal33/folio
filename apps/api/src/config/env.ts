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
  LOCAL_JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOCAL_JOB_SCHEDULES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  JOB_HTTP_SECRET: z.string().min(32).max(200).optional(),
  JOB_RUNNER_MODE: z.enum(['bullmq', 'stateless']).default('bullmq'),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  LOCAL_FIXTURE_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  CACHE_NAMESPACE: z
    .enum(['folio:normal', 'folio:demo', 'folio:local-fixture'])
    .default('folio:normal'),
  COINGECKO_DEMO_KEY: z.string().min(1).max(200).optional(),
  YAHOO_DISPLAY_ENTITLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  YAHOO_ENTITLEMENT_REFERENCE: z.string().min(10).max(500).optional(),
  YAHOO_OBSERVATION_ENTITLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  YAHOO_CLOSE_CAPTURE_ENTITLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  COINGECKO_OBSERVATION_ENTITLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OBSERVATION_RIGHTS_REFERENCE: z.string().min(10).max(500).optional(),
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
export function assertLocalFixtureEnv(env: Env) {
  const mongo = new URL(env.MONGODB_URI),
    redis = new URL(env.REDIS_URL),
    web = new URL(env.WEB_ORIGIN);
  const database = mongo.pathname.slice(1);
  const testDatabase =
    env.NODE_ENV === 'test' && /^folio_local_fixture_test_[a-f0-9]{16}$/.test(database);
  if (
    !env.LOCAL_FIXTURE_MODE ||
    env.NODE_ENV === 'production' ||
    env.DEMO_MODE ||
    env.CACHE_NAMESPACE !== 'folio:local-fixture' ||
    (database !== 'folio_local_fixture' && !testDatabase) ||
    mongo.protocol !== 'mongodb:' ||
    !['localhost', '127.0.0.1', 'mongo'].includes(mongo.hostname) ||
    redis.protocol !== 'redis:' ||
    !['localhost', '127.0.0.1', 'redis'].includes(redis.hostname) ||
    redis.pathname !== '/1' ||
    !['localhost', '127.0.0.1'].includes(web.hostname) ||
    !['http:', 'https:'].includes(web.protocol) ||
    env.COINGECKO_DEMO_KEY ||
    env.YAHOO_DISPLAY_ENTITLED ||
    env.YAHOO_OBSERVATION_ENTITLED ||
    env.YAHOO_CLOSE_CAPTURE_ENTITLED ||
    env.COINGECKO_OBSERVATION_ENTITLED
  )
    throw new Error(
      'Local fixtures require explicit local/test mode, isolated storage and no live providers',
    );
}
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
  if (result.data.LOCAL_FIXTURE_MODE) {
    assertLocalFixtureEnv(result.data);
    return result.data;
  }
  if (
    database.startsWith('folio_local_fixture') ||
    result.data.CACHE_NAMESPACE === 'folio:local-fixture' ||
    new URL(result.data.REDIS_URL).pathname === '/1'
  )
    throw new Error('Local fixture storage is reserved for explicit fixture mode');
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
  if (
    (result.data.YAHOO_OBSERVATION_ENTITLED ||
      result.data.YAHOO_CLOSE_CAPTURE_ENTITLED ||
      result.data.COINGECKO_OBSERVATION_ENTITLED) &&
    !result.data.OBSERVATION_RIGHTS_REFERENCE
  )
    throw new Error('Durable market observations require verified retention rights');
  if (
    result.data.LOCAL_JOBS_ENABLED &&
    (result.data.YAHOO_OBSERVATION_ENTITLED || result.data.COINGECKO_OBSERVATION_ENTITLED) &&
    !input['REFRESH_TOKEN_SECRET']
  )
    throw new Error(
      'Shared normal provider workers require a stable local cache encryption secret',
    );
  return result.data;
}
