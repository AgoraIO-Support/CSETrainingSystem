ALTER TABLE "badge_milestones"
ADD COLUMN "learningSeriesId" TEXT;

ALTER TABLE "star_awards"
ADD COLUMN "learningSeriesId" TEXT;

ALTER TABLE "badge_awards"
ADD COLUMN "learningSeriesId" TEXT;

ALTER TABLE "badge_milestones"
ADD CONSTRAINT "badge_milestones_learningSeriesId_fkey"
FOREIGN KEY ("learningSeriesId") REFERENCES "learning_series"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "star_awards"
ADD CONSTRAINT "star_awards_learningSeriesId_fkey"
FOREIGN KEY ("learningSeriesId") REFERENCES "learning_series"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "badge_awards"
ADD CONSTRAINT "badge_awards_learningSeriesId_fkey"
FOREIGN KEY ("learningSeriesId") REFERENCES "learning_series"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "badge_milestones_learningSeriesId_idx" ON "badge_milestones"("learningSeriesId");
CREATE INDEX "star_awards_learningSeriesId_idx" ON "star_awards"("learningSeriesId");
CREATE INDEX "badge_awards_learningSeriesId_idx" ON "badge_awards"("learningSeriesId");

UPDATE "star_awards" sa
SET "learningSeriesId" = COALESCE(e."learningSeriesId", le."seriesId")
FROM "exams" e
LEFT JOIN "learning_events" le ON le."id" = e."learningEventId"
WHERE sa."examId" = e."id"
  AND sa."learningSeriesId" IS NULL;

UPDATE "star_awards" sa
SET "learningSeriesId" = le."seriesId"
FROM "learning_events" le
WHERE sa."examId" IS NULL
  AND sa."eventId" = le."id"
  AND sa."learningSeriesId" IS NULL;

UPDATE "badge_awards" ba
SET "learningSeriesId" = bm."learningSeriesId"
FROM "badge_milestones" bm
WHERE ba."badgeId" = bm."id"
  AND ba."learningSeriesId" IS NULL;

UPDATE "badge_awards" ba
SET "learningSeriesId" = le."seriesId"
FROM "learning_events" le
WHERE ba."eventId" = le."id"
  AND ba."learningSeriesId" IS NULL;
