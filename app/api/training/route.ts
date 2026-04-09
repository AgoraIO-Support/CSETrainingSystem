import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { LearnerWorkspaceService } from '@/lib/services/learner-workspace.service'

export const GET = withAuth(async (_req: NextRequest, user) => {
    try {
        const data = await LearnerWorkspaceService.getTrainingOverview(user.id)

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get learner training error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'TRAINING_001',
                    message: 'Failed to load training overview',
                },
            },
            { status: 500 }
        )
    }
})
