import { Inject, Injectable } from '@nestjs/common';
import {
  goalChangePayloadSchema,
  MISSED_SESSIONS_FOR_ADJUSTMENT,
  reschedulePayloadSchema,
  WORKOUT_LIMITS,
  workoutLogPayloadSchema,
  type ApproveProposalResponse,
  type GoalChangePayload,
  type GoalChangeRequest,
  type GoalDistance,
  type Proposal,
  type ProposalChange,
  type ProposalFailureCode,
  type ProposeGoalChangeInput,
  type ProposeRescheduleInput,
  type ProposeWorkoutLogInput,
  type ReschedulePayload,
  type SaveProfileRequest,
  type WorkoutLogPayload,
} from '@pacemate/shared';
import type { ChangeRequest, ClassifyLevel, EngineGoal, PlanSessionState, PlanState } from '@pacemate/training-engine';
import { AppError } from '../common/app-error.js';
import { addDays, daysBetween, mondayOf, toDateString, toDbDate } from '../common/dates.js';
import { today } from '../common/today.js';
import { PrismaService } from '../db/prisma.service.js';
import { Prisma, type ChangeProposal, type RunnerProfile, type TrainingPlan } from '../generated/prisma/client.js';
import { TRAINING_ENGINE, type TrainingEngine } from '../plan/training-engine.js';
import { LEVEL_CLASSIFIER } from '../profile/level-classifier.js';
import { paceOf } from '../profile/profile.service.js';
import { UsageService } from '../usage/usage.service.js';
import { engineProfileOf, planStateOf, sessionStateOf, snapshotOf, type SessionWithWorkout } from './plan-state.js';
import { GOAL_CHANGE_MIN_WEEKS_WITH_RECORDS, GOAL_CHANGE_RECENT_WEEKS, SERVICE_UTC_OFFSET } from './proposal.config.js';
import { consumesQuota, toChatMessage, toProposal } from './proposal.mapper.js';
import { APPROVE_ERRORS, FAILURE_MESSAGES, reasonLineOf, RESULT_MESSAGES } from './proposal-text.js';

type Db = Prisma.TransactionClient;

/** 제안 도구(API_SPEC §6)와 마이페이지가 받는 결과 */
export type CreateResult =
  /** `superseded`는 이 제안이 대체한 대기 제안. 채팅이 실패하면 되돌린다(DI-05) */
  | { created: true; proposal: Proposal; superseded: string[] }
  | { created: false; reasonCode: ProposalFailureCode; message: string };

/** 목표·프로필 변경의 입력. 채팅(`propose_goal_change`)과 마이페이지(`POST /v1/proposals/goal-change`)를 같은 형식으로 모은다 */
type GoalChangeInput = {
  goal?: { goalDistance?: GoalDistance | undefined; goalTimeSec?: number | null | undefined; raceDate?: string | null | undefined } | undefined;
  profile?: Partial<SaveProfileRequest> | undefined;
  /** "요즘 일주일에 얼마나 달려요?"의 답. 최근 기록이 부족할 때만 쓴다(F02-R09) */
  recentWeeklyKm?: number | undefined;
};

type Loaded = { plan: TrainingPlan; profile: RunnerProfile; sessions: SessionWithWorkout[] };

/**
 * 채팅에서 제안을 만들 때, 사용자 잠금을 잡은 같은 트랜잭션 안에서 부르는 확인. 던지면 제안을 만들지 않는다.
 * 채팅은 이 메시지가 아직 처리 중인지 확인해, 오래되어 실패로 바뀐 처리가 새 대기 제안을 대체하지 못하게 한다.
 */
export type CreateGuard = (tx: Db) => Promise<void>;

const withWorkoutId = { workout: { select: { id: true } } } as const;
const fail = (reasonCode: ProposalFailureCode): CreateResult => ({ created: false, reasonCode, message: FAILURE_MESSAGES[reasonCode] });

/**
 * 변경 제안의 생성·승인·취소. `planned_sessions`를 고치는 유일한 곳이다(DI-01).
 * 제안을 만들 때는 대기 상태 행만 추가하고, 실제 변경은 승인 트랜잭션에서만 한다(DI-02).
 */
