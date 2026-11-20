import { Inject, Injectable } from '@nestjs/common';
import { PLAN_LIMITS, TRIAL_LIMITS, type Tier, type Usage } from '@pacemate/shared';
import { today } from '../common/today.js';
import { PrismaService } from '../db/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

type Counter = 'chat' | 'reschedule';
type Database = Prisma.TransactionClient;

@Injectable()
export class UsageService {
  constructor(@Inject(PrismaService) private readonly prisma: Database) {}

  private async tier(db: Database, userId: string): Promise<Tier> {
    const subscription = await db.subscription.findUnique({ where: { userId } });
    return subscription && subscription.expiresAt > new Date() ? 'pro' : 'free';
  }

  async get(userId: string, date = today(), db: Database = this.prisma): Promise<Usage> {
    const month = date.slice(0, 7);
    const tier = await this.tier(db, userId);
    const user = await db.user.findUnique({ where: { id: userId }, select: { identityHash: true } });
    const trial = tier === 'free' && user?.identityHash ? await db.usageTrial.findUnique({ where: { identityHash: user.identityHash } }) : null;
    const row = await db.usageCounter.findUnique({ where: { userId_month: { userId, month } } });
    const year = Number(month.slice(0, 4));
    const currentMonth = Number(month.slice(5, 7));
    const next = new Date(Date.UTC(year, currentMonth, 1)).toISOString().slice(0, 10);
    return {
      tier,
      chat: tier === 'free' && user?.identityHash && (trial?.chatCount ?? 0) < TRIAL_LIMITS.chat ? { used: trial?.chatCount ?? 0, limit: TRIAL_LIMITS.chat, pool: 'trial' } : { used: row?.chatCount ?? 0, limit: PLAN_LIMITS[tier].chat, pool: 'month' },
      reschedule: tier === 'free' && user?.identityHash && (trial?.rescheduleCount ?? 0) < TRIAL_LIMITS.reschedule ? { used: trial?.rescheduleCount ?? 0, limit: TRIAL_LIMITS.reschedule, pool: 'trial' } : { used: row?.rescheduleCount ?? 0, limit: PLAN_LIMITS[tier].reschedule, pool: 'month' },
      resetsOn: next,
    };
  }

  async increment(db: Database, userId: string, counter: Counter, date = today()): Promise<boolean> {
    const month = date.slice(0, 7);
    const tier = await this.tier(db, userId);
    const field = counter === 'chat' ? 'chatCount' : 'rescheduleCount';
    const user = await db.user.findUnique({ where: { id: userId }, select: { identityHash: true } });
    if (tier === 'free' && user?.identityHash) {
      await db.usageTrial.createMany({ data: { identityHash: user.identityHash }, skipDuplicates: true });
      const trial = await db.usageTrial.updateMany({ where: { identityHash: user.identityHash, [field]: { lt: TRIAL_LIMITS[counter] } }, data: { [field]: { increment: 1 } } });
      if (trial.count === 1) return true;
    }
    await db.usageCounter.createMany({ data: { userId, month }, skipDuplicates: true });
    const result = await db.usageCounter.updateMany({
      where: { userId, month, [field]: { lt: PLAN_LIMITS[tier][counter] } },
      data: { [field]: { increment: 1 } },
    });
    return result.count === 1;
  }
}
