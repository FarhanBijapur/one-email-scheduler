import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { AuthError } from './auth-error.js';

const STATE_PREFIX = 'slack-oauth-state:';

export class SlackOAuthStateStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async create(userId: string): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    const stored = await this.redis.set(`${STATE_PREFIX}${state}`, userId, 'EX', this.ttlSeconds, 'NX');

    if (stored !== 'OK') {
      throw new AuthError(503, 'Unable to start Slack connection');
    }

    return state;
  }

  async consume(state: string): Promise<string | null> {
    if (state.length < 40 || state.length > 128) {
      return null;
    }

    const key = `${STATE_PREFIX}${state}`;
    const value = await this.redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      key,
    );

    return typeof value === 'string' ? value : null;
  }
}
