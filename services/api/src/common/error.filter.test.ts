import { HttpException, type ArgumentsHost } from '@nestjs/common';
import { captureException } from '@sentry/node';
import { expect, test, vi } from 'vitest';
import { AppError } from './app-error.js';
import { ErrorFilter } from './error.filter.js';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

test('예상하지 못한 서버 오류만 모니터링에 보낸다', () => {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  const filter = new ErrorFilter();
  const failure = new Error('failure');
  filter.catch(failure, host);
  filter.catch(new AppError('UNAUTHENTICATED', '로그인이 필요해요.'), host);
  filter.catch(new HttpException('invalid', 400), host);
  expect(captureException).toHaveBeenCalledTimes(1);
  expect(captureException).toHaveBeenCalledWith(failure);
});
