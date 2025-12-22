import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { createChapterSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { z } from 'zod'

export const GET = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const chapters = await CourseStructureService.listChapters(id)
        return NextResponse.json({ success: true, data: chapters })
    } catch (error) {
        console.error('List chapters error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to list chapters' } },
            { status: 500 }
        )
    }
})

export const POST = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const body = await req.json()
        const data = createChapterSchema.parse(body)

        const chapter = await CourseStructureService.createChapter(id, data)

        return NextResponse.json({ success: true, data: chapter }, { status: 201 })
    } catch (error) {
        console.error('Create chapter error:', error)
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } },
                { status: 400 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to create chapter' } },
            { status: 500 }
        )
    }
})
