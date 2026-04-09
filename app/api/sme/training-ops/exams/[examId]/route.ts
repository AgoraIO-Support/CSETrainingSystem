import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{
        examId: string
    }>
}

export const GET = withSmeOrAdminAuth(async (_req: NextRequest, user, context?: RouteContext) => {
    try {
        const { examId } = await (context?.params ?? Promise.resolve({ examId: '' }))
        const data = await TrainingOpsService.getScopedExamById(user, examId)

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get SME exam detail error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load SME exam detail',
            },
        }, {
            status:
                error instanceof Error && error.message === 'TRAINING_OPS_FORBIDDEN'
                    ? 403
                    : error instanceof Error && (
                        error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN' ||
                        error.message === 'EXAM_NOT_FOUND'
                    )
                        ? 404
                        : 500,
        })
    }
})
