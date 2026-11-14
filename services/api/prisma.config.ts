import { defineConfig } from 'prisma/config';

// 로컬에서는 .env를 읽는다. 운영과 CI는 환경 변수를 직접 준다.
try {
  process.loadEnvFile();
} catch {
  // .env가 없으면 환경 변수만 쓴다
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
