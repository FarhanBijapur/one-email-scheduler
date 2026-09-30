import { EmailSearchIndexService } from '@one/shared';
import { EmailStatus, type Email } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../lib/api-error.js';
import { EmailBatchRepository } from '../repositories/email-batch.repository.js';
import { EmailRepository, type PaginatedEmailQuery } from '../repositories/email.repository.js';
import { EmailQueueEnqueueError, EmailQueueService } from './email-queue.service.js';

const MAX_RECIPIENTS = 10_000;
const MAX_DELAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_HOURLY_LIMIT = 100_000;

const recipientSchema = z.string().trim().email().transform((email) => email.toLowerCase());

export const createEmailBatchSchema = z.object({
  subject: z.string().trim().min(1).max(998),
  body: z
    .string()
    .max(1_000_000)
    .refine((body) => body.trim().length > 0, 'body must not be empty'),
  recipients: z.array(recipientSchema).min(1).max(MAX_RECIPIENTS),
  scheduledAt: z.string().datetime({ offset: true }),
  delayBetweenEmails: z.number().int().min(0).max(MAX_DELAY_MILLISECONDS),
  hourlyLimit: z.number().int().positive().max(MAX_HOURLY_LIMIT),
  sender: recipientSchema.optional(),
  senderName: z.string().trim().min(1).max(200).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateEmailBatchInput = z.infer<typeof createEmailBatchSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

export class EmailBatchService {
  constructor(
    private readonly emailBatchRepository: EmailBatchRepository,
    private readonly emailRepository: EmailRepository,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailSearchIndexService: EmailSearchIndexService,
  ) {}

  async create(userId: string, userEmail: string, input: CreateEmailBatchInput) {
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw new ApiError(400, 'scheduledAt must be a future ISO-8601 timestamp');
    }

    const recipients = uniqueRecipients(input.recipients);
    if (recipients.length === 0) {
      throw new ApiError(400, 'At least one recipient is required');
    }

    const sender = input.sender ?? userEmail;
    const batch = await this.emailBatchRepository.createWithEmails({
      batch: {
        userId,
        fromAddress: sender,
        fromName: input.senderName ?? null,
        subject: input.subject,
        bodyHtml: input.body,
        bodyText: input.body,
        scheduledAt,
        delayBetweenEmails: input.delayBetweenEmails,
        hourlyLimit: input.hourlyLimit,
        recipientCount: recipients.length,
      },
      emails: recipients.map((recipient, sequenceIndex) => ({
        userId,
        recipient,
        sender,
        subject: input.subject,
        bodyHtml: input.body,
        bodyText: input.body,
        sequenceIndex,
        status: EmailStatus.SCHEDULED,
        plannedSendAt: new Date(scheduledAt.getTime() + sequenceIndex * input.delayBetweenEmails),
      })),
    });

    const emails = await this.emailRepository.findByBatch(batch.id);
    await this.emailSearchIndexService.indexEmailsBestEffort(emails);

    try {
      const jobsQueued = await this.emailQueueService.enqueueAll(emails);
      return { batch, jobsQueued };
    } catch (error) {
      const jobsQueued = error instanceof EmailQueueEnqueueError ? error.queuedCount : 0;
      throw new ApiError(503, 'Emails were persisted, but queue scheduling did not complete', {
        batchId: batch.id,
        emailsPersisted: emails.length,
        jobsQueued,
      });
    }
  }

  async listScheduled(userId: string, pagination: PaginationInput) {
    return this.listByStatus(userId, EmailStatus.SCHEDULED, pagination);
  }

  async listSent(userId: string, pagination: PaginationInput) {
    return this.listByStatus(userId, EmailStatus.SENT, pagination);
  }

  counts(userId: string) {
    return this.emailRepository.countForUser(userId);
  }

  async findDetail(userId: string, emailId: string) {
    const email = await this.emailRepository.findDetailForUser(emailId, userId);
    if (!email) {
      throw new ApiError(404, 'Email not found');
    }
    return {
      id: email.id,
      recipient: email.recipient,
      sender: email.sender,
      subject: email.subject,
      body: email.bodyHtml,
      status: email.status,
      sequenceIndex: email.sequenceIndex,
      plannedSendAt: email.plannedSendAt,
      sentAt: email.sentAt,
      createdAt: email.createdAt,
      batch: email.batch,
      attachments: email.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
      })),
    };
  }

  private async listByStatus(userId: string, status: EmailStatus, pagination: PaginationInput) {
    const query: PaginatedEmailQuery = {
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    };
    const [data, total] = await Promise.all([
      status === EmailStatus.SCHEDULED
        ? this.emailRepository.findScheduledForUser(userId, query)
        : this.emailRepository.findSentForUser(userId, query),
      this.emailRepository.countForUserAndStatus(userId, status),
    ]);

    return { data: data.map(toEmailListItem), pagination: { ...pagination, total } };
  }
}

function toEmailListItem(email: Email) {
  return {
    id: email.id,
    recipient: email.recipient,
    subject: email.subject,
    preview: email.bodyText ?? email.bodyHtml,
    status: email.status,
    batchId: email.batchId,
    plannedSendAt: email.plannedSendAt,
    sentAt: email.sentAt,
    createdAt: email.createdAt,
  };
}

function uniqueRecipients(recipients: string[]): string[] {
  return [...new Set(recipients)];
}
