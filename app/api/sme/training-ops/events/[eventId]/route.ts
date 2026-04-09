import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { updateLearningEventSchema } from '@/lib/validations'
import { z } from 'zod'

type RouteContext = { params: Promise<{ eventId: string }> }

export const GET = withSmeOrAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const event = await TrainingOpsService.getScopedLearningEventById(user, eventId)

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Get SME event error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load SME learning event',
            },
        }, { status: error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN' ? 403 : error instanceof Error && error.message === 'LEARNING_EVENT_NOT_FOUND' ? 404 : 500 })
    }
})

export const PATCH = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        const body = await req.json()
        const data = updateLearningEventSchema.parse(body)

        const event = await TrainingOpsService.updateScopedLearningEventForUser(user, eventId, {
            ...data,
            seriesId: data.seriesId ?? undefined,
            domainId: data.domainId ?? undefined,
            description: data.description ?? undefined,
            releaseVersion: data.releaseVersion ?? undefined,
            scheduledAt: data.scheduledAt ?? undefined,
            startsAt: data.startsAt ?? undefined,
            endsAt: data.endsAt ?? undefined,
            starValue: data.starValue ?? undefined,
            hostId: data.hostId ?? undefined,
        })

        return NextResponse.json({
            success: true,
            data: event,
        })
    } catch (error) {
        console.error('Update SME event error:', error)

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
                    message: 'You can only update events inside your SME scope.',
                },
            }, { status: 403 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to update SME learning event',
            },
        }, { status: 500 })
    }
})

export const DELETE = withSmeOrAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { eventId } = await context.params
        await TrainingOpsService.deleteScopedLearningEventForUser(user, eventId)

        return NextResponse.json({
            success: true,
            data: { id: eventId },
        })
    } catch (error) {
        console.error('Delete SME event error:', error)

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'AUTH_003',
                    message: 'You can only delete events inside your SME scope.',
                },
            }, { status: 403 })
        }

        if (error instanceof Error && error.message === 'LEARNING_EVENT_NOT_FOUND') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'TRAINING_EVENT_404',
                    message: 'Learning event not found.',
                },
            }, { status: 404 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to delete SME learning event',
            },
        }, { status: 500 })
    }
})
