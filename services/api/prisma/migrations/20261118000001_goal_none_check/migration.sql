-- 목표 없음 계획은 기초 훈련 계획이고 목표 기록과 대회 날짜가 없다(DATABASE §6, F02-R07, F03-R09).
-- 유지 계획(maintenance)은 T-207에서 이 제약에 더한다
ALTER TABLE "training_plans"
  ADD CONSTRAINT "training_plans_goal_none_check" CHECK (
    "goal_distance" <> 'none' OR ("kind" = 'base_building' AND "goal_time_sec" IS NULL AND "race_date" IS NULL)
  );
