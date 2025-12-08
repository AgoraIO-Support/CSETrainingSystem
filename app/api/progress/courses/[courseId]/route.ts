import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { ProgressService } from '@/lib/services/progress.service'

export const GET = withAuth(async (req, user, { params }: { params: Promise<{ courseId: string }> }) => {
    try {
        const { courseId } = await params

        const progress = await ProgressService.getCourseProgress(user.id, courseId)

        return NextResponse.json({
            success: true,
            data: progress,
        })
    } catch (error) {
        console.error('Get course progress error:', error)

        if (error instanceof Error && error.message === 'NOT_ENROLLED') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_003',
                        message: 'Not enrolled in this course',
                    },
                },
                { status: 403 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to retrieve progress',
                },
            },
            { status: 500 }
        )
    }
})
