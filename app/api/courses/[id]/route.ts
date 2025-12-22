import { NextResponse } from 'next/server'
import { CourseService } from '@/lib/services/course.service'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id: courseId } = await params

        const course = await CourseService.getCourseById(courseId, user.id)

        // 仅管理员可查看非发布课程，普通用户只能查看已发布
        if (user.role !== 'ADMIN' && course.status !== 'PUBLISHED') {
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
