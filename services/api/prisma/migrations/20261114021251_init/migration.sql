-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('apple', 'google');

-- CreateEnum
CREATE TYPE "experience" AS ENUM ('none', 'under_6m', 'under_2y', 'over_2y');

-- CreateEnum
CREATE TYPE "continuous_run" AS ENUM ('under_10m', 'under_30m', 'under_60m', 'over_60m');

-- CreateEnum
CREATE TYPE "runner_level" AS ENUM ('beginner', 'novice', 'intermediate');

-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "goal_distance" AS ENUM ('five_k', 'ten_k', 'half');

-- CreateEnum
CREATE TYPE "session_type" AS ENUM ('walk_run', 'easy', 'tempo', 'long', 'race');

-- CreateEnum
CREATE TYPE "workout_source" AS ENUM ('app', 'chat');

-- CreateEnum
CREATE TYPE "chat_role" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "chat_message_status" AS ENUM ('processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "chat_card_type" AS ENUM ('proposal', 'plan_summary', 'weekly_summary', 'limit', 'result');

-- CreateEnum
CREATE TYPE "proposal_type" AS ENUM ('reschedule', 'goal_change', 'workout_log');

-- CreateEnum
CREATE TYPE "proposal_source" AS ENUM ('chat', 'settings');

-- CreateEnum
CREATE TYPE "proposal_status" AS ENUM ('pending', 'approved', 'cancelled', 'superseded');

-- CreateEnum
CREATE TYPE "proposal_reason" AS ENUM ('schedule', 'fatigue', 'pain');

-- CreateEnum
CREATE TYPE "store" AS ENUM ('app_store', 'play_store');

-- CreateEnum
CREATE TYPE "ai_call_purpose" AS ENUM ('chat', 'weekly_feedback');

-- CreateEnum
CREATE TYPE "push_platform" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('workout_reminder', 'missed_notice', 'weekly_summary');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_provider" "auth_provider" NOT NULL,
    "terms_agreed_at" TIMESTAMPTZ(3) NOT NULL,
    "privacy_agreed_at" TIMESTAMPTZ(3) NOT NULL,
    "health_data_agreed_at" TIMESTAMPTZ(3) NOT NULL,
    "consent_version" TEXT NOT NULL,
    "deletion_requested_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runner_profiles" (
    "user_id" UUID NOT NULL,
    "experience" "experience" NOT NULL,
    "continuous_run" "continuous_run" NOT NULL,
    "recent_weekly_km" DECIMAL(5,1),
    "recent_pace_sec_per_km" INTEGER,
    "recent_record_km" DECIMAL(5,2),
    "weekly_run_count" SMALLINT NOT NULL,
    "preferred_weekdays" SMALLINT[],
    "level" "runner_level" NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "runner_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "training_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "plan_status" NOT NULL,
    "goal_distance" "goal_distance" NOT NULL,
    "goal_time_sec" INTEGER,
    "race_date" DATE,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "engine_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "session_type" NOT NULL,
    "distance_km" DECIMAL(4,1),
    "duration_min" SMALLINT,
    "pace_min_sec_per_km" INTEGER,
    "pace_max_sec_per_km" INTEGER,
    "week_number" SMALLINT NOT NULL,
    "is_skipped" BOOLEAN NOT NULL DEFAULT false,
    "original" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planned_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "distance_km" DECIMAL(5,2) NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "condition" SMALLINT,
    "rpe" SMALLINT,
    "memo" TEXT,
    "planned_session_id" UUID,
    "source" "workout_source" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role" "chat_role" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "chat_message_status" NOT NULL,
    "client_message_id" UUID,
    "card_type" "chat_card_type",
    "card_data" JSONB,
    "proposal_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "plan_id" UUID,
    "type" "proposal_type" NOT NULL,
    "source" "proposal_source" NOT NULL,
    "status" "proposal_status" NOT NULL,
    "base_plan_version" INTEGER,
    "reason" "proposal_reason",
    "request" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "change_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_change_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "source" "proposal_source" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "user_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "store" "store" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "will_renew" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "event_id" TEXT NOT NULL,
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "user_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "chat_count" INTEGER NOT NULL DEFAULT 0,
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("user_id","month")
);

-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "purpose" "ai_call_purpose" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cached_input_tokens" INTEGER,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "tool_call_count" SMALLINT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_code" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_summaries" (
    "user_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "planned_count" SMALLINT NOT NULL,
    "completed_count" SMALLINT NOT NULL,
    "total_distance_km" DECIMAL(6,2) NOT NULL,
    "ai_feedback" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("user_id","week_start")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "user_id" UUID NOT NULL,
    "workout_reminder" BOOLEAN NOT NULL DEFAULT true,
    "reminder_hour" SMALLINT NOT NULL DEFAULT 8,
    "missed_notice" BOOLEAN NOT NULL DEFAULT true,
    "weekly_summary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "push_platform" NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "date" DATE NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("user_id","type","date")
);

-- CreateIndex
CREATE INDEX "planned_sessions_user_id_date_idx" ON "planned_sessions"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "workout_logs_planned_session_id_key" ON "workout_logs"("planned_session_id");

