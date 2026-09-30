import type { Redis } from 'ioredis';

const KEY_PREFIX = 'one:email-rate:v1';
export type SendSlotReservationRequest = {
  userId: string;
  minimumGapMilliseconds: number;
  hourlyLimit: number;
  now?: Date;
};

export type SendSlotReservation = {
  allowed: boolean;
  allowedAt: Date;
  rescheduledForHourlyCap: boolean;
};

export class EmailRateLimitError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmailRateLimitError';
  }
}

/**
 * Reserves per-user sending capacity. The assignment defines tenant/sender
 * limits through EmailBatch settings; no global limiter is configured.
 */
export class EmailRateLimitService {
  constructor(private readonly redis: Redis) {}

  async reserveSendSlot(request: SendSlotReservationRequest): Promise<SendSlotReservation> {
    validateRequest(request);

    const now = request.now?.getTime() ?? Date.now();
    const keys = rateLimitKeys(request.userId);

    try {
      const response = await this.redis.eval(
        RESERVE_SEND_SLOT_LUA,
        1,
        keys.nextSlot,
        keys.hourlyPrefix,
        now,
        request.minimumGapMilliseconds,
        request.hourlyLimit,
      );
      const { allowedAt, rescheduledForHourlyCap } = parseReservation(response);

      return {
        allowed: allowedAt <= now,
        allowedAt: new Date(allowedAt),
        rescheduledForHourlyCap,
      };
    } catch (error) {
      if (error instanceof EmailRateLimitError) {
        throw error;
      }
      throw new EmailRateLimitError('Redis rate-limit reservation failed', { cause: error });
    }
  }

}

function validateRequest(request: SendSlotReservationRequest): void {
  if (typeof request.userId !== 'string' || !request.userId.trim()) {
    throw new EmailRateLimitError('A userId is required to reserve a send slot');
  }
  if (!Number.isSafeInteger(request.minimumGapMilliseconds) || request.minimumGapMilliseconds < 0) {
    throw new EmailRateLimitError('minimumGapMilliseconds must be a non-negative integer');
  }
  if (!Number.isSafeInteger(request.hourlyLimit) || request.hourlyLimit < 1) {
    throw new EmailRateLimitError('hourlyLimit must be a positive integer');
  }
  if (request.now && Number.isNaN(request.now.getTime())) {
    throw new EmailRateLimitError('now must be a valid UTC timestamp');
  }
}

function rateLimitKeys(userId: string) {
  // The hash tag keeps this user's reservation keys colocated if Redis Cluster is introduced later.
  const scope = encodeURIComponent(userId);
  const namespace = `${KEY_PREFIX}:{${scope}}`;

  return {
    nextSlot: `${namespace}:next-slot`,
    hourlyPrefix: `${namespace}:hour:`,
  };
}

function parseReservation(response: unknown): { allowedAt: number; rescheduledForHourlyCap: boolean } {
  if (!Array.isArray(response) || response.length < 2) {
    throw new EmailRateLimitError('Redis rate-limit reservation returned an invalid response');
  }

  const allowedAt = Number(response[0]);
  const skippedHourlyCap = Number(response[1]);
  if (!Number.isSafeInteger(allowedAt) || allowedAt < 0 || (skippedHourlyCap !== 0 && skippedHourlyCap !== 1)) {
    throw new EmailRateLimitError('Redis rate-limit reservation returned an invalid timestamp');
  }
  return { allowedAt, rescheduledForHourlyCap: skippedHourlyCap === 1 };
}

const RESERVE_SEND_SLOT_LUA = `
local nextSlotKey = KEYS[1]
local hourlyPrefix = ARGV[1]
local now = tonumber(ARGV[2])
local minimumGap = tonumber(ARGV[3])
local hourlyLimit = tonumber(ARGV[4])
local hourMilliseconds = 3600000
local skippedHourlyCap = 0

-- A one-millisecond floor gives simultaneous zero-gap reservations distinct slots.
local slotSpacing = math.max(minimumGap, 1)
local nextSlot = tonumber(redis.call('GET', nextSlotKey)) or now
local candidate = math.max(now, nextSlot)

while true do
  local windowStart = math.floor(candidate / hourMilliseconds) * hourMilliseconds
  local hourlyKey = hourlyPrefix .. windowStart
  local reservations = tonumber(redis.call('GET', hourlyKey)) or 0

  if reservations < hourlyLimit then
    redis.call('INCR', hourlyKey)
    -- Retain a UTC window count through a short safety buffer after that window closes.
    redis.call('PEXPIREAT', hourlyKey, windowStart + (2 * hourMilliseconds))

    local nextAvailable = candidate + slotSpacing
    redis.call('SET', nextSlotKey, nextAvailable)
    redis.call('PEXPIREAT', nextSlotKey, nextAvailable + hourMilliseconds)
    return { candidate, skippedHourlyCap }
  end

  skippedHourlyCap = 1
  candidate = math.max(candidate, windowStart + hourMilliseconds)
end
`;
