ALTER TABLE "users" ADD COLUMN "identity_hash" TEXT;
CREATE UNIQUE INDEX "users_identity_hash_key" ON "users"("identity_hash");
CREATE TABLE "usage_trials" (
  "identity_hash" TEXT PRIMARY KEY,
  "chat_count" INTEGER NOT NULL DEFAULT 0 CHECK ("chat_count" >= 0),
  "reschedule_count" INTEGER NOT NULL DEFAULT 0 CHECK ("reschedule_count" >= 0),
  "account_deleted_at" TIMESTAMPTZ(3)
);
ALTER TABLE "usage_trials" ENABLE ROW LEVEL SECURITY;
