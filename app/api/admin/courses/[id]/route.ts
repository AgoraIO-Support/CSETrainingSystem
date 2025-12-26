import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'
import { updateCourseSchema } from '@/lib/validations'
import { z } from 'zod'
import { getBackendInternalBaseUrl, getBackendInternalBearerToken } from '@/lib/backend-internal'

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

        const backendBase = getBackendInternalBaseUrl()
        if (!backendBase) {
            return NextResponse.json(
                { success: false, error: { code: 'CONFIG_ERROR', message: 'BACKEND_INTERNAL_URL is not configured' } },
                { status: 500 }
                )
        }

        const res = await fetch(`${backendBase}/api/admin/courses/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                Authorization: getBackendInternalBearerToken(user),
            },
        })

        if (!res.ok) {
            // 后端 404 视为幂等成功
            if (res.status === 404) {
                return NextResponse.json({ success: true })
            }
            const body = await res.json().catch(() => null)
            return NextResponse.json(body ?? { success: false, error: { code: 'BACKEND_ERROR' } }, { status: res.status })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Course delete proxy error:', error)
        // 后端不可达不得返回假成功
        return NextResponse.json(
            { success: false, error: { code: 'BACKEND_UNREACHABLE', message: 'Backend unreachable while deleting course' } },
            { status: 502 }
        )
    }
})
