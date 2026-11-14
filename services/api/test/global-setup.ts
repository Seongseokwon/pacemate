import { execFileSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './test-db.js';

/** 테스트 DB에 마이그레이션을 적용한다. 이미 적용된 것은 건너뛴다. */
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
