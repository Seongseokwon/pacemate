import { Inject, Injectable } from '@nestjs/common';
import { PLAN_LIMITS, type Usage } from '@pacemate/shared';
import { today } from '../common/today.js';
import { PrismaService } from '../db/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

type Counter = 'chat' | 'reschedule';
type Database = Prisma.TransactionClient;

@Injectable()
export class UsageService {
  constructor(@Inject(PrismaService) private readonly prisma: Database) {}

  async get(userId: string, date = today(), db: Database = this.prisma): Promise<Usage> {
    const month = date.slice(0, 7);
    const row = await db.usageCounter.findUnique({ where: { userId_month: { userId, month } } });
    const year = Number(month.slice(0, 4));
    const currentMonth = Number(month.slice(5, 7));
    const next = new Date(Date.UTC(year, currentMonth, 1)).toISOString().slice(0, 10);
    return {
      tier: 'free',
      chat: { used: row?.chatCount ?? 0, limit: PLAN_LIMITS.free.chat },
      reschedule: { used: row?.rescheduleCount ?? 0, limit: PLAN_LIMITS.free.reschedule },
      resetsOn: next,
    };
  }

  async increment(db: Database, userId: string, counter: Counter, date = today()): Promise<boolean> {
    const month = date.slice(0, 7);
    await db.usageCounter.createMany({ data: { userId, month }, skipDuplicates: true });
    const field = counter === 'chat' ? 'chatCount' : 'rescheduleCount';
    const result = await db.usageCounter.updateMany({
      where: { userId, month, [field]: { lt: PLAN_LIMITS.free[counter] } },
      data: { [field]: { increment: 1 } },
    });
    return result.count === 1;
  }
}
