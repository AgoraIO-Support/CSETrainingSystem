import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'

// Publish a curriculum version (maps to course status)
export const POST = withAdminAuth(async (_req, _user, { params }: { params: Promise<{ versionId: string }> }) => {
    try {
        const { versionId } = await params
        const course = await CourseService.updateCourse(versionId, { status: 'PUBLISHED' })
        return NextResponse.json({ success: true, version: course })
    } catch (error) {
        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
        }
        return NextResponse.json({ success: false, error: { code: 'SYSTEM_ERROR' } }, { status: 500 })
    }
})
