-- Add EXERCISE question type
ALTER TYPE "ExamQuestionType" ADD VALUE 'EXERCISE';

-- CreateEnum
CREATE TYPE "ExamRecordingStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'FAILED');

-- AlterTable
ALTER TABLE "exam_answers"
ADD COLUMN     "recordingS3Key" TEXT,
ADD COLUMN     "recordingMimeType" TEXT,
ADD COLUMN     "recordingSizeBytes" INTEGER,
ADD COLUMN     "recordingDurationSeconds" INTEGER,
ADD COLUMN     "recordingStatus" "ExamRecordingStatus";

