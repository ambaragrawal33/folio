import pino from 'pino';
import type { DestinationStream } from 'pino';
export function createLogger(level: string, destination?: DestinationStream) {
  return pino(
    {
      level,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["transaction-preview"]',
          'req.headers["x-folio-job-signature"]',
          'res.headers["set-cookie"]',
          'password',
          'token',
          'receipt',
          'secret',
          'apiKey',
          'authorization',
          'cookie',
          '*.password',
          '*.token',
          '*.receipt',
          '*.secret',
          '*.apiKey',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  );
}
