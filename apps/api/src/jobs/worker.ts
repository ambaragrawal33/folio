import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobRuntime } from './runtime.ts';
import { BullMQJobRunner } from './runner.ts';
try {
  const runtime = await jobRuntime(),
    runner = new BullMQJobRunner(runtime.jobs);
  await runner.start();
  await runtime.jobs.recover();
  const readyFile = join(tmpdir(), 'folio-worker-ready');
  let heartbeating = false;
  const heartbeat = async () => {
    if (heartbeating) return;
    heartbeating = true;
    try {
      const ready = await runtime.dependencies.probe();
      if (!ready.mongo || !ready.redis) throw new Error('unavailable');
      await runtime.jobs.recover();
      await writeFile(readyFile, String(Date.now()));
    } catch {
      await unlink(readyFile).catch(() => {});
      runtime.logger.warn('Local job worker waiting for infrastructure recovery');
    } finally {
      heartbeating = false;
    }
  };
  await heartbeat();
  const beat = setInterval(() => void heartbeat(), 10000);
  let scheduling = false;
  const schedule = async () => {
    if (scheduling || !runtime.env.LOCAL_JOB_SCHEDULES) return;
    scheduling = true;
    try {
      const minute = Math.floor(Date.now() / 300000),
        hour = Math.floor(Date.now() / 3600000);
      await runtime.jobs.operator('price-refresh', 'local_' + minute);
      await runtime.jobs.operator('eod-close-capture', 'local_' + hour);
      await runtime.jobs.operator('housekeeping', 'local_' + hour);
    } catch {
      runtime.logger.warn('Local scheduler unavailable; no provider fallback');
    } finally {
      scheduling = false;
    }
  };
  await schedule();
  const clock = setInterval(() => void schedule(), 300000);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(beat);
    clearInterval(clock);
    void (async () => {
      await runner.close();
      await runtime.dependencies.close();
      await unlink(readyFile).catch(() => {});
      process.exit(0);
    })();
    setTimeout(() => process.exit(1), 25000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  runtime.logger.info('Local job worker ready; production scheduling is not configured');
} catch {
  process.stderr.write(
    'Local job worker startup failed; check local configuration and services.\n',
  );
  process.exitCode = 1;
}
