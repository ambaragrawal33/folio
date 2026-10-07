import { jobRuntime } from './runtime.ts';
import { StatelessJobRunner } from './runner.ts';
import { randomUUID } from 'node:crypto';
let runtime: Awaited<ReturnType<typeof jobRuntime>> | undefined;
let runner: StatelessJobRunner | undefined;
try {
  runtime = await jobRuntime();
  runner = new StatelessJobRunner(runtime.jobs);
  console.log(
    JSON.stringify(
      await runtime.jobs.operator(process.argv[2] ?? '', process.argv[3] ?? randomUUID()),
    ),
  );
} catch {
  process.stderr.write('Local job failed; inspect sanitized job_runs state.\n');
  process.exitCode = 1;
} finally {
  await runner?.close();
  await runtime?.dependencies.close();
}
