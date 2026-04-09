import { NextResponse } from 'next/server'
import { CourseService } from '@/lib/services/course.service'
import { withAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

export const GET = withAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id: courseId } = await params

        const course = await CourseService.getCourseById(courseId, user.id)

        let canViewDraftCourse = user.role === 'ADMIN'

        if (!canViewDraftCourse && user.role === 'SME') {
            canViewDraftCourse = await TrainingOpsService.canAccessScopedCourse(user, courseId)
        }

        if (!canViewDraftCourse && course.status !== 'PUBLISHED') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_001',
                        message: 'Course not found',
                    },
                },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: course,
        })
    } catch (error) {
        console.error('Get course error:', error)

        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_001',
                        message: 'Course not found',
                    },
                },
                { status: 404 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to retrieve course',
                },
            },
            { status: 500 }
        )
    }
})
