import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';

export const testPrisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

beforeAll(async () => {
  await testPrisma.$connect();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
