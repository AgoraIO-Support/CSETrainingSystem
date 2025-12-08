import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'

export const POST = withAdminAuth(async (_req, _user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const course = await CourseService.updateCourse(id, { status: 'PUBLISHED' })
        return NextResponse.json({ success: true, version: course })
    } catch (error) {
        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
        }
        return NextResponse.json({ success: false, error: { code: 'SYSTEM_ERROR' } }, { status: 500 })
    }
})
