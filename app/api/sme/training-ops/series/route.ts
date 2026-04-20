import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { createLearningSeriesSchema } from '@/lib/validations'
import { z } from 'zod'

export const GET = withSmeOrAdminAuth(async (_req, user) => {
    try {
        const data = await TrainingOpsService.getScopedSeries(user)

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get SME series error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load SME learning series',
            },
        }, { status: error instanceof Error && error.message === 'TRAINING_OPS_FORBIDDEN' ? 403 : 500 })
    }
})

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user) => {
    try {
        const body = await req.json()
        const payload = createLearningSeriesSchema.parse(body)
        const series = await TrainingOpsService.createScopedLearningSeries(user, payload)

        return NextResponse.json({
            success: true,
            data: series,
        }, { status: 201 })
    } catch (error) {
        console.error('Create SME series error:', error)

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

        if (error instanceof Error && error.message === 'SME_SERIES_DOMAIN_REQUIRED') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'SME_001',
                    message: 'SME series must be created under a domain in your scope.',
                },
            }, { status: 400 })
        }

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'AUTH_003',
                    message: 'You can only create series for domains in your SME scope.',
                },
            }, { status: 403 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message:
                    error instanceof Error && error.message === 'LEARNING_SERIES_SLUG_EXISTS'
                        ? 'A learning series with this slug already exists'
                        : error instanceof Error && error.message === 'PRODUCT_DOMAIN_NOT_FOUND'
                            ? 'Selected product domain no longer exists'
                            : 'Failed to create SME learning series',
            },
        }, { status: 500 })
    }
})
