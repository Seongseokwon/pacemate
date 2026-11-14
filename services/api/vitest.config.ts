import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // shortcut: 테스트 파일이 DB 하나를 함께 쓰므로 차례로 실행한다, 테스트가 느려지면 파일별 DB나 스키마로 나눈다
    fileParallelism: false,
  },
});
