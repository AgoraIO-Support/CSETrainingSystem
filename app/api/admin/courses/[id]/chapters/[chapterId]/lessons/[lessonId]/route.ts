import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { updateLessonSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { CascadeDeleteService } from '@/lib/services/cascade-delete.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

// PATCH /admin/courses/:id/chapters/:chapterId/lessons/:lessonId
export const PATCH = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)
    const body = await req.json()
    const data = updateLessonSchema.parse(body)

    // Ensure lesson belongs to chapter and course
    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)

    const updated = await CourseStructureService.updateLesson(lessonId, data)
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Update lesson error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'LESSON_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'LESSON_NOT_FOUND', message: 'Lesson not found' } },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === 'ASSET_COURSE_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ASSET_COURSE_MISMATCH', message: 'Asset does not belong to course' } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'ANCESTRY_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ANCESTRY_MISMATCH', message: 'Lesson does not belong to chapter/course' } },
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
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to update lesson' } },
      { status: 500 }
    )
  }
})

// DELETE /admin/courses/:id/chapters/:chapterId/lessons/:lessonId
export const DELETE = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)

    // Validate hierarchy: lesson belongs to chapter and course
    const isValid = await CascadeDeleteService.validateLessonHierarchy(courseId, chapterId, lessonId)
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: { code: 'HIERARCHY_MISMATCH', message: 'Lesson does not belong to chapter/course' } },
        { status: 409 }
      )
    }

    await CascadeDeleteService.deleteLessonCascade(lessonId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete lesson error:', error)

    if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } },
        { status: 403 }
      )
    }

    // S3 cleanup failure returns 502 to indicate partial failure
    if (error instanceof Error && error.message.startsWith('S3_CLEANUP_FAILED')) {
      return NextResponse.json(
        { success: false, error: { code: 'S3_CLEANUP_FAILED', message: error.message } },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to delete lesson' } },
      { status: 500 }
    )
  }
})
