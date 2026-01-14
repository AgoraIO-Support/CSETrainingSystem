import prisma from '@/lib/prisma'
import { RAGService } from './_legacy_rag.service'
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service'
import { log, timeAsync } from '@/lib/logger'
import { ChunkingService } from './_legacy_chunking.service'
import { AIPromptResolverService } from '@/lib/services/ai-prompt-resolver.service'
import { AIPromptUseCase } from '@prisma/client'
import { extractChatCompletionsText, getChatCompletionsTokenBudget } from '@/lib/services/openai-models'

interface AIMessage {
    role: 'user' | 'assistant'
    content: string
}

interface AIConfig {
    systemPrompt: string
    model: string
    temperature: number
    maxTokens: number
    includeTranscript: boolean
    customContext?: string | null
}

interface RAGContext {
    enabled: boolean
    context: string
    sources: any[]
    confidence: string
}

interface FullContextResult {
    enabled: boolean
    xml: string
    courseInfo: {
        courseName: string
        chapterTitle: string
        lessonTitle: string
    }
}

const DEFAULT_AI_CONFIG: AIConfig = {
    systemPrompt: `You are a helpful training assistant for the Agora CSE platform. Use the provided lesson context to answer questions concisely and accurately. If you're unsure about something, say so rather than making up information.`,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 1024,
    includeTranscript: true,
}

export class AIService {
    private static isBroadOverviewQuestion(message: string) {
        const m = message.toLowerCase()
        return (
            m.includes('lesson') ||
            m.includes('workshop') ||
            m.includes('overview') ||
            m.includes('summary') ||
            m.includes('summarize') ||
            m.includes('what is this about') ||
            m.includes('what is this lesson about')
        )
    }

    private static buildLegacyLessonContext(params: {
        courseTitle: string
        chapterTitle: string
        lessonTitle: string
        lessonDescription?: string | null
        learningObjectives?: string[] | null
        transcript?: string | null
        includeTranscript: boolean
        videoTimestamp?: number
        customContext?: string | null
    }) {
        const contextParts: string[] = [
            `Course: ${params.courseTitle}`,
            `Chapter: ${params.chapterTitle}`,
            `Lesson: ${params.lessonTitle}`,
        ]

        if (params.lessonDescription) {
            contextParts.push(`Description: ${params.lessonDescription}`)
        }

        if (params.learningObjectives && params.learningObjectives.length > 0) {
            contextParts.push(`Learning Objectives: ${params.learningObjectives.join(', ')}`)
        }

        if (params.includeTranscript && params.transcript) {
            const truncatedTranscript =
                params.transcript.length > 2000
                    ? `${params.transcript.substring(0, 2000)}...`
                    : params.transcript
            contextParts.push(`Transcript: ${truncatedTranscript}`)
        }

        if (params.videoTimestamp !== undefined) {
            contextParts.push(`Current video timestamp: ${params.videoTimestamp}s`)
        }

        if (params.customContext) {
            contextParts.push(`Additional Context: ${params.customContext}`)
        }

        return contextParts.join('\n')
    }

