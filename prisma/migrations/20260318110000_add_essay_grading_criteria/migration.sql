-- Add structured essay grading criteria and AI breakdown storage
ALTER TABLE "exam_questions"
ADD COLUMN "gradingCriteria" JSONB;

ALTER TABLE "exam_attempt_question_snapshots"
ADD COLUMN "gradingCriteria" JSONB;

ALTER TABLE "exam_answers"
ADD COLUMN "aiGradingBreakdown" JSONB;
