-- AlterTable
ALTER TABLE "PrivateInstagramAccount" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "PrivateInstagramAccount_userId_idx" ON "PrivateInstagramAccount"("userId");
