-- CreateEnum
CREATE TYPE "LessonAssetType" AS ENUM ('VIDEO', 'DOCUMENT', 'PRESENTATION', 'TEXT', 'AUDIO', 'OTHER');

-- CreateTable
CREATE TABLE "lesson_assets" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "type" "LessonAssetType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_assets_lessonId_idx" ON "lesson_assets"("lessonId");

-- AddForeignKey
ALTER TABLE "lesson_assets" ADD CONSTRAINT "lesson_assets_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
