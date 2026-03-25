-- Add multi-track subtitle metadata to transcript assets.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'TranscriptSourceType' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."TranscriptSourceType" AS ENUM ('MANUAL', 'IMPORTED', 'AUTO_TRANSLATED');
  END IF;
END $$;

ALTER TABLE "transcript_assets"
ADD COLUMN "label" TEXT,
ADD COLUMN "isDefaultSubtitle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isPrimaryForAI" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "sourceType" "public"."TranscriptSourceType" NOT NULL DEFAULT 'MANUAL';

-- Backfill existing transcripts as the default playback and AI source.
WITH ranked_tracks AS (
  SELECT
    id,
    "lessonId",
    "videoAssetId",
    ROW_NUMBER() OVER (PARTITION BY "videoAssetId" ORDER BY "createdAt" ASC, id ASC) AS video_rank,
    ROW_NUMBER() OVER (PARTITION BY "lessonId" ORDER BY "createdAt" ASC, id ASC) AS lesson_rank
  FROM "transcript_assets"
)
UPDATE "transcript_assets" t
SET
  "isDefaultSubtitle" = ranked.video_rank = 1,
  "isPrimaryForAI" = ranked.lesson_rank = 1
FROM ranked_tracks ranked
WHERE ranked.id = t.id;

-- Remove the old one-transcript-per-video uniqueness constraint.
DROP INDEX IF EXISTS "transcript_assets_lessonId_videoAssetId_key";

CREATE INDEX "transcript_assets_videoAssetId_language_isActive_idx"
ON "transcript_assets" ("videoAssetId", "language", "isActive");

CREATE INDEX "transcript_assets_lessonId_isPrimaryForAI_isActive_idx"
ON "transcript_assets" ("lessonId", "isPrimaryForAI", "isActive");
