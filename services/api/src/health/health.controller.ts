import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator.js';

@Controller('health')
export class HealthController {
  // DB 연결 확인은 DB를 붙이는 T-104에서 추가한다
  @Get()
  @Public()
  @SkipThrottle()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
