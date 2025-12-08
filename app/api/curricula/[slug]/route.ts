import { NextResponse } from 'next/server'
import { CourseService } from '@/lib/services/course.service'

export const GET = async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => {
    try {
        const { slug } = await params
        const course = await CourseService.getCourseById(slug)
        if (course.status !== 'PUBLISHED') {
            return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
        }
        return NextResponse.json({ success: true, data: course })
    } catch (error) {
        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
        }
        return NextResponse.json({ success: false, error: { code: 'SYSTEM_ERROR' } }, { status: 500 })
    }
}
