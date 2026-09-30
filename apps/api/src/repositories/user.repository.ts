import type { Prisma, PrismaClient } from '@prisma/client';

export type GoogleUserInput = {
  googleSub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByGoogleSub(googleSub: string) {
    return this.prisma.user.findUnique({ where: { googleSub } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data });
  }

  upsertGoogleUser(data: GoogleUserInput) {
    const { googleSub, ...profile } = data;

    return this.prisma.user.upsert({
      where: { googleSub },
      create: { googleSub, ...profile },
      update: profile,
    });
  }
}
