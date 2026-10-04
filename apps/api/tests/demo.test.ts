import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { parseEnv } from '../src/config/env.ts';
import { AuthService } from '../src/services/auth.ts';
import { DomainService } from '../src/services/domain.ts';
import { DemoMarketGateway, demoRecords, seedDemo } from '../src/services/demo.ts';
import { instrumentMaster } from '../src/models/instrument-master.ts';
import { PasswordAuthProvider } from '../src/providers/password-auth.ts';
import { createApp } from '../src/app.ts';
import { createLogger } from '../src/config/logger.ts';
import { MemoryCache } from '../src/services/cache.ts';
const env = parseEnv({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost/folio_demo',
  REDIS_URL: 'redis://localhost',
  WEB_ORIGIN: 'http://localhost:5173',
  DEMO_MODE: 'true',
  CACHE_NAMESPACE: 'folio:demo',
});
let connection: mongoose.Connection,
  repl: MongoMemoryReplSet | undefined,
  auth: AuthService,
  domain: DomainService;
beforeAll(async () => {
  const supplied = process.env['FOLIO_TEST_MONGODB_URI'];
  if (!supplied)
    repl = await MongoMemoryReplSet.create({
      binary: { version: '8.2.12' },
      replSet: { count: 1 },
    });
  connection = await mongoose
    .createConnection(supplied ?? repl!.getUri(), {
      dbName: 'folio_demo_test_' + randomBytes(8).toString('hex'),
    })
    .asPromise();
  auth = new AuthService(connection, env, new PasswordAuthProvider(), {
    send: async () => {
      throw new Error('Public demo must not send email');
    },
  });
  await auth.initialize();
  domain = new DomainService(auth, new DemoMarketGateway(env));
  await domain.initialize(instrumentMaster);
  await seedDemo(env, auth, domain);
}, 180000);
afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
  await repl?.stop();
});
describe('isolated read-only fixture demo', () => {
  it('uses the real pure engine with hand-computed aggregate values and zero external providers', async () => {
    const login = await auth.demoSession({ ip: 'test', userAgent: 'demo test' });
    const identity = await auth.authenticate(login.response.accessToken);
    const [portfolio] = await domain.portfolios(identity);
    expect(identity.user.demoReadonly).toBe(true);
    expect(login.response.user.demoReadonly).toBe(true);
    const value = await domain.valuation(identity, portfolio!.id);
    expect(value).toMatchObject({
      status: 'stale',
      totalValue: '215316',
      totalBaseCost: '186205.4',
      unrealizedBase: '29110.6',
      realizedBase: '536',
      dividendBase: '28',
      coverage: { valued: 5, total: 5 },
    });
    expect(value.holdings.every((h) => h.quote?.fixture && h.fx?.source === 'demo-fixture')).toBe(
      true,
    );
    expect((await domain.ledger(identity, portfolio!.id, 1, 25)).total).toBe(9);
    expect((await domain.history(identity, portfolio!.id, 'AAPL:US')).points).toEqual([]);
    await seedDemo(env, auth, domain);
    expect(await domain.models.Economic.countDocuments()).toBe(9);
    expect(demoRecords()).toHaveLength(9);
    expect(await new DemoMarketGateway(env).historicalFx()).toBeNull();
    expect(
      await new DemoMarketGateway(env).quotes([{ ...instrumentMaster[0]!, id: 'unsupported' }]),
    ).toEqual([]);
    await expect(new DemoMarketGateway(env).rates(['USD'], 'USD')).rejects.toThrow('base currency');
  });
  it('denies every financial/account mutation and protects shared identity privacy', async () => {
    const app = createApp(
      env,
      { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
      createLogger('silent'),
      undefined,
      { service: auth, domain, cache: new MemoryCache() },
    );
    const response = await request(app)
      .post('/api/v1/auth/demo')
      .set('Origin', env.WEB_ORIGIN)
      .set('X-Folio-CSRF', '1')
      .send({});
    expect(response.status).toBe(200);
    const token = response.body.accessToken as string;
    const identity = await auth.authenticate(token);
    const [portfolio] = await domain.portfolios(identity);
    for (const path of [
      '/portfolios/default',
      `/portfolios/${portfolio!.id}/ledger`,
      `/portfolios/${portfolio!.id}/ledger/000000000000000000000001/void`,
      '/auth/register',
      '/auth/verify-email',
      '/auth/resend-verification',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/change-password',
      '/me/export',
    ]) {
      const body =
        path === '/auth/register'
          ? { name: 'New', email: 'new@example.test', password: 'Long test passphrase!' }
          : path === '/auth/verify-email'
            ? { token: randomBytes(32).toString('base64url') }
            : path === '/auth/resend-verification' || path === '/auth/forgot-password'
              ? { email: 'demo@folio.invalid' }
              : path === '/auth/reset-password'
                ? {
                    token: randomBytes(32).toString('base64url'),
                    password: 'Long test passphrase!',
                  }
                : path === '/auth/change-password'
                  ? { currentPassword: 'anything', password: 'Long test passphrase!' }
                  : {};
      const denied = await request(app)
        .post('/api/v1' + path)
        .set('Authorization', 'Bearer ' + token)
        .set('Origin', env.WEB_ORIGIN)
        .set('X-Folio-CSRF', '1')
        .send(body);
      expect(denied.status, path).toBe(403);
    }
    expect(
      (
        await request(app)
          .patch('/api/v1/me')
          .set('Authorization', 'Bearer ' + token)
          .set('Origin', env.WEB_ORIGIN)
          .set('X-Folio-CSRF', '1')
          .send({ name: 'Changed' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete('/api/v1/me')
          .set('Authorization', 'Bearer ' + token)
          .set('Origin', env.WEB_ORIGIN)
          .set('X-Folio-CSRF', '1')
          .send({ password: 'anything', confirmation: 'DELETE' })
      ).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/auth/demo')).body).toEqual({ enabled: true });
    expect((await request(app).post('/api/v1/auth/demo').send({})).status).toBe(403);
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', env.WEB_ORIGIN)
      .set('X-Folio-CSRF', '1')
      .set('Cookie', cookie)
      .send({});
    expect(refresh.status).toBe(200);
    expect(refresh.body.user.demoReadonly).toBe(true);
    await expect(domain.append(identity, portfolio!.id, {}, 'demo-request')).rejects.toMatchObject({
      code: 'DEMO_READ_ONLY',
    });
    await expect(
      domain.void(identity, portfolio!.id, '000000000000000000000001', 'Wrong'),
    ).rejects.toMatchObject({ code: 'DEMO_READ_ONLY' });
  });
  it('enforces namespace/normal-mode isolation and fails safely before seeds/invalid demo identity', async () => {
    for (const input of [
      { ...env, DEMO_MODE: 'true', CACHE_NAMESPACE: 'folio:normal' },
      {
        ...env,
        DEMO_MODE: 'true',
        CACHE_NAMESPACE: 'folio:demo',
        MONGODB_URI: 'mongodb://localhost/folio',
      },
      { ...env, DEMO_MODE: 'false', CACHE_NAMESPACE: 'folio:demo' },
      { ...env, DEMO_MODE: 'false', CACHE_NAMESPACE: 'folio:normal' },
    ])
      expect(() => parseEnv(input as unknown as Record<string, string>)).toThrow();
    const normal = parseEnv({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost/folio',
      REDIS_URL: 'redis://localhost',
      WEB_ORIGIN: 'http://localhost:5173',
    });
    expect(() => new DemoMarketGateway(normal)).toThrow('normal mode');
    await expect(seedDemo(normal, auth, domain)).rejects.toThrow('isolated');
    const normalAuth = new AuthService(connection, normal, new PasswordAuthProvider(), {
      send: async () => {},
    });
    await expect(normalAuth.demoSession({ ip: 'test', userAgent: 'test' })).rejects.toMatchObject({
      status: 404,
    });
    const login = await auth.demoSession({ ip: 'test', userAgent: 'test' });
    await expect(normalAuth.authenticate(login.response.accessToken)).rejects.toMatchObject({
      status: 401,
    });
    const user = await auth.models.User.findOne({ demoReadonly: true });
    await auth.models.User.updateOne({ _id: user!._id }, { $set: { demoReadonly: false } });
    await expect(seedDemo(env, auth, domain)).rejects.toThrow('read-only');
    await auth.models.User.updateOne({ _id: user!._id }, { $set: { demoReadonly: true } });
    const portfolio = await domain.models.Portfolio.findOne();
    await domain.models.Economic.collection.deleteOne({
      _id: new mongoose.Types.ObjectId('000000000000000000000009'),
    });
    await expect(seedDemo(env, auth, domain)).rejects.toThrow('inconsistent');
    await domain.models.Portfolio.deleteMany({});
    await auth.models.User.deleteMany({});
    await expect(auth.demoSession({ ip: 'test', userAgent: 'test' })).rejects.toMatchObject({
      status: 503,
    });
    expect(portfolio).not.toBeNull();
  });
});
