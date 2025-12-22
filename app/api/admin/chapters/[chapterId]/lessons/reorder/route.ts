import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { reorderLessonsSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { z } from 'zod'

export const PATCH = withAdminAuth(async (req, user, { params }: { params: Promise<{ chapterId: string }> }) => {
    try {
        const { chapterId } = await params
        const body = await req.json()
        const data = reorderLessonsSchema.parse(body)

        await CourseStructureService.reorderLessons(chapterId, data.lessonOrder)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Reorder lessons error:', error)
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } },
                { status: 400 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to reorder lessons' } },
            { status: 500 }
        )
    }
})
