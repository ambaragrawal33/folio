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
          'res.headers["set-cookie"]',
          'password',
          'token',
          'secret',
          'apiKey',
          'authorization',
          'cookie',
          '*.password',
          '*.token',
          '*.secret',
          '*.apiKey',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  );
}
