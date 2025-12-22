-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('PENDING', 'VALIDATING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'READY', 'FAILED', 'STALE');

-- CreateTable
CREATE TABLE "transcript_assets" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "videoAssetId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "url" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "TranscriptStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "transcript_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_chunks" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "sequenceIndex" INTEGER NOT NULL,
    "startTime" DECIMAL(10,3) NOT NULL,
    "endTime" DECIMAL(10,3) NOT NULL,
    "text" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcript_assets_lessonId_idx" ON "transcript_assets"("lessonId");

-- CreateIndex
CREATE INDEX "transcript_assets_status_idx" ON "transcript_assets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_assets_lessonId_videoAssetId_key" ON "transcript_assets"("lessonId", "videoAssetId");

-- CreateIndex
CREATE INDEX "transcript_chunks_transcriptId_idx" ON "transcript_chunks"("transcriptId");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_chunks_transcriptId_sequenceIndex_key" ON "transcript_chunks"("transcriptId", "sequenceIndex");

-- CreateIndex for vector similarity search using IVFFlat algorithm
-- Lists parameter set to 100 (suitable for up to 100k vectors, can be tuned based on dataset size)
CREATE INDEX "transcript_chunks_embedding_idx" ON "transcript_chunks"
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- AddForeignKey
ALTER TABLE "transcript_assets" ADD CONSTRAINT "transcript_assets_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_assets" ADD CONSTRAINT "transcript_assets_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "course_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_chunks" ADD CONSTRAINT "transcript_chunks_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcript_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
