import { parseEnv } from './config/env.ts';
import { createLogger } from './config/logger.ts';
import { connectInfrastructure } from './services/infrastructure.ts';
import { createApp } from './app.ts';
import { AuthService } from './services/auth.ts';
import { RedisCache } from './services/cache.ts';
import { PasswordAuthProvider } from './providers/password-auth.ts';
import { developmentEmail } from './providers/email.ts';
import { DomainService } from './services/domain.ts';
import { LiveMarketGateway } from './providers/adapters.ts';
import { RedisMarketCache } from './services/market-cache.ts';
import { DemoMarketGateway, seedDemo } from './services/demo.ts';
import { instrumentMaster } from './models/instrument-master.ts';
import { LocalFixtureMarketGateway } from './providers/local-fixture.ts';
let logger: ReturnType<typeof createLogger> | undefined;
try {
  const env = parseEnv(process.env);
  logger = createLogger(env.LOG_LEVEL);
  const dependencies = await connectInfrastructure(env);
  if (!dependencies.mongo || !dependencies.redis)
    throw new Error('Auth infrastructure unavailable');
  const service = new AuthService(
    dependencies.mongo,
    env,
    new PasswordAuthProvider(),
    developmentEmail(env),
  );
  await service.initialize();
  const market = env.DEMO_MODE
    ? new DemoMarketGateway(env)
    : env.LOCAL_FIXTURE_MODE
      ? new LocalFixtureMarketGateway(env)
      : new LiveMarketGateway(
          env,
          new RedisMarketCache(dependencies.redis, env.REFRESH_TOKEN_SECRET),
          instrumentMaster,
        );
  const domain = new DomainService(service, market);
  await domain.initialize(instrumentMaster);
  if (env.DEMO_MODE) await seedDemo(env, service, domain);
  const server = createApp(env, dependencies, logger, undefined, {
    service,
    cache: new RedisCache(dependencies.redis),
    domain,
  }).listen(
    env.PORT,
    env.LOCAL_FIXTURE_MODE && new URL(env.MONGODB_URI).hostname !== 'mongo'
      ? '127.0.0.1'
      : '0.0.0.0',
    () => logger?.info({ port: env.PORT }, 'Folio foundation started'),
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => {
      void (async () => {
        if (market instanceof LiveMarketGateway) await market.drain();
        await dependencies.close();
        process.exit(0);
      })();
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch {
  logger?.fatal('Foundation startup failed; check local infrastructure and environment names.');
  if (!logger) process.stderr.write('Foundation configuration is invalid; check .env.example.\n');
  process.exitCode = 1;
}
