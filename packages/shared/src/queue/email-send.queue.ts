import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const EMAIL_SEND_QUEUE_NAME = 'email-send' as const;
export const EMAIL_SEND_JOB_NAME = 'send-email' as const;
export const EMAIL_SEND_MAX_ATTEMPTS = 3;
export const EMAIL_SEND_BACKOFF_DELAY_MS = 1_000;

export type EmailSendJobData = {
  emailId: string;
  batchId: string;
  userId: string;
};

export type EmailSendQueue = Queue<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>;

export function emailSendJobId(emailId: string): string {
  // Prisma UUIDs contain hyphens and no colons, which is valid for BullMQ custom job IDs.
  return emailId;
}

export function createEmailSendQueue(connection: Redis): EmailSendQueue {
  return new Queue<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>(EMAIL_SEND_QUEUE_NAME, {
    connection,
  });
}
