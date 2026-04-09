import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { updateLearningSeriesSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAdminAuth(async (_req: NextRequest, _user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const series = await TrainingOpsService.getLearningSeriesById(id)

        return NextResponse.json({
            success: true,
            data: series,
        })
    } catch (error) {
        console.error('Get training-op series error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load learning series',
                },
            },
            { status: 500 }
        )
    }
})

export const PATCH = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const body = await req.json()
        const payload = updateLearningSeriesSchema.parse(body)
        const series = await TrainingOpsService.updateLearningSeriesRecord(id, payload)

        return NextResponse.json({
            success: true,
            data: series,
        })
    } catch (error) {
        console.error('Update training-op series error:', error)

        const message =
            error instanceof Error && error.message === 'LEARNING_SERIES_NOT_FOUND'
                ? 'Learning series no longer exists'
                : error instanceof Error && error.message === 'LEARNING_SERIES_SLUG_EXISTS'
                    ? 'A learning series with this slug already exists'
                    : error instanceof Error && error.message === 'PRODUCT_DOMAIN_NOT_FOUND'
                        ? 'Selected product domain no longer exists'
                        : error instanceof Error && error.message === 'SERIES_OWNER_NOT_FOUND'
                            ? 'Series owner must be an active user'
                            : 'Failed to update learning series'

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message,
                },
            },
            { status: 500 }
        )
    }
})
