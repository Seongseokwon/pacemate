import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { createTestPrisma, resetDatabase } from './test-db.js';

const prisma = createTestPrisma();
const USER = '11111111-1111-4111-8111-111111111111';
const day = (date: string) => new Date(`${date}T00:00:00Z`);

async function createUser(id = USER) {
  const now = new Date();
  return prisma.user.create({
    data: {
      id,
      authProvider: 'apple',
      termsAgreedAt: now,
      privacyAgreedAt: now,
      healthDataAgreedAt: now,
      consentVersion: '1',
    },
  });
}

const createPlan = (status: 'active' | 'ended' = 'active') =>
  prisma.trainingPlan.create({
    data: {
      userId: USER,
      status,
      goalDistance: 'half',
      startDate: day('2026-11-16'),
      endDate: day('2027-02-07'),
      engineVersion: 'test',
    },
  });

const createSession = (planId: string, data: { date?: string; isSkipped?: boolean; distanceKm?: number | null } = {}) =>
  prisma.plannedSession.create({
    data: {
      planId,
      userId: USER,
      date: day(data.date ?? '2026-11-19'),
      type: 'easy',
      distanceKm: data.distanceKm === undefined ? 5 : data.distanceKm,
      weekNumber: 1,
      isSkipped: data.isSkipped ?? false,
    },
  });

const createWorkout = (data: { plannedSessionId?: string; distanceKm?: number; condition?: number } = {}) =>
  prisma.workoutLog.create({
    data: { userId: USER, date: day('2026-11-19'), distanceKm: 5, durationSec: 1920, source: 'app', ...data },
  });

const createProposal = (status: 'pending' | 'approved' = 'pending') =>
  prisma.changeProposal.create({
    data: {
      userId: USER,
      type: 'reschedule',
      source: 'chat',
      status,
      request: {},
      payload: {},
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

const createUserMessage = (status: 'processing' | 'done') =>
  prisma.chatMessage.create({
    data: { userId: USER, role: 'user', content: '안녕', status, clientMessageId: crypto.randomUUID() },
  });

beforeEach(async () => {
  await resetDatabase(prisma);
  await createUser();
});

afterAll(() => prisma.$disconnect());

describe('인덱스 (DATABASE.md §5)', () => {
  // [테이블, 컬럼, 유일 여부, 조건]
  const expected: [string, string, boolean, string?][] = [
    ['training_plans', '(user_id)', true, "status = 'active'"],
    ['planned_sessions', '(plan_id, date)', true, 'is_skipped = false'],
    ['planned_sessions', '(user_id, date)', false],
    ['workout_logs', '(planned_session_id)', true],
    ['workout_logs', '(user_id, date)', false],
    ['chat_messages', '(user_id, client_message_id)', true],
    ['chat_messages', '(user_id)', true, "status = 'processing'"],
    ['chat_messages', '(user_id, created_at)', false],
    ['change_proposals', '(user_id)', true, "status = 'pending'"],
    ['plan_change_logs', '(proposal_id)', true],
    ['ai_call_logs', '(user_id, created_at)', false],
    ['ai_call_logs', '(created_at)', false],
  ];

  test.each(expected)('%s %s', async (table, columns, unique, where) => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}`;
    const found = rows.some(({ indexdef }) => {
      const [head = '', predicate] = indexdef.split(' WHERE ');
      return (
        head.endsWith(`USING btree ${columns}`) &&
        head.startsWith(unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX') &&
        (where ? (predicate ?? '').includes(where) : predicate === undefined)
      );
    });
    expect(found).toBe(true);
  });
});

describe('행 수준 보안 (DATABASE.md §1)', () => {
  test('public 스키마의 모든 테이블에 RLS가 켜져 있고 정책이 없다', async () => {
    const tables = await prisma.$queryRaw<{ name: string; rls: boolean }[]>`
      SELECT c.relname AS name, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`;
    const policies = await prisma.$queryRaw<unknown[]>`SELECT 1 FROM pg_policies WHERE schemaname = 'public'`;

    expect(tables.length).toBeGreaterThanOrEqual(17);
    expect(tables.filter((t) => !t.rls).map((t) => t.name)).toEqual([]);
    expect(policies).toEqual([]);
  });

  test('테이블 권한을 받은 다른 역할도 행을 읽거나 쓸 수 없다', async () => {
    // Supabase의 공개 키 역할처럼 테이블 권한은 있지만 소유자가 아닌 역할을 흉내 낸다
    await prisma.$executeRawUnsafe('DROP ROLE IF EXISTS rls_probe');
    await prisma.$executeRawUnsafe('CREATE ROLE rls_probe NOLOGIN');
    try {
      await prisma.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO rls_probe');
      await prisma.$executeRawUnsafe('GRANT ALL ON ALL TABLES IN SCHEMA public TO rls_probe');

      const visible = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE rls_probe');
        return tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM users`;
      });
      expect(visible[0]?.count).toBe(0n);

      const write = prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE rls_probe');
        await tx.$executeRaw`INSERT INTO usage_counters (user_id, month) VALUES (${USER}::uuid, '2026-11')`;
      });
      await expect(write).rejects.toThrow(/row-level security/);
    } finally {
      await prisma.$executeRawUnsafe('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM rls_probe');
      await prisma.$executeRawUnsafe('REVOKE USAGE ON SCHEMA public FROM rls_probe');
      await prisma.$executeRawUnsafe('DROP ROLE rls_probe');
    }
  });
});

