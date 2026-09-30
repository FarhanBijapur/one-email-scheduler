import {
  createLogger,
  EMAIL_SEND_JOB_NAME,
  EmailRepository,
  type EmailSendJobData,
} from '@one/shared';
import { DelayedError, type Job } from 'bullmq';
import { EmailClaimService } from './email-claim.service.js';
import { EmailDeliveryService } from './email-delivery.service.js';
import { EmailRateLimitService, type SendSlotReservation } from './email-rate-limit.service.js';
import { EmailSearchSyncService } from './email-search-sync.service.js';
import { SlackHourlyLimitNotificationService } from './slack-hourly-limit-notification.service.js';

type WorkerLogger = ReturnType<typeof createLogger>;

export class EmailSendJobProcessor {
  constructor(
    private readonly emailClaimService: EmailClaimService,
    private readonly emailRateLimitService: EmailRateLimitService,
    private readonly emailDeliveryService: EmailDeliveryService,
    private readonly emailRepository: EmailRepository,
    private readonly emailSearchSyncService: EmailSearchSyncService,
    private readonly slackHourlyLimitNotificationService: SlackHourlyLimitNotificationService,
    private readonly logger: WorkerLogger,
  ) {}

  async process(job: Job<EmailSendJobData, void, typeof EMAIL_SEND_JOB_NAME>, token?: string): Promise<void> {
    const email = await this.emailClaimService.claim(job);
    if (!email) {
      return;
    }

    const context = {
      jobId: job.id ?? null,
      emailId: email.id,
      batchId: email.batchId,
      userId: email.userId,
    };

    let reservation: SendSlotReservation;
    try {
      reservation = await this.emailRateLimitService.reserveSendSlot({
        userId: email.userId,
        minimumGapMilliseconds: email.delayBetweenEmails,
        hourlyLimit: email.hourlyLimit,
      });
    } catch (error) {
      const released = await this.emailRepository.releaseClaimForRetry(email.id, email.claimToken);
      if (released.count !== 1) {
        throw new Error('Email claim was no longer valid while handling a Redis reservation failure');
      }
      await this.emailSearchSyncService.indexPersistedEmail(email.id);

      this.logger.warn('Redis rate-limit reservation failed; releasing email for BullMQ retry', context);
      throw error;
    }

    if (reservation.allowedAt.getTime() > Date.now()) {
      if (!token) {
        throw new Error('BullMQ job lock token is required to reschedule an active email-send job');
      }

      const released = await this.emailRepository.markScheduled(
        email.id,
        email.claimToken,
        reservation.allowedAt,
      );
      if (released.count !== 1) {
        throw new Error('Email claim was no longer valid while rescheduling a rate-limited email');
      }
      await this.emailSearchSyncService.indexPersistedEmail(email.id);

      await job.moveToDelayed(reservation.allowedAt.getTime(), token);
      if (reservation.rescheduledForHourlyCap) {
        await this.slackHourlyLimitNotificationService.notifyOnce({
          userId: email.userId,
          emailId: email.id,
          recipient: email.recipient,
          hourlyLimit: email.hourlyLimit,
          plannedSendAt: reservation.allowedAt,
        });
      }
      this.logger.info('Rate-limited email moved to a delayed BullMQ slot', {
        ...context,
        allowedAt: reservation.allowedAt.toISOString(),
      });
      throw new DelayedError();
    }

    await this.emailDeliveryService.deliver(email, job);
  }

}
