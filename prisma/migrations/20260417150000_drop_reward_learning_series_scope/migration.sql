DROP INDEX IF EXISTS "star_awards_learningSeriesId_idx";
DROP INDEX IF EXISTS "badge_awards_learningSeriesId_idx";

ALTER TABLE "star_awards"
DROP CONSTRAINT IF EXISTS "star_awards_learningSeriesId_fkey";

ALTER TABLE "badge_awards"
DROP CONSTRAINT IF EXISTS "badge_awards_learningSeriesId_fkey";

ALTER TABLE "star_awards"
DROP COLUMN IF EXISTS "learningSeriesId";

ALTER TABLE "badge_awards"
DROP COLUMN IF EXISTS "learningSeriesId";
