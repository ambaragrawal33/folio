import assert from 'node:assert/strict';
import net from 'node:net';
const api = process.env.API_URL ?? 'http://127.0.0.1:3000';
const web = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
for (const [url, expected] of [
  [api + '/api/health', 200],
  [api + '/api/ready', 200],
  [web + '/api/ready', 200],
  [api + '/api/openapi.json', 200],
  [api + '/docs/', 200],
  [web + '/dev/design-system', 200],
  ['http://127.0.0.1:8025/api/v2/messages', 200],
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, expected, url);
  console.log(url + ' ' + response.status);
  if (url.endsWith('/api/ready')) {
    const data = await response.json();
    assert.deepEqual(data, { status: 'ready', dependencies: { mongo: true, redis: true } });
    console.log(JSON.stringify(data));
  }
}
const smtp = await new Promise((resolve, reject) => {
  const socket = net.connect(1025, '127.0.0.1');
  socket.setTimeout(5000, () => {
    socket.destroy();
    reject(new Error('SMTP timed out'));
  });
  socket.once('data', (chunk) => {
    const banner = chunk.toString();
    socket.end('QUIT\r\n');
    resolve(banner.trim());
  });
  socket.once('error', reject);
});
assert.match(smtp, /^220/);
console.log('Local MailHog SMTP: ' + smtp);
console.log('Foundation stack smoke PASS');
