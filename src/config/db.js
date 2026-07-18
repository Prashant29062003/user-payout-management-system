import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createTestPrismaStub() {
  return {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    account: {
      findUnique: async () => null,
      update: async () => null,
    },
    ledgerEntry: {
      create: async () => null,
      findMany: async () => [],
      aggregate: async () => ({ _sum: { amount: 0 } }),
    },
    user: {
      findUnique: async () => null,
      create: async () => null,
    },
    sale: {
      findUnique: async () => null,
      update: async () => null,
    },
  };
}

function createPrismaClient() {
  if (process.env.NODE_ENV === 'test') {
    return createTestPrismaStub();
  }

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });
}

const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export default prisma;
export const db = prisma;

