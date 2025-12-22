import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { reorderChaptersSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { z } from 'zod'

export const PATCH = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const body = await req.json()
        const data = reorderChaptersSchema.parse(body)

        await CourseStructureService.reorderChapters(id, data.chapterOrder)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Reorder chapters error:', error)
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } },
                { status: 400 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to reorder chapters' } },
            { status: 500 }
        )
    }
})
