import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  mongo: {
    asPromise: vi.fn(),
    close: vi.fn(),
    db: {
      admin: () => ({
        command: vi.fn().mockResolvedValue({ setName: 'rs0', isWritablePrimary: true }),
      }),
    },
  },
  redis: { connect: vi.fn(), ping: vi.fn(), quit: vi.fn(), on: vi.fn() },
}));
vi.mock('mongoose', () => ({ default: { createConnection: () => mocks.mongo } }));
vi.mock('ioredis', () => ({
  Redis: class {
    constructor() {
      return mocks.redis;
    }
  },
}));
import { connectInfrastructure } from '../src/services/infrastructure';
import { parseEnv } from '../src/config/env';
const env = parseEnv({
  MONGODB_URI: 'mongodb://localhost/folio',
  REDIS_URL: 'redis://localhost',
  WEB_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.mongo.asPromise.mockResolvedValue(mocks.mongo);
  mocks.redis.connect.mockResolvedValue(undefined);
  mocks.redis.ping.mockResolvedValue('PONG');
  mocks.mongo.close.mockResolvedValue(undefined);
  mocks.redis.quit.mockResolvedValue(undefined);
});
describe('Infrastructure lifecycle', () => {
  it('probes both services and closes both on shutdown', async () => {
    const deps = await connectInfrastructure(env);
    expect(await deps.probe()).toEqual({ mongo: true, redis: true });
    mocks.redis.ping.mockRejectedValueOnce(new Error('offline'));
    expect(await deps.probe()).toEqual({ mongo: true, redis: false });
    await deps.close();
    expect(mocks.mongo.close).toHaveBeenCalledOnce();
    expect(mocks.redis.quit).toHaveBeenCalledOnce();
  });
  it('cleans up both resources on connect failure and redacts driver errors', async () => {
    mocks.mongo.asPromise.mockRejectedValueOnce(new Error('PRIVATE_VALUE'));
    await expect(connectInfrastructure(env)).rejects.toThrow(
      'Local infrastructure connection failed',
    );
    expect(mocks.mongo.close).toHaveBeenCalledOnce();
    expect(mocks.redis.quit).toHaveBeenCalledOnce();
  });
});
