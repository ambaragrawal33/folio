import { afterAll, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { parseEnv } from '../src/config/env';
import { createLogger } from '../src/config/logger';
import { AuthService } from '../src/services/auth';
import { MemoryCache, RedisCache } from '../src/services/cache';
import { PasswordAuthProvider } from '../src/providers/password-auth';
import { authContracts, PublicUser } from '@folio/shared';
import type { MailMessage } from '../src/providers/email';
import type { CacheStore } from '../src/services/cache';
import type { Express } from 'express';
let repl: MongoMemoryReplSet | undefined,
  connection: mongoose.Connection,
  service: AuthService,
  app: Express,
  now: Date;
const mail: MailMessage[] = [];

const password = 'A correct long test passphrase!';
const env = parseEnv({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost/folio_auth_test',
  REDIS_URL: 'redis://localhost',
  WEB_ORIGIN: 'http://localhost:5173',
});
const secret = () => randomBytes(32).toString('base64url');
beforeAll(async () => {
  const supplied = process.env['FOLIO_TEST_MONGODB_URI'];
  if (!supplied)
    repl = await MongoMemoryReplSet.create({
      binary: { version: '8.2.12' },
      replSet: { count: 1 },
    });
  const uri = supplied ?? repl!.getUri();
  connection = await mongoose
    .createConnection(uri, { dbName: 'folio_auth_test_' + randomBytes(8).toString('hex') })
    .asPromise();
}, 180000);
beforeEach(async () => {
  now = new Date();
  mail.length = 0;
  service = new AuthService(
    connection,
    env,
    new PasswordAuthProvider(),
    {
      async send(message) {
        mail.push(message);
      },
    },
    () => now,
  );
  await service.initialize();
  await Promise.all(Object.values(service.models).map((m) => m.deleteMany({})));
  app = makeApp(new MemoryCache());
});
function makeApp(cache: CacheStore) {
  return createApp(
    env,
    { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
    createLogger('silent'),
    undefined,
    { service, cache },
  );
}
afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
  await repl?.stop();
});
function post(path: string, data: Record<string, unknown> = {}, cookie?: string, token?: string) {
  const test = request(app)
    .post('/api/v1' + path)
    .set('Origin', env.WEB_ORIGIN)
    .set('X-Folio-CSRF', '1');
  if (cookie) test.set('Cookie', cookie);
  if (token) test.set('Authorization', 'Bearer ' + token);
  return test.send(data);
}
function lastToken(purpose: 'verify' | 'reset') {
  const item = mail.filter((m) => m.purpose === purpose).at(-1)!;
  return new URLSearchParams(new URL(item.url).hash.slice(1)).get('token')!;
}
function cookie(response: { headers: Record<string, unknown> }) {
  return String((response.headers['set-cookie'] as string[])[0]).split(';')[0]!;
}
async function account(email = 'alice@example.test') {
  expect((await post('/auth/register', { name: 'Alice', email, password })).status).toBe(200);
  expect((await post('/auth/verify-email', { token: lastToken('verify') })).status).toBe(200);
  const login = await post('/auth/login', { email, password });
  expect(login.status).toBe(200);
  return {
    email,
    token: login.body.accessToken as string,
    cookie: cookie(login),
    id: login.body.user.id as string,
  };
}
describe('P0 auth and owned account integration', () => {
  it('rejects tampered bearer credentials and duplicate refresh cookies', async () => {
    const a = await account();
    const corrupt = a.token.slice(0, -8) + 'aaaaaaaa';
    expect(
      (
        await request(app)
          .get('/api/v1/me')
          .set('Authorization', 'Bearer ' + corrupt)
      ).status,
    ).toBe(401);
    expect((await post('/auth/refresh', {}, a.cookie + '; ' + a.cookie)).status).toBe(401);
  });
  it('marks refresh cookies Secure in the production policy while local HTTP stays explicit', async () => {
    await account();
    app = createApp(
      { ...env, NODE_ENV: 'production' },
      { probe: async () => ({ mongo: true, redis: true }), close: async () => {} },
      createLogger('silent'),
      undefined,
      { service, cache: new MemoryCache() },
    );
    const login = await post('/auth/login', { email: 'alice@example.test', password });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie'][0]).toContain('; Secure');
  });
  it('records unavailable email delivery without exposing account existence or claiming delivery', async () => {
    service = new AuthService(
      connection,
      env,
      new PasswordAuthProvider(),
      {
        async send() {
          throw new Error('Transport down');
        },
      },
      () => now,
    );
    await service.initialize();
    app = makeApp(new MemoryCache());
    const register = await post('/auth/register', {
      name: 'Delivery check',
      email: 'delivery@example.test',
      password,
    });
    expect(register.status).toBe(200);
    expect(register.body.message).toContain('If this address');
    expect(
      await service.models.Audit.countDocuments({ action: 'email.verify.delivery_failed' }),
    ).toBe(1);
  });
  it('expires explicit in-memory test limits rather than retaining counts indefinitely', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const cache = new MemoryCache();
      expect(await cache.increment('test', 1)).toBe(1);
      expect(await cache.increment('test', 1)).toBe(2);
      vi.setSystemTime(Date.now() + 1001);
      expect(await cache.increment('test', 1)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('registers, hashes, verifies, logs in and keeps response/storage boundaries safe', async () => {
    await post('/auth/register', { name: 'Alice', email: 'ALICE@example.test', password });
    const verification = lastToken('verify');
    const user = await service.models.User.findOne({ email: 'alice@example.test' }).select(
      '+passwordHash',
    );
    expect(user?.passwordHash).toContain('$argon2id$');
    expect(user?.passwordHash).not.toContain(password);
    expect((await post('/auth/login', { email: 'alice@example.test', password })).status).toBe(403);
    expect((await post('/auth/verify-email', { token: verification })).status).toBe(200);
    expect((await post('/auth/verify-email', { token: verification })).status).toBe(400);
    const login = await post('/auth/login', { email: 'alice@example.test', password });
    expect(login.status).toBe(200);
    expect(PublicUser.safeParse(login.body.user).success).toBe(true);
    expect(login.body.expiresIn).toBe(900);
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Strict');
    const stored = JSON.stringify(await service.models.Refresh.find().lean());
    expect(stored).not.toContain(cookie(login).split('=')[1]);
    expect(JSON.stringify(login.body)).not.toContain('passwordHash');
    expect(JSON.stringify(await service.models.ActionToken.find().lean())).not.toContain(
      verification,
    );
    expect(JSON.stringify(await service.models.Audit.find().lean())).not.toContain(password);
  });
  it('generic email responses do not enumerate accounts or overwrite existing passwords', async () => {
    const a = await account();
    const duplicate = await post('/auth/register', {
      name: 'Attacker',
      email: a.email,
      password: 'A replacement evil password',
    });
    const absent = await post('/auth/register', {
      name: 'Other',
      email: 'other@example.test',
      password,
    });
    expect(duplicate.body).toEqual(absent.body);
    expect((await post('/auth/login', { email: a.email, password })).status).toBe(200);
    expect((await post('/auth/forgot-password', { email: a.email })).body).toEqual(
      (await post('/auth/forgot-password', { email: 'absent@example.test' })).body,
    );
  });
  it('resend invalidates prior links; purpose separation and expiry are enforced', async () => {
    await post('/auth/register', { name: 'Alice', email: 'alice@example.test', password });
    const first = lastToken('verify');
    await post('/auth/resend-verification', { email: 'alice@example.test' });
    const second = lastToken('verify');
    expect((await post('/auth/verify-email', { token: first })).status).toBe(400);
    expect((await post('/auth/reset-password', { token: second, password })).status).toBe(400);
    now = new Date(now.getTime() + 86400001);
    expect((await post('/auth/verify-email', { token: second })).status).toBe(400);
  });
  it('rotates and revokes the complete family on replay, including issued access tokens', async () => {
    const a = await account();
    const rotated = await post('/auth/refresh', {}, a.cookie);
    expect(rotated.status).toBe(200);
    expect(cookie(rotated)).not.toBe(a.cookie);
    expect((await post('/auth/refresh', {}, a.cookie)).status).toBe(401);
    expect((await post('/auth/refresh', {}, cookie(rotated))).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/me')
          .set('Authorization', 'Bearer ' + rotated.body.accessToken)
      ).status,
    ).toBe(401);
    expect(await service.models.Audit.countDocuments({ action: 'auth.refresh_reuse' })).toBe(1);
  });
  it('concurrent refresh consumes once and fails closed with durable family revocation', async () => {
    const a = await account();
    const responses = await Promise.all([
      post('/auth/refresh', {}, a.cookie),
      post('/auth/refresh', {}, a.cookie),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(
      (
        await request(app)
          .get('/api/v1/me')
          .set(
            'Authorization',
            'Bearer ' + responses.find((r) => r.status === 200)!.body.accessToken,
          )
      ).status,
    ).toBe(401);
  });
  it('access expiry and absolute refresh expiry are checked without relying on Mongo TTL', async () => {
    const a = await account();
    now = new Date(now.getTime() + 901000);
    expect(
      (
        await request(app)
          .get('/api/v1/me')
          .set('Authorization', 'Bearer ' + a.token)
      ).status,
    ).toBe(401);
    expect((await post('/auth/refresh', {}, a.cookie)).status).toBe(200);
    now = new Date(now.getTime() + 31 * 86400000);
    expect((await post('/auth/refresh', {}, a.cookie)).status).toBe(401);
  });
  it('logout is idempotent and immediately invalidates the session', async () => {
    const a = await account();
    expect((await post('/auth/logout', {}, a.cookie)).status).toBe(200);
    expect((await post('/auth/logout', {}, a.cookie)).status).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/me')
          .set('Authorization', 'Bearer ' + a.token)
      ).status,
    ).toBe(401);
  });
  it('reset is single-use, expires after 30 minutes and revokes all existing sessions', async () => {
    const a = await account();
    await post('/auth/forgot-password', { email: a.email });
    const expired = lastToken('reset');
    now = new Date(now.getTime() + 1800001);
    expect((await post('/auth/reset-password', { token: expired, password })).status).toBe(400);
    await post('/auth/forgot-password', { email: a.email });
    const token = lastToken('reset');
    const replacement = 'New correct password with length!';
    expect((await post('/auth/reset-password', { token, password: replacement })).status).toBe(200);
    expect((await post('/auth/reset-password', { token, password: replacement })).status).toBe(400);
    expect((await post('/auth/refresh', {}, a.cookie)).status).toBe(401);
    expect((await post('/auth/login', { email: a.email, password })).status).toBe(401);
    expect((await post('/auth/login', { email: a.email, password: replacement })).status).toBe(200);
  });
  it('enforces CSRF origin/header, strict fields and NoSQL/identity injection rejection', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'alice@example.test', password })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', 'https://evil.test')
          .set('X-Folio-CSRF', '1')
          .send({ email: 'alice@example.test', password })
      ).status,
    ).toBe(403);
    expect((await post('/auth/login', { email: { $ne: null }, password })).status).toBe(400);
    expect(
      (
        await post('/auth/register', {
          name: 'Alice',
          email: 'alice@example.test',
          password,
          role: 'admin',
        })
      ).status,
    ).toBe(400);
    expect((await post('/auth/refresh', { userId: secret() })).status).toBe(400);
  });
  it('progressive lockout applies to correct credentials after repeated failures and recovers', async () => {
    const a = await account();
    for (let i = 0; i < 5; i++)
      expect((await post('/auth/login', { email: a.email, password: 'wrong' })).status).toBe(401);
    expect((await post('/auth/login', { email: a.email, password })).status).toBe(401);
    now = new Date(now.getTime() + 31000);
    expect((await post('/auth/login', { email: a.email, password })).status).toBe(200);
  });
  it('account identity is server-bound for read/update/export/delete; another account is unaffected', async () => {
    const alice = await account(),
      bob = await account('bob@example.test');
    expect(
      (
        await request(app)
          .get('/api/v1/me')
          .set('Authorization', 'Bearer ' + alice.token)
      ).body.user.id,
    ).toBe(alice.id);
    expect(
      (
        await request(app)
          .get('/api/v1/me?userId=' + bob.id)
          .set('Authorization', 'Bearer ' + alice.token)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch('/api/v1/me')
          .set('Origin', env.WEB_ORIGIN)
          .set('X-Folio-CSRF', '1')
          .set('Authorization', 'Bearer ' + alice.token)
          .send({ name: 'Changed', userId: bob.id })
      ).status,
    ).toBe(400);
    const saved = await request(app)
      .patch('/api/v1/me')
      .set('Origin', env.WEB_ORIGIN)
      .set('X-Folio-CSRF', '1')
      .set('Authorization', 'Bearer ' + alice.token)
      .send({
        name: '=formula',
        timezone: 'UTC',
        preferences: { theme: 'light', numberFormat: 'international' },
      });
    expect(saved.status).toBe(200);
    const exported = await post('/me/export', { format: 'json' }, undefined, alice.token);
    expect(exported.status).toBe(200);
    expect(exported.body.user.id).toBe(alice.id);
    expect(JSON.stringify(exported.body)).not.toContain(bob.email);
    expect(JSON.stringify(exported.body)).not.toMatch(/passwordHash|tokenHash|accessToken/);
    const csv = await post('/me/export', { format: 'csv' }, undefined, alice.token);
    expect(csv.text).not.toContain('"=formula"');
    const deletion = () =>
      request(app)
        .delete('/api/v1/me')
        .set('Origin', env.WEB_ORIGIN)
        .set('X-Folio-CSRF', '1')
        .set('Authorization', 'Bearer ' + alice.token);
    expect(
      (await deletion().send({ password, confirmation: 'DELETE', userId: bob.id })).status,
    ).toBe(400);
    expect((await deletion().send({ password: 'wrong', confirmation: 'DELETE' })).status).toBe(400);
    expect((await deletion().send({ password, confirmation: 'DELETE' })).status).toBe(200);
    expect(await service.models.User.findById(alice.id)).toBeNull();
    expect(await service.models.User.findById(bob.id)).not.toBeNull();
    expect(await service.models.Refresh.countDocuments({ userId: alice.id })).toBe(0);
    expect(await service.models.Audit.countDocuments({ userId: alice.id })).toBe(0);
  });
  it('change-password requires the current password and invalidates old access/refresh credentials', async () => {
    const a = await account();
    expect(
      (
        await post(
          '/auth/change-password',
          { currentPassword: 'wrong', password },
          undefined,
          a.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          '/auth/change-password',
          { currentPassword: password, password: 'Another valid password now!' },
          undefined,
          a.token,
        )
      ).status,
    ).toBe(200);
    expect((await post('/auth/refresh', {}, a.cookie)).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/me')
          .set('Authorization', 'Bearer ' + a.token)
      ).status,
    ).toBe(401);
  });
  it('distributed limiter failures fail closed and limits expose retry headers', async () => {
    app = makeApp({
      increment: async () => {
        throw new Error('redis offline');
      },
    });
    expect((await post('/auth/login', { email: 'a@example.test', password })).status).toBe(503);
    app = makeApp({ increment: async () => 21 });
    const limited = await post('/auth/login', { email: 'a@example.test', password });
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    const redis = { eval: vi.fn().mockResolvedValue(1) };
    const cache = new RedisCache(redis as unknown as ConstructorParameters<typeof RedisCache>[0]);
    expect(await cache.increment('key', 60)).toBe(1);
    expect(redis.eval.mock.calls[0]?.[0]).toContain('EXPIRE');
    redis.eval.mockResolvedValueOnce('bad');
    await expect(cache.increment('key', 60)).rejects.toThrow();
  });
  it('every implemented auth/account endpoint has an OpenAPI contract', async () => {
    const doc = (await request(app).get('/api/openapi.json')).body;
    for (const contract of authContracts)
      expect(doc.paths[contract.path][contract.method]).toBeDefined();
    expect(doc.paths['/api/v1/auth/2fa/enroll']).toBeUndefined();
    expect(doc.paths['/api/v1/auth/sessions']).toBeUndefined();
  });
});
