import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { updateLearningSeriesSchema } from '@/lib/validations'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withSmeOrAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const series = await TrainingOpsService.getScopedLearningSeriesById(user, id)

        return NextResponse.json({
            success: true,
            data: series,
        })
    } catch (error) {
        console.error('Get SME learning series error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message:
                    error instanceof Error && error.message === 'LEARNING_SERIES_NOT_FOUND'
                        ? 'Learning Program no longer exists'
                        : error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN'
                            ? 'You do not have access to this Learning Program'
                            : 'Failed to load SME Learning Program',
            },
        }, { status: error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN' ? 403 : 500 })
    }
})

export const PATCH = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const body = await req.json()
        const payload = updateLearningSeriesSchema.parse(body)
        const series = await TrainingOpsService.updateScopedLearningSeries(user, id, payload)

        return NextResponse.json({
            success: true,
            data: series,
        })
    } catch (error) {
        console.error('Update SME learning series error:', error)

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

        const message =
            error instanceof Error && error.message === 'LEARNING_SERIES_NOT_FOUND'
                ? 'Learning Program no longer exists'
                : error instanceof Error && error.message === 'LEARNING_SERIES_SLUG_EXISTS'
                    ? 'A Learning Program with this slug already exists'
                    : error instanceof Error && error.message === 'PRODUCT_DOMAIN_NOT_FOUND'
                        ? 'Selected product domain no longer exists'
                        : error instanceof Error && error.message === 'SME_SERIES_DOMAIN_REQUIRED'
                            ? 'SME Program must remain under a Domain in your scope.'
                            : error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN'
                                ? 'You can only update Programs within your SME scope.'
                                : 'Failed to update SME Learning Program'

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message,
            },
        }, { status: error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN' ? 403 : 500 })
    }
})
