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
    const result = await CourseStructureService.confirmWebPackageUpload(lessonId, data.uploadSessionId)

    return NextResponse.json({
      success: true,
      data: {
        uploadSessionId: result.uploadSession.id,
        status: result.uploadSession.status,
        asset: result.asset,
      },
    })
  } catch (error) {
    console.error('Confirm web package upload error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: error.errors } },
        { status: 400 }
      )
    }

    if (error instanceof Error) {
      const known: Record<string, { status: number; message: string }> = {
        LESSON_NOT_FOUND: { status: 404, message: 'Lesson not found' },
        ANCESTRY_MISMATCH: { status: 400, message: 'Lesson does not belong to chapter/course' },
        LESSON_ASSET_UPLOAD_SESSION_NOT_FOUND: { status: 404, message: 'Upload session not found' },
        LESSON_ASSET_UPLOAD_OBJECT_NOT_FOUND: { status: 409, message: 'Uploaded index.html was not found in S3' },
        LESSON_ASSET_UPLOAD_ABORTED: { status: 409, message: 'Upload session has already been aborted' },
        TRAINING_OPS_SCOPE_FORBIDDEN: { status: 403, message: 'You do not have access to this course' },
      }
      const match = known[error.message]
      if (match) {
        return NextResponse.json(
          { success: false, error: { code: error.message, message: match.message } },
          { status: match.status }
        )
      }
    }

    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to confirm web package upload' } },
      { status: 500 }
    )
  }
})
