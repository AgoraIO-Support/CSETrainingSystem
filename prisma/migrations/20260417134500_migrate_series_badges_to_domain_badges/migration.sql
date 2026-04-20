DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'badge_milestones'
          AND column_name = 'learningSeriesId'
    ) THEN
        EXECUTE $sql$
            CREATE TEMP TABLE "_series_badge_cleanup" AS
            SELECT
                bm."id" AS "sourceBadgeId",
                bm."name",
                bm."slug",
                bm."description",
                bm."icon",
                bm."thresholdStars",
                bm."active",
                bm."learningSeriesId",
                ls."domainId",
                COALESCE(existing_by_slug."id", existing_by_threshold."id") AS "targetBadgeId"
            FROM "badge_milestones" bm
            JOIN "learning_series" ls ON ls."id" = bm."learningSeriesId"
            LEFT JOIN "badge_milestones" existing_by_slug
                ON existing_by_slug."domainId" = ls."domainId"
               AND existing_by_slug."learningSeriesId" IS NULL
               AND existing_by_slug."slug" = bm."slug"
            LEFT JOIN "badge_milestones" existing_by_threshold
                ON existing_by_threshold."domainId" = ls."domainId"
               AND existing_by_threshold."learningSeriesId" IS NULL
               AND existing_by_threshold."thresholdStars" = bm."thresholdStars"
            WHERE bm."learningSeriesId" IS NOT NULL
        $sql$;

        EXECUTE $sql$
            WITH "created_badges" AS (
                INSERT INTO "badge_milestones" (
                    "id",
                    "name",
                    "slug",
                    "description",
                    "icon",
                    "thresholdStars",
                    "active",
                    "domainId",
                    "learningSeriesId"
                )
                SELECT
                    gen_random_uuid(),
                    c."name",
                    c."slug",
                    c."description",
                    c."icon",
                    c."thresholdStars",
                    c."active",
                    c."domainId",
                    NULL
                FROM "_series_badge_cleanup" c
                WHERE c."domainId" IS NOT NULL
                  AND c."targetBadgeId" IS NULL
                RETURNING "id", "domainId", "slug", "thresholdStars"
            )
            UPDATE "_series_badge_cleanup" c
            SET "targetBadgeId" = created."id"
            FROM "created_badges" created
            WHERE c."targetBadgeId" IS NULL
              AND c."domainId" = created."domainId"
              AND c."slug" = created."slug"
              AND c."thresholdStars" = created."thresholdStars"
        $sql$;

        EXECUTE $sql$
            DELETE FROM "badge_awards" source_award
            USING "_series_badge_cleanup" c, "badge_awards" existing_award
            WHERE source_award."badgeId" = c."sourceBadgeId"
              AND c."targetBadgeId" IS NOT NULL
              AND existing_award."badgeId" = c."targetBadgeId"
              AND existing_award."userId" = source_award."userId"
        $sql$;

        EXECUTE $sql$
            UPDATE "badge_awards" ba
            SET
                "badgeId" = c."targetBadgeId",
                "domainId" = COALESCE(ba."domainId", c."domainId")
            FROM "_series_badge_cleanup" c
            WHERE ba."badgeId" = c."sourceBadgeId"
              AND c."targetBadgeId" IS NOT NULL
        $sql$;

        EXECUTE $sql$
            DELETE FROM "badge_milestones" bm
            USING "_series_badge_cleanup" c
            WHERE bm."id" = c."sourceBadgeId"
              AND NOT EXISTS (
                  SELECT 1
                  FROM "badge_awards" ba
                  WHERE ba."badgeId" = bm."id"
              )
        $sql$;

        EXECUTE 'DROP TABLE "_series_badge_cleanup"';
    END IF;
END $$;
