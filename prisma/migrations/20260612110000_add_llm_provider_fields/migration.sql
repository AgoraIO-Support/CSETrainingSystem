ALTER TABLE "ai_prompt_templates"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'openai';

ALTER TABLE "course_ai_prompt_assignments"
ADD COLUMN "providerOverride" TEXT;

ALTER TABLE "exam_ai_prompt_assignments"
ADD COLUMN "providerOverride" TEXT;
