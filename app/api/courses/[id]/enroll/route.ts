import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'

export const POST = withAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id: courseId } = await params

        const enrollment = await CourseService.enrollUser(user.id, courseId)

        return NextResponse.json(
            {
                success: true,
                data: enrollment,
                message: 'Enrolled successfully',
            },
            { status: 201 }
        )
    } catch (error) {
        console.error('Enroll course error:', error)

        if (error instanceof Error) {
            if (error.message === 'COURSE_NOT_FOUND') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'COURSE_001',
                            message: 'Course not found or not available',
                        },
                    },
                    { status: 404 }
                )
            }

            if (error.message === 'ALREADY_ENROLLED') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'COURSE_004',
                            message: 'Already enrolled in this course',
                        },
                    },
                    { status: 409 }
                )
            }
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to enroll in course',
                },
            },
            { status: 500 }
        )
    }
})
