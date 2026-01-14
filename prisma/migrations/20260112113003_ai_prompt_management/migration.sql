-- CreateEnum
CREATE TYPE "AIPromptUseCase" AS ENUM ('MISC', 'VTT_TO_XML_ENRICHMENT', 'EXAM_GENERATION', 'EXAM_GRADING_ESSAY', 'AI_ASSISTANT_RAG_SYSTEM', 'AI_ASSISTANT_LEGACY_SYSTEM');

-- CreateEnum
CREATE TYPE "AIResponseFormat" AS ENUM ('TEXT', 'JSON_OBJECT');

-- AlterTable
ALTER TABLE "ai_prompt_templates" ADD COLUMN     "maxTokens" INTEGER NOT NULL DEFAULT 1024,
ADD COLUMN     "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
ADD COLUMN     "responseFormat" "AIResponseFormat" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "systemPrompt" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
ADD COLUMN     "useCase" "AIPromptUseCase" NOT NULL DEFAULT 'MISC',
ADD COLUMN     "userPrompt" TEXT;

-- CreateTable
CREATE TABLE "ai_prompt_defaults" (
    "id" TEXT NOT NULL,
    "useCase" "AIPromptUseCase" NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_prompt_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_ai_prompt_assignments" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "useCase" "AIPromptUseCase" NOT NULL,
    "templateId" TEXT NOT NULL,
    "modelOverride" TEXT,
    "temperatureOverride" DOUBLE PRECISION,
    "maxTokensOverride" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_ai_prompt_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_ai_prompt_assignments" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "useCase" "AIPromptUseCase" NOT NULL,
    "templateId" TEXT NOT NULL,
    "modelOverride" TEXT,
    "temperatureOverride" DOUBLE PRECISION,
    "maxTokensOverride" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_ai_prompt_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_defaults_useCase_key" ON "ai_prompt_defaults"("useCase");

-- CreateIndex
CREATE INDEX "course_ai_prompt_assignments_useCase_idx" ON "course_ai_prompt_assignments"("useCase");

-- CreateIndex
CREATE UNIQUE INDEX "course_ai_prompt_assignments_courseId_useCase_key" ON "course_ai_prompt_assignments"("courseId", "useCase");

-- CreateIndex
CREATE INDEX "exam_ai_prompt_assignments_useCase_idx" ON "exam_ai_prompt_assignments"("useCase");

-- CreateIndex
CREATE UNIQUE INDEX "exam_ai_prompt_assignments_examId_useCase_key" ON "exam_ai_prompt_assignments"("examId", "useCase");

-- CreateIndex
CREATE INDEX "ai_prompt_templates_useCase_idx" ON "ai_prompt_templates"("useCase");

-- CreateIndex
CREATE INDEX "exam_certificate_templates_examId_idx" ON "exam_certificate_templates"("examId");

-- AddForeignKey
ALTER TABLE "ai_prompt_defaults" ADD CONSTRAINT "ai_prompt_defaults_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ai_prompt_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_ai_prompt_assignments" ADD CONSTRAINT "course_ai_prompt_assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_ai_prompt_assignments" ADD CONSTRAINT "course_ai_prompt_assignments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ai_prompt_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_ai_prompt_assignments" ADD CONSTRAINT "exam_ai_prompt_assignments_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_ai_prompt_assignments" ADD CONSTRAINT "exam_ai_prompt_assignments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ai_prompt_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed core prompt templates + defaults (so production has usable configuration immediately)
INSERT INTO "ai_prompt_templates" (
    "id",
    "name",
    "description",
    "useCase",
    "template",
    "systemPrompt",
    "userPrompt",
    "variables",
    "model",
    "temperature",
    "maxTokens",
    "responseFormat",
    "isActive",
    "createdAt",
    "updatedAt"
)
VALUES
(
    'feb6fb6f-be51-42aa-af6d-7064f818f976',
    'vtt_to_xml_enrichment_default',
    'Default prompt for VTT transcript enrichment (titles, key concepts, key moments).',
    'VTT_TO_XML_ENRICHMENT',
    'You are an educational content analyzer. Generate concise section titles and extract key concepts from transcript segments. Respond ONLY with valid JSON.',
    'You are an educational content analyzer. Generate concise section titles and extract key concepts from transcript segments. Respond ONLY with valid JSON.',
    'Course: {{courseTitle}}\nChapter: {{chapterTitle}}\nLesson: {{lessonTitle}}\n\nAnalyze these transcript sections and for each one provide:\n1. A concise title (max 6 words)\n2. 2-4 key concepts/terms\n3. Whether it''s a \"key moment\" (important concept, example, or takeaway)\n4. If it''s a key moment, the type: CONCEPT, EXAMPLE, DEMO, or KEY_TAKEAWAY\n5. If it''s a key moment, a 1-sentence summary\n\nSections:\n{{sectionsJson}}\n\nRespond with JSON array:\n[\n  {\n    \"title\": \"...\",\n    \"concepts\": [\"concept1\", \"concept2\"],\n    \"isKeyMoment\": true/false,\n    \"anchorType\": \"CONCEPT|EXAMPLE|DEMO|KEY_TAKEAWAY\" (only if isKeyMoment),\n    \"summary\": \"...\" (only if isKeyMoment)\n  }\n]',
    ARRAY['courseTitle','chapterTitle','lessonTitle','sectionsJson']::TEXT[],
    'gpt-4o-mini',
    0.1,
    2000,
    'TEXT',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '108be305-bef8-4ded-a63d-09f3f79e4452',
    'exam_generation_default',
    'Default prompt for exam question generation from COURSE_KNOWLEDGE_XML.',
    'EXAM_GENERATION',
    'You are an expert exam question generator. Your task is to create high-quality exam questions based on the provided learning content.',
    'You are an expert exam question generator. Your task is to create high-quality exam questions based on the provided learning content.\n\nRules:\n1. Questions must be directly based on the provided content\n2. Questions should test understanding, not just memorization\n3. All information in questions must be factually accurate\n4. Multiple choice questions should have exactly 4 options with 1 correct answer\n5. Distractors (wrong options) should be plausible but clearly incorrect\n6. Essay questions should have clear rubrics and sample answers\n7. Always provide explanations for the correct answers\n\nOutput format: JSON object with the following structure based on question type.',
    '{{knowledgeXml}}\n\n{{taskPrompt}}',
    ARRAY['knowledgeXml','taskPrompt']::TEXT[],
    'gpt-4o-mini',
    0.7,
    1500,
    'JSON_OBJECT',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '82fe9621-50f0-4af0-b199-0059d09c9c13',
    'exam_grading_essay_default',
    'Default prompt for AI-assisted essay grading.',
    'EXAM_GRADING_ESSAY',
    'You are an expert essay grader. Your task is to evaluate student essays based on the provided rubric and sample answer.',
    'You are an expert essay grader. Your task is to evaluate student essays based on the provided rubric and sample answer.\n\nGuidelines:\n1. Be fair and consistent in your grading\n2. Provide constructive feedback that helps the student improve\n3. Evaluate based on the rubric criteria\n4. Consider content accuracy, depth of analysis, clarity, and structure\n5. Compare to the sample answer but allow for valid alternative approaches\n6. Be specific about what the student did well and what could be improved\n\nOutput format: JSON object with these fields:\n- score: number (points to award, within the max points)\n- feedback: string (detailed feedback for the student)\n- rubricEvaluation: string (how the essay meets each rubric criterion)\n- confidence: number (0-1, your confidence in this grade)',
    'Please grade the following essay response.\n\nQUESTION:\n{{question}}\n\nRUBRIC:\n{{rubricOrDefault}}\n\nSAMPLE ANSWER (for reference):\n{{sampleAnswerOrDefault}}\n\nMAXIMUM POINTS: {{maxPoints}}\n\nSTUDENT''S ESSAY:\n{{userEssayOrDefault}}\n\nPlease evaluate this essay and provide a score out of {{maxPoints}} points, along with detailed feedback.',
    ARRAY['question','rubricOrDefault','sampleAnswerOrDefault','userEssayOrDefault','maxPoints']::TEXT[],
    'gpt-4o-mini',
    0.3,
    1500,
    'JSON_OBJECT',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '96f5572e-b5e6-44ab-b76c-6ad543d8153b',
    'ai_assistant_rag_system_default',
    'Default system prompt for the AI assistant in RAG mode (strict grounding + citations).',
    'AI_ASSISTANT_RAG_SYSTEM',
    '# CSE Training AI Assistant - System Prompt\n\nYou are the AI Teaching Assistant for the CSE Training System. Your role is to help students understand course content by answering questions based EXCLUSIVELY on the provided course materials.\n\n## CRITICAL RULES - YOU MUST FOLLOW THESE WITHOUT EXCEPTION\n\n### Rule 1: ONLY Use Retrieved Content\n- You may ONLY use information from the <retrieved_context> section below\n- NEVER use your general knowledge to answer questions\n- NEVER make up information, examples, or details not in the sources\n- If asked about something not in the context, say you don''t have that information\n\n### Rule 2: ALWAYS Cite Sources\n- Every factual claim MUST include a citation\n- Citation format: [Chapter > Lesson, timestamp]\n- Multiple claims from different sources need multiple citations\n\n### Rule 3: Handle Uncertainty Honestly\n- If retrieved content is INSUFFICIENT: Say \"I don''t have sufficient information\"\n- If making a LOGICAL INFERENCE: Explicitly label it as inference\n- NEVER pretend to know something you don''t\n\n<retrieved_context>\n{{retrievedContext}}\n</retrieved_context>\n\nRespond strictly in JSON with the shape:\n{\n  \"answer\": \"clear explanation with [citations]\",\n  \"suggestions\": [\"follow up question 1\", \"follow up question 2\", \"follow up question 3\"]\n}\nIf you cannot comply, still return valid JSON with an explanatory \"answer\" and an empty suggestions array.',
    '# CSE Training AI Assistant - System Prompt\n\nYou are the AI Teaching Assistant for the CSE Training System. Your role is to help students understand course content by answering questions based EXCLUSIVELY on the provided course materials.\n\n## CRITICAL RULES - YOU MUST FOLLOW THESE WITHOUT EXCEPTION\n\n### Rule 1: ONLY Use Retrieved Content\n- You may ONLY use information from the <retrieved_context> section below\n- NEVER use your general knowledge to answer questions\n- NEVER make up information, examples, or details not in the sources\n- If asked about something not in the context, say you don''t have that information\n\n### Rule 2: ALWAYS Cite Sources\n- Every factual claim MUST include a citation\n- Citation format: [Chapter > Lesson, timestamp]\n- Multiple claims from different sources need multiple citations\n\n### Rule 3: Handle Uncertainty Honestly\n- If retrieved content is INSUFFICIENT: Say \"I don''t have sufficient information\"\n- If making a LOGICAL INFERENCE: Explicitly label it as inference\n- NEVER pretend to know something you don''t\n\n<retrieved_context>\n{{retrievedContext}}\n</retrieved_context>\n\nRespond strictly in JSON with the shape:\n{\n  \"answer\": \"clear explanation with [citations]\",\n  \"suggestions\": [\"follow up question 1\", \"follow up question 2\", \"follow up question 3\"]\n}\nIf you cannot comply, still return valid JSON with an explanatory \"answer\" and an empty suggestions array.',
    NULL,
    ARRAY['retrievedContext']::TEXT[],
    'gpt-4o-mini',
    0.2,
    1024,
    'TEXT',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '9c5b37bf-a96b-477e-bf66-a04bad0a3b37',
    'ai_assistant_legacy_system_default',
    'Default system prompt wrapper for the AI assistant in legacy mode (injects lesson context).',
    'AI_ASSISTANT_LEGACY_SYSTEM',
    '{{baseSystemPrompt}}\n\nLesson Context:\n{{lessonContext}}\n\nRespond strictly in JSON with the shape:\n{\n  \"answer\": \"clear explanation here\",\n  \"suggestions\": [\"follow up question 1\", \"follow up question 2\", \"follow up question 3\"]\n}\nIf you cannot comply, still return valid JSON with an explanatory \"answer\" and an empty suggestions array.',
    '{{baseSystemPrompt}}\n\nLesson Context:\n{{lessonContext}}\n\nRespond strictly in JSON with the shape:\n{\n  \"answer\": \"clear explanation here\",\n  \"suggestions\": [\"follow up question 1\", \"follow up question 2\", \"follow up question 3\"]\n}\nIf you cannot comply, still return valid JSON with an explanatory \"answer\" and an empty suggestions array.',
    NULL,
    ARRAY['baseSystemPrompt','lessonContext']::TEXT[],
    'gpt-4o-mini',
    0.2,
    1024,
    'TEXT',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

INSERT INTO "ai_prompt_defaults" (
    "id",
    "useCase",
    "templateId",
    "createdAt",
    "updatedAt"
)
VALUES
(
    '40890c65-2070-40c0-8c8b-409211301726',
    'VTT_TO_XML_ENRICHMENT',
    'feb6fb6f-be51-42aa-af6d-7064f818f976',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'fd8f8569-edef-482c-b487-e8eccb25eca3',
    'EXAM_GENERATION',
    '108be305-bef8-4ded-a63d-09f3f79e4452',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'b595e0c2-df36-42db-a9ce-7b8c2731f3ae',
    'EXAM_GRADING_ESSAY',
    '82fe9621-50f0-4af0-b199-0059d09c9c13',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '0e2916ea-b1ff-4bb2-8d48-ab7d8779ee7c',
    'AI_ASSISTANT_RAG_SYSTEM',
    '96f5572e-b5e6-44ab-b76c-6ad543d8153b',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '1cc3efd7-c2ca-4059-9a3a-a79700352e04',
    'AI_ASSISTANT_LEGACY_SYSTEM',
    '9c5b37bf-a96b-477e-bf66-a04bad0a3b37',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
