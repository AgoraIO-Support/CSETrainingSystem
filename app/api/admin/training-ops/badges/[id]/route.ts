import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { updateBadgeMilestoneSchema } from '@/lib/validations'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAdminAuth(async (_req: NextRequest, _user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const badge = await TrainingOpsService.getBadgeMilestoneById(id)

        return NextResponse.json({
            success: true,
            data: badge,
        })
    } catch (error) {
        console.error('Get badge milestone error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load badge milestone',
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
        const payload = updateBadgeMilestoneSchema.parse(body)
        const badge = await TrainingOpsService.updateBadgeMilestone(id, payload)

        return NextResponse.json({
            success: true,
            data: badge,
        })
    } catch (error) {
        console.error('Update badge milestone error:', error)

        const status = error instanceof z.ZodError ? 400 : 500
        const message =
            error instanceof z.ZodError
                ? error.issues[0]?.message || 'Invalid badge milestone payload'
                : error instanceof Error && error.message === 'BADGE_MILESTONE_NOT_FOUND'
                    ? 'Badge milestone no longer exists'
                    : error instanceof Error && error.message === 'BADGE_MILESTONE_SLUG_EXISTS'
                        ? 'A badge milestone with this slug already exists in the selected domain'
                        : error instanceof Error && error.message === 'BADGE_THRESHOLD_EXISTS'
                            ? 'A badge milestone already uses this threshold in the selected domain'
                            : error instanceof Error && error.message === 'BADGE_THRESHOLD_LOCKED'
                                ? 'Threshold cannot be changed after this badge has been awarded'
                                : error instanceof Error && error.message === 'BADGE_DOMAIN_LOCKED'
                                    ? 'Domain cannot be changed after this badge has been awarded'
                        : error instanceof Error && error.message === 'BADGE_DOMAIN_REQUIRED'
                            ? 'Badge milestones must belong to a product domain'
                        : error instanceof Error && error.message === 'PRODUCT_DOMAIN_NOT_FOUND'
                            ? 'Selected product domain no longer exists'
                            : 'Failed to update badge milestone'

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message,
                },
            },
            { status }
        )
    }
})
