-- Training operations core data model

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductDomainCategory') THEN
    CREATE TYPE "ProductDomainCategory" AS ENUM ('RTE', 'AI');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductTrack') THEN
    CREATE TYPE "ProductTrack" AS ENUM ('AGILE', 'MASTERY', 'RELEASE', 'FINAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SmeKpiMode') THEN
    CREATE TYPE "SmeKpiMode" AS ENUM ('DELTA', 'RETENTION', 'READINESS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LearningSeriesType') THEN
    CREATE TYPE "LearningSeriesType" AS ENUM (
      'WEEKLY_DRILL',
      'CASE_STUDY',
      'KNOWLEDGE_SHARING',
      'FAQ_SHARE',
      'RELEASE_READINESS',
      'QUARTERLY_FINAL',
      'YEAR_END_FINAL'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LearningEventFormat') THEN
    CREATE TYPE "LearningEventFormat" AS ENUM (
      'CASE_STUDY',
      'KNOWLEDGE_SHARING',
      'FAQ_SHARE',
      'RELEASE_BRIEFING',
      'QUIZ_REVIEW',
      'FINAL_EXAM',
      'WORKSHOP'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LearningEventStatus') THEN
    CREATE TYPE "LearningEventStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssessmentKind') THEN
    CREATE TYPE "AssessmentKind" AS ENUM ('PRACTICE', 'READINESS', 'FORMAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StarAwardSourceType') THEN
    CREATE TYPE "StarAwardSourceType" AS ENUM ('WEEKLY_QUIZ', 'CASE_STUDY', 'LAUNCH_EXAM', 'FINAL_EXAM', 'BONUS', 'MANUAL');
  END IF;
END $$;

CREATE TABLE "product_domains" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category" "ProductDomainCategory" NOT NULL,
  "track" "ProductTrack" NOT NULL,
  "kpiMode" "SmeKpiMode" NOT NULL,
  "description" TEXT,
  "cadence" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "baselinePassRate" DOUBLE PRECISION,
  "targetPassRate" DOUBLE PRECISION,
  "challengeThreshold" DOUBLE PRECISION,
  "primarySmeId" TEXT,
  "backupSmeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_domains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_series" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "type" "LearningSeriesType" NOT NULL,
  "domainId" TEXT,
  "description" TEXT,
  "cadence" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "badgeEligible" BOOLEAN NOT NULL DEFAULT true,
  "countsTowardPerformance" BOOLEAN NOT NULL DEFAULT false,
  "defaultStarValue" INTEGER,
  "ownerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_events" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "format" "LearningEventFormat" NOT NULL,
  "status" "LearningEventStatus" NOT NULL DEFAULT 'DRAFT',
  "seriesId" TEXT,
  "domainId" TEXT,
  "description" TEXT,
  "releaseVersion" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "countsTowardPerformance" BOOLEAN NOT NULL DEFAULT false,
  "starValue" INTEGER,
  "hostId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "learning_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "badge_milestones" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "thresholdStars" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "domainId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "badge_milestones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "star_awards" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domainId" TEXT,
  "eventId" TEXT,
  "examId" TEXT,
  "sourceType" "StarAwardSourceType" NOT NULL,
  "stars" INTEGER NOT NULL,
  "reason" TEXT,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "star_awards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "badge_awards" (
  "id" TEXT NOT NULL,
  "badgeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domainId" TEXT,
  "eventId" TEXT,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "badge_awards_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "exams"
ADD COLUMN "assessmentKind" "AssessmentKind" NOT NULL DEFAULT 'PRACTICE',
ADD COLUMN "productDomainId" TEXT,
ADD COLUMN "learningSeriesId" TEXT,
ADD COLUMN "learningEventId" TEXT,
ADD COLUMN "awardsStars" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "starValue" INTEGER,
ADD COLUMN "countsTowardPerformance" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "exam_questions"
ADD COLUMN "productDomainId" TEXT;

ALTER TABLE "exam_attempt_question_snapshots"
ADD COLUMN "productDomainId" TEXT;

CREATE UNIQUE INDEX "product_domains_slug_key" ON "product_domains"("slug");
CREATE UNIQUE INDEX "learning_series_slug_key" ON "learning_series"("slug");
CREATE UNIQUE INDEX "badge_milestones_slug_key" ON "badge_milestones"("slug");
CREATE UNIQUE INDEX "badge_awards_badgeId_userId_key" ON "badge_awards"("badgeId", "userId");

CREATE INDEX "product_domains_category_idx" ON "product_domains"("category");
CREATE INDEX "product_domains_track_idx" ON "product_domains"("track");
CREATE INDEX "product_domains_primarySmeId_idx" ON "product_domains"("primarySmeId");
CREATE INDEX "learning_series_type_idx" ON "learning_series"("type");
CREATE INDEX "learning_series_domainId_idx" ON "learning_series"("domainId");
CREATE INDEX "learning_series_ownerId_idx" ON "learning_series"("ownerId");
CREATE INDEX "learning_events_seriesId_idx" ON "learning_events"("seriesId");
CREATE INDEX "learning_events_domainId_idx" ON "learning_events"("domainId");
CREATE INDEX "learning_events_status_idx" ON "learning_events"("status");
CREATE INDEX "learning_events_scheduledAt_idx" ON "learning_events"("scheduledAt");
CREATE INDEX "learning_events_hostId_idx" ON "learning_events"("hostId");
CREATE INDEX "badge_milestones_domainId_idx" ON "badge_milestones"("domainId");
CREATE INDEX "badge_milestones_active_idx" ON "badge_milestones"("active");
CREATE INDEX "star_awards_userId_awardedAt_idx" ON "star_awards"("userId", "awardedAt");
CREATE INDEX "star_awards_domainId_idx" ON "star_awards"("domainId");
CREATE INDEX "star_awards_eventId_idx" ON "star_awards"("eventId");
CREATE INDEX "star_awards_examId_idx" ON "star_awards"("examId");
CREATE INDEX "badge_awards_userId_awardedAt_idx" ON "badge_awards"("userId", "awardedAt");
CREATE INDEX "badge_awards_domainId_idx" ON "badge_awards"("domainId");
CREATE INDEX "badge_awards_eventId_idx" ON "badge_awards"("eventId");
CREATE INDEX "exams_assessmentKind_idx" ON "exams"("assessmentKind");
CREATE INDEX "exams_productDomainId_idx" ON "exams"("productDomainId");
CREATE INDEX "exams_learningSeriesId_idx" ON "exams"("learningSeriesId");
CREATE INDEX "exams_learningEventId_idx" ON "exams"("learningEventId");
CREATE INDEX "exam_questions_productDomainId_idx" ON "exam_questions"("productDomainId");
CREATE INDEX "exam_attempt_question_snapshots_productDomainId_idx" ON "exam_attempt_question_snapshots"("productDomainId");

ALTER TABLE "product_domains"
ADD CONSTRAINT "product_domains_primarySmeId_fkey" FOREIGN KEY ("primarySmeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "product_domains_backupSmeId_fkey" FOREIGN KEY ("backupSmeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_series"
ADD CONSTRAINT "learning_series_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "product_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "learning_series_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_events"
ADD CONSTRAINT "learning_events_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "learning_series"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "learning_events_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "product_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "learning_events_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "learning_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "badge_milestones"
ADD CONSTRAINT "badge_milestones_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "product_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "star_awards"
ADD CONSTRAINT "star_awards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "star_awards_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "product_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "star_awards_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "learning_events"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "star_awards_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "badge_awards"
ADD CONSTRAINT "badge_awards_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "badge_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "badge_awards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "badge_awards_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "product_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "badge_awards_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "learning_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exams"
ADD CONSTRAINT "exams_productDomainId_fkey" FOREIGN KEY ("productDomainId") REFERENCES "product_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "exams_learningSeriesId_fkey" FOREIGN KEY ("learningSeriesId") REFERENCES "learning_series"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "exams_learningEventId_fkey" FOREIGN KEY ("learningEventId") REFERENCES "learning_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exam_questions"
ADD CONSTRAINT "exam_questions_productDomainId_fkey" FOREIGN KEY ("productDomainId") REFERENCES "product_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
