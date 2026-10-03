import { parseEnv } from './config/env.ts';
import { createLogger } from './config/logger.ts';
import { connectInfrastructure } from './services/infrastructure.ts';
import { createApp } from './app.ts';
let logger: ReturnType<typeof createLogger> | undefined;
try {
  const env = parseEnv(process.env);
  logger = createLogger(env.LOG_LEVEL);
  const dependencies = await connectInfrastructure(env);
  const server = createApp(env, dependencies, logger).listen(env.PORT, '0.0.0.0', () =>
    logger?.info({ port: env.PORT }, 'Folio foundation started'),
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => {
      void dependencies.close().then(() => process.exit(0));
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
