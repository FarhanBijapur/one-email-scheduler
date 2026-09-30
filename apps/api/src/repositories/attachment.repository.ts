import type { Prisma, PrismaClient } from '@prisma/client';

export class AttachmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: Prisma.EmailAttachmentUncheckedCreateInput) {
    return this.prisma.emailAttachment.create({ data });
  }

  findByEmail(emailId: string) {
    return this.prisma.emailAttachment.findMany({
      where: { emailId },
      orderBy: { createdAt: 'asc' },
    });
  }

  deleteById(id: string) {
    return this.prisma.emailAttachment.delete({ where: { id } });
  }
}
