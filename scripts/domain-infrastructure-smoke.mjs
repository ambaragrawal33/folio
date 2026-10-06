import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const mongoose = require('mongoose');
const mongo = await mongoose
  .createConnection('mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true', {
    dbName: 'folio_phase3_smoke_' + randomBytes(8).toString('hex'),
  })
  .asPromise();
try {
  const hello = await mongo.db.admin().command({ hello: 1 });
  assert(hello.isWritablePrimary && hello.setName === 'rs0');
  const c = mongo.collection('atomic_decimal');
  await c.insertOne({
    key: 'cost',
    value: mongoose.Types.Decimal128.fromString('123456789012345678901234567890.1234'),
  });
  await assert.rejects(
    mongo.transaction(async (session) => {
      await c.insertOne({ key: 'rollback' }, { session });
      throw new Error('intentional abort');
    }),
  );
  assert.equal(await c.countDocuments({ key: 'rollback' }), 0);
  await mongo.transaction(async (session) => {
    await c.insertOne({ key: 'commit' }, { session });
  });
  assert.equal(await c.countDocuments({ key: 'commit' }), 1);
  assert.equal(
    (await c.findOne({ key: 'cost' })).value.toString(),
    '123456789012345678901234567890.1234',
  );
  console.log(
    'Mongo writable replica set, multi-document commit/rollback, exact Decimal128 round trip PASS',
  );
} finally {
  await mongo.dropDatabase();
  await mongo.close();
}
const normal = 'http://127.0.0.1:5173';
const doc = await fetch(normal + '/api/openapi.json').then((r) => r.json());
const operations = Object.entries(doc.paths)
  .flatMap(([path, verbs]) => Object.keys(verbs).map((method) => method.toUpperCase() + ' ' + path))
  .filter((p) => p.includes('/api/v1/'));
assert.equal(operations.length, 30);
assert(
  operations.includes('GET /api/v1/portfolios/{portfolioId}/instruments/{instrumentId}/detail'),
);
assert(operations.includes('GET /api/v1/auth/local-fixture'));
for (const resource of ['/api/v1/portfolios', '/api/v1/instruments', '/api/v1/search?q=TCS']) {
  const r = await fetch(normal + resource);
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('cache-control'), 'no-store');
}
assert.equal((await fetch(normal + '/api/v1/auth/demo')).status, 200);
assert.equal((await fetch(normal + '/api/v1/auth/demo').then((r) => r.json())).enabled, false);
console.log(
  'OpenAPI 30 auth/demo/fixture/domain operations; financial APIs authenticated, no-store; normal demo disabled PASS',
);
if (process.env.FOLIO_E2E_DEMO === '1') {
  const base = 'http://127.0.0.1:5180';
  const r = await fetch(base + '/api/v1/auth/demo', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5180',
      'Content-Type': 'application/json',
      'X-Folio-CSRF': '1',
    },
    body: '{}',
  });
  assert.equal(r.status, 200);
  const session = await r.json();
  assert.equal(session.user.demoReadonly, true);
  const headers = { Authorization: 'Bearer ' + session.accessToken };
  const p = await fetch(base + '/api/v1/portfolios', { headers }).then((r) => r.json());
  const v = await fetch(base + '/api/v1/portfolios/' + p.portfolios[0].id + '/valuation', {
    headers,
  }).then((r) => r.json());
  assert.equal(v.totalValue, '215316');
  assert.equal(v.totalBaseCost, '186205.4');
  assert.equal(v.unrealizedBase, '29110.6');
  assert.equal(v.realizedBase, '536');
  assert.equal(v.dividendBase, '28');
  assert(v.holdings.every((h) => h.quote.fixture));
  const write = await fetch(base + '/api/v1/portfolios/default', {
    method: 'POST',
    headers: {
      ...headers,
      Origin: 'http://localhost:5180',
      'Content-Type': 'application/json',
      'X-Folio-CSRF': '1',
    },
    body: '{}',
  });
  assert.equal(write.status, 403);
  // Never emit session tokens, cookies or shared identity security-audit records.
  console.log(
    'Isolated public read-only demo: verified 5 positions/9 economics, hand totals 215316/186205.4/29110.6, realized536/income28, write403 PASS',
  );
}
