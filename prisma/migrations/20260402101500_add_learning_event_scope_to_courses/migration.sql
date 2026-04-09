ALTER TABLE "courses"
ADD COLUMN "learningEventId" TEXT;

ALTER TABLE "courses"
ADD CONSTRAINT "courses_learningEventId_fkey"
FOREIGN KEY ("learningEventId") REFERENCES "learning_events"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "courses_learningEventId_idx" ON "courses"("learningEventId");
