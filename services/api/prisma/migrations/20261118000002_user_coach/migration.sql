-- 고른 AI 코치(F04-R11). 고르지 않은 사용자의 코치는 온이다(D-15)
CREATE TYPE "coach" AS ENUM ('oni', 'suri', 'bungae');

ALTER TABLE "users" ADD COLUMN "coach" "coach" NOT NULL DEFAULT 'oni';
