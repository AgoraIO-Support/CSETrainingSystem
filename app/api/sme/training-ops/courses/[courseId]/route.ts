import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{
        courseId: string
    }>
}

export const GET = withSmeOrAdminAuth(async (_req: NextRequest, user, context?: RouteContext) => {
    try {
        const { courseId } = await (context?.params ?? Promise.resolve({ courseId: '' }))
        const data = await TrainingOpsService.getScopedCourseById(user, courseId)

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get SME course detail error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load SME course detail',
            },
        }, {
            status:
                error instanceof Error && error.message === 'TRAINING_OPS_FORBIDDEN'
                    ? 403
                    : error instanceof Error && (
                        error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN' ||
                        error.message === 'COURSE_NOT_FOUND'
                    )
                        ? 404
                        : 500,
        })
    }
})
