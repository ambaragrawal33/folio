// Bounded read-only integration probe. Never requests unlicensed Yahoo data or reads a Demo key.
import assert from 'node:assert/strict';
import { LiveMarketGateway } from '../apps/api/src/providers/adapters.ts';
import { parseEnv } from '../apps/api/src/config/env.ts';
import { instrumentMaster } from '../apps/api/src/models/instrument-master.ts';
const values = new Map();
const locks = new Map();
const cache = {
  async get(key) {
    return values.get(key) ?? null;
  },
  async set(key, value) {
    values.set(key, value);
  },
  async acquire(key, token) {
    if (locks.has(key)) return false;
    locks.set(key, token);
    return true;
  },
  async release(key, token) {
    if (locks.get(key) === token) locks.delete(key);
  },
  async increment() {
    throw new Error('Unexpected keyed provider call');
  },
};
const env = parseEnv({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost/folio_provider_smoke',
  REDIS_URL: 'redis://localhost:6379',
  WEB_ORIGIN: 'http://localhost:5173',
});
const market = new LiveMarketGateway(env, cache, instrumentMaster);
const weekend = await market.historicalFx('USD', 'INR', '2024-01-06');
assert(weekend, 'Live ECB weekend request failed; no fabricated fallback is allowed');
assert.equal(weekend.source, 'Frankfurter/ECB');
assert(weekend.rateDate <= '2024-01-06');
const current = await market.rates(['USD', 'INR'], 'INR');
assert(current.USD, 'Live current ECB request failed');
assert.equal(current.INR.rate, '1');
assert.equal(current.USD.source, 'Frankfurter/ECB');
const quotes = await market.quotes(instrumentMaster);
assert.deepEqual(quotes, []);
const history = await market.history(instrumentMaster[0]);
assert.equal(history.status, 'unavailable');
assert.deepEqual(history.points, []);
await market.drain();
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      liveEcb: { weekend, current: current.USD },
      noSecretsRead: true,
      yahoo: 'No entitlement: no Yahoo requests, quotes/history unavailable',
      coinGecko: 'No configured Demo key: no requests/quotes; keyed smoke remains blocked',
      cache: 'Isolated in-memory probe cache; shared Redis semantics tested separately',
      publicDeployment: false,
    },
    null,
    2,
  ),
);
