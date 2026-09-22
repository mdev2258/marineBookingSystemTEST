import { PrismaClient } from '@prisma/client';

// Next dev does hot-module reloads; without the global cache each reload opens
// a fresh pool and the Postgres connection limit is gone within a few saves.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
