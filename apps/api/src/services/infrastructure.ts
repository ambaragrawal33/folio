import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.ts';
export interface Dependencies {
  probe(): Promise<{ mongo: boolean; redis: boolean }>;
  close(): Promise<void>;
}
export async function connectInfrastructure(env: Env): Promise<Dependencies> {
  const mongo = mongoose.createConnection(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy: (attempt) => (attempt <= 10 ? Math.min(attempt * 250, 2000) : null),
    enableOfflineQueue: false,
  });
  // Intentionally avoid logging URI-bearing driver errors.
  redis.on('error', () => {});
  try {
    await Promise.all([mongo.asPromise(), redis.connect()]);
  } catch {
    await Promise.allSettled([mongo.close(), redis.quit()]);
    throw new Error('Local infrastructure connection failed');
  }
  return {
    async probe() {
      const results = await Promise.allSettled([
        mongo.db?.admin().command({ hello: 1 }),
        redis.ping(),
      ]);
      const hello = results[0];
      return {
        mongo:
          hello.status === 'fulfilled' &&
          hello.value?.setName === 'rs0' &&
          hello.value?.isWritablePrimary === true,
        redis: results[1].status === 'fulfilled' && results[1].value === 'PONG',
      };
    },
    async close() {
      await Promise.allSettled([mongo.close(), redis.quit()]);
    },
  };
}
