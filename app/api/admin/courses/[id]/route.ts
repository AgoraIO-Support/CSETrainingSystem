import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'
import { updateCourseSchema } from '@/lib/validations'
import { z } from 'zod'

export const PUT = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const body = await req.json()
        const data = updateCourseSchema.parse(body)

        const course = await CourseService.updateCourse(id, data)

        return NextResponse.json({
            success: true,
            data: course,
        })
    } catch (error) {
        console.error('Update course error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid input data',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        if (error instanceof Error && error.message === 'SLUG_EXISTS') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_004',
                        message: 'Slug already in use',
                    },
                },
                { status: 409 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to update course',
                },
            },
            { status: 500 }
        )
    }
})

export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params

        await CourseService.deleteCourse(id)

        return NextResponse.json({
            success: true,
            message: 'Course deleted successfully',
        })
    } catch (error) {
        console.error('Delete course error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to delete course',
                },
            },
            { status: 500 }
        )
    }
})
