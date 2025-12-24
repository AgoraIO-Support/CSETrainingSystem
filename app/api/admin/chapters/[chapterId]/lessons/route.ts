import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { createLessonSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { z } from 'zod'

export const POST = withAdminAuth(async (req, user, { params }: { params: Promise<{ chapterId: string }> }) => {
    try {
        const { chapterId } = await params
        const body = await req.json()
        const data: z.infer<typeof createLessonSchema> = createLessonSchema.parse(body)

        const lesson = await CourseStructureService.createLesson(chapterId, data)

        return NextResponse.json({ success: true, data: lesson }, { status: 201 })
    } catch (error) {
        console.error('Create lesson error:', error)
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } },
                { status: 400 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to create lesson' } },
            { status: 500 }
        )
    }
})
