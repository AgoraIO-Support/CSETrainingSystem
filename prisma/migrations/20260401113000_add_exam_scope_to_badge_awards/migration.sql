ALTER TABLE "badge_awards"
ADD COLUMN "examId" TEXT;

CREATE INDEX "badge_awards_examId_idx" ON "badge_awards"("examId");

ALTER TABLE "badge_awards"
ADD CONSTRAINT "badge_awards_examId_fkey"
FOREIGN KEY ("examId") REFERENCES "exams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "badge_awards" AS ba
SET "examId" = sa."examId"
FROM "star_awards" AS sa
WHERE ba."userId" = sa."userId"
  AND ba."eventId" IS NOT DISTINCT FROM sa."eventId"
  AND ba."learningSeriesId" IS NOT DISTINCT FROM sa."learningSeriesId"
  AND ba."domainId" IS NOT DISTINCT FROM sa."domainId"
  AND ba."awardedAt" >= sa."awardedAt";
