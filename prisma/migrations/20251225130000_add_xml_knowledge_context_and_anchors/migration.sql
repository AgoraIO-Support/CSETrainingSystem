-- Add XML Knowledge Context + Anchors tables (replacement for RAG in learner UI)

-- CreateEnum
CREATE TYPE "KnowledgeContextStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeAnchorType" AS ENUM ('CONCEPT', 'EXAMPLE', 'DEMO', 'KEY_TAKEAWAY');

-- CreateTable
CREATE TABLE "knowledge_contexts" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "sectionCount" INTEGER NOT NULL,
    "anchorCount" INTEGER NOT NULL,
    "status" "KnowledgeContextStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "knowledge_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_anchors" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "timestamp" DECIMAL(10,3) NOT NULL,
    "timestampStr" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyTerms" TEXT[],
    "anchorType" "KnowledgeAnchorType" NOT NULL DEFAULT 'CONCEPT',
    "sequenceIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_contexts_lessonId_key" ON "knowledge_contexts"("lessonId");

-- CreateIndex
CREATE INDEX "knowledge_contexts_status_idx" ON "knowledge_contexts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_anchors_lessonId_sequenceIndex_key" ON "knowledge_anchors"("lessonId", "sequenceIndex");

-- CreateIndex
CREATE INDEX "knowledge_anchors_lessonId_idx" ON "knowledge_anchors"("lessonId");

-- AddForeignKey
ALTER TABLE "knowledge_contexts" ADD CONSTRAINT "knowledge_contexts_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_anchors" ADD CONSTRAINT "knowledge_anchors_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

