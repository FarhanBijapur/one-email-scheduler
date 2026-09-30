import { EmailStatus, type Prisma, type PrismaClient } from '@prisma/client';

export type FindScheduledEmailsOptions = {
  userId?: string;
  plannedBefore?: Date;
  take?: number;
};

export type FindEmailsForUserOptions = {
  status?: EmailStatus;
  skip?: number;
  take?: number;
};

export type PaginatedEmailQuery = {
  skip: number;
  take: number;
};

export type EmailCounts = {
  scheduled: number;
  sent: number;
};

export class EmailRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: Prisma.EmailUncheckedCreateInput) {
    return this.prisma.email.create({ data });
  }

  createMany(data: Prisma.EmailCreateManyInput[]) {
    return this.prisma.email.createMany({ data });
  }

  findById(id: string) {
    return this.prisma.email.findUnique({ where: { id } });
  }

  findForWorker(id: string) {
    return this.prisma.email.findUnique({
      where: { id },
      select: {
        id: true,
        batchId: true,
        userId: true,
        recipient: true,
        sender: true,
        subject: true,
        bodyHtml: true,
        bodyText: true,
        batch: {
          select: {
            userId: true,
            fromAddress: true,
            fromName: true,
            delayBetweenEmails: true,
            hourlyLimit: true,
          },
        },
      },
    });
  }

  findByBatch(batchId: string) {
    return this.prisma.email.findMany({
      where: { batchId },
      orderBy: { sequenceIndex: 'asc' },
    });
  }

  findScheduled(options: FindScheduledEmailsOptions = {}) {
    const { userId, plannedBefore, take } = options;

    return this.prisma.email.findMany({
      where: {
        status: EmailStatus.SCHEDULED,
        ...(userId ? { userId } : {}),
        ...(plannedBefore ? { plannedSendAt: { lte: plannedBefore } } : {}),
      },
      orderBy: { plannedSendAt: 'asc' },
      take,
    });
  }

  findScheduledForUser(userId: string, { skip, take }: PaginatedEmailQuery) {
    return this.prisma.email.findMany({
      where: { userId, status: EmailStatus.SCHEDULED },
      orderBy: { plannedSendAt: 'asc' },
      skip,
      take,
    });
  }

  findSentForUser(userId: string, { skip, take }: PaginatedEmailQuery) {
    return this.prisma.email.findMany({
      where: { userId, status: EmailStatus.SENT },
      orderBy: { sentAt: 'desc' },
      skip,
      take,
    });
  }

  findDetailForUser(id: string, userId: string) {
    return this.prisma.email.findFirst({
      where: { id, userId },
      include: {
        batch: {
          select: {
            id: true,
            scheduledAt: true,
            delayBetweenEmails: true,
            hourlyLimit: true,
            status: true,
          },
        },
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            sizeBytes: true,
            storageKey: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  findForUser(userId: string, options: FindEmailsForUserOptions = {}) {
    const { status, skip, take } = options;

    return this.prisma.email.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { plannedSendAt: 'asc' },
      skip,
      take,
    });
  }

  updatePlannedSendAt(id: string, plannedSendAt: Date) {
    return this.prisma.email.update({ where: { id }, data: { plannedSendAt } });
  }

  markScheduled(id: string, claimToken: string, plannedSendAt: Date) {
    return this.prisma.email.updateMany({
      where: { id, status: EmailStatus.PROCESSING, claimToken },
      data: {
        status: EmailStatus.SCHEDULED,
        plannedSendAt,
        claimedAt: null,
        claimToken: null,
      },
    });
  }

  async claimScheduledEmail(id: string, claimToken: string, claimedAt = new Date()): Promise<boolean> {
    const result = await this.prisma.email.updateMany({
      where: {
        id,
        status: EmailStatus.SCHEDULED,
        claimedAt: null,
        claimToken: null,
      },
      data: {
        status: EmailStatus.PROCESSING,
        claimedAt,
        claimToken,
      },
    });

    return result.count === 1;
  }

  markSent(id: string, claimToken: string, sentAt = new Date()) {
    return this.prisma.email.updateMany({
      where: { id, status: EmailStatus.PROCESSING, claimToken },
      data: { status: EmailStatus.SENT, sentAt },
    });
  }

  markFailed(id: string, claimToken: string, failureReason: string, failedAt = new Date()) {
    return this.prisma.email.updateMany({
      where: { id, status: EmailStatus.PROCESSING, claimToken },
      data: { status: EmailStatus.FAILED, failedAt, failureReason },
    });
  }

  releaseClaimForRetry(id: string, claimToken: string) {
    return this.prisma.email.updateMany({
      where: { id, status: EmailStatus.PROCESSING, claimToken },
      data: {
        status: EmailStatus.SCHEDULED,
        claimedAt: null,
        claimToken: null,
      },
    });
  }

  countForUserAndStatus(userId: string, status: EmailStatus) {
    return this.prisma.email.count({ where: { userId, status } });
  }

  async countForUser(userId: string): Promise<EmailCounts> {
    const [scheduled, sent] = await this.prisma.$transaction([
      this.prisma.email.count({ where: { userId, status: EmailStatus.SCHEDULED } }),
      this.prisma.email.count({ where: { userId, status: EmailStatus.SENT } }),
    ]);

    return { scheduled, sent };
  }
}
