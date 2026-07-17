import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

export const GET = withSmeOrAdminAuth(async (req: NextRequest, user) => {
    try {
        const { searchParams } = new URL(req.url)
        const kind = searchParams.get('kind')

        const input = kind === 'topic'
            ? {
                kind: 'topic' as const,
                topic: searchParams.get('topic')?.trim() ?? '',
                domainId: searchParams.get('domainId') ?? '',
            }
            : {
                kind: 'learner' as const,
                userId: searchParams.get('userId') ?? '',
            }

        if ((input.kind === 'topic' && (!input.topic || !input.domainId)) || (input.kind === 'learner' && !input.userId)) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing drill-down parameters' } },
                { status: 400 }
            )
        }

        const data = await TrainingOpsService.getScopedLearnerGapDrilldown(user, input)
        return NextResponse.json({ success: true, data })
    } catch (error) {
        const message = error instanceof Error ? error.message : ''
        const status = message === 'TRAINING_OPS_SCOPE_FORBIDDEN' ? 403 : message === 'PRODUCT_DOMAIN_NOT_FOUND' || message === 'USER_NOT_FOUND' ? 404 : 500
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'SYSTEM_001',
                    message: status === 403 ? 'You do not have access to this drill-down' : status === 404 ? 'Drill-down record not found' : 'Failed to load drill-down details',
                },
            },
            { status }
        )
    }
})
