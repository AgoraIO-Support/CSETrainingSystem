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

        if (error instanceof Error) {
            if (error.message === 'EXAM_NOT_FOUND') {
                return NextResponse.json({
                    success: false,
                    error: {
                        code: 'EXAM_NOT_FOUND',
                        message: 'Exam not found',
                    },
                }, { status: 404 })
            }

            if (error.message === 'EXAM_ARCHIVED') {
                return NextResponse.json({
                    success: false,
                    error: {
                        code: 'EXAM_ARCHIVED',
                        message: 'Archived exams cannot be linked to an event',
                    },
                }, { status: 400 })
            }

            if (error.message === 'EXAM_ALREADY_LINKED_TO_OTHER_EVENT') {
                return NextResponse.json({
                    success: false,
                    error: {
                        code: 'EXAM_ALREADY_LINKED_TO_OTHER_EVENT',
                        message: 'Exam is already linked to another event',
                    },
                }, { status: 409 })
            }

            if (['EXAM_DOMAIN_MISMATCH', 'EXAM_SERIES_MISMATCH', 'EXAM_DOMAIN_REQUIRED', 'EXAM_DOMAIN_CONFLICT'].includes(error.message)) {
                return NextResponse.json({
                    success: false,
                    error: {
                        code: error.message,
                        message: error.message === 'EXAM_SERIES_MISMATCH'
                            ? 'Exam Learning Program does not match the selected Event scope'
                            : 'Exam must use one unambiguous Event Domain scope',
                    },
                }, { status: 400 })
            }
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
