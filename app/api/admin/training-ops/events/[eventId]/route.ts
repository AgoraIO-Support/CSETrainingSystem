import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { updateLearningEventSchema } from '@/lib/validations'
import { z } from 'zod'

type RouteContext = {
    params: Promise<{ eventId: string }>
}

export const GET = withAdminAuth(async (_req: NextRequest, _user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const event = await TrainingOpsService.getLearningEventById(eventId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Get learning event error:', error)

        if (error instanceof Error && error.message === 'LEARNING_EVENT_NOT_FOUND') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'EVENT_NOT_FOUND',
                        message: 'Learning event not found',
                    },
                },
                { status: 404 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load learning event',
                },
            },
            { status: 500 }
        )
    }
})

export const PATCH = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const body = await req.json()
        const data = updateLearningEventSchema.parse(body)

        const event = await TrainingOpsService.updateLearningEvent(eventId, {
            ...data,
            seriesId: data.seriesId ?? undefined,
            domainId: data.domainId ?? undefined,
            description: data.description ?? undefined,
            scheduledAt: data.scheduledAt ?? undefined,
            hostId: data.hostId ?? undefined,
        })

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Update learning event error:', error)

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
            const errorMessages: Record<string, { status: number; message: string }> = {
                LEARNING_EVENT_NOT_FOUND: { status: 404, message: 'Learning event not found' },
                LEARNING_SERIES_NOT_FOUND: { status: 404, message: 'Learning Program not found' },
                PRODUCT_DOMAIN_NOT_FOUND: { status: 404, message: 'Product domain not found' },
                HOST_NOT_FOUND: { status: 404, message: 'Host user not found or inactive' },
                SERIES_DOMAIN_MISMATCH: { status: 400, message: 'Selected Program does not belong to the selected Product Domain' },
                COURSE_DOMAIN_REQUIRED: { status: 409, message: 'This change would leave a published Course without an Event Domain' },
                COURSE_DOMAIN_CONFLICT: { status: 409, message: 'This change would create a Course Domain conflict' },
                EXAM_DOMAIN_REQUIRED: { status: 409, message: 'This change would leave a non-draft Exam without an Event Domain' },
                EXAM_DOMAIN_CONFLICT: { status: 409, message: 'This change would conflict with an Exam Domain snapshot or Event scope' },
                INVALID_EVENT_TIME_RANGE: { status: 400, message: 'Event end time must be later than the scheduled or start time' },
                INVALID_EVENT_FORMAT_FOR_SERIES: { status: 400, message: 'Selected Event format is not allowed for the chosen Program type' },
            }

            const mapped = errorMessages[error.message]
            if (mapped) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: mapped.message,
                        },
                    },
                    { status: mapped.status }
                )
            }
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to update learning event',
                },
            },
            { status: 500 }
        )
    }
})

export const DELETE = withAdminAuth(async (_req: NextRequest, _user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        await TrainingOpsService.deleteUnassociatedLearningEvent(eventId)

        return NextResponse.json({
            success: true,
            data: { id: eventId },
        })
    } catch (error) {
        console.error('Delete learning event error:', error)

        if (error instanceof Error && error.message === 'LEARNING_EVENT_NOT_FOUND') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'EVENT_NOT_FOUND',
                    message: 'Learning event not found',
                },
            }, { status: 404 })
        }

        if (error instanceof Error && error.message === 'LEARNING_EVENT_HAS_ASSOCIATIONS') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'EVENT_HAS_ASSOCIATIONS',
                    message: 'Remove all linked Courses and Exams before deleting this Event.',
                },
            }, { status: 409 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to delete learning event',
            },
        }, { status: 500 })
    }
})
