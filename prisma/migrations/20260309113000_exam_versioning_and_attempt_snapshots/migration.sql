-- Add exam versioning
ALTER TABLE "exams"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "exams_version_idx" ON "exams"("version");

-- Add soft-delete marker for questions used by historical attempts
ALTER TABLE "exam_questions"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "exam_questions_archivedAt_idx" ON "exam_questions"("archivedAt");

-- Add exam version on attempts
ALTER TABLE "exam_attempts"
  ADD COLUMN "examVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "exam_attempts_examVersion_idx" ON "exam_attempts"("examVersion");

-- Snapshot table for attempt isolation
CREATE TABLE "exam_attempt_question_snapshots" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "examVersion" INTEGER NOT NULL,
  "questionId" TEXT NOT NULL,
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
  "topic" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "exam_attempt_question_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_attempt_question_snapshots_attemptId_questionId_key"
  ON "exam_attempt_question_snapshots"("attemptId", "questionId");
CREATE INDEX "exam_attempt_question_snapshots_attemptId_order_idx"
  ON "exam_attempt_question_snapshots"("attemptId", "order");
CREATE INDEX "exam_attempt_question_snapshots_examId_examVersion_idx"
  ON "exam_attempt_question_snapshots"("examId", "examVersion");

ALTER TABLE "exam_attempt_question_snapshots"
  ADD CONSTRAINT "exam_attempt_question_snapshots_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill attempt version from current exam version
UPDATE "exam_attempts" ea
SET "examVersion" = e."version"
FROM "exams" e
WHERE ea."examId" = e."id";

-- Backfill snapshots for existing attempts from current question rows (best-effort baseline)
INSERT INTO "exam_attempt_question_snapshots" (
  "id", "attemptId", "examId", "examVersion", "questionId", "type", "difficulty", "question", "options",
  "correctAnswer", "rubric", "sampleAnswer", "maxWords", "points", "explanation", "topic", "tags", "order", "createdAt"
)
SELECT
  md5(ea."attemptId" || ':' || q."id" || ':snapshot'),
  ea."attemptId",
  ea."examId",
  e."version",
  q."id",
  q."type",
  q."difficulty",
  q."question",
  q."options",
  q."correctAnswer",
  q."rubric",
  q."sampleAnswer",
  q."maxWords",
  q."points",
  q."explanation",
  q."topic",
  q."tags",
  q."order",
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT a."attemptId", a."questionId", at."examId"
  FROM "exam_answers" a
  JOIN "exam_attempts" at ON at."id" = a."attemptId"
) ea
JOIN "exam_questions" q ON q."id" = ea."questionId"
JOIN "exams" e ON e."id" = ea."examId"
ON CONFLICT ("attemptId", "questionId") DO NOTHING;
