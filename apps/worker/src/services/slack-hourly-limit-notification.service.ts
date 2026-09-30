import { createLogger, SlackClient, SlackRepository } from '@one/shared';
import type Redis from 'ioredis';

const NOTIFICATION_KEY_PREFIX = 'one:slack-hourly-cap:v1';
const HOUR_MILLISECONDS = 60 * 60 * 1_000;

type WorkerLogger = ReturnType<typeof createLogger>;

export type HourlyLimitNotificationInput = {
  userId: string;
  emailId: string;
  recipient: string;
  hourlyLimit: number;
  plannedSendAt: Date;
};

export class SlackHourlyLimitNotificationService {
  constructor(
    private readonly redis: Redis,
    private readonly slackRepository: SlackRepository,
    private readonly slackClient: SlackClient,
    private readonly logger: WorkerLogger,
  ) {}

  async notifyOnce(input: HourlyLimitNotificationInput): Promise<void> {
    let connection: Awaited<ReturnType<SlackRepository['findActiveByUser']>>;
    try {
      connection = await this.slackRepository.findActiveByUser(input.userId);
    } catch {
      this.logger.warn('Slack connection lookup failed; skipping hourly-limit notification', notificationContext(input));
      return;
    }

    if (!connection?.channelId) {
      return;
    }

    try {
      const claimed = await this.redis.set(
        notificationKey(input),
        '1',
        'PX',
        notificationTtlMilliseconds(input.plannedSendAt),
        'NX',
      );
      if (claimed !== 'OK') {
        return;
      }
    } catch {
      // Without durable idempotency, do not risk duplicate messages on BullMQ retries.
      this.logger.warn('Slack notification idempotency check failed; skipping notification', notificationContext(input));
      return;
    }

    try {
      await this.slackClient.postMessage(
        connection.accessToken,
        connection.channelId,
        `ONE: your hourly email limit (${input.hourlyLimit}) was reached. The email to ${input.recipient} was rescheduled for ${input.plannedSendAt.toISOString()}.`,
      );
    } catch {
      this.logger.warn('Slack hourly-limit notification failed', notificationContext(input));
    }
  }
}

function notificationKey(input: HourlyLimitNotificationInput): string {
  return `${NOTIFICATION_KEY_PREFIX}:{${encodeURIComponent(input.userId)}}:${input.emailId}:${input.plannedSendAt.getTime()}`;
}

function notificationTtlMilliseconds(plannedSendAt: Date): number {
  return Math.max(HOUR_MILLISECONDS * 2, plannedSendAt.getTime() - Date.now() + HOUR_MILLISECONDS * 2);
}

function notificationContext(input: HourlyLimitNotificationInput) {
  return {
    emailId: input.emailId,
    userId: input.userId,
    plannedSendAt: input.plannedSendAt.toISOString(),
  };
}
