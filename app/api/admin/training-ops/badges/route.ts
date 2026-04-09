import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { createBadgeMilestoneSchema } from '@/lib/validations'

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
        const learningSeriesId = searchParams.get('learningSeriesId') || undefined
        const active = parseBooleanParam(searchParams.get('active'))

        const data = await TrainingOpsService.getBadgeMilestones({
            page,
            limit,
            search,
            domainId,
            learningSeriesId,
            active,
        })

        return NextResponse.json({
            success: true,
            data: data.milestones,
            pagination: data.pagination,
        })
    } catch (error) {
        console.error('List badge milestones error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load badge milestones',
                },
            },
            { status: 500 }
        )
    }
})

export const POST = withAdminAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const payload = createBadgeMilestoneSchema.parse(body)
        const badge = await TrainingOpsService.createBadgeMilestone(payload)

        return NextResponse.json({
            success: true,
            data: badge,
        })
    } catch (error) {
        console.error('Create badge milestone error:', error)

        const message =
            error instanceof Error && error.message === 'BADGE_MILESTONE_SLUG_EXISTS'
                ? 'A badge milestone with this slug already exists'
                : error instanceof Error && error.message === 'PRODUCT_DOMAIN_NOT_FOUND'
                    ? 'Selected product domain no longer exists'
                    : error instanceof Error && error.message === 'LEARNING_SERIES_NOT_FOUND'
                        ? 'Selected learning series no longer exists'
                    : 'Failed to create badge milestone'

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
