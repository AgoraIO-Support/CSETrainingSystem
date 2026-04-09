import { NextRequest, NextResponse } from 'next/server'
import { LearningSeriesType } from '@prisma/client'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { createLearningSeriesSchema } from '@/lib/validations'

const parseSeriesType = (value: string | null): LearningSeriesType | undefined => {
    if (
        value === 'WEEKLY_DRILL' ||
        value === 'CASE_STUDY' ||
        value === 'KNOWLEDGE_SHARING' ||
        value === 'FAQ_SHARE' ||
        value === 'RELEASE_READINESS' ||
        value === 'QUARTERLY_FINAL' ||
        value === 'YEAR_END_FINAL'
    ) {
        return value
    }
    return undefined
}

const parseBooleanParam = (value: string | null): boolean | undefined => {
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
}

export const GET = withAdminAuth(async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get('page') || '1')
        const limit = Number(searchParams.get('limit') || '20')
        const search = searchParams.get('search') || undefined
        const domainId = searchParams.get('domainId') || undefined
        const type = parseSeriesType(searchParams.get('type'))
        const active = parseBooleanParam(searchParams.get('active'))

        const data = await TrainingOpsService.getLearningSeries({
            page,
            limit,
            search,
            domainId,
            type,
            active,
        })

        return NextResponse.json({
            success: true,
            data: data.series,
            pagination: data.pagination,
        })
    } catch (error) {
        console.error('List learning series error:', error)
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

export const POST = withAdminAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const payload = createLearningSeriesSchema.parse(body)
        const series = await TrainingOpsService.createLearningSeriesRecord(payload)

        return NextResponse.json({
            success: true,
            data: series,
        })
    } catch (error) {
        console.error('Create training-op series error:', error)

        const message =
            error instanceof Error && error.message === 'LEARNING_SERIES_SLUG_EXISTS'
                ? 'A learning series with this slug already exists'
                : error instanceof Error && error.message === 'PRODUCT_DOMAIN_NOT_FOUND'
                    ? 'Selected product domain no longer exists'
                    : error instanceof Error && error.message === 'SERIES_OWNER_NOT_FOUND'
                        ? 'Series owner must be an active user'
                        : 'Failed to create learning series'

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
