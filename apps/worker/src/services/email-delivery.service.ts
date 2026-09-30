import {
  createLogger,
  EMAIL_SEND_JOB_NAME,
  EmailRepository,
  type EmailSendJobData,
} from '@one/shared';
import type { Job } from 'bullmq';
import type { Transporter } from 'nodemailer';
import type { ClaimedEmail } from './email-claim.service.js';
import { EmailSearchSyncService } from './email-search-sync.service.js';

type WorkerLogger = ReturnType<typeof createLogger>;

export class EmailDeliveryService {
  constructor(
    private readonly emailRepository: EmailRepository,
    private readonly transporter: Transporter,
    private readonly fallbackSender: string,
    private readonly emailSearchSyncService: EmailSearchSyncService,
    private readonly logger: WorkerLogger,
  ) {}

  async deliver(
    email: ClaimedEmail,
    job: Job<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>,
  ): Promise<void> {
    const context = {
      jobId: job.id ?? null,
      emailId: email.id,
      batchId: email.batchId,
      userId: email.userId,
    };

    let result: Awaited<ReturnType<Transporter['sendMail']>>;
    try {
      result = await this.transporter.sendMail({
        from: formatSender(email.batchSender || email.sender || this.fallbackSender, email.batchSenderName),
        to: email.recipient,
        subject: email.subject,
        html: email.bodyHtml,
        text: email.bodyText ?? undefined,
      });
    } catch (error) {
      await this.handleDeliveryFailure(email, job, context, error);
      return;
    }

    const markedSent = await this.emailRepository.markSent(email.id, email.claimToken);
    if (markedSent.count !== 1) {
      throw new Error('Email claim was no longer valid while persisting SMTP success');
    }
    await this.emailSearchSyncService.indexPersistedEmail(email.id);

    this.logger.info('Email delivered through SMTP', {
      ...context,
      messageId: result.messageId,
    });
  }

  private async handleDeliveryFailure(
    email: ClaimedEmail,
    job: Job<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>,
    context: Record<string, string | null>,
    error: unknown,
  ): Promise<void> {
    const retryable = isRetryableSmtpError(error);
    const attempts = job.opts.attempts ?? 1;
    const hasAnotherAttempt = job.attemptsMade + 1 < attempts;

    if (retryable && hasAnotherAttempt) {
      const released = await this.emailRepository.releaseClaimForRetry(email.id, email.claimToken);
      if (released.count !== 1) {
        throw new Error('Email claim was no longer valid while preparing an SMTP retry');
      }
      await this.emailSearchSyncService.indexPersistedEmail(email.id);

      this.logger.warn('Transient SMTP delivery failure; releasing email for BullMQ retry', {
        ...context,
        error: smtpErrorSummary(error),
      });
      throw new RetryableSmtpDeliveryError(error);
    }

    const markedFailed = await this.emailRepository.markFailed(
      email.id,
      email.claimToken,
      smtpFailureReason(error),
    );
    if (markedFailed.count !== 1) {
      throw new Error('Email claim was no longer valid while persisting SMTP failure');
    }
    await this.emailSearchSyncService.indexPersistedEmail(email.id);

    this.logger.error('SMTP delivery failed', {
      ...context,
      error: smtpErrorSummary(error),
      retryable,
      attemptsMade: job.attemptsMade + 1,
    });
  }
}

class RetryableSmtpDeliveryError extends Error {
  constructor(cause: unknown) {
    super('Transient SMTP delivery failure', { cause });
    this.name = 'RetryableSmtpDeliveryError';
  }
}

function formatSender(address: string, name: string | null): string {
  return name ? `${name} <${address}>` : address;
}

function isRetryableSmtpError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return true;
  }

  const candidate = error as { code?: unknown; responseCode?: unknown };
  if (candidate.responseCode && typeof candidate.responseCode === 'number') {
    return candidate.responseCode < 500;
  }

  return !['EAUTH', 'ECONFIG', 'EENVELOPE'].includes(String(candidate.code ?? ''));
}

function smtpFailureReason(error: unknown): string {
  const summary = smtpErrorSummary(error);
  return `SMTP delivery failed: ${summary}`.slice(0, 1_000);
}

function smtpErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown; responseCode?: unknown };
    const details = [candidate.code, candidate.responseCode].filter((value) => value !== undefined).join(' ');
    return (details || candidate.name || 'SMTP error').slice(0, 500);
  }

  return 'Unknown SMTP error';
}
