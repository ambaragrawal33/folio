import { z } from 'zod';
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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  EMAIL_TRANSPORT: z.enum(['console', 'mailhog']).default('mailhog'),
  SMTP_HOST: localOnlyHost.default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
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
    throw new Error('Production startup is not authorized in the foundation phase');
  return result.data;
}
