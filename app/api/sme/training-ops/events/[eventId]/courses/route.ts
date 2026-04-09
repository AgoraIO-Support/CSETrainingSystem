import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { z } from 'zod'

type RouteContext = { params: Promise<{ eventId: string }> }

const attachCourseSchema = z.object({
    courseId: z.string().uuid(),
})

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const body = await req.json()
        const { courseId } = attachCourseSchema.parse(body)

        const event = await TrainingOpsService.attachScopedCourseToEvent(user, eventId, courseId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Attach SME course to event error:', error)

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
                    message: 'You can only manage courses within your SME event scope.',
                },
            }, { status: 403 })
        }

        if (error instanceof Error) {
            const mappedErrors: Record<string, { status: number; message: string }> = {
                LEARNING_EVENT_NOT_FOUND: {
                    status: 404,
                    message: 'Learning event not found',
                },
                COURSE_NOT_FOUND: {
                    status: 404,
                    message: 'Course not found',
                },
                COURSE_ARCHIVED: {
                    status: 400,
                    message: 'Archived courses cannot be linked to learning events',
                },
                COURSE_ALREADY_LINKED_TO_OTHER_EVENT: {
                    status: 409,
                    message: 'Course is already linked to another learning event',
                },
            }

            const mapped = mappedErrors[error.message]
            if (mapped) {
                return NextResponse.json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: mapped.message,
                    },
                }, { status: mapped.status })
            }
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to attach course to SME event',
            },
        }, { status: 500 })
    }
})
