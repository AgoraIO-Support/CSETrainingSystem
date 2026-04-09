import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { reorderLessonsSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

// PATCH /admin/courses/:id/chapters/:chapterId/lessons/reorder
export const PATCH = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string }> }) => {
  try {
    const { id: courseId, chapterId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)
    const body = await req.json()
    const data = reorderLessonsSchema.parse(body)

    // Ensure ancestry is valid (chapter belongs to course)
    await CourseStructureService.assertChapterAncestry(courseId, chapterId)

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
    if (error instanceof Error && error.message === 'CHAPTER_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' } },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === 'ANCESTRY_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ANCESTRY_MISMATCH', message: 'Chapter does not belong to course' } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to reorder lessons' } },
      { status: 500 }
    )
  }
})
