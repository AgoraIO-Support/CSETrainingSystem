-- CreateEnum
CREATE TYPE "TranscriptJobState" AS ENUM ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCELED', 'STALE');

-- CreateTable
CREATE TABLE "transcript_processing_jobs" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "state" "TranscriptJobState" NOT NULL DEFAULT 'QUEUED',
    "stage" "TranscriptStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "processedChunks" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "workerId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcript_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_processing_job_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "stage" "TranscriptStatus",
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_processing_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcript_processing_jobs_transcriptId_idx" ON "transcript_processing_jobs"("transcriptId");

-- CreateIndex
CREATE INDEX "transcript_processing_jobs_lessonId_idx" ON "transcript_processing_jobs"("lessonId");

-- CreateIndex
CREATE INDEX "transcript_processing_jobs_state_scheduledAt_idx" ON "transcript_processing_jobs"("state", "scheduledAt");

-- CreateIndex
CREATE INDEX "transcript_processing_jobs_leaseExpiresAt_idx" ON "transcript_processing_jobs"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "transcript_processing_job_events_jobId_createdAt_idx" ON "transcript_processing_job_events"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "transcript_processing_jobs" ADD CONSTRAINT "transcript_processing_jobs_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcript_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_processing_jobs" ADD CONSTRAINT "transcript_processing_jobs_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_processing_job_events" ADD CONSTRAINT "transcript_processing_job_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "transcript_processing_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

