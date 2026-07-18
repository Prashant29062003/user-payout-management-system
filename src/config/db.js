import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createTestPrismaStub() {
  const stub = {
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $transaction: async (work) => work(stub),
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
    withdrawal: {
      findUnique: async () => null,
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => null,
      update: async () => null,
      count: async () => 0,
    },
    advancePayout: {
      findUnique: async () => null,
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => null,
      update: async () => null,
      count: async () => 0,
    },
    paymentAttempt: {
      findUnique: async () => null,
      create: async () => null,
      update: async () => null,
    },
  };
  return stub;
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

