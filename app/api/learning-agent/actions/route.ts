import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import { LearningAgentService } from '@/lib/services/learning-agent.service'

const requestSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('lesson_coach'),
        courseId: z.string().uuid(),
        lessonId: z.string().uuid(),
        currentTimestamp: z.number().int().min(0).optional(),
    }),
    z.object({
        action: z.literal('exam_mistake_review'),
        examId: z.string().uuid(),
        attemptId: z.string().uuid().optional().nullable(),
    }),
    z.object({
        action: z.literal('learning_plan'),
    }),
])

export const POST = withAuth(async (req, user) => {
    try {
        const body = await req.json()
        const payload = requestSchema.parse(body)

        const data =
            payload.action === 'lesson_coach'
                ? await LearningAgentService.createLessonCoach({
                    userId: user.id,
                    courseId: payload.courseId,
                    lessonId: payload.lessonId,
                    currentTimestamp: payload.currentTimestamp,
                })
                : payload.action === 'exam_mistake_review'
                    ? await LearningAgentService.createExamMistakeReview({
                        userId: user.id,
                        examId: payload.examId,
                        attemptId: payload.attemptId ?? null,
                    })
                    : await LearningAgentService.createLearningPlan({ userId: user.id })

        return NextResponse.json({ success: true, data })
    } catch (error) {
        console.error('Learning agent action error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid learning agent request',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        if (error instanceof Error) {
            const isProviderError = /^OpenAI error: \d+|^Vexke error: \d+/.test(error.message)
            const status =
                error.message === 'NOT_ENROLLED' || error.message === 'FORBIDDEN'
                    ? 403
                    : error.message === 'KNOWLEDGE_CONTEXT_NOT_READY' || error.message === 'ATTEMPT_NOT_FOUND'
                        ? 404
                        : error.message.endsWith('_API_KEY_MISSING')
                            ? 500
                            : 500
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: error.message,
                        message:
                            error.message === 'KNOWLEDGE_CONTEXT_NOT_READY'
                                ? 'Knowledge Context is not ready for this lesson.'
                                : error.message === 'ATTEMPT_NOT_FOUND'
                                    ? 'No completed attempt was found for this exam.'
                                    : error.message.endsWith('_API_KEY_MISSING')
                                        ? 'Learning Agent LLM provider is not configured.'
                                        : isProviderError
                                            ? error.message
                                        : 'Learning Agent failed to generate a response.',
                    },
                },
                { status }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Learning Agent failed to generate a response.' } },
            { status: 500 }
        )
    }
})
