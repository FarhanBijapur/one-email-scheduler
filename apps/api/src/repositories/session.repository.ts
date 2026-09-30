import type { Prisma, PrismaClient } from '@prisma/client';

export class SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: Prisma.SessionUncheckedCreateInput) {
    return this.prisma.session.create({ data });
  }

  findById(id: string) {
    return this.prisma.session.findUnique({ where: { id } });
  }

  deleteById(id: string) {
    return this.prisma.session.deleteMany({ where: { id } });
  }

  deleteForUser(userId: string) {
    return this.prisma.session.deleteMany({ where: { userId } });
  }

  deleteExpired(now = new Date()) {
    return this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
  }
}
