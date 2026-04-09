import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = { params: Promise<{ eventId: string }> }

export const POST = withSmeOrAdminAuth(async (_req, user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const course = await TrainingOpsService.createScopedDraftCourseFromEvent(user, eventId)

        return NextResponse.json({
            success: true,
            data: course,
        }, { status: 201 })
    } catch (error) {
        console.error('Create SME draft course from event error:', error)

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'AUTH_003',
                    message: 'You can only create courses from events within your SME scope.',
                },
            }, { status: 403 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to create draft course from learning event',
            },
        }, { status: 500 })
    }
})
