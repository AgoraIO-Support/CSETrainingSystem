import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{ eventId: string }>
}

const attachExamSchema = z.object({
    examId: z.string().uuid('Exam ID must be a valid UUID'),
})

export const POST = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const body = await req.json()
        const data = attachExamSchema.parse(body)

        const event = await TrainingOpsService.attachExamToEvent(eventId, data.examId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Attach exam to event error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid input data',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        if (error instanceof Error) {
            const mapped: Record<string, { status: number; message: string }> = {
                LEARNING_EVENT_NOT_FOUND: { status: 404, message: 'Learning event not found' },
                EXAM_NOT_FOUND: { status: 404, message: 'Exam not found' },
                EXAM_ARCHIVED: { status: 400, message: 'Archived exams cannot be linked to learning events' },
                EXAM_ALREADY_LINKED_TO_OTHER_EVENT: { status: 409, message: 'Exam is already linked to another learning event' },
                EXAM_DOMAIN_MISMATCH: { status: 400, message: 'Exam product domain conflicts with the selected learning event' },
                EXAM_SERIES_MISMATCH: { status: 400, message: 'Exam learning series conflicts with the selected learning event' },
            }

            const match = mapped[error.message]
            if (match) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: match.message,
                        },
                    },
                    { status: match.status }
                )
            }
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to attach exam to learning event',
                },
            },
            { status: 500 }
        )
    }
})
