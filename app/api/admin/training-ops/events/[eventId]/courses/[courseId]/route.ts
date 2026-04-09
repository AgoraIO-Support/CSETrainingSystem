import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{ eventId: string; courseId: string }>
}

export const DELETE = withAdminAuth(async (_req: NextRequest, _user, context: RouteContext) => {
    try {
        const { eventId, courseId } = await context.params
        const event = await TrainingOpsService.detachCourseFromEvent(eventId, courseId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Detach course from event error:', error)

        if (error instanceof Error) {
            const mapped: Record<string, { status: number; message: string }> = {
                LEARNING_EVENT_NOT_FOUND: { status: 404, message: 'Learning event not found' },
                COURSE_NOT_FOUND: { status: 404, message: 'Course not found' },
                COURSE_NOT_LINKED_TO_EVENT: { status: 400, message: 'Course is not linked to this learning event' },
            }

            const match = mapped[error.message]
            if (match) {
                return NextResponse.json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: match.message,
                    },
                }, { status: match.status })
            }
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to detach course from learning event',
            },
        }, { status: 500 })
    }
})
