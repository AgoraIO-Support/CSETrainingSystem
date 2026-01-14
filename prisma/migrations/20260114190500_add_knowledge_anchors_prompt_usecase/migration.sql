-- Add a dedicated use case for generating "Key Moments" (knowledge anchors).
-- This is safe to run multiple times.
ALTER TYPE "AIPromptUseCase" ADD VALUE IF NOT EXISTS 'KNOWLEDGE_ANCHORS_GENERATION';

