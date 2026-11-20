import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/** 테스트 전용 DB. CI는 TEST_DATABASE_URL로 서비스 컨테이너를 가리킨다. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://pacemate:pacemate@localhost:5433/pacemate_test';

// 테스트는 테이블을 비운다. 개발·운영 DB를 지우는 사고를 막는다
if (!new URL(TEST_DATABASE_URL).pathname.endsWith('_test')) {
  throw new Error(`테스트 DB 이름은 _test로 끝나야 한다: ${new URL(TEST_DATABASE_URL).pathname}`);
}

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
}

/** 모든 사용자 데이터를 지운다. 계정을 지워도 남는 두 테이블은 따로 비운다. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`TRUNCATE "users", "ai_call_logs", "subscription_events", "usage_trials" CASCADE`;
}
