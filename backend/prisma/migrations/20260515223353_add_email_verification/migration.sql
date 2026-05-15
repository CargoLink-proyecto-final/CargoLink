-- Add email verification fields. Existing users are grandfathered in as
-- already-verified so the seed accounts and any prior signups continue
-- to work without an extra "verify" step.
ALTER TABLE "users"
  ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "email_verification_token" TEXT,
  ADD COLUMN "email_verification_token_exp" TIMESTAMP(3);

UPDATE "users" SET "email_verified" = true;

CREATE UNIQUE INDEX "users_email_verification_token_key"
  ON "users"("email_verification_token");
