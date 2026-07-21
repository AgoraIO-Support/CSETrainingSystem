-- Event lifecycle is intentionally limited to active and completed records.
-- Existing draft/scheduled records become active; canceled records are terminal.

ALTER TYPE "LearningEventStatus" RENAME TO "LearningEventStatus_old";

CREATE TYPE "LearningEventStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

ALTER TABLE "learning_events"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "learning_events"
ALTER COLUMN "status" TYPE "LearningEventStatus"
USING (
  CASE
    WHEN "status"::text IN ('COMPLETED', 'CANCELED') THEN 'COMPLETED'
    ELSE 'IN_PROGRESS'
  END
)::"LearningEventStatus";

ALTER TABLE "learning_events"
ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

DROP TYPE "LearningEventStatus_old";

-- scheduledAt remains the single calendar timestamp used by event lists and learner views.
ALTER TABLE "learning_events"
DROP COLUMN "releaseVersion",
DROP COLUMN "startsAt",
DROP COLUMN "endsAt";
