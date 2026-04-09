import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { importTrainingOpsBootstrap } from '@/lib/training-ops-bootstrap-import'

export const POST = withAdminAuth(async (request: NextRequest) => {
    try {
        const body = await request.json()
        const summary = await importTrainingOpsBootstrap(body.payload, {
            apply: Boolean(body.apply),
        })

        return NextResponse.json({
            success: true,
            data: summary,
        })
    } catch (error) {
        console.error('Import training ops bootstrap error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'TRAINING_OPS_BOOTSTRAP_IMPORT_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to import training ops bootstrap data',
                },
            },
            { status: 500 }
        )
    }
})
