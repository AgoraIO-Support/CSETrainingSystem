import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = { params: Promise<{ eventId: string; courseId: string }> }

export const DELETE = withSmeOrAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { eventId, courseId } = await context.params
        const event = await TrainingOpsService.detachScopedCourseFromEvent(user, eventId, courseId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Detach SME course from event error:', error)

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'AUTH_003',
                    message: 'You can only manage courses within your SME event scope.',
                },
            }, { status: 403 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to detach course from SME event',
            },
        }, { status: 500 })
    }
})