@Injectable()
export class ProposalService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRAINING_ENGINE) private readonly engine: TrainingEngine,
    @Inject(LEVEL_CLASSIFIER) private readonly classifyLevel: ClassifyLevel,
    private readonly usage: UsageService,
  ) {}

  // 생성

  /** 채팅의 일정 변경 제안(F05-R01). 변경안은 Training Engine이 만들고, 저장 전에 검증기로 다시 검사한다(TE-S12). */
  async createReschedule(userId: string, input: ProposeRescheduleInput, guard?: CreateGuard): Promise<CreateResult> {
    const date = today();
    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await guard?.(tx);
      const loaded = await loadActive(tx, userId, date);
      if (!loaded) return fail('NO_ACTIVE_PLAN');
      const state = planStateOf(loaded.plan, loaded.profile, loaded.sessions);
      const result = this.engine.reschedule({ plan: state, request: toChangeRequest(input), reason: input.reason, today: date });
      if (!result.ok) return fail(result.reasonCode);
      const next = applyChanges(state, result.changes);
      if (!next || !this.engine.validate({ plan: next, today: date, change: { previous: state, reason: input.reason } }).ok) return fail('NO_SAFE_OPTION');

      const payload: ReschedulePayload = { changes: result.changes, impact: result.impact, warnings: result.warnings, reasonLine: reasonLineOf(input, date) };
      const { row, superseded } = await insert(tx, date, {
        userId,
        planId: loaded.plan.id,
        type: 'reschedule',
        source: 'chat',
        quotaExempt: await isQuotaExempt(tx, loaded, date),
        basePlanVersion: loaded.plan.version,
        reason: input.reason,
        request: input,
        payload,
      });
      return { created: true, proposal: toProposal(row), superseded };
    });
  }

  /** 채팅의 목표 변경 제안(`propose_goal_change`). 승인하면 AI 일정 변경 1회를 차감한다(PRD §6.5). */
  createGoalChangeFromChat(userId: string, input: ProposeGoalChangeInput, guard?: CreateGuard): Promise<CreateResult> {
    const { recentWeeklyKm, ...goal } = input;
    return this.createGoalChange(userId, { goal, recentWeeklyKm }, 'chat', guard);
  }

  /** 마이페이지의 목표·프로필 변경(`POST /v1/proposals/goal-change`). 차감하지 않는다(PRD §6.5). */
  async createGoalChangeFromSettings(userId: string, input: GoalChangeRequest): Promise<Proposal> {
    const result = await this.createGoalChange(userId, { goal: input.goal, profile: input.profile, recentWeeklyKm: input.profile?.recentWeeklyKm ?? undefined }, 'settings');
    if (result.created) return result.proposal;
    switch (result.reasonCode) {
      case 'NO_ACTIVE_PLAN':
        throw new AppError('NO_ACTIVE_PLAN', '진행 중인 계획이 없어요.');
      case 'RECENT_DISTANCE_REQUIRED':
        throw new AppError('RECENT_DISTANCE_REQUIRED', '요즘 일주일에 얼마나 달리는지 알려 주세요.');
      case 'NO_SAFE_OPTION':
        throw new AppError('PLAN_NOT_FEASIBLE', '입력한 조건으로는 계획을 만들 수 없어요. 대회 날짜나 달리는 요일을 바꿔 보세요.');
      default:
        throw new AppError('VALIDATION_ERROR', result.message);
    }
  }

  /** 채팅의 기록 등록 제안(`propose_workout_log`). 승인하면 기록을 저장한다(AC-F07-05). 차감하지 않는다. */
  async createWorkoutLog(userId: string, input: ProposeWorkoutLogInput, guard?: CreateGuard): Promise<CreateResult> {
    const date = today();
    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await guard?.(tx);
      const distanceKm = new Prisma.Decimal(input.distanceKm).toDecimalPlaces(2).toNumber();
      const pace = input.durationSec / distanceKm;
      if (input.date > date || pace < WORKOUT_LIMITS.paceSecPerKm.min || pace > WORKOUT_LIMITS.paceSecPerKm.max) return fail('INVALID_VALUE');
      const duplicate = await tx.workoutLog.findFirst({ where: { userId, date: toDbDate(input.date), distanceKm, durationSec: input.durationSec }, select: { id: true } });
      if (duplicate) return fail('WORKOUT_DUPLICATE');

      const session = input.sessionId ? await tx.plannedSession.findFirst({ where: { id: input.sessionId, userId }, include: withWorkoutId }) : null;
      if (input.sessionId && (!session || session.isSkipped)) return fail('INVALID_VALUE');
      if (session?.workout) return fail('SESSION_ALREADY_COMPLETED');
      const planId = session?.planId ?? (await tx.trainingPlan.findFirst({ where: { userId, status: 'active' }, select: { id: true } }))?.id ?? null;

      const payload: WorkoutLogPayload = {
        workout: { date: input.date, distanceKm, durationSec: input.durationSec, rpe: input.rpe ?? null, memo: input.memo ?? null, plannedSessionId: session?.id ?? null },
        plannedSession: session ? snapshotOf({ date: toDateString(session.date), type: session.type, distanceKm: session.distanceKm?.toNumber() ?? null, durationMin: session.durationMin }) : null,
      };
      const { row, superseded } = await insert(tx, date, { userId, planId, type: 'workout_log', source: 'chat', quotaExempt: false, basePlanVersion: null, reason: null, request: input, payload });
      return { created: true, proposal: toProposal(row), superseded };
    });
  }

  /**
   * 목표·프로필 변경. 목표를 고치고 오늘 이후의 기록 없는 훈련을 새 계획으로 바꾼다(F02-R09, DATABASE §4).
   * 새 계획은 앱에 쌓인 최근 기록을 최근 주간 거리로 삼아 만든다.
   */
  private async createGoalChange(userId: string, input: GoalChangeInput, source: 'chat' | 'settings', guard?: CreateGuard): Promise<CreateResult> {
    const date = today();
    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await guard?.(tx);
      const loaded = await loadActive(tx, userId, date);
      if (!loaded) return fail('NO_ACTIVE_PLAN');
      const { plan, profile: row, sessions } = loaded;

      const before = goalOf(plan);
      const after = mergeGoal(before, input.goal);
      if (!after || (after.raceDate !== null && after.raceDate <= date)) return fail('INVALID_VALUE');
      const goalChanged = after.goalDistance !== before.goalDistance || after.goalTimeSec !== before.goalTimeSec || after.raceDate !== before.raceDate;

      let profile = engineProfileOf(row);
      let profileUpdate: GoalChangePayload['profileUpdate'] = null;
      if (input.profile && Object.keys(input.profile).length > 0) {
        const { recentRecord, ...fields } = input.profile;
        const recentPaceSecPerKm = recentRecord === undefined ? row.recentPaceSecPerKm : paceOf(recentRecord);
        const recentRecordKm = recentRecord === undefined ? (row.recentRecordKm?.toNumber() ?? null) : recentRecord && 'distanceKm' in recentRecord ? recentRecord.distanceKm : null;
        profile = { ...profile, ...fields, recentPaceSecPerKm };
        if (profile.preferredWeekdays.length < profile.weeklyRunCount) return fail('INVALID_VALUE');
        profileUpdate = { ...profile, recentRecordKm, level: this.classifyLevel(profile) };
      }
      if (!goalChanged && !profileUpdate) return fail('NOTHING_TO_CHANGE');

      // 기록이 충분하면 기록으로, 아니면 다시 물은 값으로 정한다. 프로필만 바꾸면 저장된 값을 쓴다
      const fromRecords = await recentWeeklyKmOf(tx, userId, date);
      const recentWeeklyKm = fromRecords ?? input.recentWeeklyKm ?? (goalChanged ? undefined : profile.recentWeeklyKm);
      if (recentWeeklyKm === undefined) return fail('RECENT_DISTANCE_REQUIRED');

      const generated = this.engine.generate({ profile: { ...profile, recentWeeklyKm }, goal: after, today: date });
      // 기록이 연결된 훈련은 날짜와 관계없이 남긴다(DI-13). 그 날짜에는 새 훈련을 넣지 않는다
      const keptDates = new Set(sessions.filter((s) => s.workout && !s.isSkipped).map((s) => toDateString(s.date)));
      const candidates = generated.options.map((option) => ({ option, sessions: option.sessions.filter((s) => !keptDates.has(s.date)) }));
      const engine = { profile: generated.profile, level: generated.level };
      const planStart = toDateString(plan.startDate);
      const removable = (s: SessionWithWorkout) => toDateString(s.date) >= date && !s.workout;
      const kept = sessions.filter((s) => !removable(s)).map(sessionStateOf);
      const chosen = candidates.find(({ option, sessions: fresh }) =>
        this.passesCombined({ ...engine, goal: after, kind: option.kind, startDate: option.startDate, endDate: option.endDate }, kept, fresh, date),
      );
      if (!chosen) return fail('NO_SAFE_OPTION');

      // 새 훈련의 주 번호는 기존 계획의 첫 주부터 센다. 새 계획이 더 일찍 시작하면 그 주가 첫 주다
      const weekOffset = Math.max(0, daysBetween(mondayOf(planStart), mondayOf(chosen.option.startDate)) / 7);
      const payload: GoalChangePayload = {
        goal: { before, after },
        profileUpdate,
        engine: { ...engine, startDate: chosen.option.startDate, endDate: chosen.option.endDate },
        kind: chosen.option.kind,
        warnings: chosen.option.warnings,
        removeSessions: sessions
          .filter(removable)
          .map((s) => ({ id: s.id, ...snapshotOf({ date: toDateString(s.date), type: s.type, distanceKm: s.distanceKm?.toNumber() ?? null, durationMin: s.durationMin }) })),
        addSessions: chosen.sessions.map(({ date: day, type, distanceKm, durationMin, runIntervalMin, paceRange, weekNumber }) => ({
          date: day, type, distanceKm, durationMin, runIntervalMin, paceRange, weekNumber: weekNumber + weekOffset,
        })),
      };
      const { row: created, superseded } = await insert(tx, date, {
        userId,
        planId: plan.id,
        type: 'goal_change',
        source,
        quotaExempt: false,
        basePlanVersion: plan.version,
        reason: null,
        request: input,
        payload,
      });
      return { created: true, proposal: toProposal(created), superseded };
    });
  }

  // 조회·취소

  async get(userId: string, id: string): Promise<Proposal> {
    const row = await this.prisma.changeProposal.findFirst({ where: { id, userId } });
    if (!row) throw new AppError('NOT_FOUND', APPROVE_ERRORS.notFound);
    return toProposal(row);
  }

  /** 상태만 "취소"로 바꾼다. 데이터와 이용량은 건드리지 않는다(PRD §6.4, AC-F05-03). */
  async cancel(userId: string, id: string): Promise<Proposal> {
    const row = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const locked = await lockProposal(tx, userId, id);
      if (locked.status === 'cancelled') return locked;
      if (locked.status !== 'pending') throw new AppError('PROPOSAL_NOT_PENDING', APPROVE_ERRORS.notPending);
      if (locked.expiresAt <= new Date()) throw new AppError('PROPOSAL_EXPIRED', APPROVE_ERRORS.expired);
      return tx.changeProposal.update({ where: { id }, data: { status: 'cancelled', resolvedAt: new Date() } });
    });
    return toProposal(row);
  }

  /**
   * 채팅 처리가 실패했을 때의 정리(ARCHITECTURE §7.5의 6번). 그 사이 만든 대기 제안을 취소하고, 그 제안들이 대체한 이전 대기 제안을 되돌린다.
   * 사용자는 새 카드를 받지 못했으므로 이전 카드를 계속 쓸 수 있어야 한다. 만료됐거나, 이미 다른 대기 제안이 있거나, 새 제안이 승인됐으면 되돌리지 않는다.
   */
  async discardChatProposals(userId: string, created: string[], superseded: string[]): Promise<void> {
    if (created.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const now = new Date();
      await tx.changeProposal.updateMany({ where: { id: { in: created }, userId, status: 'pending' }, data: { status: 'cancelled', resolvedAt: now } });
      if (await tx.changeProposal.count({ where: { id: { in: created }, userId, status: 'approved' } })) return;
      if (await tx.changeProposal.count({ where: { userId, status: 'pending' } })) return;
      // 처리 중에 만든 제안끼리 대체한 것은 되돌리지 않는다. 남는 것은 처리 전의 대기 제안 하나뿐이다
      const previous = await tx.changeProposal.findFirst({
        where: { id: { in: superseded.filter((id) => !created.includes(id)) }, userId, status: 'superseded', expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
      });
      if (previous) await tx.changeProposal.update({ where: { id: previous.id }, data: { status: 'pending', resolvedAt: null } });
    });
  }

  // 승인

  /**
   * 데이터가 실제로 바뀌는 유일한 지점. 한 트랜잭션에서 검사, 이용량 차감, 변경, 이력, 버전, 상태, 결과 메시지를 처리한다(DI-02, ARCHITECTURE §7.6).
   * 이미 승인된 제안이면 처음 결과를 돌려준다(DI-04).
   */
  async approve(userId: string, id: string): Promise<ApproveProposalResponse> {
    const date = today();
    const messageId = await this.prisma.$transaction(async (tx) => {
      // 화면의 기록 저장과 같은 순서(사용자 → 계획)로 잠근다. 승인이 계획을 잡은 채 사용자 행을 기다리지 않게 한다
      await lockUser(tx, userId);
      const row = await lockProposal(tx, userId, id);
      if (row.status === 'approved') return (row.result as { resultMessageId: string }).resultMessageId;
      if (row.status !== 'pending') throw new AppError('PROPOSAL_NOT_PENDING', APPROVE_ERRORS.notPending);
      if (row.expiresAt <= new Date()) throw new AppError('PROPOSAL_EXPIRED', APPROVE_ERRORS.expired);

      // 검사를 모두 마친 뒤, 변경을 쓰기 전에 차감한다. 한도를 넘으면 전체를 되돌리고 제안은 대기로 남는다
      const charge = async () => {
        if (!consumesQuota(row)) return;
        if (await this.usage.increment(tx, userId, 'reschedule', date)) return;
        throw new AppError('LIMIT_REACHED', APPROVE_ERRORS.limit, { usage: await this.usage.get(userId, date, tx) });
      };
      if (row.type === 'reschedule') await this.applyReschedule(tx, row, date, charge);
      else if (row.type === 'goal_change') await this.applyGoalChange(tx, row, date, charge);
      else await applyWorkoutLog(tx, row, date);

      const message = await tx.chatMessage.create({
        data: { userId, role: 'system', content: RESULT_MESSAGES[row.type], status: 'done', cardType: 'result', cardData: { proposalType: row.type }, proposalId: id },
      });
      await tx.changeProposal.update({ where: { id }, data: { status: 'approved', resolvedAt: new Date(), result: { resultMessageId: message.id } } });
      return message.id;
    });

    const [proposal, message, usage] = await Promise.all([
      this.prisma.changeProposal.findFirstOrThrow({ where: { id, userId } }),
      this.prisma.chatMessage.findFirstOrThrow({ where: { id: messageId, userId } }),
      this.usage.get(userId, date),
    ]);
    return { proposal: toProposal(proposal), resultMessage: toChatMessage(message), usage };
  }

  private async applyReschedule(tx: Db, row: ChangeProposal, date: string, charge: () => Promise<void>): Promise<void> {
    const { plan, profile, sessions } = await lockPlan(tx, row);
    const payload = reschedulePayloadSchema.parse(row.payload);
    const state = planStateOf(plan, profile, sessions);
    // 대상 훈련이 여전히 미완료이고 오늘 이후이며 제안 때와 같은지(PRD §6.4)
    const byId = new Map(state.sessions.map((s) => [s.id, s]));
    for (const change of payload.changes) {
      const current = change.sessionId ? byId.get(change.sessionId) : undefined;
      if (!current || current.completed || current.skipped || current.date < date || !sameSnapshot(current, change.before)) throw targetChanged();
      if (change.after && change.after.date < date) throw targetChanged();
    }
    const next = applyChanges(state, payload.changes);
    if (!next || !this.engine.validate({ plan: next, today: date, change: { previous: state, reason: row.reason ?? 'schedule' } }).ok) {
      throw new AppError('SAFETY_CHECK_FAILED', APPROVE_ERRORS.safety);
    }
    await charge();

    const rows = new Map(sessions.map((s) => [s.id, s]));
    const moving = payload.changes.filter((c) => c.action !== 'skip').map((c) => c.sessionId!);
    // 서로 날짜를 바꾸는 이동이 하루 1훈련 인덱스(TE-S05)에 걸리지 않게 먼저 비운다
    if (moving.length > 0) await tx.plannedSession.updateMany({ where: { id: { in: moving }, userId: row.userId }, data: { isSkipped: true } });
    for (const change of payload.changes) {
      const current = rows.get(change.sessionId!)!;
      const original = (current.original as object | null) ?? change.before!;
      await tx.plannedSession.update({
        where: { id: current.id },
        data:
          change.action === 'skip'
            ? { isSkipped: true, original }
            : { isSkipped: false, original, date: toDbDate(change.after!.date), distanceKm: change.after!.distanceKm, durationMin: change.after!.durationMin },
      });
    }
    await finishPlanChange(tx, row, plan, {
      before: { sessions: payload.changes.map((c) => ({ id: c.sessionId!, ...c.before! })) },
      after: { sessions: payload.changes.filter((c) => c.after).map((c) => ({ id: c.sessionId!, ...c.after! })) },
      reason: payload.reasonLine,
    });
  }

  private async applyGoalChange(tx: Db, row: ChangeProposal, date: string, charge: () => Promise<void>): Promise<void> {
    const { plan, sessions } = await lockPlan(tx, row);
    const payload = goalChangePayloadSchema.parse(row.payload);
    const byId = new Map(sessions.map((s) => [s.id, s]));
    // 지울 훈련에 그 사이 기록이 연결되었으면 다시 요청하게 한다
    if (payload.removeSessions.some((s) => !byId.get(s.id) || byId.get(s.id)!.workout)) throw targetChanged();
    const { engine } = payload;
    const removing = new Set(payload.removeSessions.map((s) => s.id));
    const kept = sessions.filter((s) => !removing.has(s.id)).map(sessionStateOf);
    const context = { profile: engine.profile, level: engine.level, goal: payload.goal.after, kind: payload.kind, startDate: engine.startDate, endDate: engine.endDate };
    if (!this.passesCombined(context, kept, payload.addSessions, date)) throw new AppError('SAFETY_CHECK_FAILED', APPROVE_ERRORS.safety);
    await charge();

    if (payload.profileUpdate) await tx.runnerProfile.update({ where: { userId: row.userId }, data: payload.profileUpdate });
    const removed = await tx.plannedSession.deleteMany({ where: { id: { in: payload.removeSessions.map((s) => s.id) }, userId: row.userId, workout: { is: null } } });
    if (removed.count !== payload.removeSessions.length) throw targetChanged();
    const created = await tx.plannedSession.createManyAndReturn({
      data: payload.addSessions.map((s) => ({
        planId: plan.id,
        userId: row.userId,
        date: toDbDate(s.date),
        type: s.type,
        distanceKm: s.distanceKm,
        durationMin: s.durationMin,
        runIntervalMin: s.runIntervalMin,
        paceMinSecPerKm: s.paceRange?.minSecPerKm ?? null,
        paceMaxSecPerKm: s.paceRange?.maxSecPerKm ?? null,
        weekNumber: s.weekNumber,
      })),
    });
    const { after } = payload.goal;
    await tx.trainingPlan.update({
      where: { id: plan.id },
      data: {
        kind: payload.kind,
        goalDistance: after.goalDistance,
        goalTimeSec: after.goalTimeSec,
        raceDate: after.raceDate === null ? null : toDbDate(after.raceDate),
        startDate: toDbDate(earlier(toDateString(plan.startDate), engine.startDate)),
        endDate: toDbDate(engine.endDate),
        warnings: payload.warnings,
        engineVersion: this.engine.version,
      },
    });
    await finishPlanChange(tx, row, plan, {
      before: { sessions: payload.removeSessions, goal: payload.goal.before },
      after: {
        sessions: created.map((s) => ({ id: s.id, date: toDateString(s.date), type: s.type, distanceKm: s.distanceKm?.toNumber() ?? null, durationMin: s.durationMin })),
        goal: after,
      },
      reason: null,
    });
  }

  /**
   * 새 계획이 시작하는 주부터의 최종 계획이 검증기를 통과하는지(TE-S12, AC-F05-09). 새 훈련과 그 주들에 남는 기록한 훈련을 합친다.
   * 같은 주에 거리·시간 기반이 섞이거나(TE-S14) 남는 훈련 때문에 주간 거리가 넘치는 것을 막는다.
   * 시작 주 전은 새 계획과 같이 최근 주간 거리를 기준으로 본다. 새 계획은 그 값으로 만들었다(F02-R09).
   */
  private passesCombined(context: Omit<PlanState, 'sessions'>, kept: PlanSessionState[], fresh: GoalChangePayload['addSessions'], date: string): boolean {
    if (fresh.length === 0) return false;
    const from = mondayOf(context.startDate);
    const overlapping = kept.filter((s) => s.date >= from);
    const added = fresh.map((s, index) => ({ ...s, id: `new-${index}`, completed: false, skipped: false }));
    return this.engine.validate({ plan: { ...context, sessions: [...overlapping, ...added] }, today: date }).ok;
  }

}

