import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{ eventId: string }>
}

const attachCourseSchema = z.object({
    courseId: z.string().uuid('Course ID must be a valid UUID'),
})

export const POST = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const body = await req.json()
        const data = attachCourseSchema.parse(body)

        const event = await TrainingOpsService.attachCourseToEvent(eventId, data.courseId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Attach course to event error:', error)

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

        if (error instanceof Error) {
            const mapped: Record<string, { status: number; message: string }> = {
                LEARNING_EVENT_NOT_FOUND: { status: 404, message: 'Learning event not found' },
                COURSE_NOT_FOUND: { status: 404, message: 'Course not found' },
                COURSE_ARCHIVED: { status: 400, message: 'Archived courses cannot be linked to learning events' },
                COURSE_ALREADY_LINKED_TO_OTHER_EVENT: { status: 409, message: 'Course is already linked to another learning event' },
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
                message: 'Failed to attach course to learning event',
            },
        }, { status: 500 })
    }
})
