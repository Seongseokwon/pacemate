import type { INestApplication } from '@nestjs/common';
import { z } from 'zod';

/** 서버와 테스트가 같은 설정으로 뜨도록 한 곳에 둔다. */
export function configureApp(app: INestApplication): void {
  z.config(z.locales.ko());
  app.setGlobalPrefix('v1', { exclude: ['health'] });
}
