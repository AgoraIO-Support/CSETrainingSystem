DROP INDEX IF EXISTS "badge_milestones_slug_key";

CREATE UNIQUE INDEX IF NOT EXISTS "badge_milestones_domainId_slug_key"
ON "badge_milestones"("domainId", "slug");

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'badge_milestones'
          AND column_name = 'learningSeriesId'
    ) THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "badge_milestones_learningSeriesId_slug_key" ON "badge_milestones"("learningSeriesId", "slug")';
    END IF;
END $$;