-- CreateIndex
CREATE INDEX "workout_logs_user_id_date_idx" ON "workout_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "chat_messages_user_id_created_at_idx" ON "chat_messages"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_user_id_client_message_id_key" ON "chat_messages"("user_id", "client_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_change_logs_proposal_id_key" ON "plan_change_logs"("proposal_id");

-- CreateIndex
CREATE INDEX "ai_call_logs_user_id_created_at_idx" ON "ai_call_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_call_logs_created_at_idx" ON "ai_call_logs"("created_at");

-- AddForeignKey
ALTER TABLE "runner_profiles" ADD CONSTRAINT "runner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_planned_session_id_fkey" FOREIGN KEY ("planned_session_id") REFERENCES "planned_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "change_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_logs" ADD CONSTRAINT "plan_change_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_logs" ADD CONSTRAINT "plan_change_logs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_logs" ADD CONSTRAINT "plan_change_logs_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "change_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_summaries" ADD CONSTRAINT "weekly_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 아래는 Prisma 스키마로 표현할 수 없어 직접 쓴 부분이다(docs/DATABASE.md §5, §6).
-- ---------------------------------------------------------------------------

-- 부분 유일 인덱스
-- 사용자당 활성 계획 1개(DI-13)
CREATE UNIQUE INDEX "training_plans_one_active_per_user" ON "training_plans"("user_id") WHERE "status" = 'active';
-- 하루에 훈련 1개(TE-S05). 생략된 훈련은 세지 않는다
CREATE UNIQUE INDEX "planned_sessions_one_per_day" ON "planned_sessions"("plan_id", "date") WHERE "is_skipped" = false;
-- 사용자당 처리 중인 메시지 1건(ARCHITECTURE §7.5)
CREATE UNIQUE INDEX "chat_messages_one_processing_per_user" ON "chat_messages"("user_id") WHERE "status" = 'processing';
-- 사용자당 대기 제안 1건(DI-05)
CREATE UNIQUE INDEX "change_proposals_one_pending_per_user" ON "change_proposals"("user_id") WHERE "status" = 'pending';

-- 체크 제약
ALTER TABLE "runner_profiles"
  ADD CONSTRAINT "runner_profiles_weekly_run_count_check" CHECK ("weekly_run_count" BETWEEN 2 AND 5),
  ADD CONSTRAINT "runner_profiles_recent_weekly_km_check" CHECK ("recent_weekly_km" BETWEEN 0 AND 100),
  ADD CONSTRAINT "runner_profiles_preferred_weekdays_check" CHECK (
    "preferred_weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
    AND cardinality("preferred_weekdays") >= "weekly_run_count"
  );

ALTER TABLE "training_plans"
  ADD CONSTRAINT "training_plans_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "training_plans_dates_check" CHECK ("end_date" >= "start_date");

ALTER TABLE "planned_sessions"
  ADD CONSTRAINT "planned_sessions_distance_or_duration_check" CHECK ("distance_km" IS NOT NULL OR "duration_min" IS NOT NULL);

ALTER TABLE "workout_logs"
  ADD CONSTRAINT "workout_logs_distance_km_check" CHECK ("distance_km" BETWEEN 0.1 AND 100),
  ADD CONSTRAINT "workout_logs_duration_sec_check" CHECK ("duration_sec" BETWEEN 60 AND 43200),
  ADD CONSTRAINT "workout_logs_condition_check" CHECK ("condition" BETWEEN 1 AND 5),
  ADD CONSTRAINT "workout_logs_rpe_check" CHECK ("rpe" BETWEEN 1 AND 10),
  ADD CONSTRAINT "workout_logs_memo_check" CHECK (char_length("memo") <= 500);

ALTER TABLE "usage_counters"
  ADD CONSTRAINT "usage_counters_month_check" CHECK ("month" ~ '^\d{4}-\d{2}$'),
  ADD CONSTRAINT "usage_counters_counts_check" CHECK ("chat_count" >= 0 AND "reschedule_count" >= 0);

ALTER TABLE "notification_settings"
  ADD CONSTRAINT "notification_settings_reminder_hour_check" CHECK ("reminder_hour" BETWEEN 8 AND 20);

-- 행 수준 보안(DATABASE.md §1)
-- Supabase는 public 스키마의 테이블을 자동 생성 API로 노출한다. 모든 테이블에 RLS를 켜고 정책을 만들지 않아
-- 앱에 들어가는 공개 키로는 어떤 행도 읽거나 쓸 수 없게 한다. API는 테이블 소유자로 접속해 RLS를 거치지 않는다.
-- 새 테이블을 추가하는 마이그레이션에는 반드시 같은 줄을 넣는다(테스트가 확인한다).
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "runner_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planned_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workout_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "change_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_change_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_call_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_logs" ENABLE ROW LEVEL SECURITY;
-- Prisma가 마이그레이션 기록에 쓰는 테이블도 같은 스키마에 있다.
-- 변경 내용을 계산하는 임시 DB에는 이 테이블이 없어서 IF EXISTS를 붙인다
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
