import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { createBadgeMilestoneSchema } from '@/lib/validations'
import { z } from 'zod'

export const GET = withSmeOrAdminAuth(async (_req, user) => {
    try {
        const data = await TrainingOpsService.getScopedBadgeLadders(user)

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get SME domain badge overview error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load domain badge overview',
            },
        }, { status: error instanceof Error && error.message === 'TRAINING_OPS_FORBIDDEN' ? 403 : 500 })
    }
})

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user) => {
    try {
        const body = await req.json()
        const payload = createBadgeMilestoneSchema.parse(body)
        const badge = await TrainingOpsService.createScopedBadgeMilestone(user, payload)

        return NextResponse.json({
            success: true,
            data: badge,
        }, { status: 201 })
    } catch (error) {
        console.error('Create SME badge milestone error:', error)

        const status =
            error instanceof z.ZodError
                ? 400
                : error instanceof Error && error.message === 'BADGE_DOMAIN_FORBIDDEN'
                    ? 403
                    : 500

        const message =
            error instanceof z.ZodError
                ? error.issues[0]?.message || 'Invalid badge milestone payload'
                : error instanceof Error && error.message === 'BADGE_MILESTONE_SLUG_EXISTS'
                    ? 'A badge milestone with this slug already exists in the selected domain'
                    : error instanceof Error && error.message === 'BADGE_THRESHOLD_EXISTS'
                        ? 'A badge milestone already uses this threshold in the selected domain'
                    : error instanceof Error && error.message === 'PRODUCT_DOMAIN_NOT_FOUND'
                            ? 'Selected product domain no longer exists'
                            : error instanceof Error && error.message === 'BADGE_DOMAIN_FORBIDDEN'
                                ? 'You can only manage badges for domains in your SME scope'
                                : 'Failed to create SME badge milestone'

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message,
            },
        }, { status })
    }
})
