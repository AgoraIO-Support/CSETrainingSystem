-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('COURSE_BASED', 'STANDALONE');

-- CreateEnum
CREATE TYPE "ExamQuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_BLANK', 'ESSAY');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "GradingStatus" AS ENUM ('PENDING', 'AUTO_GRADED', 'AI_SUGGESTED', 'MANUALLY_GRADED');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MaterialAssetType" AS ENUM ('VTT', 'PDF', 'DOCX', 'TXT');

-- CreateEnum
CREATE TYPE "MaterialAssetStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('EXAM_INVITATION', 'EXAM_REMINDER', 'EXAM_RESULTS', 'CERTIFICATE_DELIVERY');

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "timeLimit" INTEGER,
    "deadline" TIMESTAMP(3),
    "availableFrom" TIMESTAMP(3),
    "totalScore" INTEGER NOT NULL DEFAULT 100,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "randomizeQuestions" BOOLEAN NOT NULL DEFAULT false,
    "randomizeOptions" BOOLEAN NOT NULL DEFAULT false,
    "showResultsImmediately" BOOLEAN NOT NULL DEFAULT true,
    "allowReview" BOOLEAN NOT NULL DEFAULT true,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "aiGenerationConfig" JSONB,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "type" "ExamQuestionType" NOT NULL,
    "difficulty" "DifficultyLevel" NOT NULL DEFAULT 'MEDIUM',
    "question" TEXT NOT NULL,
    "options" JSONB,
    "correctAnswer" TEXT,
    "rubric" TEXT,
    "sampleAnswer" TEXT,
    "maxWords" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 10,
    "explanation" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isAIGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiModel" TEXT,
    "generationPrompt" TEXT,
    "topic" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3),
    "rawScore" DOUBLE PRECISION,
    "percentageScore" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "hasEssays" BOOLEAN NOT NULL DEFAULT false,
    "essaysGraded" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT,
    "selectedOption" INTEGER,
    "gradingStatus" "GradingStatus" NOT NULL DEFAULT 'PENDING',
    "isCorrect" BOOLEAN,
    "pointsAwarded" DOUBLE PRECISION,
    "aiSuggestedScore" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "aiGradedAt" TIMESTAMP(3),
    "adminScore" DOUBLE PRECISION,
    "adminFeedback" TEXT,
    "adminGradedById" TEXT,
    "adminGradedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_materials" (
    "id" TEXT NOT NULL,
    "examId" TEXT,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "url" TEXT,
    "mimeType" TEXT NOT NULL,
    "assetType" "MaterialAssetType" NOT NULL,
    "fileSize" INTEGER,
    "status" "MaterialAssetStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "extractedText" TEXT,
    "pageCount" INTEGER,
    "wordCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "exam_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_chunks" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "sequenceIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "startTime" DECIMAL(10,3),
    "endTime" DECIMAL(10,3),
    "pageNumber" INTEGER,
    "sectionTitle" TEXT,
    "embedding" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question_sources" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION,

    CONSTRAINT "exam_question_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_invitations" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "accessCode" TEXT,
    "expiresAt" TIMESTAMP(3),
    "viewed" BOOLEAN NOT NULL DEFAULT false,
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "type" "EmailType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "examId" TEXT,
    "certificateId" TEXT,
    "subject" TEXT NOT NULL,
    "templateId" TEXT,
    "resendId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_analytics" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "passedAttempts" INTEGER NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "averageScore" DOUBLE PRECISION,
    "medianScore" DOUBLE PRECISION,
    "highestScore" DOUBLE PRECISION,
    "lowestScore" DOUBLE PRECISION,
    "averageTimeMinutes" DOUBLE PRECISION,
    "questionStats" JSONB,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_status_idx" ON "exams"("status");

-- CreateIndex
CREATE INDEX "exams_courseId_idx" ON "exams"("courseId");

-- CreateIndex
CREATE INDEX "exams_examType_idx" ON "exams"("examType");

-- CreateIndex
CREATE INDEX "exams_createdById_idx" ON "exams"("createdById");

-- CreateIndex
CREATE INDEX "exam_questions_examId_idx" ON "exam_questions"("examId");

-- CreateIndex
CREATE INDEX "exam_questions_type_idx" ON "exam_questions"("type");

-- CreateIndex
CREATE INDEX "exam_questions_order_idx" ON "exam_questions"("order");

-- CreateIndex
CREATE INDEX "exam_attempts_userId_idx" ON "exam_attempts"("userId");

-- CreateIndex
CREATE INDEX "exam_attempts_examId_idx" ON "exam_attempts"("examId");

-- CreateIndex
CREATE INDEX "exam_attempts_status_idx" ON "exam_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_attemptId_questionId_key" ON "exam_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "exam_answers_attemptId_idx" ON "exam_answers"("attemptId");

-- CreateIndex
CREATE INDEX "exam_answers_questionId_idx" ON "exam_answers"("questionId");

-- CreateIndex
CREATE INDEX "exam_answers_gradingStatus_idx" ON "exam_answers"("gradingStatus");

-- CreateIndex
CREATE INDEX "exam_materials_examId_idx" ON "exam_materials"("examId");

-- CreateIndex
CREATE INDEX "exam_materials_courseId_idx" ON "exam_materials"("courseId");

-- CreateIndex
CREATE INDEX "exam_materials_status_idx" ON "exam_materials"("status");

-- CreateIndex
CREATE UNIQUE INDEX "material_chunks_materialId_sequenceIndex_key" ON "material_chunks"("materialId", "sequenceIndex");

-- CreateIndex
CREATE INDEX "material_chunks_materialId_idx" ON "material_chunks"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_question_sources_questionId_chunkId_key" ON "exam_question_sources"("questionId", "chunkId");

-- CreateIndex
CREATE INDEX "exam_question_sources_questionId_idx" ON "exam_question_sources"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_invitations_accessCode_key" ON "exam_invitations"("accessCode");

-- CreateIndex
CREATE UNIQUE INDEX "exam_invitations_examId_userId_key" ON "exam_invitations"("examId", "userId");

-- CreateIndex
CREATE INDEX "exam_invitations_examId_idx" ON "exam_invitations"("examId");

-- CreateIndex
CREATE INDEX "exam_invitations_userId_idx" ON "exam_invitations"("userId");

-- CreateIndex
CREATE INDEX "email_logs_recipientId_idx" ON "email_logs"("recipientId");

-- CreateIndex
CREATE INDEX "email_logs_examId_idx" ON "email_logs"("examId");

-- CreateIndex
CREATE INDEX "email_logs_type_idx" ON "email_logs"("type");

-- CreateIndex
CREATE UNIQUE INDEX "exam_analytics_examId_key" ON "exam_analytics"("examId");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_materials" ADD CONSTRAINT "exam_materials_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_materials" ADD CONSTRAINT "exam_materials_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "exam_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_sources" ADD CONSTRAINT "exam_question_sources_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_sources" ADD CONSTRAINT "exam_question_sources_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "material_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invitations" ADD CONSTRAINT "exam_invitations_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invitations" ADD CONSTRAINT "exam_invitations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_analytics" ADD CONSTRAINT "exam_analytics_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

