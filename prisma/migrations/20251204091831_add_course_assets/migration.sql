-- CreateTable
CREATE TABLE "course_assets" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "LessonAssetType" NOT NULL,
    "url" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_assets_courseId_idx" ON "course_assets"("courseId");

-- AddForeignKey
ALTER TABLE "course_assets" ADD CONSTRAINT "course_assets_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
