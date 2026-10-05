import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Redis } = require('ioredis');
const cache = new Redis('redis://127.0.0.1:6379/1'),
  normalCache = new Redis('redis://127.0.0.1:6379/0');
const key = 'folio:local-fixture:verification:' + randomUUID();
try {
  await cache.set(key, 'isolated-local-probe', 'EX', 30);
  assert.equal(await cache.get(key), 'isolated-local-probe');
  assert.equal(await normalCache.get(key), null);
  console.log('Actual local Redis DB 1 fixture state is absent from DB 0 PASS');
} finally {
  await cache.del(key);
  await Promise.all([cache.quit(), normalCache.quit()]);
}
for (const [port, enabled] of [
  [3000, false],
  [3010, false],
  [3020, true],
]) {
  const origin = 'http://127.0.0.1:' + port;
  const ready = await fetch(origin + '/api/ready');
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), {
    status: 'ready',
    dependencies: { mongo: true, redis: true },
  });
  const mode = await fetch(origin + '/api/v1/auth/local-fixture');
  assert.equal(mode.status, 200);
  assert.deepEqual(await mode.json(), { enabled });
  assert.equal(mode.headers.get('Cache-Control'), 'no-store');
}
assert.equal((await fetch('http://127.0.0.1:5190/api/ready')).status, 200);
const denied = await fetch('http://127.0.0.1:3020/api/v1/portfolios');
assert.equal(denied.status, 401);
assert.equal(denied.headers.get('Cache-Control'), 'no-store');
console.log(
  'Normal/demo/fixture health, authoritative mode flags, proxy and unauthenticated ownership boundary PASS',
);
const config = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/folio_local_fixture?replicaSet=rs0&directConnection=true',
  REDIS_URL: 'redis://127.0.0.1:6379/1',
  WEB_ORIGIN: 'http://localhost:5190',
  LOCAL_FIXTURE_MODE: 'true',
  DEMO_MODE: 'false',
  CACHE_NAMESPACE: 'folio:local-fixture',
};
for (const [name, change] of [
  ['missing explicit opt-in', { LOCAL_FIXTURE_MODE: 'false' }],
  ['production', { NODE_ENV: 'production' }],
  ['normal database', { MONGODB_URI: 'mongodb://127.0.0.1:27017/folio' }],
  ['demo database', { MONGODB_URI: 'mongodb://127.0.0.1:27017/folio_demo' }],
  ['normal cache', { REDIS_URL: 'redis://127.0.0.1:6379/0' }],
  ['remote web origin', { WEB_ORIGIN: 'https://public.example' }],
]) {
  const result = spawnSync(process.execPath, ['apps/api/src/index.ts'], {
    env: { ...process.env, ...config, ...change },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 1, name);
  assert.match(result.stderr, /Foundation configuration is invalid/, name);
  console.log('Actual API process rejected ' + name + ' before infrastructure initialization PASS');
}
