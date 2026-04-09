import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { replaceLessonAssetsSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { LessonAssetType } from '@prisma/client'
import { FileService } from '@/lib/services/file.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

// GET /admin/courses/:id/chapters/:chapterId/lessons/:lessonId/assets
export const GET = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)
    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)
    const assets = await CourseStructureService.getLessonAssets(lessonId)
    const data = await Promise.all(assets.map(async (asset: any) => ({
      id: asset.id,
      title: asset.title,
      type: asset.type as LessonAssetType,
      url: await FileService.getAssetAccessUrl(asset.s3Key),
      cloudfrontUrl: null,
      mimeType: asset.mimeType ?? asset.contentType ?? null,
    })))
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Get nested lesson assets error:', error)
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
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to load lesson assets' } },
      { status: 500 }
    )
  }
})

// POST /admin/courses/:id/chapters/:chapterId/lessons/:lessonId/assets (replace by IDs)
export const POST = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    if (user.role === 'SME') await TrainingOpsService.assertScopedCourseAccess(user, courseId)
    const body = await req.json()
    const data = replaceLessonAssetsSchema.parse(body)

    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)
    await CourseStructureService.replaceLessonAssets(lessonId, data.courseAssetIds)

    const assets = await CourseStructureService.getLessonAssets(lessonId)
    const response = await Promise.all(assets.map(async (asset: any) => ({
      id: asset.id,
      title: asset.title,
      type: asset.type as LessonAssetType,
      url: await FileService.getAssetAccessUrl(asset.s3Key),
      cloudfrontUrl: null,
      mimeType: asset.mimeType ?? asset.contentType ?? null,
    })))
    return NextResponse.json({ success: true, data: response })
  } catch (error) {
    console.error('Replace nested lesson assets error:', error)
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
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to replace lesson assets' } },
      { status: 500 }
    )
  }
})