// 트랜잭션 안에서 쓰는 함수

/** 한 사용자의 제안 생성을 줄 세운다. 대기 제안 1건(DI-05)을 지키며 앞의 제안을 대체한다 */
async function lockUser(tx: Db, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

/** 잠금 순서는 항상 사용자 → 제안 → 계획이다(ARCHITECTURE §7.6). 다른 사용자의 제안은 없는 것으로 본다(DI-07) */
async function lockProposal(tx: Db, userId: string, id: string): Promise<ChangeProposal> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM change_proposals WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
  if (locked.length === 0) throw new AppError('NOT_FOUND', APPROVE_ERRORS.notFound);
  return tx.changeProposal.findUniqueOrThrow({ where: { id } });
}

async function lockPlan(tx: Db, row: ChangeProposal): Promise<Loaded> {
  const planChanged = () => new AppError('PLAN_CHANGED', APPROVE_ERRORS.planChanged);
  if (!row.planId) throw planChanged();
  await tx.$queryRaw`SELECT id FROM training_plans WHERE id = ${row.planId}::uuid AND user_id = ${row.userId}::uuid FOR UPDATE`;
  const plan = await tx.trainingPlan.findFirst({ where: { id: row.planId, userId: row.userId } });
  // 버전이 다르면 그 사이 다른 변경이 승인된 것이다(DI-03)
  if (!plan || plan.status !== 'active' || plan.version !== row.basePlanVersion) throw planChanged();
  const profile = await tx.runnerProfile.findUnique({ where: { userId: row.userId } });
  if (!profile) throw planChanged();
  const sessions = await tx.plannedSession.findMany({ where: { planId: plan.id, userId: row.userId }, include: withWorkoutId, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
  return { plan, profile, sessions };
}

/** 진행 중인 계획. 종료일이 지난 계획은 바꾸지 않는다(F03-R08) */
async function loadActive(tx: Db, userId: string, date: string): Promise<Loaded | null> {
  const plan = await tx.trainingPlan.findFirst({ where: { userId, status: 'active' } });
  if (!plan || toDateString(plan.endDate) < date) return null;
  const profile = await tx.runnerProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  const sessions = await tx.plannedSession.findMany({ where: { planId: plan.id, userId }, include: withWorkoutId, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
  return { plan, profile, sessions };
}

type NewProposal = Omit<Prisma.ChangeProposalUncheckedCreateInput, 'status' | 'expiresAt' | 'request' | 'payload'> & { request: object; payload: object };

/** 기존 대기 제안을 대체하고 새 제안을 만든다(DI-05). 만든 날의 자정에 만료된다. 대체한 제안의 ID를 함께 돌려준다 */
async function insert(tx: Db, date: string, data: NewProposal): Promise<{ row: ChangeProposal; superseded: string[] }> {
  const pending = await tx.changeProposal.findMany({ where: { userId: data.userId, status: 'pending' }, select: { id: true } });
  const superseded = pending.map((p) => p.id);
  if (superseded.length > 0) await tx.changeProposal.updateMany({ where: { id: { in: superseded }, userId: data.userId }, data: { status: 'superseded', resolvedAt: new Date() } });
  const row = await tx.changeProposal.create({
    data: { ...data, request: data.request as Prisma.InputJsonValue, payload: data.payload as Prisma.InputJsonValue, status: 'pending', expiresAt: new Date(`${addDays(date, 1)}T00:00:00${SERVICE_UTC_OFFSET}`) },
  });
  return { row, superseded };
}

/**
 * 놓친 훈련이 많은 주의 일정 변경인지(PRD §8.2). 이번 주 미완료가 기준 이상이고, 이번 주에 이 조건으로 승인한 변경이 없어야 한다.
 * 서버가 훈련 상태로 판정한다. LLM이 정하지 않는다.
 */
async function isQuotaExempt(tx: Db, { plan, sessions }: Loaded, date: string): Promise<boolean> {
  const weekStart = mondayOf(date);
  const missed = sessions.filter((s) => {
    const day = toDateString(s.date);
    return day >= weekStart && day < date && !s.isSkipped && !s.workout;
  }).length;
  if (missed < MISSED_SESSIONS_FOR_ADJUSTMENT) return false;
  const used = await tx.changeProposal.count({
    where: { userId: plan.userId, quotaExempt: true, status: 'approved', resolvedAt: { gte: new Date(`${weekStart}T00:00:00${SERVICE_UTC_OFFSET}`) } },
  });
  return used === 0;
}

/**
 * 목표 변경에 쓸 최근 주간 거리. 이번 주 전의 온전한 몇 주 동안의 거리 합을 주 수로 나눠 0.1km로 내림한다.
 * 기록이 있는 주가 부족하면 null이다(F02-R09, DECISIONS.md 2026-11-18).
 */
async function recentWeeklyKmOf(tx: Db, userId: string, date: string): Promise<number | null> {
  const end = mondayOf(date);
  const rows = await tx.workoutLog.findMany({
    where: { userId, date: { gte: toDbDate(addDays(end, -7 * GOAL_CHANGE_RECENT_WEEKS)), lt: toDbDate(end) } },
    select: { date: true, distanceKm: true },
  });
  const weeks = new Set(rows.map((r) => mondayOf(toDateString(r.date))));
  if (weeks.size < GOAL_CHANGE_MIN_WEEKS_WITH_RECORDS) return null;
  const total = rows.reduce((sum, r) => sum + r.distanceKm.toNumber(), 0);
  return Math.min(100, Math.floor((total / GOAL_CHANGE_RECENT_WEEKS) * 10 + 1e-9) / 10);
}

/** 변경 이력 추가, 계획 버전 증가(DI-03, DI-08) */
async function finishPlanChange(tx: Db, row: ChangeProposal, plan: TrainingPlan, log: { before: object; after: object; reason: string | null }): Promise<void> {
  await tx.trainingPlan.update({ where: { id: plan.id }, data: { version: { increment: 1 } } });
  await tx.planChangeLog.create({
    data: {
      userId: row.userId,
      planId: plan.id,
      proposalId: row.id,
      planVersion: plan.version + 1,
      before: log.before as Prisma.InputJsonValue,
      after: log.after as Prisma.InputJsonValue,
      reason: log.reason,
      source: row.source,
    },
  });
}

/**
 * 기록 등록 승인. 계획을 바꾸지 않으므로 변경 이력과 버전은 건드리지 않는다(DATABASE §3.8).
 * 사용자 행은 승인 처음에 잠갔다. 화면의 기록 저장과 같이 계획을 잠근 뒤 훈련과 중복을 다시 확인한다.
 */
async function applyWorkoutLog(tx: Db, row: ChangeProposal, date: string): Promise<void> {
  const { workout } = workoutLogPayloadSchema.parse(row.payload);
  if (workout.date > date) throw targetChanged();
  if (workout.plannedSessionId) {
    const found = await tx.plannedSession.findFirst({ where: { id: workout.plannedSessionId, userId: row.userId }, select: { planId: true } });
    if (!found) throw targetChanged();
    await tx.$queryRaw`SELECT id FROM training_plans WHERE id = ${found.planId}::uuid AND user_id = ${row.userId}::uuid FOR UPDATE`;
    const session = await tx.plannedSession.findFirst({ where: { id: workout.plannedSessionId, userId: row.userId }, include: withWorkoutId });
    if (!session || session.isSkipped || session.workout) throw targetChanged();
  }
  const duplicate = await tx.workoutLog.findFirst({ where: { userId: row.userId, date: toDbDate(workout.date), distanceKm: workout.distanceKm, durationSec: workout.durationSec }, select: { id: true } });
  if (duplicate) throw new AppError('WORKOUT_DUPLICATE', '같은 운동 기록이 이미 있어요. 다시 확인해 주세요.');
  await tx.workoutLog.create({ data: { ...workout, date: toDbDate(workout.date), userId: row.userId, source: 'chat' } });
}

// 순수 함수

const earlier = (a: string, b: string): string => (a < b ? a : b);

const targetChanged = () => new AppError('TARGET_CHANGED', APPROVE_ERRORS.targetChanged);

const goalOf = (plan: TrainingPlan): EngineGoal => ({
  goalDistance: plan.goalDistance,
  goalTimeSec: plan.goalTimeSec,
  raceDate: plan.raceDate ? toDateString(plan.raceDate) : null,
});

/** 바꿀 값만 덮어쓴다. 목표 없음으로 바꾸면 기록과 대회 날짜를 지우고, 그래도 남으면 입력 오류(null)다(API_SPEC §6) */
function mergeGoal(before: EngineGoal, input: GoalChangeInput['goal']): EngineGoal | null {
  const after: EngineGoal = {
    goalDistance: input?.goalDistance ?? before.goalDistance,
    goalTimeSec: input?.goalTimeSec === undefined ? before.goalTimeSec : input.goalTimeSec,
    raceDate: input?.raceDate === undefined ? before.raceDate : input.raceDate,
  };
  if (after.goalDistance !== 'none') return after;
  if (input?.goalDistance === 'none') {
    if (input.goalTimeSec != null || input.raceDate != null) return null;
    return { goalDistance: 'none', goalTimeSec: null, raceDate: null };
  }
  return after.goalTimeSec === null && after.raceDate === null ? after : null;
}

function toChangeRequest(input: ProposeRescheduleInput): ChangeRequest {
  switch (input.changeType) {
    case 'move':
      return { changeType: 'move', sessionId: input.sessionId!, targetDate: input.targetDate! };
    case 'ease':
      return { changeType: 'ease', sessionId: input.sessionId!, easeOption: input.easeOption! };
    case 'unavailable_dates':
      return { changeType: 'unavailable_dates', unavailableDates: input.unavailableDates! };
    case 'reduce_count':
      return { changeType: 'reduce_count', weekStart: input.weekStart!, maxSessions: input.maxSessions! };
  }
}

/** 변경 목록을 계획에 적용한 상태. 일정 변경에 없는 동작이 있으면 null이다 */
function applyChanges(state: PlanState, changes: ProposalChange[]): PlanState | null {
  const byId = new Map(changes.map((c) => [c.sessionId, c]));
  if (changes.some((c) => !['move', 'modify', 'skip'].includes(c.action) || c.sessionId === null)) return null;
  return {
    ...state,
    sessions: state.sessions.map((s) => {
      const change = byId.get(s.id);
      if (!change) return s;
      if (change.action === 'skip') return { ...s, skipped: true };
      return { ...s, date: change.after!.date, distanceKm: change.after!.distanceKm, durationMin: change.after!.durationMin };
    }),
  };
}

const sameSnapshot = (session: PlanSessionState, snapshot: ProposalChange['before']): boolean =>
  snapshot !== null &&
  session.date === snapshot.date &&
  session.type === snapshot.type &&
  session.distanceKm === snapshot.distanceKm &&
  session.durationMin === snapshot.durationMin;
