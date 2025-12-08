import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'
import { updateCourseSchema } from '@/lib/validations'
import { z } from 'zod'

export const GET = withAdminAuth(async (_req, _user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const course = await CourseService.getCourseById(id)
        return NextResponse.json({ success: true, version: course })
    } catch (error) {
        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
        }
        return NextResponse.json({ success: false, error: { code: 'SYSTEM_ERROR' } }, { status: 500 })
    }
})

export const PATCH = withAdminAuth(async (req, _user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const body = await req.json()
        const data = updateCourseSchema.parse(body)
        const updated = await CourseService.updateCourse(id, data)
        return NextResponse.json({ success: true, version: updated })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', details: error.errors } },
                { status: 400 }
            )
        }
        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
        }
        if (error instanceof Error && error.message === 'SLUG_EXISTS') {
            return NextResponse.json({ success: false, error: { code: 'SLUG_EXISTS' } }, { status: 409 })
        }
        return NextResponse.json({ success: false, error: { code: 'SYSTEM_ERROR' } }, { status: 500 })
    }
})

export const DELETE = withAdminAuth(async (_req, _user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        await CourseService.updateCourse(id, { status: 'ARCHIVED' })
        return NextResponse.json({ success: true })
    } catch (error) {
        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
        }
        return NextResponse.json({ success: false, error: { code: 'SYSTEM_ERROR' } }, { status: 500 })
    }
})
