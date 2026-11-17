-- CreateEnum
CREATE TYPE "plan_kind" AS ENUM ('race_prep', 'base_building');

-- AlterTable
-- 이미 있는 행은 완주 준비 계획으로 둔다. 새 행은 값을 꼭 넣어야 하므로 기본값은 지운다
ALTER TABLE "training_plans" ADD COLUMN "kind" "plan_kind" NOT NULL DEFAULT 'race_prep';
ALTER TABLE "training_plans" ALTER COLUMN "kind" DROP DEFAULT;

-- AlterTable
ALTER TABLE "planned_sessions" ADD COLUMN "run_interval_min" SMALLINT;