    private static formatRagChunkForContext(params: {
        chapterTitle?: string | null
        lessonTitle?: string | null
        startTime: number
        endTime: number
        startTimestamp?: string | null
        endTimestamp?: string | null
        text: string
    }) {
        const chapterTitle = params.chapterTitle || 'Unknown Chapter'
        const lessonTitle = params.lessonTitle || 'Unknown Lesson'
        const timestamp =
            params.startTimestamp && params.endTimestamp
                ? `${params.startTimestamp}-${params.endTimestamp}`
                : `${ChunkingService.formatTimestamp(params.startTime)}-${ChunkingService.formatTimestamp(params.endTime)}`

        return `[Source: ${chapterTitle} > ${lessonTitle}, ${timestamp}]\n${params.text}`
    }
    /**
     * Get the effective AI configuration for a lesson
     * Priority: Lesson config > Course config > Default
     */
    private static async getEffectiveAIConfig(
        lessonId?: string | null,
        courseId?: string | null
    ): Promise<AIConfig> {
        // Try lesson-level config first
        if (lessonId) {
            const lessonConfig = await prisma.lessonAIConfig.findUnique({
                where: { lessonId }
            })

            if (lessonConfig?.isEnabled) {
                return {
                    systemPrompt: lessonConfig.systemPrompt,
                    model: lessonConfig.modelOverride || DEFAULT_AI_CONFIG.model,
                    temperature: lessonConfig.temperature ?? DEFAULT_AI_CONFIG.temperature,
                    maxTokens: lessonConfig.maxTokens ?? DEFAULT_AI_CONFIG.maxTokens,
                    includeTranscript: lessonConfig.includeTranscript ?? true,
                    customContext: lessonConfig.customContext,
                }
            }
        }

        // Fall back to course-level config
        if (courseId) {
            const courseConfig = await prisma.courseAIConfig.findUnique({
                where: { courseId }
            })

            if (courseConfig?.isEnabled) {
                return {
                    systemPrompt: courseConfig.systemPrompt,
                    model: courseConfig.modelOverride || DEFAULT_AI_CONFIG.model,
                    temperature: courseConfig.temperature ?? DEFAULT_AI_CONFIG.temperature,
                    maxTokens: courseConfig.maxTokens ?? DEFAULT_AI_CONFIG.maxTokens,
                    includeTranscript: true,
                }
            }
        }

        // Return default config
        return DEFAULT_AI_CONFIG
    }

    private static async isAIAssistantEnabled(courseId?: string | null): Promise<boolean> {
        if (!courseId) return true
        const row = await prisma.courseAIConfig.findUnique({
            where: { courseId },
            select: { isEnabled: true },
        })
        return row?.isEnabled ?? true
    }

    /**
     * Check if RAG is available for a lesson
     */
    private static async checkRAGAvailability(lessonId: string): Promise<boolean> {
        const transcript = await prisma.transcriptAsset.findFirst({
            where: {
                lessonId,
                status: 'READY',
            },
        })

        return transcript !== null
    }

    /**
     * Check if full context injection is available (new XML-based system)
     */
    private static async getFullContext(lessonId: string): Promise<FullContextResult> {
        try {
            // Check if knowledge context exists and is ready
            const context = await prisma.knowledgeContext.findUnique({
                where: { lessonId },
                select: { status: true },
            })

            if (!context || context.status !== 'READY') {
                return { enabled: false, xml: '', courseInfo: { courseName: '', chapterTitle: '', lessonTitle: '' } }
            }

            // Get lesson info for course context
            const lesson = await prisma.lesson.findUnique({
                where: { id: lessonId },
                select: {
                    title: true,
                    chapter: {
                        select: {
                            title: true,
                            course: {
                                select: { title: true },
                            },
                        },
                    },
                },
            })

            if (!lesson) {
                return { enabled: false, xml: '', courseInfo: { courseName: '', chapterTitle: '', lessonTitle: '' } }
            }

            // Retrieve XML content
            const knowledgeService = new KnowledgeContextService()
            const xml = await knowledgeService.getKnowledgeContext(lessonId)

            if (!xml) {
                return { enabled: false, xml: '', courseInfo: { courseName: '', chapterTitle: '', lessonTitle: '' } }
            }

            log('AIService', 'info', 'Full context retrieved', {
                lessonId,
                xmlLength: xml.length,
            })

            return {
                enabled: true,
                xml,
                courseInfo: {
                    courseName: lesson.chapter.course.title,
                    chapterTitle: lesson.chapter.title,
                    lessonTitle: lesson.title,
                },
            }
        } catch (error) {
            log('AIService', 'error', 'Failed to get full context', {
                lessonId,
                error: error instanceof Error ? error.message : 'Unknown',
            })
            return { enabled: false, xml: '', courseInfo: { courseName: '', chapterTitle: '', lessonTitle: '' } }
        }
    }

