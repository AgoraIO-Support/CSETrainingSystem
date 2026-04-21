import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

const abortSchema = z.object({
  uploadSessionId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().nullable(),
})

export const POST = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)
    const body = await req.json()
    const data = abortSchema.parse(body)

    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)
    const result = await CourseStructureService.abortLessonAssetUpload(lessonId, data.uploadSessionId, data.reason)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Abort nested lesson asset upload error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: error.errors } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'LESSON_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'LESSON_NOT_FOUND', message: 'Lesson not found' } },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === 'ANCESTRY_MISMATCH') {
      return NextResponse.json(
        { success: false, error: { code: 'ANCESTRY_MISMATCH', message: 'Lesson does not belong to chapter/course' } },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'LESSON_ASSET_UPLOAD_SESSION_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'LESSON_ASSET_UPLOAD_SESSION_NOT_FOUND', message: 'Upload session not found' } },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === 'LESSON_ASSET_UPLOAD_ALREADY_CONFIRMED') {
      return NextResponse.json(
        { success: false, error: { code: 'LESSON_ASSET_UPLOAD_ALREADY_CONFIRMED', message: 'Upload session has already been confirmed' } },
        { status: 409 }
      )
    }
    if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to abort lesson asset upload' } },
      { status: 500 }
    )
  }
})
