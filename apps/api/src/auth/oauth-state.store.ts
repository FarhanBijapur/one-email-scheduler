import { randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { AuthError } from './auth-error.js';

const STATE_PREFIX = 'oauth-state:';

export class OAuthStateStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async create(): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    const stored = await this.redis.set(`${STATE_PREFIX}${state}`, '1', 'EX', this.ttlSeconds, 'NX');

    if (stored !== 'OK') {
      throw new AuthError(503, 'Unable to start Google authentication');
    }

    return state;
  }

  async consume(state: string): Promise<boolean> {
    const key = `${STATE_PREFIX}${state}`;
    const value = await this.redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      key,
    );

    return value === '1';
  }
}
