CREATE TYPE "LessonAssetUploadStatus" AS ENUM (
    'PENDING_UPLOAD',
    'CONFIRMED',
    'FAILED',
    'ABORTED',
    'EXPIRED'
);

CREATE TABLE "lesson_asset_upload_sessions" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "preparedById" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "assetType" "LessonAssetType" NOT NULL,
    "s3Key" TEXT NOT NULL,
    "courseAssetId" TEXT NOT NULL,
    "status" "LessonAssetUploadStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "abortedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "uploadedSizeBytes" INTEGER,
    "uploadedMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_asset_upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lesson_asset_upload_sessions_s3Key_key" ON "lesson_asset_upload_sessions"("s3Key");
CREATE UNIQUE INDEX "lesson_asset_upload_sessions_courseAssetId_key" ON "lesson_asset_upload_sessions"("courseAssetId");
CREATE INDEX "lesson_asset_upload_sessions_lessonId_idx" ON "lesson_asset_upload_sessions"("lessonId");
CREATE INDEX "lesson_asset_upload_sessions_courseId_idx" ON "lesson_asset_upload_sessions"("courseId");
CREATE INDEX "lesson_asset_upload_sessions_status_idx" ON "lesson_asset_upload_sessions"("status");
CREATE INDEX "lesson_asset_upload_sessions_expiresAt_idx" ON "lesson_asset_upload_sessions"("expiresAt");

ALTER TABLE "lesson_asset_upload_sessions"
ADD CONSTRAINT "lesson_asset_upload_sessions_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
