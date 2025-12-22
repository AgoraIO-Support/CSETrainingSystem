import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { replaceLessonAssetsSchema } from '@/lib/validations'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { LessonAssetType } from '@prisma/client'

// GET /admin/courses/:id/chapters/:chapterId/lessons/:lessonId/assets
export const GET = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)
    const assets = await CourseStructureService.getLessonAssets(lessonId)
    const data = assets.map((asset: any) => ({
      id: asset.id,
      title: asset.title,
      type: asset.type as LessonAssetType,
      url: asset.cloudfrontUrl ?? asset.url,
      cloudfrontUrl: asset.cloudfrontUrl ?? null,
      mimeType: asset.mimeType ?? asset.contentType ?? null,
    }))
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
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to load lesson assets' } },
      { status: 500 }
    )
  }
})

// POST /admin/courses/:id/chapters/:chapterId/lessons/:lessonId/assets (replace by IDs)
export const POST = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId } = await params
    const body = await req.json()
    const data = replaceLessonAssetsSchema.parse(body)

    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)
    await CourseStructureService.replaceLessonAssets(lessonId, data.courseAssetIds)

    const assets = await CourseStructureService.getLessonAssets(lessonId)
    const response = assets.map((asset: any) => ({
      id: asset.id,
      title: asset.title,
      type: asset.type as LessonAssetType,
      url: asset.cloudfrontUrl ?? asset.url,
      cloudfrontUrl: asset.cloudfrontUrl ?? null,
      mimeType: asset.mimeType ?? asset.contentType ?? null,
    }))
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
    return NextResponse.json(
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to replace lesson assets' } },
      { status: 500 }
    )
  }
})
