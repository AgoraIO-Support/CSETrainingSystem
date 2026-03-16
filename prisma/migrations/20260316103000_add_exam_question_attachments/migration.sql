ALTER TABLE "exam_questions"
ADD COLUMN "attachmentS3Key" TEXT,
ADD COLUMN "attachmentFilename" TEXT,
ADD COLUMN "attachmentMimeType" TEXT;

ALTER TABLE "exam_attempt_question_snapshots"
ADD COLUMN "attachmentS3Key" TEXT,
ADD COLUMN "attachmentFilename" TEXT,
ADD COLUMN "attachmentMimeType" TEXT;
