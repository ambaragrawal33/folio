import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { JobRun } from '@folio/shared';
export class JobFailure extends Error {
  readonly code: NonNullable<JobRun['error']>;
  constructor(code: NonNullable<JobRun['error']>) {
    super(code);
    this.code = code;
  }
}
export class Lease {
  private readonly redis: Redis;
  private readonly key: string;
  readonly token = randomUUID();
  constructor(redis: Redis, key: string) {
    this.redis = redis;
    this.key = key;
  }
  async acquire(ttlMs: number) {
    return (await this.redis.set(this.key, this.token, 'PX', ttlMs, 'NX')) === 'OK';
  }
  async check(signal: AbortSignal) {
    if (signal.aborted) throw new JobFailure('TIMEOUT');
    if ((await this.redis.get(this.key)) !== this.token) throw new JobFailure('LOCK_LOST');
    if (signal.aborted) throw new JobFailure('TIMEOUT');
  }
  async release() {
    await this.redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
      1,
      this.key,
      this.token,
    );
  }
}
