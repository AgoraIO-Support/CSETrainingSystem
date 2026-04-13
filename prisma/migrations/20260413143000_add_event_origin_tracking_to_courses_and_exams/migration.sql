ALTER TABLE "courses"
ADD COLUMN "sourceLearningEventId" TEXT;

ALTER TABLE "courses"
ADD CONSTRAINT "courses_sourceLearningEventId_fkey"
FOREIGN KEY ("sourceLearningEventId") REFERENCES "learning_events"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "courses_sourceLearningEventId_idx" ON "courses"("sourceLearningEventId");

ALTER TABLE "exams"
ADD COLUMN "sourceLearningEventId" TEXT;

ALTER TABLE "exams"
ADD CONSTRAINT "exams_sourceLearningEventId_fkey"
FOREIGN KEY ("sourceLearningEventId") REFERENCES "learning_events"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "exams_sourceLearningEventId_idx" ON "exams"("sourceLearningEventId");
