import prisma from '@/lib/prisma'

interface AIMessage {
    role: 'user' | 'assistant'
    content: string
}

export class AIService {
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

        // Get lesson context if available
        let lessonContext = ''
        if (conversation.lessonId) {
            const lesson = await prisma.lesson.findUnique({
                where: { id: conversation.lessonId },
                select: {
                    title: true,
                    transcript: true,
                    chapter: {
                        select: {
                            course: {
                                select: {
                                    title: true,
                                },
                            },
                        },
                    },
                },
            })

            if (lesson) {
                lessonContext = `
Course: ${lesson.chapter.course.title}
Lesson: ${lesson.title}
${lesson.transcript ? `Transcript: ${lesson.transcript.substring(0, 1000)}...` : ''}
${params.videoTimestamp ? `Current timestamp: ${params.videoTimestamp}s` : ''}
`
            }
        }

        // Build conversation history
        const messageHistory: AIMessage[] = conversation.messages
            .reverse()
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }))

        // TODO: Integrate with actual AI service (OpenAI, Anthropic, etc.)
        // For now, return a mock response
        const aiResponse = await this.callAIModel({
            userMessage: params.message,
            history: messageHistory,
            context: lessonContext,
        })

        // Save user message
        const userMessage = await prisma.aIMessage.create({
            data: {
                conversationId: params.conversationId,
                role: 'user',
                content: params.message,
                videoTimestamp: params.videoTimestamp,
                context: params.context,
            },
        })

        // Save AI response
        const assistantMessage = await prisma.aIMessage.create({
            data: {
                conversationId: params.conversationId,
                role: 'assistant',
                content: aiResponse.content,
                tokens: aiResponse.tokens,
                model: aiResponse.model,
            },
        })

        return {
            userMessage,
            assistantMessage,
            suggestions: aiResponse.suggestions,
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
     * Call AI model (placeholder - integrate with actual AI service)
     */
    private static async callAIModel(params: {
        userMessage: string
        history: AIMessage[]
        context: string
    }): Promise<{
        content: string
        tokens?: number
        model: string
        suggestions?: string[]
    }> {
        const apiKey = process.env.OPENAI_API_KEY
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

        if (apiKey) {
            try {
                const messages = [
                    {
                        role: 'system',
                        content: `You are a helpful training assistant for the Agora CSE platform. Use the provided lesson context to answer questions concisely. Context: ${params.context || 'No additional context provided.'}

Respond strictly in JSON with the shape:
{
  "answer": "clear explanation here",
  "suggestions": ["follow up question 1", "follow up question 2", "follow up question 3"]
}
If you cannot comply, still return valid JSON with an explanatory "answer" and an empty suggestions array.`,
                    },
                    ...params.history,
                    { role: 'user', content: params.userMessage },
                ]

                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages,
                        temperature: 0.2,
                    }),
                })

                if (!response.ok) {
                    throw new Error(`OpenAI error: ${response.status}`)
                }

                const data = await response.json()
                const rawContent: string =
                    data.choices?.[0]?.message?.content?.trim() ||
                    'Unable to generate a response right now.'

                let parsed: { answer?: string; suggestions?: string[] } | null = null
                try {
                    parsed = JSON.parse(rawContent)
                } catch {
                    parsed = null
                }

                const answer = parsed?.answer || rawContent
                const suggestions = Array.isArray(parsed?.suggestions)
                    ? parsed!.suggestions.filter((s: any): s is string => typeof s === 'string' && s.trim().length > 0)
                    : undefined

                return {
                    content: answer,
                    tokens: data.usage?.total_tokens,
                    model: data.model || model,
                    suggestions,
                }
            } catch (error) {
                console.error('OpenAI call failed, falling back to mock response:', error)
            }
        }

        // Fallback mock response
        return {
            content: `I understand you're asking about: "${params.userMessage}". Here's a helpful explanation based on the lesson context.`,
            tokens: 50,
            model: apiKey ? (process.env.OPENAI_MODEL || 'openai-fallback') : 'mock-model',
            suggestions: [
                'Can you explain this concept further?',
                'What are some practical examples?',
                'How does this relate to the previous lesson?',
            ],
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
}
