-- Align `certificates` table with current Prisma schema.
-- This migration is intentionally defensive (IF NOT EXISTS) to tolerate drift between environments.

-- Make courseId optional (schema: String?)
ALTER TABLE "certificates" ALTER COLUMN "courseId" DROP NOT NULL;

-- Optional exam relation + certificate metadata (schema additions)
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "examId" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "recipientName" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "examTitle" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "courseTitle" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION;

-- Indexes (schema: @@index([examId]))
CREATE INDEX IF NOT EXISTS "certificates_examId_idx" ON "certificates"("examId");

