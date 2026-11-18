-- 놓친 훈련이 많은 주의 일정 변경은 승인해도 이용량을 차감하지 않는다(PRD §8.2, DATABASE §3.7)
ALTER TABLE "change_proposals" ADD COLUMN "quota_exempt" BOOLEAN NOT NULL DEFAULT false;
