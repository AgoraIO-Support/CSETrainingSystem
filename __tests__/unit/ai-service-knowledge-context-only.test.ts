jest.mock('@/lib/logger', () => ({
    log: jest.fn(),
    timeAsync: async (_category: string, _message: string, _meta: any, fn: any) => await fn(),
}))

jest.mock('@/lib/services/knowledge-context.service', () => ({
    KnowledgeContextService: jest.fn().mockImplementation(() => ({
        getKnowledgeContext: jest.fn(async () => '<knowledge_base><section id="s1">Hello</section></knowledge_base>'),
    })),
}))

jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    default: {
        aIConversation: { findUnique: jest.fn() },
        aIMessage: { create: jest.fn() },
        courseAIConfig: { findUnique: jest.fn() },
        knowledgeContext: { findUnique: jest.fn() },
        lesson: { findUnique: jest.fn() },
    },
}))

const prismaMock = (jest.requireMock('@/lib/prisma') as any).default as {
    aIConversation: { findUnique: jest.Mock }
    aIMessage: { create: jest.Mock }
    courseAIConfig: { findUnique: jest.Mock }
    knowledgeContext: { findUnique: jest.Mock }
    lesson: { findUnique: jest.Mock }
}

const { AIService } = require('@/lib/services/ai.service') as typeof import('@/lib/services/ai.service')
const { AIPromptResolverService } = require('@/lib/services/ai-prompt-resolver.service') as typeof import('@/lib/services/ai-prompt-resolver.service')
const { AIPromptUseCase, AIResponseFormat } = require('@prisma/client') as typeof import('@prisma/client')

describe('AI assistant knowledge_context-only behavior', () => {
    beforeEach(() => {
        prismaMock.aIConversation.findUnique.mockReset()
        prismaMock.aIMessage.create.mockReset()
        prismaMock.courseAIConfig.findUnique.mockReset()
        prismaMock.knowledgeContext.findUnique.mockReset()
        prismaMock.lesson.findUnique.mockReset()

        process.env.OPENAI_API_KEY = 'test-key'
        ;(global as any).fetch = jest.fn()
    })

    it('does not call OpenAI and replies with a warning when knowledge context is missing', async () => {
        prismaMock.aIConversation.findUnique.mockResolvedValue({
            id: 'c-1',
            courseId: 'course-1',
            lessonId: 'lesson-1',
            user: { name: 'User' },
            messages: [],
        })
        prismaMock.courseAIConfig.findUnique.mockResolvedValue(null) // enabled by default
        prismaMock.knowledgeContext.findUnique.mockResolvedValue(null) // not READY

        let counter = 0
        prismaMock.aIMessage.create.mockImplementation(async ({ data }: any) => ({
            id: `m-${++counter}`,
            ...data,
            createdAt: new Date(),
        }))

        const result = await AIService.sendMessage({
            conversationId: 'c-1',
            message: 'What is this about?',
        })

        expect((global as any).fetch).not.toHaveBeenCalled()
        expect(result.userMessage.role).toBe('user')
        expect(result.assistantMessage.role).toBe('assistant')
        expect(result.assistantMessage.content).toContain('Knowledge Context')
    })

    it('uses the knowledge context prompt template and calls OpenAI when knowledge context is READY', async () => {
        prismaMock.aIConversation.findUnique.mockResolvedValue({
            id: 'c-1',
            courseId: 'course-1',
            lessonId: 'lesson-1',
            user: { name: 'User' },
            messages: [],
        })
        prismaMock.courseAIConfig.findUnique.mockResolvedValue(null) // enabled by default
        prismaMock.knowledgeContext.findUnique.mockResolvedValue({ status: 'READY' })
        prismaMock.lesson.findUnique.mockResolvedValue({
            title: 'Lesson 1',
            chapter: { title: 'Chapter 1', course: { title: 'Course 1' } },
        })

        const resolveSpy = jest.spyOn(AIPromptResolverService, 'resolve').mockResolvedValue({
            useCase: AIPromptUseCase.AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM,
            source: 'default',
            templateId: 'tpl-1',
            templateName: 'assistant_default',
            systemPrompt: '<system_instructions>Course={{courseTitle}}</system_instructions>',
            userPrompt: null,
            model: 'gpt-4o-mini',
            temperature: 0.2,
            maxTokens: 1234,
            responseFormat: AIResponseFormat.TEXT,
        })

        let counter = 0
        prismaMock.aIMessage.create.mockImplementation(async ({ data }: any) => ({
            id: `m-${++counter}`,
            ...data,
            createdAt: new Date(),
        }))

        ;(global as any).fetch.mockImplementation(async (_url: string, init: any) => {
            const body = JSON.parse(init.body)
            expect(body.model).toBe('gpt-4o-mini')
            expect(body.max_tokens).toBe(1234)
            expect(body.messages?.[0]?.role).toBe('system')
            expect(String(body.messages?.[0]?.content)).toContain('<knowledge_base>')
            expect(String(body.messages?.[0]?.content)).toContain('Course=Course 1')

            return {
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'gpt-4o-mini',
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    answer: 'ok',
                                    suggestions: [],
                                }),
                            },
                        },
                    ],
                    usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
                }),
                text: async () => '',
            }
        })

        const result = await AIService.sendMessage({
            conversationId: 'c-1',
            message: 'Explain section 1',
            videoTimestamp: 10,
        })

        expect(resolveSpy).toHaveBeenCalledWith({
            useCase: AIPromptUseCase.AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM,
            courseId: 'course-1',
        })
        expect((global as any).fetch).toHaveBeenCalledTimes(1)
        expect(result.assistantMessage.content).toContain('ok')

        resolveSpy.mockRestore()
    })
})
