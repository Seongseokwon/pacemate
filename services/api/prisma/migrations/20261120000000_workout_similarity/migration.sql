ALTER TABLE "workout_logs"
  ADD COLUMN "started_at" TIMESTAMPTZ(3),
  ADD COLUMN "ended_at" TIMESTAMPTZ(3),
  ADD COLUMN "healthkit_id" UUID,
  ADD COLUMN "auto_linked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "manual_link" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "separate_run" BOOLEAN NOT NULL DEFAULT false;
