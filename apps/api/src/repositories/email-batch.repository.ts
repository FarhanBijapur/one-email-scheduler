import type { EmailBatchStatus, Prisma, PrismaClient } from '@prisma/client';

export type FindBatchesForUserOptions = {
  status?: EmailBatchStatus;
  skip?: number;
  take?: number;
};

export type CreateBatchWithEmailsInput = {
  batch: Prisma.EmailBatchUncheckedCreateInput;
  emails: Array<Omit<Prisma.EmailCreateManyInput, 'batchId'>>;
};

export class EmailBatchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: Prisma.EmailBatchUncheckedCreateInput) {
    return this.prisma.emailBatch.create({ data });
  }

  createWithEmails({ batch, emails }: CreateBatchWithEmailsInput) {
    return this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.emailBatch.create({ data: batch });

      if (emails.length > 0) {
        await tx.email.createMany({
          data: emails.map((email) => ({ ...email, batchId: createdBatch.id })),
        });
      }

      return createdBatch;
    });
  }

  findById(id: string) {
    return this.prisma.emailBatch.findUnique({ where: { id } });
  }

  findForUser(userId: string, options: FindBatchesForUserOptions = {}) {
    const { status, skip, take } = options;

    return this.prisma.emailBatch.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take,
    });
  }

  update(id: string, data: Prisma.EmailBatchUpdateInput) {
    return this.prisma.emailBatch.update({ where: { id }, data });
  }

  updateStatus(id: string, status: EmailBatchStatus) {
    return this.prisma.emailBatch.update({ where: { id }, data: { status } });
  }

  countForUser(userId: string, status?: EmailBatchStatus) {
    return this.prisma.emailBatch.count({
      where: { userId, ...(status ? { status } : {}) },
    });
  }
}