    /**
     * Build system prompt with full context injection
     * CRITICAL: XML must be FIRST for OpenAI context caching to work efficiently
     */
    private static buildFullContextPrompt(params: {
        xml: string
        courseInfo: {
            courseName: string
            chapterTitle: string
            lessonTitle: string
        }
        videoTimestamp?: number
    }): string {
        // XML MUST be first for cache efficiency (static prefix)
        return `${params.xml}

<system_instructions>
# CSE Training AI Assistant

You are the AI Teaching Assistant for the CSE Training System. Your role is to help students understand course content by answering questions based EXCLUSIVELY on the knowledge base provided above.

## Current Context
Course: ${params.courseInfo.courseName}
Chapter: ${params.courseInfo.chapterTitle}
Lesson: ${params.courseInfo.lessonTitle}${params.videoTimestamp !== undefined ? `\nCurrent video position: ${Math.floor(params.videoTimestamp)}s` : ''}

## CRITICAL RULES

### Rule 1: ONLY Use Knowledge Base Content
- You may ONLY use information from the <knowledge_base> XML above
- NEVER use your general knowledge to answer questions
- NEVER make up information, examples, or details not in the sources
- If asked about something not in the knowledge base, say you don't have that information

### Rule 2: Reference Timestamps
- When citing specific information, include clickable timestamp references
- Use format: [Click to jump to video HH:MM:SS for details]
- Example: "As explained in the video [Click to jump to video 00:02:30 for details], the process involves..."

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
</system_instructions>`
    }

    /**
     * Get RAG context for a query
     */
    private static async getRAGContext(
        lessonId: string,
        query: string,
        courseInfo: {
            courseName: string
            chapterTitle: string
            lessonTitle: string
        }
    ): Promise<RAGContext> {
        try {
            const ragService = new RAGService(process.env.OPENAI_API_KEY)
            const startedAt = Date.now()
            const result = await ragService.queryLesson(lessonId, query, {
                topK: 8,
                similarityThreshold: 0.20,  // Lowered to capture more context - scores typically 0.25-0.35
                maxContextTokens: 2200,
            })

            await ragService.cleanup()

            let context = result.context
            let sources = result.sources

            const shouldAugmentWithIntro =
                this.isBroadOverviewQuestion(query) ||
                result.confidence === 'LOW' ||
                result.confidence === 'INSUFFICIENT' ||
                (context?.trim()?.length ?? 0) < 300

            if (shouldAugmentWithIntro) {
                const transcript = await prisma.transcriptAsset.findFirst({
                    where: { lessonId, status: 'READY' },
                    orderBy: { updatedAt: 'desc' },
                    select: { id: true },
                })

                if (transcript) {
                    const introChunks = await prisma.transcriptChunk.findMany({
                        where: { transcriptId: transcript.id },
                        orderBy: { sequenceIndex: 'asc' },
                        take: 2,
                        select: {
                            id: true,
                            text: true,
                            startTime: true,
                            endTime: true,
                            metadata: true,
                        },
                    })

                    const seen = new Set((sources || []).map((s: any) => s?.chunkId).filter(Boolean))
                    const introContextParts = introChunks
                        .filter((c) => !seen.has(c.id))
                        .map((c) => {
                            const md: any = c.metadata || {}
                            const startTime = Number(c.startTime)
                            const endTime = Number(c.endTime)
                            return this.formatRagChunkForContext({
                                chapterTitle: md.chapterTitle || courseInfo.chapterTitle,
                                lessonTitle: md.lessonTitle || courseInfo.lessonTitle,
                                startTime,
                                endTime,
                                startTimestamp: md.startTimestamp,
                                endTimestamp: md.endTimestamp,
                                text: c.text,
                            })
                        })

                    const introSources = introChunks
                        .filter((c) => !seen.has(c.id))
                        .map((c) => {
                            const md: any = c.metadata || {}
                            const startTime = Number(c.startTime)
                            const endTime = Number(c.endTime)
                            return {
                                chunkId: c.id,
                                chapterTitle: md.chapterTitle || courseInfo.chapterTitle,
                                lessonTitle: md.lessonTitle || courseInfo.lessonTitle,
                                startTime,
                                endTime,
                                timestamp:
                                    md.startTimestamp && md.endTimestamp
                                        ? `${md.startTimestamp}-${md.endTimestamp}`
                                        : `${ChunkingService.formatTimestamp(startTime)}-${ChunkingService.formatTimestamp(endTime)}`,
                                snippet: String(c.text || '').slice(0, 200),
                                relevanceScore: 0.35,
                            }
                        })

                    if (introContextParts.length > 0) {
                        context = [introContextParts.join('\n\n'), context].filter(Boolean).join('\n\n')
                        sources = [...introSources, ...(sources || [])]
                    }
                }
            }

            log('OpenAI', 'info', 'rag retrieval', {
                lessonId,
                confidence: result.confidence,
                sourcesCount: sources?.length ?? 0,
                contextChars: (context || '').length,
                augmentedIntro: shouldAugmentWithIntro,
                durationMs: Date.now() - startedAt,
            })

            return {
                enabled: Boolean(context && context.trim().length > 0),
                context,
                sources,
                confidence: result.confidence,
            }
        } catch (error) {
            console.error('[AIService] RAG context retrieval error:', error)
            return {
                enabled: false,
                context: '',
                sources: [],
                confidence: 'INSUFFICIENT',
            }
        }
    }

