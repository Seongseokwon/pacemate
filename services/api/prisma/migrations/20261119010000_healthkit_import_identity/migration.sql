CREATE TABLE "healthkit_imports" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "external_id" UUID NOT NULL,
  PRIMARY KEY ("user_id", "external_id")
);
ALTER TABLE "healthkit_imports" ENABLE ROW LEVEL SECURITY;
