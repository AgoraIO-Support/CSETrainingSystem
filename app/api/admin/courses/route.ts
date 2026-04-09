import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { createCourseSchema } from '@/lib/validations'
import type { CourseLevel, CourseStatus } from '@/types'
import { z } from 'zod'

// GET /admin/courses — admin list (all statuses by default)
export const GET = withSmeOrAdminAuth(async (req, user) => {
    try {
        const { searchParams } = new URL(req.url)
        const page = Number(searchParams.get('page') || '1')
        const limit = Number(searchParams.get('limit') || '10')
        const category = searchParams.get('category') || undefined
        const level = (searchParams.get('level') as CourseLevel | null) || undefined
        const search = searchParams.get('search') || undefined
        const status = ((searchParams.get('status') as CourseStatus | 'ALL' | null) || 'ALL')

        if (user.role === 'SME') {
            const scopedCourses = await TrainingOpsService.getScopedCourses(user)
            const query = search?.trim().toLowerCase()

            const filtered = scopedCourses.filter((course) => {
                if (status !== 'ALL' && course.status !== status) return false
                if (category && course.category !== category) return false
                if (level && course.level !== level) return false
                if (!query) return true

                return (
                    course.title.toLowerCase().includes(query) ||
                    course.category.toLowerCase().includes(query) ||
                    course.instructor?.name?.toLowerCase().includes(query)
                )
            })

            const start = Math.max(0, (page - 1) * limit)
            const paged = filtered.slice(start, start + limit)

            return NextResponse.json({
                success: true,
                data: paged,
                pagination: {
                    page,
                    limit,
                    total: filtered.length,
                    totalPages: Math.ceil(filtered.length / limit),
                },
            })
        }

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

export const POST = withSmeOrAdminAuth(async (req, user) => {
    try {
        const body = await req.json()
        const data = createCourseSchema.parse(body)

        if (user.role === 'SME' && data.learningEventId) {
            await TrainingOpsService.getScopedLearningEventById(user, data.learningEventId)
        }

        const course = await CourseService.createCourse({
            ...data,
            instructorId: user.role === 'SME' ? user.id : data.instructorId,
        })

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

        if (error instanceof Error && error.message === 'LEARNING_EVENT_NOT_FOUND') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Learning event not found',
                    },
                },
                { status: 404 }
            )
        }

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AUTH_003',
                        message: 'You can only create courses for learning events within your SME scope',
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
                    message: 'Failed to create course',
                },
            },
            { status: 500 }
        )
    }
})
