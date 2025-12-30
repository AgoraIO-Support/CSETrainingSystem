-- Exam Certificate Templates + Certificate revoke/reissue support
-- Defensive migration to tolerate drift between environments.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CertificateStatus" AS ENUM ('ISSUED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CertificateBadgeMode" AS ENUM ('AUTO', 'UPLOADED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_certificate_templates" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "badgeMode" "CertificateBadgeMode" NOT NULL DEFAULT 'AUTO',
    "badgeS3Key" TEXT,
    "badgeMimeType" TEXT,
    "badgeStyle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_certificate_templates_pkey" PRIMARY KEY ("id")
);

-- Unique index for 1:1 exam <-> template
CREATE UNIQUE INDEX IF NOT EXISTS "exam_certificate_templates_examId_key" ON "exam_certificate_templates"("examId");

-- Foreign key to exams
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_certificate_templates_examId_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "exam_certificate_templates" ADD CONSTRAINT "exam_certificate_templates_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE';
  END IF;
END $$;

-- AlterTable: certificates
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "attemptId" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "pdfS3Key" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED';
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "revokedById" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "certificateTitle" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "badgeMode" "CertificateBadgeMode";
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "badgeS3Key" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "badgeMimeType" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "badgeStyle" JSONB;

-- Indexes
CREATE INDEX IF NOT EXISTS "certificates_status_idx" ON "certificates"("status");
CREATE INDEX IF NOT EXISTS "certificates_revokedById_idx" ON "certificates"("revokedById");
CREATE INDEX IF NOT EXISTS "certificates_attemptId_idx" ON "certificates"("attemptId");

-- Foreign keys
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certificates_revokedById_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certificates_attemptId_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "certificates" ADD CONSTRAINT "certificates_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE';
  END IF;
END $$;

