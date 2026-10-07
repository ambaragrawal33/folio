import { parseEnv } from '../config/env.ts';
import { connectInfrastructure } from '../services/infrastructure.ts';
import { AuthService } from '../services/auth.ts';
import { DomainService } from '../services/domain.ts';
import { PasswordAuthProvider } from '../providers/password-auth.ts';
import { developmentEmail } from '../providers/email.ts';
import { LocalFixtureMarketGateway } from '../providers/local-fixture.ts';
import { LiveMarketGateway } from '../providers/adapters.ts';
import { RedisMarketCache } from '../services/market-cache.ts';
import { instrumentMaster, marketInstrumentMaster } from '../models/instrument-master.ts';
import { ObservedMarketGateway } from './observations.ts';
import { JobService } from './runner.ts';
import { createLogger } from '../config/logger.ts';
export async function jobRuntime() {
  const env = parseEnv(process.env);
  if (!env.LOCAL_JOBS_ENABLED || env.DEMO_MODE)
    throw new Error('Local jobs require explicit normal/fixture configuration.');
  const dependencies = await connectInfrastructure(env);
  try {
    if (!dependencies.mongo || !dependencies.redis)
      throw new Error('Local job storage is unavailable.');
    const logger = createLogger(env.LOG_LEVEL);
    const auth = new AuthService(
      dependencies.mongo,
      env,
      new PasswordAuthProvider(),
      developmentEmail(env),
    );
    await auth.initialize();
    const upstream = env.LOCAL_FIXTURE_MODE
      ? new LocalFixtureMarketGateway(env)
      : new LiveMarketGateway(
          env,
          new RedisMarketCache(dependencies.redis, env.REFRESH_TOKEN_SECRET),
          marketInstrumentMaster,
        );
    const market = new ObservedMarketGateway(dependencies.mongo, upstream, env.LOCAL_FIXTURE_MODE);
    const domain = new DomainService(auth, market);
    await domain.initialize(instrumentMaster);
    const jobs = new JobService(env, domain, market, dependencies.redis, {
      report: (value) => logger.info(value, 'Local job attempt'),
    });
    await jobs.initialize();
    return { env, dependencies, logger, jobs, domain, upstream };
  } catch {
    await dependencies.close();
    throw new Error('Local job initialization failed.');
  }
}
