DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'AIPromptUseCase'
      AND e.enumlabel = 'AI_ASSISTANT_LEGACY_SYSTEM'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'AIPromptUseCase'
      AND e.enumlabel = 'AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM'
  ) THEN
    ALTER TYPE "AIPromptUseCase" RENAME VALUE 'AI_ASSISTANT_LEGACY_SYSTEM' TO 'AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM';
  END IF;
END $$;

