import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export function createPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }

  return globalForPrisma.prisma;
}

export async function pingDatabase(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
