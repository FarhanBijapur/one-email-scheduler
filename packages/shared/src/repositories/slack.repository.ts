import type { Prisma, PrismaClient } from '@prisma/client';

export type UpsertSlackConnectionInput = {
  userId: string;
  teamId: string;
  teamName: string | null;
  accessToken: string;
  channelId: string | null;
  channelName: string | null;
};

export class SlackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByUser(userId: string) {
    return this.prisma.slackConnection.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findActiveByUser(userId: string) {
    return this.prisma.slackConnection.findFirst({
      where: { userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findActiveForUser(userId: string) {
    return this.prisma.slackConnection.findMany({
      where: { userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findByUserAndTeam(userId: string, teamId: string) {
    return this.prisma.slackConnection.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
  }

  create(data: Prisma.SlackConnectionUncheckedCreateInput) {
    return this.prisma.slackConnection.create({ data });
  }

  update(id: string, data: Prisma.SlackConnectionUpdateInput) {
    return this.prisma.slackConnection.update({ where: { id }, data });
  }

  upsertConnection(data: UpsertSlackConnectionInput) {
    return this.prisma.slackConnection.upsert({
      where: { userId_teamId: { userId: data.userId, teamId: data.teamId } },
      create: { ...data, isActive: true },
      update: {
        teamName: data.teamName,
        accessToken: data.accessToken,
        channelId: data.channelId,
        channelName: data.channelName,
        isActive: true,
      },
    });
  }

  deleteById(id: string) {
    return this.prisma.slackConnection.delete({ where: { id } });
  }

  deleteByUser(userId: string) {
    return this.prisma.slackConnection.deleteMany({ where: { userId } });
  }
}
