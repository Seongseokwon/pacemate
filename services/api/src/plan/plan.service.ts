import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ConfirmPlanRequest,
  HomeResponse,
  PlanSummary,
  PlanWarning,
  PreviewPlanRequest,
  PreviewPlanResponse,
  RunnerLevel,
  SessionDetailResponse,
  SessionSnapshot,
  SessionsQuery,
  SessionsResponse,
} from '@pacemate/shared';
import type { EngineGoal, EngineProfile, PlanOption } from '@pacemate/training-engine';
import { AppError } from '../common/app-error.js';
import { addDays, daysBetween, mondayOf, toDateString, toDbDate } from '../common/dates.js';
import { today } from '../common/today.js';
import { PrismaService } from '../db/prisma.service.js';
import { Prisma, type TrainingPlan } from '../generated/prisma/client.js';
import { managerMessage } from './manager-message.js';
import { toSession, toWorkout } from './session.mapper.js';
import { TRAINING_ENGINE, type TrainingEngine } from './training-engine.js';

const withWorkoutId = { workout: { select: { id: true } } } as const;

/** 변경 이력의 `before`·`after` 형식(DATABASE §3.8) */
type ChangeLogContent = { sessions?: (SessionSnapshot & { id: string })[] };

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRAINING_ENGINE) private readonly engine: TrainingEngine,
  ) {}

  /** 만들 수 있는 계획을 보여 준다. 저장하지 않는다(F03-R05). */
  async preview(userId: string, input: PreviewPlanRequest): Promise<PreviewPlanResponse> {
    const date = today();
    const { options } = await this.generate(userId, input, date);
    return {
      options: options.map((option) => ({
        ...option,
        sessions: option.sessions.map((session) => ({ ...session, status: 'planned', workoutId: null, original: null })),
      })),
    };
  }

  /** 같은 입력으로 다시 계산해 저장한다. 미리보기 결과를 보관하지 않는다(API_SPEC §3.3). */
  async confirm(userId: string, input: ConfirmPlanRequest): Promise<PlanSummary> {
    const date = today();
    const { options, goal } = await this.generate(userId, input, date);
    const option = options.find(({ kind }) => kind === input.kind);
    if (!option) throw new AppError('PLAN_NOT_FEASIBLE', '고른 계획을 지금 조건으로는 만들 수 없어요. 계획을 다시 확인해 주세요.');

    const alreadyActive = () => new AppError('PLAN_ALREADY_ACTIVE', '진행 중인 계획이 있어요.');
    try {
      const plan = await this.prisma.$transaction(async (tx) => {
        const active = await tx.trainingPlan.findFirst({ where: { userId, status: 'active' } });
        if (active) {
          if (!isFinished(active, date)) throw alreadyActive();
          // 기간이 끝난 계획은 새 계획을 만들 때 종료 처리한다(F03-R08)
          await tx.trainingPlan.update({ where: { id: active.id }, data: { status: 'ended', endedAt: new Date() } });
        }
        const created = await tx.trainingPlan.create({
          data: {
            userId,
            status: 'active',
            kind: option.kind,
            goalDistance: goal.goalDistance,
            goalTimeSec: goal.goalTimeSec,
            raceDate: goal.raceDate === null ? null : toDbDate(goal.raceDate),
            startDate: toDbDate(option.startDate),
            endDate: toDbDate(option.endDate),
            warnings: option.warnings,
            engineVersion: this.engine.version,
          },
        });
        await tx.plannedSession.createMany({
          data: option.sessions.map((session) => ({
            planId: created.id,
            userId,
            date: toDbDate(session.date),
            type: session.type,
            distanceKm: session.distanceKm,
            durationMin: session.durationMin,
            runIntervalMin: session.runIntervalMin,
            paceMinSecPerKm: session.paceRange?.minSecPerKm ?? null,
            paceMaxSecPerKm: session.paceRange?.maxSecPerKm ?? null,
            weekNumber: session.weekNumber,
          })),
        });
        return created;
      });
      return await this.summarize(plan, date);
    } catch (error) {
      // 동시에 두 번 확정하면 활성 계획의 유일 인덱스가 한쪽을 막는다(DI-13)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw alreadyActive();
      throw error;
    }
  }

  async getSummary(userId: string): Promise<PlanSummary> {
    const plan = await this.prisma.trainingPlan.findFirst({ where: { userId, status: 'active' } });
    if (!plan) throw new AppError('NO_ACTIVE_PLAN', '진행 중인 계획이 없어요.');
    return this.summarize(plan, today());
  }

  /** 기간의 훈련. 끝난 계획의 훈련과 생략된 훈련도 돌려준다(API_SPEC §3.3). */
  async listSessions(userId: string, { from, to }: SessionsQuery): Promise<SessionsResponse> {
    const date = today();
    const rows = await this.prisma.plannedSession.findMany({
      where: { userId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      include: withWorkoutId,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return { items: rows.map((row) => toSession(row, date)) };
  }

  async getSession(userId: string, id: string): Promise<SessionDetailResponse> {
    const row = await this.prisma.plannedSession.findFirst({ where: { id, userId }, include: { workout: true } });
    if (!row) throw new AppError('NOT_FOUND', '훈련을 찾을 수 없어요.');
    const logs = await this.prisma.planChangeLog.findMany({ where: { planId: row.planId, userId }, orderBy: { createdAt: 'asc' } });

    const snapshotOf = (content: unknown): SessionSnapshot | null => {
      const found = (content as ChangeLogContent | null)?.sessions?.find((session) => session.id === id);
      if (!found) return null;
      return { date: found.date, type: found.type, distanceKm: found.distanceKm, durationMin: found.durationMin };
    };
    const changes = logs
      .map((log) => ({ changedAt: log.createdAt.toISOString(), reason: log.reason, before: snapshotOf(log.before), after: snapshotOf(log.after) }))
      .filter((change) => change.before || change.after);

    return { ...toSession(row, today()), workout: row.workout ? toWorkout(row.workout) : null, changes };
  }

  async getHome(userId: string): Promise<HomeResponse> {
    const date = today();
    const active = await this.prisma.trainingPlan.findFirst({ where: { userId, status: 'active' } });
    if (!active) {
      return { plan: null, daysToRace: null, todaySession: null, weekSessions: [], managerMessage: managerMessage({ plan: null, today: date, todaySession: null, weekSessions: [] }) };
    }
    const weekStart = mondayOf(date);
    const rows = await this.prisma.plannedSession.findMany({
      where: { planId: active.id, userId, date: { gte: toDbDate(weekStart), lte: toDbDate(addDays(weekStart, 6)) } },
      include: withWorkoutId,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const weekSessions = rows.map((row) => toSession(row, date));
    const todaySession = weekSessions.find((session) => session.date === date && session.status !== 'skipped') ?? null;
    const plan = await this.summarize(active, date);
    return {
      plan,
      daysToRace: plan.raceDate !== null && plan.raceDate >= date ? daysBetween(date, plan.raceDate) : null,
      todaySession,
      weekSessions,
      managerMessage: managerMessage({ plan, today: date, todaySession, weekSessions }),
    };
  }

  /** Training Engine으로 계획을 만들고, 검증기를 통과한 것만 남긴다(F03-R02, TE-S12). */
  private async generate(userId: string, input: PreviewPlanRequest, date: string): Promise<{ options: PlanOption[]; goal: EngineGoal }> {
    const row = await this.prisma.runnerProfile.findUnique({ where: { userId } });
    if (!row) throw new AppError('NOT_FOUND', '러닝 프로필을 먼저 입력해 주세요.');
    const goal: EngineGoal = { goalDistance: input.goalDistance, goalTimeSec: input.goalTimeSec ?? null, raceDate: input.raceDate ?? null };
    if (goal.raceDate !== null && goal.raceDate <= date) {
      throw new AppError('VALIDATION_ERROR', '입력한 내용을 확인해 주세요.', { fields: { raceDate: '대회 날짜는 내일 이후로 골라 주세요.' } });
    }
    const profile: EngineProfile = {
      experience: row.experience,
      continuousRun: row.continuousRun,
      recentWeeklyKm: row.recentWeeklyKm?.toNumber() ?? null,
      recentPaceSecPerKm: row.recentPaceSecPerKm,
      weeklyRunCount: row.weeklyRunCount,
      preferredWeekdays: row.preferredWeekdays,
    };

    const result = this.engine.generate({ profile, goal, today: date });
    const options = result.options.filter((option) => this.passes(option, { profile, goal, level: result.level }, date));
    if (options.length === 0) {
      throw new AppError('PLAN_NOT_FEASIBLE', '입력한 조건으로는 계획을 만들 수 없어요. 대회 날짜나 달리는 요일을 바꿔 보세요.');
    }
    return { options, goal };
  }

  private passes(option: PlanOption, context: { profile: EngineProfile; goal: EngineGoal; level: RunnerLevel }, date: string): boolean {
    const result = this.engine.validate({
      plan: {
        ...context,
        kind: option.kind,
        startDate: option.startDate,
        endDate: option.endDate,
        sessions: option.sessions.map((session, index) => ({ ...session, id: String(index), completed: false, skipped: false })),
      },
      today: date,
    });
    // 생성기가 이미 검증한 계획이라 여기서 걸리면 생성기의 결함이다
    if (!result.ok) this.logger.error(`생성한 계획이 검증기를 통과하지 못했다: ${option.kind} ${result.violations.join(', ')}`);
    return result.ok;
  }

  private async summarize(plan: TrainingPlan, date: string): Promise<PlanSummary> {
    // 진행률은 대회와 생략한 훈련을 세지 않는다(DATABASE §3.4)
    const counted = { planId: plan.id, userId: plan.userId, isSkipped: false, type: { not: 'race' } } as const;
    const [total, completed] = await Promise.all([
      this.prisma.plannedSession.count({ where: counted }),
      this.prisma.plannedSession.count({ where: { ...counted, workout: { isNot: null } } }),
    ]);
    return {
      id: plan.id,
      kind: plan.kind,
      goalDistance: plan.goalDistance,
      goalTimeSec: plan.goalTimeSec,
      raceDate: plan.raceDate ? toDateString(plan.raceDate) : null,
      startDate: toDateString(plan.startDate),
      endDate: toDateString(plan.endDate),
      version: plan.version,
      warnings: plan.warnings as PlanWarning[],
      progress: { completed, total },
      isFinished: isFinished(plan, date),
    };
  }
}

/** 종료일이 지났는지(F03-R08). 종료일 당일은 아직 진행 중이다. */
const isFinished = (plan: Pick<TrainingPlan, 'endDate'>, date: string) => toDateString(plan.endDate) < date;
