import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { createApp } from '../src/app';
import { parseEnv } from '../src/config/env';
import { createLogger } from '../src/config/logger';
import { ErrorEnvelope } from '@folio/shared';
import { createErrorHandler } from '../src/middleware/errors';
import type { ErrorReporter } from '../src/middleware/errors';
const config = {
  MONGODB_URI: 'mongodb://127.0.0.1/folio',
  REDIS_URL: 'redis://127.0.0.1',
  WEB_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
};
const env = parseEnv(config);
function fixture(probe = vi.fn().mockResolvedValue({ mongo: true, redis: true })) {
  const logs: string[] = [];
  const dest = new Writable({
    write(chunk, _encoding, done) {
      logs.push(String(chunk));
      done();
    },
  });
  return {
    app: createApp(env, { probe, close: async () => {} }, createLogger('info', dest)),
    logs,
    probe,
  };
}
describe('API foundation', () => {
  it('reports allowlisted error metadata and preserves safe responses when the reporter fails', async () => {
    for (const reporterFails of [false, true]) {
      const reporter = vi.fn<ErrorReporter>(() => {
        if (reporterFails) throw new Error('PRIVATE_VALUE');
      });
      const app = express();
      app.use((req, _res, next) => {
        req.id = randomUUID();
        req.log = createLogger('silent');
        next();
      });
      app.get('/failure', () => {
        throw new Error('database-uri=PRIVATE_VALUE');
      });
      app.use(createErrorHandler(reporter));
      const response = await request(app).get('/failure?token=PRIVATE_VALUE');
      expect(response.status).toBe(500);
      expect(ErrorEnvelope.safeParse(response.body).success).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('PRIVATE_VALUE');
      const event = reporter.mock.calls[0]?.[0];
      expect(event).toEqual({
        code: 'INTERNAL_ERROR',
        requestId: response.body.error.requestId,
        status: 500,
      });
      expect(Object.isFrozen(event)).toBe(true);
    }
  });
  it('validates environment names without exposing values', () => {
    expect(parseEnv(config).PORT).toBe(3000);
    expect(() => parseEnv({ ...config, PORT: '0' })).toThrow('PORT');
    expect(() => parseEnv({ ...config, MONGODB_URI: 'PRIVATE_VALUE' })).toThrow('MONGODB_URI');
    try {
      parseEnv({ ...config, MONGODB_URI: 'PRIVATE_VALUE' });
    } catch (e) {
      expect(String(e)).not.toContain('PRIVATE_VALUE');
    }
    expect(() => parseEnv({ ...config, SMTP_HOST: 'smtp.external.example' })).toThrow('SMTP_HOST');
    expect(() => parseEnv({ ...config, NODE_ENV: 'production' })).toThrow('Production startup');
    expect(() => parseEnv({ ...config, REDIS_URL: 'https://host' })).toThrow('REDIS_URL');
  });
  it('liveness does not depend on services; readiness checks actual state', async () => {
    const { app, probe } = fixture();
    const live = await request(app).get('/api/health').set('X-Request-Id', 'attacker-value');
    expect(live.status).toBe(200);
    expect(probe).not.toHaveBeenCalled();
    expect(live.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(live.headers['x-powered-by']).toBeUndefined();
    expect((await request(app).get('/api/ready')).body).toEqual({
      status: 'ready',
      dependencies: { mongo: true, redis: true },
    });
    const down = fixture(vi.fn().mockResolvedValue({ mongo: true, redis: false }));
    expect((await request(down.app).get('/api/ready')).status).toBe(503);
    const failed = fixture(vi.fn().mockRejectedValue(new Error('credentials=PRIVATE_VALUE')));
    expect((await request(failed.app).get('/api/ready')).body).toEqual({
      status: 'unavailable',
      dependencies: { mongo: false, redis: false },
    });
  });
  it('returns strict redacted errors and excludes URL/body/header secrets from logs', async () => {
    const { app, logs } = fixture();
    const missing = await request(app)
      .get('/api/auth?token=PRIVATE_VALUE')
      .set('Authorization', 'PRIVATE_VALUE')
      .set('Cookie', 'secret=PRIVATE_VALUE');
    expect(missing.status).toBe(404);
    expect(ErrorEnvelope.safeParse(missing.body).success).toBe(true);
    const malformed = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"password":"PRIVATE_VALUE",');
    expect(malformed.status).toBe(400);
    expect(JSON.stringify(malformed.body)).not.toContain('PRIVATE_VALUE');
    const large = await request(app)
      .post('/unknown')
      .set('Content-Type', 'application/json')
      .send({ secret: 'PRIVATE_VALUE'.repeat(10000) });
    expect(large.status).toBe(413);
    expect(logs.join('')).not.toContain('PRIVATE_VALUE');
  });
  it('generates OpenAPI and serves Swagger assets under CSP', async () => {
    const { app } = fixture();
    const doc = await request(app).get('/api/openapi.json');
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toBe('3.0.3');
    expect((await request(app).get('/docs/')).text).toContain('swagger-ui');
    expect((await request(app).get('/docs/swagger-ui-init.js')).text).toContain(
      '/api/openapi.json',
    );
    const cors = await request(app).options('/api/health').set('Origin', env.WEB_ORIGIN);
    expect(cors.headers['access-control-allow-origin']).toBe(env.WEB_ORIGIN);
    expect(cors.headers['access-control-allow-credentials']).toBe('true');
  });
  it('redacts structured credential fields', () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, done) {
        output += String(chunk);
        done();
      },
    });
    createLogger('info', stream).info(
      {
        password: 'PRIVATE_VALUE',
        token: 'PRIVATE_VALUE',
        receipt: 'PRIVATE_VALUE',
        nested: { apiKey: 'PRIVATE_VALUE', receipt: 'PRIVATE_VALUE' },
        req: {
          headers: {
            authorization: 'PRIVATE_VALUE',
            cookie: 'PRIVATE_VALUE',
            'transaction-preview': 'PRIVATE_VALUE',
          },
        },
      },
      'test',
    );
    expect(output).not.toContain('PRIVATE_VALUE');
    expect(output).toContain('[REDACTED]');
  });
});
