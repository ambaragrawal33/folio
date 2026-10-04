// Local artifact check only. No hosting account, public port, production secrets or production deployment.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const image = process.env.FOLIO_RELEASE_IMAGE ?? 'folio-api-release:phase3';
const name = 'folio-phase3-release-smoke';
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
const config = [
  '-e',
  'MONGODB_URI=mongodb://mongo:27017/folio_demo?replicaSet=rs0&directConnection=true',
  '-e',
  'REDIS_URL=redis://redis:6379',
  '-e',
  'WEB_ORIGIN=http://localhost:5390',
  '-e',
  'DEMO_MODE=true',
  '-e',
  'CACHE_NAMESPACE=folio:demo',
  '-e',
  'LOG_LEVEL=silent',
];
const user = docker(['image', 'inspect', image, '--format', '{{.Config.User}}']);
assert.equal(user.status, 0);
assert.equal(user.stdout.trim(), 'node');
const gated = docker(['run', '--rm', ...config, image]);
assert.notEqual(gated.status, 0);
assert(
  (gated.stdout + gated.stderr).includes(
    'Foundation configuration is invalid; check .env.example.',
  ),
);
console.log('Non-root release image; NODE_ENV=production rejects unresolved O02/O04/O06 PASS');
const start = docker([
  'run',
  '-d',
  '--rm',
  '--name',
  name,
  '--network',
  'folio_default',
  '-p',
  '127.0.0.1:3020:3000',
  '-e',
  'NODE_ENV=test',
  ...config,
  image,
]);
assert.equal(start.status, 0, start.stderr);
try {
  const base = 'http://127.0.0.1:3020';
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    ready = await fetch(base + '/api/ready')
      .then((r) => r.ok)
      .catch(() => false);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready, 'Compiled release API failed local readiness');
  const r = await fetch(base + '/api/v1/auth/demo', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5390',
      'Content-Type': 'application/json',
      'X-Folio-CSRF': '1',
    },
    body: '{}',
  });
  assert.equal(r.status, 200);
  const session = await r.json();
  assert.equal(session.user.demoReadonly, true);
  const headers = { Authorization: 'Bearer ' + session.accessToken };
  const portfolios = await fetch(base + '/api/v1/portfolios', { headers }).then((r) => r.json());
  const id = portfolios.portfolios[0].id;
  const valuation = await fetch(base + '/api/v1/portfolios/' + id + '/valuation', { headers }).then(
    (r) => r.json(),
  );
  assert.equal(valuation.totalValue, '215316');
  const denied = await fetch(base + '/api/v1/portfolios/' + id + '/ledger', {
    method: 'POST',
    headers: {
      ...headers,
      Origin: 'http://localhost:5390',
      'Content-Type': 'application/json',
      'X-Folio-CSRF': '1',
    },
    body: '{}',
  });
  assert.equal(denied.status, 403);
  console.log(
    'NODE_ENV=test compiled artifact: Mongo/Redis readiness, real read-only demo session, exact total215316, write403 PASS; public HTTPS/proxy/email/backups NOT VERIFIED',
  );
} finally {
  const stop = docker(['stop', name]);
  assert.equal(stop.status, 0, stop.stderr);
}
