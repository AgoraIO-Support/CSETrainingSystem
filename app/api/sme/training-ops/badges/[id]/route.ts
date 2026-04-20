import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { updateBadgeMilestoneSchema } from '@/lib/validations'
import { z } from 'zod'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withSmeOrAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const badge = await TrainingOpsService.getScopedBadgeMilestoneById(user, id)

        return NextResponse.json({
            success: true,
            data: badge,
        })
    } catch (error) {
        console.error('Get SME badge milestone error:', error)

        const status = error instanceof Error && error.message === 'BADGE_DOMAIN_FORBIDDEN' ? 403 : 500
        const message =
            error instanceof Error && error.message === 'BADGE_MILESTONE_NOT_FOUND'
                ? 'Badge milestone no longer exists'
                : error instanceof Error && error.message === 'BADGE_DOMAIN_FORBIDDEN'
                    ? 'You can only manage badges for domains in your SME scope'
                    : 'Failed to load SME badge milestone'

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message,
            },
        }, { status })
    }
})

export const PATCH = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const body = await req.json()
        const payload = updateBadgeMilestoneSchema.parse(body)
        const badge = await TrainingOpsService.updateScopedBadgeMilestone(user, id, payload)

        return NextResponse.json({
            success: true,
            data: badge,
        })
    } catch (error) {
        console.error('Update SME badge milestone error:', error)

        const status =
            error instanceof z.ZodError
                ? 400
                : error instanceof Error && error.message === 'BADGE_DOMAIN_FORBIDDEN'
                    ? 403
                    : 500

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
                                            : error instanceof Error && error.message === 'BADGE_DOMAIN_FORBIDDEN'
                                                ? 'You can only manage badges for domains in your SME scope'
                                                : 'Failed to update SME badge milestone'

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message,
            },
        }, { status })
    }
})
