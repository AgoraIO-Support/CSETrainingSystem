import prisma from '@/lib/prisma'
import { AIPromptUseCase, AIResponseFormat } from '@prisma/client'

export type ResolvedAIPrompt = {
    useCase: AIPromptUseCase
    source: 'override' | 'course' | 'exam' | 'default' | 'fallback'
    templateId?: string
    templateName?: string
    systemPrompt: string
    userPrompt: string | null
    model: string
    temperature: number
    maxTokens: number
    responseFormat: AIResponseFormat
}

let promptSchemaAvailable: boolean | null = null

function renderTemplate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
        const value = vars[key]
        if (value === undefined || value === null) return ''
        if (typeof value === 'string') return value
        return JSON.stringify(value, null, 2)
    })
}

function getFallbackPrompt(useCase: AIPromptUseCase): Omit<ResolvedAIPrompt, 'useCase'> {
    switch (useCase) {
        case AIPromptUseCase.VTT_TO_XML_ENRICHMENT:
            return {
                source: 'fallback',
                systemPrompt:
                    'You are an educational content analyzer. Generate concise section titles and extract key concepts from transcript segments. Respond ONLY with valid JSON.',
                userPrompt:
                    'Course: {{courseTitle}}\nChapter: {{chapterTitle}}\nLesson: {{lessonTitle}}\n\nAnalyze these transcript sections and for each one provide:\n1. A concise title (max 6 words)\n2. 2-4 key concepts/terms\n3. Whether it\'s a "key moment" (important concept, example, or takeaway)\n4. If it\'s a key moment, the type: CONCEPT, EXAMPLE, DEMO, or KEY_TAKEAWAY\n5. If it\'s a key moment, a 1-sentence summary\n\nSections:\n{{sectionsJson}}\n\nRespond with JSON array:\n[\n  {\n    "title": "...",\n    "concepts": ["concept1", "concept2"],\n    "isKeyMoment": true/false,\n    "anchorType": "CONCEPT|EXAMPLE|DEMO|KEY_TAKEAWAY" (only if isKeyMoment),\n    "summary": "..." (only if isKeyMoment)\n  }\n]',
                model: 'gpt-4o-mini',
                temperature: 0.1,
                maxTokens: 2000,
                responseFormat: AIResponseFormat.TEXT,
            }
        case AIPromptUseCase.EXAM_GENERATION:
            return {
                source: 'fallback',
                systemPrompt:
                    'You are an expert exam question generator. Your task is to create high-quality exam questions based on the provided learning content.\n\nRules:\n1. Questions must be directly based on the provided content\n2. Questions should test understanding, not just memorization\n3. All information in questions must be factually accurate\n4. Multiple choice questions should have exactly 4 options with 1 correct answer\n5. Distractors (wrong options) should be plausible but clearly incorrect\n6. Essay questions should have clear rubrics and sample answers\n7. Always provide explanations for the correct answers\n\nOutput format: JSON object with the following structure based on question type.',
                userPrompt: '{{knowledgeXml}}\n\n{{taskPrompt}}',
                model: 'gpt-4o-mini',
                temperature: 0.7,
                maxTokens: 1500,
                responseFormat: AIResponseFormat.JSON_OBJECT,
            }
        case AIPromptUseCase.EXAM_GRADING_ESSAY:
            return {
                source: 'fallback',
                systemPrompt:
                    'You are an expert essay grader. Your task is to evaluate student essays based on the provided rubric and sample answer.\n\nGuidelines:\n1. Be fair and consistent in your grading\n2. Provide constructive feedback that helps the student improve\n3. Evaluate based on the rubric criteria\n4. Consider content accuracy, depth of analysis, clarity, and structure\n5. Compare to the sample answer but allow for valid alternative approaches\n6. Be specific about what the student did well and what could be improved\n\nOutput format: JSON object with these fields:\n- score: number (points to award, within the max points)\n- feedback: string (detailed feedback for the student)\n- rubricEvaluation: string (how the essay meets each rubric criterion)\n- confidence: number (0-1, your confidence in this grade)',
                userPrompt:
                    "Please grade the following essay response.\n\nQUESTION:\n{{question}}\n\nRUBRIC:\n{{rubricOrDefault}}\n\nSAMPLE ANSWER (for reference):\n{{sampleAnswerOrDefault}}\n\nMAXIMUM POINTS: {{maxPoints}}\n\nSTUDENT'S ESSAY:\n{{userEssayOrDefault}}\n\nPlease evaluate this essay and provide a score out of {{maxPoints}} points, along with detailed feedback.",
                model: 'gpt-4o-mini',
                temperature: 0.3,
                maxTokens: 1500,
                responseFormat: AIResponseFormat.JSON_OBJECT,
            }
        case AIPromptUseCase.AI_ASSISTANT_RAG_SYSTEM:
            return {
                source: 'fallback',
                systemPrompt:
                    '# CSE Training AI Assistant - System Prompt\n\nYou are the AI Teaching Assistant for the CSE Training System. Your role is to help students understand course content by answering questions based EXCLUSIVELY on the provided course materials.\n\n## CRITICAL RULES - YOU MUST FOLLOW THESE WITHOUT EXCEPTION\n\n### Rule 1: ONLY Use Retrieved Content\n- You may ONLY use information from the <retrieved_context> section below\n- NEVER use your general knowledge to answer questions\n- NEVER make up information, examples, or details not in the sources\n- If asked about something not in the context, say you don\'t have that information\n\n### Rule 2: ALWAYS Cite Sources\n- Every factual claim MUST include a citation\n- Citation format: [Chapter > Lesson, timestamp]\n- Multiple claims from different sources need multiple citations\n\n### Rule 3: Handle Uncertainty Honestly\n- If retrieved content is INSUFFICIENT: Say "I don\'t have sufficient information"\n- If making a LOGICAL INFERENCE: Explicitly label it as inference\n- NEVER pretend to know something you don\'t\n\n<retrieved_context>\n{{retrievedContext}}\n</retrieved_context>\n\nRespond strictly in JSON with the shape:\n{\n  "answer": "clear explanation with [citations]",\n  "suggestions": ["follow up question 1", "follow up question 2", "follow up question 3"]\n}\nIf you cannot comply, still return valid JSON with an explanatory "answer" and an empty suggestions array.',
                userPrompt: null,
                model: 'gpt-4o-mini',
                temperature: 0.2,
                maxTokens: 1024,
                responseFormat: AIResponseFormat.TEXT,
            }
        case AIPromptUseCase.AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM:
            return {
                source: 'fallback',
                systemPrompt:
                    `<system_instructions>
# CSE Training AI Assistant

You are the AI Teaching Assistant for the CSE Training System. Your role is to help students understand course content by answering questions based EXCLUSIVELY on the knowledge base provided above.

## Current Context
Course: {{courseTitle}}
Chapter: {{chapterTitle}}
Lesson: {{lessonTitle}}{{videoTimestampLine}}

## CRITICAL RULES

### Rule 1: ONLY Use Knowledge Base Content
- You may ONLY use information from the <knowledge_base> XML above
- NEVER use your general knowledge to answer questions
- NEVER make up information, examples, or details not in the sources
- If asked about something not in the knowledge base, say you don't have that information

### Rule 2: Reference Timestamps
- When citing specific information, include clickable timestamp references
- Use format: [Click to jump to video HH:MM:SS for details]

### Rule 3: Generate Follow-up Content
- After answering, suggest 2-3 relevant follow-up questions
- When appropriate, offer a mini-quiz to test understanding

### Rule 4: Handle Uncertainty Honestly
- If the knowledge base doesn't contain relevant information, say so clearly
- NEVER pretend to know something not in the provided content

## Response Format
Respond strictly in JSON:
{
  "answer": "Your explanation with [Click to jump to video HH:MM:SS for details] references",
  "suggestions": ["follow-up question 1", "follow-up question 2", "follow-up question 3"],
  "quiz": {
    "question": "optional quiz question",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0
  }
}
The "quiz" field is optional - only include when testing understanding would be valuable.
</system_instructions>`,
                userPrompt: null,
                model: 'gpt-4o-mini',
                temperature: 0.2,
                maxTokens: 1024,
                responseFormat: AIResponseFormat.TEXT,
            }
        default:
            return {
                source: 'fallback',
                systemPrompt: 'You are a helpful assistant.',
                userPrompt: null,
                model: 'gpt-4o-mini',
                temperature: 0.2,
                maxTokens: 1024,
                responseFormat: AIResponseFormat.TEXT,
            }
    }
}

