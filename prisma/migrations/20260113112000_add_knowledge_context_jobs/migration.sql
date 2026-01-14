-- Add Knowledge Context async job tables (worker-backed KnowledgeContext generation)

-- CreateEnum (idempotent; safe if a previous attempt created them)
DO $$
BEGIN
    CREATE TYPE "KnowledgeContextJobState" AS ENUM ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCELED', 'STALE');
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'type "KnowledgeContextJobState" already exists, skipping';
END $$;

DO $$
BEGIN
    CREATE TYPE "KnowledgeContextJobStage" AS ENUM (
        'PENDING',
        'DOWNLOADING_VTT',
        'GENERATING_XML',
        'STORING_XML',
        'STORING_ANCHORS',
        'UPDATING_CONTEXT',
        'COMPLETED',
        'FAILED'
    );
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'type "KnowledgeContextJobStage" already exists, skipping';
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "knowledge_context_jobs" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "transcriptId" TEXT,
    "state" "KnowledgeContextJobState" NOT NULL DEFAULT 'QUEUED',
    "stage" "KnowledgeContextJobStage" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
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

    CONSTRAINT "knowledge_context_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "knowledge_context_job_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "stage" "KnowledgeContextJobStage",
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_context_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_context_jobs_lessonId_idx" ON "knowledge_context_jobs"("lessonId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_context_jobs_transcriptId_idx" ON "knowledge_context_jobs"("transcriptId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_context_jobs_state_scheduledAt_idx" ON "knowledge_context_jobs"("state", "scheduledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_context_jobs_leaseExpiresAt_idx" ON "knowledge_context_jobs"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "knowledge_context_job_events_jobId_createdAt_idx" ON "knowledge_context_job_events"("jobId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "knowledge_context_jobs" ADD CONSTRAINT "knowledge_context_jobs_lessonId_fkey"
      FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'constraint "knowledge_context_jobs_lessonId_fkey" already exists, skipping';
END $$;

DO $$
BEGIN
    ALTER TABLE "knowledge_context_jobs" ADD CONSTRAINT "knowledge_context_jobs_transcriptId_fkey"
      FOREIGN KEY ("transcriptId") REFERENCES "transcript_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'constraint "knowledge_context_jobs_transcriptId_fkey" already exists, skipping';
END $$;

DO $$
BEGIN
    ALTER TABLE "knowledge_context_job_events" ADD CONSTRAINT "knowledge_context_job_events_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "knowledge_context_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'constraint "knowledge_context_job_events_jobId_fkey" already exists, skipping';
END $$;
