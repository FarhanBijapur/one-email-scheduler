import { randomUUID } from 'node:crypto';
import {
  createLogger,
  EMAIL_SEND_JOB_NAME,
  EmailRepository,
  type EmailSendJobData,
} from '@one/shared';
import type { Job } from 'bullmq';
import { EmailSearchSyncService } from './email-search-sync.service.js';

type WorkerLogger = ReturnType<typeof createLogger>;

export type ClaimedEmail = {
  id: string;
  batchId: string;
  userId: string;
  recipient: string;
  sender: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  batchSender: string;
  batchSenderName: string | null;
  delayBetweenEmails: number;
  hourlyLimit: number;
  claimToken: string;
};

export class EmailClaimService {
  constructor(
    private readonly emailRepository: EmailRepository,
    private readonly emailSearchSyncService: EmailSearchSyncService,
    private readonly logger: WorkerLogger,
  ) {}

  async claim(job: Job<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>): Promise<ClaimedEmail | null> {
    if (job.name !== EMAIL_SEND_JOB_NAME || !isEmailSendJobData(job.data)) {
      this.logger.warn('Acknowledging invalid email-send job', { jobId: job.id ?? null });
      return null;
    }

    const { emailId, batchId, userId } = job.data;
    const context = { jobId: job.id ?? null, emailId, batchId, userId };
    const email = await this.emailRepository.findForWorker(emailId);

    if (!email) {
      this.logger.warn('Acknowledging stale email-send job for missing email', context);
      return null;
    }

    if (email.batchId !== batchId || email.userId !== userId || email.batch.userId !== userId) {
      this.logger.warn('Acknowledging email-send job with inconsistent payload', context);
      return null;
    }

    const claimToken = randomUUID();
    const claimed = await this.emailRepository.claimScheduledEmail(email.id, claimToken);
    if (!claimed) {
      this.logger.info('Acknowledging email-send job already claimed or no longer scheduled', context);
      return null;
    }

    await this.emailSearchSyncService.indexPersistedEmail(email.id);

    this.logger.info('Email claimed for delivery', context);
    return {
      id: email.id,
      batchId: email.batchId,
      userId: email.userId,
      recipient: email.recipient,
      sender: email.sender,
      subject: email.subject,
      bodyHtml: email.bodyHtml,
      bodyText: email.bodyText,
      batchSender: email.batch.fromAddress,
      batchSenderName: email.batch.fromName,
      delayBetweenEmails: email.batch.delayBetweenEmails,
      hourlyLimit: email.batch.hourlyLimit,
      claimToken,
    };
  }
}

function isEmailSendJobData(data: unknown): data is EmailSendJobData {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const candidate = data as Record<string, unknown>;
  return ['emailId', 'batchId', 'userId'].every(
    (key) => typeof candidate[key] === 'string' && candidate[key].trim().length > 0,
  );
}
