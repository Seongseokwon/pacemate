import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator.js';
import { PrismaService } from '../db/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** DB에 닿지 않으면 예외가 나서 500으로 응답한다. 호스팅 플랫폼이 이를 비정상으로 본다. */
  @Get()
  @Public()
  @SkipThrottle()
  async check(): Promise<{ status: 'ok' }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
