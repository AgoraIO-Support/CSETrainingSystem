import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{ programId: string }>
}

const associationSchema = z.object({
    resourceType: z.enum(['event', 'course', 'exam']),
    resourceId: z.string().uuid(),
    eventId: z.string().uuid().optional(),
})

const errorMap: Record<string, { status: number; message: string }> = {
    LEARNING_SERIES_NOT_FOUND: { status: 404, message: 'Learning program not found' },
    LEARNING_EVENT_NOT_FOUND: { status: 404, message: 'Event not found' },
    COURSE_NOT_FOUND: { status: 404, message: 'Course not found' },
    EXAM_NOT_FOUND: { status: 404, message: 'Exam not found' },
    TRAINING_OPS_SCOPE_FORBIDDEN: { status: 403, message: 'You do not have access to this resource' },
    EVENT_ALREADY_LINKED_TO_OTHER_PROGRAM: { status: 409, message: 'This event already belongs to another learning program' },
    COURSE_ALREADY_LINKED_TO_OTHER_EVENT: { status: 409, message: 'This course already belongs to another event' },
    EXAM_ALREADY_LINKED_TO_OTHER_PROGRAM: { status: 409, message: 'This exam already belongs to another learning program' },
    PROGRAM_EVENT_REQUIRED: { status: 400, message: 'Select a program event for this course' },
    PROGRAM_EVENT_MISMATCH: { status: 400, message: 'The selected event does not belong to this learning program' },
    EXAM_EVENT_PROGRAM_MISMATCH: { status: 409, message: 'This exam is attached to an event outside this learning program' },
    EXAM_DOMAIN_MISMATCH: { status: 409, message: 'The exam domain conflicts with this learning program' },
    COURSE_ARCHIVED: { status: 400, message: 'Archived courses cannot be associated' },
    EXAM_ARCHIVED: { status: 400, message: 'Archived exams cannot be associated' },
    INVALID_EVENT_FORMAT_FOR_SERIES: { status: 400, message: 'This event format is not compatible with the program type' },
}

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { programId } = await context.params
        const input = associationSchema.parse(await req.json())
        const data = await TrainingOpsService.associateScopedResourceToProgram(user, programId, input)

        return NextResponse.json({ success: true, data })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid association data', details: error.errors } },
                { status: 400 }
            )
        }

        const mapped = error instanceof Error ? errorMap[error.message] : undefined
        console.error('Associate resource to learning program error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: mapped ? 'ASSOCIATION_ERROR' : 'SYSTEM_001',
                    message: mapped?.message ?? 'Failed to associate the resource',
                },
            },
            { status: mapped?.status ?? 500 }
        )
    }
})
