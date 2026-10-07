import { randomUUID } from 'node:crypto';
const base = 'http://127.0.0.1:5173';
async function post(path, body = {}) {
  return fetch(base + '/api/v1' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-Folio-CSRF': '1' },
    body: JSON.stringify(body),
  });
}
const first = await post('/auth/logout');
const alias = await post('/AUTH/Logout/');
const before = Number(first.headers.get('RateLimit-Remaining'));
const after = Number(alias.headers.get('RateLimit-Remaining'));
if (first.status !== 200 || alias.status !== 200 || after !== before - 1)
  throw new Error('Live route aliases do not share the IP limiter');
const email = 'alias-' + randomUUID() + '@example.test';
const paths = ['/auth/forgot-password', '/AUTH/FORGOT-PASSWORD/', '/Auth/Forgot-Password'];
for (let index = 0; index < 10; index++) {
  const response = await post(paths[index % paths.length], { email });
  if (response.status !== 200) throw new Error('Unexpected live account allowance');
}
const denied = await post('/AUTH/forgot-password/', { email: email.toUpperCase() });
if (denied.status !== 429) throw new Error('Live route aliases bypass the account limiter');
console.log(
  JSON.stringify({
    ipRemainingBefore: before,
    ipRemainingAfter: after,
    accountAttempts: 10,
    nextAliasStatus: denied.status,
  }),
);
console.log('Actual Docker API + Redis route-alias IP/account limits: PASS');
