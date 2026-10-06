// Deliberately crashable test worker. Never started by application/Compose commands.
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { parseEnv } from '../../src/config/env.ts';
import { AuthService } from '../../src/services/auth.ts';
import { DomainService } from '../../src/services/domain.ts';
import { PasswordAuthProvider } from '../../src/providers/password-auth.ts';
import { LocalFixtureMarketGateway } from '../../src/providers/local-fixture.ts';
import { instrumentMaster } from '../../src/models/instrument-master.ts';
import { ObservedMarketGateway } from '../../src/jobs/observations.ts';
import { JobService, BullMQJobRunner } from '../../src/jobs/runner.ts';
const namespace = process.env['FOLIO_JOB_NAMESPACE'] ?? '';
if (process.env['NODE_ENV'] !== 'test' || !/^[a-f0-9]{16}$/.test(namespace) || !process.send)
  throw new Error('Isolated crash worker is test-only');
const database = 'folio_local_fixture_test_' + namespace;
const env = parseEnv({
  NODE_ENV: 'test',
  LOCAL_FIXTURE_MODE: 'true',
  LOCAL_JOBS_ENABLED: 'true',
  CACHE_NAMESPACE: 'folio:local-fixture',
  MONGODB_URI: 'mongodb://127.0.0.1/' + database,
  REDIS_URL: 'redis://127.0.0.1:6379/1',
  WEB_ORIGIN: 'http://localhost:5190',
});
const connection = await mongoose
  .createConnection(
    process.env['FOLIO_TEST_MONGODB_URI'] ??
      'mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=rs0',
    { dbName: database, serverSelectionTimeoutMS: 2000 },
  )
  .asPromise();
const redis = new Redis(env.REDIS_URL);
redis.on('error', () => {});
const auth = new AuthService(connection, env, new PasswordAuthProvider(), { send: async () => {} });
const source = new LocalFixtureMarketGateway(env);
const market = new ObservedMarketGateway(
  connection,
  {
    quotes: source.quotes.bind(source),
    rates: source.rates.bind(source),
    historicalFx: source.historicalFx.bind(source),
    history: source.history.bind(source),
    capability: source.capability.bind(source),
    refreshQuotes: async () => {
      process.send?.('provider-running');
      return new Promise(() => {});
    },
  },
  true,
);
const domain = new DomainService(auth, market);
await domain.initialize(instrumentMaster);
const jobs = new JobService(env, domain, market, redis, {
  isolatedTestNamespace: namespace,
  timeoutMs: 800,
  leaseMs: 1200,
});
const runner = new BullMQJobRunner(jobs);
await runner.start({ lockDuration: 1000, stalledInterval: 1000 });
process.send('ready');
