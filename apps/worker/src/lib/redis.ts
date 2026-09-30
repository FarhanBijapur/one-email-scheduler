import type { AppConfig } from '@one/shared';
import { Redis } from 'ioredis';

export function createRedisClient(config: AppConfig): Redis {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy(times: number) {
      if (times > 3) {
        return null;
      }
      return 200;
    },
  });
}

export async function pingRedis(redis: Redis): Promise<boolean> {
  try {
    if (redis.status === 'wait' || redis.status === 'close' || redis.status === 'end') {
      await redis.connect();
    }
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}
