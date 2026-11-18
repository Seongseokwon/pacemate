-- 목표 없음 계획은 기초 훈련 계획 또는 유지 계획이고 목표 기록과 대회 날짜가 없다. 유지 계획은 목표 없음으로만 저장한다(DATABASE §6, F03-R10)
ALTER TABLE "training_plans" DROP CONSTRAINT "training_plans_goal_none_check";
ALTER TABLE "training_plans"
  ADD CONSTRAINT "training_plans_goal_none_check" CHECK (
    "goal_distance" <> 'none' OR ("kind" IN ('base_building', 'maintenance') AND "goal_time_sec" IS NULL AND "race_date" IS NULL)
  );
ALTER TABLE "training_plans"
  ADD CONSTRAINT "training_plans_maintenance_check" CHECK ("kind" <> 'maintenance' OR "goal_distance" = 'none');