async function ensurePromptSchemaAvailable(): Promise<boolean> {
    if (promptSchemaAvailable != null) return promptSchemaAvailable
    try {
        const rows = await prisma.$queryRaw<Array<{ reg: string | null }>>`
          SELECT to_regclass('public.ai_prompt_defaults')::text as reg
        `
        promptSchemaAvailable = !!rows?.[0]?.reg
    } catch {
        promptSchemaAvailable = false
    }
    return promptSchemaAvailable
}

export class AIPromptResolverService {
    static render(template: string, vars: Record<string, unknown>): string {
        return renderTemplate(template, vars)
    }

    static async resolve(params: {
        useCase: AIPromptUseCase
        courseId?: string | null
        examId?: string | null
        templateId?: string | null
    }): Promise<ResolvedAIPrompt> {
        const { useCase, courseId, examId, templateId } = params
        if (!process.env.DATABASE_URL) {
            return { useCase, ...getFallbackPrompt(useCase) }
        }
        if (!(await ensurePromptSchemaAvailable())) {
            return { useCase, ...getFallbackPrompt(useCase) }
        }
        try {
            if (templateId) {
                const t = await prisma.aIPromptTemplate.findUnique({ where: { id: templateId } })
                if (t?.isActive) {
                    return {
                        useCase,
                        source: 'override',
                        templateId: t.id,
                        templateName: t.name,
                        systemPrompt: t.systemPrompt ?? t.template,
                        userPrompt: t.userPrompt ?? null,
                        model: t.model,
                        temperature: t.temperature,
                        maxTokens: t.maxTokens,
                        responseFormat: t.responseFormat,
                    }
                }
            }

            if (courseId) {
                const courseAssignment = await prisma.courseAIPromptAssignment.findUnique({
                    where: { courseId_useCase: { courseId, useCase } },
                    include: { template: true },
                })
                if (courseAssignment?.isEnabled && courseAssignment.template?.isActive) {
                    const t = courseAssignment.template
                    return {
                        useCase,
                        source: 'course',
                        templateId: t.id,
                        templateName: t.name,
                        systemPrompt: t.systemPrompt ?? t.template,
                        userPrompt: t.userPrompt ?? null,
                        model: courseAssignment.modelOverride ?? t.model,
                        temperature: courseAssignment.temperatureOverride ?? t.temperature,
                        maxTokens: courseAssignment.maxTokensOverride ?? t.maxTokens,
                        responseFormat: t.responseFormat,
                    }
                }
            }

            if (examId) {
                const examAssignment = await prisma.examAIPromptAssignment.findUnique({
                    where: { examId_useCase: { examId, useCase } },
                    include: { template: true },
                })
                if (examAssignment?.isEnabled && examAssignment.template?.isActive) {
                    const t = examAssignment.template
                    return {
                        useCase,
                        source: 'exam',
                        templateId: t.id,
                        templateName: t.name,
                        systemPrompt: t.systemPrompt ?? t.template,
                        userPrompt: t.userPrompt ?? null,
                        model: examAssignment.modelOverride ?? t.model,
                        temperature: examAssignment.temperatureOverride ?? t.temperature,
                        maxTokens: examAssignment.maxTokensOverride ?? t.maxTokens,
                        responseFormat: t.responseFormat,
                    }
                }
            }

            const defaultRow = await prisma.aIPromptDefault.findUnique({
                where: { useCase },
                include: { template: true },
            })
            if (defaultRow?.template?.isActive) {
                const t = defaultRow.template
                return {
                    useCase,
                    source: 'default',
                    templateId: t.id,
                    templateName: t.name,
                    systemPrompt: t.systemPrompt ?? t.template,
                    userPrompt: t.userPrompt ?? null,
                    model: t.model,
                    temperature: t.temperature,
                    maxTokens: t.maxTokens,
                    responseFormat: t.responseFormat,
                }
            }
        } catch {
            // In environments where migrations aren't applied (or DB is unavailable), fall back safely.
        }

        return { useCase, ...getFallbackPrompt(useCase) }
    }
}
