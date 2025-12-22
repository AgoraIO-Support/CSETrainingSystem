/*
  Warnings:

  - You are about to drop the column `contentType` on the `lesson_assets` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `lesson_assets` table. All the data in the column will be lost.
  - You are about to drop the column `s3Key` on the `lesson_assets` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `lesson_assets` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `lesson_assets` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `lesson_assets` table. All the data in the column will be lost.
  - Added the required column `courseAssetId` to the `lesson_assets` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'DOC', 'QUIZ', 'OTHER');

-- CreateEnum
CREATE TYPE "LessonCompletionRule" AS ENUM ('VIEW_ASSETS', 'MANUAL', 'QUIZ');

-- AlterTable
ALTER TABLE "course_assets" ADD COLUMN     "cloudfrontUrl" TEXT,
ADD COLUMN     "mimeType" TEXT;

-- AlterTable
ALTER TABLE "lesson_assets" DROP COLUMN "contentType",
DROP COLUMN "description",
DROP COLUMN "s3Key",
DROP COLUMN "title",
DROP COLUMN "type",
DROP COLUMN "url",
ADD COLUMN     "courseAssetId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "completionRule" "LessonCompletionRule" DEFAULT 'VIEW_ASSETS',
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "learningObjectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lessonType" "LessonType";

-- CreateIndex
CREATE INDEX "lesson_assets_courseAssetId_idx" ON "lesson_assets"("courseAssetId");

-- AddForeignKey
ALTER TABLE "lesson_assets" ADD CONSTRAINT "lesson_assets_courseAssetId_fkey" FOREIGN KEY ("courseAssetId") REFERENCES "course_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
