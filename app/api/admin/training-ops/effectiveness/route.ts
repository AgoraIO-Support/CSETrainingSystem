import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

export const GET = withAdminAuth(async () => {
    try {
        const data = await TrainingOpsService.getDomainEffectiveness()

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('List training-op effectiveness error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load SME effectiveness data',
                },
            },
            { status: 500 }
        )
    }
})
