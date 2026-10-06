import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Env } from '../config/env.ts';
import type { JobService } from './runner.ts';
import { JobName, OperatorJobRequest } from '@folio/shared';
import { HttpError } from '../utils/http-error.ts';
export const OperatorRequest = OperatorJobRequest;
export function internalJobsRouter(env: Env, jobs: JobService) {
  const router = express.Router();
  router.post('/:name', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!env.JOB_HTTP_SECRET || !env.LOCAL_JOBS_ENABLED || env.DEMO_MODE)
      throw new HttpError(503, 'JOBS_DISABLED', 'Local operator jobs are not enabled.');
    const name = JobName.safeParse(req.params['name']),
      body = OperatorRequest.safeParse(req.body);
    const stamp = req.get('X-Folio-Job-Time') ?? '',
      nonce = req.get('X-Folio-Job-Nonce') ?? '',
      signature = req.get('X-Folio-Job-Signature') ?? '';
    if (
      !req.is('application/json') ||
      !name.success ||
      !body.success ||
      !/^\d{13}$/.test(stamp) ||
      !z.uuid().safeParse(nonce).success ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      Math.abs(Date.now() - Number(stamp)) > 60000
    )
      throw new HttpError(403, 'JOB_AUTH_REJECTED', 'The job security check failed.');
    const expected = createHmac('sha256', env.JOB_HTTP_SECRET)
      .update(
        'POST\n/internal/jobs/' +
          name.data +
          '\n' +
          stamp +
          '\n' +
          nonce +
          '\n' +
          JSON.stringify(body.data),
      )
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new HttpError(403, 'JOB_AUTH_REJECTED', 'The job security check failed.');
    if (
      (await jobs.redis.set(jobs.namespace + ':jobs:nonce:' + nonce, 'used', 'EX', 120, 'NX')) !==
      'OK'
    )
      throw new HttpError(403, 'JOB_AUTH_REJECTED', 'The job security check failed.');
    const count = await jobs.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60); end; return n",
      1,
      jobs.namespace + ':jobs:operator-rate:' + name.data,
    );
    if (typeof count !== 'number' || count > 10)
      throw new HttpError(
        429,
        'JOB_RATE_LIMITED',
        'Please wait before requesting another operator refresh.',
      );
    res.status(202).json(await jobs.operator(name.data, body.data.key));
  });
  return router;
}
