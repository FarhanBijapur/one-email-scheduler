import {
  emailSendJobId,
  EMAIL_SEND_BACKOFF_DELAY_MS,
  EMAIL_SEND_JOB_NAME,
  EMAIL_SEND_MAX_ATTEMPTS,
  type EmailSendJobData,
} from '@one/shared';
import type { Email } from '@prisma/client';
import type { Queue } from 'bullmq';

export type PersistedEmailForQueue = Pick<Email, 'id' | 'batchId' | 'userId' | 'plannedSendAt'>;

export class EmailQueueEnqueueError extends Error {
  constructor(
    public readonly queuedCount: number,
    cause: unknown,
  ) {
    super('Failed to enqueue one or more persisted emails', { cause });
    this.name = 'EmailQueueEnqueueError';
  }
}

/**
 * Converts committed PostgreSQL email rows into BullMQ delayed jobs. A future
 * reconciliation path can safely invoke this service again for persisted rows.
 */
export class EmailQueueService {
  constructor(
    private readonly queue: Queue<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>,
  ) {}

  async enqueue(email: PersistedEmailForQueue): Promise<void> {
    const delay = Math.max(0, email.plannedSendAt.getTime() - Date.now());

    await this.queue.add(
      EMAIL_SEND_JOB_NAME,
      {
        emailId: email.id,
        batchId: email.batchId,
        userId: email.userId,
      },
      {
        delay,
        jobId: emailSendJobId(email.id),
        attempts: EMAIL_SEND_MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: EMAIL_SEND_BACKOFF_DELAY_MS,
        },
      },
    );
  }

  async enqueueAll(emails: PersistedEmailForQueue[]): Promise<number> {
    let queuedCount = 0;

    try {
      for (const email of emails) {
        await this.enqueue(email);
        queuedCount += 1;
      }
    } catch (error) {
      throw new EmailQueueEnqueueError(queuedCount, error);
    }

    return queuedCount;
  }
}
