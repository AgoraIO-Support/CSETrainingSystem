import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'
import { createCourseSchema } from '@/lib/validations'
import { z } from 'zod'

// GET /admin/courses — admin list (all statuses by default)
export const GET = withAdminAuth(async (req) => {
    try {
        const { searchParams } = new URL(req.url)
        const page = Number(searchParams.get('page') || '1')
        const limit = Number(searchParams.get('limit') || '10')
        const category = searchParams.get('category') || undefined
        const level = (searchParams.get('level') as any) || undefined
        const search = searchParams.get('search') || undefined
        const status = (searchParams.get('status') as any) || 'ALL'

        const { courses, pagination } = await CourseService.getCourses({
            page,
            limit,
            category,
            level,
            search,
            status, // 'ALL' includes DRAFT/PUBLISHED/ARCHIVED for admin
        })

        return NextResponse.json({ success: true, data: courses, pagination })
    } catch (error) {
        console.error('List courses error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to list courses' } },
            { status: 500 }
        )
    }
})

export const POST = withAdminAuth(async (req) => {
    try {
        const body = await req.json()
        const data = createCourseSchema.parse(body)

        const course = await CourseService.createCourse(data)

        return NextResponse.json(
            {
                success: true,
                data: course,
            },
            { status: 201 }
        )
    } catch (error) {
        console.error('Create course error:', error)

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
                    message: 'Failed to create course',
                },
            },
            { status: 500 }
        )
    }
})