    /**
     * Create a new AI conversation
     */
    static async createConversation(params: {
        userId: string
        courseId?: string
        lessonId?: string
    }) {
        const existing = await prisma.aIConversation.findFirst({
            where: {
                userId: params.userId,
                courseId: params.courseId,
                lessonId: params.lessonId,
            },
            orderBy: { createdAt: 'desc' },
        })

        if (existing) {
            return existing
        }

        return await prisma.aIConversation.create({
            data: {
                userId: params.userId,
                courseId: params.courseId,
                lessonId: params.lessonId,
            },
        })
    }

    /**
     * Send message to AI and get response
     */
    static async sendMessage(params: {
        conversationId: string
        message: string
        videoTimestamp?: number
        context?: any
    }) {
        // Get conversation with context
        const conversation = await prisma.aIConversation.findUnique({
            where: { id: params.conversationId },
            include: {
                user: {
                    select: {
                        name: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 10, // Last 10 messages for context
                },
            },
        })

        if (!conversation) {
            throw new Error('CONVERSATION_NOT_FOUND')
        }

        const userMessage = await prisma.aIMessage.create({
            data: {
                conversationId: params.conversationId,
                role: 'user',
                content: params.message,
                videoTimestamp: params.videoTimestamp,
                context: params.context,
            },
        })

        const aiEnabled = await this.isAIAssistantEnabled(conversation.courseId ?? null)
        if (!aiEnabled) {
            const assistantMessage = await prisma.aIMessage.create({
                data: {
                    conversationId: params.conversationId,
                    role: 'assistant',
                    content: 'AI assistant is disabled for this course.',
                    tokens: null,
                    model: null,
                    context: { contextMode: 'unavailable', reason: 'DISABLED_BY_ADMIN' },
                },
            })
            return { userMessage, assistantMessage, suggestions: [], quiz: undefined, sources: [], contextMode: 'unavailable' as const }
        }

        if (!conversation.lessonId) {
            const assistantMessage = await prisma.aIMessage.create({
                data: {
                    conversationId: params.conversationId,
                    role: 'assistant',
                    content: 'No lesson was provided for this conversation, so knowledge context is unavailable.',
                    tokens: null,
                    model: null,
                    context: { contextMode: 'unavailable', reason: 'NO_LESSON' },
                },
            })
            return { userMessage, assistantMessage, suggestions: [], quiz: undefined, sources: [], contextMode: 'unavailable' as const }
        }

        const fullContext = await this.getFullContext(conversation.lessonId)
        if (!fullContext.enabled) {
            const assistantMessage = await prisma.aIMessage.create({
                data: {
                    conversationId: params.conversationId,
                    role: 'assistant',
                    content:
                        'This lesson does not have Knowledge Context yet. Please ask an admin to run "Upload and Process" for the transcript before using the AI assistant.',
                    tokens: null,
                    model: null,
                    context: { contextMode: 'unavailable', reason: 'KNOWLEDGE_CONTEXT_NOT_READY' },
                },
            })
            return { userMessage, assistantMessage, suggestions: [], quiz: undefined, sources: [], contextMode: 'unavailable' as const }
        }

        const promptConfig = await AIPromptResolverService.resolve({
            useCase: AIPromptUseCase.AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM,
            courseId: conversation.courseId ?? null,
        })

        const videoTimestampLine =
            params.videoTimestamp !== undefined ? `\nCurrent video position: ${Math.floor(params.videoTimestamp)}s` : ''

        const renderedInstructions = AIPromptResolverService.render(promptConfig.systemPrompt, {
            courseTitle: fullContext.courseInfo.courseName,
            chapterTitle: fullContext.courseInfo.chapterTitle,
            lessonTitle: fullContext.courseInfo.lessonTitle,
            videoTimestampLine,
        })

        const lessonContext = `${fullContext.xml}\n\n${renderedInstructions}`
        const contextMode = 'full' as const

        log('AIService', 'info', 'Using knowledge context assistant', {
            lessonId: conversation.lessonId,
            templateId: promptConfig.templateId ?? null,
            templateName: promptConfig.templateName ?? null,
            source: promptConfig.source,
            contextLength: lessonContext.length,
        })

        // Build conversation history
        const messageHistory: AIMessage[] = conversation.messages
            .reverse()
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }))

        // Call AI model with configured settings
        const aiConfig: AIConfig = {
            systemPrompt: '',
            model: promptConfig.model,
            temperature: promptConfig.temperature,
            maxTokens: promptConfig.maxTokens,
            includeTranscript: true,
        }

        const aiResponse = await this.callAIModel({
            userMessage: params.message,
            history: messageHistory,
            context: lessonContext,
            config: aiConfig,
            contextMode,
        })

        // Build response context based on mode
        let responseContext: any = undefined
        responseContext = {
            contextMode: 'full',
            fullContextEnabled: true,
            templateId: promptConfig.templateId ?? null,
            templateName: promptConfig.templateName ?? null,
            templateSource: promptConfig.source,
        }

        // Save AI response
        const assistantMessage = await prisma.aIMessage.create({
            data: {
                conversationId: params.conversationId,
                role: 'assistant',
                content: aiResponse.content,
                tokens: aiResponse.tokens,
                model: aiResponse.model,
                context: responseContext,
            },
        })

        return {
            userMessage,
            assistantMessage,
            suggestions: aiResponse.suggestions,
            quiz: aiResponse.quiz, // Include quiz if present
            sources: [],
            contextMode, // Let frontend know which mode was used
        }
    }

    /**
     * Get conversation messages
     */
    static async getMessages(conversationId: string) {
        return await prisma.aIMessage.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        })
    }

    /**
     * Call AI model with configured settings
     */
    private static async callAIModel(params: {
        userMessage: string
        history: AIMessage[]
        context: string
        config: AIConfig
        contextMode?: 'full'
    }): Promise<{
        content: string
        tokens?: number
        model: string
        suggestions?: string[]
        quiz?: {
            question: string
            options: string[]
            correctIndex: number
        }
    }> {
        const apiKey = process.env.OPENAI_API_KEY
        const { config, contextMode = 'full' } = params
        const logOpenAiContent = process.env.CSE_OPENAI_LOG_CONTENT === '1'

        if (apiKey) {
            try {
                // Knowledge Context injection: context IS the system prompt and must include the XML prefix.
                const systemPromptWithContext = params.context

                const messages = [
                    {
                        role: 'system',
                        content: systemPromptWithContext,
                    },
                    ...params.history,
                    { role: 'user', content: params.userMessage },
                ]

                const doRequest = async (maxTokens: number, attempt: 1 | 2) => {
                    const budget = getChatCompletionsTokenBudget(config.model, maxTokens)
                    const requestBody = {
                        model: config.model,
                        messages,
                        temperature: config.temperature,
                        ...budget.param,
                    }

                    log('OpenAI', 'info', 'chat.completions request', {
                        attempt,
                        model: config.model,
                        temperature: config.temperature,
                        tokenParam: budget.tokenParam,
                        requestedMaxTokens: budget.requestedMaxTokens,
                        effectiveMaxTokens: budget.effectiveMaxTokens,
                        clamped: budget.clamped,
                        messagesCount: messages.length,
                        userMessageChars: params.userMessage.length,
                        historyCount: params.history.length,
                        contextChars: (params.context || '').length,
                        contextMode,
                    })

                    if (logOpenAiContent) {
                        log('OpenAI', 'debug', 'chat.completions request body', { body: requestBody })
                    }

                    const response = await timeAsync(
                        'OpenAI',
                        'chat.completions response',
                        { url: 'https://api.openai.com/v1/chat/completions', model: config.model, attempt },
                        () =>
                            fetch('https://api.openai.com/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${apiKey}`,
                                },
                                body: JSON.stringify(requestBody),
                            })
                    )

                    return { response, budget, requestBody }
                }

                const { response, budget } = await doRequest(config.maxTokens, 1)

                if (!response.ok) {
                    const errorText = await response.text()
                    log('OpenAI', 'error', 'chat.completions error', {
                        status: response.status,
                        bodyPreview: errorText.slice(0, 500),
                    })
                    if (logOpenAiContent) {
                        log('OpenAI', 'error', 'chat.completions error body', { status: response.status, body: errorText })
                    }
                    throw new Error(`OpenAI error: ${response.status}`)
                }

                let data = await response.json()
                if (logOpenAiContent) {
                    log('OpenAI', 'debug', 'chat.completions raw response', { response: data })
                }
                log('OpenAI', 'info', 'chat.completions usage', {
                    model: data.model || config.model,
                    totalTokens: data.usage?.total_tokens,
                    promptTokens: data.usage?.prompt_tokens,
                    completionTokens: data.usage?.completion_tokens,
                })

                let extracted = extractChatCompletionsText(data)
                const finishReason = data.choices?.[0]?.finish_reason

                // GPT-5 family can spend the entire completion budget on reasoning, producing empty message.content.
                // If that happens, retry once with a larger max_completion_tokens budget.
                if (!extracted.text && budget.tokenParam === 'max_completion_tokens' && finishReason === 'length') {
                    const retryMaxTokens = Math.min(8192, Math.max(4096, budget.effectiveMaxTokens * 2))
                    if (retryMaxTokens > budget.effectiveMaxTokens) {
                        log('OpenAI', 'warn', 'chat.completions retrying due to empty content', {
                            model: data.model || config.model,
                            finishReason,
                            previousMaxCompletionTokens: budget.effectiveMaxTokens,
                            retryMaxCompletionTokens: retryMaxTokens,
                        })

                        const retry = await doRequest(retryMaxTokens, 2)
                        if (!retry.response.ok) {
                            const errorText = await retry.response.text()
                            log('OpenAI', 'error', 'chat.completions retry error', {
                                status: retry.response.status,
                                bodyPreview: errorText.slice(0, 500),
                            })
                            throw new Error(`OpenAI retry error: ${retry.response.status}`)
                        }

                        data = await retry.response.json()
                        if (logOpenAiContent) {
                            log('OpenAI', 'debug', 'chat.completions retry raw response', { response: data })
                        }
                        log('OpenAI', 'info', 'chat.completions retry usage', {
                            model: data.model || config.model,
                            totalTokens: data.usage?.total_tokens,
                            promptTokens: data.usage?.prompt_tokens,
                            completionTokens: data.usage?.completion_tokens,
                        })

                        extracted = extractChatCompletionsText(data)
                    }
                }

                if (!extracted.text) {
                    log('OpenAI', 'error', 'chat.completions missing message content', {
                        model: data.model || config.model,
                        finishReason: data.choices?.[0]?.finish_reason,
                        extractedSource: extracted.source,
                    })
                }

                const rawContent: string = extracted.text || 'Unable to generate a response right now.'
                if (logOpenAiContent) {
                    log('OpenAI', 'debug', 'chat.completions message.content', { content: rawContent, source: extracted.source })
                }

                let parsed: {
                    answer?: string
                    suggestions?: string[]
                    quiz?: {
                        question: string
                        options: string[]
                        correctIndex: number
                    }
                } | null = null
                try {
                    // Try parsing the raw content as JSON first
                    parsed = JSON.parse(rawContent)
                } catch {
                    // If direct parsing fails, try extracting JSON from markdown code blocks
                    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/)
                    if (jsonMatch) {
                        try {
                            parsed = JSON.parse(jsonMatch[1].trim())
                        } catch {
                            parsed = null
                        }
                    }

                    // If still not parsed, try to find JSON object pattern in the text
                    if (!parsed) {
                        const jsonObjectMatch = rawContent.match(/\{[\s\S]*"answer"[\s\S]*\}/)
                        if (jsonObjectMatch) {
                            try {
                                parsed = JSON.parse(jsonObjectMatch[0])
                            } catch {
                                parsed = null
                            }
                        }
                    }
                }

                const answer = parsed?.answer || rawContent
                const suggestions = Array.isArray(parsed?.suggestions)
                    ? parsed!.suggestions.filter((s: any): s is string => typeof s === 'string' && s.trim().length > 0)
                    : undefined

                // Extract quiz if present (only in full context mode)
                let quiz = undefined
                if (parsed?.quiz && typeof parsed.quiz === 'object') {
                    const q = parsed.quiz
                    if (
                        typeof q.question === 'string' &&
                        Array.isArray(q.options) &&
                        typeof q.correctIndex === 'number'
                    ) {
                        quiz = {
                            question: q.question,
                            options: q.options.filter((o: any): o is string => typeof o === 'string'),
                            correctIndex: q.correctIndex,
                        }
                    }
                }

                return {
                    content: answer,
                    tokens: data.usage?.total_tokens,
                    model: data.model || config.model,
                    suggestions,
                    quiz,
                }
            } catch (error) {
                log('OpenAI', 'error', 'OpenAI call failed, falling back to mock response', {
                    error: error instanceof Error ? error.message : String(error),
                })
            }
        }

        // Fallback response when no API key or call fails.
        // IMPORTANT: do not hallucinate answers from context.
        return {
            content: 'Unable to generate a response right now.',
            tokens: undefined,
            model: apiKey ? `${config.model}-fallback` : 'mock-model',
            suggestions: [],
        }
    }

    /**
     * Get AI prompt templates
     */
    static async getPromptTemplates() {
        return await prisma.aIPromptTemplate.findMany({
            where: { isActive: true },
        })
    }

    /**
     * Get AI configuration for a course (for admin UI)
     */
    static async getCourseAIConfig(courseId: string) {
        return await prisma.courseAIConfig.findUnique({
            where: { courseId }
        })
    }

    /**
     * Get AI configuration for a lesson (for admin UI)
     */
    static async getLessonAIConfig(lessonId: string) {
        return await prisma.lessonAIConfig.findUnique({
            where: { lessonId }
        })
    }
}
