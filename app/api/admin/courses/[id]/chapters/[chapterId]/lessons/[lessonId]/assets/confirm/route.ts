import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

const confirmSchema = z.object({
  uploadSessionId: z.string().uuid(),
})

export const POST = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)
    const body = await req.json()
    const data = confirmSchema.parse(body)

    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)
    const result = await CourseStructureService.confirmLessonAssetUpload(lessonId, data.uploadSessionId)

    return NextResponse.json({
      success: true,
      data: {
        uploadSessionId: result.uploadSession.id,
        status: result.uploadSession.status,
        asset: result.asset,
      },
    })
  } catch (error) {
    console.error('Confirm nested lesson asset upload error:', error)

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
    if (error instanceof Error && error.message === 'LESSON_ASSET_UPLOAD_OBJECT_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: { code: 'LESSON_ASSET_UPLOAD_OBJECT_NOT_FOUND', message: 'Uploaded object was not found in S3' } },
        { status: 409 }
      )
    }
    if (error instanceof Error && error.message === 'LESSON_ASSET_UPLOAD_ABORTED') {
      return NextResponse.json(
        { success: false, error: { code: 'LESSON_ASSET_UPLOAD_ABORTED', message: 'Upload session has already been aborted' } },
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
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to confirm lesson asset upload' } },
      { status: 500 }
    )
  }
})
