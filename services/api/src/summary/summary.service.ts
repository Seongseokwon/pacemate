import { Injectable } from '@nestjs/common';
import type { WeeklySummaryResponse } from '@pacemate/shared';
import { addDays, toDbDate } from '../common/dates.js';
import { today } from '../common/today.js';
import { PrismaService } from '../db/prisma.service.js';
import { toSession } from '../plan/session.mapper.js';

/** 주간 요약의 수치(F08-R01). AI 피드백(T-602)을 뺀 부분이다 */
export type WeeklyNumbers = Omit<WeeklySummaryResponse, 'aiFeedback' | 'aiFeedbackAvailable'>;

/** 주간 요약. 화면, 채팅 도구, 주간 피드백이 같은 수치를 쓴다(F08-R05). */
@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** 요청 시점의 데이터로 계산한다(API_SPEC §3.7). 횟수와 다음 훈련은 계획 진행률과 같이 대회와 생략한 훈련을 빼고 본다(DATABASE §3.4) */
  async weeklyNumbers(userId: string, weekStart: string): Promise<WeeklyNumbers> {
    const date = today();
    const week = { gte: toDbDate(weekStart), lte: toDbDate(addDays(weekStart, 6)) };
    const counted = { userId, date: week, isSkipped: false, type: { not: 'race' } } as const;
    const [plannedCount, completedCount, distance, next] = await Promise.all([
      this.prisma.plannedSession.count({ where: counted }),
      this.prisma.plannedSession.count({ where: { ...counted, workout: { isNot: null } } }),
      // 거리는 훈련에 연결되지 않은 기록까지 합한다
      this.prisma.workoutLog.aggregate({ where: { userId, date: week }, _sum: { distanceKm: true } }),
      this.prisma.plannedSession.findFirst({
        // 대회는 훈련이 아니다(PRD §7.2)
        where: { userId, plan: { status: 'active' }, date: { gte: toDbDate(date) }, isSkipped: false, workout: null, type: { not: 'race' } },
        include: { workout: { select: { id: true } } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      weekStart,
      plannedCount,
      completedCount,
      totalDistanceKm: distance._sum.distanceKm?.toNumber() ?? 0,
      completionRate: plannedCount === 0 ? 0 : Math.min(1, completedCount / plannedCount),
      nextSession: next ? toSession(next, date) : null,
    };
  }
}
