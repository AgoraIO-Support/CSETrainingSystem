import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = { params: Promise<{ eventId: string; examId: string }> }

export const DELETE = withSmeOrAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { eventId, examId } = await context.params
        const event = await TrainingOpsService.detachScopedExamFromEvent(user, eventId, examId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Detach SME exam from event error:', error)

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'AUTH_003',
                    message: 'You can only manage exams within your SME event scope.',
                },
            }, { status: 403 })
        }

        if (error instanceof Error && ['EXAM_DOMAIN_REQUIRED', 'EXAM_DOMAIN_CONFLICT'].includes(error.message)) {
            return NextResponse.json({
                success: false,
                error: { code: error.message, message: 'A non-draft exam must retain one unambiguous Event Domain scope.' },
            }, { status: 409 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to detach exam from SME event',
            },
        }, { status: 500 })
    }
})
