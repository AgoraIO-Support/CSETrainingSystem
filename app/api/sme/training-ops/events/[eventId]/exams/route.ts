import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { z } from 'zod'

type RouteContext = { params: Promise<{ eventId: string }> }

const attachExamSchema = z.object({
    examId: z.string().uuid(),
})

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const body = await req.json()
        const { examId } = attachExamSchema.parse(body)

        const event = await TrainingOpsService.attachScopedExamToEvent(user, eventId, examId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Attach SME exam to event error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid input data',
                    details: error.errors,
                },
            }, { status: 400 })
        }

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'AUTH_003',
                    message: 'You can only manage exams within your SME event scope.',
                },
            }, { status: 403 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to attach exam to SME event',
            },
        }, { status: 500 })
    }
})
