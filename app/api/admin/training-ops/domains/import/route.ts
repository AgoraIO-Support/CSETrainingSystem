import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/auth-middleware'
import { importTrainingOpsDomains } from '@/lib/training-ops-domain-import'

const importDomainsSchema = z.object({
    payload: z.unknown(),
    apply: z.boolean().default(false),
})

export const POST = withAdminAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const { payload, apply } = importDomainsSchema.parse(body)
        const summary = await importTrainingOpsDomains(payload, { apply })

        return NextResponse.json({
            success: true,
            data: summary,
        })
    } catch (error) {
        console.error('Import product domains error:', error)

        const message = error instanceof Error ? error.message : 'Failed to import product domains'

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
