import { config } from '../config.js';

let prismaPromise = null;

export function isDatabaseConfigured() {
  return Boolean(config.databaseUrl);
}

export async function getPrisma() {
  if (!isDatabaseConfigured()) return null;
  if (!prismaPromise) {
    prismaPromise = import('@prisma/client').then(({ PrismaClient }) => new PrismaClient());
  }
  return prismaPromise;
}

export async function pingDatabase() {
  if (!isDatabaseConfigured()) {
    return { configured: false, connected: false, role: 'foundation-not-source-of-truth' };
  }
  try {
    const prisma = await getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return { configured: true, connected: true, role: 'foundation-not-source-of-truth' };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      role: 'foundation-not-source-of-truth',
      error: err.message || 'connection failed',
    };
  }
}

export async function disconnectPrisma() {
  if (!prismaPromise) return;
  const prisma = await prismaPromise;
  await prisma.$disconnect();
  prismaPromise = null;
}
