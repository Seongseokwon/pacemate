import { Injectable } from '@nestjs/common';
import { WORKOUT_COACH_LINE, WORKOUT_LIMITS, WORKOUT_PAIN_COACH_LINE, type CreateWorkoutRequest, type HealthkitWorkoutRequest, type ListQuery, type UpdateWorkoutRequest } from '@pacemate/shared';
import { AppError } from '../common/app-error.js';
import { addDays, mondayOf, toDateString, toDbDate } from '../common/dates.js';
import { today } from '../common/today.js';
import { PrismaService } from '../db/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { toSession, toWorkout } from '../plan/session.mapper.js';
import { representativeWorkouts, workoutGroups } from './similar.js';

const missing = () => new AppError('NOT_FOUND', '기록을 찾을 수 없어요.');

@Injectable()
export class WorkoutService {
  constructor(private readonly db: PrismaService) {}

  async list(userId: string, { before, limit }: ListQuery) {
    const cursor = before ? await this.db.workoutLog.findFirst({ where: { id: before, userId } }) : null;
    if (before && !cursor) throw missing();
    const rows = await this.db.workoutLog.findMany({
      where: { userId, ...(cursor && { OR: [{ date: { lt: cursor.date } }, { date: cursor.date, createdAt: { lt: cursor.createdAt } }, { date: cursor.date, createdAt: cursor.createdAt, id: { lt: cursor.id } }] }) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const related = await this.db.workoutLog.findMany({ where: { userId, date: { in: page.map((row) => row.date) } } });
    const counts = new Map(workoutGroups(related).flatMap((group) => group.map((row) => [row.id, group.length - 1] as const)));
    return { items: page.map((row) => ({ ...toWorkout(row), similarCount: counts.get(row.id) ?? 0 })), hasMore: rows.length > limit };
  }

  async get(userId: string, id: string) {
    const row = await this.db.workoutLog.findFirst({ where: { id, userId } });
    if (!row) throw missing();
    return toWorkout(row);
  }

  async similar(userId: string, id: string) {
    const row = await this.db.workoutLog.findFirst({ where: { id, userId } });
    if (!row) throw missing();
    const rows = await this.db.workoutLog.findMany({ where: { userId, date: row.date } });
    const group = workoutGroups(rows).find((items) => items.some((item) => item.id === id)) ?? [];
    return { items: group.filter((item) => item.id !== id).map(toWorkout) };
  }

  async stats(userId: string) {
    const date = today();
    const aggregate = async (start: string) => {
      const rows = representativeWorkouts(await this.db.workoutLog.findMany({ where: { userId, date: { gte: toDbDate(start), lte: toDbDate(date) } } }));
      return { distanceKm: Math.round(rows.reduce((sum, row) => sum + row.distanceKm.toNumber(), 0) * 100) / 100, count: rows.length };
    };
    const [week, month] = await Promise.all([aggregate(mondayOf(date)), aggregate(`${date.slice(0, 7)}-01`)]);
    return { week, month };
  }

  async candidates(userId: string, date: string) {
    const start = mondayOf(date);
    const rows = await this.db.plannedSession.findMany({ where: { userId, date: { gte: toDbDate(start), lte: toDbDate(addDays(start, 6)) }, isSkipped: false }, include: { workout: { select: { id: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    rows.sort((a, b) => Number(toDateString(b.date) === date) - Number(toDateString(a.date) === date));
    return { items: rows.map((row) => toSession(row, today())) };
  }

  async create(userId: string, input: CreateWorkoutRequest) {
    const row = await this.save(userId, input);
    const date = today();
    const plan = await this.db.trainingPlan.findFirst({ where: { userId, status: 'active' } });
    let weekProgress = null;
    if (plan) {
      const start = mondayOf(date);
      const where = { userId, planId: plan.id, isSkipped: false, type: { not: 'race' as const }, date: { gte: toDbDate(start), lte: toDbDate(addDays(start, 6)) } };
      const [planned, completed] = await Promise.all([this.db.plannedSession.count({ where }), this.db.plannedSession.count({ where: { ...where, workout: { isNot: null } } })]);
      weekProgress = { planned, completed };
    }
    return { workout: toWorkout(row), weekProgress, coachLine: row.memo?.trim() ? WORKOUT_PAIN_COACH_LINE : WORKOUT_COACH_LINE };
  }

  async update(userId: string, id: string, input: UpdateWorkoutRequest) { return toWorkout(await this.save(userId, input, id)); }

  async importHealthkit(userId: string, input: HealthkitWorkoutRequest) {
    if (input.date > today()) throw new AppError('VALIDATION_ERROR', '미래 날짜에는 기록할 수 없어요.');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const distanceKm = new Prisma.Decimal(input.distanceKm).toDecimalPlaces(2);
      const date = toDbDate(input.date);
      const pace = input.durationSec / distanceKm.toNumber();
      if (pace < WORKOUT_LIMITS.paceSecPerKm.min || pace > WORKOUT_LIMITS.paceSecPerKm.max) return { imported: false };
      if (await tx.healthkitImport.findUnique({ where: { userId_externalId: { userId, externalId: input.externalId } } })) return { imported: false };
      await tx.healthkitImport.create({ data: { userId, externalId: input.externalId } });
      await tx.workoutLog.create({ data: { userId, date, distanceKm, durationSec: input.durationSec, averageHeartRate: input.averageHeartRate, source: 'healthkit', startedAt: new Date(input.startedAt), endedAt: new Date(input.endedAt), healthkitId: input.externalId } });
      const plan = await tx.trainingPlan.findFirst({ where: { userId, status: 'active' } });
      if (plan) {
        await tx.$queryRaw`SELECT id FROM training_plans WHERE id = ${plan.id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
        const sessions = await tx.plannedSession.findMany({ where: { userId, planId: plan.id, date, isSkipped: false }, include: { workout: true } });
        const available = sessions.filter((s) => !s.workout || s.workout.autoLinked);
        const records = await tx.workoutLog.findMany({ where: { userId, date, source: 'healthkit', manualLink: false, OR: [{ plannedSessionId: null }, { autoLinked: true }] } });
        const pairs = available.flatMap((session) => records.map((record) => ({ session, record, timeBased: session.distanceKm === null, difference: session.distanceKm !== null ? Math.abs(session.distanceKm.toNumber() - record.distanceKm.toNumber()) : session.durationMin !== null ? Math.abs(session.durationMin * 60 - record.durationSec) : Infinity })));
        pairs.sort((a, b) => Number(a.timeBased) - Number(b.timeBased) || a.difference - b.difference || a.session.id.localeCompare(b.session.id) || (a.record.healthkitId ?? a.record.id).localeCompare(b.record.healthkitId ?? b.record.id));
        await tx.workoutLog.updateMany({ where: { userId, id: { in: records.map((r) => r.id) }, autoLinked: true }, data: { plannedSessionId: null, autoLinked: false } });
        const usedSessions = new Set<string>();
        const usedRecords = new Set<string>();
        for (const pair of pairs) {
          if (usedSessions.has(pair.session.id) || usedRecords.has(pair.record.id)) continue;
          usedSessions.add(pair.session.id); usedRecords.add(pair.record.id);
          await tx.workoutLog.update({ where: { id: pair.record.id }, data: { plannedSessionId: pair.session.id, autoLinked: true } });
        }
      }
      return { imported: true };
    });
  }

  async remove(userId: string, id: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const row = await tx.workoutLog.findFirst({ where: { id, userId }, include: { plannedSession: true } });
      if (!row) throw missing();
      if (row.plannedSession) await tx.$queryRaw`SELECT id FROM training_plans WHERE id = ${row.plannedSession.planId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
      await tx.workoutLog.delete({ where: { id } });
    });
  }

  private async save(userId: string, input: CreateWorkoutRequest | UpdateWorkoutRequest, id?: string) {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const old = id ? await tx.workoutLog.findFirst({ where: { id, userId }, include: { plannedSession: true } }) : null;
        if (id && !old) throw missing();
        const date = input.date ?? (old && toDateString(old.date));
        const distanceKm = input.distanceKm === undefined ? old?.distanceKm.toNumber() : new Prisma.Decimal(input.distanceKm).toDecimalPlaces(2).toNumber();
        const durationSec = input.durationSec ?? old?.durationSec;
        if (!date || distanceKm === undefined || durationSec === undefined) throw new AppError('VALIDATION_ERROR', '입력한 내용을 확인해 주세요.');
        if (date > today()) throw new AppError('VALIDATION_ERROR', '미래 날짜에는 기록할 수 없어요.');
        const pace = durationSec / distanceKm;
        if (!input.confirmPace && (pace < WORKOUT_LIMITS.paceSecPerKm.min || pace > WORKOUT_LIMITS.paceSecPerKm.max)) throw new AppError('PACE_OUT_OF_RANGE', '입력한 거리와 시간을 다시 확인해 주세요.');
        const duplicate = await tx.workoutLog.findFirst({ where: { userId, date: toDbDate(date), distanceKm, durationSec, ...(id && { id: { not: id } }) } });
        if (duplicate && !input.confirmDuplicate && (!old || date !== toDateString(old.date) || distanceKm !== old.distanceKm.toNumber() || durationSec !== old.durationSec)) throw new AppError('WORKOUT_DUPLICATE', '같은 운동 기록이 있어요.');
        const sessionId = input.plannedSessionId === undefined ? old?.plannedSessionId ?? null : input.plannedSessionId;
        const session = sessionId ? await tx.plannedSession.findFirst({ where: { id: sessionId, userId }, include: { workout: true } }) : null;
        if (sessionId && (!session || session.isSkipped)) throw new AppError('NOT_FOUND', '연결할 훈련을 찾을 수 없어요.');
        const planIds = [...new Set([old?.plannedSession?.planId, session?.planId].filter((v): v is string => !!v))].sort();
        for (const planId of planIds) await tx.$queryRaw`SELECT id FROM training_plans WHERE id = ${planId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
        const lockedSession = sessionId ? await tx.plannedSession.findFirst({ where: { id: sessionId, userId }, include: { workout: true } }) : null;
        if (sessionId && (!lockedSession || lockedSession.isSkipped)) throw new AppError('NOT_FOUND', '연결할 훈련을 찾을 수 없어요.');
        if (lockedSession?.workout && lockedSession.workout.id !== id) await tx.workoutLog.update({ where: { id: lockedSession.workout.id }, data: { plannedSessionId: null, autoLinked: false, manualLink: true } });
        const data = { date: toDbDate(date), distanceKm, durationSec, condition: input.condition === undefined ? old?.condition ?? null : input.condition, rpe: input.rpe === undefined ? old?.rpe ?? null : input.rpe, memo: input.memo === undefined ? old?.memo ?? null : input.memo, plannedSessionId: sessionId, autoLinked: input.plannedSessionId === undefined ? old?.autoLinked ?? false : false, manualLink: input.plannedSessionId === undefined ? old?.manualLink ?? false : true, separateRun: 'separateRun' in input ? input.separateRun ?? old?.separateRun ?? false : old?.separateRun ?? false };
        return id ? tx.workoutLog.update({ where: { id }, data }) : tx.workoutLog.create({ data: { ...data, userId, source: 'app' } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError('SESSION_ALREADY_COMPLETED', '이미 기록이 연결된 훈련이에요.');
      throw error;
    }
  }
}
