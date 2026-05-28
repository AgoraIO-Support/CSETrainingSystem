import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

const fileSchema = z.object({
  path: z.string().min(1).max(500),
  contentType: z.string().min(1).max(160),
})

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  files: z.array(fileSchema).min(1).max(500),
})

export const POST = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)
    const body = await req.json()
    const data = uploadSchema.parse(body)

    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)
    const result = await CourseStructureService.prepareWebPackageUpload(lessonId, user.id, data)

    return NextResponse.json({
      success: true,
      data: {
        uploadSessionId: result.uploadSession.id,
        courseAssetId: result.uploadSession.courseAssetId,
        status: result.uploadSession.status,
        uploads: result.uploads,
        expiresAt: result.uploadSession.expiresAt,
      },
    })
  } catch (error) {
    console.error('Prepare web package upload error:', error)

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
        TRAINING_OPS_SCOPE_FORBIDDEN: { status: 403, message: 'You do not have access to this course' },
        WEB_PACKAGE_INVALID_PATH: { status: 400, message: 'Web package contains an invalid path' },
        WEB_PACKAGE_INDEX_REQUIRED: { status: 400, message: 'Web package must include index.html at the package root' },
        WEB_PACKAGE_DUPLICATE_PATH: { status: 400, message: 'Web package contains duplicate relative paths' },
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
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to prepare web package upload' } },
      { status: 500 }
    )
  }
})
