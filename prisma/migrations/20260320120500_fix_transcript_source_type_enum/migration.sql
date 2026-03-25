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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_assets'
      AND column_name = 'sourceType'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE "transcript_assets"
      ALTER COLUMN "sourceType" DROP DEFAULT;

    ALTER TABLE "transcript_assets"
      ALTER COLUMN "sourceType" TYPE "public"."TranscriptSourceType"
      USING ("sourceType"::text::"public"."TranscriptSourceType");

    ALTER TABLE "transcript_assets"
      ALTER COLUMN "sourceType" SET DEFAULT 'MANUAL';
  END IF;
END $$;
