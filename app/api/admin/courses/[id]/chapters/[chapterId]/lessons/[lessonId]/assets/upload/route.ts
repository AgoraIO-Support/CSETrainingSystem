import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { LessonAssetType } from '@prisma/client'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

const uploadSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  type: z.nativeEnum(LessonAssetType).default(LessonAssetType.DOCUMENT),
})

// POST /admin/courses/:id/chapters/:chapterId/lessons/:lessonId/assets/upload
export const POST = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)
    const body = await req.json()
    const data = uploadSchema.parse(body)

    // Ensure ancestry is valid
    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)

    const { upload, asset } = await CourseStructureService.createUploadAndAttachLessonAsset(lessonId, {
      filename: data.filename,
      contentType: data.contentType,
      type: data.type,
    })

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: upload.uploadUrl,
        key: upload.key,
        url: upload.url,
        mimeType: upload.mimeType,
        expiresIn: upload.expiresIn,
        asset,
      },
    })
  } catch (error) {
    console.error('Nested lesson asset upload error:', error)
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
    if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to prepare upload' } },
      { status: 500 }
    )
  }
})
