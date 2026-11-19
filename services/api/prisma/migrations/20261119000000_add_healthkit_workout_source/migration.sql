ALTER TYPE "workout_source" ADD VALUE 'healthkit';
ALTER TABLE "workout_logs" ADD COLUMN "average_heart_rate" INTEGER CHECK ("average_heart_rate" > 0 AND "average_heart_rate" <= 300);
