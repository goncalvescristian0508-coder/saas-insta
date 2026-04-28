CREATE TABLE IF NOT EXISTS "UserApifyToken" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "label"     TEXT NOT NULL DEFAULT '',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserApifyToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserApifyToken_userId_idx" ON "UserApifyToken"("userId");

CREATE TABLE IF NOT EXISTS "UserIntegration" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "config"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserIntegration_userId_type_key" ON "UserIntegration"("userId", "type");
CREATE INDEX IF NOT EXISTS "UserIntegration_userId_idx" ON "UserIntegration"("userId");
