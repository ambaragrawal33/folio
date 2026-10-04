import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Redis } = require('ioredis');
const mongoose = require('mongoose');
const first = new Redis('redis://127.0.0.1:6379'),
  second = new Redis('redis://127.0.0.1:6379');
const key = 'folio:phase2-smoke:' + randomBytes(12).toString('hex');
const script =
  "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n";
try {
  const counts = await Promise.all(
    Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).eval(script, 1, key, 30)),
  );
  assert.deepEqual(
    counts.toSorted((a, b) => a - b),
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  assert((await first.ttl(key)) > 0);
  console.log(
    'Redis shared atomic limiter: 20 concurrent increments from 2 independent clients; TTL set PASS',
  );
} finally {
  await first.del(key);
  await Promise.all([first.quit(), second.quit()]);
}
const base = 'http://127.0.0.1:5173';
const document = await fetch(base + '/api/openapi.json').then((r) => r.json());
const methods = Object.entries(document.paths)
  .flatMap(([path, ops]) => Object.keys(ops).map((method) => method.toUpperCase() + ' ' + path))
  .filter((item) => item.includes('/api/v1/'));
assert(methods.length >= 13);
for (const operation of [
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'GET /api/v1/me',
  'PATCH /api/v1/me',
  'DELETE /api/v1/me',
  'POST /api/v1/me/export',
])
  assert(methods.includes(operation), operation);
console.log(
  'OpenAPI: required Phase 2 auth/account operations preserved; ' +
    methods.length +
    ' total operations PASS',
);
const csrf = await fetch(base + '/api/v1/auth/logout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
assert.equal(csrf.status, 403);
assert.equal((await csrf.json()).error.code, 'CSRF_REJECTED');
console.log('Actual API rejects mutation without Origin/custom CSRF header: 403 PASS');
const unauthorized = await fetch(base + '/api/v1/me');
assert.equal(unauthorized.status, 401);
assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
console.log('Actual API protects /me and disables caching: 401 PASS');
console.log('Phase 2 auth infrastructure smoke PASS');
const mongo = await mongoose
  .createConnection('mongodb://127.0.0.1:27017/folio?replicaSet=rs0&directConnection=true')
  .asPromise();
try {
  for (const name of ['users', 'refresh_families', 'refresh_tokens', 'auth_tokens', 'audit_logs']) {
    const indexes = await mongo.collection(name).indexes();
    assert(indexes.length > 1);
    console.log(
      name +
        ' indexes: ' +
        JSON.stringify(
          indexes.map(({ key, unique, expireAfterSeconds }) => ({
            key,
            unique,
            expireAfterSeconds,
          })),
        ),
    );
  }
  const plan = await mongo
    .collection('users')
    .find({ email: 'nonexistent-smoke@example.test' })
    .explain('executionStats');
  assert(plan.executionStats.totalDocsExamined === 0);
  console.log('Normalized email lookup: indexed, 0 documents scanned for missing email PASS');
} finally {
  await mongo.close();
}
