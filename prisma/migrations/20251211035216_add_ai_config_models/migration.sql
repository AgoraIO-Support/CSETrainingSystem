-- CreateTable
CREATE TABLE "course_ai_configs" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "modelOverride" TEXT,
    "temperature" DOUBLE PRECISION DEFAULT 0.2,
    "maxTokens" INTEGER DEFAULT 1024,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_ai_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_ai_configs" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "modelOverride" TEXT,
    "temperature" DOUBLE PRECISION,
    "maxTokens" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "includeTranscript" BOOLEAN NOT NULL DEFAULT true,
    "includeAssetSummaries" BOOLEAN NOT NULL DEFAULT false,
    "customContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_ai_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_ai_configs_courseId_key" ON "course_ai_configs"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_ai_configs_lessonId_key" ON "lesson_ai_configs"("lessonId");

-- AddForeignKey
ALTER TABLE "course_ai_configs" ADD CONSTRAINT "course_ai_configs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_ai_configs" ADD CONSTRAINT "lesson_ai_configs_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
