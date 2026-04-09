import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

export const GET = withSmeOrAdminAuth(async (_req: NextRequest, user) => {
    try {
        const data = await TrainingOpsService.getScopedExams(user)

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get SME exams error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load SME exams',
            },
        }, { status: error instanceof Error && error.message === 'TRAINING_OPS_FORBIDDEN' ? 403 : 500 })
    }
})
