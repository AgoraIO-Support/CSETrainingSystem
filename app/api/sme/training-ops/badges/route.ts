import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { z } from 'zod'

const applyTemplatesSchema = z.object({
    action: z.literal('APPLY_TEMPLATES'),
    learningSeriesId: z.string().uuid(),
    templateIds: z.array(z.string().uuid()).min(1),
})

const createCustomBadgeSchema = z.object({
    action: z.literal('CREATE_CUSTOM'),
    learningSeriesId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    slug: z
        .string()
        .trim()
        .min(1)
        .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    description: z.string().trim().optional().nullable(),
    icon: z.string().trim().max(32).optional().nullable(),
    thresholdStars: z.number().int().min(1).max(1000),
    active: z.boolean().optional(),
})

const smeBadgeActionSchema = z.discriminatedUnion('action', [applyTemplatesSchema, createCustomBadgeSchema])

export const GET = withSmeOrAdminAuth(async (_req, user) => {
    try {
        const data = await TrainingOpsService.getScopedBadgeLadders(user)

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get SME badge ladders error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load SME badge ladders',
            },
        }, { status: error instanceof Error && error.message === 'TRAINING_OPS_FORBIDDEN' ? 403 : 500 })
    }
})

export const POST = withSmeOrAdminAuth(async (req, user) => {
    try {
        const body = await req.json()
        const payload = smeBadgeActionSchema.parse(body)

        const data =
            payload.action === 'APPLY_TEMPLATES'
                ? await TrainingOpsService.applyScopedBadgeTemplatesToSeries(user, payload)
                : await TrainingOpsService.createScopedCustomBadgeMilestone(user, payload)

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Update SME badge ladders error:', error)

        let status = 500
        let message = 'Failed to update SME badge ladders'

        if (error instanceof z.ZodError) {
            status = 400
            message = error.issues[0]?.message || message
        } else if (error instanceof Error) {
            if (error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
                status = 403
                message = 'You can update badge ladders only for your own badge-enabled series.'
            } else if (error.message === 'BADGE_TEMPLATE_REQUIRED') {
                status = 400
                message = 'Select at least one badge template.'
            } else if (error.message === 'BADGE_TEMPLATE_NOT_FOUND') {
                status = 404
                message = 'One or more selected badge templates no longer exist.'
            } else if (error.message === 'BADGE_MILESTONE_SLUG_EXISTS') {
                status = 409
                message = 'A badge with the same slug already exists for this series.'
            }
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message,
            },
        }, { status })
    }
})
