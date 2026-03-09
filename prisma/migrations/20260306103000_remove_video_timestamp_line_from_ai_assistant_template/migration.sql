UPDATE "ai_prompt_templates"
SET
  "template" = CASE
    WHEN "template" IS NULL THEN NULL
    ELSE REPLACE("template", '{{videoTimestampLine}}', '')
  END,
  "systemPrompt" = CASE
    WHEN "systemPrompt" IS NULL THEN NULL
    ELSE REPLACE("systemPrompt", '{{videoTimestampLine}}', '')
  END,
  "userPrompt" = CASE
    WHEN "userPrompt" IS NULL THEN NULL
    ELSE REPLACE("userPrompt", '{{videoTimestampLine}}', '')
  END,
  "variables" = array_remove("variables", 'videoTimestampLine'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "useCase" = 'AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM';
