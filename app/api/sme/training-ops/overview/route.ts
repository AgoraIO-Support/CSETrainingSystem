import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

export const GET = withSmeOrAdminAuth(async (_req, user) => {
    try {
        const [summary, learnerGaps] = await Promise.all([
            TrainingOpsService.getScopedSummary(user),
            TrainingOpsService.getScopedLearnerGaps(user),
        ])

        return NextResponse.json({
            success: true,
            data: {
                domains: summary.domains,
                series: summary.series,
                events: summary.events,
                effectiveness: summary.effectiveness,
                weakTopics: learnerGaps.weakTopics,
                learnerGaps: learnerGaps.learnerGaps,
            },
        })
    } catch (error) {
        console.error('Get SME overview error:', error)

        if (error instanceof Error && error.message === 'TRAINING_OPS_FORBIDDEN') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'AUTH_003',
                    message: 'Insufficient permissions',
                },
            }, { status: 403 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load SME training operations overview',
            },
        }, { status: 500 })
    }
})
