import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/auth-middleware'
import { importTrainingOpsBadgeMilestones } from '@/lib/training-ops-badge-import'

const importBadgeMilestonesSchema = z.object({
    payload: z.unknown(),
    apply: z.boolean().default(false),
})

export const POST = withAdminAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const { payload, apply } = importBadgeMilestonesSchema.parse(body)
        const summary = await importTrainingOpsBadgeMilestones(payload, { apply })

        return NextResponse.json({
            success: true,
            data: summary,
        })
    } catch (error) {
        console.error('Import badge milestones error:', error)

        const message =
            error instanceof Error && error.message.startsWith('Missing Learning Series')
                ? error.message
                : error instanceof Error && error.message.startsWith('Missing Product Domains')
                    ? error.message
                    : error instanceof Error
                        ? error.message
                        : 'Failed to import badge milestones'

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