describe('정합성 제약 (DATABASE.md §6)', () => {
  test('DI-13: 사용자당 활성 계획은 하나다. 종료된 계획은 여러 개 있을 수 있다', async () => {
    await createPlan('ended');
    await createPlan('ended');
    await createPlan('active');
    await expect(createPlan('active')).rejects.toThrow();
  });

  test('TE-S05: 한 계획의 같은 날에 훈련은 하나다. 생략된 훈련은 세지 않는다', async () => {
    const plan = await createPlan();
    await createSession(plan.id, { isSkipped: true });
    await createSession(plan.id);
    await expect(createSession(plan.id)).rejects.toThrow();
  });

  test('DI-10: 훈련 하나에 기록은 하나만 연결된다', async () => {
    const session = await createSession((await createPlan()).id);
    await createWorkout({ plannedSessionId: session.id });
    await expect(createWorkout({ plannedSessionId: session.id })).rejects.toThrow();
    // 연결하지 않은 자유 러닝은 여러 개 있을 수 있다
    await createWorkout();
    await createWorkout();
  });

  test('DI-05: 사용자당 대기 제안은 하나다', async () => {
    await createProposal('approved');
    await createProposal('pending');
    await expect(createProposal('pending')).rejects.toThrow();
  });

  test('사용자당 처리 중인 메시지는 하나다', async () => {
    await createUserMessage('done');
    await createUserMessage('processing');
    await expect(createUserMessage('processing')).rejects.toThrow();
  });

  test('같은 클라이언트 메시지 ID는 한 번만 저장된다', async () => {
    const data = { userId: USER, role: 'user', content: '안녕', status: 'done', clientMessageId: crypto.randomUUID() } as const;
    await prisma.chatMessage.create({ data });
    await expect(prisma.chatMessage.create({ data })).rejects.toThrow();
  });

  test('범위를 벗어난 값은 저장되지 않는다', async () => {
    const plan = await createPlan();
    await expect(createWorkout({ distanceKm: 0 })).rejects.toThrow();
    await expect(createWorkout({ condition: 6 })).rejects.toThrow();
    // 거리와 시간이 모두 없는 훈련
    await expect(createSession(plan.id, { distanceKm: null })).rejects.toThrow();
  });
});

describe('계정 삭제 (DATABASE.md §7, DI-11)', () => {
  test('사용자를 지우면 개인 데이터가 함께 지워지고, 비용 기록과 결제 이벤트는 사용자 없이 남는다', async () => {
    const plan = await createPlan();
    const session = await createSession(plan.id);
    await createWorkout({ plannedSessionId: session.id });
    await createProposal();
    await createUserMessage('done');
    await prisma.aiCallLog.create({
      data: {
        userId: USER,
        purpose: 'chat',
        model: 'test',
        promptVersion: '1',
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.0001,
        toolCallCount: 0,
        success: true,
        latencyMs: 100,
      },
    });
    await prisma.subscriptionEvent.create({ data: { eventId: 'evt_1', userId: USER, type: 'RENEWAL', payload: {} } });

    await prisma.user.delete({ where: { id: USER } });

    expect(await prisma.trainingPlan.count()).toBe(0);
    expect(await prisma.plannedSession.count()).toBe(0);
    expect(await prisma.workoutLog.count()).toBe(0);
    expect(await prisma.changeProposal.count()).toBe(0);
    expect(await prisma.chatMessage.count()).toBe(0);
    expect(await prisma.aiCallLog.findMany({ select: { userId: true } })).toEqual([{ userId: null }]);
    expect(await prisma.subscriptionEvent.findMany({ select: { userId: true } })).toEqual([{ userId: null }]);
  });
});
