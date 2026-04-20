DROP INDEX IF EXISTS "badge_milestones_learningSeriesId_slug_key";
DROP INDEX IF EXISTS "badge_milestones_learningSeriesId_idx";

ALTER TABLE "badge_milestones"
DROP CONSTRAINT IF EXISTS "badge_milestones_learningSeriesId_fkey";

ALTER TABLE "badge_milestones"
DROP COLUMN IF EXISTS "learningSeriesId";
