import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

export const POST = withSmeOrAdminAuth(async (_req, user, context) => {
    try {
        const eventId = context?.params?.eventId as string
        const exam = await TrainingOpsService.createScopedDraftExamFromEvent(user, eventId)

        return NextResponse.json({
            success: true,
            data: exam,
        }, { status: 201 })
    } catch (error) {
        console.error('Create SME draft exam error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to create draft exam from learning event',
            },
        }, {
            status:
                error instanceof Error && (
                    error.message === 'TRAINING_OPS_FORBIDDEN' ||
                    error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN'
                )
                    ? 403
                    : 500,
        })
    }
})
