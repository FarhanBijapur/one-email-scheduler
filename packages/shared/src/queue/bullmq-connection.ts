import Redis from 'ioredis';
import type { AppConfig } from '../config.js';

export type BullMQConnectionRole = 'producer' | 'consumer';

export function createBullMQConnection(config: AppConfig, role: BullMQConnectionRole): Redis {
  const isConsumer = role === 'consumer';

  return new Redis(config.REDIS_URL, {
    // BullMQ workers require unlimited command retries; API-side producers fail promptly.
    maxRetriesPerRequest: isConsumer ? null : 1,
    lazyConnect: true,
    enableOfflineQueue: isConsumer,
    retryStrategy(times) {
      if (!isConsumer && times > 3) {
        return null;
      }
      return Math.min(Math.max(times * 200, 200), 2_000);
    },
  });
}
