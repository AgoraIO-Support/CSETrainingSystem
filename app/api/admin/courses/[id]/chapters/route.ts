import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { createChapterSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { z } from 'zod'

export const GET = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, id)
        const chapters = await CourseStructureService.listChapters(id)
        return NextResponse.json({ success: true, data: chapters })
    } catch (error) {
        console.error('List chapters error:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({ success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } }, { status: 403 })
        }
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to list chapters' } },
            { status: 500 }
        )
    }
})

export const POST = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, id)
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
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({ success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } }, { status: 403 })
        }
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to create chapter' } },
            { status: 500 }
        )
    }
})
