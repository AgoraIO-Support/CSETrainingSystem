import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/auth-middleware'
import { importTrainingOpsLearningSeries } from '@/lib/training-ops-series-import'

const importLearningSeriesSchema = z.object({
    payload: z.unknown(),
    apply: z.boolean().default(false),
})

export const POST = withAdminAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const { payload, apply } = importLearningSeriesSchema.parse(body)
        const summary = await importTrainingOpsLearningSeries(payload, { apply })

        return NextResponse.json({
            success: true,
            data: summary,
        })
    } catch (error) {
        console.error('Import learning series error:', error)

        const message = error instanceof Error ? error.message : 'Failed to import learning series'

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
