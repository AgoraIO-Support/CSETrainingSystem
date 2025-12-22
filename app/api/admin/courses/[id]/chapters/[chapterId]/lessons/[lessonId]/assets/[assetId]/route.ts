import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseStructureService } from '@/lib/services/course-structure.service'

// DELETE /admin/courses/:id/chapters/:chapterId/lessons/:lessonId/assets/:assetId
export const DELETE = withAdminAuth(async (req, user, { params }: { params: Promise<{ id: string; chapterId: string; lessonId: string; assetId: string }> }) => {
  try {
    const { id: courseId, chapterId, lessonId, assetId } = await params

    await CourseStructureService.assertLessonAncestry(courseId, chapterId, lessonId)
    await CourseStructureService.removeLessonAsset(lessonId, assetId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Detach lesson asset error:', error)
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
      { success: false, error: { code: 'SYSTEM_001', message: 'Failed to detach lesson asset' } },
      { status: 500 }
    )
  }
})
